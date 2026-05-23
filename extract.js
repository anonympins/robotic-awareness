const fs = require('fs');
const { NodeIO } = require('@gltf-transform/core');
const path = require('path');

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
    const document = await io.read(inputPath);
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

    const processPotentialActuator = (name, translation, group, parentName = 'base') => {
        const varName = `state_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        variables[varName] = varCounter++;
        actuators.push({
            name,
            group,
            parent: parentName,
            offset: translation,
            kinematics: { type: 'revolute', axis: [1, 0, 0] },
            config: { min: -180, max: 180, speed: group === "locomotion" ? 2.0 : 1.0, proprioceptionRatio: 0.5 }
        });
    };

    const traverse = (node, parentName = 'base') => {
        const name = node.getName() || `node_${node.getUUID().substr(0, 5)}`;
        const translation = node.getTranslation() || [0, 0, 0];
        const mesh = node.getMesh();

        // 1. Détection Proactive (Anim/Rigging)
        let isActuator = animatedNodes.has(node) || skinJoints.has(node);

        if (isActuator) {
            processPotentialActuator(name, translation, "articulation", parentName);
        }
        // 2. Détection par Segmentation de Maillage (Fallbacks)
        else if (mesh) {
            const primitives = mesh.listPrimitives();
            primitives.forEach((prim, pIdx) => {
                const islands = segmentMonolithicMesh(prim);

                // Si on a plusieurs îlots dans une seule primitive, ce sont des actuateurs cachés !
                if (islands.length > 1) {
                    // On trie par taille : le plus gros est le châssis, les autres sont des actuateurs
                    islands.sort((a, b) => b.indices.length - a.indices.length);
                    const baseIsland = islands[0];

                    islands.slice(1).forEach((island, iIdx) => {
                        const centroid = [
                            (island.min[0] + island.max[0]) / 2,
                            (island.min[1] + island.max[1]) / 2,
                            (island.min[2] + island.max[2]) / 2
                        ];
                        const subName = `${name}_part_${pIdx}_${iIdx}`;
                        processPotentialActuator(subName, centroid, /wheel|roue|tire/i.test(name) ? "locomotion" : "articulation", name);
                    });
                } else if (node.getName().toLowerCase().includes("wheel") || node.getName().toLowerCase().includes("arm")) {
                    // Cas d'un noeud isolé identifié par son nom
                    processPotentialActuator(name, translation, name.includes("wheel") ? "locomotion" : "articulation", parentName);
                }
            });
        }

        node.listChildren().forEach(child => traverse(child, isActuator ? name : parentName));
    };

    root.listScenes()[0].listChildren().forEach(node => traverse(node));

    // --- Génération du JSON ---
    const config = {
        version: "1.2",
        metadata: { name: `Deep-Extracted-${path.basename(inputPath)}`, extracted_at: new Date().toISOString() },
        system_settings: { loop_frequency_hz: 50, ik_solver_type: "CCD" },
        variables,
        sensors: {},
        logic: { safety_ok: { type: "AND", args: [] }, behavior: {} },
        kinematics: Array.from(new Set(actuators.map(a => a.group))).reduce((acc, g) => { acc[g] = { states: [] }; return acc; }, {}),
        actuators,
        training: { examples: [] }
    };

    fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
    console.log(`🚀 Extraction terminée : ${actuators.length} actuateurs détectés.`);
}

extractProactiveConfig('./golf-car.glb', './robot_config-imported.json').catch(console.error);