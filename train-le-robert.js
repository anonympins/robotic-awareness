import { SemanticAttentionLayer } from "./neuro-lib.js";
import { getRandomRobertPage } from "./le-robert-scraper.js";
import fs from 'node:fs';

export async function runRobertTraining(moe) {
    try {
        console.log("\n[1/3] Exploration du Guide Le Robert...");
        const { title, content: htmlContent } = await getRandomRobertPage();

        // Nettoyage agressif des balises et du boilerplate spécifique au Robert
        const content = htmlContent.replace(/<[^>]*>?/gm, '');
        
        let cleanContent = content
            .replace(/Le Robert|Dico en ligne|Découvrir|Abonnement|Boutique|Le Robert Correcteur/gi, '')
            .replace(/Guide de la langue française|Définitions|Synonymes|Conjugaison/gi, '')
            .replace(/Paramétrer les cookies|Tous droits réservés|Contact|Mentions légales/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (cleanContent.length < 100) {
            console.log("⚠️ Page trop courte ou vide après nettoyage. Abandon.");
            return;
        }

        // Identification des mots clés pour le routage (ex: grammaire, orthographe)
        const localTokens = cleanContent.toLowerCase().match(/[a-z0-9àâäéèêëïîôöùûüç]{4,}/g) || [];
        const titleLower = title.toLowerCase();
        const highImpact = localTokens.filter(t => titleLower.includes(t));

        // Routage MoE
        const domain = moe.route("Robert " + title + " " + cleanContent.slice(0, 300), highImpact);
        console.log(`[MoE] Domaine Robert : \x1b[34m${domain.toUpperCase()}\x1b[0m (Sujet: ${title})`);
        
        const brain = moe.getExpert(domain);
        const STORAGE_PATH = `./experts_chunks/expert_${domain}.gnr`;

        if (!brain.hasBeenLoaded && fs.existsSync(STORAGE_PATH)) {
            brain.importState(fs.readFileSync(STORAGE_PATH));
            brain.hasBeenLoaded = true;
        }

        const attention = new SemanticAttentionLayer();
        brain.attachAttention(attention);

        console.log(`[2/3] Apprentissage linguistique de ${cleanContent.length} caractères...`);
        
        const start = Date.now();
        // Poids d'apprentissage élevé (8) car le contenu du Robert est une "vérité" grammaticale
        brain.learnText(cleanContent, true, 8); 
        const duration = Date.now() - start;
        
        fs.writeFileSync(STORAGE_PATH, brain.exportBinary());
        console.log(`Apprentissage Robert terminé en ${duration}ms.`);

    } catch (err) {
        console.error("❌ Échec de l'entraînement Robert :", err.message);
    }
}