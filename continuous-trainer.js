import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";
import { scrapeRandomWikipediaContent } from "./wikipedia-scraper.js";
import { RobertScraper } from "./robert-scraper.js";
import fs from "node:fs";

const STORAGE_PATH = "./semantic_brain_storage.json";

async function main() {
    const brain = new SemanticRelationalMemory(12); // Contexte de 12 tokens
    const attention = new SemanticAttentionLayer();
    const robert = new RobertScraper();
    
    brain.attachAttention(attention);

    // Chargement si existant
    if (fs.existsSync(STORAGE_PATH)) {
        console.log("[Système] Restauration du cerveau existant...");
        brain.importState(JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8')));
    }

    console.log("=== DÉMARRAGE DE L'ENTRAÎNEMENT CONTINU (WIKI + ROBERT) ===");

    let cycle = 1;

    while (true) {
        console.log(`\n--- Cycle #${cycle} ---`);
        
        try {
            // 1. Lancement des deux scrapers en PARALLÈLE
            const [wikiData, robertData] = await Promise.all([
                scrapeRandomWikipediaContent().catch(e => null),
                robert.getRandomGuide().catch(e => null)
            ]);

            // 2. Traitement Wikipédia (Culture / Faits)
            if (wikiData) {
                const cleanWiki = cleanText(wikiData.content);
                console.log(`[Apprentissage] Wiki: "${wikiData.title}" (${cleanWiki.length} chars)`);
                // Poids 20 pour une mémorisation forte en une passe
                brain.learnText(cleanWiki, false, 20);
            }

            // 3. Traitement Le Robert (Grammaire / Orthographe)
            if (robertData) {
                const cleanRobert = cleanText(robertData.content);
                console.log(`[Apprentissage] Robert: "${robertData.title}" (${cleanRobert.length} chars)`);
                // On "grave" encore plus fort les règles de grammaire (Poids 30)
                brain.learnText(cleanRobert, false, 30);
            }

            // 4. Consolidation (Résonance sémantique)
            // Une seule fois par cycle pour éviter de saturer le CPU
            console.log("[Système] Consolidation des liens sémantiques...");
            attention.propagateResonance(0.15);

            // 5. Sauvegarde régulière
            if (cycle % 5 === 0) {
                console.log("[Système] Sauvegarde du maillage neuronal...");
                fs.writeFileSync(STORAGE_PATH, JSON.stringify(brain.exportState()));
            }

            console.log(`[État] Vocabulaire: ${brain.vocabulary.size} mots. Mémoire: ${brain.bitEngine.memorySize} relations.`);
            cycle++;

            // Petite pause pour laisser respirer le thread
            await new Promise(r => setTimeout(r, 1000));

        } catch (err) {
            console.error("⚠️ Erreur cycle :", err.message);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

/**
 * Nettoyage générique du bruit HTML et des références
 */
function cleanText(raw) {
    return raw
        .replace(/==.*?==/g, '')     // Titres Wiki
        .replace(/\[\d+\]/g, '')     // Citations [1]
        .replace(/\s+/g, ' ')        // Espaces doubles
        .replace(/[^\w\sàâäéèêëïîôöùûüç'.,!?;]/gi, ' ') // Caractères spéciaux
        .trim();
}

main().catch(console.error);