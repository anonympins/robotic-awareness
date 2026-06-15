#!/usr/bin/env node

import express from 'express';
import fs from 'node:fs';
import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";

const app = express();
const port = process.env.PORT || 3000;
const STORAGE_PATH = "./semantic_brain_storage.json";
const CORPUS_FILE = "./training_corpus.txt";

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
        const brain = new SemanticRelationalMemory(16);
        const attention = new SemanticAttentionLayer();
        brain.attachAttention(attention);

        // Chargement de l'état actuel de la mémoire
        if (fs.existsSync(STORAGE_PATH)) {
            brain.importState(JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8')));
        }

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

app.listen(port, () => {
    console.log(`\n\x1b[35m=== G-NEURO API SERVER ===\x1b[0m`);
    console.log(`Statut : Opérationnel sur http://localhost:${port}`);
    console.log(`Usage  : POST /ingest { "text": "..." }\n`);
});