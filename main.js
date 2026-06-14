
// ============================================================
// EXEMPLE D'UTILISATION : CHIFFREMENT NEURONAL AUTHENTIFIÉ
// ============================================================
import {BitwiseNeuralCipher, BitwiseWordLearner, BitwiseLosslessCompressor, BitwiseRelationalMemory} from "./neuro-lib.js";

function _runCipherBenchmark() {
    console.log("\n=== BENCHMARK: BitwiseNeuralCipher Performance ===");

    const passphrase = "benchmark-key-123-for-speed-test";
    const complexity = 128;
    const cipher = new BitwiseNeuralCipher(passphrase, { complexity });

    const dataSizeKB = 1; // 100 KB
    const dataSize = dataSizeKB * 1024; // in bytes
    const iterations = 100; // Number of times to encrypt/decrypt the data

    // Generate random data
    const plaintext = new Uint8Array(dataSize);
    if (typeof crypto !== 'undefined' && (crypto.getRandomValues || crypto.webcrypto?.getRandomValues)) {
        for (let i = 0; i < plaintext.length; i += 65536) {
            (crypto.getRandomValues ? crypto : crypto.webcrypto).getRandomValues(plaintext.subarray(i, Math.min(i + 65536, plaintext.length)));
        }
    } else {
        // Fallback for Node.js if crypto is not available (though it usually is)
        for (let i = 0; i < dataSize; i++) plaintext[i] = Math.floor(Math.random() * 256);
    }

    console.log(`Benchmarking with ${dataSizeKB} KB of random data, ${iterations} iterations.`);

    // --- Encryption Benchmark ---
    let totalEncryptTime = 0;
    let encryptedData = null; // Store the last encrypted data for decryption

    const encryptStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        encryptedData = cipher.encrypt(plaintext);
        console.log('encrypt');
    }
    const encryptEnd = process.hrtime.bigint();
    totalEncryptTime = Number(encryptEnd - encryptStart) / 1_000_000; // ms

    const encryptThroughput = (dataSizeKB * iterations) / (totalEncryptTime / 1000); // KB/s
    console.log(`Encryption: ${totalEncryptTime.toFixed(2)} ms total for ${iterations} iterations.`);
    console.log(`Encryption Throughput: ${encryptThroughput.toFixed(2)} KB/s (${(encryptThroughput / 1024).toFixed(2)} MB/s)`);

    // --- Decryption Benchmark ---
    let totalDecryptTime = 0;
    let decryptedData = null;

    const decryptStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        // Use the last encryptedData from the encryption loop
        decryptedData = cipher.decrypt(encryptedData);
    }
    const decryptEnd = process.hrtime.bigint();
    totalDecryptTime = Number(decryptEnd - decryptStart) / 1_000_000; // ms

    const decryptThroughput = (dataSizeKB * iterations) / (totalDecryptTime / 1000); // KB/s
    console.log(`Decryption: ${totalDecryptTime.toFixed(2)} ms total for ${iterations} iterations.`);
    console.log(`Decryption Throughput: ${decryptThroughput.toFixed(2)} KB/s (${(decryptThroughput / 1024).toFixed(2)} MB/s)`);

    // --- Verification ---
    const originalString = new TextDecoder().decode(plaintext);
    const decryptedString = decryptedData.toString();
    console.log(`Verification: ${originalString === decryptedString ? '✅ Success' : '❌ Failure'}`);
}

// Run the benchmark
//_runCipherBenchmark();
const cipher = new BitwiseNeuralCipher("secret-robot-key-2024", { complexity: 128 });
const originalMessage = "Directive 42: Protéger l'intégrité du maillage neuronal.";

console.log("\n=== Test BitwiseNeuralCipher (Authenticated Stream Cipher) ===");
console.log("Message Original :", originalMessage);

// 1. Chiffrement (Génère IV + Ciphertext + Tag GHASH)
const encrypted = cipher.encrypt(originalMessage);
console.log("Chiffré (Hex)    :", encrypted.toHex());
console.log("Format           : [IV (16 bytes)] + [Data] + [Tag (16 bytes)]");

// 2. Déchiffrement et Validation
try {
    const decrypted = cipher.decrypt(encrypted);
    console.log("Déchiffré        :", decrypted.toString());
    console.log("Statut           : ✅ Intégrité vérifiée, clé valide.");
} catch (e) {
    console.error("❌ Erreur :", e.message);
}

// 3. Test de Résilience (Simulation d'une attaque bit-flipping)
console.log("\n--- Simulation d'une altération de données ---");
const tamperedData = new Uint8Array(encrypted.buffer);
tamperedData[20] ^= 0x01; // On altère un seul bit du message chiffré

try {
    cipher.decrypt(tamperedData);
} catch (e) {
    console.log("Résultat attendu : 🛡️ Blocage de sécurité réussi !");
    console.log("Détail           :", e.message);
}


// ============================================================
// TEST DE MÉMORISATION MULTI-TEXTES (VERBATIM)
// ============================================================

const multiCorpus = [
    "Le protocole de sécurité doit être respecté en toute circonstance.",
    "L'unité centrale analyse les données du capteur thermique.",
    "La navigation autonome nécessite une cartographie précise de l'environnement.",
    "Les actionneurs réagissent aux commandes du réseau neuronal."
].join(" ");

// On utilise un contexte de 4 mots pour bien différencier les structures de phrases
const brain = new BitwiseWordLearner(4);

console.log("=== Entraînement sur Corpus Diversifié ===");
brain.trainVerbatim(multiCorpus, 500); // 300 itérations pour graver les transitions

const tests = [
    { amorce: "Le protocole de", attendu: "sécurité doit être respecté" },
    { amorce: "L'unité centrale", attendu: "analyse les données du" },
    { amorce: "La navigation autonome", attendu: "nécessite une cartographie" }
];

console.log("\n--- Résultats de la Restitution ---");

tests.forEach(({amorce, attendu}) => {
    const generation = brain.generate(amorce, 50);
    console.log(`\nAmorce    : "${amorce}"`);
    console.log(`Génération : "${generation}"`);
    console.log(`Attendu : "${attendu}"`);

    const success = generation.toLowerCase().includes(attendu.toLowerCase());
    if (success) {
        console.log("Statut     : ✅ Restitution parfaite.");
    } else {
        console.log("Statut     : ⚠️ Altération ou fin de séquence prématurée.");
    }
});

// ============================================================
// TEST COMPRESSEUR SANS PERTE (BIT A BIT)
// ============================================================

console.log("\n=== Multi-Corpus Test: BitwiseLosslessCompressor ===");
const compressor = new BitwiseLosslessCompressor(12);
const corpora = [
    { name: "Message Court", data: "Directive 42: Restitution mot pour mot." },
    { name: "Séquence Répétitive", data: "ABCABCABCABCABCABCABCABCABCABCABCABCABCABCABCABC" },
    { name: "Code Source (JS)", data: "function compress(d) { return this.predictor.update(d); }" },
    { name: "Texte Technique", data: "Le maillage neuronal utilise des quaternions pour l'orientation spatiale et le codage arithmétique pour la compression sans perte." },
    { name: "Data Aléatoire (Hard)", data: "x8s!P9$qL2#zR5*nB1@vM4&jK7" }
];

let totalOriginal = 0;
let totalCompressed = 0;

corpora.forEach(corpus => {
    const rawInput = new TextEncoder().encode(corpus.data);
    totalOriginal += rawInput.length;

    console.log(`\n--- Test: ${corpus.name} ---`);
    console.log(`Original    : ${rawInput.length} octets`);

    // 1. On sauvegarde l'état du cerveau AVANT compression
    const brainSnapshot = compressor.getState();

    // Compression
    const compressed = compressor.compress(rawInput);
    totalCompressed += compressed.length;
    
    const ratio = ((compressed.length / rawInput.length) * 100).toFixed(2);
    console.log(`Compressé   : ${compressed.length} octets (${ratio}%)`);

    // 2. On restaure l'état EXACT du cerveau tel qu'il était avant compression
    compressor.setState(brainSnapshot);
    const decompressed = compressor.decompress(compressed, rawInput.length);
    const resultString = new TextDecoder().decode(decompressed);

    // Validation
    const isPerfect = resultString === corpus.data;
    console.log(`Restitution : "${resultString}"`);
    console.log(`Validation  : ${isPerfect ? "✅ REPRODUCTION PARFAITE" : "❌ ERREUR DE DONNÉES"}`);
    
    if (!isPerfect) {
        console.log(`Détail      : Attendu[${corpus.data.length}] vs Reçu[${resultString.length}]`);
    }
});

console.log("\n=== Bilan Global ===");
console.log(`Efficacité moyenne : ${((totalCompressed / totalOriginal) * 100).toFixed(2)}%`);

// ============================================================
// TEST APPRENTISSAGE GLOBAL ET RESTITUTION (COMPLETION)
// ============================================================

console.log("\n=== Test de Restitution (Mémoire Bit à Bit) ===");

// Augmentation du contexte à 48 bits (6 octets) pour éviter les collisions entre phrases
const sharedCompressor = new BitwiseLosslessCompressor(48, true);

const baseTextes = [
    "Le robot analyse son environnement.",
    "La compression est optimale aujourd'hui.",
    "Alerte intrusion dans le secteur sept."
];

console.log("Entraînement du réseau sur le corpus...");
baseTextes.forEach(txt => {
    sharedCompressor.train(new TextEncoder().encode(txt));
});

const ammorce = "Le robot";
console.log(`Amorce : "${ammorce}"`);

// On augmente à 40 octets pour s'assurer de capturer la fin de la phrase et la ponctuation
const suite = sharedCompressor.complete(ammorce, 40, true); 
const texteComplet = ammorce + new TextDecoder().decode(suite);

console.log(`Restitution : "${texteComplet}"`);
const success = texteComplet.includes("analyse son environnement.");
console.log(`Validation de restitution : ${success ? "✅ RÉUSSIE" : "⚠️ INCERTAINE"}`);

// ============================================================
// BENCHMARK DE RESTITUTION MASSIVE
// ============================================================

/**
 * Teste la capacité du compresseur à mémoriser et restituer un grand nombre de phrases.
 * @param {number} iterations Nombre de phrases à générer et tester
 */
function runMassiveRestitutionBenchmark(iterations = 200) {
    console.log(`\n=== BENCHMARK: Restitution Massive (${iterations} occurrences) ===`);
    
    /**
     * On utilise BitwiseRelationalMemory (true) pour le benchmark massif.
     * On augmente le contexte à 256 bits (32 octets) pour que l'ID unique
     * reste dans la "mémoire de travail" pendant la génération du tail.
     */
    const benchmarkCompressor = new BitwiseLosslessCompressor(256, true); 
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    /**
     * Correction des Patterns pour le test Verbatim :
     * On place l'ID au début pour que le prédicteur "sache" quelle phrase 
     * il est en train de restituer dès les premiers bits.
     */
    const patterns = [
        "ID-[ID] > Robot status: CPU load is [VAL]%.",
        "ID-[ID] > Security: Sector [VAL] cleared.",
        "ID-[ID] > System: Sync finished in [VAL]ms."
    ];

    const testData = [];
    for(let i = 0; i < iterations; i++) {
        const pattern = patterns[i % patterns.length];
        const entry = pattern.replace("[ID]", i.toString().padStart(3, '0'))
                             .replace("[VAL]", (Math.floor(Math.random() * 90) + 10).toString());
        testData.push(entry);
    }

    // 1. Phase d'entraînement (Mémorisation)
    const startTrain = process.hrtime.bigint();
    testData.forEach(txt => benchmarkCompressor.train(encoder.encode(txt)));
    const endTrain = process.hrtime.bigint();

    // 2. Phase de restitution (Validation Verbatim)
    let successCount = 0;
    let failCount = 0;
    const startEval = process.hrtime.bigint();

    testData.forEach(original => {
        const seed = original.substring(0, 12); // On donne les 12 premiers caractères
        const expectedTail = original.substring(12);
        
        // Prédiction bit à bit basée sur la mémoire profonde
        // On désactive le mode verbose pour la performance
        const generatedRaw = benchmarkCompressor.complete(seed, expectedTail.length, false);
        const generatedTail = decoder.decode(generatedRaw);

        if (generatedTail === expectedTail) {
            successCount++;
        } else {
            if (failCount < 10) {
                console.log(`\n[ÉCHEC #${failCount + 1}]`);
                console.log(`  Original   : "${original}"`);
                console.log(`  Attendu    : "${expectedTail}"`);
                console.log(`  Obtenu     : "${generatedTail}"`);
                if (generatedTail.length < expectedTail.length) {
                    console.log(`  Diagnostic : Arrêt prématuré (${generatedTail.length}/${expectedTail.length} chars)`);
                }
            }
            failCount++;
        }
    });

    const endEval = process.hrtime.bigint();

    console.log(`Temps Entraînement : ${Number(endTrain - startTrain) / 1_000_000} ms`);
    console.log(`Temps Restitution   : ${Number(endEval - startEval) / 1_000_000} ms`);
    console.log(`Taux de Succès      : ${((successCount / iterations) * 100).toFixed(2)}% (${successCount}/${iterations})`);
    console.log(`Mémoire Utilisée    : ${benchmarkCompressor.predictor.memorySize} relations (Zéro Oubli)`);
}

// Exécution du benchmark avec 500 occurrences pour tester les limites
runMassiveRestitutionBenchmark(500);

// ============================================================
// TEST : MÉMOIRE RELATIONNELLE SANS OUBLI CATASTROPHIQUE
// ============================================================

console.log("\n=== Test BitwiseRelationalMemory (Zero Forgetting) ===");

const ltm = new BitwiseRelationalMemory(128); // Contexte de 24 bits
const encoder = new TextEncoder();

const complexPatterns = [
    "PATTERN-A: Le robot doit survivre.",
    "PATTERN-B: La loi zero est prioritaire.",
    "PATTERN-C: Analyse des flux binaires en cours."
];

// 1. Entraînement massif (plusieurs fois le même pafttern pour ancrer)
console.log("Mémorisation des relations...");
complexPatterns.forEach(p => ltm.train(encoder.encode(p)));

// 2. Vérification de la non-volatilité
console.log(`Taille de la mémoire : ${ltm.memorySize} relations uniques.`);

const testRestitution = (seed) => {
    ltm.resetContext();
    // On injecte le seed
    const seedBytes = encoder.encode(seed);
    for (let byte of seedBytes) {
        for (let i = 7; i >= 0; i--) ltm.update((byte >> i) & 1);
    }

    // On génère la suite
    let output = "";
    for (let i = 0; i < 30; i++) {
        let charCode = 0;
        for (let b = 7; b >= 0; b--) {
            const bit = ltm.predictBit();
            charCode |= (bit << b);
            ltm.update(bit);
        }
        output += String.fromCharCode(charCode);
    }
    return output;
};

console.log(`Seed: "PATTERN-B" -> Suite: "${testRestitution("PATTERN-B")}"`);
console.log(`Seed: "PATTERN-A" -> Suite: "${testRestitution("PATTERN-A")}"`);