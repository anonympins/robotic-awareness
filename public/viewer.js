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

export class GLBViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Le container #${containerId} est introuvable.`);
        }

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
        this.taxelMeshes = new Map(); // Suivi des capteurs par sensorId
        
        // Initialisation pour la calibration (Tare)
        this.sensorConfigs = new Map();
        this.isCalibrating = false;
        this.calibrationBuffer = new Map(); // { sensorId: [values] }
    }

    /**
     * Tente de charger un GLB, sinon génère les primitives
     */
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
                }
            }

            this.meshes.set(act.name, mesh);
            actuatorMap.set(act.name, act);

            // Ajout d'un "Taxel" (Capteur de pression visuel) si un sensorId est défini
            if (act.config && act.config.sensorId) {
                const taxelGeom = new THREE.SphereGeometry(0.004, 8, 8);
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

    createPrimitive(data) {
        let geometry;
        const material = new THREE.MeshPhongMaterial({ 
            color: data.color || 0x888888, 
            shininess: 100,
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
                geometry = new THREE.CylinderGeometry(0, data.radius || 0.05, data.height || 0.1, 4);
                geometry.translate(0, (data.height || 0.1) / 2, 0);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(data.radiusTop || data.radius || 0.05, data.radiusBottom || data.radius || 0.05, data.height || 0.1, 8);
                geometry.translate(0, (data.height || 0.1) / 2, 0);
                break;
            case 'tube':
                if (data.path) {
                    const points = data.path.map(p => new THREE.Vector3(...p));
                    const curve = new THREE.CatmullRomCurve3(points);
                    geometry = new THREE.TubeGeometry(curve, 20, data.radius || 0.01, 8, false);
                }
                break;
            case 'torus':
                geometry = new THREE.TorusGeometry(data.radius || 0.05, data.tube || 0.01, 16, 100);
                break;
            case 'multigone': // Polyèdre irrégulier
                const vertices = data.vertices.flat();
                geometry = new THREE.PolyhedronGeometry(vertices, data.indices || [0,1,2], data.radius || 1);
                break;
            default:
                geometry = new THREE.SphereGeometry(0.02);
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

            if (act.kinematics.type === 'revolute') {
                // Conversion de l'angle (degrés) en Quaternion local sur l'axe défini
                const axis = new THREE.Vector3(...act.kinematics.axis);
                const angleRad = act.currentValue * (Math.PI / 180);
                
                const q = new THREE.Quaternion().setFromAxisAngle(axis, angleRad);
                const initialQ = this.initialQuaternions.get(act.name) || new THREE.Quaternion();
                mesh.quaternion.copy(initialQ).multiply(q);
            } 
            else if (act.kinematics.type === 'prismatic') {
                // Déplacement linéaire le long de l'axe
                const axis = new THREE.Vector3(...act.kinematics.axis);
                const dist = act.currentValue / 1000; // mm to m
                
                // On repart de l'offset initial (stocké dans mesh.position à la création)
                // Pour simplifier ici, on ajoute le déplacement à l'offset de base
                const offset = new THREE.Vector3(...(act.offset || [0,0,0]));
                mesh.position.copy(offset).add(axis.multiplyScalar(dist));
            }
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

        // Normalisation de l'orientation globale du modèle
        // Si le FBX arrive "couché", on redresse le root ici
        if (url.toLowerCase().includes('hand')) {
            model.rotation.x = 0; // Ajuster si la main est à plat ou verticale
            model.updateMatrixWorld(true);
        }

        // Ajout d'un SkeletonHelper pour debugger le "pliage" (optionnel)
        const helper = new THREE.SkeletonHelper(model);
        helper.visible = false; // Activer pour voir les os
        this.scene.add(helper);

        model.traverse(node => {
            if (node.name) {
                this.meshes.set(node.name, node);
                this.initialQuaternions.set(node.name, node.quaternion.clone());
                
                // Si c'est un os, on peut attacher un repère visuel plus discret
                if (node.isBone) {
                    const axes = new THREE.AxesHelper(0.02);
                    node.add(axes);
                }

                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                    
                    // Si c'est un SkinnedMesh (modèle riggé), on active le skinning
                    if (node.isSkinnedMesh) {
                        node.frustumCulled = false; // Évite que le mesh disparaisse quand il se déforme
                        
                        // Injection d'un Shader personnalisé pour accentuer le pliage
                        node.material.onBeforeCompile = (shader) => {
                            shader.uniforms.uFlexionColor = { value: new THREE.Color(0x00ffff) };
                            shader.vertexShader = `
                                varying float vSkinWeight;
                                ${shader.vertexShader}
                            `.replace(
                                `#include <skinnormal_vertex>`,
                                `#include <skinnormal_vertex>
                                 // On détecte la transition entre deux os (pliage)
                                 vSkinWeight = (skinWeight.x > 0.1 && skinWeight.y > 0.1) ? 1.0 : 0.0;
                                `
                            );
                            shader.fragmentShader = `
                                uniform vec3 uFlexionColor;
                                varying float vSkinWeight;
                                ${shader.fragmentShader}
                            `.replace(
                                `#include <color_fragment>`,
                                `#include <color_fragment>
                                 diffuseColor.rgb = mix(diffuseColor.rgb, uFlexionColor, vSkinWeight * 0.6);
                                `
                            );
                        };
                    }
                }
            }
        });

        // Déduction proactive comme dans extract.js
        this.analyzeProactive(model);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        this.controls.target.copy(center);
        const maxDim = Math.max(size.x, size.y, size.z);
        this.camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
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
            }
        });
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