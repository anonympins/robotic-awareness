#!/usr/bin/env node

import { runWikipediaTraining } from './train-wikipedia.js';
import { runBookTraining } from './train-books.js';

async function main() {
    console.log("\x1b[35m%s\x1b[0m", "=== G-NEURO CONTINUOUS MULTI-SOURCE TRAINER ===");
    
    let cycleCount = 1;

    while (true) {
        console.log(`\n\x1b[7m CYCLE #${cycleCount} \x1b[0m`);
        
        // 50% de chance pour chaque source
        if (Math.random() > 0.5) {
            await runWikipediaTraining();
        } else {
            await runBookTraining();
        }
        
        cycleCount++;
        const pause = 60; // 60 secondes entre chaque cycle pour lisser la consommation d'API
        console.log(`\x1b[90mAttente de ${pause}s avant le prochain influx de données...\x1b[0m`);
        await new Promise(r => setTimeout(r, pause * 1000));
    }
}

main().catch(err => console.error("\x1b[31m[CRASH TRAINER]\x1b[0m", err));