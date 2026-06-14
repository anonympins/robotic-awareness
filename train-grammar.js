import { fetchLeRobertGuide } from "./lerobert-scraper.js";
import fs from 'node:fs/promises';
import path from 'node:path';

const VISITED_FILE = path.join(process.cwd(), 'grammar_visited.json');
const QUEUE_FILE = path.join(process.cwd(), 'grammar_queue.json');

/**
 * Gestionnaire de file d'attente pour le Guide Robert
 */
export class RobertGrammarManager {
    constructor() {
        this.queue = ['/guide'];
        this.visited = new Set();
    }

    async init() {
        try {
            const data = await fs.readFile(VISITED_FILE, 'utf8');
            this.visited = new Set(JSON.parse(data));
            
            // Tente de restaurer la file d'attente
            const queueData = await fs.readFile(QUEUE_FILE, 'utf8');
            this.queue = JSON.parse(queueData);
            console.log(`[CRAWLER] File d'attente restaurée : ${this.queue.length} liens.`);
        } catch (e) {}
    }

    async getNextBatch() {
        if (this.queue.length === 0) return null;
        
        const path = this.queue.shift();
        if (this.visited.has(path)) return this.getNextBatch();

        const result = await fetchLeRobertGuide(path);
        
        // Alimentation de la queue
        result.links.forEach(l => {
            if (!this.visited.has(l) && !this.queue.includes(l)) this.queue.push(l);
        });
        this.visited.add(path);
        
        return { path, content: result.content };
    }

    async saveState() {
        await fs.writeFile(VISITED_FILE, JSON.stringify(Array.from(this.visited)));
        await fs.writeFile(QUEUE_FILE, JSON.stringify(this.queue));
    }
}