/**
 * G-NEURO : GLB Viewer Utility
 * Visualiseur léger pour les modèles robotiques (GLB/GLTF)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as fflate from 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm';

const LOD_LEVELS = {
    high: { segments: 1.0, anisotropy: 16, shadows: true, filter: THREE.LinearMipmapLinearFilter },
    medium: { segments: 0.5, anisotropy: 4, shadows: true, filter: THREE.LinearFilter },
    low: { segments: 0.25, anisotropy: 1, shadows: false, filter: THREE.NearestFilter }
};

export class GLBViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Le container #${containerId} est introuvable.`);
        }

        this.container.style.position = 'relative'; // Indispensable pour l'UI absolue
        this.quality = 'high'; // Niveau par défaut

        // 1. Initialisation de la Scène
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050505); // Fond sombre "Neuro"

        // Aide visuelle : Grille pour voir si le moteur tourne
        const grid = new THREE.GridHelper(2, 20, 0x444444, 0x222222);
        this.scene.add(grid);

        // 2. Caméra
        this.camera = new THREE.PerspectiveCamera(50, this.container.clientWidth / this.container.clientHeight, 0.01, 1000);
        this.camera.position.set(1.5, 1.5, 1.5);

        // 3. Rendu
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // 4. Contrôles
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        // 5. Lumières
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0x00ffff, 0.8); // Teinte cyan pour le style technique
        dirLight.position.set(5, 5, 5);
        this.scene.add(dirLight);

        this.animate();
        window.addEventListener('resize', () => this.onResize());
        this.meshes = new Map(); // Suivi des objets par nom
        this.initialQuaternions = new Map(); // Sauvegarde des poses de repos
        this.initialPositions = new Map(); // Positions de repos pour la déformation
        this.vertexWeights = new Map(); // Weights pour le "Neural Skinning"
        this.taxelMeshes = new Map(); // Suivi des capteurs par sensorId
        
        // Initialisation pour la calibration (Tare)
        this.sensorConfigs = new Map();
        this.isCalibrating = false;
        this.calibrationBuffer = new Map(); // { sensorId: [values] }

        // Initialisation de l'interface de contrôle
        this.createUI();
    }

    /**
     * Tente de charger un GLB, sinon génère les primitives
     */
    setQuality(level) {
        if (!LOD_LEVELS[level]) return;
        this.quality = level;
        const config = LOD_LEVELS[level];

        // Mise à jour du renderer
        this.renderer.shadowMap.enabled = config.shadows;

        // Mise à jour des textures existantes
        this.scene.traverse(node => {
            if (node.isMesh && node.material) {
                this.applyLODToMaterial(node.material);
                node.castShadow = config.shadows;
                node.receiveShadow = config.shadows;
            }
        });

        console.log(`[Viewer] Qualité réglée sur : ${level}`);
    }

    /**
     * Génère l'interface de contrôle LOD en superposition
     */
    createUI() {
        const ui = document.createElement('div');
        ui.className = 'viewer-lod-controls';
        ui.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(10, 10, 10, 0.85);
            border: 1px solid #00ffff;
            padding: 12px;
            border-radius: 8px;
            color: #00ffff;
            font-family: 'Segoe UI', Tahoma, sans-serif;
            font-size: 11px;
            z-index: 1000;
            pointer-events: auto;
            box-shadow: 0 0 15px rgba(0, 255, 255, 0.2);
            backdrop-filter: blur(4px);
        `;

        const label = document.createElement('div');
        label.innerText = "ENGINE PRECISION";
        label.style.cssText = "font-weight: bold; margin-bottom: 8px; letter-spacing: 1px; color: #fff; border-bottom: 1px solid #00ffff44; padding-bottom: 4px;";
        ui.appendChild(label);

        const select = document.createElement('select');
        select.style.cssText = "width: 100%; background: #000; color: #00ffff; border: 1px solid #00ffff; padding: 5px; cursor: pointer; outline: none; border-radius: 4px;";
        
        Object.keys(LOD_LEVELS).forEach(lvl => {
            const opt = document.createElement('option');
            opt.value = lvl;
            opt.innerText = lvl.toUpperCase();
            if (lvl === this.quality) opt.selected = true;
            select.appendChild(opt);
        });

        select.addEventListener('change', (e) => this.setQuality(e.target.value));

        ui.appendChild(select);
        this.container.appendChild(ui);
    }

    async initRobot(config) {
        // Priorité à l'URL extraite proactivement dans metadata
        const url = config.metadata?.model_url || config.visual?.model_url;
        
        if (url) {
            const ext = url.split('.').pop().toLowerCase();
            try {
                if (ext === 'obj') {
                    await this.loadOBJ(url);
                } else if (ext === 'fbx') {
                    await this.loadFBX(url);
                } else if (ext === 'glb' || ext === 'gltf' || url.includes('data:application/octet-stream')) {
                    await this.loadModel(url);
                } else {
                    console.warn(`[Viewer] Format non supporté : ${ext}`);
                }
            } catch (err) {
                console.error(`[Viewer] Échec du chargement du modèle extrait (${url}). Bascule sur le rendu par primitives.`, err);
                // On ne re-throw pas l'erreur pour laisser buildFromConfig s'exécuter
            }
        }

        // On complète toujours avec la config (pour les pièces/capteurs non présents dans le modèle)
        this.buildFromConfig(config);
    }

    /**
     * Génère le robot à partir de primitives si aucun GLB n'est fourni
     */
    buildFromConfig(config) {
        const actuatorMap = new Map();

        // 1. Création de tous les maillons
        config.actuators.forEach(act => {
            // Si l'objet existe déjà dans le modèle global (par son nom), on ne crée pas de primitive
            if (this.meshes.has(act.name)) {
                console.log(`[Viewer] Utilisation du mesh existant pour : ${act.name}`);
                
                // Ajout d'une aide visuelle sur le mesh existant pour confirmer le joint
                const jointMarker = new THREE.AxesHelper(0.05);
                this.meshes.get(act.name).add(jointMarker);
                return;
            }

            // Fallback : Si l'actuateur n'est pas dans le modèle 3D, on crée une sphère debug
            const primitiveData = act.primitive || { type: 'sphere', radius: 0.02, color: 0xff00ff };
            
            const mesh = this.createPrimitive(primitiveData);
            mesh.name = act.name;
            
            // Positionnement initial relatif au parent
            if (act.offset) mesh.position.set(...act.offset);
            
            // Orientation initiale (si définie dans la config)
            if (act.rotationOffset) {
                if (act.rotationOffset.length === 3) { // Euler
                    mesh.rotation.set(
                        act.rotationOffset[0] * Math.PI / 180,
                        act.rotationOffset[1] * Math.PI / 180,
                        act.rotationOffset[2] * Math.PI / 180
                    );
                } else if (act.rotationOffset.length === 4) { // Quaternion [x, y, z, w]
                    // glTF-Transform utilise [x, y, z, w], Three.js aussi
                    mesh.quaternion.fromArray(act.rotationOffset);
                }
            }

            this.meshes.set(act.name, mesh);
            // Sauvegarde de la pose initiale pour les primitives
            this.initialQuaternions.set(act.name, mesh.quaternion.clone());
            this.initialPositions.set(act.name, mesh.geometry.attributes.position.array.slice());
            actuatorMap.set(act.name, act);

            // Ajout d'un "Taxel" (Capteur de pression visuel) si un sensorId est défini
            if (act.config && act.config.sensorId) {
                const lod = LOD_LEVELS[this.quality];
                const seg = Math.max(4, Math.floor(8 * lod.segments));
                const taxelGeom = new THREE.SphereGeometry(0.004, seg, seg);
                const taxelMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
                const taxel = new THREE.Mesh(taxelGeom, taxelMat);
                
                // Positionnement sur la face "interne" de la phalange
                taxel.position.set(0, (act.primitive.height || 0.04) / 2, 0.006);
                mesh.add(taxel);
                this.taxelMeshes.set(act.config.sensorId, taxel);
            }
            if (act.config) {
                this.sensorConfigs.set(act.config.sensorId || act.name, act.config);
            }
        });

        // 2. Assemblage hiérarchique (Parent -> Enfant)
        config.actuators.forEach(act => {
            const mesh = this.meshes.get(act.name);
            if (!mesh) return;

            const parentMesh = this.meshes.get(act.parent);
            if (act.parent === "base" || !parentMesh) {
                this.scene.add(mesh);
            } else {
                parentMesh.add(mesh);
            }
        });
    }

    applyLODToMaterial(material) {
        const lod = LOD_LEVELS[this.quality];
        if (material.map) {
            material.map.minFilter = lod.filter;
            material.map.magFilter = (this.quality === 'low') ? THREE.NearestFilter : THREE.LinearFilter;
            material.map.anisotropy = lod.anisotropy;
            material.map.needsUpdate = true;
        }
        material.needsUpdate = true;
    }

    createPrimitive(data) {
        let geometry;
        const lod = LOD_LEVELS[this.quality];
        const material = new THREE.MeshPhongMaterial({ 
            color: data.color || 0x888888, 
            shininess: this.quality === 'low' ? 0 : 100,
            transparent: true,
            opacity: 0.9
        });

        switch (data.type) {
            case 'box':
                const size = data.size || [0.1, 0.1, 0.1];
                geometry = new THREE.BoxGeometry(...size);
                // On décale pour que le pivot soit en bas du cube
                geometry.translate(0, size[1] / 2, 0);
                break;
            case 'pyramid':
                geometry = new THREE.CylinderGeometry(0, data.radius || 0.05, data.height || 0.1, Math.max(4, Math.floor(8 * lod.segments)));
                geometry.translate(0, (data.height || 0.1) / 2, 0);
                break;
            case 'cylinder':
                const radSeg = Math.max(6, Math.floor(16 * lod.segments));
                geometry = new THREE.CylinderGeometry(data.radiusTop || data.radius || 0.05, data.radiusBottom || data.radius || 0.05, data.height || 0.1, radSeg);
                geometry.translate(0, (data.height || 0.1) / 2, 0);
                break;
            case 'tube':
                if (data.path) {
                    const points = data.path.map(p => new THREE.Vector3(...p));
                    const curve = new THREE.CatmullRomCurve3(points);
                    const tubularSeg = Math.max(8, Math.floor(40 * lod.segments));
                    const radialSeg = Math.max(4, Math.floor(8 * lod.segments));
                    geometry = new THREE.TubeGeometry(curve, tubularSeg, data.radius || 0.01, radialSeg, false);
                }
                break;
            case 'torus':
                const tSeg = Math.max(8, Math.floor(16 * lod.segments));
                const rSeg = Math.max(12, Math.floor(32 * lod.segments));
                geometry = new THREE.TorusGeometry(data.radius || 0.05, data.tube || 0.01, tSeg, rSeg);
                break;
            case 'multigone': // Polyèdre irrégulier
                const vertices = data.vertices.flat();
                geometry = new THREE.PolyhedronGeometry(vertices, data.indices || [0,1,2], data.radius || 1);
                break;
            default:
                const sSeg = Math.max(6, Math.floor(16 * lod.segments));
                geometry = new THREE.SphereGeometry(0.02, sSeg, sSeg);
        }

        return new THREE.Mesh(geometry, material);
    }

    /**
     * Met à jour les articulations du robot en temps réel
     * @param {Array} actuators Liste des instances RobotActuator de test.js
     */
    updateJoints(actuators) {
        actuators.forEach(act => {
            const mesh = this.meshes.get(act.name);
            if (!mesh) return;

            // Support des Bones (SkinnedMesh) ET des Nodes standards
            const target = mesh; 

            const axis = new THREE.Vector3(...act.kinematics.axis).normalize();
            const angleRad = act.currentValue * (Math.PI / 180);
            const q = new THREE.Quaternion().setFromAxisAngle(axis, angleRad);
            const initialQ = this.initialQuaternions.get(act.name) || new THREE.Quaternion();

            if (act.kinematics.type === 'revolute') {
                target.quaternion.copy(initialQ).multiply(q);
            } else if (act.kinematics.type === 'prismatic') {
                const dist = act.currentValue / 1000;
                const offset = new THREE.Vector3(...(act.offset || [0,0,0]));
                target.position.copy(offset).add(axis.multiplyScalar(dist));
            }
        });

        // Application du "Neural Bending" sur les maillages monolithiques
        this.applyNeuralDeformation(actuators);
    }

    /**
     * Déformation dynamique des sommets pour les modèles non-riggés
     */
    applyNeuralDeformation(actuators) {
        this.meshes.forEach((mesh, name) => {
            if (!mesh.isMesh || mesh.isSkinnedMesh || !this.vertexWeights.has(name)) return;

            const weights = this.vertexWeights.get(name);
            const geometry = mesh.geometry;
            const positionAttr = geometry.attributes.position;
            const initialPos = this.initialPositions.get(name);

            const tempPos = new THREE.Vector3();
            const finalPos = new THREE.Vector3();
            const worldMatrixInv = mesh.matrixWorld.clone().invert();

            for (let i = 0; i < positionAttr.count; i++) {
                finalPos.set(0, 0, 0);
                tempPos.fromArray(initialPos, i * 3);
                
                // Passage en coordonnées monde pour calculer l'influence des joints
                tempPos.applyMatrix4(mesh.matrixWorld);

                let totalWeight = 0;
                const vertexInfluence = weights[i]; // { jointName: weight }

                for (const [jointName, weight] of Object.entries(vertexInfluence)) {
                    const joint = this.meshes.get(jointName);
                    if (!joint) continue;

                    // On simule le mouvement du vertex comme s'il était attaché au joint
                    const localToJoint = joint.worldToLocal(tempPos.clone());
                    const movedPos = localToJoint.applyMatrix4(joint.matrixWorld);
                    
                    finalPos.addScaledVector(movedPos, weight);
                    totalWeight += weight;
                }

                if (totalWeight > 0) {
                    // Retour en coordonnées locales pour l'attribut de position
                    finalPos.applyMatrix4(worldMatrixInv);
                    positionAttr.setXYZ(i, finalPos.x, finalPos.y, finalPos.z);
                }
            }
            positionAttr.needsUpdate = true;
        });
    }

    /**
     * Lance une procédure de Tare (1 seconde)
     */
    startCalibration() {
        console.log("⚖️ Calibration (Tare) en cours... Ne touchez à rien.");
        this.isCalibrating = true;
        this.calibrationBuffer.clear();
        
        setTimeout(() => {
            this.finalizeCalibration();
        }, 1000);
    }

    finalizeCalibration() {
        for (const [id, values] of this.calibrationBuffer.entries()) {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            const config = this.sensorConfigs.get(id) || {};
            config.calibration = config.calibration || {};
            config.calibration.offset = avg;
            console.log(`✅ Capteur [${id}] calibré : offset = ${avg.toFixed(4)}`);
        }
        this.isCalibrating = false;
        console.log("🚀 Calibration terminée. Robot prêt.");
    }

    /**
     * Met à jour la couleur des capteurs selon la pression reçue (0.0 à 1.0)
     */
    updateSensors(sensorValues) {
        for (const [id, value] of Object.entries(sensorValues)) {
            // Phase de calibration : on enregistre les valeurs
            if (this.isCalibrating) {
                if (!this.calibrationBuffer.has(id)) this.calibrationBuffer.set(id, []);
                this.calibrationBuffer.get(id).push(value);
                continue;
            }

            const taxel = this.taxelMeshes.get(id);
            const fullConfig = this.sensorConfigs.get(id) || {};
            const calib = fullConfig.calibration || {};
            
            if (taxel) {
                // 1. Application de l'offset et du scale
                let calibratedValue = (value - (calib.offset || 0)) * (calib.scale || 1);
                
                // 2. Application de la zone morte
                if (Math.abs(calibratedValue) < (calib.deadzone || 0)) calibratedValue = 0;
                
                // 3. Clamp (0.0 a 1.0) pour l'affichage
                const finalValue = Math.max(0, Math.min(1, calibratedValue));

                taxel.material.color.setRGB(finalValue * 2, 0.1, 0.1); 
            }
        }
    }

    loadModel(url) {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(url, 
                (gltf) => {
                    this.scene.add(gltf.scene);
                    this.onModelReady(gltf.scene, url);
                    resolve();
            }, undefined, (error) => {
                console.error("[Viewer] Erreur de chargement GLB:", error);
                reject(error);
            });
        });
    }

    loadOBJ(url) {
        return new Promise((resolve, reject) => {
            const loader = new OBJLoader();
            loader.load(url, (obj) => {
                this.scene.add(obj);
                this.onModelReady(obj, url);
                resolve();
            }, undefined, (error) => {
                console.error("[Viewer] Erreur de chargement OBJ:", error);
                reject(error);
            });
        });
    }

    loadFBX(url) {
        return new Promise((resolve, reject) => {
            // Nécessaire pour le support des FBX compressés/binaires via fflate
            window.fflate = fflate;
            const loader = new FBXLoader();
            loader.load(url, (fbx) => {
                this.scene.add(fbx);
                this.onModelReady(fbx, url);
                resolve();
            }, undefined, (error) => {
                console.error("[Viewer] Erreur fatale FBX:", error);
                reject(error);
            });
        });
    }

    /**
     * Finalisation et analyse du modèle (Hiérarchie et Segmentation)
     */
    onModelReady(model, url) {
        const isExtracted = url.includes('.glb');
        console.log(`[Viewer] ${isExtracted ? '🛡️ Modèle stabilisé' : '📦 Modèle brut'} chargé : ${url}`);

        // Ajout d'un SkeletonHelper pour debugger le "pliage" (optionnel)
        const helper = new THREE.SkeletonHelper(model);
        helper.visible = false; // Activer pour voir les os
        this.scene.add(helper);

        model.traverse(node => {
            if (node.name) {
                // Logique de sélection : Priorité aux Bones pour l'articulation
                // Si un os et un mesh portent le même nom, on préfère l'os pour les contrôles
                const existing = this.meshes.get(node.name);
                if (!existing || (!existing.isBone && node.isBone)) {
                    this.meshes.set(node.name, node);
                    this.initialQuaternions.set(node.name, node.quaternion.clone());
                }

                if (node.isMesh) {
                    this.initialPositions.set(node.name, node.geometry.attributes.position.array.slice());
                    node.castShadow = LOD_LEVELS[this.quality].shadows;
                    node.receiveShadow = LOD_LEVELS[this.quality].shadows;
                    if (node.isSkinnedMesh) {
                        node.frustumCulled = false; // Évite que le mesh disparaisse quand il se déforme
                    }
                    if (node.material) this.applyLODToMaterial(node.material);
                }

                if (node.isBone) {
                    const axes = new THREE.AxesHelper(0.02);
                    node.add(axes);
                }
            }
        });

        // Déduction proactive comme dans extract.js
        this.analyzeProactive(model);

        const box = new THREE.Box3().setFromObject(model);
        // On ne centre pas brutalement si on veut garder l'alignement avec les actuateurs
        // On utilise le centre pour la caméra, mais on laisse le modèle là où il est défini
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        this.controls.target.copy(center);
        const maxDim = Math.max(size.x, size.y, size.z);
        // Alignement simplifié pour éviter le désaxage (Front-ish view)
        this.camera.position.set(center.x, center.y + maxDim * 0.5, center.z + maxDim * 2);
        this.controls.update();
        console.log(`[Viewer] Modèle prêt (${url}) : ${this.meshes.size} nœuds indexés.`);
    }

    /**
     * Analyse proactive de la hiérarchie et des momentums géométriques
     */
    analyzeProactive(root) {
        console.log("[Viewer] Analyse des momentums géométriques...");
        root.traverse(node => {
            if (!node.isMesh) return;
            
            // 1. Analyse sémantique des noms
            const name = node.name.toLowerCase();
            if (/wheel|roue|arm|bras|joint|pivot/i.test(name)) {
                console.log(`🔍 Actuateur probable détecté par nom : ${node.name}`);
            }

            // 2. Détection d'îlots (segmentation de maillage fusionné)
            if (node.geometry.attributes.position && node.geometry.attributes.position.count > 100) {
                this.detectGeometricIslands(node);
                this.computeProximityWeights(node);
            }
        });
    }

    /**
     * Calcule l'influence des articulations sur chaque vertex (Soft Rigging)
     * C'est ici que l'approche "maillage de neurones" intervient.
     */
    computeProximityWeights(mesh) {
        const position = mesh.geometry.attributes.position;
        const weights = new Array(position.count);
        const joints = Array.from(this.meshes.values()).filter(n => n.name !== mesh.name && (n.isBone || /joint|finger|arm|thumb/i.test(n.name)));

        if (joints.length === 0) return;

        const v = new THREE.Vector3();
        const jPos = new THREE.Vector3();

        for (let i = 0; i < position.count; i++) {
            v.fromArray(position.array, i * 3).applyMatrix4(mesh.matrixWorld);
            const influence = {};
            
            joints.forEach(joint => {
                joint.getWorldPosition(jPos);
                const dist = v.distanceTo(jPos);
                // Loi en carré inverse pour le "poids neuronal"
                const w = 1 / (Math.pow(dist * 10, 2) + 0.1); 
                if (w > 0.1) influence[joint.name] = w;
            });
            weights[i] = influence;
        }
        this.vertexWeights.set(mesh.name, weights);
        console.log(`🧠 Neural Skinning généré pour ${mesh.name} (${joints.length} joints influents)`);
    }

    /**
     * Recherche de composants disjoints au sein d'une seule géométrie (Island Detection)
     */
    detectGeometricIslands(mesh) {
        const geometry = mesh.geometry;
        const pos = geometry.attributes.position.array;
        const count = geometry.attributes.position.count;
        const indices = geometry.index ? geometry.index.array : Array.from({length: count}, (_, i) => i);
        
        // Construction sommaire du graphe de connectivité
        const adj = Array.from({ length: count }, () => []);
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i], b = indices[i+1], c = indices[i+2];
            adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b);
        }

        const visited = new Uint8Array(count);
        const islands = [];

        for (let i = 0; i < count; i++) {
            if (visited[i]) continue;
            const island = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
            const stack = [i];
            visited[i] = 1;

            while (stack.length > 0) {
                const v = stack.pop();
                for(let a=0; a<3; a++) {
                    const val = pos[v*3+a];
                    island.min[a] = Math.min(island.min[a], val);
                    island.max[a] = Math.max(island.max[a], val);
                }
                for (const n of adj[v]) {
                    if (!visited[n]) {
                        visited[n] = 1;
                        stack.push(n);
                    }
                }
            }
            islands.push(island);
        }

        if (islands.length > 1) {
            console.log(`📦 Momentum : ${mesh.name} contient ${islands.length} sous-pièces distinctes.`);
        }
    }

    onResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}