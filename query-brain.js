#!/usr/bin/env node

import { GNeuroMoE, SemanticAttentionLayer } from "./neuro-lib.js";
import fs from "node:fs";
import readline from "node:readline/promises";

const EXPERTS_DIR = "./experts_chunks/";
// Orchestrateur Mixture of Experts
const moe = new GNeuroMoE(16);
/**
 * Récupère un expert et charge son état binaire si nécessaire
 */
function getExpertForContent(text) {
    const domain = moe.route(text);
    const brain = moe.getExpert(domain);
    const path = `${EXPERTS_DIR}expert_${domain}.gnr`;

    if (!brain.hasBeenLoaded && fs.existsSync(path)) {
        console.log(`\x1b[2m[MoE] Chargement binaire de l'expert : ${domain}\x1b[0m`);
        brain.importState(fs.readFileSync(path));
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

    return { brain, domain, path };
}

async function main() {
    console.log("\x1b[35m%s\x1b[0m", "=== G-NEURO SEMANTIC QUERY INTERFACE ===");
    console.log("Mode : Mixture of Experts (Auto-Routing)\n");

    // Charger l'état global pour le routage et le vocabulaire
    moe.loadSharedState(`${EXPERTS_DIR}shared_state.gnr`);

    // 1. Initialisation de l'orchestrateur
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


        const { brain, domain } = getExpertForContent(prompt);

        brain.attachAttention(attention);

        try {
            const response = brain.predictSense(prompt, depth, {
                creativity: creativity,
                topK: 3,
                attention: attention
            });

            if (!response || response.trim().length === 0) {
                console.log("\x1b[33m[!] Alerte : La réponse est vide. L'expert n'a trouvé aucun candidat viable pour ce contexte.\x1b[0m");
            }
            
            console.log(`\x1b[1mRESP:${response}\x1b[0m`);
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