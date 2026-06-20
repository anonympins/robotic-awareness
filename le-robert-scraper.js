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
    const root = await scrapeRobertContent('/guide');
    if (!root) {
        // Already scraped, try a random link from the stored file
        const scrapedPages = await getScrapedPages();
        const links = Array.from(scrapedPages);
        if (links.length > 0) {
            const randomPath = links[Math.floor(Math.random() * links.length)];
            return await scrapeRobertContent(randomPath);
        }
        return null; // No pages to scrape
    }

    if (root.links && root.links.length > 0) {
        let attempts = 0;
        while(attempts < 10) { // Limit attempts to avoid infinite loops
            const randomPath = root.links[Math.floor(Math.random() * root.links.length)];
            const page = await scrapeRobertContent(randomPath);
            if (page) {
                return page;
            }
            attempts++;
        }
        console.log("Could not find a new page to scrape after 10 attempts.");
        return null;
    }
    return root;
}