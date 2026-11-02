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
let bitLM = new neuro.BitGenerativeLM(initialVocab, 256, 4);
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
    brain._updateFrequentWordsCache?.();
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

/**
 * Échantillonnage stochastique selon la loi de probabilités (Softmax + Top-P / Nucleus)
 */
function sampleProbabilisticCandidate(scoredCandidates, temperature = 0.7, topP = 0.9, repetitionPenalty = 1.2, recentTokens = []) {
    if (scoredCandidates.length === 0) return null;

    // Application de la pénalité de répétition sur les logits AVANT la sélection (déterministe ou stochastique)
    const penalizedCandidates = scoredCandidates.map(c => {
        let adjustedScore = c.score;
        const occurrences = recentTokens.filter(t => t.toLowerCase() === c.token.toLowerCase()).length;
        if (occurrences > 0) {
            adjustedScore -= occurrences * 3.5 * repetitionPenalty;
            if (recentTokens[recentTokens.length - 1]?.toLowerCase() === c.token.toLowerCase()) {
                adjustedScore -= 7.0 * repetitionPenalty; // Pénalité renforcée contre le bégaiement consécutif
            }
        }
        return { ...c, score: adjustedScore };
    });

    if (temperature <= 0.08) {
        // Mode déterministe (Argmax strict sur les scores pénalisés)
        return penalizedCandidates.reduce((best, cur) => cur.score > best.score ? cur : best, penalizedCandidates[0]);
    }

    // Stabilisation numérique Softmax
    const maxScore = Math.max(...penalizedCandidates.map(c => c.score));
    const exps = penalizedCandidates.map(c => Math.exp((c.score - maxScore) / Math.max(0.1, temperature)));
    const sumExp = exps.reduce((acc, v) => acc + v, 0);
    const probs = exps.map(v => v / (sumExp || 1e-9));

    // Tri décroissant pour le filtrage Nucleus (Top-P)
    const items = penalizedCandidates.map((c, i) => ({ ...c, prob: probs[i] }));
    items.sort((a, b) => b.prob - a.prob);

    let cumulative = 0;
    const nucleus = [];
    for (const item of items) {
        nucleus.push(item);
        cumulative += item.prob;
        if (cumulative >= topP) break;
    }

    // Tirage selon la loi multinomiale sur le noyau probabiliste
    const nucleusSum = nucleus.reduce((acc, it) => acc + it.prob, 0);
    const rand = Math.random() * nucleusSum;
    let running = 0;
    for (const item of nucleus) {
        running += item.prob;
        if (rand <= running) return item;
    }
    return nucleus[nucleus.length - 1];
}

function generateGuidedSentence(prompt, targetLength = 10, temperature = 0.7, topK = 12, topP = 0.9, repetitionPenalty = 1.3) {
    const tokens = adaptiveTokenizer.tokenize(prompt.toLowerCase());
    if (tokens.length === 0) tokens.push('les');
    const generated = [...tokens];
    const threshold = formalGrammar?.threshold ?? 0;
    const neuron = formalGrammar?.neuron ?? null;
    let lastPolyScore = threshold;

    for (let step = 0; step < targetLength; step++) {
        const currentContext = generated.join(' ');
        let candidates = brain.predictNextCandidates(currentContext, { topK, creativity: temperature });
        if ((!candidates || candidates.length === 0) && step === 0) {
            // Repli sur les amorces grammaticales si le mot de départ est inconnu
            candidates = brain.predictNextCandidates('<eos>', { topK, creativity: temperature }) || [];
            if (!candidates || candidates.length === 0) {
                candidates = brain.predictNextCandidates('les', { topK, creativity: temperature }) || [];
            }
        }
        if (!candidates || candidates.length === 0) break;

        const scoredCandidates = [];

        for (const cand of candidates) {
            // Éviter une fermeture immédiate ou les tokens parasites
            if (cand.token === '<eos>' && generated.length < tokens.length + 2) continue;

            const testWindow = [...generated.slice(-(WINDOW_SIZE - 1)), cand.token];
            while (testWindow.length < WINDOW_SIZE) testWindow.unshift(testWindow[0] || 'les');

            const testVec = miner.encodeSequence(testWindow);
            const polyScore = neuron ? neuron.evaluateScore(testVec) : threshold;
            const isHarmonic = polyScore >= threshold;

            // Guidage harmonique progressif borné
            const delta = polyScore - threshold;
            const harmonicBonus = isHarmonic 
                ? Math.min(3.0, (delta + 0.5) * 1.5) 
                : Math.max(-2.5, delta * 1.5);
            const compositeScore = cand.score + harmonicBonus;

            scoredCandidates.push({
                token: cand.token,
                score: compositeScore,
                polyScore,
                isHarmonic
            });
        }

        // Échantillonnage stochastique avec fenêtre glissante de pénalité de répétition
        const recent = generated.slice(-6);
        const picked = sampleProbabilisticCandidate(scoredCandidates, temperature, topP, repetitionPenalty, recent);
        if (!picked) break;
        if (picked.token === '<eos>' && generated.length >= tokens.length + 2) break;

        generated.push(picked.token);
        lastPolyScore = picked.polyScore;

        if (['.', '!', '?'].includes(picked.token) && generated.length >= tokens.length + 3) {
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
    const { prompt, depth = 10, creativity = 0.35, temperature = null, topK = 12, topP = 0.9, repetition_penalty = 1.3, mode = "hybrid" } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Prompt invalide." });
    }

    try {
        const cleanPrompt = prompt.trim().toLowerCase();
        const effectiveDepth = Math.max(1, parseInt(depth, 10) || 10);
        // Température effective avec prise en compte des valeurs basses de créativité
        const effectiveTemp = temperature !== null ? Math.max(0.05, parseFloat(temperature)) : Math.max(0.05, parseFloat(creativity) * 1.5);
        
        if (mode === "symbolic") {
            const outcome = generateGuidedSentence(cleanPrompt, effectiveDepth, effectiveTemp, topK, topP, parseFloat(repetition_penalty));
            const pureSymbolic = brain.predictSense(cleanPrompt, effectiveDepth, { creativity: effectiveTemp, topK });
            return res.json({
                success: true,
                mode: "symbolic",
                prompt: prompt,
                prediction: outcome.prediction,
                full_result: outcome.full_result,
                symbolic_generation: outcome.full_result,
                detokenized_result: adaptiveTokenizer.detokenize(outcome.full_result.split(' ')),
                pure_symbolic_memory: pureSymbolic,
                polynomial_validation: {
                    score: outcome.polyScore,
                    threshold: formalGrammar?.threshold ?? null,
                    valid: outcome.isHarmonic
                }
            });
        }

        const bitgemmText = bitLM.generateSentence(cleanPrompt, effectiveDepth, effectiveTemp, adaptiveTokenizer, parseFloat(repetition_penalty));

        if (mode === "bitgemm") {
            return res.json({
                success: true,
                mode: "1-bit-autonomous",
                full_result: bitgemmText
            });
        }

        // Mode hybrid (par défaut) : combine génération symbolique guidée et inférence 1-bit
        const outcome = generateGuidedSentence(cleanPrompt, effectiveDepth, effectiveTemp, topK, topP, parseFloat(repetition_penalty));
        const pureSymbolic = brain.predictSense(cleanPrompt, effectiveDepth, { creativity: effectiveTemp, topK });

        res.json({
            success: true,
            mode: "hybrid",
            prompt: prompt,
            prediction: outcome.prediction,
            full_result: outcome.full_result,
            symbolic_generation: outcome.full_result,
            detokenized_result: adaptiveTokenizer.detokenize(outcome.full_result.split(' ')),
            pure_symbolic_memory: pureSymbolic,
            bitgemm_inference: bitgemmText,
            bitgemm_detokenized: adaptiveTokenizer.detokenize(bitgemmText.split(' ')),
            polynomial_validation: {
                score: outcome.polyScore,
                threshold: formalGrammar?.threshold ?? null,
                valid: outcome.isHarmonic
            }
        });
    } catch (err) {
        console.error("\x1b[31m[API ERROR]\x1b[0m", err.message);
        res.status(500).json({ error: "Erreur lors de la génération polynomiale." });
    }
});

app.post('/ingest', async (req, res) => {
    const { text, weight = 1.0, lr = 0.045, epochs = 3, retrain_grammar = false } = req.body;

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
        let selfInductions = 0;
        const numEpochs = Math.max(1, Math.min(10, parseInt(epochs, 10) || 3));
        const effectiveLr = Math.max(0.005, parseFloat(lr) || 0.045);
        const allDocumentTokens = [];

        for (let i = 0; i < sentences.length; i++) {
            const s = sentences[i];
            // 1. Tokenisation avec fusions adaptatives
            const tokens = adaptiveTokenizer.ingestAndTokenize(s, (mergedToken) => {
                newMerges++;
                bitLM.addWord(mergedToken);
            });
            allDocumentTokens.push(tokens);

            // 2. Entraînement symbolique sur les super-tokens
            brain.learnSense(tokens.join(' '), false, weight);

            // 3. Entraînement 1-bit autorégressif sur les tokens compactés avec micro-époques
            const r = bitLM.trainTokens(tokens, effectiveLr, numEpochs, 0.0);
            totalLoss += r.avgLoss;
            totalAcc += r.accuracy;
        }

        // 4. Apprentissage explicite des JONCTIONS INTER-PHRASES (Discourse Bridges)
        for (let i = 0; i < allDocumentTokens.length - 1; i++) {
            const bridgeTokens = [
                ...allDocumentTokens[i].slice(-3),
                ...allDocumentTokens[i + 1].slice(0, 4)
            ];
            if (bridgeTokens.length >= 4) {
                brain.learnSense(bridgeTokens.join(' '), false, weight * 0.8);
                bitLM.trainTokens(bridgeTokens, effectiveLr * 0.75, 1, 0.0);
            }

            // 5. Auto-induction de sa propre génération (Self-Rollout Feedback)
            const rolloutSeed = allDocumentTokens[i].slice(-3);
            const rolloutRes = bitLM.selfRolloutFeedback(rolloutSeed, 3, formalGrammar, miner, effectiveLr * 0.5);
            if (rolloutRes.accepted) {
                selfInductions++;
            }
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
            micro_epochs: numEpochs,
            symbolic_vocabulary: brain.vocabulary.size,
            tokenizer_merges: adaptiveTokenizer.merges.size,
            new_merges: newMerges,
            self_inductions_accepted: selfInductions,
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
    console.log(`👉 POST /query   { "prompt": "les étoiles", "mode": "hybrid|symbolic|bitgemm" }`);
    console.log(`👉 POST /ingest  { "text": "...", "retrain_grammar": false }`);
    console.log(`👉 GET  /status`);
    console.log(`👉 GET  /invariants\n`);
});