#!/usr/bin/env node

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import * as neuro from './neuro-lib.js';
import { Optimization } from './problemSolver/library.js';

const app = express();
const port = process.env.PORT || 7701;
app.use(express.json({ limit: '10mb' }));

const MODEL_DIR = './formal_model/';
const BRAIN_FILE = path.join(MODEL_DIR, 'formal_brain.gnr');
const RULES_FILE = path.join(MODEL_DIR, 'formal_rules.json');
const BITGEMM_FILE = path.join(MODEL_DIR, 'bitgemm_model.json');
const TOKENIZER_FILE = path.join(MODEL_DIR, 'adaptive_tokenizer.json');
const tokenizer = /[a-z0-9àâäéèêëïîôöùûüç_]+|[^\w\s]/gi;
const WINDOW_SIZE = 4;
const TOKEN_BITS = 12;

if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });

const INITIAL_SEED_CORPUS = [
    "les astronomes observent les galaxies lointaines avec des télescopes géants.",
    "la théorie scientifique explique les phénomènes physiques de manière rationnelle.",
    "ces animaux sauvages traversent les forêts denses pendant la nuit.",
    "les chercheurs découvrent de nouvelles lois mathématiques fondamentales.",
    "un grand nombre de citoyens participent activement aux débats démocratiques.",
    "cette nouvelle technologie transforme profondément les communications modernes."
];

let brain = new neuro.SemanticRelationalMemory(8);
let miner = new neuro.PolynomialFormalismMiner(brain, WINDOW_SIZE, TOKEN_BITS);
let formalGrammar = null;
const initialVocab = ["les", "la", "le", "des", "un", "une", "dans", "avec", "pour", "<eos>"];
let bitLM = new neuro.BitGenerativeLM(initialVocab, 64, 4);
let adaptiveTokenizer = new neuro.AdaptiveMergeTokenizer({ mergeThreshold: 5, maxVocabSize: 4096 });

function loadOrInitModel() {
    console.log("\x1b[36m[Formal Server]\x1b[0m Initialisation des modèles BitGEMM & Polynôme...");

    // 0. Tokenizer adaptatif
    if (fs.existsSync(TOKENIZER_FILE)) {
        try {
            adaptiveTokenizer.importState(JSON.parse(fs.readFileSync(TOKENIZER_FILE, 'utf8')));
            console.log(`  🔤 Tokenizer adaptatif chargé (${adaptiveTokenizer.merges.size} fusions).`);
        } catch (e) {
            console.warn(`  ⚠️ Échec chargement Tokenizer: ${e.message}`);
        }
    }

    // 1. Modèle 1-bit BitGEMM
    if (fs.existsSync(BITGEMM_FILE)) {
        try {
            bitLM.importState(JSON.parse(fs.readFileSync(BITGEMM_FILE, 'utf8')));
            console.log(`  ⚡ Modèle BitGEMM 1-bit chargé (${bitLM.vocabSize} tokens).`);
        } catch (e) {
            console.warn(`  ⚠️ Échec chargement BitGEMM: ${e.message}`);
        }
    }

    // 2. Mémoire sémantique
    if (fs.existsSync(BRAIN_FILE)) {
        try {
            brain.importBinary(fs.readFileSync(BRAIN_FILE));
            console.log(`  📁 Mémoire sémantique chargée (${brain.vocabulary.size} tokens).`);
        } catch (e) {
            console.warn(`  ⚠️ Échec chargement brain binaire: ${e.message}`);
        }
    } else {
        INITIAL_SEED_CORPUS.forEach(s => brain.learnSense(s, true, 2));
    }

    miner = new neuro.PolynomialFormalismMiner(brain, WINDOW_SIZE, TOKEN_BITS);

    if (fs.existsSync(RULES_FILE)) {
        try {
            const raw = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
            const neuron = new neuro.PolynomialPlusPlusNeuron(raw.terms, raw.threshold);
            formalGrammar = {
                neuron,
                threshold: raw.threshold,
                accuracy: raw.accuracy || 1.0,
                terms: raw.terms,
                decodedRules: raw.decodedRules || { rules: [] }
            };
            console.log(`  📜 Invariants polynomiaux chargés (seuil: ${raw.threshold}, termes: ${raw.terms?.length}).`);
        } catch (e) {
            console.warn(`  ⚠️ Échec lecture invariants json: ${e.message}`);
        }
    }

    if (!formalGrammar) {
        console.log("  🧬 Entraînement initial d'invariants polynomiaux par défaut...");
        const discovery = miner.discoverFormalGrammar(INITIAL_SEED_CORPUS, Optimization, {
            generations: 40,
            populationSize: 40,
            maxTerms: 8
        });
        formalGrammar = discovery;
        saveModel();
    }
}

function saveModel() {
    fs.writeFileSync(BITGEMM_FILE, JSON.stringify(bitLM.exportState(), null, 2));
    fs.writeFileSync(TOKENIZER_FILE, JSON.stringify(adaptiveTokenizer.exportState(), null, 2));
    fs.writeFileSync(BRAIN_FILE, brain.exportBinary());
    if (formalGrammar) {
        const payload = {
            threshold: formalGrammar.threshold,
            accuracy: formalGrammar.accuracy,
            terms: formalGrammar.terms,
            decodedRules: formalGrammar.decodedRules,
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(RULES_FILE, JSON.stringify(payload, null, 2));
    }
}

function generateGuidedSentence(prompt, targetLength = 10, creativity = 0.15, topK = 12) {
    const tokens = adaptiveTokenizer.tokenize(prompt);
    if (tokens.length === 0) tokens.push('les');
    const generated = [...tokens];
    const threshold = formalGrammar.threshold;
    const neuron = formalGrammar.neuron;
    let lastPolyScore = threshold;

    for (let step = 0; step < targetLength; step++) {
        const currentContext = generated.join(' ');
        const candidates = brain.predictNextCandidates(currentContext, { topK, creativity });
        if (!candidates || candidates.length === 0) break;

        let bestCandidate = null;
        let bestCompositeScore = -Infinity;
        let selectedScore = threshold;

        for (const cand of candidates) {
            if (cand.token === '<eos>' && generated.length < tokens.length + 2) continue;

            const testWindow = [...generated.slice(-(WINDOW_SIZE - 1)), cand.token];
            while (testWindow.length < WINDOW_SIZE) testWindow.unshift(testWindow[0] || 'les');

            const testVec = miner.encodeSequence(testWindow);
            const polyScore = neuron.evaluateScore(testVec);
            const isHarmonic = polyScore >= threshold;

            const harmonicBonus = isHarmonic ? (polyScore - threshold + 1) * 3.0 : -10.0;
            const compositeScore = cand.score + harmonicBonus;

            if (compositeScore > bestCompositeScore) {
                bestCompositeScore = compositeScore;
                bestCandidate = cand.token;
                selectedScore = polyScore;
            }
        }

        if (!bestCandidate || bestCandidate === '<eos>') break;
        generated.push(bestCandidate);
        lastPolyScore = selectedScore;

        if (['.', '!', '?'].includes(bestCandidate) && generated.length >= tokens.length + 3) {
            break;
        }
    }

    const textResult = brain._intelligentlyJoinTokens(generated);
    const continuation = generated.slice(tokens.length);
    return {
        full_result: textResult,
        prediction: brain._intelligentlyJoinTokens(continuation),
        polyScore: lastPolyScore,
        isHarmonic: lastPolyScore >= threshold
    };
}

loadOrInitModel();

app.post('/query', async (req, res) => {
    const { prompt, depth = 10, creativity = 0.15, topK = 12, mode = "hybrid" } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Prompt invalide." });
    }

    try {
        const cleanPrompt = prompt.trim();
        const bitgemmText = bitLM.generateSentence(cleanPrompt, depth, 0.0, adaptiveTokenizer);

        if (mode === "bitgemm") {
            return res.json({
                success: true,
                mode: "1-bit-autonomous",
                full_result: bitgemmText
            });
        }

        const outcome = generateGuidedSentence(prompt.trim(), depth, creativity, topK);

        res.json({
            success: true,
            prompt: prompt,
            prediction: outcome.prediction,
            full_result: outcome.full_result,
            detokenized_result: adaptiveTokenizer.detokenize(outcome.full_result.split(' ')),
            bitgemm_inference: bitgemmText,
            polynomial_validation: {
                score: outcome.polyScore,
                threshold: formalGrammar.threshold,
                valid: outcome.isHarmonic
            }
        });
    } catch (err) {
        console.error("\x1b[31m[API ERROR]\x1b[0m", err.message);
        res.status(500).json({ error: "Erreur lors de la génération polynomiale." });
    }
});

app.post('/ingest', async (req, res) => {
    const { text, weight = 1.0, lr = 0.03, retrain_grammar = false } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length < 5) {
        return res.status(400).json({ error: "Contenu textuel invalide ou trop court (min 5 chars)." });
    }

    try {
        const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 8);
        if (sentences.length === 0) {
            return res.status(400).json({ error: "Aucune phrase valide à ingérer." });
        }

        let newMerges = 0;
        let totalLoss = 0;
        let totalAcc = 0;

        for (const s of sentences) {
            // 1. Tokenisation avec fusions adaptatives
            const tokens = adaptiveTokenizer.ingestAndTokenize(s, (mergedToken) => {
                newMerges++;
                bitLM.addWord(mergedToken);
            });

            // 2. Entraînement symbolique sur les super-tokens
            brain.learnSense(tokens.join(' '), false, weight);

            // 3. Entraînement 1-bit autorégressif sur les tokens compactés
            const r = bitLM.trainTokens(tokens, lr);
            totalLoss += r.avgLoss;
            totalAcc += r.accuracy;
        }

        miner.induceFeatures(sentences);

        if (retrain_grammar && sentences.length >= 4) {
            formalGrammar = miner.discoverFormalGrammar(sentences, Optimization, {
                generations: 40,
                populationSize: 40,
                maxTerms: 8
            });
        }

        saveModel();

        res.json({
            success: true,
            ingested_sentences: sentences.length,
            symbolic_vocabulary: brain.vocabulary.size,
            tokenizer_merges: adaptiveTokenizer.merges.size,
            new_merges: newMerges,
            bitgemm: {
                vocabSize: bitLM.vocabSize,
                avgLoss: (totalLoss / sentences.length).toFixed(3),
                top1Accuracy: `${((totalAcc / sentences.length) * 100).toFixed(1)}%`
            },
            grammar_threshold: formalGrammar.threshold,
            grammar_rules_count: formalGrammar.decodedRules?.rules?.length || 0
        });
    } catch (err) {
        console.error("\x1b[31m[API ERROR]\x1b[0m", err.message);
        res.status(500).json({ error: "Erreur interne lors de l'apprentissage." });
    }
});

app.get('/invariants', (req, res) => {
    res.json({
        threshold: formalGrammar?.threshold,
        accuracy: formalGrammar?.accuracy,
        rules: formalGrammar?.decodedRules?.rules || []
    });
});

app.get('/status', (req, res) => {
    res.json({
        bitgemm_vocab: bitLM.vocabSize,
        tokenizer_merges: adaptiveTokenizer.merges.size,
        symbolic_vocab: brain.vocabulary.size,
        bitgemm_file_bytes: fs.existsSync(BITGEMM_FILE) ? fs.statSync(BITGEMM_FILE).size : 0,
        grammar_rules: formalGrammar?.decodedRules?.rules?.length || 0,
        threshold: formalGrammar?.threshold
    });
});

app.listen(port, () => {
    console.log(`\n\x1b[35m=== BITGEMM & POLYNOMIAL FORMALISM API SERVER ===\x1b[0m`);
    console.log(`📡 Écoute sur http://localhost:${port}`);
    console.log(`👉 POST /query   { "prompt": "les étoiles" }`);
    console.log(`👉 POST /ingest  { "text": "...", "retrain_grammar": false }`);
    console.log(`👉 GET  /status`);
    console.log(`👉 GET  /invariants\n`);
});