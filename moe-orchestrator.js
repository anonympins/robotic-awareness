import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";
import fs from 'node:fs';
import path from 'node:path';

export class GNeuroMoE {
    constructor(contextSize = 16) {
        this.contextSize = contextSize;
        this.experts = new Map(); // Nom -> Instance SemanticRelationalMemory
        this.gatekeeper = new SemanticAttentionLayer();
        this.sharedVocabulary = new Map();
        this.sharedReverseVocab = new Map();
        this.storagePath = "./experts_chunks/";

        if (!fs.existsSync(this.storagePath)) fs.mkdirSync(this.storagePath);
    }

    /**
     * Charge ou crée un expert thématique
     */
    async getExpert(domain) {
        if (this.experts.has(domain)) return this.experts.get(domain);

        const brain = new SemanticRelationalMemory(this.contextSize);
        // Injection du vocabulaire partagé pour éviter les collisions d'IDs
        brain.vocabulary = this.sharedVocabulary;
        brain.reverseVocab = this.sharedReverseVocab;

        const file = path.join(this.storagePath, `expert_${domain}.gnr`);
        if (fs.existsSync(file)) {
            console.log(`[MoE] Chargement de l'expert : ${domain}`);
            brain.importState(fs.readFileSync(file));
        }

        this.experts.set(domain, brain);
        return brain;
    }

    /**
     * Route la requête vers l'expert le plus pertinent
     * Simple implémentation basée sur les mots-clés (Gatekeeper)
     */
    route(prompt) {
        const tokens = prompt.toLowerCase().split(/\s+/);
        
        // Logique de routage simplifiée
        if (tokens.some(t => ["robot", "moteur", "capteur", "technique"].includes(t))) return "technique";
        if (tokens.some(t => ["poésie", "livre", "histoire", "shakespear"].includes(t))) return "culture";
        
        return "general";
    }

    /**
     * Apprentissage ciblé sur un expert
     */
    async learnInDomain(text, domain) {
        const expert = await this.getExpert(domain);
        expert.learnText(text, true);
        this.saveExpert(domain);
    }

    saveExpert(domain) {
        const expert = this.experts.get(domain);
        if (expert) {
            const file = path.join(this.storagePath, `expert_${domain}.gnr`);
            fs.writeFileSync(file, expert.exportBinary());
        }
    }

    /**
     * Requête multi-experts (Interrogation)
     */
    async query(prompt, depth = 50, options = {}) {
        const domain = this.route(prompt);
        console.log(`[MoE] Routage vers l'expert : ${domain}`);
        const expert = await this.getExpert(domain);
        
        // On peut même mixer les attentions de deux experts si nécessaire
        return expert.predictSense(prompt, depth, options);
    }
}