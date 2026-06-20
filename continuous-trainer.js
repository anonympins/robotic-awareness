#!/usr/bin/env node

import { GNeuroMoE, SyntaxAnalyzer } from './neuro-lib.js';
import fs from 'node:fs';
import path from 'node:path';

const EXPERTS_DIR = './experts_chunks/';

async function main() {
    // --- NOUVEAU : Gestion de l'option --local ---
    const args = process.argv.slice(2);
    const useLocalCorpus = args.includes('--local');

    /**
     * Fonction d'entraînement sur un corpus local (fichiers .txt)
     * @param {GNeuroMoE} moe L'instance du Mixture of Experts
     * @param {string} corpusType 'wikipedia' ou 'le_robert'
     * @param {number} weight Poids de l'apprentissage
     */
    async function runLocalTraining(moe, corpusType, weight) {
        const corpusDir = `./training_corpus/${corpusType}/`;
        if (!fs.existsSync(corpusDir)) {
            console.log(`\x1b[33m[LOCAL] Répertoire corpus '${corpusDir}' non trouvé. Saut.\x1b[0m`);
            return;
        }
        const files = fs.readdirSync(corpusDir);
        if (files.length === 0) {
            console.log(`\x1b[33m[LOCAL] Corpus '${corpusType}' est vide. Saut.\x1b[0m`);
            return;
        }

        // Sélection d'un fichier aléatoire dans le corpus
        const file = files[Math.floor(Math.random() * files.length)];
        const filePath = path.join(corpusDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Le nom du fichier (sans extension) sert de pseudo-titre pour le routage
        const title = path.basename(file, '.txt').replace(/_/g, ' ');

        console.log(`\n\x1b[32m[LOCAL]\x1b[0m Entraînement sur '${file}'...`);

        // Logique de routage et d'apprentissage (similaire aux scripts de scraping)
        const highImpact = title.toLowerCase().match(/[a-z0-9àâäéèêëïîôöùûüç]{4,}/g) || [];
        const domain = moe.route(title + " " + content.slice(0, 500), highImpact);
        console.log(`[MoE] Domaine détecté : \x1b[33m${domain.toUpperCase()}\x1b[0m`);

        const brain = moe.getExpert(domain);
        const STORAGE_PATH = `./experts_chunks/expert_${domain}.gnr`;

        if (!brain.hasBeenLoaded && fs.existsSync(STORAGE_PATH)) {
            console.log(`[MoE] Chargement du chunk : ${domain}`);
            brain.importState(fs.readFileSync(STORAGE_PATH));
            brain.hasBeenLoaded = true;
        }

        const start = Date.now();
        brain.learnText(content, true, weight);
        const duration = Date.now() - start;

        console.log(`Apprentissage local terminé en ${duration}ms.`);
    }

    // --- Fin des nouvelles fonctions ---

    // Importation dynamique seulement si nécessaire (pour ne pas charger les scrapers en mode --local)
    let runWikipediaTraining, runRobertTraining;
    if (!useLocalCorpus) {
        ({ runWikipediaTraining } = await import('./train-wikipedia.js'));
        ({ runRobertTraining } = await import('./train-le-robert.js'));
    }

    console.log("\x1b[35m%s\x1b[0m", "=== G-NEURO CONTINUOUS TRAINER : LOCAL DIAGNOSTIC ===");
    
    // Vérification de l'environnement local
    const nodeVersion = process.versions.node.split('.')[0];
    if (parseInt(nodeVersion) < 18) {
        console.error("\x1b[31m[ERREUR]\x1b[0m Node.js v18 ou supérieur est requis. Version actuelle :", process.version);
        process.exit(1);
    }

    if (!useLocalCorpus && !fs.existsSync('./train-wikipedia.js')) {
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
            if (useLocalCorpus) {
                console.log("\x1b[36m[MODE] Entraînement sur le corpus local.\x1b[0m");
                // En mode local, on alterne aussi entre les deux sources
                if (cycleCount % 2 === 0) {
                    await runLocalTraining(moe, 'le_robert', 8);
                } else {
                    await runLocalTraining(moe, 'wikipedia', 5);
                }
            } else {
                // Comportement normal : scraping en ligne
                if (cycleCount % 2 === 0) await runRobertTraining(moe);
                else await runWikipediaTraining(moe);
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
            console.error(`\x1b[31m[ERREUR CYCLE #${cycleCount}]\x1b[0m`, trainErr.message);
            console.error(trainErr.message);
            console.log("Attente de 10 secondes avant nouvelle tentative...");
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        cycleCount++;
    }
}

main().catch(err => console.error("\x1b[31m[CRASH TRAINER]\x1b[0m", err));