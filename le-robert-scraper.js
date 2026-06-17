import https from 'node:https';

export async function scrapeRobertContent(path = '/guide') {
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
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`Erreur HTTP: ${res.statusCode}`));
                }

                // Extraction du titre
                const titleMatch = data.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
                const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : "Guide Robert";

                // Extraction du contenu principal (souvent dans .bourse-content ou article)
                const contentMatch = data.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || 
                                   data.match(/<div class="content"[^>]*>([\s\S]*?)<\/div>/i);
                
                const content = contentMatch ? contentMatch[1] : data;

                // Extraction des liens internes du guide pour la suite
                const linkRegex = /href="(\/guide\/[^"]+)"/g;
                const internalLinks = [];
                let match;
                while ((match = linkRegex.exec(data)) !== null) {
                    if (!internalLinks.includes(match[1])) internalLinks.push(match[1]);
                }

                resolve({ title, content, links: internalLinks });
            });
        });

        req.on('error', reject);
    });
}

/**
 * Récupère une page au hasard parmi une liste de départ
 */
export async function getRandomRobertPage() {
    // On commence par la racine du guide
    const root = await scrapeRobertContent('/guide');
    if (root.links && root.links.length > 0) {
        const randomPath = root.links[Math.floor(Math.random() * root.links.length)];
        return await scrapeRobertContent(randomPath);
    }
    return root;
}