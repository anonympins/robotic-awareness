import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

// Importation des outils G-NEURO pour le traitement neuronal
import { RuleInterpreter, DataWrapper, CNNBrain } from './neuro-lib.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;
const server = app.listen(port, () => console.log(`Serveur G-NEURO 3D actif sur http://localhost:${port}`));

// Sert les fichiers statiques depuis le bon dossier (app/public)
app.use(express.static(path.join(__dirname, 'app', 'public')));

// Sert la bibliothèque G-NEURO (test.js) située à la racine
app.get('/neuro-lib.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'neuro-lib.js'));
});

// Route pour récupérer la config du robot
app.get('/config', (req, res) => {
    const configPath = path.join(__dirname, 'robot_config-imported.json');
    if (fs.existsSync(configPath)) {
        res.sendFile(configPath);
    } else {
        console.error(`[Erreur] Fichier de configuration introuvable : ${configPath}`);
        res.status(404).json({ error: "Fichier de configuration manquant" });
    }
});

// --- CONFIGURATION DU RÉSEAU DE NEURONES D'ACTION ---
let ACTIONS = ["IMMOBILE", "MOUVEMENT_H", "MOUVEMENT_V", "PRESENCE_CENTRALE"];

const WINDOW_SIZE = 50; 
const CONFIRMATION_THRESHOLD = 1; 
const PERSISTENCE_FRAMES = 10;    

// Stockage des signatures brutes (listes d'indices de bits)
let gestureSamples = {}; 

// Initialisation du cerveau CNN
let motionBrain = new CNNBrain({
    inputShape: [WINDOW_SIZE, 10, 10],
    numActions: ACTIONS.length,
    lr: 0.02
});

/**
 * Recompile le cerveau quand une nouvelle action est ajoutée
 * ou quand les échantillons changent.
 * Utilise une approche de "Warm Start" pour la rapidité.
 */
function updateMotionBrain(previousActions = null) {
    const oldBrain = motionBrain;
    const newNumActions = ACTIONS.length;
    
    // On considère qu'il y a changement si le nombre d'actions change 
    // ou si on a explicitement passé les anciennes actions pour vérification
    const isNewAction = !oldBrain || oldBrain.numActions !== newNumActions;

    console.log(isNewAction ? `📈 Expansion du cerveau (${newNumActions} actions)...` : `⚡ Affinement rapide du cerveau...`);

    if (isNewAction || !motionBrain) {
        const oldActions = previousActions || [];
        // 1. Création du nouveau cerveau
        const newBrain = new CNNBrain({
            inputShape: [WINDOW_SIZE, 10, 10],
            numActions: newNumActions,
            lr: isNewAction ? 0.01 : 0.005, // LR réduit pour l'affinement afin d'éviter d'écraser les acquis
            wd: 0.0001
        });

        // 2. Migration des filtres (la partie lourde en calcul)
        if (oldBrain) {
            for (let f = 0; f < newBrain.filters.length; f++) {
                newBrain.filters[f].weights.set(oldBrain.filters[f].weights);
                newBrain.filters[f].bias = oldBrain.filters[f].bias;
            }
            
            // 3. Migration intelligente des poids (par nom d'action et non par index)
            ACTIONS.forEach((actionName, newIdx) => {
                const oldIdx = oldActions.indexOf(actionName);
                if (oldIdx !== -1 && oldIdx < oldBrain.numActions) {
                    const oldOffset = oldIdx * oldBrain.filters.length;
                    const newOffset = newIdx * newBrain.filters.length;
                    newBrain.denseWeights.set(
                        oldBrain.denseWeights.subarray(oldOffset, oldOffset + oldBrain.filters.length),
                        newOffset
                    );
                    newBrain.denseBiases[newIdx] = oldBrain.denseBiases[oldIdx];
                }
            });
        }
        motionBrain = newBrain;
    }

    // Préparation des groupes d'entraînement
    const actionGroups = {};

    // --- AJOUT AUTOMATIQUE D'EXEMPLES IMMOBILE ---
    // On crée 5 exemples de "silence" (zéro mouvement) pour que le cerveau
    // apprenne à ne pas confondre le bruit de fond avec un geste.
    const immobileIdx = ACTIONS.indexOf("IMMOBILE");
    actionGroups[immobileIdx] = [];
    for(let i=0; i<10; i++) {
        // On crée un silence "bruité" (léger grain aléatoire entre 0 et 0.02)
        const noise = new Float32Array(WINDOW_SIZE * 100).map(() => Math.random() * 0.02);
        actionGroups[immobileIdx].push({ input: noise, label: immobileIdx });
    }

    for (const [actionName, samples] of Object.entries(gestureSamples)) {
        const actionIdx = ACTIONS.indexOf(actionName);
        if (actionIdx === -1) continue;

        actionGroups[actionIdx] = [];

        samples.forEach(sequence => {
            // Conversion de la séquence en Float32Array plat [5000]
            const flattened = new Float32Array(WINDOW_SIZE * 100);
            sequence.forEach((frameData, t) => {
                // frameData est maintenant un Float32Array de 100 valeurs d'intensité
                flattened.set(frameData, t * 100);
            });

            // --- AUGMENTATION DE DONNÉES TEMPORELLES ---
            // On entraîne sur le motif original ET sur des versions légèrement décalées
            // pour apprendre au CNN que le geste peut arriver un peu plus tôt ou plus tard.
            const variants = [flattened]; // L'original
            
            // Créer une variante décalée de 2 frames vers le futur (on pousse vers la droite)
            const shiftForward = new Float32Array(WINDOW_SIZE * 100).fill(0);
            shiftForward.set(flattened.slice(0, (WINDOW_SIZE - 2) * 100), 2 * 100);
            variants.push(shiftForward);

            // Créer une variante décalée de 2 frames vers le passé (on tire vers la gauche)
            const shiftBackward = new Float32Array(WINDOW_SIZE * 100).fill(0);
            shiftBackward.set(flattened.slice(2 * 100));
            variants.push(shiftBackward);

            // --- AUGMENTATION D'INTENSITÉ ---
            // Créer une variante "plus faible" (80% d'intensité)
            const dimVariant = flattened.map(v => v * 0.8);
            variants.push(dimVariant);

            // --- AUGMENTATION TEMPORELLE (Vitesse) ---
            // Simuler un geste 20% plus rapide (on compresse)
            const fastVariant = new Float32Array(WINDOW_SIZE * 100);
            for(let i=0; i<WINDOW_SIZE; i++) {
                const sourceIdx = Math.floor(i * 1.2) % WINDOW_SIZE;
                fastVariant.set(flattened.subarray(sourceIdx * 100, (sourceIdx + 1) * 100), i * 100);
            }
            variants.push(fastVariant);

            // Créer une variante "plus forte" (120% d'intensité)
            const brightVariant = flattened.map(v => Math.min(1.0, v * 1.2));
            variants.push(brightVariant);

            // Ajout au set global d'entraînement
            variants.forEach(v => {
                // --- INJECTION DE BRUIT ALÉATOIRE (JITTERING) ---
                // On ajoute 5% de variation aléatoire à chaque frame pour éviter la saturation
                const jittered = new Float32Array(v).map(val => val + (Math.random() - 0.5) * 0.05);
                actionGroups[actionIdx].push({ input: jittered, label: actionIdx });
            });
        });
    }

    // --- ÉQUILIBRAGE (BALANCING) ---
    // On trouve le groupe le plus fourni pour s'aligner dessus
    const counts = Object.values(actionGroups).map(g => g.length);
    if (counts.length === 0) return;
    const maxCount = Math.max(...counts);

    const trainingSet = [];
    Object.values(actionGroups).forEach(group => {
        if (group.length === 0) return;
        // On duplique les éléments des petits groupes pour égaliser les chances
        for (let i = 0; i < maxCount; i++) {
            const item = group[i % group.length];
            trainingSet.push(item);
        }
    });

    // --- MÉLANGE (SHUFFLING) ---
    // On mélange le dataset pour que le cerveau voie les gestes de manière entremêlée
    for (let i = trainingSet.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [trainingSet[i], trainingSet[j]] = [trainingSet[j], trainingSet[i]];
    }

    // --- ENTRAÎNEMENT GLOBAL (EPOCHS) ---
    const maxEpochs = isNewAction ? 100 : 40; // Réduction du nombre d'époques
    let currentLR = motionBrain.lr;
    let prevLoss = Infinity;
    let bestLoss = Infinity;
    let plateauPatience = 10; // Plus de temps pour digérer les variantes augmentées
    let noImprovementCount = 0;
    // Seuil d'amélioration dynamique (commence à 1%)
    let dynamicThreshold = 0.01; 

    for (let e = 0; e < maxEpochs; e++) {
        // --- WARM-UP & SCHEDULING ---
        // On commence doucement les 3 premières époques (warm-up) si c'est un nouveau cerveau
        if (isNewAction && e < 5) {
            motionBrain.lr = currentLR * (0.2 + (e / 5) * 0.8);
        } else {
            motionBrain.lr = currentLR;
        }

        let epochLoss = 0;

        for (let i = 0; i < trainingSet.length; i++) {
            const item = trainingSet[i];
            const loss = motionBrain.train(item.input, item.label);
            epochLoss += loss;
        }

        const meanLoss = epochLoss / trainingSet.length;
        
        // --- LOGIQUE DE PILOTAGE PAR RATIO D'ERREUR ---
        // On calcule la "dérivée" de l'amélioration
        const improvement = (prevLoss - meanLoss) / prevLoss;
        
        // Gestion du plateau avec seuil adaptatif
        if (meanLoss < bestLoss * (1 - dynamicThreshold)) { 
            bestLoss = meanLoss;
            noImprovementCount = 0;
            // Si on progresse bien, on redevient exigeant (jusqu'à 1%)
            dynamicThreshold = Math.min(0.01, dynamicThreshold * 1.1);
        } else {
            noImprovementCount++;
            // Si on galère, on "apprend" à accepter des gains plus petits (min 0.05%)
            dynamicThreshold = Math.max(0.0005, dynamicThreshold * 0.8);
        }

        // Si on stagne, on réduit le LR pour essayer d'entrer dans les détails
        if (noImprovementCount >= plateauPatience) {
            currentLR *= 0.7; // Réduction plus progressive (30% au lieu de 50%)
            noImprovementCount = 0;
            console.log(`📉 Stagnation : LR réduit à ${currentLR.toFixed(5)} | Seuil adapté à ${(dynamicThreshold*100).toFixed(3)}%`);
            
            // Si le LR devient trop faible, on arrête l'entraînement
            if (currentLR < 0.0001) {
                console.log(`🛑 LR trop faible, fin de l'apprentissage.`);
                break;
            }
        }

        // Arrêt si on stagne ou si le score est parfait
        if (meanLoss < 0.0005) {
            console.log(`🎯 Convergence à l'époque ${e} | Erreur finale: ${meanLoss.toFixed(6)}`);
            break;
        }

        prevLoss = meanLoss;
    }
}

function broadcastState() {
    const payload = JSON.stringify({ type: 'STATE_UPDATE', actions: ACTIONS, samples: gestureSamples });
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(payload);
        }
    });
}

// --- FIN CONFIGURATION NEURONALE ---

// Configuration du serveur WebSocket
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('Client connecté au flux vidéo');
    ws.send(JSON.stringify({ type: 'STATE_UPDATE', actions: ACTIONS, samples: gestureSamples }));

    // Stockage de la frame précédente pour la détection de mouvement
    ws.lastGrayscale = null;
    ws.pendingGestureName = null; // Nom du geste à enregistrer
    ws.recordingBuffer = [];      // Accumulateur de frames pour le record
    ws.windowHistory = [];        // Historique glissant pour la prédiction
    ws.actionCounters = {};       // Pour le lissage (hystérésis)
    ws.persistenceCounters = {};   // Pour la persistance visuelle

    ws.on('message', (data) => {
        // Gestion des commandes JSON (Enregistrement de geste)
        try {
            const textData = data.toString();
            if (textData.startsWith('{')) {
                const cmd = JSON.parse(textData);
                if (cmd.type === 'START_RECORDING') {
                    ws.pendingGestureName = cmd.name.toUpperCase().replace(/\s/g, '_');
                    ws.recordingBuffer = []; // Reset du buffer
                    ws.isRecording = true;
                    console.log(`📡 Début capture: ${ws.pendingGestureName}`);
                }
                if (cmd.type === 'STOP_RECORDING') {
                    finalizeRecording(ws);
                }
                if (cmd.type === 'DELETE_SAMPLE') {
                    const { gesture, index } = cmd;
                    if (gestureSamples[gesture]) {
                        const previousActions = [...ACTIONS];
                        gestureSamples[gesture].splice(index, 1);
                        console.log(`🗑️ Échantillon supprimé pour ${gesture}`);
                        
                        if (gestureSamples[gesture].length === 0) {
                            delete gestureSamples[gesture];
                            ACTIONS = ACTIONS.filter(a => a !== gesture);
                            console.log(`❌ Action ${gesture} retirée du lexique.`);
                        }
                        
                        updateMotionBrain(previousActions);
                        broadcastState();
                    }
                }
                return;
            }
        } catch (e) {}

        if (data.length < 5) return;

        // Lecture de l'entête
        const width = data.readUint16BE(0);
        const height = data.readUint16BE(2);
        const pixels = data.slice(4); // Buffer RGBA

        // 1. Passage en niveaux de gris
        const grayscale = new Uint8Array(width * height);
        for (let i = 0; i < pixels.length; i += 4) {
            // Utilisation de coefficients standards pour une meilleure perception du gris
            grayscale[i / 4] = Math.floor((pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114));
        }

        // 2. Calcul du différentiel spatio-temporel (Intensité du mouvement)
        const motionDiff = new Uint8Array(width * height);
        if (ws.lastGrayscale) {
            for (let i = 0; i < grayscale.length; i++) {
                motionDiff[i] = Math.abs(grayscale[i] - ws.lastGrayscale[i]);
            }
        }

        const processed = applyAdaptiveThreshold(grayscale, width, height);
        let actionResult = new Uint8Array(ACTIONS.length).fill(0);

        if (ws.lastGrayscale) {
            const boxes = detectMotionBoxes(grayscale, ws.lastGrayscale, width, height);
            
            // 4. Analyse Neuronale de la Box la plus importante
            if (boxes.length > 0) {
                const mainBox = boxes[0]; // On prend la zone de mouvement principale
                // On utilise l'intensité réelle du mouvement
                const signature = getMotionSignature(motionDiff, mainBox, width, height, 10);
                
                // --- LOGIQUE D'APPRENTISSAGE ---
                if (ws.pendingGestureName) {
                    ws.recordingBuffer.push(new Float32Array(signature));
                    
                    // On informe le client du nombre de frames capturées
                    ws.send(JSON.stringify({ type: 'RECORD_PROGRESS', count: ws.recordingBuffer.length }));
                }

                // --- GESTION DE LA FENÊTRE GLISSANTE (PREDICTION) ---
                ws.windowHistory.push(signature);
                if (ws.windowHistory.length > WINDOW_SIZE) ws.windowHistory.shift();

                // On aplatit l'histoire pour l'injecter dans le cerveau
                const temporalSignature = new Float32Array(WINDOW_SIZE * 100);
                ws.windowHistory.forEach((sig, t) => {
                    temporalSignature.set(sig, t * 100);
                });

                // 5. Inférence par le CNN
                const results = motionBrain.predict(temporalSignature);
                
                // 6. Mise à jour de l'état des actions avec Hystérésis
                ACTIONS.forEach((key, actionIdx) => {
                    // On ne traite ici que les actions dynamiques/gestuelles
                    if (results[actionIdx] === 1) {
                        ws.actionCounters[key] = (ws.actionCounters[key] || 0) + 1;
                        if (ws.actionCounters[key] >= CONFIRMATION_THRESHOLD) {
                            ws.persistenceCounters[key] = PERSISTENCE_FRAMES;
                        }
                    } else {
                        ws.actionCounters[key] = 0;
                    }

                    // L'action est active si elle est dans son temps de persistance
                    if (ws.persistenceCounters[key] > 0) {
                        actionResult[actionIdx] = 1;
                        ws.persistenceCounters[key]--;
                    }
                });

                // Détection simplifiée de la présence centrale (index fixe pour PRESENCE_CENTRALE)
                const presenceIdx = ACTIONS.indexOf("PRESENCE_CENTRALE");
                const midX = (mainBox.minX + mainBox.maxX) / 2;
                if (presenceIdx !== -1 && Math.abs(midX - width/2) < 30) actionResult[presenceIdx] = 1;
            }

            // Si aucune action de mouvement, on est IMMOBILE (index 0)
            const anyMovement = actionResult.slice(1).some(v => v === 1);
            if (!anyMovement) {
                actionResult[ACTIONS.indexOf("IMMOBILE")] = 1;
            }

            drawBoundingBoxes(processed, boxes, width, height);
        }
        
        ws.lastGrayscale = grayscale; // Sauvegarde pour la prochaine frame

        // Envoi combiné : Image + Octets d'actions
        const finalBuffer = Buffer.concat([processed, Buffer.from(actionResult.buffer)]);
        ws.send(finalBuffer);
    });
});

/**
 * Finalise l'enregistrement et tronque/valide la séquence
 */
function finalizeRecording(ws) {
    if (!ws.pendingGestureName || ws.recordingBuffer.length === 0) return;

    const originalLength = ws.recordingBuffer.length;
    
    // --- AUTO-CROPPING : On cherche le premier et le dernier signe de mouvement ---
    let firstActive = 0;
    let lastActive = originalLength - 1;

    // On trouve la première frame avec au moins un bit à 1
    for (let i = 0; i < originalLength; i++) {
        const intensity = ws.recordingBuffer[i].reduce((a, b) => a + b, 0);
        if (intensity > 0.1) { firstActive = i; break; }
    }
    // On trouve la dernière frame active
    for (let i = originalLength - 1; i >= 0; i--) {
        const intensity = ws.recordingBuffer[i].reduce((a, b) => a + b, 0);
        if (intensity > 0.1) { lastActive = i; break; }
    }

    const activeBuffer = ws.recordingBuffer.slice(firstActive, lastActive + 1);
    const croppedLength = activeBuffer.length;

    if (croppedLength < 5) {
        console.log(`⚠️ Geste vide ou trop court (${croppedLength} frames utiles).`);
    } else {
        const finalSequence = [];
        for (let i = 0; i < WINDOW_SIZE; i++) {
            const index = Math.floor((i / (WINDOW_SIZE - 1)) * (croppedLength - 1));
            finalSequence.push(activeBuffer[index]);
        }

        if (!gestureSamples[ws.pendingGestureName]) {
            gestureSamples[ws.pendingGestureName] = [];
            if (!ACTIONS.includes(ws.pendingGestureName)) ACTIONS.push(ws.pendingGestureName);
        }

        gestureSamples[ws.pendingGestureName].push(finalSequence);
        updateMotionBrain([...ACTIONS]);
        
        console.log(`🧠 GESTE RECADRÉ ET NORMALISÉ : ${ws.pendingGestureName} (${croppedLength} frames utiles -> ${WINDOW_SIZE})`);
        broadcastState();
        ws.send(JSON.stringify({ type: 'RECORD_DONE' }));
    }

    ws.pendingGestureName = null;
    ws.recordingBuffer = [];
}

/**
 * Algorithme de Bradley-Roth (Seuillage adaptatif par image intégrale)
 * Très performant pour détecter des formes dans des conditions d'éclairage variables.
 */
function applyAdaptiveThreshold(grayscale, width, height) {
    const S = Math.floor(width / 8); // Taille de la fenêtre (ajuster pour la taille des formes)
    const T = 0.15; // Sensibilité (0.15 = 15%). Plus c'est haut, plus c'est strict.
    const integral = new Uint32Array(width * height);
    const output = Buffer.alloc(width * height * 4);

    // 1. Construction de l'image intégrale (Somme cumulée)
    // Permet de calculer la moyenne d'une zone en O(1)
    for (let y = 0; y < height; y++) {
        let sum = 0;
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            sum += grayscale[idx];
            if (y === 0) integral[idx] = sum;
            else integral[idx] = integral[idx - width] + sum;
        }
    }

    // 2. Seuillage local
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const x1 = Math.max(0, x - S / 2);
            const x2 = Math.min(width - 1, x + S / 2);
            const y1 = Math.max(0, y - S / 2);
            const y2 = Math.min(height - 1, y + S / 2);
            
            const count = (x2 - x1) * (y2 - y1);
            
            // Calcul rapide de la somme de la zone via l'image intégrale
            const sum = integral[y2 * width + x2] 
                      - (y1 > 0 ? integral[(y1 - 1) * width + x2] : 0)
                      - (x1 > 0 ? integral[y2 * width + (x1 - 1)] : 0)
                      + (y1 > 0 && x1 > 0 ? integral[(y1 - 1) * width + (x1 - 1)] : 0);

            const idx = y * width + x;
            // Si le pixel actuel est T% plus sombre que la moyenne locale -> noir
            const val = (grayscale[idx] * count < sum * (1.0 - T)) ? 0 : 255;
            
            const outIdx = idx * 4;
            output[outIdx] = val;     // R
            output[outIdx + 1] = val; // G
            output[outIdx + 2] = val; // B
            output[outIdx + 3] = 255; // A
        }
    }
    return output;
}

/**
 * getMotionSignature : Calcule l'intensité moyenne par cellule (Pooling d'intensité).
 * On moyenne les valeurs de mouvement réelles pour chaque cellule de la grille,
 * pondérées par la dimension relative de la zone de mouvement pour préserver l'échelle.
 */
function getMotionSignature(motionBuffer, box, imgW, imgH, gridSize = 10) {
    const signature = new Float32Array(gridSize * gridSize);
    const boxW = box.maxX - box.minX;
    const boxH = box.maxY - box.minY;
    
    // Facteur d'échelle : permet de distinguer un petit mouvement d'un grand.
    // On utilise la racine carrée de la surface relative pour une influence proportionnelle à la dimension.
    const scaleFactor = Math.sqrt((boxW * boxH) / (imgW * imgH));

    // Taille d'une cellule de pooling
    const cellW = boxW / gridSize;
    const cellH = boxH / gridSize;

    for (let gy = 0; gy < gridSize; gy++) {
        for (let gx = 0; gx < gridSize; gx++) {
            // Zone de scan pour cette cellule (Convolution/Pooling)
            const startX = Math.floor(box.minX + gx * cellW);
            const startY = Math.floor(box.minY + gy * cellH);
            
            let sum = 0;
            let count = 0;
            for (let py = startY; py < Math.min(imgH, startY + cellH); py++) {
                for (let px = startX; px < Math.min(imgW, startX + cellW); px++) {
                    const idx = (py * imgW + px);
                    sum += motionBuffer[idx];
                    count++;
                }
            }
            // Normalisation : On ramène la moyenne entre 0 et 1
            // Multiplié par scaleFactor pour que la dimension réelle soit encodée dans l'intensité.
            signature[gy * gridSize + gx] = count > 0 ? ((sum / count) / 255) * scaleFactor : 0;
        }
    }
    return signature;
}

/**
 * Détecte les zones de mouvement et retourne des bounding boxes
 */
function detectMotionBoxes(current, last, width, height) {
    const boxes = [];
    const threshold = 30; // Sensibilité du mouvement
    const step = 8;      // On scanne par blocs pour la performance

    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const idx = y * width + x;
            
            // Si la différence entre les deux frames est notable
            if (Math.abs(current[idx] - last[idx]) > threshold) {
                let added = false;
                
                // On essaie d'étendre une box existante (fusion de proximité)
                for (let b = 0; b < boxes.length; b++) {
                    const box = boxes[b];
                    const margin = 20;
                    if (x > box.minX - margin && x < box.maxX + margin &&
                        y > box.minY - margin && y < box.maxY + margin) {
                        box.minX = Math.min(box.minX, x);
                        box.maxX = Math.max(box.maxX, x + step);
                        box.minY = Math.min(box.minY, y);
                        box.maxY = Math.max(box.maxY, y + step);
                        added = true;
                        break;
                    }
                }
                
                if (!added) {
                    boxes.push({ minX: x, maxX: x + step, minY: y, maxY: y + step });
                }
            }
        }
    }

    // Filtrage et tri par importance (surface)
    const filtered = boxes.filter(box => {
        const w = box.maxX - box.minX;
        const h = box.maxY - box.minY;
        return (w * h) > 400; // Garde uniquement les zones > 20x20 pixels
    });

    // On trie pour que la boîte la plus grande soit toujours à l'index 0 (la plus significative)
    return filtered.sort((a, b) => {
        const areaA = (a.maxX - a.minX) * (a.maxY - a.minY);
        const areaB = (b.maxX - b.minX) * (b.maxY - b.minY);
        return areaB - areaA;
    });
}

/**
 * Dessine les bordures rouges directement dans le buffer RGBA
 */
function drawBoundingBoxes(buffer, boxes, width, height) {
    boxes.forEach(box => {
        const color = { r: 255, g: 0, b: 0 }; // Rouge
        
        // Lignes horizontales (haut et bas)
        for (let x = box.minX; x < box.maxX; x++) {
            drawPixel(buffer, x, box.minY, width, color);
            drawPixel(buffer, x, box.maxY - 1, width, color);
        }
        // Lignes verticales (gauche et droite)
        for (let y = box.minY; y < box.maxY; y++) {
            drawPixel(buffer, box.minX, y, width, color);
            drawPixel(buffer, box.maxX - 1, y, width, color);
        }
    });
}

function drawPixel(buffer, x, y, width, color) {
    const idx = (y * width + x) * 4;
    buffer[idx] = color.r;
    buffer[idx + 1] = color.g;
    buffer[idx + 2] = color.b;
    buffer[idx + 3] = 255;
}