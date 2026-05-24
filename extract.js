import fs from 'fs';
import { NodeIO, Document } from '@gltf-transform/core';
import path from 'path';
import assimpjs from 'assimpjs';

/**
 * Utilitaires mathématiques minimaux pour le calcul des transformations relatives
 */
const Mat4 = {
    identity: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
    fromRT: (q, t) => {
        const out = Mat4.identity();
        const x = q[0], y = q[1], z = q[2], w = q[3];
        const x2 = x + x, y2 = y + y, z2 = z + z;
        const xx = x * x2, xy = x * y2, xz = x * z2;
        const yy = y * y2, yz = y * z2, zz = z * z2;
        const wx = w * x2, wy = w * y2, wz = w * z2;
        out[0] = 1 - (yy + zz); out[1] = xy + wz; out[2] = xz - wy;
        out[4] = xy - wz; out[5] = 1 - (xx + zz); out[6] = yz + wx;
        out[8] = xz + wy; out[9] = yz - wx; out[10] = 1 - (xx + yy);
        out[12] = t[0]; out[13] = t[1]; out[14] = t[2];
        return out;
    },
    multiply: (a, b) => {
        const out = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                out[i + j * 4] = a[i] * b[j * 4] + a[i + 4] * b[j * 4 + 1] + a[i + 8] * b[j * 4 + 2] + a[i + 12] * b[j * 4 + 3];
            }
        }
        return out;
    },
    invert: (a) => {
        const out = new Float32Array(16);
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
        const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
        const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
        const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
        let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
        if (!det) return null;
        det = 1.0 / det;
        out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
        out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
        out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
        out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
        out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
        out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
        out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
        out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
        return out;
    },
    getTranslation: (m) => [m[12], m[13], m[14]],
    getRotation: (m) => {
        let tr = m[0] + m[5] + m[10], S, q;
        if (tr > 0) { S = Math.sqrt(tr + 1.0) * 2; q = [(m[6] - m[9]) / S, (m[8] - m[2]) / S, (m[1] - m[4]) / S, 0.25 * S]; }
        else if ((m[0] > m[5])&&(m[0] > m[10])) { S = Math.sqrt(1.0 + m[0] - m[5] - m[10]) * 2; q = [0.25 * S, (m[1] + m[4]) / S, (m[8] + m[2]) / S, (m[6] - m[9]) / S]; }
        else if (m[5] > m[10]) { S = Math.sqrt(1.0 + m[5] - m[0] - m[10]) * 2; q = [(m[1] + m[4]) / S, 0.25 * S, (m[6] + m[9]) / S, (m[8] - m[2]) / S]; }
        else { S = Math.sqrt(1.0 + m[10] - m[0] - m[5]) * 2; q = [(m[8] + m[2]) / S, (m[6] + m[9]) / S, 0.25 * S, (m[1] - m[4]) / S]; }
        return q;
    }
};

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

    const processPotentialActuator = (node, name, translation, rotation, group, parentName = 'base') => {
        const varName = `state_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        variables[varName] = varCounter++;
        
        // Récupération des "Custom Properties" de Blender (extras dans glTF)
        const extras = node.getExtras() || {};
        
        actuators.push({
            name,
            group: extras.group || group,
            parent: parentName,
            offset: translation,
            rotationOffset: rotation,
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

    const actuatorWorldMatrices = new Map();
    actuatorWorldMatrices.set('base', Mat4.identity());

    const traverse = (node, parentName = 'base', parentWorldMatrix = Mat4.identity()) => {
        const name = node.getName() || `node_${node.getUUID().substr(0, 5)}`;
        const localMatrix = Mat4.fromRT(
            node.getRotation() || [0, 0, 0, 1],
            node.getTranslation() || [0, 0, 0]
        );
        const worldMatrix = Mat4.multiply(parentWorldMatrix, localMatrix);
        const mesh = node.getMesh();

        // 1. DÉTECTION CINÉMATIQUE (Rigging/FBX)
        // On inclut les Bones, mais on EXCLUT les racines structurelles (Armature, Root) 
        // pour éviter que l'ensemble du robot ne tourne dans le vide.
        let isActuator = (animatedNodes.has(node) || skinJoints.has(node) || /bone|joint/i.test(name))
                         && !/armature|root|scene|base_link/i.test(name);

        if (isActuator) {
            // Calcul de l'offset relatif au dernier actuateur parent
            const parentActuatorMatrix = actuatorWorldMatrices.get(parentName);
            const invParent = Mat4.invert(parentActuatorMatrix);
            const relativeMatrix = Mat4.multiply(invParent, worldMatrix);
            
            const relT = Mat4.getTranslation(relativeMatrix);
            const relR = Mat4.getRotation(relativeMatrix);

            processPotentialActuator(node, name, relT, relR, "articulation", parentName);
            actuatorWorldMatrices.set(name, worldMatrix);
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
                        processPotentialActuator(node, subName, centroid, [0,0,0,1], /wheel|roue|tire/i.test(name) ? "locomotion" : "articulation", name);
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
                            processPotentialActuator(node, name, translation, rotation, "articulation", parentName);
                            isActuator = true;
                        }
                    }
                }
                
                // 4. ANALYSE SÉMANTIQUE (Fallback final)
                if (!isActuator && (name.toLowerCase().includes("wheel") || name.toLowerCase().includes("arm"))) {
                    processPotentialActuator(node, name, translation, rotation, name.includes("wheel") ? "locomotion" : "articulation", parentName);
                }
            });
            }
        }

        node.listChildren().forEach(child => {
            // On passe toujours la worldMatrix actuelle, mais on ne change le parentName que si c'est un actuateur
            traverse(child, isActuator ? name : parentName, worldMatrix);
        });
    };
    // --- Génération du JSON ---
    
    // LANCEMENT DE L'ANALYSE
    document.getRoot().listScenes().forEach(scene => {
        scene.listChildren().forEach(node => traverse(node, 'base'));
    });

    // --- GÉNÉRATION DE SAMPLES D'ENTRAÎNEMENT ---
    const numVars = Object.keys(variables).length;
    const numActuators = actuators.length;

    const generateSample = (label, fingerValue) => {
        return {
            label: label,
            input: new Array(numVars).fill(0), // Simule les capteurs à 0
            output: actuators.map(a => {
                const n = a.name.toLowerCase();
                // Si c'est un doigt (phalange), on applique la valeur, sinon 0 (poignet/armature)
                if (n.includes('finger') || n.includes('thumb') || n.includes('palm') || n.includes('index') || n.includes('middle')) {
                    return fingerValue;
                }
                return 0;
            })
        };
    };

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
        training: { 
            examples: [
                generateSample("REPOS", 0),
                generateSample("MI-CLOS", 45),
                generateSample("POING_FERME", 90)
            ]
        }
    };

    fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
    console.log(`🚀 Extraction terminée : ${actuators.length} actuateurs détectés depuis ${inputPath}.`);
}

extractProactiveConfig('C:\\Dev\\robotic-awareness\\models\\Rigged Hand.fbx', './robot_config-imported.json').catch(console.error);