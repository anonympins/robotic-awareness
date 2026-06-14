import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";
import { scrapeRandomWikipediaContent } from "./wikipedia-scraper.js";
import { RobertGrammarManager } from "./train-grammar.js";
import fs from 'node:fs/promises';
import path from 'node:path';

const BACKUP_PATH = path.join(process.cwd(), 'semantic_brain_storage.json');
const SLEEP_INTERVAL = 5000; 

async function runWikipediaTraining() {
    console.log("\n[SYSTEM] === Démarrage de l'Ingestion Parallèle (Wiki + Robert) ===");
    
    const attention = new SemanticAttentionLayer();
    const brain = new SemanticRelationalMemory(12); // 12 pour capturer la structure grammaticale
    brain.attachAttention(attention);

    const grammarManager = new RobertGrammarManager();
    await grammarManager.init();

    // Tentative de chargement du backup existant
    try {
        const data = await fs.readFile(BACKUP_PATH, 'utf8');
        const state = JSON.parse(data);
        brain.importState(state);
        console.log(`[RESTORE] État précédent chargé : ${brain.vocabulary.size} mots connus.`);
    } catch (e) {
        console.log("[INIT] Aucun backup trouvé. Démarrage à zéro.");
    }

    let pagesProcessed = 0;

    while (true) {
        try {
            pagesProcessed++;
            console.log(`\n--- Cycle #${pagesProcessed} | Time: ${new Date().toLocaleTimeString()} ---`);
            
            // --- REQUETES PARALLELES (I/O) ---
            process.stdout.write("[NETWORK] Récupération simultanée... ");
            const [wikiRes, robertRes] = await Promise.all([
                scrapeRandomWikipediaContent().catch(() => null),
                grammarManager.getNextBatch().catch(() => null)
            ]);
            console.log("OK.");

            // --- INGESTION WIKIPEDIA ---
            if (wikiRes) {
                const cleanWiki = wikiRes.content
                    .replace(/<[^>]*>?|==.*?==|\[\d+\]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                process.stdout.write(`   [INGESTION] Wiki: "${wikiRes.title}"... `);
                const start = Date.now();
                brain.learnText(cleanWiki);
                console.log(`${Date.now() - start}ms`);
            }

            // --- INGESTION ROBERT (GRAMMAIRE) ---
            if (robertRes) {
                process.stdout.write(`   [INGESTION] Robert: "${robertRes.path}"... `);
                const start = Date.now();
                brain.learnText(robertRes.content);
                console.log(`${Date.now() - start}ms`);
            } else {
                console.log("   [INFO] Robert : File d'attente vide ou fin du guide atteinte.");
            }

            // OPTIMISATION MATH : Sauvegarde asynchrone et moins fréquente pour ne pas bloquer l'ingestion
            if (pagesProcessed % 5 === 0) {
                process.stdout.write("[STORAGE] Persistence sur disque... ");
                const brainState = brain.exportState();
                await fs.writeFile(BACKUP_PATH, JSON.stringify(brainState));
                await grammarManager.saveState();
                console.log("OK.");
            }

            // Statistiques de santé du réseau
            console.log(`[BILAN] Vocab: ${brain.vocabulary.size} | Mémoire: ${brain.bitEngine.memorySize} relations.`);

            // Petit test de santé aléatoire sur le savoir acquis
            if (pagesProcessed % 5 === 0) {
                console.log("\n[DIAGNOSTIC] Test de cohérence interne...");
                const randomWords = Array.from(brain.vocabulary.keys());
                const seed = randomWords[Math.floor(Math.random() * randomWords.length)];
                const check = brain.predictSense(seed, 10, { creativity: 0.1 });
                console.log(`   Inspiration sur "${seed}" : ${seed} ${check}`);
            }

        } catch (err) {
            console.error(`\n[ERREUR CYCLE] : ${err.message}`);
            console.log("Tentative de reconnexion dans 30 secondes...");
            await new Promise(r => setTimeout(r, 30000));
            continue;
        }

        await new Promise(r => setTimeout(r, SLEEP_INTERVAL));
    }
}

runWikipediaTraining();