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
    const { text, weight = 1 } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length < 5) {
        return res.status(400).json({ error: "Contenu textuel invalide ou trop court (min 5 chars)." });
    }

    try {
        const { brain, domain, path } = await getExpertForContent(text);
        
        const initialSize = brain.vocabulary.size;

        // Apprentissage segmenté
        brain.learnText(text.trim(), true, weight);

        // Persistance immédiate après ingestion
        fs.writeFileSync(path, brain.exportBinary());
        
        const newWords = brain.vocabulary.size - initialSize;
        console.log(`\x1b[32m[API]\x1b[0m Ingestion [${domain}] : +${newWords} tokens.`);

        res.json({
            success: true,
            domain: domain,
            added_tokens: newWords,
            total_vocabulary: brain.vocabulary.size
        });
    } catch (err) {
        console.error("\x1b[31m[API ERROR]\x1b[0m", err.message);
        res.status(500).json({ error: "Erreur interne lors de l'apprentissage neuronal." });
    }
});

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
        const { brain, domain } = await getExpertForContent(prompt);

        console.log(`\x1b[36m[API QUERY]\x1b[0m Expert: ${domain.toUpperCase()}`);
        console.log(`\x1b[36m[API QUERY]\x1b[0m Amorce: "${prompt}" (probabilisme: topK=${topK}, créativité=${creativity})`);

        // On demande une profondeur généreuse pour permettre de finir la phrase
        let prediction = brain.predictSense(prompt, depth, {
            creativity: creativity,
            topK: topK,
            attention: attention
        });

        if (!prediction || prediction.trim().length === 0) {
            console.log("\x1b[33m[!] Alerte : La réponse est vide. L'expert n'a trouvé aucun candidat viable pour ce contexte.\x1b[0m");
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