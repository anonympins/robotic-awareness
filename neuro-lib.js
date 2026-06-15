// ============================================================
// G-NEURO LIB : Library de Neurones Géométriques & Bitwise
// "Lenient & Powerful" - Version Quaternions + Tête Chercheuse + FK
// ============================================================

// ---------- Noyau Mathématique : Quaternions ----------
export class Quaternion {
    constructor(w = 1, x = 0, y = 0, z = 0) {
        this.w = w; this.x = x; this.y = y; this.z = z;
    }

    // Optimisation : Permet de réutiliser un objet existant pour éviter le GC
    copyFrom(q) {
        this.w = q.w; this.x = q.x; this.y = q.y; this.z = q.z;
        return this;
    }

    static fromVec3(v, out = new Quaternion()) {
        // Transforme un vecteur [x, y, z] en quaternion pur (w=0)
        out.w = 0; out.x = v[0] || 0; out.y = v[1] || 0; out.z = v[2] || 0;
        return out;
    }

    static fromEuler(x, y, z, out = new Quaternion()) {
        // Conversion degrés -> radians
        const c1 = Math.cos((x * Math.PI / 180) / 2);
        const s1 = Math.sin((x * Math.PI / 180) / 2);
        const c2 = Math.cos((y * Math.PI / 180) / 2);
        const s2 = Math.sin((y * Math.PI / 180) / 2);
        const c3 = Math.cos((z * Math.PI / 180) / 2);
        const s3 = Math.sin((z * Math.PI / 180) / 2);

        // Ordre XYZ
        out.w = c1 * c2 * c3 - s1 * s2 * s3;
        out.x = s1 * c2 * c3 + c1 * s2 * s3;
        out.y = c1 * s2 * c3 - s1 * c2 * s3;
        out.z = c1 * c2 * s3 + s1 * s2 * c3;

        return out.normalize();
    }

    static random(out = new Quaternion()) {
        out.w = Math.random() * 2 - 1;
        out.x = Math.random() * 2 - 1;
        out.y = Math.random() * 2 - 1;
        out.z = Math.random() * 2 - 1;
        return out.normalize();
    }

    normalize(out = this) {
        const mag = Math.sqrt(this.w ** 2 + this.x ** 2 + this.y ** 2 + this.z ** 2);
        if (mag > 0) {
            out.w = this.w / mag; out.x = this.x / mag; out.y = this.y / mag; out.z = this.z / mag;
        } else {
            out.w = 1; out.x = 0; out.y = 0; out.z = 0;
        }
        return out;
    }

    conjugate(out = new Quaternion()) {
        out.w = this.w; out.x = -this.x; out.y = -this.y; out.z = -this.z;
        return out;
    }
    
    // Fait pivoter un vecteur 3D par ce quaternion
    rotateVector(v, out = new Vector3()) {
        // Formule de Rodrigues optimisée (évite les multiplications de quaternions complètes)
        const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
        const vx = v.x, vy = v.y, vz = v.z;

        // t = 2 * cross(q.xyz, v)
        const tx = 2 * (qy * vz - qz * vy);
        const ty = 2 * (qz * vx - qx * vz);
        const tz = 2 * (qx * vy - qy * vx);

        // v' = v + w * t + cross(q.xyz, t)
        out.x = vx + qw * tx + (qy * tz - qz * ty);
        out.y = vy + qw * ty + (qz * tx - qx * tz);
        out.z = vz + qw * tz + (qx * ty - qy * tx);

        return out;
    }

    // Produit de Hamilton : Interaction spatiale complexe
    multiply(q, out = new Quaternion()) {
        const tw = this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z;
        const tx = this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y;
        const ty = this.w * q.y - this.x * q.z + this.y * q.w + this.z * q.x;
        const tz = this.w * q.z + this.x * q.y - this.y * q.x + this.z * q.w;
        out.w = tw; out.x = tx; out.y = ty; out.z = tz;
        return out;
    }

    // Interpolation Sphérique (Slerp) pour des mouvements fluides entre deux poses
    static slerp(q1, q2, t, out = new Quaternion()) {
        let cosHalfTheta = q1.dot(q2);

        // Si le produit scalaire est négatif, le slerp prendra le chemin le plus long.
        // On inverse un quaternion pour prendre le chemin le plus court.
        if (cosHalfTheta < 0) {
            q2 = new Quaternion(-q2.w, -q2.x, -q2.y, -q2.z);
            cosHalfTheta = -cosHalfTheta;
        }

        if (Math.abs(cosHalfTheta) >= 1.0) {
            return out.copyFrom(q1);
        }

        const halfTheta = Math.acos(cosHalfTheta);
        const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

        const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
        const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

        out.w = q1.w * ratioA + q2.w * ratioB;
        out.x = q1.x * ratioA + q2.x * ratioB;
        out.y = q1.y * ratioA + q2.y * ratioB;
        out.z = q1.z * ratioA + q2.z * ratioB;
        return out.normalize();
    }

    dot(q) {
        return this.w * q.w + this.x * q.x + this.y * q.y + this.z * q.z;
    }

    add(q, out = new Quaternion()) { 
        out.w = this.w + q.w; out.x = this.x + q.x; out.y = this.y + q.y; out.z = this.z + q.z;
        return out; 
    }
    sub(q, out = new Quaternion()) { 
        out.w = this.w - q.w; out.x = this.x - q.x; out.y = this.y - q.y; out.z = this.z - q.z;
        return out; 
    }
    scale(s, out = new Quaternion()) { 
        out.w = this.w * s; out.x = this.x * s; out.y = this.y * s; out.z = this.z * s;
        return out; 
    }

    toArray() { return [this.w, this.x, this.y, this.z]; }
}

// ---------- Noyau Mathématique : Vecteurs 3D ----------
export class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x; this.y = y; this.z = z;
    }
    // Optimisation : Permet de copier les valeurs sans créer de nouvel objet
    copyFrom(v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
    }
    add(v, out = new Vector3()) { 
        out.x = this.x + v.x; out.y = this.y + v.y; out.z = this.z + v.z;
        return out; 
    }
    addInPlace(v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }
    sub(v, out = new Vector3()) { 
        out.x = this.x - v.x; out.y = this.y - v.y; out.z = this.z - v.z;
        return out; 
    }
    scale(s, out = new Vector3()) { 
        out.x = this.x * s; out.y = this.y * s; out.z = this.z * s;
        return out; 
    }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    normalize(out = this) {
        const len = this.length();
        if (len > 0) return this.scale(1 / len, out);
        out.x = 0; out.y = 0; out.z = 0;
        return out;
    }
    distanceTo(v) {
        return Math.sqrt((this.x - v.x) ** 2 + (this.y - v.y) ** 2 + (this.z - v.z) ** 2);
    }
    distanceToSquared(v) {
        return (this.x - v.x) ** 2 + (this.y - v.y) ** 2 + (this.z - v.z) ** 2;
    }
    cross(v, out = new Vector3()) {
        const ax = this.x, ay = this.y, az = this.z;
        const bx = v.x, by = v.y, bz = v.z;
        out.x = ay * bz - az * by;
        out.y = az * bx - ax * bz;
        out.z = ax * by - ay * bx;
        return out;
    }
    toArray() { return [this.x, this.y, this.z]; }
}

// ---------- Neurone Seeker (Tête Chercheuse) ----------
export class SeekerNeuron {
    constructor() {
        // L'orientation est le "poids" géométrique du neurone
        this.orientation = Quaternion.random();
        this.errorMomentum = new Quaternion(0, 0, 0, 0);
        this._tempGrad = new Quaternion(); // Buffer pour calculs sans allocation
    }

    // Prédiction par alignement (similarité de phase)
    predict(inputQ) {
        return this.orientation.dot(inputQ);
    }

    // Mise à jour par condensation d'erreur
    // targetError: scalaire (différence sortie/attendu)
    // inputQ: le quaternion d'entrée qui a causé l'erreur
    update(inputQ, targetError, lr) {
        // --- Validation des entrées ---
        if (isNaN(targetError) || typeof targetError !== 'number' || isNaN(inputQ.w)) return;
        if (!isFinite(targetError)) return;

        // 1. Calcul du gradient d'orientation (la direction vers laquelle pivoter)
        inputQ.scale(targetError, this._tempGrad);

        // 2. Condensation : On mélange l'erreur actuelle avec le momentum spatial
        this.errorMomentum.scale(0.9, this.errorMomentum).add(this._tempGrad.scale(0.1, this._tempGrad), this.errorMomentum);

        // 3. Correction : Le neurone "cherche" l'angle optimal
        this.orientation.sub(this.errorMomentum.scale(lr, this._tempGrad), this.orientation).normalize();
    }
}

// ---------- Neurone Majoritaire Adaptatif (Apprentissage par Corrélation) ----------
export class AdaptiveMajorityNeuron {
    /**
     * Un neurone qui apprend ses propres poids par observation statistique.
     * @param {number} inputSize Nombre de bits en entrée
     */
    constructor(inputSize) {
        this.inputSize = inputSize;
        // Les "potentiels" sont des compteurs de corrélation (entiers)
        this.potentials = new Int32Array(inputSize).fill(0);
        this.weights = new Int32Array(inputSize).fill(0); 
        this.threshold = 1;
        this.learningCounter = 0;
    }

    predict(inputs) {
        let votes = 0;
        for (let i = 0; i < this.inputSize; i++) {
            votes += (inputs[i] & 1) * this.weights[i];
        }
        return (votes >= this.threshold) | 0;
    }

    /**
     * Retourne la confiance "analogique" du neurone (0.0 à 1.0)
     */
    getConfidence(inputs) {
        let votes = 0;
        let maxPossibleVotes = 0;
        for (let i = 0; i < this.inputSize; i++) {
            const w = this.weights[i];
            votes += (inputs[i] & 1) * w;
            maxPossibleVotes += w;
        }
        if (maxPossibleVotes === 0) return 0;
        return {
            score: votes / maxPossibleVotes,
            thresholdRatio: votes / (this.threshold || 1)
        };
    }

    /**
     * Apprentissage Hebbien Bitwise : "Les bits qui s'activent ensemble se lient ensemble"
     * @param {Uint8Array} inputs 
     * @param {number} targetBit (0 ou 1)
     * @param {number} pressure Force de l'ajustement (ex: 1)
     */
    train(inputs, targetBit, pressure = 1) {
        // Mode "Mémorisation Forte" : on renforce la corrélation systématiquement.
        // On utilise une pression plus forte pour graver l'information
        for (let i = 0; i < this.inputSize; i++) {
            if (inputs[i] === 1) {
                // Apprentissage asymétrique avec CLAMPING (Saturation)
                // On sature rapidement pour que les nouveaux apprentissages ne "noient" pas les anciens
                let change = (targetBit === 1 ? (pressure * 2) : -(pressure * 20));
                this.potentials[i] = Math.max(-127, Math.min(127, this.potentials[i] + change));
            }
        }
        this.learningCounter++;

        // Stabilisation plus fréquente pour une convergence rapide lors de l'entraînement textuel
        if (this.learningCounter % 5 === 0) {
            this._stabilize();
        }
    }

    _stabilize() {
        let totalWeight = 0;
        for (let i = 0; i < this.inputSize; i++) {
            // Augmentation de la plage dynamique (0 à 63)
            // On ignore les signaux faibles (< 3) pour éliminer le "fantôme" de l'information
            const p = this.potentials[i];
            this.weights[i] = p > 2 ? Math.min(p, 63) : 0;
            totalWeight += this.weights[i];
        }
        // Consensus optimal à 60% : assez souple pour la suite, assez strict pour l'exactitude
        this.threshold = Math.max(1, Math.ceil(totalWeight * 0.6));
    }

    exportState() {
        return {
            potentials: Array.from(this.potentials),
            weights: Array.from(this.weights),
            threshold: this.threshold,
            learningCounter: this.learningCounter
        };
    }

    importState(state) {
        this.potentials.set(state.potentials);
        this.weights.set(state.weights);
        this.threshold = state.threshold;
        this.learningCounter = state.learningCounter;
    }
}

// ---------- Générateur de Règles Probabilistes ----------
export class ProbabilisticRuleLearner {
    /**
     * Analyse de grands ensembles de données pour en extraire des règles binaires.
     */
    static discoverRule(dataset, inputIndices, targetIndex) {
        const neuron = new AdaptiveMajorityNeuron(inputIndices.length);
        
        dataset.forEach(sample => {
            const inputs = new Uint8Array(inputIndices.map(idx => sample[idx]));
            const target = sample[targetIndex];
            neuron.train(inputs, target, 1);
        });

        neuron._stabilize();
        
        // Exportation en format "Règle" compatible avec RuleInterpreter
        return {
            type: 'MAJORITY',
            weights: Array.from(neuron.weights),
            threshold: neuron.threshold,
            inputs: inputIndices
        };
    }
}


// ---------- Couche Géométrique (Seeker Layer) ----------
export class SeekerLayer {
    constructor(inputSize, outputSize) {
        this.neurons = Array.from({ length: outputSize }, () => new SeekerNeuron());
        // Buffer pour éviter l'allocation de Quaternions à chaque forward/train
        this._inputBuffer = Array.from({ length: inputSize }, () => new Quaternion());
    }

    forward(vecs) {
        // Réutilisation du buffer
        for (let i = 0; i < vecs.length && i < this._inputBuffer.length; i++) {
            Quaternion.fromVec3(vecs[i], this._inputBuffer[i]).normalize();
        }
        return this.neurons.map(neuron => {
            // Chaque neurone agrège l'ensemble des inputs par son orientation
            return this._inputBuffer.reduce((acc, q) => acc + neuron.predict(q), 0) / this._inputBuffer.length;
        });
    }

    train(vecs, targets, lr = 0.01) {
        for (let i = 0; i < vecs.length && i < this._inputBuffer.length; i++) {
            Quaternion.fromVec3(vecs[i], this._inputBuffer[i]).normalize();
        }
        const outputs = this.forward(vecs);
        let totalLoss = 0;

        for (let i = 0; i < this.neurons.length; i++) {
            const error = outputs[i] - (targets[i] || 0);
            totalLoss += Math.abs(error);
            for (const q of this._inputBuffer) {
                this.neurons[i].update(q, error, lr);
            }
        }
        return totalLoss;
    }
}


// ---------- Types de neurones ----------
export const NeuronType = {
    AND: (a, b) => a & b,
    OR:  (a, b) => a | b,
    XOR: (a, b) => a ^ b,
    NAND: (a, b) => ~(a & b) & 1,
    NOR:  (a, b) => ~(a | b) & 1,
    MAJORITY_3: (a, b, c) => (a & b) | (a & c) | (b & c)
};

// ---------- Perceptron binaire avec poids en puissance de 2 ----------
export class BitPerceptron {
    constructor(weights, threshold) {
        // Les poids doivent être des puissances de 2 (1,2,4,8...)
        this.weights = new Int32Array(weights);  // ex: [1, 2, 4, 8]
        this.threshold = threshold;
    }

    // Calcul ultra-rapide avec décalages et AND
    predict(inputs) {
        // Version 1: multiplication par décalage
        let sum = 0;
        for (let i = 0; i < inputs.length; i++) {
            // Multiplication optimisée: w * x = (x << log2(w)) si w est puissance de 2
            // Ici on utilise le fait que weights sont en dur, on peut précalculer les shifts
            sum += (inputs[i] & 1) * this.weights[i];
        }
        return (sum >= this.threshold) | 0;
    }
}

// ---------- Neurone à vote majoritaire avec pondération ----------
export class MajorityNeuron {
    constructor(weights, customThreshold = null) { // Added customThreshold
        // weights: tableau d'entiers (nombre de voix pour chaque entrée)
        this.weights = new Int32Array(weights);
        this.totalVoices = 0;
        for (let i = 0; i < this.weights.length; i++) this.totalVoices += Math.abs(this.weights[i]);
        this.majorityThreshold = (customThreshold !== null && customThreshold !== undefined) ? customThreshold : (this.totalVoices >> 1) + 1;
    }

    predict(inputs) {
        let votes = 0;
        // Sécurité : On ne boucle que sur le nombre de poids pour éviter les NaN
        for (let i = 0; i < this.weights.length; i++) {
            votes += (inputs[i] & 1) * this.weights[i];
        }
        return (votes >= this.majorityThreshold) | 0;
    }
}

// ---------- Réseau multicouche à votes majoritaires ----------
export class MajorityNetwork {
    constructor(layers) {
        // layers: array of arrays. Each inner array can contain:
        //   - an array of weights (e.g., [1, 1]) for a MajorityNeuron with default threshold
        //   - an object {weights: [...], threshold: ...} for a MajorityNeuron with custom threshold
        this.layers = layers.map(layerConfigs =>
            layerConfigs.map(config => {
                if (Array.isArray(config)) {
                    // Old format: just weights, use default MajorityNeuron threshold
                    return new MajorityNeuron(config);
                } else if (typeof config === 'object' && config !== null && 'weights' in config) {
                    // New format: object with weights and optional threshold
                    return new MajorityNeuron(config.weights, config.threshold);
                } else {
                    throw new Error("Invalid neuron configuration in MajorityNetwork layer.");
                }
            })
        );
    }

    predict(inputs, verbose = false) {
        // Conversion initiale en Uint8Array si nécessaire
        let current = (inputs instanceof Uint8Array) ? inputs : new Uint8Array(inputs);

        for (let l = 0; l < this.layers.length; l++) {
            const layer = this.layers[l];
            const next = new Uint8Array(layer.length);

            for (let i = 0; i < layer.length; i++) {
                next[i] = layer[i].predict(current);
            }
            current = next;
            if (verbose) console.log(`    [Couche ${l}] Sortie: [${current.join('')}]`);
        }

        return current;
    }

    // Exportation des "connaissances" (poids)
    export() {
        return this.layers.map(layer =>
            layer.map(n => ({ weights: n.weights, threshold: n.majorityThreshold }))
        );
    }
}

// ---------- Version ultime: réseau entièrement bit à bit ----------
// Pas de multiplications, que des AND/OR/XOR/NOT

export class BitwiseNetwork {
    constructor() {
        // Pré-allocation pour éviter les allocations mémoire
        this.workBuffer = new Uint8Array(32);
    }

    // Fonction XOR à 2 entrées (non linéaire, nécessite 2 couches cachées)
    xor(x1, x2) {
        // h1 = x1 AND (NOT x2)
        const h1 = x1 & (~x2 & 1);
        // h2 = x2 AND (NOT x1)
        const h2 = x2 & (~x1 & 1);
        // Sortie = h1 OR h2
        return h1 | h2;
    }

    // Demi-additionneur (somme et retenue) avec opérations bit à bit
    halfAdder(a, b) {
        return {
            sum: a ^ b,      // XOR
            carry: a & b     // AND
        };
    }

    // Additionneur complet (3 bits)
    fullAdder(a, b, carryIn) {
        const sum1 = a ^ b;
        const carry1 = a & b;
        const sum = sum1 ^ carryIn;
        const carry2 = sum1 & carryIn;
        const carry = carry1 | carry2;
        return { sum, carry };
    }

    // Vote majoritaire pondéré ultra-rapide (pour petits poids <= 7)
    weightedMajorityFast(inputs, weights) {
        // Version avec lookup table pour 4 entrées max
        // On emballe les entrées dans un masque
        let mask = 0;
        for (let i = 0; i < inputs.length && i < 4; i++) {
            mask |= (inputs[i] & 1) << i;
        }

        // Pré-calcul des résultats (en pratique on utiliserait une vraie LUT)
        // Ici c'est un exemple simplifié
        let sum = 0;
        for (let i = 0; i < inputs.length; i++) {
            sum += (inputs[i] & 1) * weights[i];
        }
        return (sum >= 2) | 0;
    }

    // Fonction de seuillage par bit de signe (pour nombres en complément à 2)
    signThreshold(value) {
        // Retourne 1 si value > 0, 0 sinon
        // Utilise le bit de signe pour les entiers signés 32 bits
        return (value >> 31) ^ 1;  // Si négatif -> 0, si positif -> 1
    }
}

// ---------- Perceptron stochastique avec génération de bits ----------
export class StochasticPerceptron {
    constructor(weights, rngSeed = Date.now()) {
        this.weights = weights;
        // Générateur aléatoire simple (xorshift)
        this.rngState = rngSeed;
    }

    // Xorshift32 pour génération rapide de bits aléatoires
    randomBit() {
        this.rngState ^= this.rngState << 13;
        this.rngState ^= this.rngState >> 17;
        this.rngState ^= this.rngState << 5;
        return (this.rngState >>> 0) & 1;
    }

    // Génère un flottant entre 0 et 1 pour les probabilités
    randomFloat() {
        this.rngState ^= this.rngState << 13;
        this.rngState ^= this.rngState >> 17;
        this.rngState ^= this.rngState << 5;
        return (this.rngState >>> 0) / 4294967295;
    }

    // Conversion d'une probabilité en flux binaire stochastique
    probabilityToBitStream(p, nBits = 8) {
        // p entre 0 et 1, retourne un entier dont les bits représentent
        // n échantillons de Bernoulli de paramètre p
        let result = 0;
        for (let i = 0; i < nBits; i++) {
            if (this.randomFloat() < p) {
                result |= (1 << i);
            }
        }
        return result;
    }

    // Prédiction avec calcul stochastique (multiplication par AND)
    predictStochastic(xStreams, nBits = 8) {
        // xStreams: tableau d'entiers représentant des flux binaires
        // Les poids sont des probabilités entre 0 et 1
        let sum = 0;

        for (let i = 0; i < this.weights.length && i < xStreams.length; i++) {
            // Multiplication stochastique: AND bit à bit, puis comptage des 1
            const product = xStreams[i] & this.probabilityToBitStream(this.weights[i], nBits);
            // Compter les bits à 1 (popcount)
            sum += this.popCount(product);
        }

        // Seuil à nBits/2
        return (sum >= (nBits * this.weights.length) >> 1) | 0;
    }

    // Popcount ultra-rapide (compter les bits à 1)
    popCount(x) {
        // Pour des petits nombres, version simple et rapide
        // En production, on utiliserait  x = (x & 0x55555555) + ((x >> 1) & 0x55555555) etc.
        let count = 0;
        while (x) {
            count += x & 1;
            x >>= 1;
        }
        return count;
    }
}

// ---------- Réseau Majoritaire Récurrent (StatefulMajorityNetwork) ----------
// Un réseau qui maintient un état interne (sa propre sortie précédente)
// et l'utilise comme entrée pour la prédiction suivante.
// Ceci est une forme simple de Réseau de Neurones Récurrents (RNN) bit à bit.
export class StatefulMajorityNetwork {
    /**
     * Construit un réseau récurrent à partir d'une logique de règle.
     * La logique de règle doit inclure des variables pour les entrées actuelles
     * et pour l'état précédent (les sorties du réseau à l'étape t-1).
     * @param {Object} ruleLogic La structure de la règle JSON pour le réseau.
     * @param {Object} varMap Le mappage des noms de variables aux indices d'entrée.
     *                        Doit inclure les variables pour les entrées actuelles et l'état précédent.
     * @param {number} currentInputSize Le nombre d'entrées "non-état" (inputs actuels).
     *                                  Les variables d'état doivent suivre ces inputs dans le varMap.
     */
    constructor(ruleLogic, varMap, currentInputSize) {
        this.ruleNetwork = RuleInterpreter.interpret(ruleLogic, varMap);
        this.varMap = varMap;
        this.maxIndex = Math.max(...Object.values(varMap));
        this.outputSize = this.ruleNetwork.layers[this.ruleNetwork.layers.length - 1].length;
        this.state = new Uint8Array(this.outputSize).fill(0);
        this.currentInputSize = currentInputSize;
        
        // Pré-allocation du buffer d'entrée global pour éviter les réallocations
        this._globalInputsBuffer = new Uint8Array(this.maxIndex + 1);

        // Pré-compilation des instructions de mappage pour éviter les opérations sur les chaînes et les boucles coûteuses
        this._mappingInstructions = [];
        const names = Object.keys(this.varMap);
        
        // Tri des noms pour garantir un mappage déterministe et un ordre cohérent des inputs
        names.sort((a, b) => {
            const aIsPrev = a.startsWith('prev_');
            const bIsPrev = b.startsWith('prev_');
            if (aIsPrev && !bIsPrev) return 1; // Les variables d'état précédentes viennent après les inputs actuels
            if (!aIsPrev && bIsPrev) return -1; // Les inputs actuels viennent avant les variables d'état précédentes
            return this.varMap[a] - this.varMap[b]; // Ensuite, tri par index numérique
        });

        let currentInputCounter = 0; // Compteur pour les indices des inputs actuels
        for (const name of names) {
            const targetIdx = this.varMap[name];
            if (name.startsWith('prev_')) { // Variable d'état précédente
                const stateIdx = parseInt(name.split('_').pop()) - 1 || 0;
                this._mappingInstructions.push({ type: 'prevState', stateIdx: stateIdx, targetIdx: targetIdx });
            } else { // Input actuel
                this._mappingInstructions.push({ type: 'currentInput', sourceIdx: currentInputCounter, targetIdx: targetIdx });
                currentInputCounter++;
            }
        }
    }

    predict(currentInputs) {
        // Réutilisation du buffer pré-alloué et réinitialisation à zéro
        const globalInputs = this._globalInputsBuffer;
        globalInputs.fill(0);

        // Application des instructions de mappage pré-compilées
        for (const instruction of this._mappingInstructions) {
            if (instruction.type === 'prevState') {
                globalInputs[instruction.targetIdx] = this.state[instruction.stateIdx] || 0;
            } else if (instruction.type === 'currentInput') {
                if (instruction.sourceIdx < currentInputs.length) {
                    globalInputs[instruction.targetIdx] = currentInputs[instruction.sourceIdx];
                }
            }
        }

        const newOutput = this.ruleNetwork.predict(globalInputs, false);
        this.state = newOutput; // Met à jour l'état pour la prochaine itération
        return newOutput;
    }

    reset() {
        this.state.fill(0);
    }
}

// ---------- Benchmarks et tests ----------
/*function benchmark() {
    console.log("=== Benchmark perceptrons bit à bit ===\n");

    // Test XOR
    console.log("Test XOR (réseau 2 couches):");
    const xorNet = new BitwiseNetwork();
    console.log(`0 XOR 0 = ${xorNet.xor(0, 0)} (attendu 0)`);
    console.log(`0 XOR 1 = ${xorNet.xor(0, 1)} (attendu 1)`);
    console.log(`1 XOR 0 = ${xorNet.xor(1, 0)} (attendu 1)`);
    console.log(`1 XOR 1 = ${xorNet.xor(1, 1)} (attendu 0)`);

    // Test additionneur
    console.log("\nTest demi-additionneur:");
    const ha = xorNet.halfAdder(1, 1);
    console.log(`1+1: somme=${ha.sum}, retenue=${ha.carry}`);

    // Test MajorityNeuron
    console.log("\nTest MajorityNeuron (2 voix pour x1, 1 voix pour x2):");
    const maj = new MajorityNeuron([2, 1]);
    console.log(`[0,0] -> ${maj.predict([0,0])} (attendu 0)`);
    console.log(`[0,1] -> ${maj.predict([0,1])} (attendu 0)`);
    console.log(`[1,0] -> ${maj.predict([1,0])} (attendu 1)`);
    console.log(`[1,1] -> ${maj.predict([1,1])} (attendu 1)`);

    // Performance test
    console.log("\nPerformance (10M prédictions):");
    const perfStart = process.hrtime.bigint();

    const majPerf = new MajorityNeuron([4, 2, 1]);
    let result = 0;
    for (let i = 0; i < 10_000_000; i++) {
        const a = i & 1;
        const b = (i >> 1) & 1;
        const c = (i >> 2) & 1;
        result ^= majPerf.predict([a, b, c]);
    }

    const perfEnd = process.hrtime.bigint();
    const perfMs = Number(perfEnd - perfStart) / 1_000_000;
    console.log(`10M prédictions: ${perfMs.toFixed(2)} ms`);
    console.log(`Résultat de contrôle: ${result}`);
}
*/



// ---------- Interprète de Règles pour MajorityNetwork ----------
export class RuleInterpreter {
    /**
     * Compile une règle logique imbriquée (arbre) en un MajorityNetwork multicouche.
     * Gère automatiquement les dépendances et les "pass-through" entre couches.
     * @param {Object|Array|number} logic Structure unique, tableau ou objet associatif {name: rule}.
     * @param {number|Object} config Taille d'entrée (number) ou mapping {varName: index}.
     * @returns {MajorityNetwork}
     */
    static interpret(logic, config) {
        let outputNames = null;
        let logics = [];

        // Normalisation de l'entrée : Single rule, Array of rules, ou Associative Object
        if (Array.isArray(logic)) {
            logics = logic;
        } else if (typeof logic === 'object' && logic.type) {
            logics = [logic];
        } else if (typeof logic === 'object' && logic.custom) {
            logics = [logic.custom]; // Extraction directe pour le mode scoring
        } else if (typeof logic === 'object' && logic !== null) {
            outputNames = Object.keys(logic);
            logics = outputNames.map(key => logic[key]);
        } else {
            logics = [logic];
        }

        let idCounter = 0;
        const varMapping = typeof config === 'object' ? config : null;
        let detectedInputSize = typeof config === 'number' ? config : 0;

        const resolveIndex = (node) => {
            if (typeof node === 'number') return node;
            if (node && typeof node === 'object' && node.var !== undefined) {
                if (!varMapping || varMapping[node.var] === undefined) {
                    throw new Error(`Variable '${node.var}' non trouvée dans le mapping fourni.`);
                }
                return varMapping[node.var];
            }
            return null;
        };

        const prepare = (node) => {
            const idx = resolveIndex(node);
            if (idx !== null) {
                detectedInputSize = Math.max(detectedInputSize, idx + 1);
                return { id: `in_${idx}`, depth: 0, index: idx };
            }

            // FIX: Transformation récursive du XOR en logique de base
            if (node.type && node.type.toUpperCase() === 'XOR') {
                if (!node.args || node.args.length !== 2) {
                    throw new Error(`L'opérateur XOR nécessite exactement 2 arguments.`);
                }
                const [a, b] = node.args;
                // XOR(A, B) <=> (A AND NOT B) OR (B AND NOT A)
                const transformed = {
                    type: 'OR',
                    args: [
                        { type: 'AND', args: [a, { type: 'NOT', args: [b] }] },
                        { type: 'AND', args: [b, { type: 'NOT', args: [a] }] }
                    ]
                };
                return prepare(transformed);
            }

            const args = (node.args || node.inputs || []).map(prepare);
            return {
                ...node,
                id: `node_${idCounter++}`,
                args,
                depth: 1 + (args.length > 0 ? Math.max(...args.map(a => a.depth)) : 0)
            };
        };

        const roots = logics.map(prepare);
        const maxDepth = roots.length > 0 ? Math.max(...roots.map(r => r.depth)) : 0;
        const inputSize = detectedInputSize;

        if (maxDepth === 0) {
            const layer = roots.map(r => {
                const weights = new Array(inputSize).fill(0);
                weights[r.index] = 1;
                return { weights, threshold: 1 };
            });
            const net = new MajorityNetwork([layer]);
            if (outputNames) net.outputNames = outputNames;
            return net;
        }

        const nodesByDepth = Array.from({ length: maxDepth + 1 }, () => []);
        const collect = (node) => {
            if (node.id && node.id.startsWith('node_')) {
                nodesByDepth[node.depth].push(node);
                node.args.forEach(collect);
            }
        };
        roots.forEach(collect);

        let currentState = Array.from({ length: inputSize }, (_, i) => ({ id: `in_${i}`, index: i }));
        const layers = [];

        for (let d = 1; d <= maxDepth; d++) {
            const layerNeurons = [];
            const nextState = [];
            // Élimination des doublons de nœuds à la même profondeur
            const depthNodes = nodesByDepth[d].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

            for (const node of depthNodes) {
                // FIX: Déplacer l'initialisation de 'op' AVANT son utilisation dans neuronWeights
                const op = (node.type || node.op || '').toUpperCase();

                // 1. Détermination des poids du neurone
                if (node.weights && node.weights.length !== node.args.length) {
                    throw new Error(`Le nombre de poids (${node.weights.length}) ne correspond pas au nombre d'arguments (${node.args.length}) pour le nœud ${node.id}`);
                }

                const neuronWeights = currentState.map(s => {
                    const argIdx = node.args.findIndex(arg => arg.id === s.id);
                    if (argIdx === -1) return 0;
                    if (node.weights && node.weights[argIdx] !== undefined) {
                        return node.weights[argIdx];
                    }
                    // Pour l'opérateur NOT, le poids doit être -1
                    if (op === 'NOT') return -1;
                    return 1;
                });

                // 2. Détermination du seuil
                let neuronThreshold = node.threshold;

                if (neuronThreshold === undefined) {
                    switch (op) {
                        case 'AND':
                            neuronThreshold = neuronWeights.reduce((a, b) => a + b, 0);
                            break;
                        case 'OR':
                            neuronThreshold = 1;
                            break;
                        case 'NOT':
                            if (node.args.length !== 1) throw new Error(`NOT operator expects exactly one argument for node ${node.id}.`);
                            // Le poids est déjà mis à -1 ci-dessus
                            neuronThreshold = 0; // 0 * -1 >= 0 est VRAI (1), 1 * -1 >= 0 est FAUX (0)
                            break;
                        case 'XOR': // This case should ideally not be reached due to prepare() transformation
                            throw new Error(`XOR should have been transformed by prepare(). Internal error.`);
                        case 'MAJORITY': // Default majority calculation
                            // Leave neuronThreshold undefined for MajorityNeuron to calculate (total/2)+1
                            break;
                        case 'AT_LEAST_N': // New operator for custom threshold with implicit weights of 1
                            if (node.threshold === undefined) {
                                throw new Error(`AT_LEAST_N operator requires a 'threshold' property for node ${node.id}.`);
                            }
                            neuronThreshold = node.threshold;
                            // Weights are implicitly 1 for AT_LEAST_N, already handled by default neuronWeights
                            break;
                        default:
                            // Par défaut, si rien n'est spécifié, on traite comme un AND
                            neuronThreshold = neuronWeights.reduce((a, b) => a + b, 0);
                    }
                }
                layerNeurons.push({ weights: neuronWeights, threshold: neuronThreshold });
                nextState.push({ id: node.id });
            }

            const isNeededLater = (id, currentDepth) => {
                // Est-ce une racine (sortie finale) qui doit encore traverser les couches ?
                if (roots.some(r => r.id === id) && currentDepth <= maxDepth) return true;

                let needed = false;
                const search = (n) => {
                    if (needed || !n || !n.args) return;
                    if (n.depth > currentDepth && n.args.some(a => a.id === id)) { needed = true; return; }
                    n.args.forEach(search);
                };
                roots.forEach(search);
                return needed;
            };

            for (const s of currentState) {
                if (isNeededLater(s.id, d)) {
                    const weights = currentState.map(curr => curr.id === s.id ? 1 : 0);
                    layerNeurons.push({ weights, threshold: 1 });
                    nextState.push({ id: s.id });
                }
            }

            // Pour la dernière couche, on impose l'ordre des sorties demandé
            if (d === maxDepth) {
                const orderedNeurons = [];
                const orderedState = [];
                for (const root of roots) {
                    const idx = nextState.findIndex(n => n.id === root.id);
                    orderedNeurons.push(layerNeurons[idx]);
                    orderedState.push(nextState[idx]);
                }
                layers.push(orderedNeurons);
                currentState = orderedState;
            } else {
                layers.push(layerNeurons);
                currentState = nextState;
            }
        }
        const net = new MajorityNetwork(layers);
        if (outputNames) net.outputNames = outputNames;
        return net;
    }

    /**
     * Crée une configuration de neurone pour une porte AND.
     * @param {number} inputCount Nombre d'entrées pour la porte AND.
     * @returns {{weights: number[], threshold: number}} Configuration pour MajorityNeuron.
     */
    static buildBooleanAND(inputCount) {
        const weights = new Array(inputCount).fill(1);
        const threshold = inputCount; // Tous les inputs doivent être 1
        return { weights, threshold };
    }

    /**
     * Crée une configuration de neurone pour une porte OR.
     * @param {number} inputCount Nombre d'entrées pour la porte OR.
     * @returns {{weights: number[], threshold: number}} Configuration pour MajorityNeuron.
     */
    static buildBooleanOR(inputCount) {
        const weights = new Array(inputCount).fill(1);
        const threshold = 1; // Au moins un input doit être 1
        return { weights, threshold };
    }

    /**
     * Crée une configuration de neurone pour une règle pondérée personnalisée.
     * @param {number[]} weights Tableau des poids.
     * @param {number} threshold Seuil de déclenchement.
     * @returns {{weights: number[], threshold: number}} Configuration pour MajorityNeuron.
     */
    static buildWeightedRule(weights, threshold) {
        return { weights, threshold };
    }

    /**
     * Construit un MajorityNetwork à partir d'une structure de règles.
     * @param {Array<Array<{weights: number[], threshold: number} | number[]>>} ruleStructure
     *   Ex: [[{weights: [1,1], threshold: 2}], [{weights: [1,1], threshold: 1}]]
     *   Peut aussi accepter l'ancien format [[w1,w2,...]] pour les couches.
     * @returns {MajorityNetwork}
     */
    static createNetwork(ruleStructure) {
        return new MajorityNetwork(ruleStructure);
    }
}

// ---------- Version encore plus optimisée avec TypedArrays ----------
export class OptimizedMajorityPerceptron {
    constructor(weights, useSimd = false) {
        this.weights = new Uint8Array(weights);
        this.total = 0;
        for (let i = 0; i < this.weights.length; i++) {
            this.total += this.weights[i];
        }
        this.threshold = (this.total >> 1) + 1;

        // Version SIMD-like via DataView (Node.js optimise automatiquement)
        this.useSimd = useSimd;
        this.weightView = new DataView(this.weights.buffer);
    }

    predict(inputs) {
        // Conversion rapide en Uint8Array
        const inArr = new Uint8Array(inputs);
        let sum = 0;

        // Boucle déroulée manuellement pour les petits tableaux
        const len = this.weights.length;
        if (len >= 4) {
            // Traitement par paquets de 4
            let i = 0;
            for (; i + 3 < len; i += 4) {
                sum += (inArr[i] & 1) * this.weights[i];
                sum += (inArr[i+1] & 1) * this.weights[i+1];
                sum += (inArr[i+2] & 1) * this.weights[i+2];
                sum += (inArr[i+3] & 1) * this.weights[i+3];
            }
            // Reste
            for (; i < len; i++) {
                sum += (inArr[i] & 1) * this.weights[i];
            }
        } else {
            for (let i = 0; i < len; i++) {
                sum += (inArr[i] & 1) * this.weights[i];
            }
        }

        return (sum >= this.threshold) | 0;
    }
}

export class MultiHeadAttentionBinary {
    constructor(dModel, nHeads) {
        this.nHeads = nHeads;
        this.dHead = Math.floor(dModel / nHeads);

        // Poids binaires pour Q, K, V
        this.Wq = new Array(nHeads);
        this.Wk = new Array(nHeads);
        this.Wv = new Array(nHeads);

        for (let h = 0; h < nHeads; h++) {
            this.Wq[h] = new Array(this.dHead);
            this.Wk[h] = new Array(this.dHead);
            this.Wv[h] = new Array(this.dHead);

            for (let i = 0; i < this.dHead; i++) {
                this.Wq[h][i] = Math.random() > 0.5 ? 1 : 0;
                this.Wk[h][i] = Math.random() > 0.5 ? 1 : 0;
                this.Wv[h][i] = Math.random() > 0.5 ? 1 : 0;
            }
        }
    }

    forward(x) {
        // Attention simplifiée: x est une séquence d'embeddings
        // Version binaire: on prend juste la moyenne pondérée
        const result = new Array(x.length);

        for (let i = 0; i < x.length; i++) {
            let sum = 0;
            for (let j = 0; j <= i; j++) {  // causal: ne regarde que le passé
                let similarity = 0;
                for (let k = 0; k < x[i].length; k++) {
                    similarity += (x[i][k] & x[j][k]);
                }
                if (similarity > 0) {
                    sum = (sum + 1) & 1;  // XOR cumulatif
                }
            }
            result[i] = new Array(x[i].length).fill(sum);
        }

        return result;
    }
}

/**
 * MÉMOIRE RELATIONNELLE PERSISTANTE (Bit Mémoriel)
 * Une structure qui n'oublie jamais et traite les relations sans perte.
 */
export class BitwiseRelationalMemory {
    constructor(contextSize = 64, tablePower = 22) { 
        this.contextSize = contextSize;
        this.mask = (1n << BigInt(contextSize)) - 1n;
        this.currentContext = 0n;

        this.tablePower = tablePower;
        this.tableSize = 1 << tablePower;
        // Stabilité du GC : Un seul gros objet Uint32Array au lieu de millions de Map nodes.
        // Chaque slot contient deux compteurs 32-bits [count0, count1].
        this.data = new Uint32Array(this.tableSize * 2);
    }

    _getHash(ctx) {
        // Hachage non-linéaire du contexte pour indexer la table
        let h = ctx ^ (ctx >> 17n) ^ (ctx >> 33n);
        return Number(h & BigInt(this.tableSize - 1));
    }

    /**
     * Enregistre une transition de bit sans perte d'information.
     */
    update(bit, weight = 1) {
        const h = this._getHash(this.currentContext);
        this.data[h * 2 + (bit & 1)] += weight;

        // --- ANTI-ÉCRASEMENT : Normalisation locale ---
        // Si le total des observations pour ce bit atteint un plafond (ex: 255)
        // on divise par 2. Cela préserve le RATIO (la structure) mais empêche
        // la dilution statistique par de nouvelles données massives.
        const total = this.data[h * 2] + this.data[h * 2 + 1];
        if (total > 255) {
            this.data[h * 2] >>= 1;
            this.data[h * 2 + 1] >>= 1;
        }

        // Mise à jour du "Bit Mémoriel" glissant
        this.currentContext = ((this.currentContext << 1n) | BigInt(bit & 1)) & this.mask;
    }

    /**
     * Avance le contexte sans modifier la mémoire (Utile pour injecter un seed).
     */
    shift(bit) {
        this.currentContext = ((this.currentContext << 1n) | BigInt(bit & 1)) & this.mask;
    }

    /**
     * Prédit le bit suivant avec une certitude absolue.
     * Renvoie null s'il n'y a pas de majorité stricte ou aucune donnée.
     */
    predictBit() {
        const h = this._getHash(this.currentContext);
        const c0 = this.data[h * 2];
        const c1 = this.data[h * 2 + 1];

        if (c0 === 0 && c1 === 0) return null; // Signal de contexte inconnu
        
        // Pour le "Perfect Score", on ne s'arrête que si le contexte est TOTALEMENT inconnu.
        return c1 >= c0 ? 1 : 0;
    }

    /**
     * Évalue la probabilité qu'une séquence de bits (ID) soit la suite logique du contexte.
     * @param {number} id L'ID à tester
     * @param {number} bitLen Nombre de bits (12 par défaut)
     */
    scoreId(id, bitLen = 12) {
        let score = 1.0;
        let tempContext = this.currentContext;
        for (let i = bitLen - 1; i >= 0; i--) {
            const h = this._getHash(tempContext);
            const c0 = this.data[h * 2];
            const c1 = this.data[h * 2 + 1];
            const total = c0 + c1;

            if (total === 0) { 
                score *= 0.01; // Pénalité massive pour les transitions jamais vues
            } else {
                const bit = (id >> i) & 1;
                // On favorise l'exclusivité : si un bit n'a jamais été vu dans ce contexte, score -> 0
                const count = (bit === 0) ? c0 : c1;
                score *= (count === 0) ? 0.001 : (count / total);
            }
            tempContext = ((tempContext << 1n) | BigInt((id >> i) & 1)) & this.mask;
        }
        return score;
    }

    /**
     * Retourne la probabilité pour le codage arithmétique (échelle 0-4096)
     */
    getProbability() {
        const h = this._getHash(this.currentContext);
        const c0 = this.data[h * 2];
        const c1 = this.data[h * 2 + 1];
        const total = c0 + c1;

        if (total === 0) return 2048; // Neutre
        return Math.floor(((c1 + 1) / (total + 2)) * 4096); // Laplace smoothing
    }

    /**
     * Retourne la probabilité exacte (sans perte) de voir un 1.
     */
    getConfidence() {
        const h = this._getHash(this.currentContext);
        const c0 = this.data[h * 2];
        const c1 = this.data[h * 2 + 1];
        const total = c0 + c1;
        if (total === 0) return 0.5;
        return c1 / total;
    }

    /**
     * Entraîne sur un flux de données complet (Uint8Array)
     */
    train(data) {
        this.resetContext(); // CRUCIAL : On repart de zéro pour chaque nouveau pattern
        for (const byte of data) {
            for (let i = 7; i >= 0; i--) {
                this.update((byte >> i) & 1);
            }
        }
    }

    reset(clearMemory = false) {
        this.currentContext = 0n;
        if (clearMemory) this.data.fill(0);
    }

    resetContext() { this.reset(false); }

    get memorySize() {
        let count = 0;
        for (let i = 0; i < this.data.length; i += 2) {
            if (this.data[i] > 0 || this.data[i + 1] > 0) count++;
        }
        return count;
    }

    /**
     * Restaure l'état de la table de compteurs
     */
    importState(stateData) {
        if (stateData) {
            // Sécurité : Si les dimensions de la mémoire importée ne correspondent pas
            // (ex: tablePower différent dans le fichier de stockage), on réalloue dynamiquement
            if (stateData.length !== this.data.length) {
                this.tableSize = stateData.length / 2;
                this.tablePower = Math.round(Math.log2(this.tableSize));
                this.data = new Uint32Array(stateData.length);
            }
            this.data.set(stateData);
        }
    }

    /**
     * Exporte les données pour la persistance JSON
     */
    exportState() {
        return Array.from(this.data);
    }
}

/**
 * COUCHE D'ATTENTION SÉMANTIQUE
 * Gère l'évolution des états des concepts et l'équivalence.
 */
export class SemanticAttentionLayer {
    constructor() {
        this.states = new Map(); // Concept (Ancre) -> { valeur, saillance, metadata }
        this.equivalences = new Map(); // Synonymes ou concepts liés
        
        // Matrice de corrélation bit à bit (ID -> ID)
        // Utilise un Uint32Array pour compter les co-occurrences entre IDs
        this.correlationMatrix = new Map(); 
    }

    /**
     * Apprend la corrélation sémantique avec notion de distance (Attention Propagation).
     * Plus deux mots sont proches dans la phrase, plus leur lien est fort.
     */
    correlate(ids, weight = 1, maxWindow = 15) {
        // Sécurité : Si la phrase est anormalement longue, on évite le O(N^2) total
        for (let i = 0; i < ids.length; i++) {
            // Fenêtre glissante limitée : la corrélation sémantique au-delà de 15 mots est souvent du bruit
            const start = Math.max(0, i - maxWindow);
            const end = Math.min(ids.length, i + maxWindow);
            
            for (let j = start; j < end; j++) {
                if (i === j) continue;
                const a = ids[i], b = ids[j];
                
                const distance = Math.abs(i - j);
                const attentionWeight = (1.0 / distance) * weight;

                if (!this.correlationMatrix.has(a)) this.correlationMatrix.set(a, new Map());
                const targets = this.correlationMatrix.get(a);
                
                // Propagation : On cumule l'énergie sémantique
                const currentEnergy = targets.get(b) || 0;
                targets.set(b, currentEnergy + attentionWeight);
            }
        }
    }

    /**
     * Propage l'énergie entre les concepts pour créer des liens indirects (Résonance).
     * Si A est lié à B et B est lié à C, alors un lien A -> C est créé/renforcé.
     * Permet l'émergence de relations non explicitement citées.
     * @param {number} factor Amortissement de la propagation (0.0 à 1.0)
     * @param {number} minThreshold Seuil minimum pour créer un lien
     */
    propagateResonance(factor = 0.1, minThreshold = 0.2) {
        const newLinks = new Map();

        // On ne travaille que sur les liens déjà existants
        for (const [idA, targetsA] of this.correlationMatrix) {
            // OPTIMISATION : On ignore les "Hubs" (mots de liaison comme "le", "de", "et") 
            // qui saturent le graphe sans apporter de sens unique.
            if (targetsA.size > 80) continue; 

            for (const [idB, energyAB] of targetsA) {
                if (energyAB < minThreshold) continue;

                const targetsB = this.correlationMatrix.get(idB);
                if (!targetsB || targetsB.size > 80) continue;

                for (const [idC, energyBC] of targetsB) {
                    if (idA === idC || energyBC < minThreshold) continue;

                    const indirectEnergy = energyAB * energyBC * factor;
                    
                    // On ne retient que l'énergie significative
                    if (indirectEnergy < minThreshold) continue;

                    if (!newLinks.has(idA)) newLinks.set(idA, new Map());
                    const potentialLinks = newLinks.get(idA);
                    potentialLinks.set(idC, (potentialLinks.get(idC) || 0) + indirectEnergy);
                }
            }
        }

        // Fusion des résonances dans la matrice principale
        for (const [idA, links] of newLinks) {
            if (!this.correlationMatrix.has(idA)) this.correlationMatrix.set(idA, new Map());
            const targets = this.correlationMatrix.get(idA);
            for (const [idC, energy] of links) {
                targets.set(idC, (targets.get(idC) || 0) + energy);
            }
        }
        
        // Nettoyage périodique pour éviter la saturation mémoire
        this.pruneMatrix(minThreshold);
    }

    /**
     * Supprime les liens faibles pour garder le graphe léger et réactif
     */
    pruneMatrix(minThreshold = 0.1) {
        for (const [idA, targets] of this.correlationMatrix) {
            for (const [idB, energy] of targets) {
                if (energy < minThreshold) targets.delete(idB);
            }
            if (targets.size === 0) this.correlationMatrix.delete(idA);
        }
    }

    /**
     * Calcule le "poids de probabilité" pour chaque bit (0-11).
     * @param {number[]} activeIds Fenêtre de tokens récents (Attention Locale)
     * @param {number[]} identityIds IDs de Persona (Bias)
     * @param {number[]} queryIds IDs de la question initiale (Attention Globale Persistante)
     */
    getBitBias(activeIds, identityIds = [], queryIds = []) {
        const posBias = new Float32Array(12).fill(0);
        const negBias = new Float32Array(12).fill(0);
        let totalWeight = 0;

        // 1. Attention Globale (La Question)
        // Elle reste allumée avec une force constante pour guider chaque mot généré.
        queryIds.forEach(id => {
            const weight = 1.2;
            this._applyBias(id, weight, posBias, negBias);
            totalWeight += weight;
            // La question propage son attention vers les concepts liés
            this._applyCorrelationBias(id, 0.2, posBias, negBias, (w) => totalWeight += w);
        });

        // 2. Attention d'Identité (Le Persona) - APPLICATION GLOBALE
        // On injecte l'identité comme un biais persistant, même si le mot n'est pas encore dit.
        identityIds.forEach(id => {
            const weight = 15.0; // Augmenté pour dominer les probabilités grammaticales ambiguës
            this._applyBias(id, weight, posBias, negBias);
            totalWeight += weight;
            
            // Propagation plus forte vers les concepts liés (ex: explorateur -> horizon)
            this._applyCorrelationBias(id, 0.8, posBias, negBias, (w) => totalWeight += w);
        });

        // 3. Attention Locale (Contexte glissant)
        activeIds.forEach((id, index) => {
            const weight = 3.0 * (index + 1) / (activeIds.length || 1);
            this._applyBias(id, weight, posBias, negBias);
            totalWeight += weight;
            this._applyCorrelationBias(id, 0.1, posBias, negBias, (w) => totalWeight += w);
        });

        const finalBias = new Float32Array(12);
        for (let b = 0; b < 12; b++) finalBias[b] = posBias[b] - negBias[b];
        return { bias: finalBias, totalWeight };
    }

    _applyBias(id, weight, posBias, negBias) {
        for (let b = 0; b < 12; b++) {
            // "Bit Final" Resolution: Les bits de poids faible (0-5) sont les plus 
            // discriminants pour les IDs incrémentaux. On booste leur importance.
            const resolutionBoost = 1.0 + ((11 - b) / 22); 
            const w = weight * resolutionBoost;

            if ((id >> b) & 1) posBias[b] += w; 
            else negBias[b] += w * 0.05; // Contraste 20:1 pour une sélectivité chirurgicale
        }
    }

    _applyCorrelationBias(id, multiplier, posBias, negBias, weightAdder) {
        const correlations = this.correlationMatrix.get(id);
        if (!correlations) return;
        for (const [correlatedId, strength] of correlations) {
            const effectiveWeight = strength * multiplier;
            this._applyBias(correlatedId, effectiveWeight, posBias, negBias);
            weightAdder(effectiveWeight);
        }
    }

    /**
     * Définit ou met à jour l'état d'un concept.
     * Permet à "Batterie" de rester l'ancre pendant que la valeur évolue.
     */
    updateState(anchor, value, saillance = 1.0) {
        const currentState = this.states.get(anchor) || { history: [] };
        
        // On garde une trace de l'évolution (linéarité temporelle)
        if (currentState.valeur !== value) {
            currentState.history.push({ valeur: currentState.valeur, t: Date.now() });
        }

        this.states.set(anchor, {
            ...currentState,
            valeur: value,
            saillance,
            lastUpdate: Date.now()
        });
    }

    /**
     * Définit que 'A' équivaut à 'B' pour le pont d'action
     */
    setEquivalence(concept, targetConcept) {
        this.equivalences.set(concept, targetConcept);
    }

    getResolvedState(concept) {
        const target = this.equivalences.get(concept) || concept;
        return this.states.get(target);
    }

    /**
     * Retourne les concepts les plus "brillants" (saillants) actuellement
     */
    getActiveFocus(threshold = 0.5) {
        return Array.from(this.states.entries())
            .filter(([_, data]) => data.saillance >= threshold)
            .sort((a, b) => b[1].saillance - a[1].saillance);
    }

    decay(factor = 0.95) {
        for (let [key, data] of this.states) {
            data.saillance *= factor;
        }
    }
}

/**
 * MÉMOIRE RELATIONNELLE SÉMANTIQUE
 * Aligne la structure bit à bit sur des unités de sens (Tokens).
 */
export class SemanticRelationalMemory {
    constructor(contextSize = 16) {
        // On utilise la mémoire bitwise comme moteur de transition
        this.bitEngine = new BitwiseRelationalMemory(contextSize * 12); 
        this.vocabulary = new Map(); // Mot -> ID binaire
        this.reverseVocab = new Map(); // ID binaire -> Mot

        // Initialisation des jetons système pour la gestion des séquences
        this.vocabulary.set("<pad>", 0);
        this.vocabulary.set("<unk>", 1);
        this.vocabulary.set("<eos>", 2);
        this.reverseVocab.set(0, "<pad>");
        this.reverseVocab.set(1, "<unk>");
        this.reverseVocab.set(2, "<eos>");

        this.nextId = 3;
        this.attention = null;
        // Nouvelle couche : Schémas de transition (Grammaire) - Stocke des trigrammes (A, B) -> C
        this.grammarMap = new Map(); // ID -> Map(SuivantID -> Poids)
        // Regex centralisée supportant les accents et l'élision
        this.tokenizer = /[a-z0-9àâäéèêëïîôöùûüç]+(?:['][a-z0-9àâäéèêëïîôöùûüç]*)?|[^\w\s]/gi;

        // --- ANALYSE DE STRUCTURE PAR RÉPÉTITION ---
        this.wordCounts = new Map(); // ID -> Fréquence globale
        this.totalTokensProcessed = 0;
    }

    attachAttention(layer) {
        this.attention = layer;
    }

    /**
     * Charge un état complet (Vocabulaire + BitEngine)
     */
    importState(state) {
        if (!state.vocab || !state.bitEngine) throw new Error("Format de stockage invalide");
        this.grammarMap = new Map(); // Reset ou charger si présent
        this.vocabulary = new Map(state.vocab);
        this.reverseVocab = new Map();
        this.nextId = 3; 
        for (let [word, id] of this.vocabulary) {
            this.reverseVocab.set(id, word);
            if (id >= this.nextId) this.nextId = id + 1;
        }
        
        if (state.wordCounts) {
            this.wordCounts = new Map(state.wordCounts);
            this.totalTokensProcessed = Array.from(this.wordCounts.values()).reduce((a, b) => a + b, 0);
        }

        // Sécurité : s'assurer que les jetons système sont présents dans l'import
        if (!this.vocabulary.has("<eos>")) {
            this.vocabulary.set("<eos>", 2);
            this.reverseVocab.set(2, "<eos>");
        }

        if (state.grammar) {
            for (const [id, targets] of state.grammar) {
                this.grammarMap.set(id, new Map(targets));
            }
        }

        if (state.bitEngine && state.bitEngine.data) {
            this.bitEngine.importState(new Uint32Array(state.bitEngine.data));
        }
    }

    /**
     * Exporte l'intégralité du cerveau (Vocabulaire + Poids binaires)
     */
    exportState() {
        return {
            vocab: Array.from(this.vocabulary.entries()),
            bitEngine: { data: this.bitEngine.exportState() },
            grammar: Array.from(this.grammarMap.entries()).map(([id, targets]) => [id, Array.from(targets.entries())]),
            wordCounts: Array.from(this.wordCounts.entries())
        };
    }

    /**
     * Transforme une phrase en unités de sens avant de les mémoriser
     * @param {string} sentence La phrase à apprendre
     * @param {boolean} resetContext Si vrai, oublie le contexte précédent (défaut: true)
     * @param {number} weight Poids de l'apprentissage
     */
    learnSense(sentence, resetContext = true, weight = 1) {
        const tokens = sentence.match(this.tokenizer) || [];
        if (tokens.length === 0) return;

        // Ajout du jeton de fin pour que le réseau apprenne à "fermer" la phrase
        tokens.push("<eos>");
        
        if (resetContext) this.bitEngine.resetContext();
        const ids = [];
        
        this._ingestTokens(tokens, ids, weight);

        // Automatisation : On corrèle tous les IDs de la phrase entre eux dans la matrice
        if (this.attention) this.attention.correlate(ids, weight);
    }

    /**
     * Ingestre un texte long en le découpant par ponctuation.
     * NETTOYAGE DE L'ENTRAÎNEMENT : Filtre les listes de noms et métadonnées.
     */
    learnText(text, continuous = false, weight = 1) {
        // Découpage par phrases (., !, ?)
        const sentences = text.split(/(?<=[.!?])(?:\s+|\n+|$)/);
        
        sentences.forEach((s, index) => {
            const cleanS = s.trim();
            if (!cleanS || cleanS.length < 5) return;

            // --- FILTRAGE DE BRUIT ---
            const tokens = cleanS.match(this.tokenizer) || [];
            if (tokens.length < 3) return; 

            // Heuristique 1 : Détection de listes (Trop de virgules par rapport au nombre de mots)
            const commaCount = (cleanS.match(/,/g) || []).length;
            if (commaCount / tokens.length > 0.35) return; 

            // Heuristique 2 : Détection de métadonnées/bruit technique (mots mixant chiffres et lettres)
            const technicalWords = tokens.filter(t => /[0-9]/.test(t) && /[a-z]/i.test(t)).length;
            if (technicalWords / tokens.length > 0.2) return;

            // Heuristique 3 : Détection de "miettes" 
            // On déduit dynamiquement si un mot court est structurel ou juste du bruit
            const noiseWords = tokens.filter(t => t.length < 3 && /[a-z0-9]/.test(t) && !this.isStructural(t)).length;
            
            // On est plus strict sur le vrai bruit (25%) mais on ignore les connecteurs
            if (noiseWords / tokens.length > 0.25) return;

            // Heuristique 4 : Détection d'IDs numériques (Gros nombres isolés ou dates techniques)
            const numericIds = tokens.filter(t => /^\d{3,}$/.test(t)).length;
            if (numericIds / tokens.length > 0.15) return; 

            const shouldReset = index === 0 || !continuous;
            this.learnSense(cleanS, shouldReset, weight);
        });
    }

    _ingestTokens(tokens, ids, weight = 1) {
        let prevPrevId = null; // Pour les trigrammes
        let prevId = null;     // Pour les trigrammes
        for (const token of tokens) {
            let id = this.vocabulary.get(token);
            if (id === undefined) {
                id = this.nextId++;
                this.vocabulary.set(token, id);
                this.reverseVocab.set(id, token);
            }
            
            ids.push(id);

            // Mise à jour de la statistique de répétition (Deduction des connecteurs)
            const currentCount = this.wordCounts.get(id) || 0;
            this.wordCounts.set(id, currentCount + weight);
            this.totalTokensProcessed += weight;

            // 1. Enregistrement Bigramme (A -> B)
            if (prevId !== null) {
                if (!this.grammarMap.has(prevId)) this.grammarMap.set(prevId, new Map());
                const bigramTransitions = this.grammarMap.get(prevId);
                bigramTransitions.set(id, (bigramTransitions.get(id) || 0) + weight);

                // Normalisation Bigramme
                if (bigramTransitions.size > 50) { 
                    this._normalizeGrammarMap(bigramTransitions);
                }

                // 2. Enregistrement Trigramme (A + B -> C)
                if (prevPrevId !== null) {
                    const contextKey = `${prevPrevId}-${prevId}`;
                    if (!this.grammarMap.has(contextKey)) this.grammarMap.set(contextKey, new Map());
                    const trigramTransitions = this.grammarMap.get(contextKey);
                    trigramTransitions.set(id, (trigramTransitions.get(id) || 0) + weight);

                    // Normalisation Trigramme
                    if (trigramTransitions.size > 20) {
                        this._normalizeGrammarMap(trigramTransitions);
                    }
                }
            }

            // On injecte l'ID du token (l'unité de sens) dans le moteur de bits
            prevPrevId = prevId; // Décale les IDs pour la prochaine itération
            this._updateId(id, weight);
            prevId = id;         // Le mot actuel devient le mot précédent
        }
    }

    /**
     * Déduit si un mot appartient à la structure répétitive du langage (Connecteur)
     * basé sur sa fréquence d'apparition globale.
     */
    isStructural(idOrWord) {
        let id = typeof idOrWord === 'string' ? this.vocabulary.get(idOrWord) : idOrWord;
        if (id === undefined) return false;

        // Un mot est considéré comme structurel s'il représente plus de 0.5% du corpus
        // ou s'il fait partie du socle de base si le corpus est trop petit.
        if (this.totalTokensProcessed < 500) {
            const word = this.reverseVocab.get(id);
            return word && ['et', 'ou', 'le', 'la', 'un', 'une', 'de', 'à', 'est', 'a'].includes(word.toLowerCase());
        }

        const count = this.wordCounts.get(id) || 0;
        return (count / this.totalTokensProcessed) > 0.005;
    }

    /**
     * Empêche une structure de devenir statistiquement insignifiante
     * en plafonnant la somme des poids d'un contexte.
     */
    _normalizeGrammarMap(map) {
        let total = 0;
        for (let v of map.values()) total += v;
        if (total < 100) return;
        for (let [k, v] of map) map.set(k, Math.max(1, Math.floor(v * 0.5)));
    }

    /**
     * Prédit la suite non pas par lettre, mais par concept
     * @param {Object} options { depth, focusBias: Map<ID, weight> }
     */
    predictSense(seedSentence, depth = 10, options = {}) {
        const tokens = seedSentence.match(this.tokenizer) || [];
        this.bitEngine.resetContext();
        
        const activeIds = [];
        const queryIds = tokens.map(t => this.vocabulary.get(t) || 0).filter(id => id > 0);
        const identityIds = [];
        const isQuestion = seedSentence.includes('?');

        if (options.identity) {
            const roles = options.identity.split(/\s+/);
            roles.forEach(role => {
                let id = this.vocabulary.get(role);
                // Fallback insensible à la casse pour le biais d'identité
                if (id === undefined) {
                    for (let [word, vocId] of this.vocabulary) {
                        if (word.toLowerCase() === role.toLowerCase()) {
                            identityIds.push(vocId);
                            break;
                        }
                    }
                } else {
                    identityIds.push(id);
                }
            });
        }

        // Préchauffage avec le sens de l'amorce
        for (const token of tokens) {
            const id = this.vocabulary.get(token) || 1; // 1 = <unk>
            if (id > 1) { // On ignore <pad> et <unk> pour l'attention
                activeIds.push(id);
                // On limite la fenêtre d'attention aux 2 derniers mots pour le contexte trigramme
                if (activeIds.length > 2) activeIds.shift();
            }
            this._shiftId(id);
        }

        const attLayer = options.attention || this.attention;
        let result = [];
        const wordCounts = new Map();
        const creativity = (options.creativity !== undefined) ? options.creativity : 0.01; 
        let rollingConfidence = 1.0;
        const topK = options.topK || 5;

        let lastId = activeIds[activeIds.length - 1] || null;
        let lastWord = lastId ? this.reverseVocab.get(lastId) : "";
        let lastWasConnector = this.isStructural(lastId);
        let lastWasPunctuation = ['.', ',', ';', '!', '?'].includes(lastWord);
        
        // --- OPTIMISATION : Analyse du contexte hors-boucle ---
        let trigramContext = null;
        if (activeIds.length >= 2) {
            const trigramKey = `${activeIds[activeIds.length - 2]}-${activeIds[activeIds.length - 1]}`;
            trigramContext = this.grammarMap.get(trigramKey);
        }
        const bigramKey = activeIds[activeIds.length - 1];
        let bigramContext = this.grammarMap.get(bigramKey);

        for (let i = 0; i < depth; i++) {
            const candidates = [];

            const hasTrigramOptions = trigramContext && trigramContext.size > 0;
            const hasBigramOptions = bigramContext && bigramContext.size > 0;
            
            // Itère sur tous les mots du vocabulaire pour trouver les candidats
            for (let [word, id] of this.vocabulary) {
                // Ignore l'ID 0 (souvent <PAD> ou <UNK>)
                if (id === 0) continue;

                const isConnector = this.isStructural(id);
                
                // 1. Probabilité de Transition Bitwise (Mémoire Verbatim)
                // CORRECTIF : Normalisation Géométrique.
                // scoreId est un produit de 12 probabilités (une par bit).
                // Pour rester sur une échelle 0.0 - 1.0 comparable à la grammaire, 
                // on extrait la racine 12ème. Sans cela, 0.9^12 = 0.28 (trop faible).
                const rawProb = this.bitEngine.scoreId(id);
                const transitionProb = Math.pow(rawProb, 1 / 12);

                // Pondération dynamique de transitionProb basée sur la créativité
                // Quand creativity est 0, transitionWeight est 10.0. Quand creativity est 1.0, transitionWeight est 4.0.
                const transitionWeight = 4.0 + ((1.0 - creativity) * 6.0);

                // 2. Score de Schéma (BACK-OFF HIÉRARCHIQUE : Tri > Bi > Raw)
                let grammarWeight = 0;
                let totalStructuralWeight = 1;
                let trigramHit = false;
                let bigramHit = false;

                // Tentative Trigramme (Priorité absolue)
                if (hasTrigramOptions && trigramContext.has(id)) {
                    grammarWeight = trigramContext.get(id) * 50.0; // Boost Trigramme massif
                    totalStructuralWeight = Array.from(trigramContext.values()).reduce((a,b)=>a+b, 0);
                    trigramHit = true;
                }

                // Fallback Bigramme (Si pas de hit Trigramme)
                if (!trigramHit && hasBigramOptions && bigramContext.has(id)) {
                    grammarWeight = bigramContext.get(id) * 5.0;
                    totalStructuralWeight = Array.from(bigramContext.values()).reduce((a,b)=>a+b, 0);
                    bigramHit = true;
                }

                let grammarScore = grammarWeight / (totalStructuralWeight || 1);
                const isVerbatim = transitionProb > verbatimThreshold;

                // --- LOGIQUE MSB (Most Significant Bit) : FILTRE DE COHÉRENCE ---
                let structuralPenalty = 1.0;
                // Si une structure est connue (Trigramme ou Bigramme), tout candidat hors-structure est éliminé
                if (!trigramHit && hasTrigramOptions) structuralPenalty *= 0.000001; 
                if (!trigramHit && !bigramHit && hasBigramOptions) structuralPenalty *= 0.00001;

                // 2.5 Logique de Restitution Verbatim (Ancrage)

                // Si aucun lien structurel et pas de verbatim, on pénalise lourdement pour éviter l'hallucination
                if (!trigramHit && !bigramHit && !isVerbatim) structuralPenalty *= 0.0000001;

                const verbatimBoost = isVerbatim ? 100.0 : 1.0; // Boost Verbatim augmenté
                // Seuil de "Verbatim" dynamique basé sur la créativité
                const verbatimThreshold = 0.92 - (creativity * 0.1); // Plus de créativité = seuil plus bas
                // --- BIAIS DE FLUX GRAMMATICAL (NOUVEAU) ---
                let flowBias = 1.0;
                // 1. Si on a un hit grammatical sur un connecteur, on le booste (fluidité)
                if (isConnector && (trigramHit || bigramHit)) flowBias *= 2.5;
                // 2. Interdiction : Pas de ponctuation ou de connecteur juste après un connecteur (ex: "et ." ou "mais et")
                if (lastWasConnector && (['.', ',', ';', '!', '?'].includes(word) || isConnector)) flowBias *= 0.001;
                // 3. Relance : Après une virgule, on favorise les connecteurs ou les sujets
                if (lastWord === ',' && isConnector) flowBias *= 1.5;
                // 4. Évitement : Ne pas finir une phrase sur un connecteur
                if (word === "<eos>" && lastWasConnector) flowBias *= 0.01;

                // 3. Score de Contexte (Attention & Identité)
                let contextBoost = 1.0;
                // L'attention est moins prioritaire en mode Verbatim pour éviter la déviation
                const effectiveAttention = (isVerbatim && creativity < 0.05) ? 0.2 : 1.0;
                
                if (attLayer && effectiveAttention > 0 && (activeIds.length > 0 || identityIds.length > 0 || queryIds.length > 0)) {
                    const { bias, totalWeight } = attLayer.getBitBias(activeIds, identityIds, queryIds);
                    if (totalWeight > 0) {
                        let bitMatch = 0;
                        for (let b = 0; b < 12; b++) {
                            bitMatch += ((id >> b) & 1) ? bias[b] : -bias[b];
                        }
                        // Si c'est une question, on augmente radicalement l'importance de l'attention globale
                        const queryStrength = isQuestion ? 0.4 : 0.2;
                        contextBoost = Math.exp(Math.max(-4.0, Math.min(6.0, (bitMatch / (totalWeight * queryStrength)) * effectiveAttention)));
                        
                        // Courbe de boost plus raide (0.2) et plage élargie (-4 à 6)
                    }
                }

                // Fusion des scores : Grammaire (Schéma) + Bitwise (Précision) + Attention
                let score = (grammarScore + transitionProb * transitionWeight) * contextBoost * verbatimBoost * structuralPenalty * flowBias;

                // --- LOGIQUE DE FIN (SENSATION DE FIN DE PROPOS) ---
                // Si c'est un hit structurel, c'est presque certainement la fin de phrase voulue
                if (word === "<eos>") {
                    if (trigramHit) score *= 100.0; // Priorité absolue à la fin apprise
                    else if (bigramHit) score *= 20.0;
                    else if (transitionProb > 0.8) score *= 10.0;
                }

                // 4. Filtre de bruit sémantique (Heuristique)
                // On pénalise les balises HTML communes et les identifiants techniques (mixte lettres/chiffres)
                if (['div', 'span', 'class', 'id', 'href', 'width', 'height', 'style', 'mw', 'parser', 'output', 'ch', 'sc', 'sc2', 'sc3', 'en', 'http', 'www', 'oldid', 'news', 'title', 'index', 'php'].includes(word)) score *= 0.000001;
                if (word.length > 20) score *= 0.1; // Mots anormalement longs
                
                // Filtre anti-nombre strict
                if (/[0-9]/.test(word)) score *= 0.0000001; 
                
                // PÉNALITÉ DE RÉPÉTITION (Dynamique)
                // On réduit la pénalité pour les connecteurs pour permettre "Le chat et le chien"
                const count = wordCounts.get(word) || 0;
                if (count > 0) score *= isConnector ? 0.5 : Math.pow(0.001, count);
                
                // Anti-bégaiement immédiat (Moins sévère pour les connecteurs)
                if (word.length <= 3 && result.slice(-3).includes(word)) score *= isConnector ? 0.1 : 0.01;
                if (result.length > 0 && result[result.length - 1] === word) score *= 0.0001;

                candidates.push({ id, word, score });
            }

            if (candidates.length === 0) break;

            candidates.sort((a, b) => b.score - a.score);

            // --- DÉTECTION DE FIN DE COHÉRENCE ---
            // On calcule la confiance relative du meilleur candidat
            const topScore = candidates[0].score;
            rollingConfidence = (rollingConfidence * 0.8) + (Math.min(1.0, topScore / 10) * 0.2);

            // Si la confiance chute trop bas ou si le score est dérisoire, on arrête
            if (topScore < 1e-11 || (i > 5 && rollingConfidence < 0.05)) {
                break; 
            }
            
            // En mode déterministe (créativité basse), on force le Top 1
            let selectionLimit = creativity < 0.05 ? 1 : topK;
            let topKCandidates = candidates.slice(0, selectionLimit);

            if (result.length < 2) {
                topKCandidates.forEach(c => {
                    if (['.', '!', '?'].includes(c.word)) {
                        c.score *= 0.0001;
                    }
                });
            }

            // Normalisation des Top-K avec la température (créativité)
            const temperature = Math.max(0.01, creativity);
            let adjustedCandidates = topKCandidates.map(c => ({
                ...c,
                prob: Math.pow(c.score, 1 / temperature)
            }));
            
            // Recalcul de la somme des probabilités ajustées (Crucial pour la Roulette)
            let totalScore = adjustedCandidates.reduce((acc, c) => acc + c.prob, 0);
            if (totalScore <= 0 || isNaN(totalScore)) break;

            // Sélection stochastique (Roulette)
            let pick = Math.random() * totalScore;
            let selected = adjustedCandidates[0];
            for (const cand of adjustedCandidates) {
                pick -= cand.prob;
                if (pick <= 0) { selected = cand; break; }
            }

            const word = selected.word;
            // Signal d'arrêt : si le mot sélectionné est le jeton de fin, on stoppe
            if (word === "<eos>") break;
            result.push(word);
            lastId = selected.id;
            wordCounts.set(word, (wordCounts.get(word) || 0) + 1);

            // Mise à jour de l'état du flux pour le mot suivant
            lastWord = word;
            lastWasConnector = this.isStructural(selected.id);
            lastWasPunctuation = ['.', ',', ';', '!', '?'].includes(word);
            
            // Propagation de l'attention : On ajoute le mot généré au contexte actif
            activeIds.push(selected.id);
            if (activeIds.length > 2) activeIds.shift(); // Maintient la fenêtre de 2 IDs pour le trigramme

            this._shiftId(selected.id);

            // Mise à jour du contexte pour l'itération suivante
            if (activeIds.length >= 2) {
                const nextTrigramKey = `${activeIds[activeIds.length - 2]}-${activeIds[activeIds.length - 1]}`;
                trigramContext = this.grammarMap.get(nextTrigramKey);
            }
            const nextBigramKey = activeIds[activeIds.length - 1];
            bigramContext = this.grammarMap.get(nextBigramKey);
        }
        return result.join(' ');
    }

    _updateId(id, weight = 1) {
        // On décompose l'ID (le sens) en 12 bits pour le moteur
        for (let i = 11; i >= 0; i--) {
            this.bitEngine.update((id >> i) & 1, weight);
        }
    }

    _shiftId(id) {
        for (let i = 11; i >= 0; i--) {
            this.bitEngine.shift((id >> i) & 1);
        }
    }
}

/**
 * PRÉDICTEUR NEURONAL DÉTERMINISTE (Le "Cerveau" du Compresseur)
 * Version Ultra-Compacte : Remplace la Map par une table de probabilités 8-bits hachée.
 * Réduit l'empreinte mémoire de ~98% par rapport à une Map sérialisée en JSON.
 */
class NeuralBitPredictor {
    constructor(contextSize = 16, tablePower = 18) {
        this.contextSize = contextSize;
        this.context = 0n; // Utilisation de BigInt pour dépasser 32 bits
        this.mask = (1n << BigInt(contextSize)) - 1n;
        
        // Allocation d'une table fixe (2^18 = 256 KB)
        this.tableSize = 1 << tablePower;
        this.table = new Uint8Array(this.tableSize).fill(128); // 128 = probabilité 0.5 (neutre)
    }

    _getHash() {
        // Hachage non-linéaire du contexte pour indexer la table
        let h = this.context ^ (this.context >> 17n) ^ (this.context >> 33n);
        return Number(h & BigInt(this.tableSize - 1));
    }

    predictBit() {
        return this.table[this._getHash()] > 128 ? 1 : 0;
    }

    getProbability() {
        // Échelle 0-4096 pour le compresseur arithmétique
        return (this.table[this._getHash()] << 4);
    }

    /**
     * Met à jour le cerveau après avoir vu le bit réel
     */
    update(bit) {
        const h = this._getHash();
        let state = this.table[h];

        // Apprentissage par renforcement de l'état (Maillage de poids temporel)
        if (bit === 1) {
            this.table[h] = Math.min(255, state + (state < 220 ? 8 : 1));
        } else {
            this.table[h] = Math.max(0, state - (state > 35 ? 8 : 1));
        }

        // Mise à jour du contexte (Shift register en BigInt)
        // On injecte le nouveau bit et on applique le masque de taille contextSize
        this.context = ((this.context << 1n) | BigInt(bit)) & this.mask;
    }

    /**
     * Avance le contexte sans modifier la mémoire.
     */
    shift(bit) {
        this.context = ((this.context << 1n) | BigInt(bit)) & this.mask;
    }

    /**
     * Capture l'état actuel de la mémoire pour synchronisation
     */
    getState() {
        return this.table; // Export binaire direct (très léger)
    }

    /**
     * Restaure un état de mémoire précis
     */
    setState(buffer) {
        if (buffer instanceof Uint8Array) this.table.set(buffer);
    }

    /**
     * @param {boolean} clearMemory Si vrai, efface tout ce qui a été appris. 
     * Sinon, réinitialise seulement le contexte glissant.
     */
    reset(clearMemory = false) {
        this.context = 0n;
        if (clearMemory) this.table.fill(128);
    }
}

/**
 * COMPRESSEUR ARITHMÉTIQUE NEURONAL (Sans Destruction)
 * Transforme les prédictions en un flux binaire compact et réversible.
 */
export class BitwiseLosslessCompressor {
    constructor(contextSize = 12, useRelational = false) {
        // Le mode relational utilise la Map (Bit Mémoriel) au lieu du tableau fixe
        this.predictor = useRelational 
            ? new BitwiseRelationalMemory(contextSize)
            : new NeuralBitPredictor(contextSize);
        this.PRECISION = 32n;
        this.MAX_RANGE = (1n << this.PRECISION) - 1n;
    }

    /**
     * Entraîne le réseau sur un bloc de données sans produire de sortie.
     * Utile pour "nourrir" le cerveau avant compression ou restitution.
     */
    train(data) {
        const bits = this._toBitArray(data);
        for (const bit of bits) {
            this.predictor.update(bit);
        }
        this.predictor.reset(false); // On reset le contexte, pas la mémoire
    }

    /**
     * Restitue la suite d'un message à partir d'une amorce (seed).
     * @param {string|Uint8Array} seed L'amorce du texte
     * @param {number} bytesToPredict Nombre d'octets à générer
     * @param {boolean} verbose Si vrai, affiche les scores de confiance
     */
    complete(seed, bytesToPredict, verbose = false) {
        const input = typeof seed === 'string' ? new TextEncoder().encode(seed) : seed;
        const seedBits = this._toBitArray(input);
        
        this.predictor.reset(false);
        // On injecte l'amorce pour caler le contexte
        for (const bit of seedBits) {
            this.predictor.shift(bit);
        }

        let resultBits = [];
        for (let i = 0; i < bytesToPredict * 8; i++) {
            let bit = this.predictor.predictBit();
            
            // Arrêt immédiat dès que la certitude est rompue
            if (bit === null) {
                if (verbose) console.log(`      [Predict] Fin de certitude au bit ${i}`);
                break; 
            }
            
            if (verbose && i % 8 === 0) {
                const prob = ((this.predictor.getProbability() / 4096) * 100).toFixed(1);
                console.log(`      [Predict] Byte ${Math.floor(i/8)}: P(1)=${prob}% -> Choix: ${bit}`);
            }

            resultBits.push(bit);
            
            // Avance le contexte sans modifier les statistiques mémorisées
            this.predictor.shift(bit);
        }

        return new Uint8Array(this._packBits(resultBits));
    }

    getState() {
        return this.predictor.getState();
    }

    setState(state) {
        this.predictor.setState(state);
    }

    reset(clearMemory = false) {
        this.predictor.reset(clearMemory);
    }

    /**
     * Compresse un Uint8Array en un flux de bits compact.
     */
    compress(data) {
        this.predictor.reset(false);
        let low = 0n;
        let high = this.MAX_RANGE;
        let pendingBits = 0;
        let output = []; // Pour simplifier, on stocke en tableau de bits
        
        const bits = this._toBitArray(data);
        const half = 1n << (this.PRECISION - 1n);
        const quarter = 1n << (this.PRECISION - 2n);
        
        for (const bit of bits) {
            let prob1 = BigInt(this.predictor.getProbability());
            const range = high - low + 1n;
            
            // Sécurité : évite l'effondrement de la plage sur les très petits segments
            let split = (range * (4096n - prob1)) / 4096n;
            if (split <= 0n) split = 1n;
            if (split >= range) split = range - 1n;
            const mid = low + split - 1n;

            if (bit === 0) high = mid;
            else low = mid + 1n;

            // Renormalisation avec gestion de l'underflow (E3 mapping)
            while (true) {
                if (high < half) {
                    this._emitBit(0, pendingBits, output);
                    pendingBits = 0;
                } else if (low >= half) {
                    this._emitBit(1, pendingBits, output);
                    pendingBits = 0;
                    low -= half;
                    high -= half;
                } else if (low >= quarter && high < 3n * quarter) {
                    pendingBits++;
                    low -= quarter;
                    high -= quarter;
                } else {
                    break;
                }
                low = (low << 1n) & this.MAX_RANGE;
                high = ((high << 1n) | 1n) & this.MAX_RANGE;
            }
            
            this.predictor.update(bit);
        }
        
        // Finalisation (Flush) : On garantit que le décodeur reçoit assez de bits 
        // pour terminer la lecture du dernier caractère.
        pendingBits++;
        if (low < quarter) this._emitBit(0, pendingBits, output);
        else this._emitBit(1, pendingBits, output);

        return new Uint8Array(this._packBits(output));
    }

    /**
     * Décompresse et restitue l'original mot pour mot.
     */
    decompress(compressedData, originalLength) {
        this.predictor.reset(false);
        const bits = this._toBitArray(compressedData);
        let low = 0n;
        let high = this.MAX_RANGE;
        let value = 0n;

        const half = 1n << (this.PRECISION - 1n);
        const quarter = 1n << (this.PRECISION - 2n);
        
        // Initialisation de la fenêtre de lecture
        let bitIdx = 0;
        for (let i = 0; i < Number(this.PRECISION); i++) {
            value = (value << 1n) | BigInt(bits[bitIdx++] || 0);
        }

        let decodedBits = [];
        const totalBits = originalLength * 8;

        for (let i = 0; i < totalBits; i++) {
            let prob1 = BigInt(this.predictor.getProbability());
            const range = high - low + 1n;
            
            let split = (range * (4096n - prob1)) / 4096n;
            if (split <= 0n) split = 1n;
            if (split >= range) split = range - 1n;
            const mid = low + split - 1n;

            const bit = (value <= mid) ? 0 : 1;
            decodedBits.push(bit);

            if (bit === 0) high = mid;
            else low = mid + 1n;

            while (true) {
                if (high < half) {
                    // MSB est 0, rien à soustraire
                } else if (low >= half) {
                    value -= half;
                    low -= half;
                    high -= half;
                } else if (low >= quarter && high < 3n * quarter) {
                    value -= quarter;
                    low -= quarter;
                    high -= quarter;
                } else {
                    break;
                }
                low = (low << 1n) & this.MAX_RANGE;
                high = ((high << 1n) | 1n) & this.MAX_RANGE;
                value = ((value << 1n) | BigInt(bits[bitIdx++] || 0)) & this.MAX_RANGE;
            }

            this.predictor.update(bit);
        }

        return new Uint8Array(this._packBits(decodedBits));
    }

    _toBitArray(data) {
        let bits = [];
        for (let byte of data) {
            for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
        }
        return bits;
    }

    _packBits(bits) {
        let bytes = [];
        // PERFECT SCORE FIX: On ne traite que les octets COMPLETS (multiples de 8)
        // pour éviter que des bits orphelins ne créent des caractères "bizarres" à la fin.
        const fullBytesCount = Math.floor(bits.length / 8);
        for (let i = 0; i < fullBytesCount * 8; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8; j++) {
                byte |= (bits[i + j]) << (7 - j);
            }
            bytes.push(byte);
        }
        return bytes;
    }

    _emitBit(bit, pending, output) {
        output.push(bit);
        const opposite = bit ^ 1;
        for (let i = 0; i < pending; i++) output.push(opposite);
    }
}
export class BinaryTransformer {
    constructor(vocabSize = 256, nLayers = 2, nHeads = 4, dModel = 64) {
        // Embeddings binaires
        this.embeddings = new Array(vocabSize);
        for (let i = 0; i < vocabSize; i++) {
            this.embeddings[i] = new Array(dModel);
            for (let j = 0; j < dModel; j++) {
                this.embeddings[i][j] = Math.random() > 0.5 ? 1 : 0;
            }
        }

        // Couches de transformer
        this.layers = [];
        for (let l = 0; l < nLayers; l++) {
            this.layers.push({
                attention: new MultiHeadAttentionBinary(dModel, nHeads),
                ff: new FeedForwardBinary(dModel)
            });
        }

        // Perceptron de sortie
        this.outputLayer = new OptimizedMajorityPerceptron(new Array(dModel).fill(1));
    }

    // Génération token par token
    generate(seed, nTokens = 50) {
        let current = this.tokenize(seed);
        let generated = current;

        for (let i = 0; i < nTokens; i++) {
            // Passe avant
            let x = this.embed(current);

            for (const layer of this.layers) {
                x = layer.attention.forward(x);
                x = layer.ff.forward(x);
            }

            // Prédit le prochain token (bit par bit)
            const nextBits = x[x.length - 1];  // dernier token
            const nextCode = this.bitsToCode(nextBits);
            const nextChar = String.fromCharCode(nextCode % 256);

            generated += nextChar;
            current = nextChar;
        }

        return generated;
    }

    tokenize(text) {
        return text[text.length - 1] || ' ';
    }

    embed(token) {
        const code = token.charCodeAt(0);
        return this.embeddings[code % this.embeddings.length];
    }

    bitsToCode(bits) {
        return bits.reduce((acc, bit, i) => acc + (bit << i), 0);
    }
}

// Attention multi-têtes binaire
/**
 * Attention Géométrique par Quaternions
 * Utilise l'alignement spatial au lieu de la logique binaire
 */
export class QuaternionAttention {
    constructor(dModel, nHeads) {
        this.nHeads = nHeads;
        // Chaque tête est un "Seeker" qui apprend une orientation préférentielle
        this.heads = Array.from({ length: nHeads }, () => new SeekerNeuron());
    }

    forward(qVectors) {
        // qVectors: tableau de Quaternions [seq_len]
        const seqLen = qVectors.length;
        const output = new Array(seqLen);

        for (let i = 0; i < seqLen; i++) {
            const query = qVectors[i];
            let context = new Quaternion(0, 0, 0, 0);
            let totalWeight = 0;

            for (let j = 0; j <= i; j++) { // Causal
                const key = qVectors[j];

                // Score d'attention = dot product (alignement des orientations)
                // On utilise Math.max(0, ...) pour ne garder que les alignements positifs (ReLU-like)
                let score = query.dot(key);
                score = score > 0 ? score : 0;

                // Accumulation pondérée dans l'espace 4D
                context = context.add(key.scale(score));
                totalWeight += score;
            }

            // Normalisation du contexte pour rester sur la sphère unitaire
            output[i] = totalWeight > 0 ? context.scale(1 / totalWeight).normalize() : query;
        }
        return output;
    }
}

// Feed-forward binaire
export class FeedForwardBinary {
    constructor(dModel) {
        this.W1 = new Array(dModel);
        this.W2 = new Array(dModel);

        for (let i = 0; i < dModel; i++) {
            this.W1[i] = Math.random() > 0.5 ? 1 : 0;
            this.W2[i] = Math.random() > 0.5 ? 1 : 0;
        }
    }

    forward(x) {
        return x.map(embedding =>
            embedding.map((bit, i) => bit & this.W1[i])
        );
    }
}


// ---------- Wrapper de données : Réalité -> Bits ----------
export class DataWrapper {
    // Convertit un nombre en vecteur binaire basé sur des seuils (Thermometer Encoding)
    // Très efficace pour les neurones majoritaires
    static numberToBits(value, thresholds = [0.2, 0.4, 0.6, 0.8]) {
        return thresholds.map(t => (value >= t ? 1 : 0));
    }

    // One-hot encoding pour les catégories
    static categoryToBits(category, allCategories) {
        return allCategories.map(c => (c === category ? 1 : 0));
    }

    // Encode un entier sur N bits
    static intToBits(value, nBits = 8) {
        const bits = [];
        for (let i = 0; i < nBits; i++) {
            bits.push((value >> i) & 1);
        }
        return bits;
    }

    /**
     * Convertit un vecteur de bits en entier (Petit-boutiste)
     * [1, 0, 1] -> 1*1 + 0*2 + 1*4 = 5
     * @param {Uint8Array|number[]} bits
     * @returns {number}
     */
    static bitsToInt(bits) {
        return bits.reduce((acc, bit, i) => acc + (bit << i), 0);
    }

    /**
     * Convertit un vecteur de bits en valeur analogique (Décoding)
     * @param {Uint8Array|number[]} bits Sorties du réseau
     * @param {number} min Valeur analogique min (ex: 0)
     * @param {number} max Valeur analogique max (ex: 255)
     * @returns {number} Valeur scalée
     */
    static bitsToAnalog(bits, min = 0, max = 1) {
        const count = bits.reduce((a, b) => a + b, 0);
        const ratio = count / bits.length;
        return min + (ratio * (max - min));
    }

    /**
     * Affiche la résolution théorique selon le nombre de sorties
     */
    static getResolutionDetails(bitCount, min = 0, max = 100) {
        const step = (max - min) / bitCount;
        return {
            bitCount,
            stepSize: step,
            levels: Array.from({length: bitCount + 1}, (_, i) => min + (i * step))
        };
    }
}

// ---------- Moteur de Règles Pré-entraînées ----------
export class RuleEngine {
    constructor() {
        this.rules = new Map();
    }

    // Enregistre un réseau avec un nom (ex: "est_danger")
    registerRule(name, network) {
        this.rules.set(name, network);
    }

    execute(name, inputs) {
        const net = this.rules.get(name);
        return net ? net.predict(inputs) : null;
    }
}

/**
 * Encapsulation des résultats de transformation pour une API Fluent.
 */
class NeuralTransformResult {
    constructor(data) {
        this.raw = data; // Uint8Array
    }
    toHex() {
        return Array.from(this.raw).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    toBase64() {
        return btoa(String.fromCharCode.apply(null, this.raw));
    }
    toString() {
        return new TextDecoder().decode(this.raw);
    }
    get buffer() { return this.raw; }
}

/**
 * Algorithme de cryptage basé sur le déterminisme bit à bit des réseaux majoritaires.
 * Utilise un StatefulMajorityNetwork comme générateur de flux (Stream Cipher).
 */
export class BitwiseNeuralCipher {
    /**
     * @param {string} passphrase Clé secrète de l'utilisateur
     * @param {Object} options Configuration (complexity, ivSize, tagSize)
     */
    constructor(passphrase, options = {}) {
        this.complexity = options.complexity || 64;
        this.ivSize = options.ivSize || 16;
        this.tagSize = 16; // Tag de 128 bits (GCM-like)

        // INITIALISATION PRIORITAIRE : On doit initialiser le BigInt avant 
        // d'appeler _deriveConfigFromKey car cette méthode l'utilise.
        this.highPrecisionState = 0n;
        
        const config = this._deriveConfigFromKey(passphrase, this.complexity);
        this.generator = new StatefulMajorityNetwork(config.logic, config.map, 0);
        this.initialState = config.seed;

        // Ajout d'un buffer pour le flux de clé généré par le réseau
        this._keyStreamBuffer = new Uint8Array(Math.ceil(this.generator.outputSize / 8));
        this._keyStreamBufferIndex = 0; // Index courant dans le buffer (en octets)
        this._keyStreamBytesAvailable = 0; // Nombre d'octets valides dans le buffer

        this.authKey = 0n; // Clé d'authentification dérivée (H dans GCM), sera initialisée dans _reset
        this.processedLength = 0n; // Longueur cumulée pour le GHASH
        this.runningTag = 0n; // Accumulateur de tag (GHASH-like)
    }

    /**
     * Sécurité : Génère une topologie de réseau unique basée sur la clé.
     * Même si l'algorithme est connu, la "forme" du réseau change pour chaque clé.
     */
    _deriveConfigFromKey(key, size) {
        // Utilisation d'un mélange plus riche (inspiré de MurmurHash/SipHash)
        // pour éviter les collisions de clés simples.
        let h1 = 0x811c9dc5;
        let h2 = 0xdeadbeef;

        for (let i = 0; i < key.length; i++) {
            h1 = Math.imul(h1 ^ key.charCodeAt(i), 2654435761);
            h2 = Math.imul(h2 ^ key.charCodeAt(i), 1597334677);
        }

        // RNG plus robuste (Xorshift128) pour la topologie
        let a = h1, b = h2, c = h1 ^ h2, d = h1 + h2;
        const rng = () => {
            let t = b << 9;
            let r = a * 5;
            r = (r << 7 | r >>> 25) * 9;
            c ^= a; d ^= b; b ^= c; a ^= d;
            c ^= t;
            d = (d << 11 | d >>> 21);
            return (a >>> 0) / 4294967296;
        };

        const logic = {};
        const map = {};
        const seed = new Uint8Array(size);
        const states = Array.from({length: size}, (_, i) => `prev_state_${i + 1}`);

        // 1. Création d'un varMap aléatoire
        for (let i = 0; i < size; i++) {
            map[`prev_state_${i + 1}`] = i;
            seed[i] = rng() > 0.5 ? 1 : 0;
        }

        // 2. Création d'une logique non-linéaire "emmêlée"
        for (let i = 0; i < size; i++) {
            const opType = rng() > 0.4 ? 'MAJORITY' : 'XOR';
            const numArgs = opType === 'MAJORITY' ? 3 : 2;
            const args = [];
            
            for (let a = 0; a < numArgs; a++) {
                const targetVar = states[Math.floor(rng() * size)];
                args.push({ var: targetVar });
            }

            // On injecte un peu d'entropie dans le pool BigInt initial
            this.highPrecisionState = (this.highPrecisionState << 8n) | BigInt(h1 & 0xFF);

            logic[`bit${i + 1}`] = { type: opType, args: args };
        }

        return { logic, map, seed };
    }

    /**
     * @param {Uint8Array} iv Vecteur d'initialisation (doit être différent à chaque message)
     */
    _reset(iv = null) {
        this.generator.reset();
        const state = new Uint8Array(this.initialState);

        if (iv) {
            for (let i = 0; i < Math.min(state.length, iv.length); i++) {
                state[i] ^= (iv[i] & 1);
            }
        }
        this.generator.state = state;

        // Reset de l'accumulateur haute précision avec un sel dérivé de l'IV
        let ivSeed = iv ? iv.reduce((acc, v) => (acc << 8n) | BigInt(v), 0n) : 0n;
        this.highPrecisionState = ivSeed ^ 0x55555555555555555555555555555555n;

        // Réinitialisation du buffer de flux de clé
        this._keyStreamBufferIndex = 0;
        this._keyStreamBytesAvailable = 0;

        // Dérivation d'une authKey unique pour ce message BASÉE sur le nouvel état (IV inclus)
        this.authKey = this._generateInternal128BitKey();
        
        this.processedLength = 0n; // CORRECTIF : Reset impératif pour la validation du Tag
        this.runningTag = 0n;

        return this;
    }

    /**
     * Génère une clé de 128 bits à partir du générateur pour l'authentification.
     */
    _generateInternal128BitKey() {
        let key = 0n;
        for (let i = 0; i < 16; i++) {
            const byte = this._getNextKeyByte(); // Utilise la méthode optimisée
            key = (key << 8n) | BigInt(byte); // Accumule les octets pour former la clé
        }
        return key;
    }

    /**
     * Génère et fournit le prochain octet du flux de clé.
     * Recharge le buffer interne si nécessaire en appelant le générateur.
     */
    _getNextKeyByte() {
        // Si le buffer est vide ou que tous les octets ont été consommés, génère un nouveau bloc
        if (this._keyStreamBufferIndex >= this._keyStreamBytesAvailable) {
            const keyBits = this.generator.predict(new Uint8Array(0)); // Génère un nouveau bloc de bits (Uint8Array de 0s et 1s)
            
            this._keyStreamBufferIndex = 0; // Réinitialise l'index pour le nouveau bloc
            this._keyStreamBytesAvailable = Math.floor(keyBits.length / 8); // Calcule le nombre d'octets complets disponibles

            // Convertit les bits en octets et les stocke dans le buffer
            for (let i = 0; i < this._keyStreamBytesAvailable; i++) {
                let byte = 0;
                for (let b = 0; b < 8; b++) {
                    // S'assure de ne pas lire au-delà de la taille de keyBits
                    if ((i * 8 + b) < keyBits.length) {
                        byte |= (keyBits[i * 8 + b] << b);
                    }
                }
                this._keyStreamBuffer[i] = byte;
            }
        }
        // Retourne l'octet courant et avance l'index
        const byte = this._keyStreamBuffer[this._keyStreamBufferIndex];
        this._keyStreamBufferIndex++;
        return byte;
    }

    /**
     * Chiffre les données et ajoute l'IV et le Tag d'intégrité.
     * Format : [IV] + [DONNEES_CHIFFREES] + [TAG]
     * @param {string|Uint8Array} data
     * @param {Uint8Array} customIv Optionnel
     */
    encrypt(data, customIv = null) {
        const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        const iv = customIv || this._generateRandomIV();
        
        this._reset(iv);
        // En mode encryption, on hash le ciphertext produit
        const encrypted = this._transform(input, true);
        const tag = this._getIntegrityTag();

        // Le tag GHASH-like fait 16 octets (128 bits)
        const combined = new Uint8Array(iv.length + encrypted.length + 16);
        combined.set(iv, 0);
        combined.set(encrypted, iv.length);
        combined.set(tag, iv.length + encrypted.length);

        return new NeuralTransformResult(combined);
    }

    /**
     * Déchiffre et valide l'intégrité.
     * @param {Uint8Array|NeuralTransformResult} combinedData 
     */
    decrypt(combinedData) {
        const input = combinedData instanceof NeuralTransformResult ? combinedData.raw : combinedData;
        const TAG_SIZE = 16;
        
        // Extraction des segments
        const iv = input.slice(0, this.ivSize);
        const tagReceived = input.slice(-TAG_SIZE);
        const encrypted = input.slice(this.ivSize, -TAG_SIZE);

        this._reset(iv);
        // En mode décryptage, on hash le ciphertext AVANT XOR
        const decrypted = this._transform(encrypted, false);
        const tagCalculated = this._getIntegrityTag();

        // Vérification d'intégrité (Authentification)
        const isValid = tagCalculated.every((v, i) => v === tagReceived[i]);
        if (!isValid) {
            throw new Error("Neural Integrity Violation: The data has been tampered with or the key is incorrect.");
        }

        return new NeuralTransformResult(decrypted);
    }

    _generateRandomIV() {
        const iv = new Uint8Array(this.ivSize);
        if (typeof crypto !== 'undefined' && (crypto.getRandomValues || crypto.webcrypto?.getRandomValues)) {
            for (let i = 0; i < iv.length; i += 65536) {
                (crypto.getRandomValues ? crypto : crypto.webcrypto).getRandomValues(iv.subarray(i, Math.min(i + 65536, iv.length)));
            }
        } else {
            // Fallback Node.js simple si nécessaire
            for(let i=0; i<this.ivSize; i++) iv[i] = Math.floor(Math.random() * 256);
        }
        return iv;
    }

    /**
     * Coeur de la transformation (XOR Stream)
     * @param {Uint8Array} data 
     * @param {boolean} isEncrypt
     * @returns {Uint8Array}
     */
    _transform(data, isEncrypt) {
        const output = new Uint8Array(data.length);
        const LARGE_PRIME = 0xffffffffffffffffffffffffffffff43n;

        for (let i = 0; i < data.length; i++) {
            // Obtient le prochain octet du flux de clé de manière optimisée
            const rawByte = this._getNextKeyByte();

            // --- DÉFENSE ANTI-SAT : Whitening Haute Précision ---
            // On utilise une transformation non-linéaire sur 128 bits minimum.
            // 1. On mélange l'état neural (rawByte) dans l'accumulateur géant.
            // 2. On utilise une constante de Weyl (nombre irrationnel simulé) pour la diffusion.
            const WEYL_CONSTANT = 0x3504f333f3d62ded70214131n; // Fraction de la racine de 2
            
            // Évolution de l'état : Multiplication modulaire + XOR sur 128 bits
            this.highPrecisionState = (this.highPrecisionState + BigInt(rawByte) + WEYL_CONSTANT) % LARGE_PRIME;
            this.highPrecisionState ^= (this.highPrecisionState >> 33n);
            
            // Extraction du flux de clé final (un seul octet issu de la cascade BigInt)
            // Cela rend l'inversion de l'état du réseau de neurones par SAT Solver 
            // quasi-impossible car il faudrait résoudre des équations sur des entiers de 128 bits.
            let finalKeyByte = Number(this.highPrecisionState & 0xFFn);
            
            // On réinjecte le résultat pour la prochaine itération (Feedback)
            this.highPrecisionState ^= BigInt(finalKeyByte) << 64n;

            const cipherByte = isEncrypt ? (data[i] ^ finalKeyByte) : data[i];
            const plainByte = isEncrypt ? data[i] : (data[i] ^ finalKeyByte);
            
            // --- NEURAL-GHASH ---
            // On authentifie le ciphertext (comme dans GCM)
            // On traite chaque octet comme un coefficient du polynôme
            this.runningTag = ((this.runningTag ^ BigInt(cipherByte)) * this.authKey) % LARGE_PRIME;

            output[i] = isEncrypt ? cipherByte : plainByte;
        }
        this.processedLength += BigInt(data.length);
        return output;
    }

    _getIntegrityTag() {
        // Finalisation du tag : on mélange le runningTag avec l'état final du réseau
        // pour éviter les attaques sur le message vide ou les extensions de longueur.
        const LARGE_PRIME = 0xffffffffffffffffffffffffffffff43n;
        const finalState = this.generator.state.reduce((acc, v, i) => acc ^ (BigInt(v) << BigInt(i % 128)), 0n);
        
        const finalizedTag = (this.runningTag ^ this.processedLength ^ finalState) % LARGE_PRIME;
        
        const tagBytes = new Uint8Array(16);
        let temp = finalizedTag;
        for (let i = 0; i < 16; i++) {
            tagBytes[i] = Number(temp & 0xFFn);
            temp >>= 8n;
        }
        return tagBytes;
    }
}

// ---------- Utilitaires de Conscience Géométrique (Mesh Awareness) ----------
export class MeshAwarenessUtils {
    /**
     * Calcule une AABB (Axis-Aligned Bounding Box) à partir des sommets d'un maillage.
     * @param {Float32Array|number[]} vertices Tableau de sommets [x,y,z, x,y,z...]
     */
    static computeCollisionBox(vertices) {
        if (!vertices || vertices.length === 0) return null;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i], y = vertices[i+1], z = vertices[i+2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }

        return {
            min: new Vector3(minX, minY, minZ),
            max: new Vector3(maxX, maxY, maxZ)
        };
    }

    /**
     * Génère une AABB locale à partir d'une description de primitive.
     * Aligné sur la logique de pivot du viewer (pivot à la base pour cylinders/boxes).
     */
    static getLocalBoxFromPrimitive(primitive) {
        if (!primitive) return null;
        let min = [-0.01, -0.01, -0.01], max = [0.01, 0.01, 0.01];

        if (primitive.type === 'box') {
            const size = primitive.size || [0.1, 0.1, 0.1];
            // Pivot à la base (centre-bas)
            min = [-size[0] / 2, 0, -size[2] / 2];
            max = [size[0] / 2, size[1], size[2] / 2];
        } else if (primitive.type === 'cylinder' || primitive.type === 'pyramid') {
            const r = primitive.radius || 0.05;
            const h = primitive.height || 0.1;
            min = [-r, 0, -r];
            max = [r, h, r];
        } else if (primitive.type === 'sphere') {
            const r = primitive.radius || 0.02;
            min = [-r, -r, -r];
            max = [r, r, r];
        }
        return {
            min: new Vector3(...min),
            max: new Vector3(...max)
        };
    }

    /**
     * Algorithme ultra-rapide d'intersection AABB-AABB (6 comparaisons).
     * C'est l'algorithme au temps d'exécution le plus prédictible pour la 3D.
     */
    static intersects(boxA, boxB, padding = 0) {
        return (boxA.min.x - padding <= boxB.max.x && boxA.max.x + padding >= boxB.min.x) &&
               (boxA.min.y - padding <= boxB.max.y && boxA.max.y + padding >= boxB.min.y) &&
               (boxA.min.z - padding <= boxB.max.z && boxA.max.z >= boxB.min.z);
    }

    /**
     * Intersection Sphère-Sphère avec marge de sécurité.
     */
    static intersectsSphereSphere(s1, s2, padding = 0) {
        const distSq = s1.center.distanceToSquared(s2.center);
        const radiusSum = s1.radius + s2.radius + padding;
        return distSq <= radiusSum * radiusSum;
    }

    /**
     * Intersection Sphère-AABB avec marge de sécurité.
     */
    static intersectsSphereAABB(sphere, aabb, padding = 0) {
        const x = Math.max(aabb.min.x, Math.min(sphere.center.x, aabb.max.x));
        const y = Math.max(aabb.min.y, Math.min(sphere.center.y, aabb.max.y));
        const z = Math.max(aabb.min.z, Math.min(sphere.center.z, aabb.max.z));
        const distSq = (x - sphere.center.x) ** 2 + (y - sphere.center.y) ** 2 + (z - sphere.center.z) ** 2;
        const paddedRadius = sphere.radius + padding;
        return distSq <= paddedRadius * paddedRadius;
    }

    /**
     * Transforme une boîte locale en boîte englobante monde (AABB).
     */
    static getTransformedAABB(localBox, position, rotation) {
        const corners = [
            new Vector3(localBox.min.x, localBox.min.y, localBox.min.z),
            new Vector3(localBox.max.x, localBox.min.y, localBox.min.z),
            new Vector3(localBox.min.x, localBox.max.y, localBox.min.z),
            new Vector3(localBox.min.x, localBox.min.y, localBox.max.z),
            new Vector3(localBox.max.x, localBox.max.y, localBox.min.z),
            new Vector3(localBox.max.x, localBox.min.y, localBox.max.z),
            new Vector3(localBox.min.x, localBox.max.y, localBox.max.z),
            new Vector3(localBox.max.x, localBox.max.y, localBox.max.z),
        ];
        const worldCorners = corners.map(c => rotation.rotateVector(c).add(position));
        return this.computeCollisionBox(worldCorners.flatMap(v => [v.x, v.y, v.z]));
    }
}

/**
 * Benchmark spécifique pour les règles générées par l'interprète JSON
 */
function benchmarkCompiledRules() {
    console.log("\n=== Benchmark: Réseaux Compilés par RuleInterpreter ===\n");

    const varMap = { a: 0, b: 1, c: 2, d: 3, e: 4 };
    const inputs = [1, 0, 1, 1, 0];

    // 1. Règle Simple AND (1 couche)
    const simpleLogic = { type: 'AND', args: [{var:'a'}, {var:'c'}, {var:'d'}] };
    const simpleNet = RuleInterpreter.interpret(simpleLogic, varMap);

    // 2. Règle Profonde et imbriquée (3 couches : AND/NOT -> OR)
    const deepLogic = {
        type: 'OR',
        args: [
            { type: 'AND', args: [{var:'a'}, {var:'b'}] },
            { type: 'AND', args: [{var:'c'}, { type: 'NOT', args: [{var:'e'}] }] }
        ]
    };
    const deepNet = RuleInterpreter.interpret(deepLogic, varMap);

    const iterations = 1_000_000;

    const runBench = (name, net) => {
        const start = process.hrtime.bigint();
        let checksum = 0;
        for (let i = 0; i < iterations; i++) {
            checksum ^= net.predict(inputs, false)[0]; // Surtout pas de logs ici !
        }
        const end = process.hrtime.bigint();
        const ms = Number(end - start) / 1_000_000;
        console.log(`${name} (${iterations.toLocaleString()} itérations) : ${ms.toFixed(2)} ms`);
    };

    runBench("Règle Simple AND (1 couche)", simpleNet);
    runBench("Règle Profonde Imbriquée (3 couches)", deepNet);
}

// Utilisation
const gpt = new BinaryTransformer();
const texteGenere = gpt.generate("Bonjour", 50);
console.log(texteGenere);

// Exécution du nouveau benchmark
//benchmarkCompiledRules();

console.log("\n=== Mode Optionnel : Seeker Quaternions ===");
const seeker = new SeekerLayer(3, 2); // 3 entrées (x,y,z), 2 neurones de sortie
const mockInput = [[1, 0.5, -0.2], [0.1, 1, 0.8]];
const mockTarget = [0.9, -0.5];

console.log("Démarrage de la tête chercheuse géométrique...");
for(let i = 0; i < 50; i++) {
    const loss = seeker.train(mockInput, mockTarget, 0.1);
    if (i % 10 === 0) console.log(`  Cycle ${i} - Perte : ${loss.toFixed(6)}`);
}

const finalRes = seeker.forward(mockInput);
console.log("Cibles visées :", mockTarget);
console.log("Positions finales :", finalRes.map(v => v.toFixed(4)));



// Exemple d'utilisation pratique
console.log("\n=== Exemple: classification MNIST binaire ===");
console.log("(simulation avec des données aléatoires)");

const classifier = new OptimizedMajorityPerceptron([8, 4, 2, 1, 8, 4, 2, 1]);
const testInputs = [1, 0, 1, 0, 1, 0, 1, 0];
const prediction = classifier.predict(testInputs);
console.log(`Prédiction: ${prediction}`);


// 1. Création d'une règle "Sécurité" :
// Règle métier: Si (Température élevée ET Fumée détectée) OU (Bouton Alerte)
// Mappage en neurones majoritaires avec l'Interprète de Règles:
// Inputs: [Température élevée, Fumée détectée, Bouton Alerte]

// Option 1: Règle complexe dans un seul neurone (comme analysé, nécessite un seuil précis)
// Pour (T AND F) OR B, avec inputs [T, F, B], weights [2, 2, 3], le seuil est 3.
const safetyRuleConfigSingleNeuron = [
    [RuleInterpreter.buildWeightedRule([2, 2, 3], 3)] // Un seul neurone pour la règle combinée
];
const safetyNet = RuleInterpreter.createNetwork(safetyRuleConfigSingleNeuron);
console.log("Règle 'ALERTE_INCENDIE' (neurone unique): (T AND F) OR B");

// Option 2: Règle décomposée en plusieurs couches (plus lisible pour des règles complexes)
// Layer 1: Neurone pour (T AND F), Neurone pour (B)
const and_tf_neuron_config = RuleInterpreter.buildBooleanAND(2); // Inputs T, F
const b_neuron_config = RuleInterpreter.buildWeightedRule([1], 1); // Input B (simple passe-plat)

// Layer 2: Neurone pour (AND_TF_output OR B_output)
const or_combined_neuron_config = RuleInterpreter.buildBooleanOR(2); // Inputs (output de AND_TF), (output de B)

const safetyRuleConfigMultiLayer = [
    // Couche 1: Calcul des sous-conditions
    [{ weights: and_tf_neuron_config.weights, threshold: and_tf_neuron_config.threshold }, // T AND F
        { weights: b_neuron_config.weights, threshold: b_neuron_config.threshold }],         // B
    // Couche 2: Combinaison des sous-conditions
    [{ weights: or_combined_neuron_config.weights, threshold: or_combined_neuron_config.threshold }] // (T AND F) OR B
];
const safetyNetMultiLayer = RuleInterpreter.createNetwork(safetyRuleConfigMultiLayer);
console.log("Règle 'ALERTE_INCENDIE_MULTILAYER' (réseau): (T AND F) OR B");

const engine = new RuleEngine();
// Enregistrement de la règle simple pour l'exemple d'exécution
engine.registerRule("ALERTE_INCENDIE", safetyNet);
engine.registerRule("ALERTE_INCENDIE_MULTILAYER", safetyNetMultiLayer);

// 2. Simulation d'entrées réelles
const sensorData = { temp: 0.85, smoke: 0, manualButton: 1 };

// 3. Wrapping en bits
const tempBits = DataWrapper.numberToBits(sensorData.temp, [0.7]); // 1 bit: chaud ou pas
const smokeBit = [sensorData.smoke];
const buttonBit = [sensorData.manualButton];

const binaryInput = [...tempBits, ...smokeBit, ...buttonBit]; // [1, 0, 1]

// Test de la règle multi-couches
const isAlertMultiLayer = engine.execute("ALERTE_INCENDIE_MULTILAYER", binaryInput);
console.log(`Résultat Règle Multi-couches : ${isAlertMultiLayer[0] === 1 ? "🔥 ALARME ACTIVÉE" : "RAS"}`);

// Option 3: Utilisation du compilateur automatique (interpret)
// Définition humaine des variables
const varMap = {
    temp: 0,
    smoke: 1,
    manual: 2
};

const safetyLogicJson = {
    type: 'OR',
    args: [{ type: 'AND', args: [{ var: 'temp' }] }]
};

const smartVarMap = {
    // Capteurs
    zone1_froid: 0, zone2_froid: 1, zone3_froid: 2, living_gel: 3,
    // Sécurité
    failed_login: 4, location_inconnue: 5, admin_access: 6, mode_maintenance: 7,
    // Santé machine
    vibration_haute: 8, surchauffe: 9
};

const extendedVarMap = {
    ...smartVarMap,
    // Fraude Financière
    montant_eleve: 10, nouvel_appareil: 11, vpn_actif: 12, pays_different: 13,
    // Triage Santé
    pouls_faible: 14, fievre: 15, toux: 16, difficulte_respi: 17, // Indices 14-17
    // Hystérésis (Ventilation)
    fan_on_prev: 21, temp_high: 22, temp_low: 23, // Indices 21-23
    // Priorisation/Override
    condition_A: 24, emergency_override_B: 25, // Indices 24-25
    // Détection de Motif Séquentiel (Double Clic)
    button_pressed_now: 26, button_pressed_prev: 27, // Indices 26-27
    // Domotique
    mouvement: 18, nuit: 19, mode_sommeil: 20
};
const safetyNetAuto = RuleInterpreter.interpret(safetyLogicJson, varMap);
engine.registerRule("ALERTE_INCENDIE_AUTO", safetyNetAuto);
const isAlertAuto = engine.execute("ALERTE_INCENDIE_AUTO", binaryInput);
console.log(`Résultat Règle Automatique (JSON) : ${isAlertAuto[0] === 1 ? "🔥 ALARME ACTIVÉE" : "RAS"}`);

// Option 4: Utilisation du compilateur automatique avec l'opérateur NOT
const notTempLogicJson = {
    type: 'NOT',
    args: [{ var: 'temp' }]
};
const notTempNet = RuleInterpreter.interpret(notTempLogicJson, varMap);
engine.registerRule("NOT_TEMP", notTempNet);
const isNotTemp = engine.execute("NOT_TEMP", binaryInput); // binaryInput: [1, 0, 1] -> temp est 1
console.log(`Résultat Règle NOT_TEMP (JSON) : ${isNotTemp[0] === 1 ? "🔥 NOT TEMP (0)" : "RAS (1)"}`); // Devrait être "RAS (1)" car temp est 1, NOT temp est 0

// Option 5: Utilisation du compilateur automatique avec poids et seuil explicites
const customWeightedLogicJson = {
    custom: {
        // Règle: (2 * temp) + (2 * smoke) + (1 * manual) >= 3
        // Exemple: si temp=1, smoke=0, manual=1 -> (2*1) + (2*0) + (1*1) = 3. 3 >= 3 -> VRAI
        args: [{ var: 'temp' }, { var: 'smoke' }, { var: 'manual' }],
            weights: [2, 2, 1], // Poids pour temp, smoke, manual
        threshold: 3
    }
};
const customWeightedNet = RuleInterpreter.interpret(customWeightedLogicJson, varMap);
engine.registerRule("CUSTOM_WEIGHTED_RULE", customWeightedNet);
const isCustomWeighted = engine.execute("CUSTOM_WEIGHTED_RULE", binaryInput); // binaryInput: [1, 0, 1]
console.log(`Résultat Règle CUSTOM_WEIGHTED_RULE (JSON) : ${isCustomWeighted[0] === 1 ? "🔥 ACTIVÉE" : "DÉSACTIVÉE"}`); // Devrait être "ACTIVÉE"

// Option 6: Utilisation du compilateur automatique avec type MAJORITY (poids par défaut)
const majorityLogicJson = {
    type: 'MAJORITY',
    args: [{ var: 'temp' }, { var: 'smoke' }, { var: 'manual' }] // 2 sur 3 doivent être vrais
};
const majorityNet = RuleInterpreter.interpret(majorityLogicJson, varMap);
engine.registerRule("MAJORITY_RULE", majorityNet);
const isMajority = engine.execute("MAJORITY_RULE", binaryInput); // binaryInput: [1, 0, 1] -> 2 vrais sur 3
console.log(`Résultat Règle MAJORITY_RULE (JSON) : ${isMajority[0] === 1 ? "🔥 MAJORITÉ ATTEINTE" : "MAJORITÉ NON ATTEINTE"}`); // Devrait être "MAJORITÉ ATTEINTE"

// Option 7: Règle pondérée imbriquée dans un AND
const nestedWeightedLogicJson = {
    type: 'AND',
    args: [
        {
            // (2*temp + 2*smoke >= 3) -> Temp AND Smoke
            args: [{ var: 'temp' }, { var: 'smoke' }],
            weights: [2, 2],
            threshold: 3
        },
        { var: 'manual' } // ET Manuel
    ]
};
const nestedNet = RuleInterpreter.interpret(nestedWeightedLogicJson, varMap);
const isNested = nestedNet.predict(binaryInput);
console.log(`Résultat Règle Imbriquée Pondérée : ${isNested[0] === 1 ? "🔥 ACTIVÉE" : "RAS"}`);

// 5. Sauvegarde des règles (JSON)
const savedConfig = safetyNet.export();
console.log("Configuration de la règle exportée (neurone unique) :", JSON.stringify(savedConfig));

const savedConfigMultiLayer = safetyNetMultiLayer.export();
console.log("Configuration de la règle exportée (multi-couches) :", JSON.stringify(savedConfigMultiLayer));

// 4. Exécution du moteur
const isAlert = engine.execute("ALERTE_INCENDIE", binaryInput);
console.log(`Données : Temp=${sensorData.temp}, Bouton=${sensorData.manualButton}`);
console.log(`Résultat Règle Bitwise : ${isAlert[0] === 1 ? "🔥 ALARME ACTIVÉE" : "RAS"}`);

console.log("\n=== Cas d'usage : Moteur de Règles Dynamiques ===");


// ============================================================
// NOUVEAUX EXEMPLES : XOR, AT_LEAST_N, et Réseau Récurrent
// ============================================================

const advancedVarMap = {
    ...extendedVarMap,
    // Variables pour XOR
    input_xor_A: 30, input_xor_B: 31,
    // Variables pour AT_LEAST_N
    vote1: 32, vote2: 33, vote3: 34, vote4: 35,
    // Variables pour Réseau Récurrent (Edge Detector)
    current_signal: 36,
    prev_output_state: 37 // L'état précédent du réseau lui-même
};

// 10. Règle "Porte Logique XOR"
// Output est 1 si A est VRAI et B est FAUX, OU si A est FAUX et B est VRAI.
const xorLogic = {
    type: 'XOR',
    args: [{ var: 'input_xor_A' }, { var: 'input_xor_B' }]
};

// 11. Règle "Au Moins N Vrais" (AT_LEAST_N)
// Déclenche si au moins 3 des 4 votes sont VRAIS.
const atLeastNLogic = {
    type: 'AT_LEAST_N',
    threshold: 3, // Au moins 3 votes
    args: [{ var: 'vote1' }, { var: 'vote2' }, { var: 'vote3' }, { var: 'vote4' }]
};

// 12. Règle "Détecteur de Front" (Réseau Récurrent Simple)
// Le réseau émet 1 si le signal actuel est différent de son propre état précédent.
// C'est un XOR entre l'input actuel et la sortie précédente du réseau.
const edgeDetectorLogic = {
    type: 'XOR',
    args: [{ var: 'current_signal' }, { var: 'prev_output_state' }]
};

// --- Compilation ---
const xorNet = RuleInterpreter.interpret(xorLogic, advancedVarMap);
const atLeastNNet = RuleInterpreter.interpret(atLeastNLogic, advancedVarMap);

// Pour le réseau récurrent, nous utilisons la nouvelle classe StatefulMajorityNetwork
// currentInputSize est 1 car 'current_signal' est la seule entrée non-état.
const edgeDetectorNet = new StatefulMajorityNetwork(edgeDetectorLogic, advancedVarMap, 1);

console.log("\n--- Test des nouvelles règles avancées ---");

// Simulation pour XOR
const xorInput1 = new Uint8Array(advancedVarMap.input_xor_B + 1);
xorInput1[advancedVarMap.input_xor_A] = 0; xorInput1[advancedVarMap.input_xor_B] = 0;
console.log(`XOR (0,0) : ${xorNet.predict(xorInput1)[0]}`); // Attendu: 0
xorInput1[advancedVarMap.input_xor_A] = 0; xorInput1[advancedVarMap.input_xor_B] = 1;
console.log(`XOR (0,1) : ${xorNet.predict(xorInput1)[0]}`); // Attendu: 1
xorInput1[advancedVarMap.input_xor_A] = 1; xorInput1[advancedVarMap.input_xor_B] = 0;
console.log(`XOR (1,0) : ${xorNet.predict(xorInput1)[0]}`); // Attendu: 1
xorInput1[advancedVarMap.input_xor_A] = 1; xorInput1[advancedVarMap.input_xor_B] = 1;
console.log(`XOR (1,1) : ${xorNet.predict(xorInput1)[0]}`); // Attendu: 0

// Simulation pour AT_LEAST_N
const atLeastNInput = new Uint8Array(advancedVarMap.vote4 + 1);
atLeastNInput[advancedVarMap.vote1] = 1;
atLeastNInput[advancedVarMap.vote2] = 1;
atLeastNInput[advancedVarMap.vote3] = 0;
atLeastNInput[advancedVarMap.vote4] = 1; // 3 votes sur 4 sont à 1
console.log(`AT_LEAST_N (1,1,0,1) (seuil 3) : ${atLeastNNet.predict(atLeastNInput)[0] ? "✅ ATTEINT" : "❌ NON ATTEINT"}`); // Attendu: 1

atLeastNInput[advancedVarMap.vote3] = 1; // 4 votes sur 4 sont à 1
console.log(`AT_LEAST_N (1,1,1,1) (seuil 3) : ${atLeastNNet.predict(atLeastNInput)[0] ? "✅ ATTEINT" : "❌ NON ATTEINT"}`); // Attendu: 1

atLeastNInput[advancedVarMap.vote1] = 0; // 3 votes sur 4 sont à 1
console.log(`AT_LEAST_N (0,1,1,1) (seuil 3) : ${atLeastNNet.predict(atLeastNInput)[0] ? "✅ ATTEINT" : "❌ NON ATTEINT"}`); // Attendu: 1

atLeastNInput[advancedVarMap.vote2] = 0; // 2 votes sur 4 sont à 1
console.log(`AT_LEAST_N (0,0,1,1) (seuil 3) : ${atLeastNNet.predict(atLeastNInput)[0] ? "✅ ATTEINT" : "❌ NON ATTEINT"}`); // Attendu: 0

// Simulation pour Détecteur de Front (Réseau Récurrent)
console.log("\n--- Test Détecteur de Front (Réseau Récurrent) ---");
edgeDetectorNet.reset(); // Réinitialise l'état

let signalSequence = [0, 0, 1, 1, 0, 1, 0, 0];
console.log("Séquence de signal :", signalSequence.join(', '));

for (let i = 0; i < signalSequence.length; i++) {
    const currentSignalInput = new Uint8Array(1);
    currentSignalInput[0] = signalSequence[i];
    const output = edgeDetectorNet.predict(currentSignalInput);
    console.log(`  Signal actuel: ${signalSequence[i]}, Sortie (détection de front): ${output[0]}`);
}


// ============================================================
// OPTIMISATION & RECHERCHE (RNN AVANCÉ)
// ============================================================

/**
 * 13. Règle "Recherche d'Optimisation" (Persistence/Streak)
 * On veut détecter une "accumulation de confiance".
 * Le signal ne s'active que si la condition est vraie 3 fois de suite (Diffusion temporelle).
 */
const streakLogic = {
    type: 'AND',
    args: [
        { var: 'current_signal' },
        { var: 'prev_state_1' }, // Sortie t-1
        { var: 'prev_state_2' }  // Sortie t-2 (via une chaîne de feedback)
    ]
};

// Simulation d'un moteur de recherche d'état optimal
const optimizationVarMap = {
    current_signal: 0,
    prev_state_1: 1,
    prev_state_2: 2
};

const optimizerNet = new StatefulMajorityNetwork(streakLogic, optimizationVarMap, 1);

console.log("\n--- Test Recherche d'Optimisation (Persistence 3-étapes) ---");
let searchSequence = [1, 1, 1, 0, 1, 1, 1];
optimizerNet.reset();

searchSequence.forEach((val, i) => {
    const out = optimizerNet.predict([val]);
    // On simule manuellement le décalage de registre pour la mémoire profonde
    // Dans un vrai RNN, le RuleInterpreter gérerait le pass-through
    console.log(`Etape ${i} (Input: ${val}) -> Stable ? ${out[0] ? "🎯 OUI" : "⏳ NON"}`);
});

/**
 * 14. Logique métier "Diffusion de Vote" (Moyenne temporelle)
 * On utilise AT_LEAST_N sur les états passés pour lisser le bruit.
 */
const diffusionLogic = {
    type: 'AT_LEAST_N',
    threshold: 2,
    args: [
        { var: 'current_signal' },
        { var: 'prev_state_1' },
        { var: 'prev_state_2' }
    ]
};
const diffusionNet = new StatefulMajorityNetwork(diffusionLogic, optimizationVarMap, 1);

console.log("\n--- Test Diffusion Temporelle (Lissage de bruit) ---");
[1, 0, 1, 0, 0].forEach(val => {
    const out = diffusionNet.predict([val]);
    console.log(`Input: ${val} -> Output Lissé: ${out[0]}`);
});

console.log(`
 Résumé des nouvelles requêtes :
 8. Porte Logique XOR : Transformation automatique en une combinaison de AND/OR/NOT.
 9. Seuil "Au Moins N" (AT_LEAST_N) : Déclenchement si un nombre minimum d'entrées sont vraies.
 10. Réseau Récurrent Simple (Détecteur de Front) : Utilisation de l'état précédent du réseau pour influencer la décision actuelle.
 11. Persistence (Streak) : Nécessite une séquence continue pour valider un état (recherche de stabilité).
 12. Diffusion Temporelle : Vote majoritaire sur le temps pour filtrer les anomalies.
 `);

// ============================================================
// NOUVEAUX EXEMPLES DE REQUÊTES INTELLIGENTES
// ============================================================

// 1. Règle "Consensus Démocratique" (MAJORITY)
// Utile quand on veut une redondance : on active le chauffage si 2 zones sur 3 sont froides,
// OU si le salon est en train de geler (priorité haute).
const thermostatLogic = {
    type: 'OR',
    args: [
        { type: 'MAJORITY', args: [{var: 'zone1_froid'}, {var: 'zone2_froid'}, {var: 'zone3_froid'}] },
        { var: 'living_gel' }
    ]
};

// 2. Règle "Score de Risque Cybersécurité" (Pondération Custom)
// Ici on ne fait pas juste du vrai/faux, on attribue des scores.
// Si le total des points dépasse 5, on bloque l'accès.
const cyberSecurityLogic = {
    custom: {
        args: [{var: 'failed_login'}, {var: 'location_inconnue'}, {var: 'admin_access'}],
        weights: [2, 3, 5], // L'accès admin suspect vaut 5 points à lui seul
        threshold: 5
    }
};

// 3. Règle "Sécurité Machine avec Exclusion" (NOT + AND)
// On déclenche une alerte si (Vibration OU Surchauffe) ET QUE nous ne sommes PAS en maintenance.
const machineSafetyLogic = {
    type: 'AND',
    args: [
        { type: 'OR', args: [{var: 'vibration_haute'}, {var: 'surchauffe'}] },
        { type: 'NOT', args: [{var: 'mode_maintenance'}] }
    ]
};

// --- Compilation et Test ---
const thermostatNet = RuleInterpreter.interpret(thermostatLogic, smartVarMap);
const securityNet = RuleInterpreter.interpret(cyberSecurityLogic, smartVarMap);
const machineNet = RuleInterpreter.interpret(machineSafetyLogic, smartVarMap);

console.log("\n--- Test des nouvelles règles ---");

// Simulation : Zone 1 & 2 froides (2/3), Salon OK, Login raté, Location inconnue, Vibration haute, Pas de maintenance.
// Bits: [Z1:1, Z2:1, Z3:0, LG:0, FL:1, LI:1, AA:0, MN:0, VH:1, SH:0]
const complexInput = [1, 1, 0, 0, 1, 1, 0, 0, 1, 0];

// Test Thermostat
const resThermo = thermostatNet.predict(complexInput);
console.log(`Thermostat (2/3 zones) : ${resThermo[0] ? "✅ CHAUFFAGE ON" : "❌ OFF"}`);

// Test Sécurité (Score : FL(2) + LI(3) = 5. Seuil = 5)
const resSecurity = securityNet.predict(complexInput);
console.log(`Alerte Sécurité (Score 5/5) : ${resSecurity[0] ? "🚩 BLOCAGE" : "✅ OK"}`);

// Test Machine (Vibration:1 ET NOT Maintenance:1 => VRAI)
const resMachine = machineNet.predict(complexInput);
console.log(`Arrêt d'urgence Machine : ${resMachine[0] ? "🛑 STOP" : "✅ RUN"}`);


// ============================================================
// ============================================================
// EXEMPLES SUPPLÉMENTAIRES : FRAUDE, SANTÉ ET DOMOTIQUE
// ============================================================
// ============================================================


// 4. Règle "Détection de Fraude par Scoring"
// On définit un score de suspicion. Si le score >= 7, on bloque la transaction.
const fraudLogic = {
    custom: {
        args: [{var: 'montant_eleve'}, {var: 'nouvel_appareil'}, {var: 'vpn_actif'}, {var: 'pays_different'}],
        weights: [5, 2, 3, 4], // Le montant élevé et le pays différent pèsent lourd
        threshold: 7
    }
};

// 5. Règle "Triage Urgence Médicale" (Logique de priorité)
// URGENCE si : Difficulté Respi OU (Pouls Faible ET Fièvre)
const healthTriageLogic = {
    type: 'OR',
    args: [
        { var: 'difficulte_respi' },
        { type: 'AND', args: [{var: 'pouls_faible'}, {var: 'fievre'}] }
    ]
};

// 6. Règle "Domotique Contextuelle" (Inhibition)
// Allumer la lumière si : Mouvement ET Nuit ET QUE le Mode Sommeil n'est PAS actif.
const smartLightLogic = {
    type: 'AND',
    args: [
        { var: 'mouvement' },
        { var: 'nuit' },
        { type: 'NOT', args: [{var: 'mode_sommeil'}] }
    ]
};

// 7. Règle "Contrôle de Ventilation avec Hystérésis"
// Le ventilateur s'allume si la température est haute (temp_high) ET qu'elle n'est pas basse (NOT temp_low).
// Il reste allumé si il était déjà allumé (fan_on_prev) ET que la température n'est pas basse (NOT temp_low).
// Cela évite des allumages/extinctions trop fréquents autour d'un seul seuil.
const fanControlHysteresisLogic = {
    type: 'OR',
    args: [
        // Allumage initial : Température haute ET pas basse
        { type: 'AND', args: [{var: 'temp_high'}, {type: 'NOT', args: [{var: 'temp_low'}]}] },
        // Maintien allumé : Était allumé ET pas basse
        { type: 'AND', args: [{var: 'fan_on_prev'}, {type: 'NOT', args: [{var: 'temp_low'}]}] }
    ]
};

// 8. Règle "Action Prioritaire avec Override"
// Une action normale (condition_A) est déclenchée, SAUF si une condition d'urgence (emergency_override_B) est active.
const prioritizedActionLogic = {
    type: 'AND',
    args: [
        { var: 'condition_A' },
        { type: 'NOT', args: [{var: 'emergency_override_B'}] }
    ]
};

// 9. Règle "Détection de Motif Séquentiel Simple" (ex: Double Clic)
// Détecte si un bouton a été pressé "maintenant" ET "juste avant".
// (Nécessite que les inputs soient mis à jour séquentiellement par un système externe)
const doubleClickLogic = {
    type: 'AND',
    args: [
        { var: 'button_pressed_now' },
        { var: 'button_pressed_prev' }
    ]
};

// --- Compilation ---
const fraudNet = RuleInterpreter.interpret(fraudLogic, extendedVarMap);
const healthNet = RuleInterpreter.interpret(healthTriageLogic, extendedVarMap);
const lightNet = RuleInterpreter.interpret(smartLightLogic, extendedVarMap);

console.log("\n--- Test des règles étendues ---");

// --- NOUVELLES COMPILATIONS ---
const fanNet = RuleInterpreter.interpret(fanControlHysteresisLogic, extendedVarMap);
const prioritizedNet = RuleInterpreter.interpret(prioritizedActionLogic, extendedVarMap);
const doubleClickNet = RuleInterpreter.interpret(doubleClickLogic, extendedVarMap);

// Simulation : Montant élevé(1), Pays différent(1), VPN(0), Pouls OK, Fièvre(1), Toux(1), Mouvement(1), Nuit(1), Mode Sommeil(0)
// Index: [..., M_E:10, N_A:11, VPN:12, P_D:13, P_F:14, F:15, T:16, D_R:17, MOUV:18, NUIT:19, SOM:20]
// Nouveaux inputs pour les règles supplémentaires :
// fan_on_prev:0, temp_high:1, temp_low:0 (température monte, fan éteint -> allume)
// condition_A:1, emergency_override_B:0 (action normale active, pas d'override -> action déclenchée)
// button_pressed_now:1, button_pressed_prev:1 (double clic -> détecté)
const extendedInput = new Uint8Array(28); // Taille ajustée pour les nouvelles variables
extendedInput[10] = 1; extendedInput[13] = 1; // Fraude: 5 + 4 = 9 (Seuil 7)
extendedInput[15] = 1; extendedInput[16] = 1; // Santé: Fièvre + Toux (Pas d'urgence car pouls OK)
extendedInput[18] = 1; extendedInput[19] = 1; // Lumière: Mouv + Nuit (Pas de sommeil)

// --- NOUVEAUX INPUTS ---
extendedInput[21] = 0; // fan_on_prev = 0 (ventilateur éteint avant)
extendedInput[22] = 1; // temp_high = 1 (température haute)
extendedInput[23] = 0; // temp_low = 0 (température pas basse)

extendedInput[24] = 1; // condition_A = 1 (condition normale active)
extendedInput[25] = 0; // emergency_override_B = 0 (pas d'override)

extendedInput[26] = 1; // button_pressed_now = 1
extendedInput[27] = 1; // button_pressed_prev = 1

console.log(`Fraude détectée (Score 9/7) : ${fraudNet.predict(extendedInput)[0] ? "🚩 BLOQUÉ" : "✅ OK"}`);
console.log(`Urgence Médicale : ${healthNet.predict(extendedInput)[0] ? "🚨 AMBULANCE" : "🩺 STABLE"}`);
console.log(`Lumière automatique : ${lightNet.predict(extendedInput)[0] ? "💡 ON" : "🌑 OFF"}`);
console.log(`Ventilateur (Hystérésis) : ${fanNet.predict(extendedInput)[0] ? "💨 ON" : "🔇 OFF"}`);
console.log(`Action Prioritaire : ${prioritizedNet.predict(extendedInput)[0] ? "✅ DÉCLENCHÉE" : "❌ INHIBÉE"}`);
console.log(`Double Clic Détecté : ${doubleClickNet.predict(extendedInput)[0] ? "⚡ OUI" : "⏳ NON"}`);
// Illustration de la diversité :
console.log(`
Résumé de la diversité des requêtes :
1. Logique Floue/Majoritaire : "(A, B, C) -> 2 sur 3" (Idéal pour les capteurs instables)
2. Analyse de Risque : "Poids différenciés" (Idéal pour le scoring financier ou médical)
3. Logique Conditionnelle : "A mais pas B" (Idéal pour les modes opératoires et bypass)
4. Triage de Priorité : Priorisation d'un signal critique sur des combinaisons secondaires.
5. Hystérésis : Gestion des états avec inertie pour éviter les basculements intempestifs.
6. Priorisation/Override : Déclenchement d'une action sauf si une condition d'urgence l'annule.
7. Détection de Motif Séquentiel : Reconnaissance de séquences d'événements (même si simplifiée ici).
`);

// ---------- Extension Robotique : Intégration Servo & Senseurs ----------

/**
 * Couche de Neurones Analogiques pour le contrôle moteur (Cervelet)
 * Permet d'apprendre des mappings complexes [Maillage Capteurs] -> [Position Actuateur]
 */
export class AnalogNeuralLayer {
    constructor(inputSize, outputSize) {
        this.inputSize = inputSize;
        // Poids initialisés pour une réponse douce
        this.weights = Array.from({ length: outputSize }, () =>
            new Float32Array(inputSize).fill(0).map(() => (Math.random() * 2 - 1) * 0.1)
        );
        this.biases = new Float32Array(outputSize).fill(0);

        // Normalisation glissante (Zero Allocation)
        this.runningMeans = new Float32Array(inputSize).fill(0);
        this.runningVars = new Float32Array(inputSize).fill(1);
        // Momentum pour stabiliser l'apprentissage des contraintes physiques
        this.momentum = Array.from({ length: outputSize }, () => new Float32Array(inputSize).fill(0));
    }

    forward(inputs) {
        return this.weights.map((w, i) => {
            let sum = this.biases[i];
            for (let j = 0; j < this.inputSize; j++) {
                // Standardisation à la volée : (x - mean) / std
                const std = Math.sqrt(this.runningVars[j] + 1e-8);
                const normalizedInput = (inputs[j] - this.runningMeans[j]) / std;

                sum += normalizedInput * w[j];
            }
            // Activation linéaire pour le contrôle de puissance, ou Tanh pour brider
            return sum;
        });
    }

    /**
     * Entraîne la couche à réagir selon le maillage de capteurs
     * @param {number[]} inputs Valeurs du maillage (ex: positions relatives)
     * @param {number[]} targets Positions souhaitées de l'actuateur
     */
    train(inputs, targets, lr = 0.05) {
        // Sécurité : Normalisation de la taille des entrées/sorties
        const safeInputs = new Float32Array(this.inputSize);
        for(let i=0; i < this.inputSize; i++) {
            const val = inputs[i] || 0;
            safeInputs[i] = val;

            // Mise à jour de la normalisation (EMA - Exponential Moving Average)
            const alpha = 0.01; // Vitesse d'adaptation à l'échelle des données
            const diff = val - this.runningMeans[i];
            this.runningMeans[i] += alpha * diff;
            this.runningVars[i] = (1 - alpha) * (this.runningVars[i] + alpha * diff * diff);
        }

        const outputs = this.forward(safeInputs);

        for (let i = 0; i < this.weights.length; i++) {
            const target = (i < targets.length) ? targets[i] : outputs[i]; // Si pas de target, erreur 0
            const error = target - outputs[i];

            for (let j = 0; j < this.inputSize; j++) {
                const std = Math.sqrt(this.runningVars[j] + 1e-8);
                const normalizedInput = (safeInputs[j] - this.runningMeans[j]) / std;

                const gradient = error * normalizedInput;
                this.momentum[i][j] = this.momentum[i][j] * 0.9 + gradient * 0.1;
                this.weights[i][j] += lr * this.momentum[i][j];
            }
            this.biases[i] += lr * error * 0.1;
        }
        return outputs;
    }
}

/**
 * Couche d'abstraction pour les capteurs
 * Permet de découpler la topologie physique de la logique neuronale
 */
export class SensorMapper {
    constructor(sensorConfig) {
        this.config = sensorConfig;
        this.inputSize = 0;
        this.registry = new Map();

        // Construction de l'index sémantique
        Object.entries(sensorConfig).forEach(([groupName, group]) => {
            // Vérifie si le groupe possède un tableau de mapping (ex: analog_array)
            if (group.mapping && Array.isArray(group.mapping)) {
                group.mapping.forEach((item, index) => {
                    this.registry.set(item.id, {
                        group: groupName,
                        localIndex: index,
                        globalIndex: this.inputSize++
                    });
                });
            } else {
                // Cas d'un capteur unique (ex: torque_wrist)
                // On utilise le nom de la clé comme ID s'il n'y a pas de mapping
                this.registry.set(groupName, {
                    group: groupName,
                    localIndex: 0,
                    globalIndex: this.inputSize++
                });
            }
        });
    }

    /**
     * Transforme un objet de données brutes (ex: {p_top_l: 0.5, ...})
     * en un vecteur normalisé pour le MeshController
     */
    format(rawData) {
        const vector = new Float32Array(this.inputSize);
        for (const [id, value] of Object.entries(rawData)) {
            // Validation : On s'assure que la valeur est numérique et valide
            let cleanValue = (typeof value === 'number' && !isNaN(value)) ? value : 0;

            if (this.registry.has(id)) {
                vector[this.registry.get(id).globalIndex] = cleanValue;
            }
        }
        return vector;
    }

    /**
     * Redimensionnement (Downsampling/Upsampling)
     * Si le matériel change mais pas le cerveau
     */
    getFeatureVector(rawVector) {
        // Ici on pourrait implémenter une interpolation spatiale
        // pour ramener un drap de 16 capteurs à 4 neurones
        return rawVector;
    }

    /**
     * Reformate un exemple d'entraînement pour qu'il corresponde au mapping global
     */
    reshapeTrainingExample(example) {
        const reshapedInput = new Float32Array(this.inputSize);
        // Si l'input est un tableau simple, on le copie dans la limite de l'inputSize
        if (Array.isArray(example.input)) {
            for (let i = 0; i < Math.min(example.input.length, this.inputSize); i++) {
                reshapedInput[i] = example.input[i];
            }
        }
        return {
            input: reshapedInput,
            output: example.output // La couche de sortie gère déjà le padding/truncation
        };
    }
}

/**
 * Contrôleur de Maillage Complexe (ex: Drap intelligent)
 */
export class MeshController {
    constructor(sensorCount, actuatorCount) {
        this.cerebellum = new AnalogNeuralLayer(sensorCount, actuatorCount);
        this.anchors = []; // Stockage des échantillons maîtres
    }

    /**
     * Enregistre les points de référence pour l'interpolation
     */
    addAnchorsFromExamples(examples, totalActuatorCount) {
        this.anchors = examples.map(ex => ({
            input: new Float32Array(ex.input),
            output: new Float32Array(totalActuatorCount).map((_, i) => ex.output[i] || 0)
        }));
    }

    /**
     * Calcule les commandes moteurs en fonction des capteurs du tissu
     * @param {number[]} meshSensors Données du maillage (0.0 à 1.0)
     */
    compute(meshSensors) {
        if (this.anchors.length === 0) return this.cerebellum.forward(meshSensors);

        // Calcul de la distance euclidienne par rapport à chaque ancre
        let weights = this.anchors.map(anchor => {
            let dist = 0;
            for (let i = 0; i < meshSensors.length; i++) {
                dist += Math.pow(meshSensors[i] - anchor.input[i], 2);
            }
            dist = Math.sqrt(dist);
            // Inversion de la distance (plus on est proche, plus le poids est grand)
            // On ajoute 0.001 pour éviter la division par zéro
            return 1 / (dist + 0.01);
        });

        const totalWeight = weights.reduce((a, b) => a + b, 0);

        // Si on est vraiment trop loin de tout (zone vide),
        // on laisse le cerveau (cerebellum) décider, sinon on pondère les ancres.
        const weightedOutput = new Float32Array(this.anchors[0].output.length);
        this.anchors.forEach((anchor, i) => {
            const influence = weights[i] / totalWeight;
            for (let j = 0; j < anchor.output.length; j++) {
                weightedOutput[j] += anchor.output[j] * influence;
            }
        });

        return weightedOutput;
    }

    /**
     * Enseigne au robot comment se comporter face à une situation donnée
     */
    learnBehavior(meshSensors, expectedActuators, cycles = 10) {
        // On s'assure que les dimensions collent à la structure du cerebellum
        for(let i = 0; i < cycles; i++) {
            this.cerebellum.train(meshSensors, expectedActuators);
        }
    }
}


/**
 * Contrôleur d'Actuateur Générique (Servo, Vérin, Pince, etc.)
 * Utilise le même maillage géométrique mais avec des paramètres spécifiques.
 */
export class RobotActuator {
    constructor(name, safetyLogic, varMap, config = {}) {
        this.name = name;
        this.varMap = varMap;
        // Sécurité logique
        this.safetyNet = RuleInterpreter.interpret(safetyLogic, varMap);
        // Apprentissage de l'orientation
        this.seeker = new SeekerNeuron();

        // Paramètres spécifiques de l'actuateur
        this.kinematics = config.kinematics || { type: 'revolute', axis: [1, 0, 0] };
        this.jointAxis = new Vector3(...(this.kinematics.axis || [1, 0, 0]));
        this.min = config.min || 0;         // Valeur min (ex: 0°)
        this.max = config.max || 180;       // Valeur max (ex: 180° ou 100mm)
        this.speed = config.speed || 0.1;   // Réactivité / Force
        this.proprioceptionRatio = config.proprioceptionRatio || 0.7; // 70% pour le maillage capteurs par défaut
        this.group = config.group || "default"; // Groupe cinématique
        this.directJointCommand = null; // New: For explicit joint value commands from postures
        this.sensorId = config.sensorId || null; // Capteur tactile associé
        this.repulsion = config.repulsion !== undefined ? config.repulsion : true; // Répulsion débrayable

        // Lissage (Low-pass filter)
        this.filtering = config.filtering || { alpha: 0.05 }; // Plus doux pour éviter les sauts
        this.filteredTarget = (this.max + this.min) / 2;

        this.collisionBox = null; // Donnée locale AABB
        // Gestion du blocage (Stall / Obstacle Aspirant)
        this.collisionConfig = config.collision || { response: "none" };
        this.collisionLockTimer = 0;

        this.ikTarget = null; // Cible temporaire injectée par le solveur IK
        this.stallThreshold = config.stall_threshold || 10;
        this.isCompliant = false;

        // Paramètres PID
        this.kp = config.kp || 0.5;
        this.ki = config.ki || 0.01;
        this.kd = config.kd || 0.1;
        this.kf = config.kf || 0.05; // Gain de Feed-forward
        this.integralError = 0;
        this.lastError = 0;

        // Sécurité Granulaire
        this.safetyRules = config.safety_rules || [];
        this.currentSeverity = "NONE";

        this.currentValue = (this.max + this.min) / 2;
        this.currentOrientation = new Quaternion();
        this.velocity = 0;
        this.lastPos = this.currentValue;
        this.filteredDerivative = 0;
        this._oscillationCounter = 0; // Pour le diagnostic
    }

    /**
     * Mise à jour de l'état de l'actuateur
     */
    update(decisionInputs, globalTarget, currentLoad = 0, canMove = true, learnedTarget = null, deltaTime = 0.02, tactilePressure = 0) {
        // 0. Gestion du blocage sur collision (Freeze temporel)
        if (this.collisionLockTimer > 0) {
            this.collisionLockTimer--;
            this.velocity = 0;
            this.integralError = 0; // Reset PID pour éviter l'effet ressort au déblocage
            return this.currentValue;
        }

        // 1. Proprioception : Détection de "souffrance" moteur
        // Si le capteur tactile détecte un contact franc (> 0.5), on simule une charge
        if (this.sensorId && tactilePressure > 0.5) currentLoad += (tactilePressure * 5);

        const stallRisk = currentLoad / this.stallThreshold;

        // Gain Scheduling Dynamique : On réduit le Kp si on approche du stall pour éviter de forcer
        const adaptiveKp = this.kp * (stallRisk > 0.8 ? 0.5 : 1.0);

        // Mode Compliant actif si charge > seuil
        if (currentLoad > this.stallThreshold) {
            if (!this.isCompliant) console.log(`[!] ${this.name} : Obstacle détecté. Passage en mode COMPLIANT.`);
            this.isCompliant = true;
        } else {
            this.isCompliant = false;
        }

        // 2. Réaction Immédiate : Sécurité ou Complaisance
        if (!canMove || this.isCompliant) {
            this.integralError = 0; // Reset pour éviter les sursauts au déblocage
            // Retrait Actif : si bloqué, on applique une petite force inverse
            if (this.isCompliant) {
                const withdrawalStep = (this.max - this.min) * 0.01;
                this.currentValue -= withdrawalStep;
                this.filteredTarget = this.currentValue; // Aligne le filtre sur la position de retrait
            }

            this.velocity *= 0.5;
            this.currentValue = Math.max(this.min, Math.min(this.max, this.currentValue));
            return this.currentValue;
        }

        // 2.1 Évaluation de la Sécurité Granulaire
        let movementScale = 1.0;
        for (const rule of this.safetyRules) {
            const result = RuleInterpreter.interpret(rule.condition, this.varMap).predict(decisionInputs);
            if (result[0] === (rule.action === "HALT" ? 0 : 1)) {
                if (rule.action === "HALT") return this.currentValue;
                if (rule.action === "REDUCE_SPEED") movementScale = 0.3;
                this.currentSeverity = rule.severity;
            }
        }


        // 3. Détermination de la cible (Priorité : Direct > IK > Seeker)
        let effectiveTargetValue;

        if (this.directJointCommand !== null) {
            effectiveTargetValue = this.directJointCommand;
        } else if (this.ikTarget !== null) {
            effectiveTargetValue = this.ikTarget;
        } else {
            // Utilisation de la logique géométrique (Seeker) uniquement si pas de cible directe
            const alignment = this.seeker.predict(globalTarget);
            if (alignment < 0.999) { // NOUVEAU : Deadzone pour le neurone seeker
                const error = 1.0 - alignment;
                this.seeker.update(globalTarget, error, this.speed);
            }
            this.currentOrientation = this.seeker.orientation;

            const q = this.currentOrientation;
            const dot = q.x * this.jointAxis.x + q.y * this.jointAxis.y + q.z * this.jointAxis.z;
            
            if (this.kinematics.type === 'revolute') {
                const angle = 2 * Math.atan2(dot, q.w);
                const norm = (angle + Math.PI) / (2 * Math.PI);
                effectiveTargetValue = norm * (this.max - this.min) + this.min;
            } else {
                effectiveTargetValue = ((dot + 1) / 2) * (this.max - this.min) + this.min;
            }
        }

        // 4. Fusion et Filtrage
        const finalTarget = learnedTarget !== null ? (effectiveTargetValue * (1 - this.proprioceptionRatio)) + (learnedTarget * this.proprioceptionRatio) : effectiveTargetValue;
            
        // Sauvegarde de l'ancienne cible pour le Feed-forward avant mise à jour
        const previousFilteredTarget = this.filteredTarget;

        // Lissage de la commande (Low-Pass Filter)
        this.filteredTarget = (this.filtering.alpha * finalTarget) + (1 - this.filtering.alpha) * this.filteredTarget;

        // 5. Calcul PID stabilisé (D-on-PV + Filtering)
        const errorPID = this.filteredTarget - this.currentValue;
        
        // Anti-Windup et décharge intégrale progressive
        const isAtMin = this.currentValue <= this.min + 0.1;
        const isAtMax = this.currentValue >= this.max - 0.1;
        if (!(isAtMin && errorPID < 0) && !(isAtMax && errorPID > 0)) {
            this.integralError = Math.max(-5, Math.min(5, this.integralError + errorPID * deltaTime));
            if (Math.abs(errorPID) < 0.2) this.integralError *= 0.5; 
        } else {
            this.integralError *= 0.5; // Décharge rapide aux limites
        }
        
        // Calcul de la dérivée sur la position (D-on-PV) pour éviter les sursauts de consigne
        const deltaPos = (this.currentValue - this.lastPos) / deltaTime;
        this.lastPos = this.currentValue;
        
        // Filtre passe-bas sur la dérivée (alpha=0.2) pour supprimer le jitter
        this.filteredDerivative = (0.2 * -deltaPos) + (0.8 * this.filteredDerivative);
        const derivative = this.filteredDerivative;
        
        // Feed-forward basé sur la cinématique de la consigne
        const feedForward = (this.filteredTarget - previousFilteredTarget) * this.kf;
        
        const pidOutput = ((adaptiveKp * errorPID) + (this.ki * this.integralError) + (this.kd * derivative) + feedForward) * deltaTime * 50;
        this.lastError = errorPID;

        // DIAGNOSTIC : Détection d'oscillation haute fréquence
        const currentSign = Math.sign(pidOutput);
        if (this.lastSign && currentSign !== this.lastSign && Math.abs(errorPID) > 0.05) {
            this._oscillationCounter++;
            if (this._oscillationCounter > 10) {
                console.warn(`[JITTER_DETECT] ${this.name} oscille ! Error: ${errorPID.toFixed(4)}, PID: ${pidOutput.toFixed(4)}`);
                this._oscillationCounter = 0;
            }
        }
        this.lastSign = currentSign;

        // Zone morte : On ne bouge QUE si l'erreur est significative.
        // Si l'erreur est minuscule, on fige la position pour éviter le tremblement.
        const deadZone = 0.05; 
        if (Math.abs(errorPID) < deadZone) {
            this.integralError *= 0.8; // Décharge lente de l'intégrale
            this.velocity = 0;
            return this.currentValue;
        }

        const maxStep = this.speed * movementScale * deltaTime * 60;
        this.currentValue += Math.max(-maxStep, Math.min(maxStep, pidOutput));
        this.currentValue = Math.max(this.min, Math.min(this.max, this.currentValue)); // Clamp final value
        this.ikTarget = null; // Reset temporary IK target for next frame
        this.directJointCommand = null; // Reset direct command for next frame

        return this.currentValue;
    }

    /**
     * Active le verrouillage de sécurité suite à un contact physique
     */
    triggerCollisionLock() {
        if (this.collisionConfig.response === "freeze" && this.collisionLockTimer <= 0) {
            this.collisionLockTimer = this.collisionConfig.lockDurationFrames || 15;
        }
    }
}

// --- Gestionnaire de Cibles Multi-Groupes ---
export class KinematicHub {
    constructor() {
        this.activeStates = new Map(); // GroupName -> État complet actuel {orientation, position, values}
        this.stateLibraries = new Map(); // GroupName -> État[]
        this.tagMaps = new Map(); // GroupName -> Map<TagName, Index>
    }

    // Enregistre une liste de cibles (états) pour un groupe
    registerStates(group, rawStates, tags = null) {
        this.stateLibraries.set(group, rawStates);
        if (tags) {
            const tagMap = new Map();
            if (Array.isArray(tags)) {
                tags.forEach((tag, idx) => tagMap.set(tag, idx));
            } else {
                Object.entries(tags).forEach(([tag, idx]) => tagMap.set(tag, idx));
            }
            this.tagMaps.set(group, tagMap);
        }
        if (!this.activeStates.has(group)) {
            this.activeStates.set(group, rawStates[0]);
        }
    }

    selectState(group, identifier) {
        const lib = this.stateLibraries.get(group);
        if (!lib) return false;

        let index = identifier;
        if (typeof identifier === 'string') {
            const tagMap = this.tagMaps.get(group);
            if (tagMap && tagMap.has(identifier)) {
                index = tagMap.get(identifier);
            }
        }

        if (lib && lib[index]) {
            this.activeStates.set(group, lib[index]);
            return true;
        }
        return false;
    }

    setTarget(group, quaternion) {
        this.activeStates.set(group, { orientation: quaternion.normalize() });
    }

    getTarget(group) {
        return this.activeStates.get(group) || this.activeStates.get("default") || { orientation: new Quaternion() };
    }
}

/**
 * Représente un maillon (link) dans la chaîne cinématique du robot.
 * Un maillon est défini par son joint et sa transformation par rapport à son parent.
 */
export class Link {
    constructor(name, parentName, offset, orientationOffset, jointType, jointAxis, primitive = null) {
        this.name = name;
        this.parentName = parentName; // Nom du maillon parent ('base' pour le premier)
        this.offset = new Vector3(...offset); // Translation de l'origine du parent à l'origine de ce joint
        this.orientationOffset = new Quaternion(...orientationOffset); // Orientation fixe par rapport au parent
        this.jointType = jointType; // 'revolute' ou 'prismatic'
        this.jointAxis = new Vector3(...jointAxis).normalize(); // Axe de rotation/translation du joint
        this.primitive = primitive; // Données géométriques

        this.currentJointValue = 0; // Valeur actuelle du joint (angle en degrés, longueur en mm)
        this.currentRotation = new Quaternion(); // Rotation locale du joint (par rapport à son état neutre)
        this.currentPosition = new Vector3(); // Position de l'origine de ce joint dans le repère monde
        this.currentWorldRotation = new Quaternion(); // Orientation de ce joint dans le repère monde
        this.localBox = null; // Box locale
        this.worldAABB = null; // Box calculée dans le monde après FK
        this.localSpheres = []; // Sphères de collision locales {offset, radius}
        this.worldSpheres = []; // Sphères transformées dans le monde
    }

    // Calcule la transformation locale en réutilisant les objets out
    getJointTransform(jointValue, outRot, outTrans) {
        if (this.jointType === 'revolute') {
            const angleRad = jointValue * Math.PI / 180;
            const halfAngle = angleRad / 2;
            const sinHalf = Math.sin(halfAngle);
            outRot.w = Math.cos(halfAngle);
            outRot.x = this.jointAxis.x * sinHalf;
            outRot.y = this.jointAxis.y * sinHalf;
            outRot.z = this.jointAxis.z * sinHalf;
            outTrans.x = 0; outTrans.y = 0; outTrans.z = 0;
        } else if (this.jointType === 'prismatic') {
            outRot.w = 1; outRot.x = 0; outRot.y = 0; outRot.z = 0;
            this.jointAxis.scale(jointValue / 1000, outTrans); 
        }
    }
}

/**
 * Gère la chaîne cinématique du robot et calcule la cinématique directe (FK).
 */
export class KinematicChain {
    constructor(baseOffset = [0, 0, 0], baseRotation = [1, 0, 0, 0]) {
        this.links = new Map(); // Map<string, Link> pour un accès rapide par nom
        this.baseOffset = new Vector3(...baseOffset); // Position de la base du robot dans le monde
        this.baseRotation = new Quaternion(...baseRotation); // Orientation de la base du robot dans le monde
        this.safetyPadding = 0.025; // 2.5cm de zone de confort (padding)
        this.repulsionStrength = 0.4; // Force de poussée du champ répulsif
        this.orderedLinks = []; // Liste ordonnée des maillons pour le calcul FK
        
        // Buffers de calcul pour éviter le GC
        this._tempRot = new Quaternion();
        this._tempTrans = new Vector3();
        this._tempWorldBaseRot = new Quaternion();
        this._tempVec = new Vector3();
        this._tempVec2 = new Vector3();
        this.worldVelocity = new Vector3(0, 0, 0);
    }

    /**
     * Déplace physiquement la base du robot dans le monde
     */
    moveBase(velocity, deltaTime) {
        const step = velocity.scale(deltaTime);
        this.baseOffset.add(step, this.baseOffset);
    }

    addLink(link) {
        this.links.set(link.name, link);
    }

    checkReachability(targetPos, envelope) {
        if (!envelope) return true;
        const dist = targetPos.distanceTo(new Vector3(...envelope.center));
        const inside = dist <= envelope.radius_max && dist >= envelope.radius_min;
        if (!inside) console.warn(`[IK] Cible hors de l'enveloppe de travail (${dist.toFixed(2)}m)`);
        return inside;
    }

    // Construit la chaîne à partir des configurations d'actuateurs
    buildChain(actuatorConfigs) {
        actuatorConfigs.forEach(actConfig => {
            // Support des Quaternions [w,x,y,z] OU des angles d'Euler [x,y,z] pour l'offset de rotation
            let rotOffset;
            if (actConfig.rotationOffset && actConfig.rotationOffset.length === 3) {
                rotOffset = Quaternion.fromEuler(actConfig.rotationOffset[0], actConfig.rotationOffset[1], actConfig.rotationOffset[2]).toArray();
            } else {
                rotOffset = actConfig.rotationOffset || [1, 0, 0, 0];
            }

            const link = new Link(
                actConfig.name,
                actConfig.parent,
                actConfig.offset,
                rotOffset,
                actConfig.kinematics.type,
                actConfig.kinematics.axis,
                actConfig.primitive || null
            );
            // Initialisation de la boite de collision locale pour le calcul des AABB
            link.localBox = MeshAwarenessUtils.getLocalBoxFromPrimitive(actConfig.primitive);
            
            // Génération de sphères de collision pour les formes allongées
            if (actConfig.primitive && (actConfig.primitive.type === 'cylinder' || actConfig.primitive.type === 'box')) {
                const h = actConfig.primitive.height || (actConfig.primitive.size ? actConfig.primitive.size[1] : 0.1);
                const r = actConfig.primitive.radius || (actConfig.primitive.size ? Math.min(actConfig.primitive.size[0], actConfig.primitive.size[2])/2 : 0.05);
                
                // On répartit 3 sphères le long du segment (base, milieu, haut)
                for (let step = 0; step <= 1; step += 0.5) {
                    link.localSpheres.push({
                        offset: new Vector3(0, h * step, 0),
                        radius: r
                    });
                }
            }
            this.addLink(link);
        });

        // Ordonne les maillons pour le calcul FK (simple parcours parent-enfant)
        const visited = new Set();
        const queue = [{ name: 'base', parent: null }]; // Commence avec un maillon 'base' virtuel

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current.name)) continue;
            visited.add(current.name);

            if (current.name !== 'base') {
                this.orderedLinks.push(this.links.get(current.name));
            }
            this.links.forEach(link => {
                if (link.parentName === current.name && !visited.has(link.name)) {
                    queue.push(link);
                }
            });
        }
    }

    calculateFK(jointValues) {
        for (const link of this.orderedLinks) {
            const parentLink = this.links.get(link.parentName);

            let pPos, pRot;
            if (parentLink) {
                pPos = parentLink.currentPosition;
                pRot = parentLink.currentWorldRotation;
            } else {
                pPos = this.baseOffset;
                pRot = this.baseRotation;
            }

            // Applique l'offset du parent à l'origine de ce joint
            pRot.rotateVector(link.offset, this._tempVec);
            pPos.add(this._tempVec, link.currentPosition);

            // Calcul transformation locale
            const jointValue = jointValues.get(link.name) || 0;
            link.getJointTransform(jointValue, this._tempRot, this._tempTrans);

            // Applique la translation locale du joint (pour les joints prismatiques)
            pRot.rotateVector(this._tempTrans, this._tempVec);
            link.currentPosition.add(this._tempVec, link.currentPosition);

            // Applique l'orientation de base du maillon, puis la rotation du joint
            // WorldRotation = ParentWorldRotation * OrientationOffset * JointRotation
            pRot.multiply(link.orientationOffset, this._tempWorldBaseRot);
            this._tempWorldBaseRot.multiply(this._tempRot, link.currentWorldRotation).normalize();
            
            // Mise à jour intelligente de l'AABB Monde pour la détection de collision
            if (link.localBox) {
                link.worldAABB = MeshAwarenessUtils.getTransformedAABB(
                    link.localBox, 
                    link.currentPosition, 
                    link.currentWorldRotation
                );
            }

            // Mise à jour des Sphères de collision en coordonnées Monde
            link.worldSpheres = link.localSpheres.map(ls => {
                const center = new Vector3();
                link.currentWorldRotation.rotateVector(ls.offset, center);
                center.addInPlace(link.currentPosition);
                return { center, radius: ls.radius };
            });

            link.currentJointValue = jointValue;
        }

        const endEffectorLink = this.orderedLinks[this.orderedLinks.length - 1];
        return endEffectorLink ? 
            { position: endEffectorLink.currentPosition, orientation: endEffectorLink.currentWorldRotation } : 
            { position: new Vector3(), orientation: new Quaternion() };
    }

    /**
     * Vérifie les auto-collisions entre tous les maillons.
     * Exclut les paires parent-enfant directes (qui sont naturellement en contact).
     */
    checkSelfCollision(padding = 0) {
        const collisions = [];
        const linkArray = Array.from(this.links.values());
        for (let i = 0; i < linkArray.length; i++) {
            for (let j = i + 1; j < linkArray.length; j++) {
                const a = linkArray[i], b = linkArray[j];
                if (a.parentName === b.name || b.parentName === a.name) continue;

                let hasCollision = false;

                // Priorité aux sphères pour la précision sur les segments
                if (a.worldSpheres.length > 0 && b.worldSpheres.length > 0) {
                    for (const sA of a.worldSpheres) {
                        for (const sB of b.worldSpheres) {
                            if (MeshAwarenessUtils.intersectsSphereSphere(sA, sB, padding)) {
                                hasCollision = true; break;
                            }
                        }
                        if (hasCollision) break;
                    }
                } else if (a.worldAABB && b.worldAABB) {
                    // Fallback sur AABB si pas de sphères définies
                    hasCollision = MeshAwarenessUtils.intersects(a.worldAABB, b.worldAABB, padding);
                }

                if (hasCollision) {
                    collisions.push({ a: a.name, b: b.name });
                }
            }
        }
        return collisions;
    }

    /**
     * Solveur IK basé sur le CCD (Cyclic Coordinate Descent) robuste
     * Gère les limites articulaires et l'amortissement.
     */
    solveIK(targetPos, allActuators, movableGroups = null, iterations = 20, damping = 0.5) {
        const allActuatorList = Array.from(allActuators.values());
        const movableActuators = movableGroups 
            ? allActuatorList.filter(a => movableGroups.includes(a.group))
            : allActuatorList;

        // Seuil de tolérance : si l'effecteur est déjà à moins de 0.5mm, on ne recalcule rien.
        const convergenceThreshold = 0.0005; 

        for (let iter = 0; iter < iterations; iter++) {
            // STABILISATION : On utilise filteredTarget (la cible théorique stable) 
            // plutôt que currentValue (la position physique actuelle qui peut osciller).
            const currentJointValues = new Map(allActuatorList.map(a => [
                a.name, 
                a.ikTarget !== null ? a.ikTarget : a.filteredTarget
            ]));
            
            // On remonte la chaîne de l'effecteur vers la base
            for (let i = movableActuators.length - 1; i >= 0; i--) {
                const actuator = movableActuators[i];
                const fk = this.calculateFK(currentJointValues);
                const currentEE = fk.position;
                const currentVal = currentJointValues.get(actuator.name);
                
                // Sauvegarde pour rollback en cas de collision
                const prevIkTarget = actuator.ikTarget;

                const distToTarget = currentEE.distanceTo(targetPos);
                if (distToTarget < convergenceThreshold) return; // Sortie anticipée "propre"

                const link = this.links.get(actuator.name);
                const jointOrigin = link.currentPosition;

                if (actuator.kinematics.type === 'revolute') {
                    // Sécurité : on ignore le calcul si l'articulation est sur la cible (évite les sauts de 90°)
                    const distEE = currentEE.distanceTo(jointOrigin);
                    const distTarget = targetPos.distanceTo(jointOrigin);
                    if (distEE < 0.001 || distTarget < 0.001) continue;

                    // Vecteurs Joint->Effecteur et Joint->Cible normalisés
                    const vEE = currentEE.sub(jointOrigin, this._tempVec).normalize();
                    // On utilise un second buffer pour ne pas écraser le premier
                    const vTarget = targetPos.sub(jointOrigin, this._tempVec2).normalize(); 

                    // Calcul de l'angle nécessaire (produit scalaire)
                    let dot = vEE.dot(vTarget);
                    dot = Math.max(-1, Math.min(1, dot));
                    const angleDiff = Math.acos(dot) * (180 / Math.PI);
                    
                    // Zone morte angulaire : on ignore les corrections inférieures à 0.1 degré
                    if (angleDiff < 0.1) continue;

                    // Calcul de la direction via le produit vectoriel
                    const cross = vEE.cross(vTarget);
                    const sign = cross.dot(link.jointAxis) > 0 ? 1 : -1;

                    // Amortissement plus agressif près de la cible pour éviter les dépassements (overshoot)
                    const adaptiveDamping = distToTarget < 0.02 ? damping * 0.1 : damping;
                    
                    actuator.ikTarget = currentVal + (angleDiff * sign * adaptiveDamping); 
                    if (isNaN(actuator.ikTarget)) actuator.ikTarget = currentVal;
                }
                else if (actuator.kinematics.type === 'prismatic') {
                    const dir = targetPos.sub(currentEE).dot(link.jointAxis);
                    actuator.ikTarget = currentVal + (dir * damping * 100);
                }

                // --- CHAMP DE POTENTIEL RÉPULSIF ---
                // On vérifie si la nouvelle cible entre dans la zone de padding
                currentJointValues.set(actuator.name, actuator.ikTarget);
                this.calculateFK(currentJointValues);
                
                const warnings = this.checkSelfCollision(this.safetyPadding);
                for (const collision of warnings) {
                    // On ne repousse que si les deux membres en collision ont la répulsion activée
                    const actA = allActuators.get(collision.a);
                    const actB = allActuators.get(collision.b);

                    if (actA && actB && actA.repulsion && actB.repulsion) {
                        if (actuator.name === collision.a || actuator.name === collision.b) {
                            const pushDir = actuator.ikTarget > currentVal ? -1 : 1;
                            const nudge = (actuator.max - actuator.min) * 0.05 * this.repulsionStrength;
                            actuator.ikTarget += pushDir * nudge;
                            break; // Un seul nudge par étape suffit
                        }
                    }
                }

                // Application finale des limites articulaires
                actuator.ikTarget = Math.max(actuator.min, Math.min(actuator.max, actuator.ikTarget));

                // --- ÉVITEMENT DE COLLISION CRITIQUE (Hard Stop) ---
                currentJointValues.set(actuator.name, actuator.ikTarget);
                this.calculateFK(currentJointValues);
                
                const hardCollisions = this.checkSelfCollision(0);
                if (hardCollisions.length > 0) {
                    // On bloque les actuateurs impliqués
                    hardCollisions.forEach(c => {
                        allActuators.get(c.a)?.triggerCollisionLock();
                        allActuators.get(c.b)?.triggerCollisionLock();
                    });
                    // Si collision, on revient à l'état précédent (ou au filtre actuel si premier IK)
                    actuator.ikTarget = prevIkTarget !== null ? prevIkTarget : currentVal;
                    currentJointValues.set(actuator.name, actuator.ikTarget);
                    this.calculateFK(currentJointValues); // Restaure l'état FK cohérent
                }
            }
        }
    }
}

/**
 * CNN léger pour le traitement spatio-temporel (Mouvement 3D)
 * Optimisé pour des grilles de type [Temps, Y, X]
 */
export class CNNBrain {
    constructor(config = {}) {
        this.inputShape = config.inputShape || [50, 10, 10]; // [T, Y, X]
        this.numActions = config.numActions || 4;

        // Hyperparamètres
        this.lr = config.lr || 0.01;
        this.wd = config.wd || 0.001; // Weight Decay (Régularisation L2)

        // Architecture : 1 Couche de Convolution 2D + TSM + 1 Couche Dense
        // Filtre 3x3 (2D) - TSM (Temporal Shift Module) permet de capturer
        // les dépendances temporelles sans le coût d'une convolution 3D.
        this.filters = Array.from({ length: 16 }, () => ({
            weights: new Float32Array(3 * 3).fill(0).map(() => Math.random() * 2 - 1),
            bias: 0,
            m_w: new Float32Array(9).fill(0), // Adam: 1er moment
            v_w: new Float32Array(9).fill(0), // Adam: 2ème moment
            m_b: 0, v_b: 0
        }));

        // Couche Dense (Sortie)
        this.denseWeights = new Float32Array(this.filters.length * this.numActions).fill(0).map(() => Math.random() * 2 - 1);
        this.denseBiases = new Float32Array(this.numActions).fill(0);

        // --- OPTIMISEUR ADAPTATIF (Adam) ---
        // Poids denses
        this.m_weights = new Float32Array(this.denseWeights.length).fill(0);
        this.v_weights = new Float32Array(this.denseWeights.length).fill(0);
        // Biais denses
        this.m_bias_dense = new Float32Array(this.numActions).fill(0);
        this.v_bias_dense = new Float32Array(this.numActions).fill(0);

        this.beta1 = 0.9; this.beta2 = 0.999; this.eps = 1e-8;
        this.t = 0; // Compteur d'itérations
    }

    /**
     * Forward pass optimisé
     * @param {Uint8Array} input Flux binaire aplati [T * 100]
     */
    predict(input) {
        const featureMap = this._getFeatureMap(input);

        // 1. Calcul des Logits (Sommes brutes)
        const logits = new Float32Array(this.numActions);
        let maxLogit = -Infinity;
        for (let i = 0; i < this.numActions; i++) {
            let dot = this.denseBiases[i];
            for (let f = 0; f < this.filters.length; f++) {
                dot += featureMap[f] * this.denseWeights[i * this.filters.length + f];
            }
            logits[i] = dot;
            if (dot > maxLogit) maxLogit = dot;
        }

        // 2. Softmax pour forcer la compétition entre les actions
        const probs = new Float32Array(this.numActions);
        let sumExp = 0;
        for (let i = 0; i < this.numActions; i++) {
            probs[i] = Math.exp(logits[i] - maxLogit);
            sumExp += probs[i];
        }

        let bestIdx = -1;
        let bestProb = 0;
        for (let i = 0; i < this.numActions; i++) {
            probs[i] /= sumExp;
            if (probs[i] > bestProb) {
                bestProb = probs[i];
                bestIdx = i;
            }
        }

        const results = new Array(this.numActions).fill(0);
        // --- AJUSTEMENT : SEUIL DE CONFIANCE ÉQUILIBRÉ ---
        // 0.45 est un bon compromis pour laisser passer les gestes appris rapidement
        if (bestIdx !== -1 && bestProb > 0.6) { // Seuil augmenté pour éviter les faux positifs
            results[bestIdx] = 1;
        }
        return results;
    }

    _getFeatureMap(input) {
        const T = this.inputShape[0];
        // Calcul dynamique de la résolution spatiale (H et W)
        const spatialFlatSize = input.length / T;
        const H = Math.sqrt(spatialFlatSize);
        const W = H; 

        const numFilters = this.filters.length;
        const featureMap = new Float32Array(numFilters).fill(0);
        const spatialSize = spatialFlatSize;

        for (let f = 0; f < numFilters; f++) {
            let sum = 0;
            let counts = 0;
            const filter = this.filters[f];

            // --- TSM (Temporal Shift Module) Logic ---
            // On décale l'index temporel selon le filtre pour donner une "vision" du temps
            const shift = (f % 4 === 1) ? -1 : (f % 4 === 2 ? 1 : 0);

            for (let t = 0; t < T; t += 4) { 
                const tEff = Math.max(0, Math.min(T - 1, t + shift));

                for (let y = 0; y < H - 3; y += 2) { // Stride spatial augmenté (vitesse x2)
                    for (let x = 0; x < W - 3; x += 2) {
                        let conv = 0;
                        for (let iy = 0; iy < 3; iy++) {
                            for (let ix = 0; ix < 3; ix++) {
                                const val = input[tEff * spatialSize + (y + iy) * W + (x + ix)] || 0;
                                conv += val * filter.weights[iy * 3 + ix];
                            }
                        }
                        sum += Math.max(0, conv + filter.bias);
                        counts++;
                    }
                }
            }
            featureMap[f] = sum / (counts || 1);
        }
        return featureMap;
    }

    /**
     * Ajuste les filtres (les "yeux") pour mieux capturer le mouvement
     */
    _updateFilters(sequence, filterIdx, error) {
        const filter = this.filters[filterIdx];
        const T = this.inputShape[0];
        const spatialFlatSize = sequence.length / T;
        const H = Math.sqrt(spatialFlatSize);
        const W = H;

        const lr = this.lr * 0.5; // Gain local
        const spatialSize = spatialFlatSize;

        const midT = Math.floor(T / 2);
        const midY = Math.floor(H / 2);
        const midX = Math.floor(W / 2);

        for (let iy = 0; iy < 3; iy++) {
            for (let ix = 0; ix < 3; ix++) {
                const val = sequence[midT * spatialSize + (midY + iy) * W + (midX + ix)] || 0;
                const grad = error * val;
                const idx = iy * 3 + ix;

                // --- ADAM (Filtre Weights) ---
                filter.m_w[idx] = this.beta1 * filter.m_w[idx] + (1 - this.beta1) * grad;
                filter.v_w[idx] = this.beta2 * filter.v_w[idx] + (1 - this.beta2) * (grad * grad);
                const m_hat = filter.m_w[idx] / (1 - Math.pow(this.beta1, this.t));
                const v_hat = filter.v_w[idx] / (1 - Math.pow(this.beta2, this.t));
                filter.weights[idx] += lr * m_hat / (Math.sqrt(v_hat) + this.eps);
            }
        }
        
        // --- ADAM (Filtre Bias) ---
        filter.m_b = this.beta1 * filter.m_b + (1 - this.beta1) * error;
        filter.v_b = this.beta2 * filter.v_b + (1 - this.beta2) * (error * error);
        const mb_hat = filter.m_b / (1 - Math.pow(this.beta1, this.t));
        const vb_hat = filter.v_b / (1 - Math.pow(this.beta2, this.t));
        filter.bias += lr * mb_hat / (Math.sqrt(vb_hat) + this.eps);
    }

    /**
     * Entraînement par renforcement de patterns
     * @param {Uint8Array} sequence La séquence d'entrée
     * @param {number} actionIdx L'index de l'action attendue
     */
    train(sequence, actionIdx) {
        let featureMap = this._getFeatureMap(sequence);
        let totalSampleLoss = 0;
        this.t++;

        // Forward pass pour obtenir les probabilités (Softmax)
        const logits = new Float32Array(this.numActions);
        let maxLogit = -Infinity;
        for (let i = 0; i < this.numActions; i++) {
            let dot = this.denseBiases[i];
            for (let f = 0; f < this.filters.length; f++) {
                dot += featureMap[f] * this.denseWeights[i * this.filters.length + f];
            }
            logits[i] = dot;
            if (dot > maxLogit) maxLogit = dot;
        }

        const probs = new Float32Array(this.numActions);
        let sumExp = 0;
        for (let i = 0; i < this.numActions; i++) {
            probs[i] = Math.exp(logits[i] - maxLogit);
            sumExp += probs[i];
        }
        for (let i = 0; i < this.numActions; i++) probs[i] /= sumExp;

        // --- ENTRAÎNEMENT DISCRIMINATIF À MARGE ---
        const MARGIN = 0.45; // Augmentation de la marge de sécurité entre les classes
        const targetProb = probs[actionIdx];

        for (let i = 0; i < this.numActions; i++) {
            const isCorrect = (i === actionIdx);
            const target = isCorrect ? 1 : 0;
            // Calcul de l'erreur brute
            let error = (target - probs[i]);

            // Logique de Marge : Augmente la répulsion si une mauvaise classe est trop confiante
            if (!isCorrect && probs[i] > 0.3) {
                error *= 1.5; 
            }

            // --- GRADIENT CLIPPING ADOUCI ---
            // On limite moins l'erreur pour permettre un apprentissage initial plus franc
            error = Math.max(-1.0, Math.min(1.0, error));

            totalSampleLoss += error * error;
            for (let f = 0; f < this.filters.length; f++) {
                const idx = i * this.filters.length + f;
                let grad = error * featureMap[f];

                // Mise à jour adaptative (Adam)
                this.m_weights[idx] = this.beta1 * this.m_weights[idx] + (1 - this.beta1) * grad;
                this.v_weights[idx] = this.beta2 * this.v_weights[idx] + (1 - this.beta2) * (grad * grad);
                
                const m_hat = this.m_weights[idx] / (1 - Math.pow(this.beta1, this.t));
                const v_hat = this.v_weights[idx] / (1 - Math.pow(this.beta2, this.t));

                // Application correcte du Weight Decay (AdamW style)
                this.denseWeights[idx] -= this.lr * this.wd * this.denseWeights[idx];
                // Mise à jour Adam
                this.denseWeights[idx] += this.lr * m_hat / (Math.sqrt(v_hat) + this.eps);
                
                // --- THÉORIE : STABILITÉ SYNAPTIQUE ---
                // On augmente le multiplicateur à 0.5 (au lieu de 0.2) pour que 
                // les filtres puissent réellement évoluer.
                if (isCorrect && Math.abs(error) > 0.15) {
                    const filterError = error * 0.5; 
                    this._updateFilters(sequence, f, filterError);
                }
            }
            // --- ADAM (Dense Bias) ---
            this.m_bias_dense[i] = this.beta1 * this.m_bias_dense[i] + (1 - this.beta1) * error;
            this.v_bias_dense[i] = this.beta2 * this.v_bias_dense[i] + (1 - this.beta2) * (error * error);
            const mb_hat = this.m_bias_dense[i] / (1 - Math.pow(this.beta1, this.t));
            const vb_hat = this.v_bias_dense[i] / (1 - Math.pow(this.beta2, this.t));
            
            this.denseBiases[i] += this.lr * mb_hat / (Math.sqrt(vb_hat) + this.eps);
        }
        return totalSampleLoss / this.numActions;
    }
}
/**
 * Usine de montage du robot à partir d'une configuration JSON
 */
export class RobotFactory {
    static build(config) {
        const hub = new KinematicHub();
        const actuators = [];
        const varMap = config.variables;
        const sensorMapper = new SensorMapper(config.sensors || {});
        
        // 1. Enregistrement des états cinématiques
        for (const [groupName, data] of Object.entries(config.kinematics)) {
            // Sécurité : ignore les objets de configuration qui ne sont pas des groupes d'états (ex: workspace_envelope)
            if (!data.states) continue;

            const parsedStates = data.states.map(s => {
                const state = {
                    orientation: s.euler ? Quaternion.fromEuler(s.euler[0], s.euler[1], s.euler[2]) :
                                 s.q ? new Quaternion(...s.q) : new Quaternion(),
                    position: s.pos ? new Vector3(...s.pos) : null,
                    values: s.values || null
                };
                return state;
            });
            
            const tags = data.states.map(s => s.tag);
            hub.registerStates(groupName, parsedStates, tags);
        }

        // 2. Instanciation des actuateurs
        for (const actConfig of config.actuators) {
            const instance = new RobotActuator(
                actConfig.name, 
                config.logic.safety_ok,
                varMap, 
                { 
                    group: actConfig.group,
                    kinematics: actConfig.kinematics,
                    // Les propriétés parent et offset sont utilisées par KinematicChain,
                    // pas directement par RobotActuator, mais sont passées ici pour la cohérence
                    ...actConfig.config 
                }
            );
            actuators.push(instance);
        }
        // 3. Construction de la chaîne cinématique
        const kinematicChain = new KinematicChain();

        if (config.system_settings) {
            if (config.system_settings.safety_padding !== undefined) kinematicChain.safetyPadding = config.system_settings.safety_padding;
            if (config.system_settings.repulsion_strength !== undefined) kinematicChain.repulsionStrength = config.system_settings.repulsion_strength;
        }

        kinematicChain.buildChain(config.actuators); // Passe les configurations brutes des actuateurs

        // 0. Compilation des réseaux logiques (après varMap complet)
        const safetyNet = RuleInterpreter.interpret(config.logic.safety_ok, varMap);
        const behaviorNet = RuleInterpreter.interpret(config.logic.behavior, varMap);

        return { hub, actuators, varMap, safetyNet, behaviorNet, kinematicChain, sensorMapper };
    }
}

/**
 * Échantillonneur Temporel pour l'apprentissage relatif
 * Transforme une séquence d'états absolus en un dataset différentiel
 */
export class TemporalSampler {
    constructor() {
        this.history = [];
    }

    // Enregistre l'instantané actuel du robot
    record(meshSensors, actuators) {
        this.history.push({
            sensors: [...meshSensors],
            actuators: actuators.map(a => ({
                val: a.currentValue,
                q: new Quaternion(a.currentOrientation.w, a.currentOrientation.x, a.currentOrientation.y, a.currentOrientation.z)
            }))
        });
    }

    /**
     * Génère un dataset où les sorties sont les variations (deltas)
     * Utile pour entraîner le MeshController en mode dynamique
     */
    generateRelativeDataset() {
        const dataset = [];
        for (let i = 0; i < this.history.length - 1; i++) {
            const current = this.history[i];
            const next = this.history[i+1];

            const input = current.sensors;
            const outputDeltas = current.actuators.map((act, idx) => {
                const nextAct = next.actuators[idx];
                
                // Delta pour la valeur scalaire (Vérin/Pince)
                const deltaVal = nextAct.val - act.val;

                // Delta pour l'orientation (Quaternion relatif)
                // q_rel = q_current_inv * q_next
                const qRel = act.q.conjugate().multiply(nextAct.q);

                // Pour le MeshController (analogique), on extrait souvent la magnitude 
                // ou une projection du delta. Ici on retourne le delta scalaire.
                return deltaVal;
            });

            dataset.push({ input, deltaOutput: outputDeltas });
        }
        return dataset;
    }

    clear() {
        this.history = [];
    }
}

// ---------- Outils de Projection et Vision 3D ----------
export class ProjectiveGeometry {
    /**
     * Back-projection : Transforme un point 2D + une profondeur estimée en position 3D
     * @param {number} x Coordonnée X écran
     * @param {number} y Coordonnée Y écran
     * @param {number} z Profondeur estimée (Z)
     * @param {number} f Longueur focale
     * @param {number} w Largeur image
     * @param {number} h Hauteur image
     */
    static unproject(x, y, z, f, w, h) {
        const factor = z / f;
        return new Vector3(
            (x - w / 2) * factor,
            -(y - h / 2) * factor, // Y inversé pour l'espace 3D
            z
        );
    }

    /**
     * Projette un point 3D en 2D (Perspective)
     */
    static project(v, f, w, h) {
        const z = (v.z <= 0) ? 0.001 : v.z;
        const factor = f / z;
        return [
            v.x * factor + w / 2,
            -v.y * factor + h / 2
        ];
    }
}

/**
 * Analyseur de texture binaire pour transformer des pixels en vecteurs de force
 */
export class PixelFeatureExtractor {
    /**
     * Extrait les centres de masse bit à bit d'une zone de pixels
     * @param {Uint8Array} pixels Grille de pixels (0 ou 1)
     * @param {number} width 
     * @param {number} height
     */
    static extractCentroids(pixels, width, height) {
        let sumX = 0, sumY = 0, count = 0;
        for (let i = 0; i < pixels.length; i++) {
            if (pixels[i] === 1) {
                sumX += (i % width);
                sumY += Math.floor(i / width);
                count++;
            }
        }
        if (count === 0) return new Vector3(0, 0, 0);
        // Retourne un vecteur normalisé (-1 à 1) représentant la direction principale de l'objet
        return new Vector3((sumX / count) / width * 2 - 1, -(sumY / count) / height * 2 + 1, 0.5);
    }
}

/**
 * Modèle de génération de mesh bit à bit.
 * Apprend à mapper une signature 2D vers un vecteur de bits géométriques (Pos + Normales).
 */
export class BitwiseMeshMapper {
    constructor(inputSize, outputBitSize) {
        this.inputSize = inputSize;
        this.outputBitSize = outputBitSize;
        // Un neurone par bit de sortie pour une prédiction bit à bit indépendante
        this.outputNeurons = Array.from({ length: outputBitSize }, () => new AdaptiveMajorityNeuron(inputSize));
    }

    /**
     * Prédit l'ensemble des bits géométriques
     * @param {Uint8Array|Float32Array} signature 2D
     */
    predict(signature) {
        const bits = new Uint8Array(this.outputBitSize);
        for (let i = 0; i < this.outputBitSize; i++) {
            bits[i] = this.outputNeurons[i].predict(signature);
        }
        return bits;
    }

    /**
     * Entraîne le mapping géométrique
     * @param {Uint8Array|Float32Array} signature Image 2D
     * @param {Uint8Array} targetBits Bits de géométrie (Position/Normale encodées)
     */
    train(signature, targetBits) {
        for (let i = 0; i < this.outputBitSize; i++) {
            this.outputNeurons[i].train(signature, targetBits[i]);
        }
    }

    exportState() {
        return {
            neurons: this.outputNeurons.map(n => n.exportState())
        };
    }

    importState(state) {
        if (!state.neurons || state.neurons.length !== this.outputBitSize) return;
        for (let i = 0; i < this.outputBitSize; i++) {
            this.outputNeurons[i].importState(state.neurons[i]);
        }
    }

    /**
     * Calcule la précision globale du modèle sur un échantillon
     */
    evaluate(signature, targetBits) {
        const pred = this.predict(signature);
        let correct = 0;
        for (let i = 0; i < this.outputBitSize; i++) if (pred[i] === targetBits[i]) correct++;
        return correct / this.outputBitSize;
    }
}

/**
 * Brain spécialisé dans la reconstruction 3D à partir de patterns 2D
 */
export class ProjectiveBrain {
    constructor(numPrimitives = 10) {
        // Chaque primitive est "cherchée" par un Seeker (position/rotation)
        this.seekers = Array.from({ length: numPrimitives }, () => ({
            pose: new SeekerNeuron(),
            scale: new AdaptiveMajorityNeuron(8) // Apprend la taille probable
        }));
    }

    /**
     * Tente de reconstruire une scène 3D à partir de points d'intérêt 2D
     * @param {Array} points2D Points extraits de l'image [[x,y], ...]
     * @param {number} focal Focale caméra
     */
    reconstruct(points2D, focal, width, height) {
        return points2D.map((p, i) => {
            const seeker = this.seekers[i % this.seekers.length];

            // 1. On estime une profondeur de base via la logique bitwise
            // (Plus un objet est bas/petit dans l'image, plus il est loin)
            const depthGuess = 1.0 + (p[1] / height);

            // 2. Unproject pour obtenir la position 3D initiale
            const pos3D = ProjectiveGeometry.unproject(p[0], p[1], depthGuess, focal, width, height);

            // 3. Le neurone Seeker ajuste l'orientation locale
            const orientation = seeker.pose.orientation;

            return { position: pos3D, rotation: orientation };
        });
    }
}

/**
 * Parseur OBJ ultra-léger pour extraire les sommets
 */
export class OBJParser {
    static parse(text) {
        const vertices = [];
        const lines = text.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('v ')) {
                const parts = line.split(/\s+/);
                vertices.push(new Vector3(
                    parseFloat(parts[1]),
                    parseFloat(parts[2]),
                    parseFloat(parts[3])
                ));
            }
        }
        console.log(`[OBJParser] ${vertices.length} sommets extraits.`);
        return vertices;
    }
}

/**
 * Parseur FBX (ASCII) ultra-léger
 */
export class FBXParser {
    static parse(data, zlib = null) {
        // Détection du format (Binaire vs ASCII)
        const isBinary = (data instanceof Uint8Array || Buffer.isBuffer(data)) && 
                         String.fromCharCode(...data.slice(0, 18)).includes("Kaydara FBX");

        if (isBinary) {
            return this.parseBinary(data, zlib);
        } else {
            const text = (typeof data === 'string') ? data : new TextDecoder().decode(data);
            return this.parseASCII(text);
        }
    }

    static parseASCII(text) {
        const vertices = [];
        const vertexMatch = text.match(/Vertices:\s*(?:\*\d+\s*)?\{([\s\S]*?)\}/);
        if (vertexMatch && vertexMatch[1]) {
            const rawData = vertexMatch[1].replace(/[\r\n]+/g, ' ');
            const coords = rawData.split(',').map(v => parseFloat(v.trim()));
            for (let i = 0; i < coords.length; i += 3) {
                if (!isNaN(coords[i])) vertices.push(new Vector3(coords[i], coords[i+1], coords[i+2]));
            }
        }
        console.log(`[FBXParser] ${vertices.length} sommets extraits.`);
        return vertices;
    }

    /**
     * Parseur binaire minimaliste pour extraire les sommets (Vertices)
     * Supporte la compression Zlib (standard FBX)
     */
    static parseBinary(buffer, zlib) {
        const vertices = [];
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        // La version commence à l'offset 23
        const version = buffer.length > 27 ? view.getUint32(23, true) : 0;
        const is64Bit = version >= 7500;
        
        const headerSize = is64Bit ? 25 : 13;

        // Parcours récursif pour trouver le node 'Vertices' dans la hiérarchie binaire
        const findNodes = (startOffset) => {
            let pos = startOffset;
            while (pos < buffer.length - headerSize) {
                const endOffset = is64Bit ? Number(view.getBigUint64(pos, true)) : view.getUint32(pos, true);
                if (endOffset === 0) break; // Fin du bloc

                const propListLen = is64Bit ? Number(view.getBigUint64(pos + 16, true)) : view.getUint32(pos + 8, true);
                const nameLen = view.getUint8(pos + (is64Bit ? 24 : 12));
                const name = String.fromCharCode(...buffer.slice(pos + headerSize, pos + headerSize + nameLen));
                
                if (name === "Vertices") {
                    let propPos = pos + headerSize + nameLen;
                    // On lit la propriété (tableau de doubles 'd')
                    const type = String.fromCharCode(view.getUint8(propPos));
                    if (type === 'd') {
                        const encoding = view.getUint32(propPos + 5, true); // 0: raw, 1: zlib
                        const compressedLen = view.getUint32(propPos + 9, true);
                        
                        let data = buffer.slice(propPos + 13, propPos + 13 + compressedLen);
                        if (encoding === 1 && zlib && zlib.inflateSync) {
                            data = zlib.inflateSync(data);
                        }
                        
                        const floatView = new Float64Array(data.buffer, data.byteOffset, data.byteLength / 8);
                        for (let i = 0; i < floatView.length; i += 3) {
                            if (!isNaN(floatView[i])) vertices.push(new Vector3(floatView[i], floatView[i+1], floatView[i+2]));
                        }
                    }
                }

                // Exploration des enfants : ils commencent après le nom et toutes les propriétés
                const subNodesStart = pos + headerSize + nameLen + propListLen;
                if (endOffset > subNodesStart) {
                    findNodes(subNodesStart);
                }

                pos = endOffset;
            }
        };

        findNodes(27); // Offset standard après le header global Kaydara
        console.log(`[FBXParser] ${vertices.length} sommets extraits.`);
        return vertices;
    }
}

/**
 * Utilitaire de Benchmark pour la reconstruction
 */
export class VisionBenchmark {
    static async runTrainingSession(brain, vertices, iterations = 1000) {
        const start = Date.now();
        const focal = 500, w = 320, h = 240;

        for (let i = 0; i < iterations; i++) {
            // 1. Simuler une pose aléatoire
            const randomRot = Quaternion.random();
            const randomPos = new Vector3((Math.random()-0.5), (Math.random()-0.5), 1.0 + Math.random());

            // 2. Projeter quelques points clés en 2D
            const samplePoints = [vertices[0], vertices[Math.floor(vertices.length/2)]];
            const projected = samplePoints.map(v => {
                const worldV = randomRot.rotateVector(v).add(randomPos);
                return ProjectiveGeometry.project(worldV, focal, w, h);
            });

            // 3. Entraîner le cerveau (simplifié pour le bench)
            brain.reconstruct(projected, focal, w, h);
        }

        return Date.now() - start;
    }
}

export class BitwiseSequenceLearner {
    /**
     * Apprend des séquences de caractères en utilisant la logique majoritaire.
     * @param {number} contextSize Nombre de caractères précédents utilisés pour prédire le suivant.
     */
    constructor(contextSize = 4) {
        this.contextSize = contextSize;
        this.bitSize = 8; // On travaille sur 8 bits (ASCII/UTF-8 simple)
        this.inputSize = contextSize * this.bitSize;

        // Nous créons 8 neurones : un pour chaque bit du caractère à prédire
        this.neurons = Array.from({ length: this.bitSize }, () =>
            new AdaptiveMajorityNeuron(this.inputSize)
        );
    }

    /**
     * Entraîne le réseau sur un bloc de texte.
     */
    train(text, iterations = 30) {
        // On ajoute un padding pour que le réseau apprenne le début de la phrase
        const paddedText = " ".repeat(this.contextSize) + text;

        for (let iter = 0; iter < iterations; iter++) {
            for (let i = 0; i < paddedText.length - this.contextSize; i++) {
                const context = paddedText.slice(i, i + this.contextSize);
                const targetChar = paddedText[i + this.contextSize];

                const inputBits = this._textToBits(context);
                const targetBits = DataWrapper.intToBits(targetChar.charCodeAt(0) % 256, this.bitSize);

                // Chaque neurone apprend son bit spécifique du caractère cible
                for (let b = 0; b < this.bitSize; b++) {
                    this.neurons[b].train(inputBits, targetBits[b], 1);
                }
            }
        }
        // Stabilisation finale des poids
        this.neurons.forEach(n => n._stabilize());
    }

    /**
     * Prédit le caractère suivant à partir d'un groupe de lettres.
     */
    predictNext(context) {
        const rawContext = context.slice(-this.contextSize).padStart(this.contextSize, ' ');
        const inputBits = this._textToBits(rawContext);
        const outputBits = new Uint8Array(this.bitSize);
        let globalConfidence = 0;

        for (let b = 0; b < this.bitSize; b++) {
            const confidence = this.neurons[b].getConfidence(inputBits);
            globalConfidence += confidence.score;
            
            // Décision Analogique-Digital :
            // Un bit est à 1 si le consensus (thresholdRatio) est solide.
            if (confidence.thresholdRatio > 0.9) {
                outputBits[b] = 1;
            } else if (confidence.thresholdRatio < 0.4) {
                outputBits[b] = 0;
            } else {
                // En zone d'incertitude (bruit), on utilise le score pur
                outputBits[b] = (confidence.score > 0.5) ? 1 : 0;
            }
        }

        // Moyenne de confiance sur les 8 neurones
        const averageConf = globalConfidence / this.bitSize;

        // Si le réseau est totalement perdu (n'a jamais vu ce contexte), 
        // on renvoie une lettre de secours ou l'espace pour éviter les symboles bizarres.
        if (averageConf < 0.1) return " ";

        const charCode = DataWrapper.bitsToInt(outputBits);
        // On s'assure de rester dans l'ASCII imprimable (32-126) ou les retours ligne
        const cleanCode = (charCode < 32 && charCode !== 10 && charCode !== 13) ? 32 : charCode;
        return String.fromCharCode(cleanCode % 256);
    }

    /**
     * Génère du texte à partir d'une amorce (seed).
     */
    generate(seed, length = 50) {
        let result = seed;
        for (let i = 0; i < length; i++) {
            const next = this.predictNext(result);
            result += next;
        }
        return result;
    }

    _textToBits(text) {
        const bits = new Uint8Array(text.length * this.bitSize);
        for (let i = 0; i < text.length; i++) {
            const charBits = DataWrapper.intToBits(text.charCodeAt(i) % 256, this.bitSize);
            bits.set(charBits, i * this.bitSize);
        }
        return bits;
    }
}

/**
 * Optimisé pour le langage naturel au niveau des mots.
 */
export class BitwiseWordLearner {
    constructor(contextSize = 3) {
        this.contextSize = contextSize;
        this.vocab = ["<PAD>", "<UNK>"];
        this.wordToId = new Map();
        this.bitSize = 12; // Supporte jusqu'à 4096 mots uniques
        this.inputSize = contextSize * this.bitSize;
        this.neurons = Array.from({ length: this.bitSize }, () => new AdaptiveMajorityNeuron(this.inputSize));
    }

    _tokenize(text) {
        // Regex robuste : capture les mots accentués et l'élision (l'unité, d'accord) en un seul bloc
        return text.toLowerCase().match(/[a-z0-9àâäéèêëïîôöùûüç]+(?:['][a-z0-9àâäéèêëïîôöùûüç]*)?|[^\w\s]/g) || [];
    }

    _getWordId(word) {
        if (!this.wordToId.has(word)) {
            if (this.vocab.length < Math.pow(2, this.bitSize)) {
                this.wordToId.set(word, this.vocab.length);
                this.vocab.push(word);
            } else return 1; // <UNK>
        }
        return this.wordToId.get(word);
    }

    _wordsToBits(words) {
        const bits = new Uint8Array(this.inputSize);
        words.forEach((word, i) => {
            const id = this.wordToId.get(word) || 1;
            const wordBits = DataWrapper.intToBits(id, this.bitSize);
            bits.set(wordBits, i * this.bitSize);
        });
        return bits;
    }

    /**
     * Entraînement intensif pour la restitution exacte (Verbatim)
     */
    trainVerbatim(text, iterations = 50) {
        const words = this._tokenize(text);
        const tokens = [...Array(this.contextSize).fill("<PAD>"), ...words];

        // 1. Construction du vocabulaire
        words.forEach(w => this._getWordId(w));

        // 2. Entraînement à haute pression
        for (let iter = 0; iter < iterations; iter++) {
            for (let i = 0; i < tokens.length - this.contextSize; i++) {
                const context = tokens.slice(i, i + this.contextSize);
                const targetWord = tokens[i + this.contextSize];
                
                const inputBits = this._wordsToBits(context);
                const targetId = this._getWordId(targetWord);
                const targetBits = DataWrapper.intToBits(targetId, this.bitSize);

                for (let b = 0; b < this.bitSize; b++) {
                    this.neurons[b].train(inputBits, targetBits[b], 10);
                }
            }
        }

        // 3. Stabilisation en "Mémoire Associative Pure"
        const MAX_STRENGTH = 63;
        this.neurons.forEach(n => {
            for (let i = 0; i < n.inputSize; i++) {
                const p = n.potentials[i];
                // Seuil de stabilité strict pour le mode verbatim
                const isStable = p > 15; 
                n.weights[i] = isStable ? MAX_STRENGTH : 0;
            }
            
            // CORRECTIF CRUCIAL : Le seuil de déclenchement (Threshold)
            // Dans un compresseur binaire, on veut que le neurone s'active si 
            // une "partie suffisante" de la signature d'UN mot est présente.
            // Comme chaque mot possède environ 1 à 4 bits à '1' dans son ID (sur 12 bits),
            // un seuil fixe bas (ex: 40-50) permet de détecter la transition 
            // sans être étouffé par le poids total du neurone.
            
            // On demande qu'au moins 1.5 "bits de signature" soient présents pour valider le bit suivant.
            n.threshold = Math.floor(1.5 * MAX_STRENGTH); 
        });
    }

    generate(seedText, length = 20) {
        let currentWords = this._tokenize(seedText);
        let result = [...currentWords];

        for (let i = 0; i < length; i++) {
            const context = result.slice(-this.contextSize);
            // Pad if context is too small
            while(context.length < this.contextSize) context.unshift("<PAD>");
            
            const inputBits = this._wordsToBits(context);
            const outputBits = new Uint8Array(this.bitSize);

            for (let b = 0; b < this.bitSize; b++) {
                outputBits[b] = this.neurons[b].predict(inputBits);
            }

            const nextId = DataWrapper.bitsToInt(outputBits);
            const nextWord = this.vocab[nextId] || ".";
            
            // Sécurité : Si le réseau prédit un ID inconnu ou <UNK>, on tente de prendre 
            // le mot le plus probable ou on arrête la phrase proprement.
            if (nextId <= 1 && i > 0) break; 

            if (nextWord === "<PAD>") break;
            result.push(nextWord);
        }

        // Nettoyage des espaces pour les apostrophes (l'unité au lieu de l ' unité)
        return result.join(' ')
            .replace(/\s([,.;!])/g, '$1');
    }
}


// --- Simulation Pilotée par le Fichier Unique ---
// // --- Simulation Pilotée par le Fichier Unique ---
// // Note: En production, on ferait require('./robot_config.json')
// const { hub, actuators, varMap: robotVarMap, safetyNet: actualSafetyNet, behaviorNet, kinematicChain, sensorMapper } = RobotFactory.build(robotConfiguration);

// // Initialisation de la hauteur du robot (Base à 0.6m pour que les jambes touchent le sol à Z=0)
// kinematicChain.baseOffset.z = 0.6;

// // Utilisation d'un set de données sécurisé pour le test de mouvement
// const dynamicSensorData = { temp: 0.1, contact: 0 }; // Simulation : Contact détecté
// const trainingExamples = robotConfiguration.training.examples;
// const meshSensors = trainingExamples[0].input; // On garde le premier pour la simu

// const sampler = new TemporalSampler();
// const controller = new MeshController(meshSensors.length, actuators.length);

// console.log("\n--- Phase 1: Apprentissage du Maillage (Adaptation au terrain) ---");
// trainingExamples.forEach(ex => {
//     // Reformage des données d'entraînement pour correspondre à la config matérielle
//     const cleanEx = sensorMapper.reshapeTrainingExample(ex);

//     for (let i = 0; i < 50; i++) {
//         controller.learnBehavior(cleanEx.input, cleanEx.output, 1);
//     }
// });
// controller.addAnchorsFromExamples(trainingExamples, actuators.length);
// console.log("Apprentissage terminé. Le robot a 'intégré' la souplesse du maillage.");

// console.log("\n--- PHASE 2 : TEST DE MANIPULATION & RÉSILIENCE (Épaule) ---");
// for (let i = 0; i < 15; i++) {
//     runStep(i, new Vector3(0.25, 0.05, 0.45), (a) => (a.name === "Servo_Epaule" && i >= 5 && i <= 10) ? 25 : 2);
// }

// console.log("\n--- PHASE 3 : TEST DE LOCOMOTION (Marche vers Cible 2m) ---");
// for (let i = 15; i < 40; i++) {
//     runStep(i, new Vector3(2.0, 0, 0), () => 2); // Pas de blocage anormal pendant la marche
// }

// /**
//  * Exécute un pas de simulation complet
//  */
// function runStep(i, targetXYZ, loadSimFn) {
//     const decisionInputs = new Uint8Array(Object.keys(robotVarMap).length);
//     if (robotVarMap.temp_high !== undefined) decisionInputs[robotVarMap.temp_high] = dynamicSensorData.temp > 0.8 ? 1 : 0;
//     if (robotVarMap.contact !== undefined) decisionInputs[robotVarMap.contact] = dynamicSensorData.contact;
//     if (robotVarMap.fire_detected !== undefined) decisionInputs[robotVarMap.fire_detected] = i > 38 ? 1 : 0;
//     if (robotVarMap.step_phase !== undefined) decisionInputs[robotVarMap.step_phase] = i % 10 < 5 ? 1 : 0;

//     // 1. Simulation d'un cycle de marche sur les capteurs de pression (Gauche/Droite)
//     const gaitSync = Math.sin(i * 0.6);
//     const rawHardwareReadings = {
//         "p_top_l": 0.5 + gaitSync * 0.45,
//         "p_top_r": 0.5 - gaitSync * 0.45,
//         "p_bot_l": 0.5 + gaitSync * 0.45,
//         "p_bot_r": 0.5 - gaitSync * 0.45
//     };
//     const liveSensors = sensorMapper.format(rawHardwareReadings);

//     // 2. Calculs du Cerveau (MeshController pour les jambes + Behavior)
//     const meshCommands = controller.compute(liveSensors);
//     const behaviorBits = behaviorNet.predict(decisionInputs);
//     const learnedInfluence = DataWrapper.bitsToAnalog(behaviorBits, 0, 1);

//     // 3. Logique de Locomotion (Translation de la base)
//     const distBaseToTarget = kinematicChain.baseOffset.distanceTo(targetXYZ);

//     // On ne marche que si on n'est pas en train d'éteindre un feu (Behavior bit 1)
//     const isExtinguishing = behaviorBits[1] === 1;

//     if (distBaseToTarget > 0.1 && !isExtinguishing) {
//         // Locomotion planaire : on ignore la composante Z pour la direction de marche
//         const basePos = kinematicChain.baseOffset;
//         const moveDir = new Vector3(targetXYZ.x - basePos.x, targetXYZ.y - basePos.y, 0).normalize();
//         kinematicChain.moveBase(moveDir.scale(0.7), 0.02); // Vitesse augmentée à 0.7m/s
//     }

//     // 4. Application des États du Hub (IK & Valeurs en dur)
//     const actuatorMap = new Map(actuators.map(a => [a.name, a]));

//     // On parcourt les groupes pour appliquer les positions de translation ou valeurs forcées
//     for (const [groupName, state] of hub.activeStates) {
//         // Si l'état définit une position cible (pos), on écrase le targetXYZ pour ce groupe
//         const effectiveTarget = state.position || targetXYZ;

//         // Gestion des valeurs en dur (values: { "Recul_Canon": 0.08 })
//         if (state.values) {
//             for (const [actName, val] of Object.entries(state.values)) {
//                 if (actuatorMap.has(actName)) actuatorMap.get(actName).ikTarget = val;
//             }
//         }

//         kinematicChain.solveIK(effectiveTarget, actuatorMap, [groupName], 5, 0.5);
//     }

//     // 5. Mise à jour physique des actuateurs
//     const currentJointValues = new Map();
//     actuators.forEach((a, idx) => {
//         const load = loadSimFn(a);

//         // Apprentissage spécifique : on injecte la commande du Mesh pour les jambes
//         let learnedTarget = learnedInfluence * a.max;
//         if (a.group === "jambes") {
//             learnedTarget = meshCommands[idx]; // Commande réflexe apprise
//         }

//         // On vérifie la sécurité globale
//         const safetyResult = actualSafetyNet.predict(decisionInputs);
//         const canMove = safetyResult.length === 0 || safetyResult[0] === 1;

//         // Extraction de la pression tactile spécifique à cet actuateur
//         let pressure = 0;
//         if (a.sensorId && sensorMapper.registry.has(a.sensorId)) {
//             pressure = liveSensors[sensorMapper.registry.get(a.sensorId).globalIndex];
//         }

//         // On récupère l'orientation cible depuis le hub pour ce groupe
//         const targetOrientation = hub.getTarget(a.group).orientation || new Quaternion();

//         a.update(decisionInputs, targetOrientation, load, canMove, learnedTarget, 0.02, pressure);

//         const link = kinematicChain.links.get(a.name);
//         if (link) link.currentJointValue = a.currentValue;
//         currentJointValues.set(a.name, a.currentValue);
//     });

//     sampler.record(liveSensors, actuators);

//     // 6. Kinématique Directe (FK) pour le log
//     const { position: eePos } = kinematicChain.calculateFK(currentJointValues);
//     const distEE = eePos.distanceTo(targetXYZ);

//     let log = `[${i.toString().padStart(2, '0')}] Base: [${kinematicChain.baseOffset.x.toFixed(2)},${kinematicChain.baseOffset.y.toFixed(2)}] `;
//     log += `| Jambes: ${actuators.filter(a=>a.group==='jambes').map(a=>a.currentValue.toFixed(0)).join('/')} `;
//     log += `| Bras: ${actuators.filter(a=>a.group==='bras').map(a=>a.currentValue.toFixed(0)).join('/')} `;
//     log += `| Err EE: ${(distEE*100).toFixed(1)}cm`;
//     if (actuators[4].isCompliant) log += " | ! STALL !"; // Servo_Epaule index 4
//     console.log(log);
// }

// // --- Phase 2: Génération du Dataset Relatif ---
// const relativeData = sampler.generateRelativeDataset();
// console.log("\n--- Phase 2: Dataset Relatif Généré ---");
// console.log(`Nombre d'échantillons temporels : ${relativeData.length}`);
// if (relativeData.length > 0) {
//     console.log("Exemple de Delta (Étape 0 -> 1) pour le premier actuateur :");
//     console.log(`  Input Sensors: [${relativeData[0].input.map(s => s.toFixed(2))}]`);
//     console.log(`  Delta Actuators: ${relativeData[0].deltaOutput[0].toFixed(4)}`);
// }
