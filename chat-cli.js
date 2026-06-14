import { SemanticRelationalMemory } from "./neuro-lib.js";
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';

const BACKUP_PATH = path.join(process.cwd(), 'semantic_brain_storage.json');

async function main() {
    console.log("\x1b[36m%s\x1b[0m", "=== ROBOTIC AWARENESS CLI INTERFACE ===");
    
    // Initialisation du cerveau (Fenêtre de 12 pour la cohérence grammaticale)
    const brain = new SemanticRelationalMemory(12);
    
    // Chargement de la mémoire
    try {
        const data = await fs.readFile(BACKUP_PATH, 'utf8');
        brain.importState(JSON.parse(data));
        console.log(`\x1b[32m[LOAD]\x1b[0m Cerveau chargé avec succès (${brain.vocabulary.size} concepts).`);
    } catch (e) {
        console.error("\x1b[31m[ERROR]\x1b[0m Impossible de charger semantic_brain_storage.json. Assurez-vous d'avoir lancé l'entraînement.");
        process.exit(1);
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '\x1b[35mBrain>\x1b[0m '
    });

    // Paramètres par défaut
    let config = {
        depth: 10,
        creativity: 0.05
    };

    console.log("\nInstructions :");
    console.log("- Tapez une phrase ou une amorce pour obtenir une prédiction.");
    console.log("- \x1b[33m/depth [n]\x1b[0m : change la longueur de la réponse (actuel: " + config.depth + ")");
    console.log("- \x1b[33m/creativity [0-1]\x1b[0m : ajuste l'aléatoire (actuel: " + config.creativity + ")");
    console.log("- \x1b[33m/exit\x1b[0m : quitter le programme\n");

    rl.prompt();

    rl.on('line', (line) => {
        const input = line.trim();

        if (!input) {
            rl.prompt();
            return;
        }

        // Gestion des commandes CLI
        if (input.startsWith('/')) {
            const [cmd, val] = input.split(' ');
            
            if (cmd === '/exit' || cmd === '/quit') {
                rl.close();
                return;
            }

            if (cmd === '/depth' && val) {
                config.depth = parseInt(val, 10);
                console.log(`Profondeur réglée à ${config.depth}`);
            } else if (cmd === '/creativity' && val) {
                config.creativity = parseFloat(val);
                console.log(`Créativité réglée à ${config.creativity}`);
            } else {
                console.log("Commande inconnue ou valeur manquante.");
            }
            
            rl.prompt();
            return;
        }

        // Génération de la réponse
        process.stdout.write("\x1b[2mPensée en cours...\x1b[0m\r");
        
        try {
            const startTime = Date.now();
            const completion = brain.predictSense(input, config.depth, { creativity: config.creativity });
            const duration = Date.now() - startTime;

            console.log(`\x1b[1m${input}\x1b[0m \x1b[32m${completion}\x1b[0m \x1b[90m(${duration}ms)\x1b[0m`);
        } catch (err) {
            console.log(`\n\x1b[31m[!] Erreur de prédiction :\x1b[0m ${err.message}`);
        }

        rl.prompt();
    });

    rl.on('close', () => {
        console.log("\nFin de session. À bientôt.");
        process.exit(0);
    });
}

main();