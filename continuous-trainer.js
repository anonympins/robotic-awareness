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
import { getBatchFromBooks } from './train-books.js';
import { getBatchFromRobert } from './train-le-robert.js';
import fs from 'node:fs';
import path from 'node:path';

const MODEL_DIR = './formal_model/';
const BRAIN_FILE = path.join(MODEL_DIR, 'formal_brain.gnr');
const RULES_FILE = path.join(MODEL_DIR, 'formal_rules.json');
const BITGEMM_FILE = path.join(MODEL_DIR, 'bitgemm_model.json');
const TOKENIZER_FILE = path.join(MODEL_DIR, 'adaptive_tokenizer.json');
const CORPUS_PATH = './training_corpus.txt';

const tokenizer = /[a-z0-9àâäéèêëïîôöùûüç_]+|[^\w\s]/gi;
const TOKEN_BITS = 12;
let adaptiveTokenizer = null;
let localCorpusCursor = 0;

function writeFileSyncAtomic(filePath, data) {
    const dir = path.dirname(filePath);
    const tempPath = path.join(dir, `.${path.basename(filePath)}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`);
    fs.writeFileSync(tempPath, data);
    const bakPath = `${filePath}.bak`;
    if (fs.existsSync(filePath)) {
        try {
            fs.copyFileSync(filePath, bakPath);
        } catch (_) {}
    }
    fs.renameSync(tempPath, filePath);
}

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

function sanitizeSentence(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw
        .replace(/\[.*?\]/g, '') // Élimine toutes les transcriptions phonétiques [a'-shun]
        .replace(/\(.*?\)/g, '')
        .replace(/["«»“”]/g, '')
        .replace(/[-–—]?\s*modifier(?:\s+le\s+code)?/gi, '')
        .replace(/\b(?:voir aussi|liens externes|articles connexes|notes et références)\b/gi, '')
        // Normalisation des tirets cadratins (—, –) et doubles tirets (--) en séparateur valide (, )
        .replace(/[\u2014\u2013—–]|--+/g, ', ')
        .replace(/\s+-\s+/g, ', ')
        .replace(/,\s*,+/g, ', ')
        .replace(/,\s*\./g, '.')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '')
        .trim();
}

function extractCleanSentences(blocks, minWords = 5) {
    const sentences = [];
    for (const block of blocks) {
        const rawSentences = block.split(/(?<=[.!?])\s+/);
        for (const raw of rawSentences) {
            const cleaned = sanitizeSentence(raw);

            const words = cleaned.match(tokenizer) || [];
            if (words.length >= minWords && words.length <= 30 && /[a-zàâäéèêëïîôöùûüç]/i.test(cleaned)) {
                sentences.push(cleaned.toLowerCase());
            }
        }
    }
    return sentences;
}

function isValidTrainingSentence(sentence, minWords = 5) {
    if (!sentence || typeof sentence !== 'string') return false;
    // Élimine les notes de bas de page [X], références de versets isolées et fragments
    if (/^\[\d+\]\s*[a-zàâäéèêëïîôöùûüç0-9_.]*$/i.test(sentence)) return false;
    if (/\b(?:psa|cap|ver|deu|gen|exo|lev|num|matt|luc|act)\.\b/i.test(sentence) && sentence.length < 25) return false;
    // Élimine les artefacts de dictionnaires (ex: -, a]'shun, n. ou notations phonétiques)
    if (/[\[\]{}|\\]/.test(sentence)) return false;
    if (/[-–—]{2,}|^\s*[-–—]/.test(sentence)) return false;
    // Élimine les notes de transcription et errata de Project Gutenberg
    if (/\b(?:transcriber'?s?\s+notes?|project\s+gutenberg|table\s+of\s+contents|illustrations?\b)/i.test(sentence)) return false;
    if (/\bon\s+page\s+\d+.*(?:replaced|corrected|amended|omitted)\b/i.test(sentence)) return false;
    if (/\b(?:was|were)\s+replaced\s+with\b/i.test(sentence)) return false;
    if (/^chapter\s+[0-9ivxlcdm]+/i.test(sentence.trim())) return false;
    if (/\b(?:shun|ation|ition|sion)\]|\b[a-z]+\]'[a-z]+/i.test(sentence)) return false;
    if (/,\s*[nva]\.\s*$/i.test(sentence) || /\b(?:adj|adv|pron|prep|conj|interj|obs|pl)\./i.test(sentence)) return false;
    const words = sentence.match(tokenizer) || [];
    return words.length >= minWords && words.length <= 30 && /[a-zàâäéèêëïîôöùûüç]/i.test(sentence);
}

async function getBatchFromLocalCorpus(targetCount = 50, chunkSize = 1024 * 64) {
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
    const lines = text.split(/(?<=[.!?])\s+/).map(s => sanitizeSentence(s).toLowerCase());
    const sentences = lines.filter(s => {
        const w = s.match(tokenizer) || [];
        return w.length >= 5 && w.length <= 30;
    });
    return { sentences: sentences.slice(0, targetCount), done: localCorpusCursor >= stats.size };
}

async function getBatchFromWikipedia(targetCount = 50) {
    const sentences = [];
    let attempts = 0;
    const maxAttempts = Math.max(5, Math.ceil(targetCount / 8));
    while (sentences.length < targetCount && attempts < maxAttempts) {
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

async function getMultiSourceBatch(cycleIndex, targetCount = 50, forceSource = 'books') {
    const primarySource = forceSource || 'books';

    let sentences = [];
    if (primarySource === 'books') {
        console.log("📚 [Source : Gutenberg Books] Récupération d'œuvres littéraires...");
        sentences = await getBatchFromBooks(targetCount);
    } else if (primarySource === 'robert') {
        console.log("📖 [Source : Le Robert] Récupération de données linguistiques...");
        sentences = await getBatchFromRobert(targetCount);
    } else {
        console.log("🌐 [Source : Wikipédia] Récupération encyclopédique...");
        sentences = await getBatchFromWikipedia(targetCount);
    }

    if (sentences.length === 0) {
        console.log("⚠️ Repli sur les phrases de secours locales.");
        sentences.push(...FALLBACK_SENTENCES);
    }
    return sentences;
}

// File d'attente pour le préchargement asynchrone en arrière-plan
const batchPrefetchQueue = [];
let isPrefetching = false;

async function replenishPrefetchBuffer(cycleIndex, forceSource, targetCount = 50, minBuffered = 2) {
    if (isPrefetching || batchPrefetchQueue.length >= minBuffered) return;
    isPrefetching = true;
    try {
        while (batchPrefetchQueue.length < minBuffered) {
            const batch = await getMultiSourceBatch(cycleIndex + batchPrefetchQueue.length, targetCount, forceSource);
            batchPrefetchQueue.push(batch);
        }
    } catch (e) {
        // En cas d'erreur réseau, la boucle d'entraînement gérera le repli
    } finally {
        isPrefetching = false;
    }
}

function generateSample(brain, miner, neuron, threshold, prompt, adaptiveTokenizer = null) {
    const tokens = adaptiveTokenizer ? adaptiveTokenizer.tokenize(prompt) : (prompt.match(tokenizer) || ['les']);
    if (tokens.length === 0) tokens.push('les');
    const windowSize = miner?.windowSize || 4;
    const generated = [...tokens];

    for (let step = 0; step < 10; step++) {
        const context = generated.join(' ');
        const candidates = brain.predictNextCandidates(context, { topK: 12, creativity: 0.15 });
        if (!candidates || candidates.length === 0) break;

        let bestCandidate = null;
        let bestScore = -Infinity;

        for (const cand of candidates) {
            if (cand.token === '<eos>' && generated.length < tokens.length + 2) continue;
            if (cand.token === '<pad>' || cand.token === '<unk>' || /^[—–-]+$/.test(cand.token)) continue;
            if (/[\[\]{}|\\]/.test(cand.token) || /'shun\b|a\]'shun/i.test(cand.token)) continue;

            // Pénalité de répétition pour éviter les boucles attractrices
            const recentTokens = generated.slice(-6);
            const repeatCount = recentTokens.filter(t => t === cand.token).length;
            let repetitionPenalty = repeatCount > 0 ? repeatCount * 8.0 : 0.0;
            if (generated[generated.length - 1] === cand.token) repetitionPenalty += 15.0;

            const testWindow = [...generated.slice(-(windowSize - 1)), cand.token];
            while (testWindow.length < windowSize) testWindow.unshift(testWindow[0] || 'les');

            const testVec = miner.encodeSequence(testWindow);
            const polyScore = neuron.evaluateScore(testVec);
            const isHarmonic = polyScore >= threshold;
            const score = cand.score - repetitionPenalty + (isHarmonic ? (polyScore - threshold + 1) * 3.0 : -10.0);

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
    const shouldPurge = args.includes('--purge-first') || args.includes('--purge');
    const useGPU = args.includes('--gpu') || args.includes('--webgpu');
    const cyclesArg = args.find(a => a.startsWith('--cycles='));
    const lrArg = args.find(a => a.startsWith('--lr='));
    const delayArg = args.find(a => a.startsWith('--delay='));
    const sourceArg = args.find(a => a.startsWith('--source='));
    const epochsArg = args.find(a => a.startsWith('--epochs='));
    const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
    const contextDimArg = args.find(a => a.startsWith('--context-dim='));
    const grammarIntervalArg = args.find(a => a.startsWith('--grammar-interval='));
    const mergeThresholdArg = args.find(a => a.startsWith('--merge-threshold='));
    const maxVocabArg = args.find(a => a.startsWith('--max-vocab='));
    const windowSizeArg = args.find(a => a.startsWith('--window-size='));
    const tempArg = args.find(a => a.startsWith('--temp='));
    const profileArg = args.find(a => a.startsWith('--profile='));
    const teacherArg = args.find(a => a.startsWith('--teacher=') || a === '--teacher' || a.startsWith('--trainer=') || a === '--trainer');
    const teacherUrl = teacherArg && teacherArg.includes('=') ? teacherArg.split('=')[1] : (teacherArg ? 'http://localhost:11435' : null);
    const forceSource = sourceArg ? sourceArg.split('=')[1].toLowerCase() : 'books';

    // Profils Pareto pré-calibrés
    let defaultLR = 0.05;
    let defaultEpochs = 1;
    let defaultBatchSize = 50;
    let defaultContextDim = 256;
    let defaultMergeThreshold = 5;
    let defaultGrammarInterval = 15;
    let defaultMaxTrainPerBatch = 8;
    let defaultMaxTokensPerSeq = 14;
    let defaultNumBlocks = 1;

    if (profileArg) {
        const prof = profileArg.split('=')[1].toLowerCase();
        if (prof === 'fast') {
            defaultLR = 0.055; defaultEpochs = 1; defaultBatchSize = 35; defaultGrammarInterval = 16;
        } else if (prof === 'quality') {
            defaultLR = 0.022; defaultEpochs = 4; defaultBatchSize = 50; defaultGrammarInterval = 6; defaultContextDim = 96;
        } else if (prof === 'balanced') {
            defaultLR = 0.035; defaultEpochs = 2; defaultBatchSize = 50; defaultGrammarInterval = 10;
        }
        console.log(`[PARETO] Profil sélectionné: "${prof}" (LR: ${defaultLR}, Epochs: ${defaultEpochs}, Batch: ${defaultBatchSize}, Gram. Interval: ${defaultGrammarInterval})`);
    }

    const maxCycles = cyclesArg ? parseInt(cyclesArg.split('=')[1], 10) : (isTestMode ? 3 : Infinity);
    const learningRate = lrArg ? parseFloat(lrArg.split('=')[1]) : defaultLR;
    const localEpochs = epochsArg ? parseInt(epochsArg.split('=')[1], 10) : defaultEpochs;
    const batchTargetCount = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : defaultBatchSize;
    const contextDim = contextDimArg ? parseInt(contextDimArg.split('=')[1], 10) : defaultContextDim;
    const grammarInterval = grammarIntervalArg ? parseInt(grammarIntervalArg.split('=')[1], 10) : defaultGrammarInterval;
    const mergeThreshold = mergeThresholdArg ? parseInt(mergeThresholdArg.split('=')[1], 10) : defaultMergeThreshold;
    const maxVocabSize = maxVocabArg ? parseInt(maxVocabArg.split('=')[1], 10) : 4096;
    const windowSize = windowSizeArg ? parseInt(windowSizeArg.split('=')[1], 10) : 4;
    const trainLimitArg = args.find(a => a.startsWith('--train-limit='));
    const maxTrainPerBatch = trainLimitArg ? parseInt(trainLimitArg.split('=')[1], 10) : defaultMaxTrainPerBatch;
    const maxTokensPerSeq = defaultMaxTokensPerSeq;
    const genTemperature = tempArg ? parseFloat(tempArg.split('=')[1]) : 0.0;
    const cycleDelay = delayArg ? parseInt(delayArg.split('=')[1], 10) : 0;

    console.log("\x1b[35m=== ENTRAÎNEUR CONTINU : BITGEMM 1-BIT & NEURO-SYMBOLIQUE ===\x1b[0m");
    console.log(`[CONFIG] LR: ${learningRate} | Epochs: ${localEpochs} | Batch: ${batchTargetCount} | Dim: ${contextDim} | Fenêtre: ${windowSize}`);
    if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });

    if (shouldPurge) {
        console.log("🧹 [--purge-first] Purge des anciens modèles et réinitialisation complète...");
        for (const f of [BRAIN_FILE, RULES_FILE, BITGEMM_FILE, TOKENIZER_FILE, `${BITGEMM_FILE}.bak`, `${TOKENIZER_FILE}.bak`]) {
            if (fs.existsSync(f)) {
                try { fs.unlinkSync(f); } catch (_) {}
            }
        }
    }

    let gpuActive = false;
    if (useGPU) {
        try {
            const dev = await neuro.WebGPUBitGEMMEngine.getDevice();
            if (dev) {
                gpuActive = true;
                console.log("⚡ [WebGPU] Compute Shader actif : Inférence BitGEMM accélérée sur GPU.");
            } else {
                console.warn("⚠️ [WebGPU] Périphérique WebGPU indisponible, exécution CPU par repli.");
            }
        } catch (e) {
            console.warn("⚠️ [WebGPU] Erreur détection périphérique:", e.message);
        }
    }

    // 0. Tokenizer adaptatif à fusion progressive
    adaptiveTokenizer = new neuro.AdaptiveMergeTokenizer({ mergeThreshold, maxVocabSize });
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
    const bitLM = new neuro.BitGenerativeLM(initialVocab, contextDim, 4, contextDim, defaultNumBlocks);
    const bakBitgemm = `${BITGEMM_FILE}.bak`;
    if (fs.existsSync(BITGEMM_FILE)) {
        try {
            bitLM.importState(JSON.parse(fs.readFileSync(BITGEMM_FILE, 'utf8')));
            console.log(`[INIT] Modèle BitGEMM chargé (${bitLM.vocabSize} tokens).`);
        } catch (e) {
            console.warn("[INIT] Erreur lecture BitGEMM:", e.message);
            if (fs.existsSync(bakBitgemm)) {
                try {
                    bitLM.importState(JSON.parse(fs.readFileSync(bakBitgemm, 'utf8')));
                    console.log(`[INIT] Restauration depuis ${bakBitgemm} réussie (${bitLM.vocabSize} tokens).`);
                } catch (_) {}
            }
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

    const miner = new neuro.PolynomialFormalismMiner(brain, windowSize, TOKEN_BITS);
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

    const teacherClient = teacherUrl ? new neuro.OllamaTeacherClient({ baseUrl: teacherUrl, timeout: 6000 }) : null;
    if (teacherClient) {
        console.log(`🧑‍🏫 [Distillation Qwen] Serveur enseignant actif sur ${teacherUrl}`);
    } else {
        console.log(`🤖 [Mode 1-Bit Autonome] Entraînement STE standard sans enseignant.`);
    }

    let cycleCount = 1;
    const memoryBufferSentences = [];
    let pendingDistillation = null;

    // Démarrage du préchargement en arrière-plan
    if (!isOffline && !useLocal) {
        replenishPrefetchBuffer(cycleCount, forceSource, batchTargetCount);
    }

/**
 * Borne la longueur de séquence tout en préservant l'intégrité causale continue.
 * Évite de casser les transitions locales de n-grammes tout en bornant le temps de calcul.
 */
function causalTruncate(tokens, maxLen = 14) {
    if (tokens.length <= maxLen) return tokens;
    return tokens.slice(0, maxLen);
}

// Buffer de relecture anti-oubli (Experience Replay)
const replayMemory = [];
const MAX_REPLAY_BUFFER = 60;

    while (true) {
        const cycleStartTime = Date.now();
        console.log(`\n\x1b[7m CYCLE #${cycleCount} \x1b[0m (BitGEMM Vocab: ${bitLM.vocabSize} | Merges: ${adaptiveTokenizer.merges.size} | Symbol Vocab: ${brain.vocabulary.size})`);
        let batch = [];

        try {
            if (isOffline) {
                batch = [...FALLBACK_SENTENCES];
                console.log("📴 [Source : Hors-ligne] Utilisation des phrases de secours.");
            } else if (useLocal) {
                const res = await getBatchFromLocalCorpus(batchTargetCount, 1024 * 64);
                batch = res.sentences;
                console.log(`📁 [Source : Corpus local] Ingestion de ${batch.length} phrases.`);
                if (res.done) {
                    console.log("🔄 Fin du corpus local. Bascule en mode web multi-sources.");
                    useLocal = false;
                }
            } else {
                if (batchPrefetchQueue.length > 0) {
                    batch = batchPrefetchQueue.shift();
                } else {
                    batch = await getMultiSourceBatch(cycleCount - 1, batchTargetCount, forceSource);
                }
                replenishPrefetchBuffer(cycleCount, forceSource, batchTargetCount);
            }

            // Filtrage des références marginales et artefacts de segmentation
            batch = batch
                .map(s => sanitizeSentence(s))
                .filter(s => isValidTrainingSentence(s, 5));

            if (batch.length > 0) {
                console.log(`📥 Ingestion de ${batch.length} phrases...`);
                let newMergesCount = 0;
                let totalLoss = 0;
                let totalAcc = 0;
                let totalSteps = 0;
                const preTokenizedBatch = [];

                for (const sentence of batch) {
                    // Ingestion adaptative : les bigrammes récurrents fusionnent en super-tokens
                    const tokens = adaptiveTokenizer.ingestAndTokenize(sentence, (newToken) => {
                        newMergesCount++;
                        bitLM.addWord(newToken);
                    });

                    // Entraînement symbolique direct O(N) sans clôture transitive coûteuse
                    preTokenizedBatch.push(tokens);

                    // Enregistrement dans la mémoire de replay à long terme
                    if (tokens.length >= 4) {
                        replayMemory.push(tokens);
                        if (replayMemory.length > MAX_REPLAY_BUFFER) {
                            replayMemory.splice(0, replayMemory.length - MAX_REPLAY_BUFFER);
                        }
                    }
                }

                // Sélection ciblée : phrases fraîches représentatives + injection de replay
                const freshSubset = preTokenizedBatch.slice(0, maxTrainPerBatch);
                const replaySample = [];
                if (replayMemory.length > 8) {
                    for (let k = 0; k < 2; k++) {
                        const rIdx = Math.floor(Math.random() * (replayMemory.length - 4));
                        replaySample.push(replayMemory[rIdx]);
                    }
                }
                const consolidatedTrainBatch = [...freshSubset, ...replaySample];

                // Ingestion symbolique ciblée sur l'échantillon consolidé (évite 50x les tris BigInt quadgrammes)
                for (const tokens of consolidatedTrainBatch) {
                    brain.learnTokens(tokens, false, 1.0);
                }

                // Consolidation multi-passes avec fenêtrage causal continu
                for (const tokens of consolidatedTrainBatch) {
                    const activeTokens = causalTruncate(tokens, maxTokensPerSeq);
                    const r = bitLM.trainTokens(activeTokens, learningRate, localEpochs);
                    totalLoss += r.avgLoss;
                    totalAcc += r.accuracy;
                    totalSteps += r.steps;
                }

                // Évolution récursive allégée (cadencée tous les 6 cycles pour fluidifier l'ingestion)
                if (cycleCount % 6 === 0 && preTokenizedBatch.length > 0) {
                    const evoSeeds = [preTokenizedBatch[0]];
                    const evoResult = bitLM.evolveRecursiveGeneralities(evoSeeds, {
                        formalGrammar,
                        miner,
                        rolloutLen: 2,
                        mutationRate: 0.003,
                        catastropheProb: 0.01,
                        temperature: genTemperature || 0.35,
                        lr: learningRate * 0.5
                    });
                    if (evoResult.rolloutsCount > 0) {
                        console.log(`🧬 [Évolution 1-Bit] Rollouts: ${evoResult.rolloutsCount} | Mut. acceptées: ${evoResult.mutationsAccepted} | Harmonie: ${(evoResult.harmonicRate * 100).toFixed(1)}%`);
                    }
                }

                // Application de la distillation précédente si elle est prête
                if (pendingDistillation) {
                    try {
                        const teacherEmbedding = await pendingDistillation;
                        if (teacherEmbedding && teacherEmbedding.length > 0) {
                            bitLM.classifier.attention.backwardBatch([{ inputFloat: teacherEmbedding }], learningRate * 0.5);
                        }
                    } catch (e) {
                        console.warn(`⚠️ [Distillation] Échec requête enseignant : ${e.message}`);
                    } finally {
                        pendingDistillation = null;
                    }
                }

                // Déclenchement de la distillation sur la phrase la plus riche du lot
                const distillationTarget = [...batch].sort((a, b) => b.length - a.length)[0];
                if (teacherClient && distillationTarget) {
                    pendingDistillation = teacherClient.getEmbedding(distillationTarget, { dim: contextDim })
                        .catch(e => {
                            console.warn(`⚠️ [Distillation] Erreur en arrière-plan : ${e.message}`);
                            return null;
                        });
                }

                const trainedCount = Math.max(1, consolidatedTrainBatch.length);
                const avgLoss = (totalLoss / trainedCount).toFixed(3);
                const avgAcc = ((totalAcc / trainedCount) * 100).toFixed(1);
                const perplexity = Math.exp(parseFloat(avgLoss)).toFixed(2);
                const memSize = bitLM.episodicMemory.episodes.size;
                const elapsedCycle = ((Date.now() - cycleStartTime) / 1000).toFixed(2);
                console.log(`⚡ [BitGEMM 1-Bit STE] Loss: ${avgLoss} | Top-1: ${avgAcc}% | PPL: ${perplexity} | Pas: ${totalSteps} | Fusions: ${newMergesCount} | ⏱️ ${elapsedCycle}s`);

                memoryBufferSentences.push(...batch);
                if (memoryBufferSentences.length > 200) {
                    memoryBufferSentences.splice(0, memoryBufferSentences.length - 200);
                }
            }

            // Rafraîchissement des lois polynomiales selon la fréquence Pareto
            if (cycleCount % grammarInterval === 0 && memoryBufferSentences.length >= 8) {
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

            // Sauvegarde périodique (tous les 5 cycles ou au dernier cycle) sans bloquer les I/O
            const isSaveCycle = (cycleCount % 5 === 0) || (cycleCount >= maxCycles);
            if (isSaveCycle) {
                try {
                    writeFileSyncAtomic(BITGEMM_FILE, JSON.stringify(bitLM.exportState()));
                    writeFileSyncAtomic(TOKENIZER_FILE, JSON.stringify(adaptiveTokenizer.exportState()));
                    writeFileSyncAtomic(BRAIN_FILE, brain.exportBinary());
                    if (formalGrammar) {
                        writeFileSyncAtomic(RULES_FILE, JSON.stringify({
                            threshold: formalGrammar.threshold,
                            accuracy: formalGrammar.accuracy,
                            terms: formalGrammar.terms,
                            decodedRules: formalGrammar.decodedRules,
                            updatedAt: new Date().toISOString()
                        }));
                    }
                } catch (e) {
                    console.warn("[SAVE] Erreur sauvegarde atomique:", e.message);
                }
            }

            // Génération autorégressive allégée (génération tous les 2 cycles ou au save cycle)
            if (cycleCount % 2 === 0 || isSaveCycle) {
                const matchedTokens = adaptiveTokenizer.tokenize(batch[0] || FALLBACK_SENTENCES[0]);
                const seedPrompt = matchedTokens.slice(0, 2).join(' ');
                const bitGenerated = gpuActive
                    ? await bitLM.generateSentenceGPU(seedPrompt, 8, genTemperature || 0.4, adaptiveTokenizer, 1.35)
                    : bitLM.generateSentence(seedPrompt, 8, genTemperature || 0.4, adaptiveTokenizer, 1.35);
                console.log(`🤖 Génération 1-Bit (${gpuActive ? 'GPU BitGEMM' : 'CPU BitGEMM'}) : "${bitGenerated}"`);
                console.log(`   (Décodé sans '_')         : "${adaptiveTokenizer.detokenize(bitGenerated.split(' '))}"`);
            }

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
            console.log(`• Mode d'inférence    : XNOR + Popcount 32-bit (${gpuActive ? 'WebGPU Compute Shader' : 'CPU Natif'})`);
            if (gpuActive) bitLM.disposeGPU();
            break;
        }

        cycleCount++;
        if (!isTestMode) {
            await new Promise(r => setTimeout(r, cycleDelay));
        }
    }
}

main().catch(err => {
    console.error("💥 Crash:", err);
    process.exit(1);
});