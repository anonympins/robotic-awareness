import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";
import { scrapeRandomWikipediaContent } from "./wikipedia-scraper.js";

async function runWikipediaTraining() {
    console.log("=== Initialisation du Cerveau Sémantique ===");
    const attention = new SemanticAttentionLayer();
    const brain = new SemanticRelationalMemory(16); // Contexte de 16 mots
    brain.attachAttention(attention);

    try {
        console.log("\n[1/3] Récupération d'une page aléatoire...");
        const { title, content: htmlContent } = await scrapeRandomWikipediaContent();

        // Nettoyage des balises HTML pour obtenir du texte brut traitable par le cerveau
        const content = htmlContent.replace(/<[^>]*>?/gm, '');
        
        const cleanContent = content
            .replace(/==.*?==/g, '') // Enlever les titres de section
            .replace(/\[\d+\]/g, '') // Enlever les références type [1], [2]
            .replace(/\(écoute\)/g, '') // Enlever les tags audio
            .replace(/\s+/g, ' ')    // Normaliser les espaces et sauts de ligne
            .trim();

        console.log(`[2/3] Apprentissage de ${cleanContent.length} caractères...`);
        
        const start = Date.now();
        // learnText découpe par phrases et gère l'ingestion bit à bit
        brain.learnText(cleanContent, true); 
        const duration = Date.now() - start;

        console.log(`Apprentissage terminé en ${duration}ms.`);
        console.log(`Vocabulaire acquis : ${brain.vocabulary.size} mots.`);

        console.log("\n[3/3] Test de prévision déterministe...");
        
        // Utilisation du tokenizer interne pour garantir la correspondance des IDs
        const allTokens = cleanContent.toLowerCase().match(brain.tokenizer) || [];
        
        // On prend les 4 premiers tokens significatifs comme amorce
        const amorceTokens = allTokens.slice(0, 4);
        const amorce = amorceTokens.join(' ');
        
        console.log(`Amorce : "${amorce}"`);

        // Prédiction avec une tolérance de score légèrement plus souple
        const prediction = brain.predictSense(amorce, 30, {
            creativity: 0.05,
            topK: 1,
            attention: attention
        });

        console.log(`${amorce} ${prediction}`);

        if (cleanContent.toLowerCase().includes(prediction.toLowerCase())) {
            console.log("\nStatut : ✅ Restitution fidèle au bit près.");
        } else {
            console.log("\nStatut : ⚠️ Le modèle a divergé (créativité ou collision d'IDs).");
        }

    } catch (err) {
        console.error("❌ Échec de l'entraînement :", err);
    }
}

runWikipediaTraining();