import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import zlib from 'zlib';

// Importation des outils G-NEURO pour le traitement neuronal
import { 
    RuleInterpreter, DataWrapper, CNNBrain,
    ProjectiveBrain, OBJParser, VisionBenchmark,
    Quaternion, Vector3, BitwiseMeshMapper, FBXParser
} from './neuro-lib.js';

let globalVertices = [];
let projectiveBrain = new ProjectiveBrain(5); // 5 points d'intérêt pour la reconstruction

// --- CONFIGURATION GÉOMÉTRIQUE BITWISE (Pose 60-bits) ---
const SAMPLES_COUNT = 200;
const BITS_PER_COMPONENT = 10;
const TOTAL_POSE_BITS = 60; // [X, Y, Z, Nx, Ny, Nz] * 10
const SIGNATURE_SIZE = 28;
const INPUT_FLAT_SIZE = SIGNATURE_SIZE * SIGNATURE_SIZE;

const meshMapper = new BitwiseMeshMapper(INPUT_FLAT_SIZE, TOTAL_POSE_BITS);

// Seuils pour l'encodage Thermomètre (10 niveaux par composante)
const tPos = Array.from({length: 10}, (_, i) => -0.5 + (i * 0.1));
const tDepth = Array.from({length: 10}, (_, i) => 1.0 + (i * 0.15));
const tNormal = Array.from({length: 10}, (_, i) => -1.0 + (i * 0.2));

// --- GÉNÉRATEUR D'ARCHÉTYPES ---
/**
 * Crée une signature visuelle synthétique (un disque blanc sur fond noir)
 */
function createSyntheticSignature(cx, cy, radius) {
    const sig = new Uint8Array(INPUT_FLAT_SIZE);
    for (let y = 0; y < SIGNATURE_SIZE; y++) {
        for (let x = 0; x < SIGNATURE_SIZE; x++) {
            const dx = (x / SIGNATURE_SIZE) - cx;
            const dy = (y / SIGNATURE_SIZE) - cy;
            if (Math.sqrt(dx * dx + dy * dy) < radius) {
                sig[y * SIGNATURE_SIZE + x] = 1;
            }
        }
    }
    return sig;
}

/**
 * Génère une collection de poses 3D prédites en variant les paramètres visuels
 */
function generateArchetypes() {
    const archetypes = [];
    // On varie la taille (échelle) et la position horizontale pour simuler 
    // différentes perspectives apprises par le réseau.
    for (let scale = 0.15; scale <= 0.45; scale += 0.1) {
        for (let posX = 0.2; posX <= 0.8; posX += 0.2) {
            const sig = createSyntheticSignature(posX, 0.5, scale);
            const meshBits = meshMapper.predict(sig);
            
            archetypes.push({
                posX: posX.toFixed(2),
                scale: scale.toFixed(2),
                pos: decodePose(meshBits.slice(0, 30), "POS"),
                normal: decodePose(meshBits.slice(30, 60), "NORMAL")
            });
        }
    }
    return archetypes;
}

// --- PERSISTANCE DES DONNÉES ---
const GESTURES_FILE = path.join(process.cwd(), 'trained_gestures.json');
const MAPPER_FILE = path.join(process.cwd(), 'trained_mesh_mapper.json');

function saveTrainedData() {
    // Sauvegarde des gestes (Conversion Float32Array -> Array pour JSON)
    const exportableGestures = {};
    for (const [name, samples] of Object.entries(gestureSamples)) {
        exportableGestures[name] = samples.map(s => Array.from(s));
    }
    fs.writeFileSync(GESTURES_FILE, JSON.stringify({ actions: ACTIONS, samples: exportableGestures }));
    
    // Sauvegarde du Mapper 3D
    fs.writeFileSync(MAPPER_FILE, JSON.stringify(meshMapper.exportState()));
    console.log("💾 Données neuronales sauvegardées sur le disque.");
}

function loadTrainedData() {
    try {
        if (fs.existsSync(GESTURES_FILE)) {
            const data = JSON.parse(fs.readFileSync(GESTURES_FILE, 'utf8'));
            ACTIONS = data.actions;
            gestureSamples = {};
            for (const [name, samples] of Object.entries(data.samples)) {
                gestureSamples[name] = samples.map(s => new Float32Array(s));
            }
            console.log(`📂 ${ACTIONS.length} actions chargées depuis le disque.`);
            updateMotionBrain();
        }
        
        if (fs.existsSync(MAPPER_FILE)) {
            const mapperState = JSON.parse(fs.readFileSync(MAPPER_FILE, 'utf8'));
            meshMapper.importState(mapperState);
            console.log("📂 État du BitwiseMeshMapper restauré.");
        }
    } catch (e) {
        console.error("⚠️ Erreur lors du chargement des données persistantes:", e);
    }
}


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
    // Conversion des Float32Array en tableaux standards pour une sérialisation JSON fluide
    const exportableSamples = {};
    for (const [name, samples] of Object.entries(gestureSamples)) {
        exportableSamples[name] = samples.map(s => s instanceof Float32Array ? Array.from(s) : s);
    }
    const payload = JSON.stringify({ type: 'STATE_UPDATE', actions: ACTIONS, samples: exportableSamples });
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
    ws.isStreaming3D = false;     // Mode reconstruction active

    ws.on('message', (data) => {
        try {
            // --- DÉTECTION DU PROTOCOLE BINAIRE ---
            // Si le message commence par "MESH" (0x4D 0x45 0x53 0x48)
            if (data.length > 5 && data[0] === 77 && data[1] === 69 && data[2] === 83 && data[3] === 72) {
                const nameLen = data[4];
                const filename = data.slice(5, 5 + nameLen).toString();
                const content = data.slice(5 + nameLen);
                
                const ext = filename.split('.').pop().toLowerCase();
                if (ext === 'obj') {
                    globalVertices = OBJParser.parse(content.toString());
                } else if (ext === 'fbx') {
                    globalVertices = FBXParser.parse(content, zlib);
                }
                
                console.log(`📦 Modèle Binaire ${filename} reçu : ${globalVertices.length} sommets.`);
                ingestMeshGeometry(globalVertices);
                return;
            }

            // Commandes JSON classiques
            if (data[0] === 123) { // 123 = '{'
                const textData = data.toString();
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
                        saveTrainedData();
                        broadcastState();
                    }
                }
                if (cmd.type === 'TRAIN_3D_POSE') {
                    ws.isTraining3D = true;
                    ws.target3DPose = cmd.target;
                    console.log(`📸 Capture de pose 3D pour entraînement : Z=${cmd.target.z}m`);
                }
                if (cmd.type === 'TOGGLE_3D_STREAM') {
                    ws.isStreaming3D = cmd.active;
                }
                if (cmd.type === 'BENCHMARK_3D') {
                    if (globalVertices.length === 0) {
                        ws.send(JSON.stringify({ type: 'BENCHMARK_RESULT', error: "Aucun modèle OBJ chargé." }));
                    } else {
                        VisionBenchmark.runTrainingSession(projectiveBrain, globalVertices, 5000).then(time => {
                            ws.send(JSON.stringify({ type: 'BENCHMARK_RESULT', time: time }));
                        });
                    }
                }
                if (cmd.type === 'GENERATE_ARCHETYPES') {
                    const archetypes = generateArchetypes();
                    ws.send(JSON.stringify({ type: 'ARCHETYPES_LIST', data: archetypes }));
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

                // --- ESTIMATION 3D & ENTRAÎNEMENT ---
                const focal = 500;
                const centerX = (globalBox.minX + globalBox.maxX) / 2;
                const centerY = (globalBox.minY + globalBox.maxY) / 2;
                
                if (ws.isTraining3D) {
                    // On entraîne le premier seeker (point principal) sur la profondeur cible
                    const seeker = projectiveBrain.seekers[0];
                    const depth = ws.target3DPose.z;
                    
                    // Le neurone Seeker apprend la direction (quaternion neutre ici) pondéré par l'erreur de profondeur
                    seeker.pose.update(new Quaternion(), depth * 0.1, 0.05);
                    
                    ws.isTraining3D = false;
                    ws.send(JSON.stringify({ type: '3D_TRAIN_DONE' }));
                }

                // --- ESTIMATION 3D PAR MAPPING BITWISE ---
                if (ws.isStreaming3D) {
                    const meshBits = meshMapper.predict(signature);
                    
                    // Décodage des positions (Bits 0-29)
                    const bX = DataWrapper.bitsToAnalog(meshBits.slice(0, 10), -0.5, 0.5);
                    const bY = DataWrapper.bitsToAnalog(meshBits.slice(10, 20), -0.5, 0.5);
                    const bZ = DataWrapper.bitsToAnalog(meshBits.slice(20, 30), 1.0, 2.5);
                    
                    // Décodage des normales / orientation (Bits 30-59)
                    const nX = DataWrapper.bitsToAnalog(meshBits.slice(30, 40), -1.0, 1.0);
                    const nY = DataWrapper.bitsToAnalog(meshBits.slice(40, 50), -1.0, 1.0);
                    const nZ = DataWrapper.bitsToAnalog(meshBits.slice(50, 60), -1.0, 1.0);
                    
                    ws.send(JSON.stringify({ 
                        type: '3D_ESTIMATE', 
                        pos: { x: bX.toFixed(2), y: bY.toFixed(2), z: bZ.toFixed(2) },
                        normal: { x: nX.toFixed(2), y: nY.toFixed(2), z: nZ.toFixed(2) },
                        reliability: (meshBits.reduce((a, b) => a + b, 0) / TOTAL_POSE_BITS).toFixed(2)
                    }));
                }

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
 * Génère des vues synthétiques de l'objet pour l'ingestion neuronale bit à bit
 */
function ingestMeshGeometry(vertices) {
    console.log(`🧠 Ingestion Bitwise : Démarrage sur ${SAMPLES_COUNT} vues (${vertices.length} sommets)...`);

    const focal = 500, w = 320, h = 240;
    const _tempV = new Vector3();
    const _tempV2 = new Vector3();
    const forward = new Vector3(0, 0, 1);
    const signature = new Uint8Array(INPUT_FLAT_SIZE);
    const targetBits = new Uint8Array(TOTAL_POSE_BITS);

    let i = 0;

    const processBatch = () => {
        const batchSize = 5; // Traitement par petits paquets pour libérer l'Event Loop
        const end = Math.min(i + batchSize, SAMPLES_COUNT);

        for (; i < end; i++) {
            // 1. Pose aléatoire
            const q = Quaternion.random();
            const pos = new Vector3((Math.random() - 0.5), (Math.random() - 0.5), 1.0 + Math.random() * 1.5);

            // 2. Projection optimisée (sans allocation d'objets dans la boucle v)
            signature.fill(0);
            for (let j = 0; j < vertices.length; j++) {
                const v = vertices[j];
                q.rotateVector(v, _tempV);
                _tempV.add(pos, _tempV2);
                
                const z = (_tempV2.z <= 0) ? 0.001 : _tempV2.z;
                const factor = focal / z;
                const gx = ((_tempV2.x * factor + w / 2) / w * SIGNATURE_SIZE) | 0;
                const gy = ((-_tempV2.y * factor + h / 2) / h * SIGNATURE_SIZE) | 0;

                if (gx >= 0 && gx < SIGNATURE_SIZE && gy >= 0 && gy < SIGNATURE_SIZE) {
                    signature[gy * SIGNATURE_SIZE + gx] = 1;
                }
            }

            // 3. Encodage et Entraînement
            const normal = q.rotateVector(forward, _tempV);
            targetBits.set(DataWrapper.numberToBits(pos.x, tPos), 0);
            targetBits.set(DataWrapper.numberToBits(pos.y, tPos), 10);
            targetBits.set(DataWrapper.numberToBits(pos.z, tDepth), 20);
            targetBits.set(DataWrapper.numberToBits(normal.x, tNormal), 30);
            targetBits.set(DataWrapper.numberToBits(normal.y, tNormal), 40);
            targetBits.set(DataWrapper.numberToBits(normal.z, tNormal), 50);

            meshMapper.train(signature, targetBits);
        }

        // Feedback visuel immédiat dans la console
        process.stdout.write(`\r   ... Progression : ${((i/SAMPLES_COUNT)*100).toFixed(0)}% (${i}/${SAMPLES_COUNT} vues)`);

        if (i < SAMPLES_COUNT) {
            setImmediate(processBatch); // Laisse Node.js traiter les autres événements
        } else {
            console.log("\n✅ Cartographie Bitwise terminée.");
            saveTrainedData();
            broadcastState();
        }
    };

    processBatch();
}

/**
 * Utilitaire de décodage des bits vers un objet 3D lisible
 */
function decodePose(bits, type) {
    if (type === "POS") {
        return {
            x: DataWrapper.bitsToAnalog(bits.slice(0, 10), -0.5, 0.5).toFixed(3),
            y: DataWrapper.bitsToAnalog(bits.slice(10, 20), -0.5, 0.5).toFixed(3),
            z: DataWrapper.bitsToAnalog(bits.slice(20, 30), 1.0, 2.5).toFixed(3)
        };
    } else {
        return {
            x: DataWrapper.bitsToAnalog(bits.slice(0, 10), -1.0, 1.0).toFixed(3),
            y: DataWrapper.bitsToAnalog(bits.slice(10, 20), -1.0, 1.0).toFixed(3),
            z: DataWrapper.bitsToAnalog(bits.slice(20, 30), -1.0, 1.0).toFixed(3)
        };
    }
}

/**
 * Évalue la précision de l'entraînement bit à bit sur les normales
 */
function evaluateBitwiseGeometry(signature, targetNormal) {
    const prediction = motionBrain.predict(signature);
    // Ici on comparerait la sortie du réseau avec les bits de DataWrapper
    // Pour l'instant, on utilise les classes de vues comme proxy
    const predictedViewIdx = prediction.indexOf(1);
    if (predictedViewIdx !== -1) {
        const viewName = ACTIONS[predictedViewIdx];
        return `Estimation : ${viewName}`;
    }
    return "Inconnu";
}

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
    saveTrainedData();

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
// Chargement au démarrage
loadTrainedData();
s