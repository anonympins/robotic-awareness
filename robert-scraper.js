import https from 'node:https';

/**
 * Scraper pour le guide du dictionnaire Le Robert.
 */
export class RobertScraper {
    constructor() {
        this.baseUrl = "https://dictionnaire.lerobert.com";
        this.guideIndexUrl = "https://dictionnaire.lerobert.com/guide";
        this.cachedLinks = [];
    }

    async fetchHtml(url) {
        return new Promise((resolve, reject) => {
            const options = {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            };
            https.get(url, options, (res) => {
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => resolve(body));
            }).on('error', reject);
        });
    }

    /**
     * Récupère tous les liens internes du guide
     */
    async getGuideLinks() {
        if (this.cachedLinks.length > 0) return this.cachedLinks;

        console.log(`[RobertScraper] Analyse de l'index : ${this.guideIndexUrl}`);
        const html = await this.fetchHtml(this.guideIndexUrl);
        
        // On cherche les liens de type /guide/nom-du-guide
        const regex = /href="(\/guide\/[a-z0-9-]+)"/g;
        const links = new Set();
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            links.add(this.baseUrl + match[1]);
        }

        this.cachedLinks = Array.from(links);
        console.log(`[RobertScraper] ${this.cachedLinks.length} guides trouvés.`);
        return this.cachedLinks;
    }

    /**
     * Scrape le contenu d'un guide spécifique
     */
    async scrapeGuidePage(url) {
        const html = await this.fetchHtml(url);
        
        // Extraction du titre
        const titleMatch = html.match(/<h1>([\s\S]*?)<\/h1>/);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>?/gm, '').trim() : "Sans titre";

        // Extraction du contenu principal (souvent dans .card-body ou les div de contenu)
        // On nettoie les balises pour ne garder que le texte
        const cleanText = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<[^>]*>?/gm, ' ') // Remplace balises par espaces
            .replace(/\s+/g, ' ')       // Normalise espaces
            .trim();

        // On tente d'isoler la partie "utile" si possible (heuristique simple)
        // Le Robert utilise souvent des structures d'articles claires.
        return { title, content: cleanText };
    }

    async getRandomGuide() {
        const links = await this.getGuideLinks();
        if (links.length === 0) return null;
        const randomUrl = links[Math.floor(Math.random() * links.length)];
        return await this.scrapeGuidePage(randomUrl);
    }
}