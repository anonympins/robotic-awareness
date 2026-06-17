#!/usr/bin/env node

import { runWikipediaTraining } from './train-wikipedia.js';
import { runRobertTraining } from './train-le-robert.js';
import { GNeuroMoE, SyntaxAnalyzer } from './neuro-lib.js';
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

    // Chargement de l'état global existant pour assurer la continuité de l'apprentissage
    console.log("[INFO] Chargement de l'index global et du vocabulaire...");
    moe.loadSharedState(path.join(EXPERTS_DIR, 'shared_state.gnr'));

    let cycleCount = 1;

    while (true) {
        console.log(`\n\x1b[7m CYCLE #${cycleCount} \x1b[0m`);
        
        const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        console.log(`[STATS] RAM: ${memUsage.toFixed(2)}MB | Vocab: ${moe.sharedState.vocabulary.size} words`);
        
        if (cycleCount % 5 === 0) {
            console.log(`[INFO] Global Token Count: ${moe.sharedState.totalTokensProcessed}`);
            
            console.log(`\n\x1b[36m[SYNTAX] Analyse des structures émergentes...\x1b[0m`);
            for (const [domain, expert] of moe.experts) {
                const analyzer = new SyntaxAnalyzer(expert);
                const allSigs = analyzer.extractGenerativeSignatures();
                
                // Pour éviter la stagnation, on pioche 3 signatures aléatoires parmi les 12 meilleures
                const diverseSigs = allSigs.slice(0, 12).sort(() => Math.random() - 0.5).slice(0, 3);

                if (diverseSigs.length > 0) {
                    console.log(`  > [Expert ${domain}] :`);
                    diverseSigs.forEach(sig => {
                        console.log(`    - [${sig.type}] "${sig.pattern.join(' ')}" (Certitude: ${(sig.certainty*100).toFixed(0)}%, Force: ${sig.strength})`);
                    });
                }
            }
            console.log("");
        }

        try {
            // Alternance entre Wikipedia et Le Robert pour un cerveau équilibré
            if (cycleCount % 2 === 0) {
                await runRobertTraining(moe);
            } else {
                await runWikipediaTraining(moe);
            }

            // Sauvegarde de l'état des experts pour query-brain.js
            console.log(`[INFO] Sauvegarde des experts sur le disque...`);
            for (const [domain, expert] of moe.experts) {
                const buffer = expert.exportBinary();
                fs.writeFileSync(path.join(EXPERTS_DIR, `expert_${domain}.gnr`), buffer);
            }
            
            // Sauvegarde de l'index global pour le routage
            moe.saveSharedState(path.join(EXPERTS_DIR, 'shared_state.gnr'));
            await new Promise(resolve => setTimeout(resolve, 2000));

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