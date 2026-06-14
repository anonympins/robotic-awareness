#!/usr/bin/env node

import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";
import { scrapeRandomWikipediaContent } from "./wikipedia-scraper.js";
import fs from "node:fs";

const STORAGE_PATH = "./semantic_brain_storage.json";
const SAVE_INTERVAL_PAGES = 1; // Sauvegarde après chaque page

async function main() {
    console.log("\x1b[35m%s\x1b[0m", "=== G-NEURO CONTINUOUS WIKIPEDIA TRAINING ===");

    const brain = new SemanticRelationalMemory(8); // Contexte réduit pour plus de flexibilité
    const attention = new SemanticAttentionLayer();
    brain.attachAttention(attention);

    // 1. Chargement si existant
    if (fs.existsSync(STORAGE_PATH)) {
        try {
            console.log(`[Système] Restauration de la mémoire depuis ${STORAGE_PATH}...`);
            const rawData = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
            brain.importState(rawData);
            console.log(`[Système] Vocabulaire actuel : ${brain.vocabulary.size} mots.`);
        } catch (e) {
            console.warn("[Alerte] Échec du chargement, démarrage à zéro.");
        }
    }

    let pagesProcessed = 0;

    // 2. Boucle infinie
    while (true) {
        try {
            console.log(`\n--- Cycle d'apprentissage #${pagesProcessed + 1} ---`);
            
            const { title, content: htmlContent } = await scrapeRandomWikipediaContent();
            
            // Nettoyage rapide du texte
            const cleanContent = htmlContent
                .replace(/<[^>]*>?/gm, '')    // Strip HTML
                .replace(/==.*?==/g, '')      // Titres de section
                .replace(/\[\d+\]/g, '')      // Références
                .replace(/\s+/g, ' ')         // Normalisation espaces
                .trim();

            console.log(`[Apprentissage] Ingestion de : "${title}" (${cleanContent.length} chars)`);
            
            const start = Date.now();
            // On entraîne 20 fois chaque bloc pour forcer la mémorisation (comme dans main.js)
            for(let i=0; i<20; i++) {
                // continuous = false permet d'apprendre à démarrer des phrases (contexte vide)
                brain.learnText(cleanContent, false); 
            }
            const duration = Date.now() - start;

            pagesProcessed++;
            console.log(`[Info] Terminé en ${duration}ms. Vocabulaire : ${brain.vocabulary.size}`);

            // 3. Sauvegarde périodique
            if (pagesProcessed % SAVE_INTERVAL_PAGES === 0) {
                const state = brain.exportState();
                fs.writeFileSync(STORAGE_PATH, JSON.stringify(state));
                console.log(`\x1b[32m[Sauvegarde] Modèle mis à jour dans ${STORAGE_PATH}\x1b[0m`);
            }

            // Petit délai pour ne pas saturer le réseau ou Wikipedia
            await new Promise(r => setTimeout(r, 2000));

        } catch (err) {
            console.error("\x1b[31m[Erreur Cycle]\x1b[0m", err.message);
            await new Promise(r => setTimeout(r, 5000)); // Pause plus longue en cas d'erreur
        }
    }
}

main().catch(console.error);