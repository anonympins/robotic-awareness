/**
 * G-NEURO : GLB Viewer Utility
 * Visualiseur léger pour les modèles robotiques (GLB/GLTF)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
        this.taxelMeshes = new Map(); // Suivi des capteurs par sensorId
    }

    /**
     * Tente de charger un GLB, sinon génère les primitives
     */
    async initRobot(config) {
        if (config.metadata && config.metadata.model_url) {
            this.loadModel(config.metadata.model_url);
        } else {
            console.log("[Viewer] Aucun modèle GLB spécifié, génération des primitives...");
            this.buildFromConfig(config);
        }
    }

    /**
     * Génère le robot à partir de primitives si aucun GLB n'est fourni
     */
    buildFromConfig(config) {
        const actuatorMap = new Map();

        // 1. Création de tous les maillons
        config.actuators.forEach(act => {
            if (!act.primitive) return;
            
            const mesh = this.createPrimitive(act.primitive);
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
                mesh.quaternion.setFromAxisAngle(axis, angleRad);
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
     * Met à jour la couleur des capteurs selon la pression reçue (0.0 à 1.0)
     */
    updateSensors(sensorValues) {
        for (const [id, value] of Object.entries(sensorValues)) {
            const taxel = this.taxelMeshes.get(id);
            if (taxel) {
                taxel.material.color.setRGB(value * 2, 0.1, 0.1); // Devient rouge vif sous pression
            }
        }
    }

    loadModel(url) {
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => {
            this.scene.add(gltf.scene);

            // Centrage automatique de la caméra sur le robot
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            this.controls.target.copy(center);
            const maxDim = Math.max(size.x, size.y, size.z);
            this.camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
            this.controls.update();
            
            console.log(`[Viewer] Modèle chargé : ${url}`);
        }, undefined, (error) => {
            console.error("[Viewer] Erreur de chargement GLB:", error);
        });
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