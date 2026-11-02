#!/usr/bin/env node

/**
 * Générateur de corpus via Ollama -> Ingestion continue dans api-server.js
 *
 * Usage:
 *   node ollama-to-ingest.js
 *   node ollama-to-ingest.js --model=qwen2.5:0.5b --iterations=10 --delay=2000
 *   node ollama-to-ingest.js --ollama-url=http://localhost:11434 --api-url=http://localhost:7701/ingest
 *   node ollama-to-ingest.js --num-predict=1000
 *   node ollama-to-ingest.js --epochs=4 --lr=0.05
 *   node ollama-to-ingest.js --theme-burst=3
 *   node ollama-to-ingest.js --auto-tune
 */

import { Optimization } from './problemSolver/library.js';

const THEMES = [
    // Sciences fondamentales et univers
    "l'astronomie et l'exploration des exoplanètes",
    "la théorie de la relativité et la physique quantique",
    "la thermodynamique et l'entropie de l'univers",
    "la géologie, la tectonique des plaques et le volcanisme",
    "les fondements mathématiques de la logique et du calcul",
    "l'algèbre abstraite et la topologie géométrique",
    
    // Chimie et matière
    "la chimie organique, les liaisons covalentes et la structure des molécules",
    "le tableau périodique des éléments et les propriétés atomiques",
    "la cinétique chimique, les catalyseurs et les réactions d'oxydoréduction",
    "la chimie des polymères et la synthèse des matériaux innovants",
    "la biochimie, les enzymes et les voies métaboliques cellulaires",

    // Sciences du vivant et environnement
    "les écosystèmes marins et la préservation de la biodiversité",
    "la biologie cellulaire et la structure de l'ADN",
    "la photosynthèse et la physiologie végétale",
    "les neurosciences et le fonctionnement de la mémoire humaine",
    "les mécanismes de l'évolution et la génétique des populations",
    "les énergies renouvelables et la transition écologique",
    "la climatologie et l'étude des courants océaniques",

    // Besoins humains, psychologie et bien-être
    "la hiérarchie des besoins humains, de la physiologie à l'accomplissement personnel",
    "l'alimentation, l'hydratation et les besoins nutritionnels du corps humain",
    "le besoin fondamental de sécurité, d'abri et de stabilité dans la vie quotidienne",
    "le besoin d'appartenance, les liens d'attachement et la coopération sociale",
    "l'estime de soi, le respect mutuel et la quête de sens chez l'être humain",
    "la santé mentale, la gestion du stress et l'importance du repos réparateur",

    // Technologies et informatique
    "la robotique autonome et l'exploration spatiale",
    "les architectures des microprocesseurs et l'informatique quantique",
    "la cryptographie moderne et la sécurité des données",
    "les réseaux de télécommunication et les fibres optiques",
    "l'aéronautique et les principes physiques du vol",

    // Histoire, civilisations et archéologie
    "l'histoire des civilisations antiques de la Méditerranée",
    "les grandes routes commerciales comme la route de la soie",
    "l'architecture gothique et les techniques de construction médiévales",
    "la révolution industrielle et les transformations urbaines du XIXe siècle",
    "l'archéologie préhistorique et les premières expressions artistiques",

    // Philosophie, société et pensée
    "la philosophie des lumières et les théories démocratiques",
    "l'éthique appliquée et la philosophie morale kantienne",
    "l'épistémologie et la méthode scientifique",
    "les structures socio-économiques et le droit comparé",

    // Arts, littérature et linguistique
    "l'évolution des langues et la linguistique comparée",
    "la théorie musicale, l'harmonie et l'acoustique",
    "l'art de la Renaissance italienne et la perspective géométrique",
    "la poésie classique et les règles de versification française",
    "la littérature narrative et l'analyse sémiotique des mythes",

    // Exemples de discussions et interactions dialoguées
    "une discussion constructive et collaborative entre deux collègues pour résoudre un problème technique",
    "un échange d'écoute active et de conseils bienveillants entre deux personnes proches",
    "un dialogue scientifique argumenté où deux chercheurs confrontent leurs hypothèses avec courtoisie",
    "une conversation courtoise entre un conseiller attentionné et une personne cherchant de l'aide",
    "un débat démocratique respectueux où chaque interlocuteur expose clairement ses arguments",
    "une discussion quotidienne d'entraide pratique et de partage d'expérience autour d'un projet"
];

function parseArgs() {
    const args = process.argv.slice(2);
    const getArg = (prefix, fallback) => {
        const found = args.find(a => a.startsWith(prefix));
        return found ? found.split('=')[1] : fallback;
    };

    return {
        ollamaUrl: getArg('--ollama-url=', process.env.OLLAMA_URL || 'http://localhost:11434'),
        apiUrl: getArg('--api-url=', process.env.API_URL || 'http://localhost:7701/ingest'),
        model: getArg('--model=', process.env.OLLAMA_MODEL || 'qwen2.5:0.5b'),
        iterations: parseInt(getArg('--iterations=', '0'), 10), // 0 = boucle infinie
        numPredict: parseInt(getArg('--num-predict=', '750'), 10),
        delayMs: parseInt(getArg('--delay=', '2500'), 10),
        lr: parseFloat(getArg('--lr=', '0.040')),
        weight: parseFloat(getArg('--weight=', '1.0')),
        epochs: parseInt(getArg('--epochs=', '5'), 10),
        themeBurst: parseInt(getArg('--theme-burst=', '4'), 10),
        retrainGrammar: args.includes('--retrain-grammar'),
        shuffle: !args.includes('--no-shuffle'),
        autoTune: args.includes('--auto-tune')
    };
}

function cleanText(rawText) {
    return rawText
        .replace(/```[\s\S]*?```/g, '') // supprime blocs de code éventuels
        .replace(/^[\s*-•\d.]+/gm, '')  // supprime puces et listes numérotées
        .replace(/^[\s'’"«»-]+/gm, '')   // supprime apostrophes/guillemets orphelins en début de ligne
        .replace(/["«»]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function generateFromOllama(ollamaUrl, model, theme, numPredict = 750) {
    const prompt = `Rédige un texte soutenu, fluide et très cohérent de 8 à 14 phrases en français sur le thème : "${theme}".
Chaque phrase doit découler logiquement de la précédente. Utilise des connecteurs logiques explicites (ainsi, par conséquent, en effet, car, de surcroît) et des reprises pronominales claires.
Consignes strictes :
- Uniquement du texte continu en prose ou sous forme d'échanges dialogués fluides.
- Pas d'introduction, pas de salutations, pas de conclusion métatextuelle.
- Pas de puces, pas de numérotation, pas de guillemets.`;

    const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            prompt,
            stream: false,
            options: {
                temperature: 0.7,
                top_p: 0.9,
                num_predict: numPredict
            }
        })
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Ollama HTTP ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    return cleanText(data.response || '');
}

async function ingestToApi(apiUrl, text, { weight, lr, epochs, retrainGrammar }) {
    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text,
            weight,
            epochs,
            lr,
            retrain_grammar: retrainGrammar
        })
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`API Ingest HTTP ${res.status}: ${errBody}`);
    }

    return await res.json();
}

/**
 * Recherche méta-heuristique des hyperparamètres optimaux via Recuit Simulé
 */
async function runHyperparameterAutoTune(config) {
    console.log("\n\x1b[33m⚡ [AUTO-TUNE] Démarrage de l'optimisation des hyperparamètres via library.js...\x1b[0m");

    const sampleTheme = THEMES[0];

    const initialSolution = {
        lr: config.lr,
        epochs: config.epochs,
        themeBurst: config.themeBurst,
        numPredict: config.numPredict,
        weight: config.weight
    };

    const neighbor = (sol) => {
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
        return {
            lr: clamp(parseFloat((sol.lr + (Math.random() - 0.5) * 0.02).toFixed(3)), 0.015, 0.10),
            epochs: clamp(Math.round(sol.epochs + (Math.random() > 0.5 ? 1 : -1)), 2, 8),
            themeBurst: clamp(Math.round(sol.themeBurst + (Math.random() > 0.5 ? 1 : -1)), 2, 6),
            numPredict: clamp(Math.round(sol.numPredict + (Math.random() - 0.5) * 200), 400, 950),
            weight: clamp(parseFloat((sol.weight + (Math.random() - 0.5) * 0.4).toFixed(2)), 0.5, 2.0)
        };
    };

    let evalCount = 0;
    const evaluatorAsync = async (sol) => {
        evalCount++;
        process.stdout.write(`  [Test #${evalCount}] lr=${sol.lr}, epochs=${sol.epochs}, burst=${sol.themeBurst}, weight=${sol.weight}... `);
        try {
            const text = await generateFromOllama(config.ollamaUrl, config.model, sampleTheme, sol.numPredict);
            if (!text || text.length < 30) return 999;

            const res = await ingestToApi(config.apiUrl, text, {
                weight: sol.weight,
                lr: sol.lr,
                epochs: sol.epochs,
                retrainGrammar: false
            });

            const loss = parseFloat(res.bitgemm?.avgLoss || '1.0');
            const acc = parseFloat((res.bitgemm?.top1Accuracy || '0%').replace('%', '')) / 100.0;
            // Énergie à minimiser : perte basse, haute précision
            const energy = loss - (acc * 2.2);
            console.log(`Loss: ${loss.toFixed(3)} | Acc: ${(acc * 100).toFixed(1)}% -> Score: ${energy.toFixed(3)}`);
            return energy;
        } catch (e) {
            console.log(`Échec: ${e.message}`);
            return 999;
        }
    };

    const result = await Optimization.simulatedAnnealingAsync(initialSolution, evaluatorAsync, neighbor, 100, 0.85, 8);
    console.log(`\x1b[32m✔ [AUTO-TUNE] Optimum trouvé : Score E = ${result.energy.toFixed(3)}\x1b[0m`);
    console.log(`  Paramètres retenus : lr=${result.solution.lr}, epochs=${result.solution.epochs}, themeBurst=${result.solution.themeBurst}, numPredict=${result.solution.numPredict}, weight=${result.solution.weight}\n`);

    return result.solution;
}

async function main() {
    const config = parseArgs();

    console.log("\x1b[35m=== OLLAMA TO /ingest FEEDER ===\x1b[0m");
    console.log(`📡 Ollama URL   : ${config.ollamaUrl} (Modèle: ${config.model})`);
    console.log(`🎯 API Ingest   : ${config.apiUrl}`);
    console.log(`⏱️  Délai        : ${config.delayMs} ms`);
    console.log(`📏 Tokens max   : ${config.numPredict} (num_predict)`);
    console.log(`🔁 Micro-epochs : ${config.epochs} passes par phrase`);
    console.log(`🎯 Theme burst  : ${config.themeBurst} cycles par thème`);
    console.log(`🧬 Auto-tuning  : ${config.autoTune ? 'Activé (Optimization)' : 'Désactivé'}`);

    if (config.autoTune) {
        const tuned = await runHyperparameterAutoTune(config);
        Object.assign(config, tuned);
    }
    console.log(`🔄 Itérations   : ${config.iterations > 0 ? config.iterations : 'Infinies (Ctrl+C pour arrêter)'}\n`);
    console.log(`📚 Thématiques  : ${THEMES.length} champs disponibles (Ordre: ${config.shuffle ? 'aléatoire' : 'séquentiel'})\n`);

    const themePool = [...THEMES];
    if (config.shuffle) {
        themePool.sort(() => Math.random() - 0.5);
    }

    let count = 0;
    let themeIndex = 0;

    while (true) {
        count++;
        const currentThemeIdx = Math.floor((count - 1) / config.themeBurst) % themePool.length;
        const theme = themePool[currentThemeIdx];
        if ((count - 1) % config.themeBurst === 0 && count > 1) {
            themeIndex++;
        }

        console.log(`\x1b[36m[Cycle #${count}]\x1b[0m Thème : \x1b[1m${theme}\x1b[0m`);

        try {
            // 1. Génération par Ollama
            process.stdout.write("  ⏳ Génération par Ollama... ");
            const startTime = Date.now();
            const generatedText = await generateFromOllama(config.ollamaUrl, config.model, theme, config.numPredict);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`Terminé en ${elapsed}s.`);

            if (!generatedText || generatedText.length < 20) {
                console.warn("  ⚠️ Texte généré trop court, passage au cycle suivant.");
                continue;
            }

            console.log(`  📝 Texte (${generatedText.length} car.) : "${generatedText.slice(0, 180)}..."`);

            // 2. Envoi vers /ingest
            process.stdout.write("  📥 Ingestion vers /ingest... ");
            const ingestResult = await ingestToApi(config.apiUrl, generatedText, {
                weight: config.weight,
                lr: config.lr,
                epochs: config.epochs,
                retrainGrammar: config.retrainGrammar && (count % 5 === 0)
            });

            console.log("Succès !");
            console.log(`  📊 Bilan : ${ingestResult.ingested_sentences} phrases ingérées | Vocabulaire BitGEMM: ${ingestResult.bitgemm?.vocabSize} | Loss: ${ingestResult.bitgemm?.avgLoss} | Précision: ${ingestResult.bitgemm?.top1Accuracy}`);

        } catch (err) {
            console.error(`  ❌ Erreur : ${err.message}`);
            if (err.cause?.code === 'ECONNREFUSED') {
                console.error("  💡 Vérifie que Ollama ou api-server.js est bien lancé.");
            }
        }

        if (config.iterations > 0 && count >= config.iterations) {
            console.log(`\n\x1b[32m✅ Terminé avec succès après ${count} cycles.\x1b[0m`);
            break;
        }

        await new Promise(r => setTimeout(r, config.delayMs));
    }
}

main().catch(err => {
    console.error("💥 Erreur fatale :", err);
    process.exit(1);
});