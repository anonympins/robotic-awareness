import { SemanticAttentionLayer } from "./neuro-lib.js";
import { scrapeRandomWikipediaContent } from "./wikipedia-scraper.js";
import fs from 'node:fs';
import { appendFile, stat } from 'node:fs/promises';

const TRAINING_CORPUS_PATH = 'training_corpus.txt';

export async function runWikipediaTraining(moe) {
    try {
        console.log("\n[1/3] Récupération d'une page aléatoire...");
        const { title, blocks } = await scrapeRandomWikipediaContent();

        if (!blocks || blocks.length === 0) {
            console.log("⚠️ Page vide ou sans blocs de contenu pertinents. Cycle sauté.");
            return;
        }

        // Le nettoyage se fait maintenant bloc par bloc, mais on peut créer un contenu global pour l'analyse et le corpus
        const fullCleanContent = blocks.map(block => {
            return block
                .replace(/\[\d+\]/g, '') // Enlever les références type [1], [2]
                .replace(/\(écoute\)/g, '') // Enlever les tags audio
                .replace(/Modifier le code|Creative Commons|licence CC-BY-SA|Consulter l'historique|Navigation|Rechercher|Portail de/gi, '')
                .replace(/\[modifier\]|\[modifier le code\]/gi, '');
        }).join(' ').replace(/\s+/g, ' ').trim();

        if (fullCleanContent.length < 100) {
            console.log("⚠️ Contenu trop court après nettoyage global. Cycle sauté.");
            return;
        }

        // --- Sauvegarde du contenu pour le corpus unifié ---
        try {
            const stats = await stat(TRAINING_CORPUS_PATH).catch(() => ({ size: 0 }));
            const ONE_GIGABYTE = 1024 * 1024 * 1024;
            if (stats.size < ONE_GIGABYTE) {
                const corpusEntry = `${title}\n${fullCleanContent}\n\n`;
                await appendFile(TRAINING_CORPUS_PATH, corpusEntry, 'utf-8');
                console.log(`\x1b[2m[CORPUS] Contenu de "${title}" ajouté au corpus principal.\x1b[0m`);
            } else {
                console.log(`\x1b[2m[CORPUS] Le fichier de corpus a atteint sa taille maximale. Pas d'ajout.\x1b[0m`);
            }
        } catch (e) {
            console.error(`\x1b[31m[CORPUS] Erreur lors de la sauvegarde : ${e.message}\x1b[0m`);
        }

        // --- ANALYSE D'IMPACT LOCAL POUR LE ROUTAGE ---
        // On identifie les mots clés de la page avant le routage
        const localTokens = fullCleanContent.toLowerCase().match(/[a-z0-9àâäéèêëïîôöùûüç]{4,}/g) || [];
        const localFreq = new Map();
        localTokens.forEach(t => localFreq.set(t, (localFreq.get(t) || 0) + 1));

        // Mots à haut impact : présents dans le titre OU répétés au moins 3 fois
        const titleLower = title.toLowerCase();
        const highImpact = Array.from(localFreq.keys()).filter(t => 
            titleLower.includes(t) || localFreq.get(t) >= 3
        );

        // --- ROUTAGE MOE ---
        const domain = moe.route(title + " " + fullCleanContent.slice(0, 500), highImpact);
        console.log(`[MoE] Domaine détecté : \x1b[33m${domain.toUpperCase()}\x1b[0m (Titre: ${title})`);
        
        const brain = moe.getExpert(domain);
        const STORAGE_PATH = `./experts_chunks/expert_${domain}.gnr`;

        // Chargement différé de l'expert depuis le disque si nécessaire
        if (!brain.hasBeenLoaded && fs.existsSync(STORAGE_PATH)) {
            console.log(`[MoE] Chargement du chunk : ${domain}`);
            brain.importState(fs.readFileSync(STORAGE_PATH));
            brain.hasBeenLoaded = true;
        }

        const attention = new SemanticAttentionLayer();
        brain.attachAttention(attention);

        console.log(`[2/3] Apprentissage (${domain}) de ${blocks.length} blocs de texte...`);
        
        const start = Date.now();
        // On ingère chaque bloc (titre ou paragraphe) individuellement
        for (const block of blocks) {
            const cleanBlock = block
                .replace(/\[\d+\]/g, '')
                .replace(/\(écoute\)/g, '')
                .trim();
            if (cleanBlock.length > 5) {
                brain.learnText(cleanBlock, true, 5);
            }
        }
        const duration = Date.now() - start;
        
        if (!fs.existsSync("./experts_chunks/")) fs.mkdirSync("./experts_chunks/");
        fs.writeFileSync(STORAGE_PATH, brain.exportBinary());

        console.log(`Apprentissage terminé en ${duration}ms.`);
        console.log(`Vocabulaire acquis : ${brain.vocabulary.size} mots.`);

    } catch (err) {
        console.error("❌ Échec de l'entraînement :", err);
    }
}