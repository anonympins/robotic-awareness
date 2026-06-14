/**
 * OPTIMISATION 1 : Attention Algorithmique
 * Pré-calcul des inverses et minimisation des recherches Map.
 */
export class SemanticAttentionLayer {
    constructor() {
        this.states = new Map();
        this.equivalences = new Map();
    }

    setEquivalence(synonym, target) {
        this.equivalences.set(synonym, target);
    }

    updateState(anchor, value, weight = 1.0) {
        const target = this.equivalences.get(anchor) || anchor;
        let state = this.states.get(target);
        if (!state) {
            state = { value, weight, invWeight: 1.0 / weight }; // Pré-calcul
            this.states.set(target, state);
        } else {
            state.value = value;
            state.weight = (state.weight * 0.8) + weight;
            state.invWeight = 1.0 / state.weight;
        }
    }

    getResolvedState(anchor) {
        const target = this.equivalences.get(anchor) || anchor;
        return this.states.get(target) || { value: "unknown", weight: 0, invWeight: 0 };
    }
}

/**
 * OPTIMISATION 3 : Mémoire Bitwise (Direct References)
 * Version allégée pour limiter la pression sur le Garbage Collector.
 */
class BitwiseNode {
    constructor() {
        // Utilisation de propriétés directes au lieu de tableaux pour réduire l'allocation d'objets
        this.c0 = 0; this.c1 = 0; 
        this.n0 = null; this.n1 = null;
    }
}

export class BitwiseRelationalMemory {
    constructor(contextSize = 64, maxNodes = 5000000) { // Augmentation à 5M pour plus de nuances
        this.contextSize = contextSize;
        this.maxNodes = maxNodes; // Sécurité anti-OOM
        this.root = new BitwiseNode();
        this.history = []; // Sliding window of bits
        this.memorySize = 0;
    }

    update(bit) {
        let current = this.root;
        for (let i = 0; i < this.history.length; i++) {
            const hBit = this.history[i];
            if (hBit === 0) {
                if (!current.n0) { current.n0 = new BitwiseNode(); this.memorySize++; }
                current = current.n0;
            } else {
                if (!current.n1) { current.n1 = new BitwiseNode(); this.memorySize++; }
                current = current.n1;
            }
        }

        if (bit === 0) current.c0++; else current.c1++;
        
        this.history.push(bit);
        if (this.history.length > this.contextSize) {
            this.history.shift();
        }
    }

    predictBit() {
        let current = this.root;
        for (let i = 0; i < this.history.length; i++) {
            const hBit = this.history[i];
            const next = hBit === 0 ? current.n0 : current.n1;
            if (!next) return Math.random() > 0.5 ? 1 : 0;
            current = next;
        }
        return current.c1 >= current.c0 ? 1 : 0;
    }

    resetContext() { this.history = []; }
}

/**
 * OPTIMISATION 2 : Flux Sémantique
 * Tokenisation unique et traitement par fenêtres glissantes de tokens.
 */
export class SemanticRelationalMemory {
    constructor(windowSize = 8) {
        this.windowSize = windowSize;
        this.vocabulary = new Map();
        this.reverseVocab = [];
        this.bitEngine = new BitwiseRelationalMemory(windowSize * 8, 5000000); // Cohérence avec le bitEngine
        this.attention = null;
    }

    attachAttention(attn) { this.attention = attn; }

    learnText(text) {
        // Tokenisation unique : évite de rescanner la chaîne
        const tokens = text.toLowerCase().match(/\w+|[^\w\s]/g) || [];
        
        for (let i = 0; i < tokens.length; i++) {
            this.learnSense(tokens[i]);
        }
    }

    learnSense(word) {
        let id = this.vocabulary.get(word);
        if (id === undefined) {
            id = this.vocabulary.size;
            this.vocabulary.set(word, id);
            this.reverseVocab[id] = word;
        }
        
        // Injection bit à bit de l'ID du token dans le moteur relationnel
        for (let b = 15; b >= 0; b--) {
            this.bitEngine.update((id >> b) & 1);
        }
    }

    predictSense(seed, depth, options = {}) {
        const tokens = seed.toLowerCase().match(/\w+|[^\w\s]/g) || [];
        this.bitEngine.resetContext();
        
        // Amorce
        tokens.forEach(t => this.learnSense(t));

        let result = [];
        for (let d = 0; d < depth; d++) {
            let predictedId = 0;
            for (let b = 15; b >= 0; b--) {
                const bit = this.bitEngine.predictBit();
                predictedId |= (bit << b);
                this.bitEngine.update(bit);
            }
            const word = this.reverseVocab[predictedId] || ".";
            result.push(word);
        }
        return result.join(' ');
    }

    exportState() {
        return { vocab: Array.from(this.vocabulary.entries()) };
    }

    importState(state) {
        this.vocabulary = new Map(state.vocab);
        state.vocab.forEach(([word, id]) => this.reverseVocab[id] = word);
    }
}