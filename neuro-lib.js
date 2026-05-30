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
    }

    predict(currentInputs) {
        // Création d'un vecteur d'entrée global aligné sur le varMap
        const globalInputs = new Uint8Array(this.maxIndex + 1);

        // On mappe les entrées actuelles en premier (pour garder l'ordre du varMap)
        const names = Object.keys(this.varMap);
        let inputIdx = 0;

        names.forEach((name) => {
            const targetIdx = this.varMap[name];
            if (name.startsWith('prev_')) {
                // On cherche l'index de l'état (ex: prev_state_1 -> index 0 de l'état)
                const stateIdx = parseInt(name.split('_').pop()) - 1 || 0;
                globalInputs[targetIdx] = this.state[stateIdx] || 0;
            } else if (!name.startsWith('prev_') && inputIdx < currentInputs.length) {
                globalInputs[targetIdx] = currentInputs[inputIdx++];
            }
        });

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
