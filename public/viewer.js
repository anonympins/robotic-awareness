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

// Objets de travail réutilisables pour éviter le Garbage Collection (Performance)
const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _worldPos = new THREE.Vector3();
const _tempPos = new THREE.Vector3();

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

        // Raycaster pour la sélection
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedObject = null;
        this.skeletonHelper = null;
        this.originalMaterials = new Map(); // Pour restaurer les couleurs après sélection

        // 5. Lumières
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(5, 5, 5);
        this.scene.add(dirLight);

        this.animate();
        window.addEventListener('resize', () => this.onResize());
        this.container.addEventListener('pointerdown', (e) => this.onPointerDown(e));

        this.meshes = new Map(); // Suivi des objets par nom
        this.initialQuaternions = new Map(); // Sauvegarde des poses de repos
        this.initialPositions = new Map(); // Positions de repos pour la déformation
        this.vertexWeights = new Map(); // Weights pour le "Neural Skinning"
        this.taxelMeshes = new Map(); // Suivi des capteurs par sensorId
        
        // Initialisation pour la calibration (Tare)
        this.sensorConfigs = new Map();
        this.isCalibrating = false;
        this.calibrationBuffer = new Map(); // { sensorId: [values] }
        this.config = null; // Stockage de la config globale

        // Initialisation de l'interface de contrôle
        this.initUnifiedUI();
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

    initUnifiedUI() {
        const ui = document.createElement('div');
        ui.id = 'gneuro-control-panel';
        ui.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            width: 320px;
            max-height: calc(100vh - 40px);
            background: linear-gradient(135deg, rgba(5, 5, 5, 0.95) 0%, rgba(15, 25, 25, 0.9) 100%);
            border-left: 2px solid #00ffff;
            color: #e0f7f7;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            z-index: 1000;
            box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(10px);
            display: flex;
            flex-direction: column;
            border-radius: 4px 0 0 4px;
            overflow-y: auto;
        `;

        ui.innerHTML = `
            <!-- Header -->
            <div style="padding: 15px; background: rgba(0, 255, 255, 0.1); border-bottom: 1px solid #00ffff44; position: sticky; top: 0; z-index: 10;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #00ffff; font-weight: bold; letter-spacing: 2px;">G-NEURO // CORE</span>
                    <span id="status-tag" style="background: #00ff00; color: #000; padding: 2px 6px; font-size: 9px; border-radius: 2px; font-weight: bold;">ACTIVE</span>
                </div>
                <div id="ui-sys-info" style="font-size: 10px; margin-top: 5px; opacity: 0.7;">MODEL: INITIALIZING...</div>
            </div>

            <!-- Global Controls Section -->
            <div class="ui-group" style="padding: 15px; border-bottom: 1px solid #00ffff22;">
                <div style="color: #00ffff; font-size: 10px; margin-bottom: 10px; opacity: 0.5;">ENGINE PARAMETERS</div>
                
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 5px; font-size: 10px;">PRECISION MODE</label>
                    <select id="lod-select" style="width: 100%; background: #000; color: #00ffff; border: 1px solid #00ffff44; padding: 6px; font-size: 11px; outline: none;">
                        ${Object.keys(LOD_LEVELS).map(lvl => `<option value="${lvl}" ${lvl === this.quality ? 'selected' : ''}>${lvl.toUpperCase()}</option>`).join('')}
                    </select>
                </div>

                <div style="display: flex; justify-content: space-between; font-size: 10px;">
                    <span>SYSTEM VERSION</span>
                    <span id="ui-sys-ver" style="color: #00ffff;">-</span>
                </div>
            </div>

            <!-- Manual Controls Section (Adopted) -->
            <div id="ui-external-section" style="display: none; border-bottom: 1px solid #00ffff22; background: rgba(0, 255, 255, 0.02);">
                <div style="color: #00ffff; font-size: 10px; padding: 12px 15px 5px 15px; opacity: 0.5;">MANUAL OVERRIDE</div>
                <div id="ui-external-container" style="padding: 0 15px 12px 15px;"></div>
            </div>

            <!-- Diagnostic / Target Section -->
            <div id="ui-target-section" style="display: none; flex-grow: 1;">
                <div style="background: rgba(255, 0, 255, 0.05); padding: 15px; border-bottom: 1px solid #ff00ff44;">
                    <div style="color: #ff00ff; font-weight: bold; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                        <span style="width: 8px; height: 8px; background: #ff00ff; border-radius: 50%; box-shadow: 0 0 5px #ff00ff;"></span>
                        SUBSYSTEM DIAGNOSTIC
                    </div>
                    
                    <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 4px; border: 1px solid #ff00ff22;">
                        <div style="font-size: 14px; color: #ff00ff; margin-bottom: 10px;" id="target-name">ACTUATOR_ID</div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
                            <div style="opacity: 0.5;">GROUP:</div><div id="target-group" style="text-align: right;">-</div>
                            <div style="opacity: 0.5;">PARENT:</div><div id="target-parent" style="text-align: right;">-</div>
                            <div style="opacity: 0.5;">KINEMATICS:</div><div id="target-kin" style="text-align: right;">-</div>
                            <div style="opacity: 0.5;">LIMITS:</div><div id="target-limits" style="text-align: right; color: #00ffff;">-</div>
                            <div style="opacity: 0.5;">VELOCITY:</div><div id="target-speed" style="text-align: right; color: #00ffff;">-</div>
                        </div>
                    </div>

                    <button id="target-focus" style="margin-top: 15px; width: 100%; background: #ff00ff22; border: 1px solid #ff00ff; color: #ff00ff; padding: 8px; cursor: pointer; font-family: inherit; font-size: 10px; transition: all 0.2s;">
                        FOCUS ON COMPONENT
                    </button>
                </div>
            </div>

            <!-- Empty State / Placeholder -->
            <div id="ui-target-empty" style="padding: 40px 20px; text-align: center; color: #00ffff44; font-style: italic; font-size: 11px;">
                <div style="margin-bottom: 10px; font-size: 20px;">[ ! ]</div>
                AWAITING COMPONENT SELECTION...
            </div>

            <!-- Footer / Telemetry -->
            <div style="padding: 10px; font-size: 9px; opacity: 0.4; border-top: 1px solid #00ffff11; margin-top: auto;">
                NEURAL_LINK: STABLE // RENDER_LATENCY: <span id="ui-latency">16ms</span>
            </div>
        `;

        this.container.appendChild(ui);

        // Event Listeners
        ui.querySelector('#lod-select').addEventListener('change', (e) => this.setQuality(e.target.value));
        
        const focusBtn = ui.querySelector('#target-focus');
        focusBtn.addEventListener('mouseover', () => focusBtn.style.background = '#ff00ff44');
        focusBtn.addEventListener('mouseout', () => focusBtn.style.background = '#ff00ff22');
        focusBtn.addEventListener('click', () => {
            if (this.selectedObject) {
                const box = new THREE.Box3().setFromObject(this.selectedObject);
                const center = box.getCenter(new THREE.Vector3());
                this.controls.target.copy(center);
                this.controls.update();
            }
        });

        this.uiElements = {
            sysInfo: ui.querySelector('#ui-sys-info'),
            sysVer: ui.querySelector('#ui-sys-ver'),
            targetSection: ui.querySelector('#ui-target-section'),
            targetEmpty: ui.querySelector('#ui-target-empty'),
            targetName: ui.querySelector('#target-name'),
            targetGroup: ui.querySelector('#target-group'),
            targetParent: ui.querySelector('#target-parent'),
            targetKin: ui.querySelector('#target-kin'),
            targetLimits: ui.querySelector('#target-limits'),
            targetSpeed: ui.querySelector('#target-speed'),
            externalSection: ui.querySelector('#ui-external-section'),
            externalContainer: ui.querySelector('#ui-external-container')
        };
    }

    onPointerDown(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        this.clearHighlight();

        // Nouvelle méthode : Calcul de distance Rayon-Point pour capturer les articulations sans géométrie
        const actuatorData = this.findActuatorByProximity();

        if (actuatorData) {
            const currentNode = this.meshes.get(actuatorData.name);
            this.selectedObject = currentNode;
            this.applyHighlight(currentNode); 
            this.updateTargetUI(actuatorData.name);
            console.log(`[Viewer] Actuateur sélectionné par proximité : ${actuatorData.name}`);
        } else {
            this.clearSelection();
        }
    }

    /**
     * Méthode mathématique : Trouve l'actuateur le plus proche du rayon de la souris
     * même s'il n'a pas de géométrie (Bones/Empty).
     */
    findActuatorByProximity() {
        if (!this.config) return null;

        let closestActuator = null;
        let minDistance = 0.03; // Seuil de clic (en unités monde, ex: 3cm)
        const worldPos = new THREE.Vector3();

        this.config.actuators.forEach(act => {
            const node = this.meshes.get(act.name);
            if (!node) return;

            // Extraction de la position monde via la matrice de transformation
            node.getWorldPosition(worldPos);

            // Calcul de la distance entre la droite du Raycaster et le point pivot
            // dist = |(P - A) x u|  où P est le point, A l'origine du rayon, u le vecteur direction
            const dist = this.raycaster.ray.distanceSqToPoint(worldPos);

            if (dist < minDistance) {
                minDistance = dist;
                closestActuator = act;
            }
        });

        return closestActuator;
    }

    /**
     * Recherche l'actuateur associé à un objet 3D en gérant les suffixes
     * et la hiérarchie (Parenting) ou les influences de squelette.
     */
    findActuatorFromObject(obj, hitPoint = null) {
        if (!this.config) return null;

        // Cas spécifique des SkinnedMesh (FBX/GLB Riggés)
        // Si on clique sur la "peau", on cherche l'os le plus proche du clic
        if (obj.isSkinnedMesh && hitPoint) {
            let closestBone = null;
            let minDistance = Infinity;
            const worldPos = new THREE.Vector3();

            obj.skeleton.bones.forEach(bone => {
                bone.getWorldPosition(worldPos);
                const dist = worldPos.distanceTo(hitPoint);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestBone = bone;
                }
            });

            if (closestBone) {
                const boneMatch = this.matchNameWithConfig(closestBone.name);
                if (boneMatch) return boneMatch;
            }
        }
        
        let current = obj;
        while (current) {
            // 1. Vérification userData (le plus rapide)
            if (current.userData?.actuatorName) {
                return this.config.actuators.find(a => a.name === current.userData.actuatorName);
            }
            
            // 2. Vérification par nom (Flexible : accepte "Nom.001", "Nom_1", etc.)
            const match = this.matchNameWithConfig(current.name);
            if (match) return match;
            
            current = current.parent;
        }
        return null;
    }

    /**
     * Helper interne pour le matching de nom
     */
    matchNameWithConfig(name) {
        if (!name) return null;
        const normalize = (s) => s.toLowerCase().replace(/[._-\s]/g, '');
        const target = normalize(name);
        
        return this.config.actuators.find(a => {
            const actName = normalize(a.name);
            return target === actName || target.startsWith(actName + '0') || target.startsWith(actName + '_');
        });
    }

    applyHighlight(mesh) {
        if (!mesh.material) return;
        
        // Gestion multi-matériaux
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        
        materials.forEach(mat => {
            if (mat.emissive) {
                // Sauvegarde de l'état original si pas encore fait
                const key = `${mesh.uuid}_${mat.uuid}`;
                if (!this.originalMaterials.has(key)) {
                    this.originalMaterials.set(key, { 
                        emissive: mat.emissive.getHex(),
                        mesh: mesh 
                    });
                }
                mat.emissive.setHex(0x440044); // Violette G-NEURO
            }
        });
    }

    clearHighlight() {
        this.originalMaterials.forEach((data, key) => {
            const mesh = data.mesh;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach(mat => {
                if (mat.emissive) mat.emissive.setHex(data.emissive);
            });
        });
        this.originalMaterials.clear();
    }

    clearSelection() {
        this.selectedObject = null;
        this.uiElements.targetSection.style.display = 'none';
        this.uiElements.targetEmpty.style.display = 'block';
    }

    updateTargetUI(name) {
        if (!this.config) return;
        const actuator = this.config.actuators.find(a => a.name === name);
        if (!actuator) return;

        this.uiElements.targetSection.style.display = 'block';
        this.uiElements.targetEmpty.style.display = 'none';
        
        this.uiElements.targetName.innerText = actuator.name;
        this.uiElements.targetGroup.innerText = actuator.group || 'N/A';
        this.uiElements.targetParent.innerText = actuator.parent || 'N/A';
        this.uiElements.targetKin.innerText = `${actuator.kinematics?.type} ([${actuator.kinematics?.axis?.join(',')}])`;
        this.uiElements.targetLimits.innerText = `${actuator.config?.min}° / ${actuator.config?.max}°`;
        this.uiElements.targetSpeed.innerText = `${actuator.config?.speed} rad/s`;
    }

    async initRobot(config) {
        this.config = config;
        
        // Update System UI
        if (this.uiElements) {
            this.uiElements.sysInfo.innerText = `Model: ${config.metadata?.name || 'Unknown'}`;
            this.uiElements.sysVer.innerText = `Version: ${config.version || '1.0'}`;
        }

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

        // Integration du panneau de contrôle externe
        this.integrateExternalUI();
    }

    /**
     * Recherche le panneau #control-panel dans le document et l'insère 
     * dans l'interface unifiée de G-NEURO.
     */
    integrateExternalUI() {
        const external = document.getElementById('control-panel');
        if (external && this.uiElements.externalContainer) {
            this.uiElements.externalSection.style.display = 'block';
            this.uiElements.externalContainer.appendChild(external);
            
            // Normalisation des styles pour forcer l'intégration visuelle
            external.style.position = 'static';
            external.style.width = '100%';
            external.style.background = 'transparent';
            external.style.border = 'none';
            external.style.boxShadow = 'none';
            external.style.padding = '0';
            external.style.margin = '0';
            external.style.color = 'inherit';
        }
    }

    /**
     * Génère le robot à partir de primitives si aucun GLB n'est fourni
     */
    buildFromConfig(config) {
        const actuatorMap = new Map();

        // 1. Création de tous les maillons
        config.actuators.forEach(act => {
            let existingMesh = this.meshes.get(act.name);
            
            // Fallback : Si l'actuateur n'est pas dans le modèle 3D, on crée une sphère debug
            const primitiveData = act.primitive || { type: 'sphere', radius: 0.005, color: 0xff00ff };
            
            const mesh = this.createPrimitive(primitiveData);
            mesh.name = act.name;

            if (existingMesh) {
                console.log(`[Viewer] Overlay primitive sur mesh existant : ${act.name}`);
                // On rend la primitive semi-transparente pour voir à travers le modèle original
                mesh.material.opacity = 0.4;
                mesh.material.wireframe = true;
                existingMesh.add(mesh);
                return;
            }
            
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
                
                // Lien explicite pour le Raycaster sur les primitives ou mesh existants
                taxel.userData.actuatorName = act.name;
                
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
            
            // CRUCIAL : On ne re-parente QUE les primitives créées par le viewer.
            // Si le mesh vient du modèle FBX (Bone/Mesh), on respecte sa hiérarchie d'origine.
            if (!mesh || !mesh.userData.isPrimitive) return;

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

        const mesh = new THREE.Mesh();
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
                geometry = new THREE.SphereGeometry(data.radius || 0.02, sSeg, sSeg);
        }

        mesh.geometry = geometry;
        mesh.material = material;
        mesh.userData.isPrimitive = true; // Marqueur pour buildFromConfig
        
        return mesh;
    }

    /**
     * Met à jour les articulations du robot en temps réel
     * @param {Array} actuators Liste des instances RobotActuator de test.js
     */
    updateJoints(actuators) {
        if (!actuators) return;

        actuators.forEach(act => {
            const mesh = this.meshes.get(act.name);
            if (!mesh) {
                // Optionnel : décommenter pour débugger les noms
                // console.warn(`[Viewer] Noeud introuvable pour l'actuateur : ${act.name}`);
                return;
            }

            // Support des Bones (SkinnedMesh) ET des Nodes standards
            const target = mesh; 

            // Récupération de la config pour le clamping
            const actConfig = this.config?.actuators.find(a => a.name === act.name)?.config;
            let val = act.currentValue;
            if (actConfig) {
                val = Math.max(actConfig.min, Math.min(actConfig.max, val));
            }

            _v1.set(...act.kinematics.axis).normalize();
            const angleRad = val * (Math.PI / 180);
            _q1.setFromAxisAngle(_v1, angleRad);
            const initialQ = this.initialQuaternions.get(act.name) || new THREE.Quaternion();

            if (act.kinematics.type === 'revolute') {
                target.quaternion.copy(initialQ).multiply(_q1);
            } else if (act.kinematics.type === 'prismatic') {
                const dist = act.currentValue / 1000;
                target.position.set(...(act.offset || [0,0,0])).addScaledVector(_v1, dist);
            }
        });

        // Application du "Neural Bending" sur les maillages monolithiques
        this.applyNeuralDeformation(actuators);

        // Mise à jour globale efficace de la hiérarchie
        this.scene.updateMatrixWorld(true);
    }

    /**
     * Déformation dynamique des sommets pour les modèles non-riggés
     */
    applyNeuralDeformation(actuators) {
        this.meshes.forEach((mesh, name) => {
            // OPTIMISATION : On ignore les modèles déjà riggés (FBX/GLB avec os) 
            // et on limite aux maillages de taille raisonnable (< 5000 sommets)
            if (!mesh.isMesh || mesh.isSkinnedMesh || !this.vertexWeights.has(name)) return;
            
            const geometry = mesh.geometry;
            if (geometry.attributes.position.count > 5000) return; 

            const weights = this.vertexWeights.get(name);
            const positionAttr = geometry.attributes.position;
            const initialPos = this.initialPositions.get(name);

            const finalPos = new THREE.Vector3();
            
            // Sécurité : éviter l'inversion de matrice nulle
            const det = mesh.matrixWorld.determinant();
            if (Math.abs(det) < 0.000001) return;
            
            _m1.copy(mesh.matrixWorld).invert();

            for (let i = 0; i < positionAttr.count; i++) {
                finalPos.set(0, 0, 0);
                _tempPos.fromArray(initialPos, i * 3);
                
                // Passage en coordonnées monde pour calculer l'influence des joints
                _tempPos.applyMatrix4(mesh.matrixWorld);

                let totalWeight = 0;
                const vertexInfluence = weights[i]; // { jointName: weight }
                if (!vertexInfluence) continue;

                for (const [jointName, weight] of Object.entries(vertexInfluence)) {
                    const joint = this.meshes.get(jointName);
                    if (!joint) continue;

                    // On simule le mouvement du vertex comme s'il était attaché au joint
                    const localToJoint = _tempPos.clone().applyMatrix4(joint.matrixWorldInverse || _m1.copy(joint.matrixWorld).invert());
                    const movedPos = localToJoint.applyMatrix4(joint.matrixWorld);
                    
                    finalPos.addScaledVector(movedPos, weight);
                    totalWeight += weight;
                }

                if (totalWeight > 0) {
                    // Retour en coordonnées locales pour l'attribut de position
                    finalPos.applyMatrix4(_m1);
                    positionAttr.setXYZ(i, finalPos.x, finalPos.y, finalPos.z);
                }
            }
            positionAttr.needsUpdate = true;
            
            // CRUCIAL : Recalculer les volumes pour que le raycasting suive la déformation
            geometry.computeBoundingSphere();
            geometry.computeBoundingBox();
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
        if (this.skeletonHelper) this.scene.remove(this.skeletonHelper);
        this.skeletonHelper = new THREE.SkeletonHelper(model);
        this.scene.add(this.skeletonHelper);

        model.traverse(node => {
            if (node.name) {
                // Amélioration du mapping : on cherche si ce noeud correspond à un actuateur de la config
                const match = this.matchNameWithConfig(node.name);
                const actuatorKey = match ? match.name : node.name;

                // Priorité aux Bones : si on a déjà un Mesh mais qu'on trouve un Bone pour le même nom, on remplace
                const existing = this.meshes.get(actuatorKey);
                if (!existing || (!existing.isBone && node.isBone)) {
                    this.meshes.set(actuatorKey, node);
                    this.initialQuaternions.set(actuatorKey, node.quaternion.clone());
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