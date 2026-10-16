/**
 * @file test-formalism-scraper.js
 * @description Test d'extraction de formalisme latent et structures invisibles
 * sur de véritables blocs de textes Wikipédia scrapés en direct.
 * Anticipe le cas d'usage génératif (parler humain guidé par invariants polynomiaux).
 */

import { scrapeRandomWikipediaContent } from './wikipedia-scraper.js';
import * as neuro from './neuro-lib.js';
import { Optimization } from './problemSolver/library.js';
import readline from 'node:readline';

/**
 * Nettoie et découpe les blocs HTML/texte Wikipédia en phrases grammaticalement exploitables.
 */
function extractCleanSentences(blocks, minWords = 5) {
    const tokenizer = /[a-z0-9àâäéèêëïîôöùûüç]+|[^\w\s]/gi;
    const sentences = [];

    for (const block of blocks) {
        // Découpage par ponctuation finale
        const rawSentences = block.split(/(?<=[.!?])\s+/);
        for (const raw of rawSentences) {
            const cleaned = raw
                .replace(/\[\d+\]/g, '') // Supprime les renvois de notes [1], [2]...
                .replace(/\(.*?\)/g, '') // Supprime le contenu entre parenthèses
                .replace(/["«»]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const words = cleaned.match(tokenizer) || [];
            // On conserve les phrases ayant une structure minimale
            if (words.length >= minWords && words.length <= 30 && /[a-zàâäéèêëïîôöùûüç]/i.test(cleaned)) {
                sentences.push(cleaned.toLowerCase());
            }
        }
    }

    return sentences;
}

const OFFLINE_FALLBACK_CORPUS = [
    "les astronomes observent les galaxies lointaines avec des télescopes géants.",
    "la théorie scientifique explique les phénomènes physiques de manière rationnelle.",
    "ces animaux sauvages traversent les forêts denses pendant la nuit.",
    "les chercheurs découvrent de nouvelles lois mathématiques fondamentales.",
    "un grand nombre de citoyens participent activement aux débats démocratiques.",
    "les étoiles brillantes illuminent le ciel nocturne au-dessus des montagnes.",
    "cette nouvelle technologie transforme profondément les communications modernes.",
    "les ingénieurs développent des systèmes autonomes pour explorer les planètes voisines.",
    "les musiciens talentueux composent des symphonies harmonieuses pour le public.",
    "la structure moléculaire détermine les propriétés chimiques de chaque élément.",
    "les oiseaux migrateurs parcourent des milliers de kilomètres chaque automne.",
    "les arbres anciens protègent les sols fragiles contre une érosion sévère."
];

async function fetchCorpusWithFallback(targetSentenceCount = 25) {
    let accumulatedSentences = [];
    let attempts = 0;

    while (accumulatedSentences.length < targetSentenceCount && attempts < 3) {
        attempts++;
        try {
            console.log(`\n📡 [Scraper] Récupération de l'article Wikipédia aléatoire (Tentative ${attempts})...`);
            const page = await scrapeRandomWikipediaContent();
            console.log(`   📄 Titre : "${page.title}" (${page.blocks.length} blocs bruts)`);
            
            const clean = extractCleanSentences(page.blocks);
            accumulatedSentences.push(...clean);
            console.log(`   ✨ Phrases exploitables extraites : ${clean.length} (Total cumulé : ${accumulatedSentences.length})`);
        } catch (err) {
            console.warn(`   ⚠️ Erreur temporaire scraper : ${err.message}`);
        }
    }

    if (accumulatedSentences.length < 8) {
        console.log(`\n🔄 [Corpus Secours] Bascule sur corpus linguistique de repli (${OFFLINE_FALLBACK_CORPUS.length} phrases).`);
        accumulatedSentences = [...accumulatedSentences, ...OFFLINE_FALLBACK_CORPUS];
    }

    return accumulatedSentences;
}

(async () => {
    console.log("================================================================================");
    console.log(" 🧠 MINAGE DE FORMALISME AU NIVEAU DES BITS & OPTIMISATION PAR DICHOTOMIE");
    console.log("================================================================================");

    // 1. Récupération de vrai texte via Wikipédia
    const allSentences = await fetchCorpusWithFallback(20);

    if (allSentences.length < 8) {
        console.error("❌ Pas assez de données textuelles récupérées pour une analyse formelle.");
        return;
    }

    // Séparation Train / Test (Holdout) pour valider la généralisation
    const splitIndex = Math.floor(allSentences.length * 0.75);
    const trainSentences = allSentences.slice(0, splitIndex);
    const testSentences = allSentences.slice(splitIndex);

    console.log(`\n📊 Répartition : ${trainSentences.length} phrases d'apprentissage / ${testSentences.length} phrases de test holdout.`);

    // 2. Initialisation du cerveau relationnel et apprentissage de l'espace lexical binaire
    const brain = new neuro.SemanticRelationalMemory(8);

    console.log("\n📥 Ingestion sémantique et apprentissage des dépendances...");
    trainSentences.forEach(s => brain.learnSense(s, true, 2));

    // 3. Configuration de l'extracteur polynomial au niveau des BITS (12 bits par token)
    const WINDOW_SIZE = 4; // Quadruplet de tokens
    const TOKEN_BITS = 12; // 12 bits par token
    const miner = new neuro.PolynomialFormalismMiner(brain, WINDOW_SIZE, TOKEN_BITS);

    console.log(`\n⚙️ Espace géométrique formel :`);
    console.log(`   - Taille de la fenêtre : ${WINDOW_SIZE} tokens`);
    console.log(`   - Signature binaire par token : ${TOKEN_BITS} bits`);
    console.log(`   - Dimension du vecteur d'entrée : ${miner.inputSize} bits`);

    // 4. Extraction du formalisme polynomial et calibrage par dichotomie
    console.log("\n🧬 Lancement de la neuroévolution & calibrage dichotomique...");
    const startTime = Date.now();

    const formalDiscovery = miner.discoverFormalGrammar(trainSentences, Optimization, {
        generations: 60,
        populationSize: 50,
        maxTerms: 8
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⚡ Neuroévolution terminée en ${elapsed}s`);
    console.log(`🎯 Fidélité discriminante sur dataset d'entraînement : ${(formalDiscovery.accuracy * 100).toFixed(1)}%`);
    console.log(`⚖️ Seuil d'admissibilité formelle (Dichotomy Threshold) : ${formalDiscovery.threshold}`);

    // 5. Explicitation des invariants découverts
    console.log("\n📜 Invariants algébriques découverts (Lois syntaxiques latentes) :");
    if (formalDiscovery.decodedRules.rules.length === 0) {
        console.log("   (Aucune règle prédominante n'a dépassé le seuil de multiplicateur)");
    } else {
        const topRules = formalDiscovery.decodedRules.rules
            .filter(r => r.multiplier !== 0)
            .sort((a, b) => Math.abs(b.multiplier) - Math.abs(a.multiplier))
            .slice(0, 8);

        topRules.forEach((rule, idx) => {
            const icon = rule.multiplier > 0 ? "🟢" : "🔴";
            console.log(`   ${icon} [Terme ${idx + 1}] ${rule.description}`);
        });
    }

    // 6. Test de généralisation sur des phrases réelles NON VUES (Holdout Test)
    console.log("\n🧪 Évaluation sur phrases réelles de test non vues (Validation Croisée) :");

    let testWindowsCount = 0;
    let validCorrect = 0;
    let corruptedRejected = 0;
    const tokenizer = /[a-z0-9àâäéèêëïîôöùûüç]+|[^\w\s]/gi;

    for (const testSentence of testSentences) {
        const tokens = testSentence.match(tokenizer) || [];
        if (tokens.length < WINDOW_SIZE) continue;

        for (let i = 0; i <= tokens.length - WINDOW_SIZE; i += 2) {
            testWindowsCount++;
            const validWindow = tokens.slice(i, i + WINDOW_SIZE);
            const validVec = miner.encodeSequence(validWindow);
            const validPred = formalDiscovery.neuron.predict(validVec);
            if (validPred === 1) validCorrect++;

            // Phrase corrompue (inversion de deux positions adjacentes)
            const corrupted = [...validWindow];
            const idxA = Math.floor(Math.random() * (WINDOW_SIZE - 1));
            [corrupted[idxA], corrupted[idxA + 1]] = [corrupted[idxA + 1], corrupted[idxA]];

            const corruptedVec = miner.encodeSequence(corrupted);
            const corruptedPred = formalDiscovery.neuron.predict(corruptedVec);
            if (corruptedPred === 0) corruptedRejected++;
        }
    }

    if (testWindowsCount > 0) {
        const tpr = (validCorrect / testWindowsCount) * 100;
        const tnr = (corruptedRejected / testWindowsCount) * 100;
        const globalHoldoutAcc = ((validCorrect + corruptedRejected) / (testWindowsCount * 2)) * 100;

        console.log(`   - Échantillons évalués : ${testWindowsCount} paires (valide / corrompu)`);
        console.log(`   - Sensibilité (Phrases valides acceptées) : ${tpr.toFixed(1)}% (${validCorrect}/${testWindowsCount})`);
        console.log(`   - Spécificité (Phrases corrompues rejetées) : ${tnr.toFixed(1)}% (${corruptedRejected}/${testWindowsCount})`);
        console.log(`   - Précision globale Holdout : ${globalHoldoutAcc.toFixed(1)}%`);
    }

    // 7. Démonstration qualitative interactive
    console.log("\n🔍 Démonstration qualitative directe :");
    const sampleReal = (testSentences[0] || trainSentences[0]).match(tokenizer).slice(0, WINDOW_SIZE);
    const sampleInverted = [...sampleReal].reverse();

    const scoreReal = formalDiscovery.neuron.evaluateScore(miner.encodeSequence(sampleReal));
    const scoreInv = formalDiscovery.neuron.evaluateScore(miner.encodeSequence(sampleInverted));

    console.log(`   Texte réel     : "${sampleReal.join(' ')}" -> Score: ${scoreReal} (Seuil: ${formalDiscovery.threshold}) => ${scoreReal >= formalDiscovery.threshold ? "VALIDE ✅" : "REJETÉ ❌"}`);
    console.log(`   Texte inversé  : "${sampleInverted.join(' ')}" -> Score: ${scoreInv} (Seuil: ${formalDiscovery.threshold}) => ${scoreInv >= formalDiscovery.threshold ? "VALIDE ✅" : "REJETÉ ❌"}`);

    // 8. PROMPT SYSTEM & GÉNÉRATION INTERACTIVE GUIDÉE PAR POLYNÔMES
    console.log("\n================================================================================");
    console.log(" 🗣️ PROMPT SYSTEM : GÉNÉRATEUR GUIDÉ PAR LES INVARIANTS POLYNOMIAUX");
    console.log("================================================================================");

    // Moteur génératif sous contrainte polynomiale
    function generateHumanLikeSentence(startWords, targetLength = 8) {
        const generated = [...startWords];
        const threshold = formalDiscovery.threshold;
        const neuron = formalDiscovery.neuron;

        for (let step = 0; step < targetLength; step++) {
            const currentContext = generated.join(' ');
            const candidates = brain.predictNextCandidates(currentContext, { topK: 12, creativity: 0.15 });

            if (!candidates || candidates.length === 0) break;

            // Notation de chaque candidat par combinaison probabilité + harmonie polynomiale
            let bestCandidate = null;
            let bestCompositeScore = -Infinity;

            for (const cand of candidates) {
                if (cand.token === '<eos>' && generated.length < startWords.length + 2) continue;

                // Évaluation de la fenêtre glissante résultante si on ajoute ce mot
                const testWindow = [...generated.slice(-(WINDOW_SIZE - 1)), cand.token];
                while (testWindow.length < WINDOW_SIZE) testWindow.unshift(testWindow[0] || 'les');

                const testVec = miner.encodeSequence(testWindow);
                const polyScore = neuron.evaluateScore(testVec);
                const isHarmonic = polyScore >= threshold;

                // Pénalité/Bonus polynomial : les lois grammaticales agissent comme un régulateur
                const harmonicBonus = isHarmonic ? (polyScore - threshold + 1) * 3.0 : -10.0;
                const compositeScore = cand.score + harmonicBonus;

                if (compositeScore > bestCompositeScore) {
                    bestCompositeScore = compositeScore;
                    bestCandidate = cand.token;
                }
            }

            if (!bestCandidate || bestCandidate === '<eos>') break;
            generated.push(bestCandidate);

            if (['.', '!', '?'].includes(bestCandidate) && generated.length >= startWords.length + 3) {
                break;
            }
        }

        return brain._intelligentlyJoinTokens(generated);
    }

    // Amorce de test initiale
    const cliArgs = process.argv.slice(2).join(' ').trim();
    const initialPrompt = cliArgs || (trainSentences[0] || OFFLINE_FALLBACK_CORPUS[0]).match(tokenizer).slice(0, 2).join(' ');
    
    console.log(`🌱 Amorce initiale : "${initialPrompt}"`);
    const firstTokens = initialPrompt.match(tokenizer) || ['les'];
    const firstSpeech = generateHumanLikeSentence(firstTokens, 10);
    console.log(`🤖 Sortie modèle   : 👉 "${firstSpeech}."\n`);

    // Boucle interactive
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

    console.log("💬 Mode interactif activé. Entrez vos amorces (ou 'exit' pour quitter) :");
    while (true) {
        const input = (await ask("\n📝 Votre amorce > ")).trim();
        if (!input || input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
            console.log("👋 Fermeture de la session.");
            break;
        }

        const tokens = input.match(tokenizer) || [];
        if (tokens.length === 0) continue;

        // Ingestion du nouveau contexte pour intégrer les nouveaux mots
        brain.learnSense(input, false, 1);

        const output = generateHumanLikeSentence(tokens, 12);
        console.log(`🤖 Modèle : 👉 "${output}."`);
    }

    rl.close();
})();