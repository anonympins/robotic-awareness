import https from 'node:https';

export async function fetchLeRobertGuide(path = '/guide') {
    const baseUrl = 'https://dictionnaire.lerobert.com';
    const url = `${baseUrl}${path}`;

    const getHtml = (targetUrl) => new Promise((resolve, reject) => {
        https.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (RoboticAwareness/1.0)' }
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    try {
        const html = await getHtml(url);
        
        // Extraction des liens internes du guide (ex: /guide/conjugaison)
        const linkRegex = /href="(\/guide\/[^"]+)"/g;
        const links = new Set();
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
            links.add(match[1]);
        }

        // Nettoyage du contenu textuel spécifique au Robert
        // On cible généralement les balises de contenu principal
        const cleanContent = html
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ') // Supprime le HTML
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return {
            links: Array.from(links),
            content: cleanContent
        };
    } catch (e) {
        console.error(`[Scraper Robert] Erreur sur ${path}: ${e.message}`);
        return { links: [], content: "" };
    }
}