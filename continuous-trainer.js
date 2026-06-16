#!/usr/bin/env node

import { runWikipediaTraining } from './train-wikipedia.js';
import { GNeuroMoE } from './neuro-lib.js';

async function main() {
    console.log("\x1b[35m%s\x1b[0m", "=== G-NEURO CONTINUOUS WIKIPEDIA TRAINER (MoE Version) ===");
    
    const moe = new GNeuroMoE(16);
    let cycleCount = 1;

    while (true) {
        console.log(`\n\x1b[7m CYCLE #${cycleCount} \x1b[0m`);
        
        await runWikipediaTraining(moe);
        
        cycleCount++;
    }
}

main().catch(err => console.error("\x1b[31m[CRASH TRAINER]\x1b[0m", err));