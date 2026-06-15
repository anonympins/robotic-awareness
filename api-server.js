#!/usr/bin/env node

import express from 'express';
import fs from 'node:fs';
import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";

const app = express();
const port = process.env.PORT || 7701;
const STORAGE_PATH = "./semantic_brain_storage.json";
const CORPUS_FILE = "./training_corpus.txt";

// Instance globale du cerveau pour éviter les accès disques répétitifs
let brain = new SemanticRelationalMemory(16);
let attention = new SemanticAttentionLayer();
brain.attachAttention(attention);

/**
 * Charge ou rafraîchit l'état du cerveau depuis le stockage
 */
function refreshBrainState() {
    try {
        if (fs.existsSync(STORAGE_PATH)) {
            const data = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
            brain.importState(data);
            return true;
        }
    } catch (err) {
        console.error("\x1b[31m[SYSTEM ERROR]\x1b[0m Erreur de lecture du modèle:", err.message);
    }
    return false;
}

// Chargement initial
refreshBrainState();

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
        // On s'assure d'avoir la dernière version avant d'apprendre
        refreshBrainState();

        const initialSize = brain.vocabulary.size;

        // Apprentissage : learnText découpe par ponctuation et nettoie les métadonnées
        brain.learnText(text.trim(), false, weight);

        // Persistance immédiate après ingestion
        fs.writeFileSync(STORAGE_PATH, JSON.stringify(brain.exportState()));
        
        // Archivage dans le fichier corpus global pour traçabilité
        fs.appendFileSync(CORPUS_FILE, `\n--- API INGESTION [${new Date().toLocaleString()}] ---\n${text.trim()}\n`, 'utf8');

        const newWords = brain.vocabulary.size - initialSize;
        console.log(`\x1b[32m[API]\x1b[0m Ingestion terminée : +${newWords} nouveaux tokens ajoutés.`);

        res.json({
            success: true,
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
        // Rafraîchir si le trainer a tourné entre temps
        if (!refreshBrainState() && brain.vocabulary.size === 0) {
            return res.status(404).json({ error: "Modèle introuvable. Ingestez des données d'abord." });
        }

        console.log(`\x1b[36m[API QUERY]\x1b[0m Amorce: "${prompt}" (probabilisme: topK=${topK}, créativité=${creativity})`);

        // On demande une profondeur généreuse pour permettre de finir la phrase
        let prediction = brain.predictSense(prompt, depth, {
            creativity: creativity,
            topK: topK,
            attention: attention
        });

        res.json({
            success: true,
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