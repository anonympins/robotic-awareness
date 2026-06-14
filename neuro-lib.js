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

export class BitwiseRelationalMemory {
    constructor(contextSize = 64, maxNodes = 5000000) {
        this.contextSize = contextSize;
        this.maxNodes = maxNodes;
        // Chaque nœud possède 4 slots : [count0, count1, ptr0, ptr1]
        this.nodes = new Uint32Array(maxNodes * 4);
        this.nodesUsed = 1; // Le nœud racine est à l'index 0
        this.history = [];
    }

    get memorySize() {
        return this.nodesUsed;
    }

    update(bit) {
        let currentIdx = 0;
        for (let i = 0; i < this.history.length; i++) {
            const hBit = this.history[i];
            const ptrOffset = hBit === 0 ? 2 : 3;
            let nextIdx = this.nodes[currentIdx * 4 + ptrOffset];

            if (nextIdx === 0) {
                if (this.nodesUsed >= this.maxNodes) return;
                nextIdx = this.nodesUsed++;
                this.nodes[currentIdx * 4 + ptrOffset] = nextIdx;
            }
            currentIdx = nextIdx;
        }

        // Mise à jour du compteur au nœud terminal du contexte
        if (bit === 0) this.nodes[currentIdx * 4 + 0]++;
        else this.nodes[currentIdx * 4 + 1]++;
        
        this.history.push(bit);
        if (this.history.length > this.contextSize) this.history.shift();
    }

    predictBit() {
        let currentIdx = 0;
        for (let i = 0; i < this.history.length; i++) {
            const hBit = this.history[i];
            const ptrOffset = hBit === 0 ? 2 : 3;
            const nextIdx = this.nodes[currentIdx * 4 + ptrOffset];
            if (nextIdx === 0) return Math.random() > 0.5 ? 1 : 0;
            currentIdx = nextIdx;
        }
        
        const c0 = this.nodes[currentIdx * 4 + 0];
        const c1 = this.nodes[currentIdx * 4 + 1];
        if (c0 === 0 && c1 === 0) return Math.random() > 0.5 ? 1 : 0;
        return c1 >= c0 ? 1 : 0;
    }

    resetContext() { this.history = []; }

    exportState() {
        // On ne transfère que la partie utilisée du TypedArray pour l'export JSON
        return {
            nodesUsed: this.nodesUsed,
            data: Array.from(this.nodes.slice(0, this.nodesUsed * 4))
        };
    }

    importState(state) {
        this.nodesUsed = state.nodesUsed;
        const incoming = state.data;
        for (let i = 0; i < incoming.length; i++) {
            this.nodes[i] = incoming[i];
        }
    }
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
        return { 
            vocab: Array.from(this.vocabulary.entries()),
            bitEngine: this.bitEngine.exportState()
        };
    }

    importState(state) {
        this.vocabulary = new Map(state.vocab);
        state.vocab.forEach(([word, id]) => this.reverseVocab[id] = word);
        if (state.bitEngine) this.bitEngine.importState(state.bitEngine);
    }
}