#!/usr/bin/env node

import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";
import fs from "node:fs";
import readline from "node:readline/promises";

const STORAGE_PATH = "./semantic_brain_storage.json";

async function main() {
    console.log("\x1b[35m%s\x1b[0m", "=== G-NEURO SEMANTIC QUERY INTERFACE ===");

    if (!fs.existsSync(STORAGE_PATH)) {
        console.error(`\x1b[31mErreur: Le fichier ${STORAGE_PATH} est introuvable.\x1b[0m`);
        process.exit(1);
    }

    // 1. Initialisation du cerveau
    const brain = new SemanticRelationalMemory(8);
    const attention = new SemanticAttentionLayer();
    brain.attachAttention(attention);

    // 2. Chargement des données
    try {
        console.log(`[Système] Chargement du modèle depuis ${STORAGE_PATH}...`);
        const rawData = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
        brain.importState(rawData);
        console.log(`[Système] Vocabulaire chargé : ${brain.vocabulary.size} mots.`);
        console.log(`[Système] Relations actives : ${brain.bitEngine.memorySize}`);
    } catch (err) {
        console.error("\x1b[31mErreur lors de l'importation :\x1b[0m", err.message);
        process.exit(1);
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    let depth = 150;
    let creativity = 0.05;

    console.log("\n\x1b[32mPrêt pour l'interrogation. Tapez votre amorce.\x1b[0m");
    console.log("Commandes spéciales : /depth [n], /creativity [0-1], /exit\n");

    while (true) {
        const prompt = await rl.question("\x1b[36mAmorce > \x1b[0m");

        if (prompt.toLowerCase() === "/exit" || prompt.toLowerCase() === "exit") break;

        // Gestion des paramètres à la volée
        if (prompt.startsWith("/depth")) {
            depth = parseInt(prompt.split(" ")[1]) || depth;
            console.log(`[Param] Profondeur ajustée à ${depth}`);
            continue;
        }
        if (prompt.startsWith("/creativity")) {
            creativity = parseFloat(prompt.split(" ")[1]) || creativity;
            console.log(`[Param] Créativité ajustée à ${creativity}`);
            continue;
        }

        if (!prompt.trim()) continue;

        // 3. Prédiction
        process.stdout.write("\x1b[33mIA      > \x1b[0m" + prompt + " ");
        
        try {
            let response = brain.predictSense(prompt, depth, {
                creativity: creativity,
                topK: 3,
                attention: attention
            });
            
            console.log(`\x1b[1m${response}\x1b[0m`);
        } catch (err) {
            console.log("\n\x1b[31m[Erreur de prédiction]\x1b[0m", err.message);
        }
        console.log("");
    }

    console.log("\x1b[35mFermeture du système neuronal.\x1b[0m");
    rl.close();
}

main().catch(err => {
    console.error(err);
});