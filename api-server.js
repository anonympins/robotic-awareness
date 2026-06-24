#!/usr/bin/env node

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { GNeuroMoE, SemanticAttentionLayer } from "./neuro-lib.js";

const app = express();
const port = process.env.PORT || 7701;
// Augmentation de la limite pour permettre l'envoi de textes longs (ex: articles complets)
// DOIT être placé AVANT la définition des routes qui l'utilisent.
app.use(express.json({ limit: '10mb' }));
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
        // Le routage initial sert principalement à l'analyse et aux logs.
        // L'expert sélectionné sera le principal responsable de la génération.
        const { brain: expert, domain } = await getExpertForContent(prompt);
        console.log(`\x1b[36m[API QUERY]\x1b[0m Domaine principal détecté: ${domain.toUpperCase()}`);
        
        // --- NOUVELLE LOGIQUE : Utilisation directe de `predictSense` ---
        // C'est la méthode de génération la plus avancée, qui gère les schémas,
        // la recherche par faisceaux, et une fusion complexe des signaux.
        const prediction = expert.predictSense(prompt, depth, {
            creativity: creativity,
            topK: topK,
            coreBrain: coreBrain // Fournit le cerveau de base comme filet de sécurité
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

/**
 * Endpoint public pour l'ingestion de données textuelles.
 * Utilise learnWithSpecialization de GNeuroMoE pour le découpage en phrases et l'apprentissage pondéré.
 */
app.post('/ingest', async (req, res) => {
    // Ajout d'un poids secondaire pour l'apprentissage contextuel
    const { text, weight = 1.0, secondary_weight = 0.1 } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length < 5) {
        return res.status(400).json({ error: "Contenu textuel invalide ou trop court (min 5 chars)." });
    }

    try {
        // --- LOGIQUE D'APPRENTISSAGE CENTRALISÉE ---
        const { report, modifiedExperts, sentences, initialVocabSizes } = moe.learnWithSpecialization(text, {
            weight,
            secondary_weight
        });

        if (sentences.length === 0) {
            return res.status(400).json({ error: "Aucune phrase valide à ingérer." });
        }

        // Persistance de tous les experts modifiés
        for (const domain of modifiedExperts) {
            const expert = moe.experts.get(domain);
            if (!expert) continue;

            const expertPath = path.join(EXPERTS_DIR, `expert_${domain}.gnr`);
            fs.writeFileSync(expertPath, expert.exportBinary());
            
            const expertReport = report[domain];
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

app.listen(port, () => {
    console.log(`\n\x1b[35m=== G-NEURO API SERVER ===\x1b[0m`);
    console.log(`Statut : Opérationnel sur http://localhost:${port}`);
    console.log(`Usage  : POST /ingest { "text": "..." }\n`);
});