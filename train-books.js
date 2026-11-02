import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";
import https from 'node:https';
import fs from 'node:fs';

const STORAGE_PATH = "./semantic_brain_storage.json";
const STATS_FILE = "./training_stats.json";
const BUFFER_FILE = "./books_buffer.json";
const CORPUS_FILE = "./training_corpus.txt";
const MAX_REQ_PER_DAY = 1000;
const API_KEY = "98a15debbamshe9df2d2d7110b0dp1a3943jsnf572cde81f13";
const API_HOST = "project-gutenberg-free-books-api1.p.rapidapi.com";

const NOVEL_AUTHORS = [
    "Jules Verne",
    "Emile Zola",
    "Alexandre Dumas",
    "Victor Hugo",
    "Gustave Flaubert",
    "Guy de Maupassant",
    "Honore de Balzac",
    "Stendhal",
    "Gaston Leroux",
    "Maurice Leblanc",
    "George Sand",
    "Alphonse Daudet"
];

// Détection stricte des résidus bibliques (versets, abréviations de livres, généalogies)
const BIBLICAL_GARBLED_REGEX = /(\[?\s*_\d+_\s*\]?|\b\d+_[a-z]|\b[iIvVxX]+_(?:sam|reis|chr|cor|tim|pedro|joao|thess)\b|\b(?:samuel|david|saul|jerusalem|israel|judah|ephraim|levitas?|filhos?_de|gerou_?a?|amminadab|onam|peleth|arphaxad|sephi|merari|joab|elias|salomao)\b)/i;

// Mots caractéristiques du portugais / espagnol à exclure
const FOREIGN_PORTUGUESE_REGEX = /\b(não|pães|mão|porém|estava|estavam|foram|tinha|tinham|minha|meu|teu|tua|disse|disseram|então|filho|filhos|filha|rei|reis|casa|pelo|pela|dos|das|aos|seus|suas|dele|deles|dela|delas|você|também|quando|muito|eram|está|estão|são|senão|ainda|depois|onde|mesmo|outro|outra|outros)\b/i;

// Mots français de base obligatoires pour garantir un texte littéraire français
const FRENCH_STOPWORDS = /\b(le|la|les|un|une|des|du|de|ce|cette|ces|mon|ton|son|sa|ses|notre|votre|leur|leurs|il|elle|ils|elles|nous|vous|on|qui|que|quoi|dont|où|dans|sur|avec|pour|par|sans|sous|mais|ou|et|donc|or|ni|car|est|sont|était|étaient|fut|a|ont|avait|faire|fait)\b/i;

export function isGarbageOrBiblical(text = "") {
    if (!text || text.length < 10) return true;
    if (BIBLICAL_GARBLED_REGEX.test(text)) return true;
    if (FOREIGN_PORTUGUESE_REGEX.test(text)) return true;
    if (!FRENCH_STOPWORDS.test(text)) return true; // Rejette tout ce qui n'est pas du français

    // Trop de chiffres ou de crochets/tirets bas
    const digitCount = (text.match(/\d/g) || []).length;
    if (digitCount > 4 || digitCount / text.length > 0.15) return true;
    const underscoreCount = (text.match(/_/g) || []).length;
    if (underscoreCount > 3) return true;

    return false;
}

function sanitizeNovelSentence(raw = "") {
    return raw
        .replace(/\[\s*_\d+_?\s*\]/g, "")
        .replace(/\[\d+\]/g, "")
        .replace(/_\w+_/g, (m) => m.replace(/_/g, ""))
        .replace(/\b\d+_[a-z]\b/gi, "")
        .replace(/[’']/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

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

    let query = `roman ${NOVEL_AUTHORS[Math.floor(Math.random() * NOVEL_AUTHORS.length)]}`;

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
            const booksOnPage = (searchResponse?.results || []).filter(book => {
                const title = book.title || "";
                return !isGarbageOrBiblical(title);
            });
            totalPages = searchResponse?.totalPages || 1; // Met à jour le nombre total de pages

            if (booksOnPage.length === 0) {
                console.log(`\x1b[34m[Books]\x1b[0m Aucune livre trouvé sur la page ${currentPage} pour "${query}".`);
                break; // Plus de livres sur cette page, ou fin des résultats
            }

            // 2. Récupération Parallèle : On remplit un buffer de textes avant l'entraînement lourd
            const pageTextBuffer = [];
            const BATCH_SIZE = 10;

            for (let i = 0; i < booksOnPage.length; i += BATCH_SIZE) {
                const currentStatsForBatch = getDailyStats();
                if (currentStatsForBatch.count + BATCH_SIZE > MAX_REQ_PER_DAY) {
                    console.log(`\x1b[33m[Books] Quota insuffisant pour le prochain lot. Bufferisation partielle.\x1b[0m`);
                    break;
                }

                const batch = booksOnPage.slice(i, i + BATCH_SIZE);
                console.log(`\x1b[34m[Books]\x1b[0m Récupération parallèle du lot ${Math.floor(i/BATCH_SIZE)+1}...`);
                
                const batchResults = await Promise.all(batch.map(async (book) => {
                    try {
                        const textData = await fetchFromRapidAPI(`/books/${book.id}/text?cleaning_mode=simple`);
                        return { title: book.title, text: textData.text || textData.content || "" };
                    } catch (e) {
                        return { title: book.title, text: "" };
                    }
                }));

                pageTextBuffer.push(...batchResults.filter(b => b.text.length > 100));
            }

            // 3. Traitement Séquentiel CPU : On entraîne le cerveau sur les données sécurisées en mémoire
            console.log(`\x1b[34m[Books]\x1b[0m Début de l'entraînement lourd sur ${pageTextBuffer.length} livres sécurisés...`);
            
            for (const bookData of pageTextBuffer) {
                const cleanBookText = bookData.text
                    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");

                const subPhrases = cleanBookText.split(/(?<=[.!,?;])(?:\s+|\n+|$)/)
                    .map(s => s.trim())
                    .filter(s => {
                        if (s.length < 3) return false;
                        const clean = sanitizeNovelSentence(s);
                        if (isGarbageOrBiblical(clean)) return false;
                        const tokens = s.match(brain.tokenizer) || [];
                        return tokens.length >= 2;
                    });

                const iterations = 30;
                console.log(`\x1b[32m[CPU]\x1b[0m Apprentissage Verbatim : "${bookData.title}" (${subPhrases.length} segments)`);

                for (let i = 0; i < iterations; i++) {
                    // Mélange pour éviter les biais de linéarité
                    subPhrases.sort(() => Math.random() - 0.5);
                    subPhrases.forEach(phrase => {
                        brain.learnSense(phrase, true, 1);
                    });
                }
            }
            booksProcessedCount += pageTextBuffer.length;

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

function loadBuffer() {
    if (!fs.existsSync(BUFFER_FILE)) return [];
    try {
        const raw = JSON.parse(fs.readFileSync(BUFFER_FILE, 'utf8'));
        if (!Array.isArray(raw)) return [];
        const cleaned = raw.map(sanitizeNovelSentence).filter(s => !isGarbageOrBiblical(s));
        // Si le buffer était corrompu par la Bible portugaise, on le purge immédiatement
        if (raw.length > 0 && cleaned.length / raw.length < 0.5) {
            console.log("\x1b[33m🧹 [Books] Purge du buffer pollué par les versets / textes étrangers.\x1b[0m");
            saveBuffer(cleaned);
        }
        return cleaned;
    } catch (_) {
        return [];
    }
}

function saveBuffer(buffer) {
    try {
        fs.writeFileSync(BUFFER_FILE, JSON.stringify(buffer), 'utf8');
    } catch (e) {
        console.warn("[Books] Erreur écriture buffer:", e.message);
    }
}

export async function getBatchFromBooks(targetCount = 10) {
    // 1. Priorité au réservoir local déjà téléchargé
    let buffer = loadBuffer();
    if (buffer.length >= targetCount) {
        const batch = buffer.splice(0, targetCount);
        saveBuffer(buffer);
        console.log(`📚 [Books] ${batch.length} phrases extraites du buffer local (${buffer.length} restantes en réserve).`);
        return batch;
    }

    const stats = getDailyStats();
    if (stats.count >= MAX_REQ_PER_DAY) {
        return [];
    }

    const author = NOVEL_AUTHORS[Math.floor(Math.random() * NOVEL_AUTHORS.length)];
    const query = `roman ${author}`;
    const tokenizer = /[a-z0-9àâäéèêëïîôöùûüç_]+|[^\w\s]/gi;

    try {
        const searchResponse = await fetchFromRapidAPI(`/books?search=${encodeURIComponent(query)}&page=1&limit=10`);
        const books = (searchResponse?.results || []).filter(book => {
            const title = book.title || "";
            return !isGarbageOrBiblical(title);
        });
        if (books.length === 0) return [];

        const randomBook = books[Math.floor(Math.random() * books.length)];
        const textData = await fetchFromRapidAPI(`/books/${randomBook.id}/text?cleaning_mode=simple`);
        const rawText = textData.text || textData.content || "";
        if (rawText.length < 100) return [];

        const cleanBookText = rawText
            .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
            .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");

        try {
            const fileStats = await fs.promises.stat(CORPUS_FILE).catch(() => ({ size: 0 }));
            if (fileStats.size < 1024 * 1024 * 1024) {
                await fs.promises.appendFile(CORPUS_FILE, `${randomBook.title}\n${cleanBookText}\n\n`, 'utf-8');
            }
        } catch (_) {}

        const rawSentences = cleanBookText.split(/(?<=[.!?])\s+/);
        const newSentences = [];
        for (const raw of rawSentences) {
            const s = sanitizeNovelSentence(raw);
            const words = s.match(tokenizer) || [];
            if (words.length >= 5 && words.length <= 30 && !isGarbageOrBiblical(s)) {
                newSentences.push(s);
            }
        }

        if (newSentences.length > 0) {
            buffer.push(...newSentences);
            console.log(`📚 [Books] "${randomBook.title}" : ${newSentences.length} phrases ajoutées au buffer.`);
            const batch = buffer.splice(0, targetCount);
            saveBuffer(buffer);
            return batch;
        }

    } catch (e) {
        return [];
    }
}