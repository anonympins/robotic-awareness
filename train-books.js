import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";
import https from 'node:https';
import fs from 'node:fs';

const STORAGE_PATH = "./semantic_brain_storage.json";
const STATS_FILE = "./training_stats.json";
const CORPUS_FILE = "./training_corpus.txt";
const MAX_REQ_PER_DAY = 1000;
const API_KEY = "98a15debbamshe9df2d2d7110b0dp1a3943jsnf572cde81f13";
const API_HOST = "project-gutenberg-free-books-api1.p.rapidapi.com";

function getDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    if (!fs.existsSync(STATS_FILE)) return { date: today, count: 0 };
    try {
        const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        if (stats.date !== today) return { date: today, count: 0 };
        return stats;
    } catch (e) {
        return { date: today, count: 0 };
    }
}

function incrementQuota(amount = 1) {
    const stats = getDailyStats();
    stats.count += amount;
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

async function fetchFromRapidAPI(path) {
    incrementQuota(1);
    return new Promise((resolve, reject) => {
        const options = {
            method: 'GET',
            hostname: API_HOST,
            path: path,
            headers: {
                'x-rapidapi-key': API_KEY,
                'x-rapidapi-host': API_HOST,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error("Échec du parsing JSON RapidAPI"));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

export async function runBookTraining() {
    const stats = getDailyStats();
    if (stats.count >= MAX_REQ_PER_DAY) {
        console.log(`\x1b[33m[Books] Quota journalier déjà atteint (${stats.count}/${MAX_REQ_PER_DAY}). Repos.\x1b[0m`);
        return;
    }

    console.log(`\x1b[34m[Books]\x1b[0m Cycle Gutenberg (${stats.count}/1000)...`);
    const brain = new SemanticRelationalMemory(16);
    const attention = new SemanticAttentionLayer();
    brain.attachAttention(attention);

    if (fs.existsSync(STORAGE_PATH)) {
        brain.importState(JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8')));
    }

    const keywords = ["Shakespeare", "Plato", "Dante", "Tolstoy", "Twain", "Homer", "History", "Philosophy"];
    let query = keywords[Math.floor(Math.random() * keywords.length)];

    let currentPage = 1;
    let totalPages = 1; // Sera mis à jour après le premier appel de recherche
    const pageSize = 50; // Nombre de livres par page, à ajuster selon l'API
    let booksProcessedCount = 0;

    try {
        console.log(`\x1b[34m[Books]\x1b[0m Recherche de : ${query}...`);

        do {
            const currentStats = getDailyStats(); // Récupère les stats à jour
            // Vérifie si on a assez de quota pour au moins une requête (page de recherche)
            if (currentStats.count + 1 > MAX_REQ_PER_DAY) {
                console.log(`\x1b[33m[Books] Quota journalier presque atteint (${currentStats.count}/${MAX_REQ_PER_DAY}). Arrêt de la pagination.\x1b[0m`);
                break; // Arrête la pagination si le quota est presque atteint
            }

            console.log(`\x1b[34m[Books]\x1b[0m Chargement de la page ${currentPage}/${totalPages} pour "${query}"...`);
            // 1. Recherche par mot-clé avec pagination
            const searchResponse = await fetchFromRapidAPI(`/books?search=${encodeURIComponent(query)}&page=${currentPage}&limit=${pageSize}`);
            const booksOnPage = searchResponse?.results || [];
            totalPages = searchResponse?.totalPages || 1; // Met à jour le nombre total de pages

            if (booksOnPage.length === 0) {
                console.log(`\x1b[34m[Books]\x1b[0m Aucune livre trouvé sur la page ${currentPage} pour "${query}".`);
                break; // Plus de livres sur cette page, ou fin des résultats
            }

            for (const book of booksOnPage) {
                const currentStatsForBook = getDailyStats(); // Récupère les stats à jour avant chaque livre
                // Vérifie si on a assez de quota pour la requête de contenu du livre
                if (currentStatsForBook.count + 1 > MAX_REQ_PER_DAY) {
                    console.log(`\x1b[33m[Books] Quota journalier presque atteint (${currentStatsForBook.count}/${MAX_REQ_PER_DAY}). Arrêt du traitement des livres.\x1b[0m`);
                    break; // Arrête le traitement des livres sur cette page
                }

                console.log(`\x1b[34m[Books]\x1b[0m Lecture de : "${book.title}" (ID: ${book.id})...`);
                // 2. Récupération du texte nettoyé directement via l'API
                const textData = await fetchFromRapidAPI(`/books/${book.id}/text?cleaning_mode=simple`);
                const text = textData.text || textData.content || "";

                if (!text) {
                    console.warn(`\x1b[33m[Books] Contenu textuel indisponible pour "${book.title}".\x1b[0m`);
                    continue; // Passe au livre suivant
                }
                
                // 3. Utilisation de learnText de neuro-lib.js pour un apprentissage optimisé
                // Le paramètre 'continuous: true' permet de garder le contexte entre les phrases du même livre
                brain.learnText(text, true);
                booksProcessedCount++;
                console.log(`\x1b[32m[Books] Apprentissage de "${book.title}" terminé. Livres traités: ${booksProcessedCount}.\x1b[0m`);
            }

            currentPage++;
            // Si la boucle interne a été interrompue à cause du quota, on sort aussi de la boucle de pagination
            if (getDailyStats().count + 1 > MAX_REQ_PER_DAY) break;

        } while (currentPage <= totalPages);

        console.log(`\x1b[32m[Books] Apprentissage terminé sur ${booksProcessedCount} livres (ou quota atteint).\x1b[0m`);
        fs.writeFileSync(STORAGE_PATH, JSON.stringify(brain.exportState()));
        console.log("\x1b[32m[Books] État de la mémoire littéraire sauvegardé.\x1b[0m");
    } catch (err) {
        console.error("\x1b[31m[Books] Erreur cycle :\x1b[0m", err.message);
    }
}