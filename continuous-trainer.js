#!/usr/bin/env node

import { runWikipediaTraining } from './train-wikipedia.js';
import { GNeuroMoE } from './neuro-lib.js';
import fs from 'node:fs';
import path from 'node:path';

const EXPERTS_DIR = './experts_chunks/';

async function main() {
    console.log("\x1b[35m%s\x1b[0m", "=== G-NEURO CONTINUOUS TRAINER : LOCAL DIAGNOSTIC ===");
    
    // Vérification de l'environnement local
    const nodeVersion = process.versions.node.split('.')[0];
    if (parseInt(nodeVersion) < 18) {
        console.error("\x1b[31m[ERREUR]\x1b[0m Node.js v18 ou supérieur est requis. Version actuelle :", process.version);
        process.exit(1);
    }

    if (!fs.existsSync('./train-wikipedia.js')) {
        console.error("\x1b[31m[ERREUR]\x1b[0m Fichier 'train-wikipedia.js' manquant dans le répertoire courant.");
        process.exit(1);
    }

    if (!fs.existsSync(EXPERTS_DIR)) {
        fs.mkdirSync(EXPERTS_DIR, { recursive: true });
    }

    const moe = new GNeuroMoE(16, 5, EXPERTS_DIR);
    let cycleCount = 1;

    while (true) {
        console.log(`\n\x1b[7m CYCLE #${cycleCount} \x1b[0m`);
        
        const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        console.log(`[STATS] RAM: ${memUsage.toFixed(2)}MB | Vocab: ${moe.sharedState.vocabulary.size} words`);
        
        if (cycleCount % 5 === 0) {
            console.log(`[INFO] Global Token Count: ${moe.sharedState.totalTokensProcessed}`);
        }

        try {
            await runWikipediaTraining(moe);

            // Sauvegarde de l'état des experts pour query-brain.js
            console.log(`[INFO] Sauvegarde des experts sur le disque...`);
            for (const [domain, expert] of moe.experts) {
                const buffer = expert.exportBinary();
                fs.writeFileSync(path.join(EXPERTS_DIR, `expert_${domain}.gnr`), buffer);
            }
            
            // Sauvegarde de l'index global pour le routage
            moe.saveSharedState(path.join(EXPERTS_DIR, 'shared_state.gnr'));
            
        } catch (trainErr) {
            console.error(`\x1b[31m[ERREUR CYCLE #${cycleCount}]\x1b[0m Impossible de joindre Wikipedia ou erreur de script :`);
            console.error(trainErr.message);
            console.log("Attente de 10 secondes avant nouvelle tentative...");
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        cycleCount++;
    }
}

main().catch(err => console.error("\x1b[31m[CRASH TRAINER]\x1b[0m", err));