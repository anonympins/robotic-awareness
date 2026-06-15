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
    if (stats.count + 2 > MAX_REQ_PER_DAY) {
        console.log(`\x1b[33m[Books] Quota journalier atteint (${stats.count}/${MAX_REQ_PER_DAY}). Repos.\x1b[0m`);
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

    try {
        console.log(`\x1b[34m[Books]\x1b[0m Recherche de : ${query}...`);

        // 1. Recherche par mot-clé pour varier l'apprentissage
        const search = await fetchFromRapidAPI(`/books?search=${encodeURIComponent(query)}`);
        const books = search?.results || [];
        if (books.length === 0) throw new Error("Impossible de récupérer la liste des livres");

        const book = books[Math.floor(Math.random() * books.length)];
        console.log(`\x1b[34m[Books]\x1b[0m Lecture de : "${book.title}"`);

        // 2. Récupération du texte nettoyé directement via l'API
        const textData = await fetchFromRapidAPI(`/books/${book.id}/text?cleaning_mode=simple`);
        const text = textData.text || textData.content || "";

        if (!text) throw new Error("Contenu textuel indisponible");
        
        // 3. Découpage optimisé pour l'apprentissage relationnel
        const limit = 100000; 
        const cleanContent = text.substring(0, limit)
            .replace(/\r\n|\r|\n/g, ' ') // Supprime les sauts de ligne physiques
            .replace(/\s+/g, ' ');       // Normalise les espaces

        // Capture les phrases se terminant par . ! ou ? suivis d'un espace ou fin de texte
        const sentences = (cleanContent.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [])
            .map(s => s.trim())
            .filter(s => s.length > 25 && s.length < 400) // Taille idéale pour capturer un "sens" complet sans saturer
            .filter(s => !s.toLowerCase().includes("gutenberg") && !s.includes("http")); // Nettoyage du bruit légal/URL

        console.log(`\x1b[34m[Books]\x1b[0m Apprentissage de ${sentences.length} phrases.`);

        // 4. Sauvegarde dans le corpus global (format texte brut)
        fs.appendFileSync(CORPUS_FILE, sentences.join('\n') + '\n', 'utf8');

        let count = 0;
        for (const sentence of sentences) {
            brain.learnSense(sentence);
            count++;
        }
        fs.writeFileSync(STORAGE_PATH, JSON.stringify(brain.exportState()));
        console.log("\x1b[32m[Books] Succès : Mémoire littéraire mise à jour.\x1b[0m");
    } catch (err) {
        console.error("\x1b[31m[Books] Erreur cycle :\x1b[0m", err.message);
    }
}