import https from 'node:https';
import { readFile, appendFile } from 'node:fs/promises';

const SCRAPED_PAGES_PATH = 'scraped_pages.txt';

async function getScrapedPages() {
    try {
        const data = await readFile(SCRAPED_PAGES_PATH, 'utf8');
        return new Set(data.split('\n'));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return new Set();
        }
        throw error;
    }
}

export async function scrapeRobertContent(path = '/guide') {
    const scrapedPages = await getScrapedPages();
    if (scrapedPages.has(path)) {
        console.log(`Page ${path} already scraped. Skipping.`);
        return null;
    }

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'dictionnaire.lerobert.com',
            path: path,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RoboticAwareness/1.0'
            }
        };

        const req = https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', async () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`Erreur HTTP: ${res.statusCode}`));
                }

                const sanitizedData = data
                    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");

                const titleMatch = sanitizedData.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
                const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : "Guide Robert";

                const contentMatch = sanitizedData.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                                   sanitizedData.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                                   sanitizedData.match(/<div role="main"[^>]*>([\s\S]*?)<\/div>/i) ||
                                   sanitizedData.match(/<div class="content"[^>]*>([\s\S]*?)<\/div>/i);
                
                const content = contentMatch ? contentMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';

                if (content) {
                    await appendFile(SCRAPED_PAGES_PATH, `${path}\n`);
                }

                const linkRegex = /href="(\/guide\/[^"]+)"/g;
                const internalLinks = [];
                let match;
                while ((match = linkRegex.exec(sanitizedData)) !== null) {
                    if (!internalLinks.includes(match[1])) internalLinks.push(match[1]);
                }

                resolve({ title, content, links: internalLinks });
            });
        });

        req.on('error', reject);
    });
}

export async function getRandomRobertPage() {
    // On scrape toujours la page racine pour avoir une liste de liens frais,
    // mais on ne traite pas son contenu si elle a déjà été visitée.
    const rootPage = await scrapeRobertContent('/guide');

    // Si la page racine a déjà été scrapée, scrapeRobertContent renvoie null.
    // On doit quand même récupérer les liens de cette page pour explorer plus loin.
    if (!rootPage) {
        console.log("Page racine déjà scrapée. Recherche d'un nouveau lien à explorer...");
        // On force une re-lecture de la page racine juste pour ses liens.
        const tempRoot = await scrapeRobertContent('/guide', true); // Le 'true' force le scraping
        if (tempRoot && tempRoot.links.length > 0) {
            // On choisit un lien au hasard parmi ceux de la page racine et on le scrape.
            const randomPath = tempRoot.links[Math.floor(Math.random() * tempRoot.links.length)];
            return await scrapeRobertContent(randomPath);
        }
        console.log("Impossible de trouver de nouveaux liens depuis la page racine.");
        return null;
    }

    // Si la page racine n'avait jamais été scrapée, on choisit un lien au hasard.
    if (rootPage.links && rootPage.links.length > 0) {
        let attempts = 0;
        while(attempts < 10) { // Limit attempts to avoid infinite loops
            const randomPath = rootPage.links[Math.floor(Math.random() * rootPage.links.length)];
            const page = await scrapeRobertContent(randomPath);
            if (page) {
                return page;
            }
            attempts++;
        }
        console.log("Could not find a new page to scrape after 10 attempts.");
        return null;
    }
    return rootPage;
}

/**
 * Récupère le contenu d'une page du Robert.
 * @param {string} path Le chemin de la page à scraper.
 * @param {boolean} force Si true, ignore la vérification des pages déjà scrapées (utile pour récupérer les liens).
 * @returns {Promise<{title: string, content: string, links: string[]}|null>}
 */
export async function scrapeRobertContent(path = '/guide', force = false) {
    if (!force) {
        const scrapedPages = await getScrapedPages();
        if (scrapedPages.has(path)) {
            console.log(`Page ${path} already scraped. Skipping.`);
            return null;
        }
    }
    // ... le reste de la fonction scrapeRobertContent reste identique