import https from 'node:https';

/**
 * Scrape une page Wikipédia aléatoire et extrait le contenu de #mw-content-text.
 * Cette méthode suit les redirections automatiquement.
 */
export async function scrapeRandomWikipediaContent() {
    const startUrl = "https://fr.wikipedia.org/w/index.php?title=Special:Random";


    console.log(`[Scraper] Connexion à : ${startUrl}`);

    /**
     * Extrait les blocs de texte (titres et paragraphes) d'un fragment HTML.
     * @param {string} html - Le fragment HTML à analyser.
     * @returns {string[]} - Un tableau de chaînes de texte propres.
     */
    const extractTextBlocks = (html) => {
        const blocks = [];
        const blockRegex = /<(h[2-6]|p)[^>]*>([\s\S]*?)<\/\1>/gi;
        let match;
        while ((match = blockRegex.exec(html)) !== null) {
            const textContent = match[2]
                .replace(/<[^>]+>/g, ' ')      // Nettoie les balises internes (ex: <a>, <span>)
                .replace(/&[a-z0-9#]+;/gi, ' ') // Nettoie les entités HTML
                .replace(/\s+/g, ' ').trim();  // Normalise les espaces
            if (textContent.length > 2) blocks.push(textContent);
        }
        return blocks;
    };

    const extractTitle = (html) => {
        const match = html.match(/<h1[^>]*id="firstHeading"[^>]*>([\s\S]*?)<\/h1>/);
        return match ? match[1].replace(/<[^>]*>?/gm, '').trim() : "Sans titre";
    };

    const fetchHtml = (url) => new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none'
            }
        };
        https.get(url, options, (res) => {
            // Gestion des redirections (301, 302)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let nextUrl = res.headers.location;

                if (nextUrl.startsWith('//')) {
                    nextUrl = 'https:' + nextUrl;
                } else if (nextUrl.startsWith('/')) {
                    nextUrl = 'https://fr.wikipedia.org' + nextUrl;
                }
                return fetchHtml(nextUrl).then(resolve).catch(reject);
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`Erreur HTTP: ${res.statusCode}`));
            }

            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    try {
        const rawHtml = await fetchHtml(startUrl);
        const title = extractTitle(rawHtml);

        // Localisation simplifiée du bloc de contenu
        const marker = 'id="mw-content-text"';
        const startIdx = rawHtml.indexOf(marker);
        if (startIdx === -1) throw new Error("Zone de contenu non trouvée.");

        let fragment = rawHtml.substring(startIdx);
        
        // On coupe avant les catégories et le footer pour éviter le bruit
        const endMarker = fragment.indexOf('id="catlinks"');
        if (endMarker !== -1) fragment = fragment.substring(0, endMarker);

        // Extraction du texte brut
        const blocks = extractTextBlocks(fragment);

        console.log("=== Extraction Réussie ===");
        console.log(`Titre : ${title}`);
        console.log(`Nombre de blocs récupérés : ${blocks.length}`);
        
        return { title, blocks };
    } catch (error) {
        console.error(`[Erreur Scraper] : ${error.message}`);
        throw error;
    }
}