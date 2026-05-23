import fs from 'fs';
import { NodeIO, Document } from '@gltf-transform/core';
import path from 'path';
import assimpjs from 'assimpjs';

/**
 * Chargeur Universel via Assimp (WASM)
 * Remplace les parseurs OBJ et FBX maison pour supporter le binaire et la topologie complexe.
 */
async function loadWithAssimp(filePath) {
    const ajs = await assimpjs();
    const fileData = fs.readFileSync(filePath);
    
    // Création de l'environnement virtuel pour Assimp
    const fileList = new ajs.FileList();
    fileList.AddFile(path.basename(filePath), new Uint8Array(fileData));

    // Correction API : ConvertList et non ConvertFileList
    const result = ajs.ConvertFileList(fileList, 'glb2');
    if (!result.IsSuccess() || result.FileCount() === 0) {
        throw new Error(`Assimp failure: ${result.GetErrorCode()}`);
    }

    const dir = path.dirname(filePath);
    let mainFilePath = path.join(dir, result.GetFile(0).GetPath());

    // Export all files (GLB + extracted textures/binaries) to disk.
    // This allows NodeIO to resolve external references which are common in FBX conversions.
    for (let i = 0; i < result.FileCount(); i++) {
        const file = result.GetFile(i);
        const outputPath = path.join(dir, file.GetPath());
        fs.writeFileSync(outputPath, file.GetContent());
        
        // Ensure we point to the main model file for loading
        if (file.GetPath().endsWith('.glb') || file.GetPath().endsWith('.gltf')) {
            mainFilePath = outputPath;
        }
    }

    const io = new NodeIO();
    // Use read(path) instead of readBinary(buffer) to enable external resource resolution
    return await io.read(mainFilePath);
}

/**
 * Détection de contact/proximité entre deux boîtes englobantes (AABB)
 */
function checkAABBContact(boxA, boxB, epsilon = 0.05) {
    return (boxA.min[0] <= boxB.max[0] + epsilon && boxA.max[0] >= boxB.min[0] - epsilon) &&
           (boxA.min[1] <= boxB.max[1] + epsilon && boxA.max[1] >= boxB.min[1] - epsilon) &&
           (boxA.min[2] <= boxB.max[2] + epsilon && boxA.max[2] >= boxB.min[2] - epsilon);
}

/**
 * Calcule l'AABB d'un noeud à partir de ses primitives
 */
function getNodeAABB(node) {
    const mesh = node.getMesh();
    if (!mesh) return null;
    const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    mesh.listPrimitives().forEach(prim => {
        const pos = prim.getAttribute('POSITION').getArray();
        const indices = prim.getIndices() ? prim.getIndices().getArray() : null;
        
        const processVertex = (idx) => {
            for (let a = 0; a < 3; a++) {
                const val = pos[idx * 3 + a];
                box.min[a] = Math.min(box.min[a], val);
                box.max[a] = Math.max(box.max[a], val);
            }
        };

        if (indices) {
            for (let i = 0; i < indices.length; i++) processVertex(indices[i]);
        } else {
            for (let i = 0; i < pos.length / 3; i++) processVertex(i);
        }
    });
    return box.min[0] === Infinity ? null : box;
}

/**
 * STRATÉGIE DE REPLI ULTIME : Segmentation Géométrique
 * Détecte les composants mobiles au sein d'un seul et même maillage fusionné.
 */
function segmentMonolithicMesh(primitive) {
    const indexAccessor = primitive.getIndices();
    if (!indexAccessor) return [];

    const indices = indexAccessor.getArray();
    const posAttr = primitive.getAttribute('POSITION');
    const vertexCount = posAttr.getCount();
    const positions = posAttr.getArray();

    // 1. Construction du graphe de connectivité (Adjacency List)
    const adj = Array.from({ length: vertexCount }, () => []);
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i+1], c = indices[i+2];
        adj[a].push(b, c);
        adj[b].push(a, c);
        adj[c].push(a, b);
    }

    // 2. BFS pour trouver les "îlots" de vertices (Components)
    const islands = [];
    const visited = new Uint8Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
        if (visited[i]) continue;
        const island = { indices: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        const stack = [i];
        visited[i] = 1;

        while (stack.length > 0) {
            const v = stack.pop();
            island.indices.push(v);

            // Update local AABB
            for(let axis=0; axis<3; axis++) {
                const val = positions[v * 3 + axis];
                if (val < island.min[axis]) island.min[axis] = val;
                if (val > island.max[axis]) island.max[axis] = val;
            }

            for (const neighbor of adj[v]) {
                if (!visited[neighbor]) {
                    visited[neighbor] = 1;
                    stack.push(neighbor);
                }
            }
        }
        islands.push(island);
    }
    return islands;
}

async function extractProactiveConfig(inputPath, outputPath) {
    const io = new NodeIO();
    let document;

    const ext = path.extname(inputPath).toLowerCase();
    
    // On utilise Assimp pour tout ce qui n'est pas déjà du glTF/GLB
    if (ext !== '.gltf' && ext !== '.glb') {
        console.log(`📦 Importation universelle via Assimp : ${inputPath}`);
        document = await loadWithAssimp(inputPath);
        
        // SAUVEGARDE PROACTIVE : On génère le GLB stabilisé
        const glbPath = inputPath.replace(ext, '.glb');
        const glbBinary = await io.writeBinary(document);
        fs.writeFileSync(glbPath, glbBinary);
        console.log(`🛡️  Modèle stabilisé et converti généré : ${glbPath}`);
    } else {
        document = await io.read(inputPath);
    }

    const root = document.getRoot();

    const animatedNodes = new Set();
    root.listAnimations().forEach(anim => {
        anim.listChannels().forEach(channel => {
            const target = channel.getTargetNode();
            if (target) animatedNodes.add(target);
        });
    });

    const skinJoints = new Set();
    root.listSkins().forEach(skin => {
        skin.listJoints().forEach(joint => skinJoints.add(joint));
    });

    let actuators = [];
    let variables = {};
    let varCounter = 0;

    const processPotentialActuator = (node, name, translation, group, parentName = 'base') => {
        const varName = `state_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        variables[varName] = varCounter++;
        
        // Récupération des "Custom Properties" de Blender (extras dans glTF)
        const extras = node.getExtras() || {};
        
        actuators.push({
            name,
            group: extras.group || group,
            parent: parentName,
            offset: translation,
            kinematics: { 
                type: extras.type || 'revolute', 
                axis: extras.axis || [1, 0, 0] 
            },
            config: { 
                min: extras.min !== undefined ? extras.min : -180, 
                max: extras.max !== undefined ? extras.max : 180, 
                speed: extras.speed || (group === "locomotion" ? 2.0 : 1.0), 
                proprioceptionRatio: extras.ratio || 0.5,
                calibration: {
                    offset: 0,
                    scale: 1,
                    deadzone: 0.02
                }
            }
        });
    };

    const traverse = (node, parentName = 'base') => {
        const name = node.getName() || `node_${node.getUUID().substr(0, 5)}`;
        const translation = node.getTranslation() || [0, 0, 0];
        const mesh = node.getMesh();

        // 1. DÉTECTION CINÉMATIQUE (Rigging/FBX)
        let isActuator = animatedNodes.has(node) || skinJoints.has(node);

        if (isActuator) {
            processPotentialActuator(node, name, translation, "articulation", parentName);
        }
        // 2. DÉTECTION PAR SEGMENTATION OU CONTACT
        else if (mesh) {
            const isSkinned = skinJoints.size > 0;
            const primitives = mesh.listPrimitives();
            if (!isSkinned) { // On ne segmente PAS si c'est un modèle déjà riggé (skinning)
                primitives.forEach((prim, pIdx) => {
                const islands = segmentMonolithicMesh(prim);
                
                // Si on a plusieurs îlots dans une seule primitive, ce sont des actuateurs cachés !
                if (islands.length > 1) {
                    // On trie par taille : le plus gros est le châssis, les autres sont des actuateurs
                    islands.sort((a, b) => b.indices.length - a.indices.length); // Momentum : la masse décide de la base
                    const baseIsland = islands[0];

                    islands.slice(1).forEach((island, iIdx) => {
                        const centroid = [
                            (island.min[0] + island.max[0]) / 2,
                            (island.min[1] + island.max[1]) / 2,
                            (island.min[2] + island.max[2]) / 2
                        ];
                        const subName = `${name}_momentum_${pIdx}_${iIdx}`;
                        processPotentialActuator(node, subName, centroid, /wheel|roue|tire/i.test(name) ? "locomotion" : "articulation", name);
                    });
                } 
                // 3. DÉTECTION PAR PROXIMITÉ (Jointures d'objets séparés)
                else if (parentName !== 'base') {
                    const myBox = getNodeAABB(node);
                    const parentNode = root.listNodes().find(n => n.getName() === parentName);
                    if (parentNode) {
                        const parentBox = getNodeAABB(parentNode);
                        if (parentBox && checkAABBContact(myBox, parentBox)) {
                            console.log(`🔗 Jointure par contact détectée entre ${parentName} et ${name}`);
                            processPotentialActuator(node, name, translation, "articulation", parentName);
                            isActuator = true;
                        }
                    }
                }
                
                // 4. ANALYSE SÉMANTIQUE (Fallback final)
                if (!isActuator && (name.toLowerCase().includes("wheel") || name.toLowerCase().includes("arm"))) {
                    processPotentialActuator(node, name, translation, name.includes("wheel") ? "locomotion" : "articulation", parentName);
                }
            });
            }
        }

        node.listChildren().forEach(child => {
            // Important : On transmet le nom du noeud actuel comme parent si c'est un actuateur
            traverse(child, isActuator ? name : parentName);
        });
    };
    // --- Génération du JSON ---
    
    // LANCEMENT DE L'ANALYSE
    document.getRoot().listScenes().forEach(scene => {
        scene.listChildren().forEach(node => traverse(node, 'base'));
    });

    const config = {
        version: "1.2",
        metadata: {
            name: `Deep-Extracted-${path.basename(inputPath)}`,
            extracted_at: new Date().toISOString(),
            model_url: `models/${path.basename(inputPath).replace(/\.[^/.]+$/, "")}.glb`
        },
        system_settings: { loop_frequency_hz: 50, ik_solver_type: "CCD" },
        variables,
        sensors: {},
        logic: { safety_ok: { type: "AND", args: [] }, behavior: {} },
        kinematics: Array.from(new Set(actuators.map(a => a.group))).reduce((acc, g) => { acc[g] = { states: [] }; return acc; }, {}),
        actuators,
        training: { examples: [] }
    };

    fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
    console.log(`🚀 Extraction terminée : ${actuators.length} actuateurs détectés depuis ${inputPath}.`);
}

extractProactiveConfig('C:\\Dev\\robotic-awareness\\models\\Rigged Hand.fbx', './robot_config-imported.json').catch(console.error);