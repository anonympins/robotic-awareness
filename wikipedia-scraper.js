import https from 'node:https';

/**
 * Scrape une page Wikipédia aléatoire et extrait le contenu de #mw-content-text.
 * Cette méthode suit les redirections automatiquement.
 */
export async function scrapeRandomWikipediaContent() {
    const startUrl = "https://fr.wikipedia.org/w/index.php?title=Special:Random";


    console.log(`[Scraper] Connexion à : ${startUrl}`);

    const cleanHtmlSource = (html) => {
        return html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Supprime le CSS
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Supprime le JS
            .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
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
        // Pré-nettoyage des balises de données (CSS/JS)
        const html = cleanHtmlSource(rawHtml);

        // Localisation de la balise cible
        const targetId = 'id="mw-content-text"';
        const startIdx = html.indexOf(targetId);

        if (startIdx === -1) {
            throw new Error("La balise #mw-content-text n'a pas été trouvée dans le HTML.");
        }

        // On remonte à l'ouverture du <div
        const divStartIdx = html.lastIndexOf('<div', startIdx);
        
        // Extraction du bloc par comptage de balises pour gérer les imbrications
        let content = "";
        let depth = 0;
        let i = divStartIdx;

        while (i < html.length) {
            if (html.substring(i, i + 4) === '<div') {
                depth++;
                i += 4;
            } else if (html.substring(i, i + 5) === '</div') {
                depth--;
                i += 5;
                if (depth === 0) {
                    content = html.substring(divStartIdx, i);
                    break;
                }
            } else {
                i++;
            }
        }

        console.log("=== Extraction Réussie ===");
        console.log(`Titre : ${title}`);
        console.log(`Taille récupérée : ${content.length} caractères.`);
        
        return { title, content };
    } catch (error) {
        console.error(`[Erreur Scraper] : ${error.message}`);
        throw error;
    }
}