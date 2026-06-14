import https from 'node:https';

/**
 * Scrape une page Wikipédia aléatoire et extrait le contenu de #mw-content-text.
 * Cette méthode suit les redirections automatiquement.
 */
export async function scrapeRandomWikipediaContent() {
    const startUrl = "https://fr.wikipedia.org/w/index.php?title=Special:Random";


    console.log(`[Scraper] Connexion à : ${startUrl}`);

    // Fonctions utilitaires déplacées pour plus de clarté
    const cleanHtmlSource = (html) => html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ') 
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ') 
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
        // Supprime les tableaux (infobox/navbox) AVANT de supprimer les balises génériques
        .replace(/<table[^>]*class="[^"]*(?:infobox|navbox)[^"]*"[^>]*>[\s\S]*?<\/table>/gi, ' ')
        // Ajoute des espaces autour des éléments de structure pour éviter la fusion de mots
        .replace(/<\/p>|<br\/?>|<\/li>|<\/h[1-6]>/gi, ' \n ')
        // Supprime enfin toutes les balises HTML restantes
        .replace(/<[^>]+>/g, ' ');

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
                // Normalisation de l'URL pour gérer les caractères spéciaux/accents dans les titres
                const safeUrl = new URL(nextUrl).href;
                return fetchHtml(safeUrl).then(resolve).catch(reject);
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

        // On cherche la balise dans le HTML BRUT pour ne pas perdre les IDs
        const targetId = 'id="mw-content-text"';
        const startIdx = rawHtml.indexOf(targetId);

        if (startIdx === -1) {
            throw new Error("La balise #mw-content-text n'a pas été trouvée dans le HTML.");
        }

        // On remonte à l'ouverture du <div
        const divStartIdx = rawHtml.lastIndexOf('<div', startIdx);
        
        // Extraction du bloc par comptage de balises pour gérer les imbrications
        let blockHtml = "";
        let depth = 0;
        let i = divStartIdx;

        while (i < rawHtml.length) {
            if (rawHtml.substring(i, i + 4) === '<div') {
                depth++;
                i += 4;
            } else if (rawHtml.substring(i, i + 5) === '</div') {
                depth--;
                i += 5;
                if (depth === 0) {
                    blockHtml = rawHtml.substring(divStartIdx, i);
                    break;
                }
            } else {
                i++;
            }
        }

        // Nettoyage sémantique du bloc extrait uniquement
        const content = cleanHtmlSource(blockHtml);

        console.log("=== Extraction Réussie ===");
        console.log(`Titre : ${title}`);
        console.log(`Taille récupérée : ${content.length} caractères.`);
        
        return { title, content };
    } catch (error) {
        console.error(`[Erreur Scraper] : ${error.message}`);
        throw error;
    }
}