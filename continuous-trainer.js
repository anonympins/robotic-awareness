#!/usr/bin/env node

import { GNeuroMoE, SyntaxAnalyzer } from './neuro-lib.js';
import fs from 'node:fs';
import path from 'node:path';

const EXPERTS_DIR = './experts_chunks/';

// --- NOUVEAU : Curseur pour la lecture séquentielle du corpus local ---
let localCorpusCursor = 0;

async function main() {
    // --- NOUVEAU : Gestion de l'option --local ---
    const args = process.argv.slice(2);
    let useLocalCorpus = args.includes('--local');

    /**
     * Fonction d'entraînement sur un corpus local (fichiers .txt)
     * MODIFIÉ : Lit un segment aléatoire du corpus unifié `training_corpus.txt`.
     * @param {GNeuroMoE} moe L'instance du Mixture of Experts
     * @param {number} weight Poids de l'apprentissage
     */
    async function runLocalTraining(moe, weight) {
        const CORPUS_PATH = './training_corpus.txt';
        if (!fs.existsSync(CORPUS_PATH)) {
            console.log(`\x1b[33m[LOCAL] Fichier corpus '${CORPUS_PATH}' non trouvé. Saut.\x1b[0m`);
            return true; // On considère l'entraînement local "terminé" si le fichier n'existe pas.
        }

        // Lecture asynchrone pour ne pas bloquer sur de gros fichiers
        const stats = await fs.promises.stat(CORPUS_PATH);
        let chunkSize = 1024 * 256; // 256 KB par cycle

        // Si le curseur est à la fin, on signale la fin de l'entraînement local.
        if (localCorpusCursor >= stats.size) {
            console.log(`\x1b[32m[LOCAL]\x1b[0m Fin du corpus local atteinte.`);
            return true; // Signal pour basculer en mode crawling.
        }

        const startPos = localCorpusCursor;

        // Ajuster la taille du chunk pour ne pas lire au-delà de la fin du fichier
        const remainingBytes = stats.size - startPos;
        chunkSize = Math.min(chunkSize, remainingBytes);

        const buffer = Buffer.alloc(chunkSize);
        const fileHandle = await fs.promises.open(CORPUS_PATH, 'r');
        const { bytesRead } = await fileHandle.read(buffer, 0, chunkSize, startPos);
        await fileHandle.close();

        // Mise à jour du curseur pour le prochain cycle
        localCorpusCursor += bytesRead;

        // On cherche le début et la fin de phrases complètes dans le segment pour un apprentissage propre
        let content = buffer.toString('utf-8');
        const firstSentenceEnd = content.search(/(?<=[.!?])\s/);
        const lastSentenceStart = content.lastIndexOf('.', content.length - 2);

        if (firstSentenceEnd !== -1 && lastSentenceStart > firstSentenceEnd) {
            content = content.substring(firstSentenceEnd + 1, lastSentenceStart + 1);
        }
        
        const title = "Corpus Local"; // Titre générique pour le routage

        const progressPercentage = ((startPos + bytesRead) / stats.size * 100).toFixed(2);
        console.log(`\n\x1b[32m[LOCAL]\x1b[0m Entraînement sur un segment du corpus (Progression: ${progressPercentage}%)`);

        // --- CORRECTIF : Vérifier que le contenu n'est pas vide après le découpage ---
        if (content.trim().length < 10) {
            console.log(`\x1b[33m[LOCAL] Segment de contenu trop court ou vide après nettoyage. Saut.\x1b[0m`);
            return false; // On continue le parcours du fichier.
        }

        const start = Date.now();
        // --- NOUVELLE LOGIQUE : Utilisation de la méthode d'apprentissage centralisée ---
        const { report, modifiedExperts } = moe.learnWithSpecialization(content, { weight: weight, secondary_weight: 0.05 });
        const duration = Date.now() - start;

        // Log plus détaillé sur les experts qui ont appris
        for (const domain of modifiedExperts) {
            console.log(`  \x1b[2m> Expert [${domain}] a appris ${report[domain].sentences} phrases.\x1b[0m`);
        }

        console.log(`\x1b[2mApprentissage local terminé en ${duration}ms.\x1b[0m`);

        return false; // L'entraînement local n'est pas terminé.
    }

    // --- Fin des nouvelles fonctions ---

    // Importation dynamique seulement si nécessaire (pour ne pas charger les scrapers en mode --local)
    let runWikipediaTraining;

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

    // --- CORRECTIF : Pré-chargement des experts existants ---
    // On parcourt le répertoire des experts pour charger l'état de chaque chunk.
    // Cela garantit que l'entraînement continue sur la grammaire existante au lieu de la réinitialiser.
    console.log("[INFO] Pré-chargement des chunks d'experts existants...");
    const expertFiles = fs.readdirSync(EXPERTS_DIR).filter(f => f.startsWith('expert_') && f.endsWith('.gnr'));
    for (const file of expertFiles) {
        const domain = file.replace('expert_', '').replace('.gnr', '');
        const expert = moe.getExpert(domain); // Crée ou récupère l'instance
        const expertPath = path.join(EXPERTS_DIR, file);
        console.log(`  > Chargement de la grammaire pour '${domain}'...`);
        expert.importBinary(fs.readFileSync(expertPath));
        expert.hasBeenLoaded = true; // Marque comme chargé pour éviter une relecture
    }

    let cycleCount = 1;

    while (true) {
        console.log(`\n\x1b[7m CYCLE #${cycleCount} \x1b[0m`);
        
        const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        console.log(`[STATS] RAM: ${memUsage.toFixed(2)}MB | Vocab: ${moe.sharedState.vocabulary.size} words`);
        
        if (cycleCount % 5 === 0) {
            console.log(`[INFO] Global Token Count: ${moe.sharedState.totalTokensProcessed}`);
            
            console.log(`\n\x1b[36m[SYNTAX] Analyse des structures émergentes...\x1b[0m`);

            // --- ÉROSION SYNAPTIQUE GLOBALE ---
            console.log(`\x1b[36m[MAINTENANCE] Application de l'érosion synaptique (oubli)... \x1b[0m`);
            moe.experts.forEach(expert => expert._applySynapticDecay(0.98));

            // --- NOUVEAU : TÂCHE DE FOND - RÉSONANCE SÉMANTIQUE ---
            console.log(`\x1b[36m[MAINTENANCE] Lancement de la résonance sémantique (consolidation des concepts)... \x1b[0m`);
            moe.sharedState.attention.propagateResonance(0.1, 0.2);
            console.log(`  > Graphe de concepts consolidé. Liens actuels: ${moe.sharedState.attention.correlationMatrix.size}`);

            // On ne parcourt que les experts actuellement chargés en mémoire
            const activeExperts = Array.from(moe.experts.entries()).filter(([_, expert]) => expert.grammarMap.size > 0);
            if (activeExperts.length === 0) {
                console.log("  > Aucun expert actif avec une grammaire à analyser pour ce cycle.");
            }

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
                const isLocalTrainingDone = await runLocalTraining(moe, 5);
                if (isLocalTrainingDone) {
                    console.log("\x1b[32m[MODE]\x1b[0m Entraînement local terminé. Basculement vers le crawling en ligne.");
                    useLocalCorpus = false;
                    // --- CORRECTIF : On importe le scraper Wikipedia SEULEMENT maintenant ---
                    if (!runWikipediaTraining) {
                        console.log("[INFO] Chargement du module de crawling Wikipedia...");
                        ({ runWikipediaTraining } = await import('./train-wikipedia.js'));
                    }
                }
            } else {
                // Si on démarre directement en mode crawling, on s'assure que le module est chargé
                if (!runWikipediaTraining) {
                    ({ runWikipediaTraining } = await import('./train-wikipedia.js'));
                }
                // Entraînement sur Wikipedia
                await runWikipediaTraining(moe);
            }

            // Sauvegarde de l'état des experts pour query-brain.js
            console.log(`[INFO] Sauvegarde des experts sur le disque...`);
            for (const [domain, expert] of moe.experts) {
                // On ne sauvegarde que si l'expert a réellement appris quelque chose
                if (expert.grammarMap.size === 0) {
                    console.log(`\x1b[2m[INFO] L'expert '${domain}' est vide, pas de sauvegarde.\x1b[0m`);
                    continue;
                }

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