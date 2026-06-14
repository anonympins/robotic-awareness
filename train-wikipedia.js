import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";
import { scrapeRandomWikipediaContent } from "./wikipedia-scraper.js";
import fs from 'node:fs/promises';
import path from 'node:path';

const BACKUP_PATH = path.join(process.cwd(), 'semantic_brain_storage.json');
const SLEEP_BETWEEN_PAGES = 8000; // 8 secondes pour respecter Wikipédia

async function runWikipediaTraining() {
    console.log("\n[SYSTEM] === Démarrage du Service d'Apprentissage Continu ===");
    
    const attention = new SemanticAttentionLayer();
    const brain = new SemanticRelationalMemory(8); // Réduction de 16 à 8 pour stabiliser la RAM
    brain.attachAttention(attention);

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
            
            console.log("[1/4] Scraping Wikipédia...");
            const { title, content: htmlContent } = await scrapeRandomWikipediaContent();

            // OPTIMISATION FLUX : Une seule passe regex pour nettoyer les résidus HTML, titres et références
            // On délègue la tokenisation fine à la librairie neuro-lib
            const cleanContent = htmlContent
                .replace(/<[^>]*>?|==.*?==|\[\d+\]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            console.log(`[2/4] Ingestion : "${title}" (${cleanContent.length} chars)`);
            
            const start = Date.now();
            brain.learnText(cleanContent); 
            const duration = Date.now() - start;

            // OPTIMISATION MATH : Sauvegarde asynchrone et moins fréquente pour ne pas bloquer l'ingestion
            if (pagesProcessed % 5 === 0) {
                console.log("[3/4] Persistence sur disque...");
                const brainState = brain.exportState();
                await fs.writeFile(BACKUP_PATH, JSON.stringify(brainState));
            }

            // Statistiques de santé du réseau
            console.log(`[4/4] Bilan : ${duration}ms | Vocab: ${brain.vocabulary.size} | Mémoire: ${brain.bitEngine.memorySize} relations.`);

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

        await new Promise(r => setTimeout(r, SLEEP_BETWEEN_PAGES));
    }
}

runWikipediaTraining();