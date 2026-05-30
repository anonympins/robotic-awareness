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

const WINDOW_SIZE = 1; // Passage en mode "Empreinte" (Footprint unique par geste)
const SIGNATURE_SIZE = 28; // Résolution 28x28 (Standard Vision : Ratio Performance/Détail optimal)
const INPUT_FLAT_SIZE = SIGNATURE_SIZE * SIGNATURE_SIZE;
const CONFIRMATION_THRESHOLD = 3;
const PERSISTENCE_FRAMES = 8;

// Stockage des signatures brutes (listes d'indices de bits)
let gestureSamples = {}; 

// Initialisation du cerveau CNN
let motionBrain = new CNNBrain({
    inputShape: [WINDOW_SIZE, SIGNATURE_SIZE, SIGNATURE_SIZE],
    numActions: ACTIONS.length,
    lr: 0.02
});

/**
 * Recompile le cerveau quand une nouvelle action est ajoutée
 * ou quand les échantillons changent.
 * Effectue un réapprentissage complet à partir de zéro pour garantir la stabilité.
 */
function updateMotionBrain() {
    const newNumActions = ACTIONS.length; 
    console.log(`🧠 Recompilation totale du cerveau (${newNumActions} actions)...`);
    
    // 1. Initialisation d'un nouveau cerveau vierge (Poids aléatoires)
    const newBrain = new CNNBrain({
        inputShape: [WINDOW_SIZE, SIGNATURE_SIZE, SIGNATURE_SIZE],
        numActions: newNumActions,
        lr: 0.004, 
        wd: 0.0001
    });

    // 2. Préparation du dataset complet équilibré
    const actionGroups = {};
    ACTIONS.forEach((_, idx) => actionGroups[idx] = []);

    // Ajout automatique d'exemples "IMMOBILE" pour l'équilibre du silence
    const immobileIdx = ACTIONS.indexOf("IMMOBILE");
    for(let i = 0; i < 40; i++) {
        const noise = new Float32Array(INPUT_FLAT_SIZE).map(() => (Math.random() > 0.97 ? Math.random() * 0.1 : 0));
        actionGroups[immobileIdx].push({ input: noise, label: immobileIdx });
    }

    // Collecte de tous les échantillons enregistrés
    for (const [actionName, samples] of Object.entries(gestureSamples)) {
        const actionIdx = ACTIONS.indexOf(actionName);
        if (actionIdx === -1 || actionIdx === immobileIdx) continue;

        samples.forEach(footprint => {
            // Échantillon original
            actionGroups[actionIdx].push({ input: footprint, label: actionIdx });
            
            // AUGMENTATION 1 : Bruit aléatoire (Robustesse aux parasites)
            const noisy = footprint.map(v => v + (Math.random() - 0.5) * 0.06);
            actionGroups[actionIdx].push({ input: noisy, label: actionIdx });

            // AUGMENTATION 2 : Variation d'intensité (Robustesse à la vitesse/luminosité)
            const dimmed = footprint.map(v => v * 0.7);
            actionGroups[actionIdx].push({ input: dimmed, label: actionIdx });
        });
    }

    // Construction du dataset final avec équilibrage (Oversampling)
    const trainingSet = [];
    const counts = Object.values(actionGroups).map(g => g.length).filter(c => c > 0);
    const maxCount = Math.max(30, ...counts); 

    Object.keys(actionGroups).forEach(idx => {
        const group = actionGroups[idx];
        if (group.length === 0) return;
        for (let i = 0; i < maxCount; i++) {
            trainingSet.push(group[i % group.length]);
        }
    });

    // Mélange (Shuffling)
    for (let i = trainingSet.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [trainingSet[i], trainingSet[j]] = [trainingSet[j], trainingSet[i]];
    }

    // 3. Entraînement intensif (Re-learning)
    const maxEpochs = 150;
    for (let e = 0; e < maxEpochs; e++) {
        let epochLoss = 0;
        for (const item of trainingSet) {
            epochLoss += newBrain.train(item.input, item.label);
        }
        const meanLoss = epochLoss / trainingSet.length;
        if (meanLoss < 0.0005) {
            console.log(`  🎯 Convergence atteinte à l'époque ${e} (Loss: ${meanLoss.toFixed(6)})`);
            break;
        }
        if (e % 30 === 0) console.log(`  Époque ${e} | Perte: ${meanLoss.toFixed(6)}`);
    }

    motionBrain = newBrain;
    console.log("✅ Recompilation terminée. Tous les samples ont été réappris.");
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
    ws.motionAccumulator = null;   // Buffer pour la persistance du mouvement (MEI)
    ws.boxHistory = [];           // Mémoire temporelle des zones de mouvement

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
                        gestureSamples[gesture].splice(index, 1);
                        console.log(`🗑️ Échantillon supprimé pour ${gesture}`);
                        
                        if (gestureSamples[gesture].length === 0) {
                            delete gestureSamples[gesture];
                            ACTIONS = ACTIONS.filter(a => a !== gesture);
                            console.log(`❌ Action ${gesture} retirée du lexique.`);
                        }
                        
                        updateMotionBrain();
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

        // 2. Accumulation du mouvement (Motion Energy Image)
        if (!ws.motionAccumulator || ws.motionAccumulator.length !== grayscale.length) {
            ws.motionAccumulator = new Float32Array(grayscale.length);
        }

        if (ws.lastGrayscale) {
            for (let i = 0; i < grayscale.length; i++) {
                const diff = Math.abs(grayscale[i] - ws.lastGrayscale[i]);
                // On accumule le mouvement et on applique un decay (estompage)
                // Augmentation de la persistance à 0.8 pour un contour plus "gras"
                ws.motionAccumulator[i] = ws.motionAccumulator[i] * 0.8 + diff;
                // Cap à 255 pour rester dans l'échelle
                if (ws.motionAccumulator[i] > 255) ws.motionAccumulator[i] = 255;
            }
        }
        
        // On remplace le flux binaire (Otsu) par une représentation pure du signal neural
        const processed = Buffer.alloc(width * height * 4); 
        let actionResult = new Uint8Array(ACTIONS.length).fill(0);

        if (ws.lastGrayscale) {
            // On détecte maintenant sur l'accumulateur pour plus de stabilité
            let boxes = detectMotionBoxes(ws.motionAccumulator, width, height);
            
            if (boxes.length > 0) {
                // --- ALGO PRO : PERSISTANCE TEMPORELLE DES BOXES ---
                ws.boxHistory.push(boxes);
                if (ws.boxHistory.length > 5) ws.boxHistory.shift(); // Mémoire de 5 frames (approx 250ms)

                // On fusionne TOUTES les boxes de l'histoire pour créer la zone de capture
                const flattenedHistory = ws.boxHistory.flat();
                const globalBox = getGlobalMotionBox(flattenedHistory, width, height);
                const signature = getPatchSignature(ws.motionAccumulator, globalBox, width, height, SIGNATURE_SIZE);

                // Affiche uniquement la signature (le patch) envoyée au réseau de manière centrée
                drawLargeSignature(processed, signature, SIGNATURE_SIZE, width, height);

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
                const temporalSignature = new Float32Array(WINDOW_SIZE * INPUT_FLAT_SIZE);
                ws.windowHistory.forEach((sig, t) => {
                    temporalSignature.set(sig, t * INPUT_FLAT_SIZE);
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
                const midX = (globalBox.minX + globalBox.maxX) / 2;
                if (presenceIdx !== -1 && Math.abs(midX - width/2) < 30) actionResult[presenceIdx] = 1;
            }

            // Si aucune action de mouvement, on est IMMOBILE (index 0)
            const anyMovement = actionResult.slice(1).some(v => v === 1);
            if (!anyMovement) {
                actionResult[ACTIONS.indexOf("IMMOBILE")] = 1;
            }
        } else {
            ws.boxHistory = []; // Reset si on perd le flux
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

    // Réduction de la séquence à une seule empreinte cumulative (Motion Footprint)
    const footprint = new Float32Array(INPUT_FLAT_SIZE).fill(0);
    for (const sig of ws.recordingBuffer) {
        for (let i = 0; i < INPUT_FLAT_SIZE; i++) footprint[i] += sig[i];
    }

    // Normalisation de l'empreinte et boost de contraste
    let maxVal = 0;
    for (let i = 0; i < INPUT_FLAT_SIZE; i++) {
        footprint[i] /= ws.recordingBuffer.length;
        if (footprint[i] > maxVal) maxVal = footprint[i];
    }
    
    if (maxVal > 0) {
        for (let i = 0; i < INPUT_FLAT_SIZE; i++) {
            // Normalisation + Seuil pour isoler la forme du mouvement
            let v = footprint[i] / maxVal;
            footprint[i] = v > 0.15 ? v : 0;
        }
    }

    if (!gestureSamples[ws.pendingGestureName]) {
        gestureSamples[ws.pendingGestureName] = [];
        if (!ACTIONS.includes(ws.pendingGestureName)) ACTIONS.push(ws.pendingGestureName);
    }

    gestureSamples[ws.pendingGestureName].push(footprint);
    updateMotionBrain();

    console.log(`🧠 GESTE RÉDUIT À UNE EMPREINTE : ${ws.pendingGestureName}`);
    broadcastState();
    ws.send(JSON.stringify({ type: 'RECORD_DONE' }));

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
 * getPatchSignature : Calcule l'intensité moyenne par cellule (Pooling d'intensité).
 * On moyenne les valeurs de mouvement réelles pour chaque cellule de la grille,
 */
function getPatchSignature(motionBuffer, box, imgW, imgH, gridSize = 50) {
    const signature = new Float32Array(gridSize * gridSize);
    const boxW = box.maxX - box.minX;
    const boxH = box.maxY - box.minY;

    // Taille d'une cellule de pooling
    const cellW = boxW / gridSize;
    const cellH = boxH / gridSize;

    let maxVal = 0;
    for (let gy = 0; gy < gridSize; gy++) {
        for (let gx = 0; gx < gridSize; gx++) {
            // Zone de scan pour cette cellule (Convolution/Pooling)
            const startX = box.minX + gx * cellW;
            const startY = box.minY + gy * cellH;
            const endX = startX + cellW;
            const endY = startY + cellH;
            
            let sum = 0;
            let count = 0;
            for (let py = Math.floor(startY); py < Math.min(imgH, Math.ceil(endY)); py++) {
                for (let px = Math.floor(startX); px < Math.min(imgW, Math.ceil(endX)); px++) {
                    // On lit directement le buffer de mouvement (1 canal grayscale)
                    const idx = (py * imgW + px);
                    const val = motionBuffer[idx];
                    sum += val > 50 ? val : 0;
                    count++;
                }
            }
            // Pooling : On normalise l'intensité du mouvement (0.0 à 1.0)
            const avg = count > 0 ? (sum / (count * 255)) : 0;
            signature[gy * gridSize + gx] = avg;
            if (avg > maxVal) maxVal = avg;
        }
    }
    // --- AUTO-CONTRASTE (Normalisation Min-Max) ---
    // Si le mouvement est trop faible globalement, on l'annule.
    // Si c'est un vrai geste, on "étire" les valeurs pour que le max soit 1.0.
    if (maxVal < 0.15) {
        signature.fill(0);
    } else {
        for (let i = 0; i < signature.length; i++) {
            // On renforce les zones fortes et on écrase les zones faibles (Sigmoid simplifiée)
            let v = signature[i] / maxVal;
            signature[i] = v > 0.15 ? v : 0;
        }
    }
    return signature;
}

/**
 * Détecte les zones de mouvement et retourne des bounding boxes
 * Version améliorée : utilise la densité de mouvement par bloc pour filtrer le bruit.
 */
function detectMotionBoxes(motionBuffer, width, height) {
    const boxes = [];
    const threshold = 40; // Seuil légèrement abaissé pour capturer les bords de main
    const step = 8;       // Résolution plus fine (8px) pour plus de précision
    const minDensity = 0.25; // Densité plus tolérante pour les doigts fins

    for (let y = 4; y < height - step; y += step) {
        for (let x = 4; x < width - step; x += step) {
            let activePixels = 0;
            for (let subY = 0; subY < step; subY++) {
                for (let subX = 0; subX < step; subX++) {
                    if (motionBuffer[(y + subY) * width + (x + subX)] > threshold) activePixels++;
                }
            }

            // Si le bloc est suffisamment "dense" en mouvement
            if (activePixels / (step * step) > minDensity) {
                let added = false;
                
                for (let b = 0; b < boxes.length; b++) {
                    const box = boxes[b];
                    const margin = 45; // Marge augmentée pour souder les parties du corps
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

    const filtered = boxes.filter(box => {
        const w = box.maxX - box.minX;
        const h = box.maxY - box.minY;
        // On rejette les trop petites zones (bruit résiduel)
        return (w * h) > 600; 
    });

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

/**
 * Calcule une boîte englobante unique pour toutes les zones de mouvement détectées
 */
function getGlobalMotionBox(boxes, width, height) {
    let minX = width, minY = height, maxX = 0, maxY = 0;
    boxes.forEach(box => {
        if (box.minX < minX) minX = box.minX;
        if (box.minY < minY) minY = box.minY;
        if (box.maxX > maxX) maxX = box.maxX;
        if (box.maxY > maxY) maxY = box.maxY;
    });
    return { minX, maxX, minY, maxY };
}

/**
 * Isole les pixels des boîtes en assombrissant le reste de l'image
 */
function maskBackground(buffer, boxes, width, height) {
    // 1. On assombrit tout le buffer (division par 4 des canaux RGB)
    for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] >>= 2;
        buffer[i+1] >>= 2;
        buffer[i+2] >>= 2;
    }
    // 2. On restaure les zones actives
    boxes.forEach(box => {
        for (let y = box.minY; y < box.maxY; y++) {
            for (let x = box.minX; x < box.maxX; x++) {
                const idx = (y * width + x) * 4;
                if (buffer[idx] > 0 || buffer[idx+1] > 0) { // Si pixel était blanc (> 0 après shift)
                    buffer[idx] = 255; buffer[idx+1] = 255; buffer[idx+2] = 255;
                }
            }
        }
    });
}

/**
 * drawLargeSignature : Dessine le patch 28x28 (ou SIGNATURE_SIZE) agrandi
 * pour visualiser exactement ce que le réseau neuronal reçoit comme information.
 */
function drawLargeSignature(buffer, signature, gridSize, width, height) {
    const scale = 6; // Facteur d'agrandissement (28x6 = 168px)
    const offsetX = Math.floor((width - gridSize * scale) / 2);
    const offsetY = Math.floor((height - gridSize * scale) / 2);

    for (let gy = 0; gy < gridSize; gy++) {
        for (let gx = 0; gx < gridSize; gx++) {
            const val = Math.floor(signature[gy * gridSize + gx] * 255);
            for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                    const px = offsetX + gx * scale + sx;
                    const py = offsetY + gy * scale + sy;
                    if (px >= 0 && px < width && py >= 0 && py < height) {
                        const idx = (py * width + px) * 4;
                        buffer[idx] = 0;     // R
                        buffer[idx + 1] = val; // G (Aspect Cyan)
                        buffer[idx + 2] = val; // B
                        buffer[idx + 3] = 255;
                    }
                }
            }
        }
    }
}

function drawGlobalBox(buffer, box, width) {
    const color = { r: 0, g: 255, b: 0 }; // Vert pour la zone fusionnée
    for (let x = box.minX; x < box.maxX; x++) {
        drawPixel(buffer, x, box.minY, width, color);
        drawPixel(buffer, x, box.maxY - 1, width, color);
    }
    for (let y = box.minY; y < box.maxY; y++) {
        drawPixel(buffer, box.minX, y, width, color);
        drawPixel(buffer, box.maxX - 1, y, width, color);
    }
}