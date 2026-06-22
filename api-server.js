#!/usr/bin/env node

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { GNeuroMoE, SemanticAttentionLayer } from "./neuro-lib.js";

const app = express();
const port = process.env.PORT || 7701;
const EXPERTS_DIR = "./experts_chunks/";

if (!fs.existsSync(EXPERTS_DIR)) fs.mkdirSync(EXPERTS_DIR);

// Orchestrateur Mixture of Experts
const moe = new GNeuroMoE(16);
const attention = new SemanticAttentionLayer();
let coreBrain = null; // Variable pour stocker l'expert grammatical de base

// Charger l'état global pour le routage et le vocabulaire dès le démarrage
moe.loadSharedState(`${EXPERTS_DIR}shared_state.gnr`);
console.log(`\x1b[2m[MoE] Vocabulaire partagé initialisé avec ${moe.sharedState.vocabulary.size} tokens.\x1b[0m`);

// --- CORRECTIF : Pré-chargement de tous les experts au démarrage ---
console.log("\x1b[2m[MoE] Pré-chargement des chunks d'experts existants...\x1b[0m");
const expertFiles = fs.readdirSync(EXPERTS_DIR).filter(f => f.startsWith('expert_') && f.endsWith('.gnr'));
for (const file of expertFiles) {
    const domain = file.replace('expert_', '').replace('.gnr', '');
    const expert = moe.getExpert(domain); // Crée ou récupère l'instance
    const expertPath = path.join(EXPERTS_DIR, file);
    
    console.log(`  > Chargement de la grammaire pour '${domain}'...`);
    try {
        expert.importBinary(fs.readFileSync(expertPath));
        expert.hasBeenLoaded = true; // Marque comme chargé pour éviter une relecture
    } catch (e) {
            console.error(`\x1b[31m  > Échec du chargement pour '${domain}': ${e.message}\x1b[0m`);
    }
}
console.log("\x1b[2m[MoE] Pré-chargement terminé.\x1b[0m");

/**
 * Récupère un expert et charge son état binaire si nécessaire
 * La fonction est maintenant asynchrone pour ne pas bloquer le serveur.
 */

// On récupère l'expert 'core' une seule fois au démarrage pour le fallback
coreBrain = moe.getCoreExpert();
// --- CORRECTIF : S'assurer que le cache de fallback du coreBrain est peuplé ---
if (coreBrain) {
    coreBrain._updateFrequentWordsCache();
}

async function getExpertForContent(text) {
    const domain = moe.route(text);
    const brain = moe.getExpert(domain);
    const path = `${EXPERTS_DIR}expert_${domain}.gnr`;

    // Le chargement se fait maintenant au démarrage, mais on garde cette vérification
    // au cas où un nouvel expert serait créé pendant que le serveur tourne.
    if (!brain.hasBeenLoaded && fs.existsSync(path)) {
        console.log(`\x1b[2m[MoE] Chargement binaire de l'expert : ${domain}\x1b[0m`);
        const data = await fs.promises.readFile(path);
        brain.importBinary(data); // Utilisation de importBinary
        brain.hasBeenLoaded = true;
    }
    // Statistiques de mémorisation de l'expert
    const vocabSize = brain.vocabulary.size;
    const grammarSize = brain.grammarMap.size;
    const totalTokens = brain.sharedState ? brain.sharedState.totalTokensProcessed : (brain.totalTokensProcessed || 0);
    
    console.log(`\x1b[2m[DEBUG] Expert [${domain}]: Vocab=${vocabSize}, Transitions=${grammarSize}, Tokens vus=${totalTokens}\x1b[0m`);

    // Analyse de la compréhension du prompt
    const tokens = text.toLowerCase().match(brain.tokenizer) || [];
    const known = tokens.filter(t => brain.vocabulary.has(t)).length;
    if (tokens.length > 0) {
        const ratio = (known / tokens.length * 100).toFixed(0);
        console.log(`\x1b[2m[DEBUG] Compréhension du prompt: ${known}/${tokens.length} mots connus (${ratio}%)\x1b[0m`);
    }

    // On attache l'attention ici, juste avant l'utilisation
    brain.attachAttention(attention);

    return { brain, domain, path };
}

// Augmentation de la limite pour permettre l'envoi de textes longs (ex: articles complets)
app.use(express.json({ limit: '10mb' }));

/**
 * Endpoint public pour l'ingestion de données textuelles.
 * Utilise learnText de neuro-lib pour le découpage en phrases et le filtrage du bruit sémantique.
 */
app.post('/ingest', async (req, res) => {
    // Ajout d'un poids secondaire pour l'apprentissage contextuel
    const { text, weight = 1.0, secondary_weight = 0.1 } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length < 5) {
        return res.status(400).json({ error: "Contenu textuel invalide ou trop court (min 5 chars)." });
    }

    try {
        // --- NOUVELLE LOGIQUE : Utilisation de la méthode d'apprentissage centralisée ---
        const { report, modifiedExperts, sentences, initialVocabSizes } = moe.learnWithSpecialization(text, {
            weight,
            secondary_weight
        });

        if (sentences.length === 0) {
            return res.status(400).json({ error: "Aucune phrase valide à ingérer." });
        }

        // Persistance de tous les experts modifiés
        for (const domain of modifiedExperts) {
            const expert = moe.experts.get(domain); // Accès direct car on sait qu'il est en mémoire
            if (!expert) continue;

            const expertPath = path.join(EXPERTS_DIR, `expert_${domain}.gnr`);
            fs.writeFileSync(expertPath, expert.exportBinary());
            
            const expertReport = report[domain];
            // La taille initiale du vocabulaire est maintenant gérée dans learnWithSpecialization
            // et le rapport est plus direct.
            expertReport.new_tokens = expert.vocabulary.size - (initialVocabSizes.get(domain) || expert.vocabulary.size);
            console.log(`\x1b[32m[API]\x1b[0m Ingestion [${domain}] : ${expertReport.sentences} phrases, +${expertReport.new_tokens} tokens.`);
        }

        res.json({
            success: true,
            ingested_sentences: sentences.length,
            report: report,
            total_vocabulary: moe.sharedState.vocabulary.size
        });
    } catch (err) {
        console.error("\x1b[31m[API ERROR]\x1b[0m", err.message);
        res.status(500).json({ error: "Erreur interne lors de l'apprentissage neuronal." });
    }
});

/**
 * Nouvelle fonction de prédiction utilisant une approche d'ensemble.
 * Interroge tous les experts pour chaque mot, fusionne leurs prédictions
 * et choisit le mot suivant par tirage pondéré.
 *
 * @param {string} prompt - Le texte de départ.
 * @param {number} depth - Le nombre maximum de mots à générer.
 * @param {object} options - Options de créativité, topK, etc.
 * @returns {string} La séquence de mots générée.
 */
async function predictWithEnsemble(prompt, depth, options) {
    const { creativity, topK, coreBrain, mainDomain: initialDomain } = options;
    let currentText = prompt.trim();
    let generatedSequence = [];

    // --- NOUVEAU : Mécanisme anti-répétition ---
    const repetitionCounts = new Map(); // Compte l'usage de chaque mot
    const trigramHistory = new Set();   // Stocke les trigrammes déjà générés
    const PENALTY_BASE = 0.1; // Pénalité de base, qui sera élevée à une puissance

    // --- NOUVEAU : Focus attentionnel à dégradation lente ---
    // On garde en mémoire les concepts clés du prompt initial.
    const attentionFocus = new Map(moe.sharedState.attention.correlationMatrix.get(initialDomain) || []);

    console.log(`\n\x1b[35m[ENSEMBLE PREDICTION]\x1b[0m Amorce: "${currentText}"`);

    for (let i = 0; i < depth; i++) {
        const contextForPrediction = currentText.split(' ').slice(-5).join(' ');
        console.log(`\n\x1b[36m--- Étape ${i + 1}: Prédiction pour "${contextForPrediction}..." ---\x1b[0m`);

        // --- CORRECTIF : VERROUILLAGE DU DOMAINE ---
        // En mode de restitution fidèle (creativity: 0), on ne change pas d'expert en cours de route.
        // On reste sur le domaine qui a compris le prompt initial.
        // En mode créatif, on peut autoriser le changement pour des réponses plus dynamiques.
        const mainDomain = creativity > 0.1 ? moe.route(contextForPrediction) : initialDomain;
        const mainExpert = moe.getExpert(mainDomain);
        console.log(`\x1b[2m  > Domaine principal actif: [${mainDomain}]\x1b[0m`);

        const mergedCandidates = new Map();
        let mainExpertConfidence = 0;

        // 1. L'expert principal prédit avec un poids renforcé.
        const mainCandidates = mainExpert.predictNextCandidates(currentText, { topK, creativity, coreBrain });
        if (mainCandidates.length > 0) {
            console.log(`\x1b[32m  > Expert Principal [${mainDomain}] propose: ${mainCandidates.map(c => `${c.token}(${c.score.toFixed(3)})`).join(', ')}\x1b[0m`);
            mainExpertConfidence = mainCandidates.reduce((sum, c) => sum + c.score, 0) / mainCandidates.length;

            for (const { token, score } of mainCandidates) {
                // On donne un poids de 2.0 à l'expert principal pour qu'il ait la priorité
                mergedCandidates.set(token, (mergedCandidates.get(token) || 0) + score * 2.0);
            }
        }

        // 2. Les autres experts contribuent seulement si l'expert principal est peu confiant.
        // Leurs scores sont atténués pour agir comme support et non comme décideur.
        const HELP_THRESHOLD = 0.1; // Seuil de confiance pour demander de l'aide en temps normal.
        const mainExpertIsSilent = mainCandidates.length === 0;

        // On demande de l'aide si l'expert principal est silencieux OU si sa confiance est faible.
        if (mainExpertIsSilent) {
            console.log(`\x1b[33m  > L'expert principal [${mainDomain}] est silencieux. Consultation générale...\x1b[0m`);
        } else if (mainExpertConfidence < HELP_THRESHOLD) {
            console.log(`\x1b[33m  > Confiance faible (${mainExpertConfidence.toFixed(2)}). Consultation des autres experts...\x1b[0m`);
        }

        for (const [domain, expert] of moe.experts.entries()) {
            // On ignore l'expert principal (déjà traité) et les experts non chargés
            if (domain === mainDomain || !expert.hasBeenLoaded) continue;

            // Si l'expert principal a parlé et est confiant, les autres ne s'expriment pas.
            if (!mainExpertIsSilent && mainExpertConfidence >= HELP_THRESHOLD) continue;

            const candidates = expert.predictNextCandidates(currentText, { topK, creativity, coreBrain });
            if (candidates.length > 0) {
                console.log(`\x1b[2m  > Aide de [${domain}]: ${candidates.map(c => `${c.token}(${c.score.toFixed(3)})`).join(', ')}\x1b[0m`);
                for (const { token, score } of candidates) {
                    // Le poids des experts secondaires est réduit (0.5)
                    mergedCandidates.set(token, (mergedCandidates.get(token) || 0) + score * (options.secondaryWeight || 0.5));
                }
            }
        }

        // --- NOUVEAU : Injection du focus attentionnel ---
        // On booste légèrement les mots liés au concept initial pour maintenir la cohérence.
        if (attentionFocus.size > 0) {
            for (const [token, score] of mergedCandidates) {
                const tokenId = moe.sharedState.vocabulary.get(token);
                if (tokenId && attentionFocus.has(tokenId)) {
                    const focusStrength = attentionFocus.get(tokenId);
                    // Le boost est modéré pour ne pas écraser la grammaire, mais aide à rester sur le sujet.
                    mergedCandidates.set(token, score * (1 + focusStrength * 0.2));
                }
            }
        }

        if (mergedCandidates.size === 0) {
            // --- NOUVEAU : Stratégie de fallback si aucun expert ne répond ---
            // Si c'est le premier mot à générer et que personne ne sait quoi dire,
            // on demande au coreBrain les débuts de phrase les plus courants.
            if (i === 0 && coreBrain) {
                console.log("\x1b[33m[!] Aucun expert n'a de suggestion. Tentative de démarrage avec le 'coreBrain'...\x1b[0m");
                // On demande au coreBrain les mots qui suivent le plus souvent une fin de phrase (ID 2 pour <eos>)
                const sentenceStarters = coreBrain.predictNextCandidates("<eos>", { topK: 20, creativity: 0.2 });
                if (sentenceStarters.length > 0) {
                    console.log(`\x1b[2m  > Le coreBrain propose comme débuts possibles: ${sentenceStarters.slice(0,5).map(c => c.token).join(', ')}...\x1b[0m`);
                    for (const { token, score } of sentenceStarters) {
                        // On peuple les candidats fusionnés avec ces suggestions
                        mergedCandidates.set(token, (mergedCandidates.get(token) || 0) + score);
                    }
                }
            }

            // Si même après le fallback, il n'y a rien, on arrête.
            if (mergedCandidates.size === 0) {
                console.log("\x1b[31m[!] Fallback échoué. Fin de la génération.\x1b[0m");
                break;
            }
        }

        // --- NOUVEAU : Application de la pénalité de répétition agressive ---
        const lastTwoWords = generatedSequence.slice(-2);
        for (const [token, score] of mergedCandidates) {
            // --- CORRECTIF : Pénalité de répétition différenciée ---
            // On vérifie si le mot est un "mot-outil" grammatical.
            // La méthode `isStructural` est sur l'expert, on utilise le `coreBrain` comme référence.
            const isStructural = coreBrain ? coreBrain.isStructural(token) : false;

            const count = repetitionCounts.get(token) || 0;
            if (count > 0) {
                // Si c'est un mot structurel, la pénalité est plus faible (0.4) pour autoriser les répétitions naturelles.
                // Sinon, la pénalité est très forte (0.05) pour éviter de répéter les mots de contenu.
                const penalty = Math.pow(isStructural ? 0.4 : 0.05, count);
                mergedCandidates.set(token, score * penalty);
            }

            // Interdiction de répétition de trigramme
            if (lastTwoWords.length === 2) {
                const trigramKey = `${lastTwoWords[0]}|${lastTwoWords[1]}|${token}`;
                if (trigramHistory.has(trigramKey)) {
                    mergedCandidates.set(token, mergedCandidates.get(token) * 0.0001); // Quasi-interdiction
                }
            }

            // --- NOUVEAU : Pénalité de diversité ---
            // On pénalise les mots très courts qui ne sont pas des connecteurs grammaticaux forts
            // pour éviter les boucles de type "la la la".
            if (token.length < 3 && !['un', 'une', 'des', 'les', 'que', 'qui', 'est', 'sont'].includes(token)) {
                 mergedCandidates.set(token, mergedCandidates.get(token) * 0.2);
            }
        }

        // --- CORRECTIF : Le tri et l'affichage se font APRÈS l'application des pénalités ---
        let sortedAndPenalized = [...mergedCandidates.entries()].sort((a, b) => b[1] - a[1]);
        console.log(`\x1b[1;34m  > Fusion finale (après pénalités): ${sortedAndPenalized.slice(0, 10).map(([t, s]) => `${t}(${s.toFixed(3)})`).join(', ')} ...\x1b[0m`);
        let chosenToken = null;

        // --- NOUVELLE LOGIQUE DE SÉLECTION : DÉTERMINISME vs CRÉATIVITÉ ---
        if (creativity === 0 && sortedAndPenalized.length > 0) {
            // En mode créativité zéro, on force la sélection du meilleur candidat.
            // C'est la garantie de suivre l'expression apprise si elle est la plus probable.
            console.log(`\x1b[2m  > Mode créativité 0: Sélection déterministe du top 1.\x1b[0m`);
            chosenToken = sortedAndPenalized[0][0];

            // --- VÉRIFICATION DE COHÉRENCE FORTE ---
            // Si le top 1 est un mot structurel faible et qu'un mot de contenu fort est juste derrière,
            // on peut exceptionnellement prendre le second pour éviter une fin de phrase prématurée ou un connecteur faible.
            if (sortedAndPenalized.length > 1) {
                const top1Token = sortedAndPenalized[0][0];
                const top2Token = sortedAndPenalized[1][0];
                const top1IsWeak = coreBrain ? coreBrain.isStructural(top1Token) : false;
                const top2IsStrong = coreBrain ? !coreBrain.isStructural(top2Token) : true;

                // Si le top 1 est un connecteur et le top 2 un mot de contenu, et que leurs scores sont très proches,
                // on privilégie le mot de contenu pour enrichir la phrase.
                if (top1IsWeak && top2IsStrong && (sortedAndPenalized[0][1] / sortedAndPenalized[1][1] < 1.2)) {
                    console.log(`\x1b[2m  > Correction déterministe: Le top 1 ('${top1Token}') est faible, sélection du top 2 ('${top2Token}') plus fort.\x1b[0m`);
                    chosenToken = top2Token;
                }
            }

        } else {
            // 3. Le mot final est choisi par un tirage au sort pondéré (roulette) parmi les candidats fusionnés.
            const totalScore = sortedAndPenalized.reduce((sum, [, score]) => sum + score, 0);
            let randomChoice = Math.random() * totalScore;

            for (const [token, score] of sortedAndPenalized) {
                randomChoice -= score;
                if (randomChoice <= 0) {
                    chosenToken = token;
                    break;
                }
            }
            // Fallback si quelque chose se passe mal avec le tirage
            if (!chosenToken && sortedAndPenalized.length > 0) {
                chosenToken = sortedAndPenalized[0][0];
            }
        }

        if (!chosenToken) {
             console.log("\x1b[33m[!] Impossible de choisir un token. Fin de la génération.\x1b[0m");
             break;
        }

        console.log(`\x1b[1;32m  > Mot choisi: ${chosenToken}\x1b[0m`);

        // --- CORRECTIF : Interpréter <eos> comme un signal d'arrêt ---
        if (chosenToken === "<eos>") break;

        generatedSequence.push(chosenToken);

        // Mise à jour de l'historique pour l'anti-répétition
        repetitionCounts.set(chosenToken, (repetitionCounts.get(chosenToken) || 0) + 1);
        if (generatedSequence.length >= 3) {
            const lastTrigram = generatedSequence.slice(-3);
            const trigramKey = lastTrigram.join('|');
            trigramHistory.add(trigramKey);
        }

        currentText += ` ${chosenToken}`;
    }

    return generatedSequence.join(' ');
}

/**
 * Endpoint pour interroger le cerveau (similaire à query-brain.js).
 * Attend un prompt et renvoie la prédiction sémantique.
 */
app.post('/query', async (req, res) => {
    // Augmentation des valeurs par défaut pour favoriser le probabilisme
    // creativity: 0.15 permet une variation notable sans perdre le sens
    // topK: 5 permet de choisir parmi les 5 meilleures options de manière pondérée
    const { prompt, depth = 150, creativity = 0.15, topK = 10 } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Prompt invalide." });
    }

    try {
        // Le routage initial sert principalement à l'analyse et aux logs, la prédiction est maintenant en mode "ensemble".
        const { domain } = await getExpertForContent(prompt);
        console.log(`\x1b[36m[API QUERY]\x1b[0m Domaine principal détecté: ${domain.toUpperCase()}`);
        
        // Utilisation de la nouvelle fonction de prédiction par ensemble
        const prediction = await predictWithEnsemble(prompt, depth, {
            creativity: creativity,
            topK: topK,
            coreBrain: coreBrain,
            mainDomain: domain // On passe le domaine initial pour la première étape
        });

        if (!prediction || prediction.trim().length === 0) {
            console.log("\x1b[33m[!] Alerte : La réponse générée est vide.\x1b[0m");
        }

        res.json({
            success: true,
            domain: domain,
            prompt: prompt,
            prediction: prediction,
            full_result: `${prompt} ${prediction}`
        });
    } catch (err) {
        console.error("\x1b[31m[API ERROR]\x1b[0m", err.message);
        res.status(500).json({ error: "Erreur lors de la génération de la réponse." });
    }
});

app.listen(port, () => {
    console.log(`\n\x1b[35m=== G-NEURO API SERVER ===\x1b[0m`);
    console.log(`Statut : Opérationnel sur http://localhost:${port}`);
    console.log(`Usage  : POST /ingest { "text": "..." }\n`);
});