import { SemanticAttentionLayer } from "./neuro-lib.js";
import { getRandomRobertPage } from "./le-robert-scraper.js";
import fs from 'node:fs';
import { appendFile, stat } from 'node:fs/promises';

const TRAINING_CORPUS_PATH = 'training_corpus.txt';

export async function runRobertTraining(moe) {
    let attempts = 0;
    const MAX_ATTEMPTS = 1;

    while (attempts < MAX_ATTEMPTS) {
        try {
            console.log(`\n[1/3] Exploration du Guide Le Robert... (Tentative ${attempts + 1}/${MAX_ATTEMPTS})`);
            const page = await getRandomRobertPage();

            if (!page || !page.content) {
                console.log("⚠️ Aucune page n'a pu être récupérée depuis Le Robert. Nouvelle tentative...");
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 1000)); // Petite pause
                continue;
            }

            const { title, content: htmlContent } = page;

            // Nettoyage des blocs de code et des balises
            const content = htmlContent
                .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
                .replace(/<[^>]*>?/gm, '');
            
            let cleanContent = content
                .replace(/Le Robert|Dico en ligne|Découvrir|Abonnement|Boutique|Le Robert Correcteur/gi, '')
                .replace(/Guide de la langue française|Définitions|Synonymes|Conjugaison/gi, '')
                .replace(/Paramétrer les cookies|Tous droits réservés|Contact|Mentions légales/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

            if (cleanContent.length < 100) {
                console.log("⚠️ Page trop courte ou vide après nettoyage. Nouvelle tentative...");
                attempts++;
                continue;
            }

            // --- Sauvegarde du contenu pour le corpus unifié ---
            try {
                const stats = await stat(TRAINING_CORPUS_PATH).catch(() => ({ size: 0 }));
                const ONE_GIGABYTE = 1024 * 1024 * 1024;
                if (stats.size < ONE_GIGABYTE) {
                    const corpusEntry = `${title}\n${cleanContent}\n\n`;
                    await appendFile(TRAINING_CORPUS_PATH, corpusEntry, 'utf-8');
                    console.log(`\x1b[2m[CORPUS] Contenu de "${title}" ajouté au corpus principal.\x1b[0m`);
                } else {
                    console.log(`\x1b[2m[CORPUS] Le fichier de corpus a atteint sa taille maximale. Pas d'ajout.\x1b[0m`);
                }
            } catch (e) {
                console.error(`\x1b[31m[CORPUS] Erreur lors de la sauvegarde : ${e.message}\x1b[0m`);
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
            return; // Succès, on sort de la fonction

        } catch (err) {
            console.error("❌ Échec de l'entraînement Robert :", err.message);
            attempts++;
        }
    }
    console.log(`\x1b[33m[WARN] Impossible de récupérer une page valide du Robert après ${MAX_ATTEMPTS} tentatives. Cycle sauté.\x1b[0m`);
}