#!/usr/bin/env node

import { GNeuroMoE, SemanticAttentionLayer } from "./neuro-lib.js";
import fs from "node:fs";
import readline from "node:readline/promises";

const EXPERTS_DIR = "./experts_chunks/";

async function main() {
    console.log("\x1b[35m%s\x1b[0m", "=== G-NEURO SEMANTIC QUERY INTERFACE ===");
    console.log("Mode : Mixture of Experts (Auto-Routing)\n");

    // 1. Initialisation de l'orchestrateur
    const moe = new GNeuroMoE(16);
    const attention = new SemanticAttentionLayer();
    
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

        // 2. Routage et chargement dynamique
        const domain = moe.route(prompt);
        const brain = moe.getExpert(domain);
        const path = `${EXPERTS_DIR}expert_${domain}.gnr`;

        if (!brain.hasBeenLoaded && fs.existsSync(path)) {
            process.stdout.write(`\x1b[2m[Système: Chargement expert ${domain}...]\x1b[0m\r`);
            brain.importState(fs.readFileSync(path));
            brain.hasBeenLoaded = true;
        }

        brain.attachAttention(attention);
        process.stdout.write(`\x1b[33mIA [${domain}] > \x1b[0m` + prompt + " ");
        
        try {
            const response = brain.predictSense(prompt, depth, {
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