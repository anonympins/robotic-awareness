#!/usr/bin/env node

import * as neuro from './neuro-lib.js';
import { Optimization } from './problemSolver/library.js';
import { scrapeRandomWikipediaContent } from './wikipedia-scraper.js';
import fs from 'node:fs';
import path from 'node:path';

const MODEL_DIR = './formal_model/';
const BRAIN_FILE = path.join(MODEL_DIR, 'formal_brain.gnr');
const RULES_FILE = path.join(MODEL_DIR, 'formal_rules.json');
const CORPUS_PATH = './training_corpus.txt';

const tokenizer = /[a-z0-9àâäéèêëïîôöùûüç]+|[^\w\s]/gi;
const WINDOW_SIZE = 4;
const TOKEN_BITS = 12;
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
            // scraper temporairement indisponible
        }
    }
    if (sentences.length === 0) {
        sentences.push(...FALLBACK_SENTENCES);
    }
    return sentences;
}

function generateSample(brain, miner, neuron, threshold, prompt) {
    const tokens = prompt.match(tokenizer) || ['les'];
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

    console.log("\x1b[35m=== ENTRAÎNEUR CONTINU : FORMALISME POLYNOMIAL ===\x1b[0m");
    if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });

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
        console.log(`\n\x1b[7m CYCLE #${cycleCount} \x1b[0m  (Vocabulaire: ${brain.vocabulary.size})`);
        let batch = [];

        try {
            if (useLocal) {
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
                batch.forEach(s => brain.learnSense(s, true, 2));
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

            // Sauvegarde continue
            fs.writeFileSync(BRAIN_FILE, brain.exportBinary());
            if (formalGrammar) {
                fs.writeFileSync(RULES_FILE, JSON.stringify({
                    threshold: formalGrammar.threshold,
                    accuracy: formalGrammar.accuracy,
                    terms: formalGrammar.terms,
                    decodedRules: formalGrammar.decodedRules,
                    updatedAt: new Date().toISOString()
                }, null, 2));

                // Échantillon de test de parole en direct
                const seedPrompt = (batch[0] || FALLBACK_SENTENCES[0]).match(tokenizer).slice(0, 2).join(' ');
                const sample = generateSample(brain, miner, formalGrammar.neuron, formalGrammar.threshold, seedPrompt);
                console.log(`🗣️ Échantillon généré : "${sample}"`);
            }

        } catch (err) {
            console.error(`❌ Erreur cycle #${cycleCount}:`, err.message);
        }

        cycleCount++;
        await new Promise(r => setTimeout(r, 2000));
    }
}

main().catch(err => console.error("💥 Crash:", err));