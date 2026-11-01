#!/usr/bin/env node

// ============================================================
// ENTRAÎNEUR CONTINU 1-BIT (BitGEMM Language Model + STE)
// Reproduit l'apprentissage autorégressif d'un LLM (prochain token)
// en combinant descente de gradient sur poids latents continus
// et inférence bitwise sans flottant (XNOR + Popcount 32-bit).
// ============================================================

import * as neuro from './neuro-lib.js';
import { Optimization } from './problemSolver/library.js';
import { scrapeRandomWikipediaContent } from './wikipedia-scraper.js';
import fs from 'node:fs';
import path from 'node:path';

const MODEL_DIR = './formal_model/';
const BRAIN_FILE = path.join(MODEL_DIR, 'formal_brain.gnr');
const RULES_FILE = path.join(MODEL_DIR, 'formal_rules.json');
const BITGEMM_FILE = path.join(MODEL_DIR, 'bitgemm_model.json');
const TOKENIZER_FILE = path.join(MODEL_DIR, 'adaptive_tokenizer.json');
const CORPUS_PATH = './training_corpus.txt';

const tokenizer = /[a-z0-9àâäéèêëïîôöùûüç_]+|[^\w\s]/gi;
const WINDOW_SIZE = 4;
const TOKEN_BITS = 12;
const CONTEXT_DIM = 64;
let adaptiveTokenizer = null;
let localCorpusCursor = 0;

const FALLBACK_SENTENCES = [
    "les astronomes observent les galaxies lointaines avec des télescopes géants.",
    "la théorie scientifique explique les phénomènes physiques de manière rationnelle.",
    "ces animaux sauvages traversent les forêts denses pendant la nuit.",
    "les chercheurs découvrent de nouvelles lois mathématiques fondamentales.",
    "un grand nombre de citoyens participent activement aux débats démocratiques.",
    "cette nouvelle technologie transforme profondément les communications modernes.",
    "les ingénieurs développent des systèmes autonomes pour explorer les planètes voisines.",
    "la structure moléculaire détermine les propriétés chimiques de chaque élément."
];

function extractCleanSentences(blocks, minWords = 5) {
    const sentences = [];
    for (const block of blocks) {
        const rawSentences = block.split(/(?<=[.!?])\s+/);
        for (const raw of rawSentences) {
            const cleaned = raw
                .replace(/\[\d+\]/g, '')
                .replace(/\(.*?\)/g, '')
                .replace(/["«»]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const words = cleaned.match(tokenizer) || [];
            if (words.length >= minWords && words.length <= 30 && /[a-zàâäéèêëïîôöùûüç]/i.test(cleaned)) {
                sentences.push(cleaned.toLowerCase());
            }
        }
    }
    return sentences;
}

async function getBatchFromLocalCorpus(chunkSize = 1024 * 64) {
    if (!fs.existsSync(CORPUS_PATH)) return { sentences: [], done: true };
    const stats = await fs.promises.stat(CORPUS_PATH);
    if (localCorpusCursor >= stats.size) {
        localCorpusCursor = 0;
        return { sentences: [], done: true };
    }

    const startPos = localCorpusCursor;
    const actualChunk = Math.min(chunkSize, stats.size - startPos);
    const buffer = Buffer.alloc(actualChunk);
    const fh = await fs.promises.open(CORPUS_PATH, 'r');
    const { bytesRead } = await fh.read(buffer, 0, actualChunk, startPos);
    await fh.close();
    localCorpusCursor += bytesRead;

    const text = buffer.toString('utf8');
    const lines = text.split(/(?<=[.!?])\s+/).map(s => s.trim().toLowerCase());
    const sentences = lines.filter(s => {
        const w = s.match(tokenizer) || [];
        return w.length >= 5 && w.length <= 30;
    });
    return { sentences, done: localCorpusCursor >= stats.size };
}

async function getBatchFromWikipedia(targetCount = 12) {
    const sentences = [];
    let attempts = 0;
    while (sentences.length < targetCount && attempts < 2) {
        attempts++;
        try {
            const page = await scrapeRandomWikipediaContent();
            const extracted = extractCleanSentences(page.blocks);
            sentences.push(...extracted);
        } catch (err) {
            // Scraper temporairement indisponible
        }
    }
    if (sentences.length === 0) {
        sentences.push(...FALLBACK_SENTENCES);
    }
    return sentences;
}

function generateSample(brain, miner, neuron, threshold, prompt, adaptiveTokenizer = null) {
    const tokens = adaptiveTokenizer ? adaptiveTokenizer.tokenize(prompt) : (prompt.match(tokenizer) || ['les']);
    if (tokens.length === 0) tokens.push('les');
    const generated = [...tokens];

    for (let step = 0; step < 10; step++) {
        const context = generated.join(' ');
        const candidates = brain.predictNextCandidates(context, { topK: 12, creativity: 0.15 });
        if (!candidates || candidates.length === 0) break;

        let bestCandidate = null;
        let bestScore = -Infinity;

        for (const cand of candidates) {
            if (cand.token === '<eos>' && generated.length < tokens.length + 2) continue;

            const testWindow = [...generated.slice(-(WINDOW_SIZE - 1)), cand.token];
            while (testWindow.length < WINDOW_SIZE) testWindow.unshift(testWindow[0] || 'les');

            const testVec = miner.encodeSequence(testWindow);
            const polyScore = neuron.evaluateScore(testVec);
            const isHarmonic = polyScore >= threshold;
            const score = cand.score + (isHarmonic ? (polyScore - threshold + 1) * 3.0 : -10.0);

            if (score > bestScore) {
                bestScore = score;
                bestCandidate = cand.token;
            }
        }

        if (!bestCandidate || bestCandidate === '<eos>') break;
        generated.push(bestCandidate);
        if (['.', '!', '?'].includes(bestCandidate)) break;
    }

    return brain._intelligentlyJoinTokens(generated);
}

async function main() {
    const args = process.argv.slice(2);
    let useLocal = args.includes('--local');
    const isTestMode = args.includes('--test') || args.includes('--once');
    const isOffline = args.includes('--offline');
    const cyclesArg = args.find(a => a.startsWith('--cycles='));
    const lrArg = args.find(a => a.startsWith('--lr='));

    const maxCycles = cyclesArg ? parseInt(cyclesArg.split('=')[1], 10) : (isTestMode ? 3 : Infinity);
    const learningRate = lrArg ? parseFloat(lrArg.split('=')[1]) : 0.03;

    console.log("\x1b[35m=== ENTRAÎNEUR CONTINU : BITGEMM 1-BIT & NEURO-SYMBOLIQUE ===\x1b[0m");
    if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });

    // 0. Tokenizer adaptatif à fusion progressive
    adaptiveTokenizer = new neuro.AdaptiveMergeTokenizer({ mergeThreshold: 5, maxVocabSize: 4096 });
    if (fs.existsSync(TOKENIZER_FILE)) {
        try {
            adaptiveTokenizer.importState(JSON.parse(fs.readFileSync(TOKENIZER_FILE, 'utf8')));
            console.log(`[INIT] Tokenizer adaptatif chargé (${adaptiveTokenizer.merges.size} fusions).`);
        } catch (e) {
            console.warn("[INIT] Erreur lecture tokenizer:", e.message);
        }
    }

    // 1. Initialisation du modèle de langage 1-bit
    const initialVocab = ["les", "la", "le", "des", "un", "une", "dans", "avec", "pour", "<eos>"];
    const bitLM = new neuro.BitGenerativeLM(initialVocab, CONTEXT_DIM, 4);
    if (fs.existsSync(BITGEMM_FILE)) {
        try {
            bitLM.importState(JSON.parse(fs.readFileSync(BITGEMM_FILE, 'utf8')));
            console.log(`[INIT] Modèle BitGEMM chargé (${bitLM.vocabSize} tokens).`);
        } catch (e) {
            console.warn("[INIT] Erreur lecture BitGEMM:", e.message);
        }
    }

    // 2. Mémoire relationnelle symbolique
    const brain = new neuro.SemanticRelationalMemory(8);
    if (fs.existsSync(BRAIN_FILE)) {
        try {
            brain.importBinary(fs.readFileSync(BRAIN_FILE));
            console.log(`[INIT] Modèle existant chargé (${brain.vocabulary.size} mots).`);
        } catch (e) {
            console.warn("[INIT] Erreur lecture brain:", e.message);
        }
    }

    const miner = new neuro.PolynomialFormalismMiner(brain, WINDOW_SIZE, TOKEN_BITS);
    let formalGrammar = null;
    if (fs.existsSync(RULES_FILE)) {
        try {
            const raw = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
            formalGrammar = {
                neuron: new neuro.PolynomialPlusPlusNeuron(raw.terms, raw.threshold),
                threshold: raw.threshold,
                terms: raw.terms,
                accuracy: raw.accuracy || 1.0,
                decodedRules: raw.decodedRules || { rules: [] }
            };
            console.log(`[INIT] Règles polynomiales chargées (Seuil: ${raw.threshold}).`);
        } catch (e) {
            console.warn("[INIT] Erreur lecture règles:", e.message);
        }
    }

    let cycleCount = 1;
    const memoryBufferSentences = [];

    while (true) {
        console.log(`\n\x1b[7m CYCLE #${cycleCount} \x1b[0m (BitGEMM Vocab: ${bitLM.vocabSize} | Merges: ${adaptiveTokenizer.merges.size} | Symbol Vocab: ${brain.vocabulary.size})`);
        let batch = [];

        try {
            if (isOffline) {
                batch = [...FALLBACK_SENTENCES];
            } else if (useLocal) {
                const res = await getBatchFromLocalCorpus(1024 * 64);
                batch = res.sentences;
                if (res.done) {
                    console.log("🔄 Fin du corpus local. Bascule en mode web.");
                    useLocal = false;
                }
            } else {
                batch = await getBatchFromWikipedia(10);
            }

            if (batch.length > 0) {
                console.log(`📥 Ingestion de ${batch.length} phrases...`);
                let newMergesCount = 0;
                let totalLoss = 0;
                let totalAcc = 0;
                let totalSteps = 0;

                for (const sentence of batch) {
                    // Ingestion adaptative : les bigrammes récurrents fusionnent en super-tokens
                    const tokens = adaptiveTokenizer.ingestAndTokenize(sentence, (newToken) => {
                        newMergesCount++;
                        bitLM.addWord(newToken);
                    });

                    // Entraînement symbolique avec les super-tokens
                    brain.learnSense(tokens.join(' '), true, 2);
                }

                // Consolidation multi-passes (3 époques locales) pour stabiliser le gradient STE 1-bit
                const localEpochs = 3;
                for (let ep = 0; ep < localEpochs; ep++) {
                    for (const sentence of batch) {
                        const tokens = adaptiveTokenizer.tokenize(sentence);
                        const r = bitLM.trainTokens(tokens, learningRate);
                        if (ep === localEpochs - 1) {
                            totalLoss += r.avgLoss;
                            totalAcc += r.accuracy;
                            totalSteps += r.steps;
                        }
                    }
                }

                const avgLoss = (totalLoss / batch.length).toFixed(3);
                const avgAcc = ((totalAcc / batch.length) * 100).toFixed(1);
                const perplexity = Math.exp(parseFloat(avgLoss)).toFixed(2);
                console.log(`⚡ [BitGEMM 1-Bit STE] Loss: ${avgLoss} | Top-1: ${avgAcc}% | PPL: ${perplexity} | Pas: ${totalSteps} | Nouvelles fusions: ${newMergesCount}`);

                memoryBufferSentences.push(...batch);
                if (memoryBufferSentences.length > 60) {
                    memoryBufferSentences.splice(0, memoryBufferSentences.length - 60);
                }
            }

            // Rafraîchissement des lois polynomiales tous les 3 cycles
            if (cycleCount % 3 === 0 && memoryBufferSentences.length >= 8) {
                console.log("🧬 Découverte / Affinage des invariants algébriques...");
                formalGrammar = miner.discoverFormalGrammar(memoryBufferSentences, Optimization, {
                    generations: 45,
                    populationSize: 40,
                    maxTerms: 8
                });
                console.log(`🎯 Précision formelle : ${(formalGrammar.accuracy * 100).toFixed(1)}% | Seuil : ${formalGrammar.threshold}`);
                const topRule = formalGrammar.decodedRules?.rules?.[0];
                if (topRule) {
                    console.log(`   👉 Règle maîtresse : ${topRule.description}`);
                }
            }

            // Sauvegarde continue des poids 1-bit et des graphes symboliques
            fs.writeFileSync(BITGEMM_FILE, JSON.stringify(bitLM.exportState(), null, 2));
            fs.writeFileSync(TOKENIZER_FILE, JSON.stringify(adaptiveTokenizer.exportState(), null, 2));
            fs.writeFileSync(BRAIN_FILE, brain.exportBinary());
            if (formalGrammar) {
                fs.writeFileSync(RULES_FILE, JSON.stringify({
                    threshold: formalGrammar.threshold,
                    accuracy: formalGrammar.accuracy,
                    terms: formalGrammar.terms,
                    decodedRules: formalGrammar.decodedRules,
                    updatedAt: new Date().toISOString()
                }, null, 2));
            }

            // Génération autorégressive en direct (Inférence BitGEMM 100% binaire)
            const matchedTokens = adaptiveTokenizer.tokenize(batch[0] || FALLBACK_SENTENCES[0]);
            const seedPrompt = matchedTokens.slice(0, 2).join(' ');
            const bitGenerated = bitLM.generateSentence(seedPrompt, 10, 0.0, adaptiveTokenizer);
            console.log(`🤖 Génération 1-Bit (BitGEMM) : "${bitGenerated}"`);
            console.log(`   (Décodé sans '_')         : "${adaptiveTokenizer.detokenize(bitGenerated.split(' '))}"`);

            if (formalGrammar) {
                const sample = generateSample(brain, miner, formalGrammar.neuron, formalGrammar.threshold, seedPrompt, adaptiveTokenizer);
                console.log(`🗣️ Génération Symbolique   : "${sample}"`);
            }

        } catch (err) {
            console.error(`❌ Erreur cycle #${cycleCount}:`, err.message);
            if (isTestMode) throw err;
        }

        if (cycleCount >= maxCycles) {
            console.log(`\n\x1b[32m=== BILAN : ENTRAÎNEMENT CONTINU VALIDÉ (${cycleCount} cycles) ===\x1b[0m`);
            console.log(`• Poids BitGEMM 1-bit : ${fs.statSync(BITGEMM_FILE).size} octets (${BITGEMM_FILE})`);
            console.log(`• Vocabulaire BitGEMM : ${bitLM.vocabSize} tokens`);
            console.log(`• Fusions Tokenizer  : ${adaptiveTokenizer.merges.size} super-tokens appris`);
            console.log(`• Mode d'inférence    : XNOR + Popcount 32-bit (sans FPU)`);
            break;
        }

        cycleCount++;
        if (!isTestMode) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

main().catch(err => {
    console.error("💥 Crash:", err);
    process.exit(1);
});