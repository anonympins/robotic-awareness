import { SemanticRelationalMemory, SemanticAttentionLayer } from "./neuro-lib.js";

console.log("=== LABORATOIRE D'ÉMERGENCE GRAMMATICALE ===");

const semanticBrain = new SemanticRelationalMemory(8);
const attention = new SemanticAttentionLayer();
semanticBrain.attachAttention(attention);

// On aide l'émergence en créant une résonance entre les sujets
// Cela permet au système de savoir que ce qui est vrai pour l'un 
// peut être "tenté" pour l'autre à haute créativité.
attention.correlate([semanticBrain.vocabulary.get("robot"), semanticBrain.vocabulary.get("humain")]);

// Corpus structuré pour l'émergence
// Les sujets (Robot/Humain) partagent la même structure SVC (Sujet Verbe Complément)
const lecon = [
    "Le robot analyse le secteur .",
    "Le robot protège le maillage .",
    "Le robot observe l' horizon .",
    "L' humain surveille le secteur .",
    "L' humain répare le maillage .",
    "L' humain explore l' horizon ."
];

console.log("--- Ingestion de la grammaire (Atomique) ---");
lecon.forEach(p => semanticBrain.learnSense(p));

console.log("--- Ingestion d'un récit (Continu) ---");
const recit = "Le robot détecte une anomalie . L' humain répare le circuit . Le système est stable .";
// Ici, on apprend que "Anomalie" -> "Répare" -> "Stable"
semanticBrain.learnText(recit, true);

const testRaisonnement = semanticBrain.predictSense("Le robot détecte", 6, { creativity: 0.1, topK: 2 });
console.log(`\nTest de flux : "Le robot détecte" -> "${testRaisonnement}"`);

const simulerEmergence = (amorce, iterations = 3) => {
    console.log(`\nTests pour l'amorce : "${amorce}"`);
    
    [0.1, 0.5, 0.8].forEach(crea => {
        console.log(`--- Niveau Créativité : ${crea} ---`);
        for(let i = 0; i < iterations; i++) {
            const res = semanticBrain.predictSense(amorce, 6, { 
                creativity: crea,
                topK: 3, // Plus restrictif pour garder la cohérence
                attention: attention 
            });
            
            // Détection d'émergence (si le robot utilise un verbe d'humain ou vice-versa)
            const estEmergent = (amorce.includes("robot") && (res.includes("répare") || res.includes("surveille") || res.includes("explore"))) ||
                                (amorce.includes("humain") && (res.includes("analyse") || res.includes("protège") || res.includes("observe")));
            
            const prefix = estEmergent ? "✨ [ÉMERGENCE]" : "📜 [FIDÈLE]";
            console.log(`${prefix} "${amorce} ${res}"`);
        }
    });
};

// Lancement des tests
simulerEmergence("Le robot");
simulerEmergence("L' humain");

console.log(`\nVocabulaire maîtrisé : ${semanticBrain.vocabulary.size} concepts.`);
console.log("Note : L'émergence se produit quand la probabilité du contexte binaire (Sujet + ?) ");
console.log("est assez proche entre deux entités pour que la température permette le saut.");