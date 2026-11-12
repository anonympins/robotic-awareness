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
let bitLM = new neuro.BitGenerativeLM(initialVocab, 512, 8, 2048, 4);
let isTraining = false;
let adaptiveTokenizer = new neuro.AdaptiveMergeTokenizer({ mergeThreshold: 5, maxVocabSize: 4096 });

// Cache mémoire pour les évaluations polynomiales
const polyScoreCache = new Map();
const MAX_POLY_CACHE = 1500;

/**
 * Écriture atomique sécurisée avec fichier temporaire et copie de sauvegarde (.bak)
 */
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

function loadJsonWithBackup(filePath) {
    const bakPath = `${filePath}.bak`;
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
            console.warn(`  ⚠️ Fichier corrompu (${path.basename(filePath)}): ${err.message}`);
            if (fs.existsSync(bakPath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(bakPath, 'utf8'));
                    console.log(`  🔄 Restauration réussie depuis la sauvegarde ${path.basename(bakPath)}.`);
                    return data;
                } catch (bakErr) {
                    console.warn(`  ⚠️ La sauvegarde .bak est également invalide: ${bakErr.message}`);
                }
            }
            try {
                fs.renameSync(filePath, `${filePath}.corrupted`);
            } catch (_) {}
        }
    }
    return null;
}

function evaluatePolyScoreCached(testWindow, neuron, threshold, minerInstance) {
    const key = testWindow.join('\x1f');
    if (polyScoreCache.has(key)) return polyScoreCache.get(key);
    const testVec = minerInstance.encodeSequence(testWindow);
    const score = neuron ? neuron.evaluateScore(testVec) : threshold;
    if (polyScoreCache.size >= MAX_POLY_CACHE) polyScoreCache.clear();
    polyScoreCache.set(key, score);
    return score;
}

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
    const bitgemmData = loadJsonWithBackup(BITGEMM_FILE);
    if (bitgemmData) {
        try {
            bitLM.importState(bitgemmData);
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

    // Réparation & synchronisation si le modèle BitGEMM a été tronqué ou n'a pas pu charger
    if (bitLM.vocabSize <= 10 && brain.vocabulary.size > 10) {
        console.log(`  🔧 Réparation : synchronisation du vocabulaire BitGEMM (${brain.vocabulary.size} tokens)...`);
        for (const [w] of brain.vocabulary) {
            if (w !== '<pad>' && w !== '<unk>') {
                bitLM.addWord(w);
            }
        }
        saveModel();
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
    polyScoreCache.clear();
    brain._updateFrequentWordsCache?.();
}

function saveModel() {
    writeFileSyncAtomic(BITGEMM_FILE, JSON.stringify(bitLM.exportState()));
    writeFileSyncAtomic(TOKENIZER_FILE, JSON.stringify(adaptiveTokenizer.exportState(), null, 2));
    writeFileSyncAtomic(BRAIN_FILE, brain.exportBinary());
    if (formalGrammar) {
        const payload = {
            threshold: formalGrammar.threshold,
            accuracy: formalGrammar.accuracy,
            terms: formalGrammar.terms,
            decodedRules: formalGrammar.decodedRules,
            updatedAt: new Date().toISOString()
        };
        writeFileSyncAtomic(RULES_FILE, JSON.stringify(payload, null, 2));
    }
}

const INVALID_TOKEN_REGEX = /[\[\]{}|\\]|'shun\b|a\]'shun/i;

function isValidToken(token) {
    return token && token !== '<unk>' && token !== '<pad>' && !INVALID_TOKEN_REGEX.test(token);
}

/**
 * Nettoie les sous-mots fusionnés du tokenizer (underscores)
 * et recale la ponctuation naturelle.
 */
function cleanOutputText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/_+/g, ' ')
        .replace(/\[.*?\]/g, '')
        .replace(/<pad>|<unk>|<eos>/gi, '')
        .replace(/[\u2014\u2013—–]|--+/g, ', ')
        .replace(/,\s*,+/g, ', ')
        .replace(/\s*'\s*/g, "'")
        .replace(/\s+([.,!?;:])/g, '$1')
        .replace(/([(\[{])\s+/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function formatTokensToText(tokens) {
    if (!tokens || tokens.length === 0) return '';
    let joined = '';
    if (adaptiveTokenizer && typeof adaptiveTokenizer.detokenize === 'function') {
        joined = adaptiveTokenizer.detokenize(tokens);
    } else if (brain && typeof brain._intelligentlyJoinTokens === 'function') {
        joined = brain._intelligentlyJoinTokens(tokens);
    } else {
        joined = tokens.join(' ');
    }
    return cleanOutputText(joined);
}

/**
 * Décodage autorégressif classique (Top-K / Top-P / Température)
 * Garantit l'accès à l'ensemble du vocabulaire appris par le réseau BitGEMM.
 */
async function generateClassicSequence(prompt, {
    targetLength = 12,
    temperature = 0.4,
    topK = 16,
    topP = 0.9,
    repetitionPenalty = 1.25,
    mode = "hybrid"
} = {}) {
    const rawTokens = adaptiveTokenizer ? adaptiveTokenizer.tokenize(prompt.toLowerCase()) : prompt.toLowerCase().split(/\s+/);
    const tokens = rawTokens.length > 0 ? [...rawTokens] : ['les'];
    const generatedTokens = [...tokens];
    const minGenWords = Math.min(3, Math.max(2, targetLength - 2));
    const threshold = formalGrammar?.threshold ?? 1;
    const neuron = formalGrammar?.neuron ?? null;

    for (let step = 0; step < targetLength; step++) {
        const contextWindow = generatedTokens.slice(-12);
        const contextStr = brain?._intelligentlyJoinTokens ? brain._intelligentlyJoinTokens(contextWindow.slice(-4)) : contextWindow.slice(-4).join(' ');

        // 1. Distribution neurale BitGEMM 1-Bit (moteur principal)
        let bitCandidates = [];
        if (bitLM) {
            const bitResult = bitLM.getTopCandidates(
                contextWindow,
                Math.max(topK, 12),
                temperature,
                step >= 2,
                repetitionPenalty,
                step
            );
            bitCandidates = bitResult?.candidates || [];
            if (bitCandidates.length === 0 && step === 0) {
                const fallback = bitLM.getTopCandidates(['les'], topK, temperature, false, repetitionPenalty, 0);
                bitCandidates = fallback?.candidates || [];
            }
        }

        // 2. Mémoire symbolique (boost contextuel doux en mode hybride)
        const candMap = new Map();
        const bitWeight = mode === "bitgemm" ? 1.0 : 0.75;
        for (const c of bitCandidates) {
            if (!isValidToken(c.token)) continue;
            const p = Math.max(1e-6, Number.isFinite(c.prob) ? c.prob : 1e-4);
            candMap.set(c.token, p * bitWeight);
        }

        if (mode === "hybrid" && brain) {
            const symCandidates = brain.predictNextCandidates(contextStr, { topK: Math.max(topK, 8), creativity: temperature }) || [];
            const symMax = Math.max(...symCandidates.map(c => c.score), 1);
            for (const c of symCandidates) {
                if (!isValidToken(c.token)) continue;
                const current = candMap.get(c.token) || 0;
                const symNormalized = Math.max(0.01, c.score / symMax);
                candMap.set(c.token, current + (symNormalized * 0.25));
            }
        }

        if (candMap.size === 0) break;

        // 3. Pénalité de répétition
        const recentTokens = generatedTokens.slice(-8);
        const lastToken = generatedTokens[generatedTokens.length - 1];
        const candidateList = [];
        for (const [tok, score] of candMap.entries()) {
            let adjusted = score;
            const count = recentTokens.filter(t => t.toLowerCase() === tok.toLowerCase()).length;
            if (count > 0) adjusted /= (1.0 + (count * repetitionPenalty));
            if (lastToken && lastToken.toLowerCase() === tok.toLowerCase()) adjusted /= (2.2 * repetitionPenalty);
            if (['.', '!', '?', '<eos>'].includes(tok) && (generatedTokens.length - tokens.length < minGenWords)) {
                adjusted *= 0.02;
            }
            candidateList.push({ token: tok, score: adjusted });
        }

        candidateList.sort((a, b) => b.score - a.score);
        const pool = candidateList.slice(0, Math.max(topK, 8));

        // 4. Échantillonnage Nucleus (Top-P) & Température
        const sumScores = pool.reduce((acc, c) => acc + c.score, 0) || 1;
        let cum = 0;
        const nucleus = [];
        for (const c of pool) {
            const p = c.score / sumScores;
            nucleus.push({ token: c.token, prob: p });
            cum += p;
            if (cum >= topP) break;
        }

        let chosen = nucleus[0].token;
        if (temperature > 0.08 && nucleus.length > 1) {
            const scaled = nucleus.map(c => Math.exp(Math.log(Math.max(1e-8, c.prob)) / Math.max(0.15, temperature)));
            const sumScaled = scaled.reduce((a, b) => a + b, 0);
            let r = Math.random() * sumScaled;
            for (let i = 0; i < nucleus.length; i++) {
                r -= scaled[i];
                if (r <= 0) {
                    chosen = nucleus[i].token;
                    break;
                }
            }
        }

        if (chosen === '<eos>') break;
        generatedTokens.push(chosen);
        if (['.', '!', '?'].includes(chosen) && (generatedTokens.length - tokens.length >= minGenWords)) {
            break;
        }
    }

    let polyScore = threshold;
    if (neuron && miner && generatedTokens.length >= WINDOW_SIZE) {
        polyScore = evaluatePolyScoreCached(generatedTokens.slice(-WINDOW_SIZE), neuron, threshold, miner);
    }

    const continuation = generatedTokens.slice(tokens.length);
    return {
        full_result: formatTokensToText(generatedTokens),
        prediction: formatTokensToText(continuation),
        polyScore: parseFloat(polyScore.toFixed(3)),
        isHarmonic: polyScore >= threshold,
        error_rate: 0.0
    };
}

/**
 * Recherche en faisceau (Beam Search) minimisant le taux d'erreur multi-objectifs :
 * - Surprisal NLL (probabilités conjointes)
 * - Clash syntaxique & désaccords grammaticaux
 * - Violation des invariants polynomiaux
 * - Pénalités de répétition et terminaisons prématurées
 */
async function minimizeSequenceError(prompt, {
    targetLength = 10,
    temperature = 0.7,
    topK = 8,
    beamWidth = 5,
    repetitionPenalty = 1.3,
    bitLMModel = null,
    mode = "hybrid"
} = {}) {
    const rawTokens = adaptiveTokenizer.tokenize(prompt.toLowerCase());
    const tokens = rawTokens.length > 0 ? rawTokens : ['les'];
    const threshold = formalGrammar?.threshold ?? 1;
    const neuron = formalGrammar?.neuron ?? null;
    const minGenWords = Math.min(4, Math.max(2, targetLength - 2));

    let beams = [{
        tokens: [...tokens],
        cumulativeError: 0,
        polyScore: threshold,
        finished: false
    }];

    const isStochastic = temperature > 0.08;

    for (let step = 0; step < targetLength; step++) {
        if (step > 0 && step % 2 === 0) {
            await new Promise(resolve => setImmediate(resolve));
        }

        if (beams.every(b => b.finished)) break;

        const candidateExpansions = [];

        for (const beam of beams) {
            if (beam.finished) {
                candidateExpansions.push(beam);
                continue;
            }

            const currentContext = brain._intelligentlyJoinTokens(beam.tokens.slice(-5));
            let symCandidates = [];
            if (mode !== "bitgemm") {
                symCandidates = brain.predictNextCandidates(currentContext, { topK, creativity: temperature }) || [];
                if (symCandidates.length === 0 && step === 0) {
                    symCandidates = brain.predictNextCandidates('<eos>', { topK, creativity: temperature }) || [];
                    if (symCandidates.length === 0) {
                        symCandidates = brain.predictNextCandidates('les', { topK, creativity: temperature }) || [];
                    }
                }
            }

            let bitgemmCandidates = [];
            let bitgemmConfidence = 0.5;
            if (bitLMModel && (mode === "hybrid" || mode === "bitgemm")) {
                const bitResult = bitLMModel.getTopCandidates(
                    beam.tokens.slice(-12),
                    topK,
                    temperature,
                    step >= 3,
                    repetitionPenalty,
                    step
                );
                bitgemmCandidates = bitResult.candidates || [];
                bitgemmConfidence = bitResult.confidence ?? 0.5;
                // Reconnexion sécurisée si le mot déclencheur est hors-vocabulaire (ex: mot anglais)
                if (bitgemmCandidates.length === 0 && step === 0) {
                    const fallback = bitLMModel.getTopCandidates(['les'], topK, temperature, false, repetitionPenalty, 0);
                    bitgemmCandidates = fallback.candidates || [];
                }
            }

            const tokenSet = new Set([
                ...symCandidates.map(c => c.token),
                ...bitgemmCandidates.map(c => c.token)
            ]);

            if (tokenSet.size === 0) {
                candidateExpansions.push({ ...beam, finished: true });
                continue;
            }

            const symMax = symCandidates.length > 0 ? Math.max(...symCandidates.map(c => c.score)) : 0;
            const effectiveSymTemp = Math.max(1.0, temperature * 1.8);
            const symSumExp = symCandidates.reduce((acc, c) => acc + Math.exp((c.score - symMax) / effectiveSymTemp), 0);
            const symProbMap = new Map(symCandidates.map(c => [
                c.token,
                Math.exp((c.score - symMax) / effectiveSymTemp) / (symSumExp || 1)
            ]));
            const bitProbMap = new Map(bitgemmCandidates.map(c => [c.token, c.prob]));

            const polyConfidence = Math.min(1.0, Math.max(0.05, beam.polyScore / (threshold || 1)));
            let alpha = 0.0;
            if (mode === "bitgemm") {
                alpha = 1.0;
            } else if (mode === "hybrid") {
                alpha = Math.max(0.05, Math.min(0.70, 0.60 * bitgemmConfidence * polyConfidence));
            }
            const beta = 1.0 - alpha;
            const prevTok = beam.tokens[beam.tokens.length - 1];

            for (const token of tokenSet) {
                if (token === '<eos>' && (beam.tokens.length < tokens.length + minGenWords)) continue;
                if (!isValidToken(token)) continue;

                // 1. Détection et pénalisation d'erreur syntaxique (genre/nombre)
                const clash = neuro.BitGenerativeLM.checkSyntacticClash(prevTok, token, brain);
                if (clash.clash && clash.penalty <= -30.0) continue;
                const syntacticError = clash.clash ? Math.min(25.0, Math.abs(clash.penalty)) : 0.0;

                // 2. Erreur de surprisal / Cross-Entropy
                const pSym = symProbMap.get(token) || 0;
                const pBit = bitProbMap.get(token) || 0;
                const blendedProb = (alpha * pBit) + (beta * pSym);
                if (blendedProb <= 1e-7) continue;
                const gumbelNoise = isStochastic
                    ? -Math.log(-Math.log(Math.random() * 0.9998 + 0.0001)) * temperature * 1.5
                    : 0.0;
                const nllError = Math.max(0, -Math.log(blendedProb) - gumbelNoise);

                // 3. Pénalité d'erreur de répétition
                const occurrences = beam.tokens.slice(-8).filter(t => t.toLowerCase() === token.toLowerCase()).length;
                let repetitionError = occurrences * 4.0 * repetitionPenalty;
                if (prevTok?.toLowerCase() === token.toLowerCase()) {
                    repetitionError += 12.0 * repetitionPenalty;
                }

                // 4. Pénalité d'infraction à l'invariant polynomial
                const testWindow = [...beam.tokens.slice(-(WINDOW_SIZE - 1)), token];
                while (testWindow.length < WINDOW_SIZE) testWindow.unshift(testWindow[0] || 'les');
                const polyScore = evaluatePolyScoreCached(testWindow, neuron, threshold, miner);
                const isHarmonic = polyScore >= threshold;
                const polyError = isHarmonic
                    ? -Math.min(2.0, (polyScore - threshold) * 1.2)
                    : (threshold - polyScore) * 3.5;

                // 5. Pénalité pour connecteur orphelin en fin de phrase
                let terminalError = 0;
                const isEnding = ['.', '!', '?', '<eos>'].includes(token);
                const hangingConnectors = new Set(['les', 'la', 'le', 'des', 'un', 'une', 'de', 'du', 'avec', 'pour', 'dans']);
                if (isEnding && hangingConnectors.has(prevTok?.toLowerCase())) {
                    terminalError += 15.0;
                }

                const stepError = nllError + syntacticError + repetitionError + polyError + terminalError;
                const nextTokens = [...beam.tokens, token];
                const newCumulativeError = beam.cumulativeError + stepError;
                const finished = isEnding && (nextTokens.length >= tokens.length + minGenWords);

                candidateExpansions.push({
                    tokens: nextTokens,
                    cumulativeError: newCumulativeError,
                    polyScore,
                    finished
                });
            }
        }

        if (candidateExpansions.length === 0) break;

        // Tri par Taux d'Erreur Normalisé par la longueur
        candidateExpansions.sort((a, b) => {
            const genLenA = Math.max(1, a.tokens.length - tokens.length);
            const genLenB = Math.max(1, b.tokens.length - tokens.length);
            return (a.cumulativeError / Math.pow(genLenA, 0.7)) - (b.cumulativeError / Math.pow(genLenB, 0.7));
        });

        beams = candidateExpansions.slice(0, beamWidth);
    }

    // Choix du chemin minimisant le taux d'erreur final
    beams.sort((a, b) => {
        const genLenA = Math.max(1, a.tokens.length - tokens.length);
        const genLenB = Math.max(1, b.tokens.length - tokens.length);
        return (a.cumulativeError / Math.pow(genLenA, 0.7)) - (b.cumulativeError / Math.pow(genLenB, 0.7));
    });

    // Sélection finale : Argmin strict si T <= 0.08, tirage de Boltzmann sur les meilleurs faisceaux si T > 0.08
    let best = beams[0];
    if (isStochastic && beams.length > 1) {
        const topBeams = beams.slice(0, Math.min(3, beams.length));
        const beamRates = topBeams.map(b => {
            const len = Math.max(1, b.tokens.length - tokens.length);
            return -(b.cumulativeError / Math.pow(len, 0.7));
        });
        const maxR = Math.max(...beamRates);
        const exps = beamRates.map(r => Math.exp((r - maxR) / Math.max(0.2, temperature)));
        const sumExp = exps.reduce((acc, v) => acc + v, 0);
        const randVal = Math.random() * sumExp;
        let running = 0;
        for (let i = 0; i < topBeams.length; i++) {
            running += exps[i];
            if (randVal <= running) {
                best = topBeams[i];
                break;
            }
        }
    }
    const continuation = best.tokens.slice(tokens.length);
    const genLength = Math.max(1, continuation.length);
    const normalizedErrorRate = best.cumulativeError / Math.pow(genLength, 0.7);

    return {
        full_result: brain._intelligentlyJoinTokens(best.tokens),
        prediction: brain._intelligentlyJoinTokens(continuation),
        polyScore: best.polyScore,
        isHarmonic: best.polyScore >= threshold,
        cumulative_error: parseFloat(best.cumulativeError.toFixed(4)),
        error_rate: parseFloat(normalizedErrorRate.toFixed(4))
    };
}

loadOrInitModel();

app.post('/query', async (req, res) => {
    const { prompt, depth = 10, creativity = 0.35, temperature = null, topK = 12, topP = 0.9, repetition_penalty = 1.3, mode = "hybrid" } = req.body;

    if (isTraining) {
        return res.status(503).json({ error: "Modèle en cours de ré-entraînement / évolution. Veuillez réessayer dans un instant." });
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Prompt invalide." });
    }

    try {
        const cleanPrompt = prompt.trim().toLowerCase();
        const effectiveDepth = Math.min(30, Math.max(1, parseInt(depth, 10) || 10));
        // Température effective avec prise en compte des valeurs basses de créativité
        const effectiveTemp = temperature !== null ? Math.max(0.05, parseFloat(temperature)) : Math.max(0.05, parseFloat(creativity) * 1.5);

        if (mode === "reflective" || mode === "deliberative") {
            const reflection = bitLM.deliberateAndRecompose(cleanPrompt, {
                formalGrammar,
                miner,
                brain,
                branches: 5,
                thoughtDepth: 6,
                finalLength: effectiveDepth,
                temperature: effectiveTemp
            });
            const predText = reflection.finalSentence.toLowerCase().startsWith(cleanPrompt)
                ? reflection.finalSentence.slice(cleanPrompt.length)
                : reflection.finalSentence;
            return res.json({
                success: true,
                mode: "reflective-2nd-level",
                prompt: prompt,
                thought_attractors: reflection.thoughtTokens,
                instanced_structure: reflection.conceptStructure,
                prediction: cleanOutputText(predText),
                full_result: cleanOutputText(reflection.finalSentence),
                poly_harmonic: reflection.polyHarmonic
            });
        }

        if (mode === "symbolic") {
            const rawPureSymbolic = brain.predictSense(cleanPrompt, effectiveDepth, { creativity: effectiveTemp, topK });
            const pureSymbolic = cleanOutputText(rawPureSymbolic);
            return res.json({
                success: true,
                mode: "symbolic",
                prompt: prompt,
                prediction: pureSymbolic,
                full_result: cleanOutputText(`${prompt} ${pureSymbolic}`)
            });
        }

        // Mode classique fiable (bitgemm, hybrid par défaut)
        const outcome = await generateClassicSequence(cleanPrompt, {
            targetLength: effectiveDepth,
            temperature: effectiveTemp,
            topK: Math.max(8, parseInt(topK, 10) || 12),
            topP: parseFloat(topP) || 0.9,
            repetitionPenalty: parseFloat(repetition_penalty) || 1.25,
            mode: mode === "bitgemm" ? "bitgemm" : "hybrid"
        });

        res.json({
            success: true,
            mode: mode === "bitgemm" ? "1-bit-autonomous" : "hybrid",
            algorithm: "classic-autoregressive",
            prompt: prompt,
            prediction: cleanOutputText(outcome.prediction),
            full_result: cleanOutputText(outcome.full_result),
            error_rate: outcome.error_rate,
            poly_score: outcome.polyScore,
            is_harmonic: outcome.isHarmonic
        });
    } catch (err) {
        console.error("\x1b[31m[API ERROR]\x1b[0m", err.stack || err.message);
        res.status(500).json({
            error: "Erreur lors de la génération polynomiale.",
            details: err.message
        });
    }
});

app.post('/ingest', async (req, res) => {
    const { text, weight = 1.0, lr = 0.045, epochs = 3, retrain_grammar = false } = req.body;
    
    if (isTraining) {
        return res.status(409).json({ error: "Une session d'entraînement est déjà en cours." });
    }

    if (!text || typeof text !== 'string' || text.trim().length < 5) {
        return res.status(400).json({ error: "Contenu textuel invalide ou trop court (min 5 chars)." });
    }

    isTraining = true;
    try {
        const sentences = text
            .split(/(?<=[.!?])\s+/)
            .map(s => s.replace(/[\u2014\u2013—–]|--+/g, ', ').replace(/\s+/g, ' ').trim())
            .filter(s => s.length >= 8);
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

            // 2. Entraînement symbolique direct sans ré-évaluation de regex
            brain.learnTokens(tokens, false, weight);

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
                brain.learnTokens(bridgeTokens, false, weight * 0.8);
                bitLM.trainTokens(bridgeTokens, effectiveLr * 0.75, 1, 0.0);
            }
        }

        // 5. Induction récursive par mutation combinatoire 1-bit (1 seule passe globale sur les amorces du batch)
        if (allDocumentTokens.length > 0) {
            const evoResult = bitLM.evolveRecursiveGeneralities(allDocumentTokens.slice(0, 4), {
                formalGrammar,
                miner,
                rolloutLen: 4,
                lr: effectiveLr * 0.5
            });
            selfInductions = evoResult.mutationsAccepted;
        }


        if (retrain_grammar && sentences.length >= 4) {
            formalGrammar = miner.discoverFormalGrammar(sentences, Optimization, {
                generations: 40,
                populationSize: 40,
                maxTerms: 8
            });
            polyScoreCache.clear();
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
    } finally {
        isTraining = false;
    }
});

app.post('/evolve', async (req, res) => {
    const { prompts = [], rolloutLen = 4, mutationRate = 0.003, catastropheProb = 0.02, lr = 0.025 } = req.body;
    if (isTraining) {
        return res.status(409).json({ error: "Une session d'entraînement est déjà en cours." });
    }
    try {
        isTraining = true;
        const seeds = Array.isArray(prompts) && prompts.length > 0 ? prompts : ["les étoiles", "la science", "cette loi"];
        const evoResult = bitLM.evolveRecursiveGeneralities(seeds, {
            formalGrammar,
            miner,
            rolloutLen: parseInt(rolloutLen, 10) || 4,
            mutationRate: parseFloat(mutationRate) || 0.003,
            catastropheProb: parseFloat(catastropheProb) || 0.02,
            lr: parseFloat(lr) || 0.025
        });

        saveModel();
        res.json({
            success: true,
            rolloutsCount: evoResult.rolloutsCount,
            mutationsAccepted: evoResult.mutationsAccepted,
            catastrophesCount: evoResult.catastrophesCount,
            harmonicRate: `${(evoResult.harmonicRate * 100).toFixed(1)}%`,
            generatedSequences: evoResult.acceptedRollouts.map(r => r.join(' '))
        });
    } catch (err) {
        console.error("\x1b[31m[API EVOLVE ERROR]\x1b[0m", err.message);
        res.status(500).json({ error: "Erreur lors de l'évolution récursive." });
    } finally {
        isTraining = false;
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
        bitgemm_hidden_dim: bitLM.classifier?.hiddenDim || 2048,
        bitgemm_residual_blocks: bitLM.classifier?.numBlocks || 4,
        bitgemm_total_sublayers: ((bitLM.classifier?.numBlocks || 4) * 2) + 2,
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