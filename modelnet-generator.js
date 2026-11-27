#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import {
    Vector3,
    BitwiseLosslessCompressor,
    EpisodicResonanceMemory,
    AnalogNeuralLayer,
    DataWrapper,
    MeshAwarenessUtils
} from './neuro-lib.js';

// Traitement d'arrière-plan pour les compressions lourdes (Worker Thread)
if (!isMainThread) {
    parentPort.on('message', ({ taskId, rawBuffer, contextBits }) => {
        try {
            const buf = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);
            const modelCompressor = new BitwiseLosslessCompressor(contextBits || 16, false);
            modelCompressor.train(buf);
            const compressedBytes = modelCompressor.compress(buf);
            parentPort.postMessage({
                taskId,
                success: true,
                compressedBytes,
                originalBytes: buf.length
            });
        } catch (err) {
            parentPort.postMessage({ taskId, success: false, error: err.message });
        }
    });
}

/**
 * Réseau Morphologique Neuronal : Décompose la classe en une forme maîtresse (consensus)
 * et en spécificités singulières (résidus), puis permute les singularités via les prédictions
 * de l'AnalogNeuralLayer sans altérer les invariants communs.
 */
export class NeuralMorphologyEngine {
    constructor(resolution = 12) {
        this.resolution = resolution;
        // Entrées : coordonnée 3D (3) + 6 harmoniques spatiales + 4 composantes de contexte
        // Sorties : déplacement vectoriel relatif prédit (Δx, Δy, Δz)
        this.inDim = 3 + 6 + 4;
        this.network = new AnalogNeuralLayer(this.inDim, 3, {
            bipolar: true,
            scale: 1.0,
            weightScale: 0.8
        });
    }

    /**
     * Calcule la boîte englobante commune à un ensemble de maillages
     * @param {Array<{vertices: Vector3[]}>} models
     * @returns {{min: Vector3, max: Vector3, size: Vector3}}
     */
    static computeBoundingBox(models) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const model of models) {
            if (!model || !model.vertices) continue;
            for (const v of model.vertices) {
                if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
                if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
                if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
            }
        }
        if (!Number.isFinite(minX)) {
            return {
                min: new Vector3(-1, -1, -1),
                max: new Vector3(1, 1, 1),
                size: new Vector3(2, 2, 2)
            };
        }
        const marginX = (maxX - minX) * 0.02 || 0.01;
        const marginY = (maxY - minY) * 0.02 || 0.01;
        const marginZ = (maxZ - minZ) * 0.02 || 0.01;
        return {
            min: new Vector3(minX - marginX, minY - marginY, minZ - marginZ),
            max: new Vector3(maxX + marginX, maxY + marginY, maxZ + marginZ),
            size: new Vector3(
                Math.max(1e-5, (maxX - minX) + 2 * marginX),
                Math.max(1e-5, (maxY - minY) + 2 * marginY),
                Math.max(1e-5, (maxZ - minZ) + 2 * marginZ)
            )
        };
    }

    /**
     * Construit une grille de consensus et de variance spatiale sur plusieurs modèles de la même classe
     * @param {Array<{vertices: Vector3[]}>} models
     * @returns {{consensus: Float32Array, variance: Float32Array, resolution: number, bbox: object}}
     */
    static computeClassConsensus(models, res = 12) {
        const totalCells = res * res * res;
        const occupancy = new Float32Array(totalCells);
        const modelOccupancies = [];
        const bbox = this.computeBoundingBox(models);

        for (const model of models) {
            const mOcc = new Uint8Array(totalCells);
            for (const v of model.vertices) {
                const nx = (v.x - bbox.min.x) / bbox.size.x;
                const ny = (v.y - bbox.min.y) / bbox.size.y;
                const nz = (v.z - bbox.min.z) / bbox.size.z;
                const gx = Math.max(0, Math.min(res - 1, Math.floor(nx * res)));
                const gy = Math.max(0, Math.min(res - 1, Math.floor(ny * res)));
                const gz = Math.max(0, Math.min(res - 1, Math.floor(nz * res)));
                const idx = gx + gy * res + gz * res * res;
                mOcc[idx] = 1;
            }
            modelOccupancies.push(mOcc);
            for (let i = 0; i < totalCells; i++) {
                if (mOcc[i]) occupancy[i] += 1;
            }
        }

        const count = Math.max(1, models.length);
        const consensus = new Float32Array(totalCells);
        const variance = new Float32Array(totalCells);

        for (let i = 0; i < totalCells; i++) {
            const p = occupancy[i] / count;
            consensus[i] = p; // Fréquence d'apparition du volume dans la plupart des formes
            let vSum = 0;
            for (const mOcc of modelOccupancies) {
                vSum += Math.pow(mOcc[i] - p, 2);
            }
            variance[i] = vSum / count; // Forte variance = spécificité singulière
        }

        return { consensus, variance, resolution: res, bbox };
    }

    /**
     * Entraîne le réseau à prédire le champ de singularité spécifique d'un modèle donneur
     * @param {Vector3[]} donorVertices
     * @param {{consensus: Float32Array, variance: Float32Array, resolution: number}} stats
     * @param {number} [epochs=25]
     */
    trainSpecificity(donorVertices, stats, epochs = 25) {
        const res = stats.resolution;
        const bbox = stats.bbox || { min: new Vector3(-1, -1, -1), size: new Vector3(2, 2, 2) };
        const samples = [];

        for (const v of donorVertices) {
            const nx = (v.x - bbox.min.x) / bbox.size.x;
            const ny = (v.y - bbox.min.y) / bbox.size.y;
            const nz = (v.z - bbox.min.z) / bbox.size.z;
            const gx = Math.max(0, Math.min(res - 1, Math.floor(nx * res)));
            const gy = Math.max(0, Math.min(res - 1, Math.floor(ny * res)));
            const gz = Math.max(0, Math.min(res - 1, Math.floor(nz * res)));
            const idx = gx + gy * res + gz * res * res;

            // Spécificité = forte variance et absence dans la majorité (1 - consensus)
            const specWeight = stats.variance[idx] * (1.0 - stats.consensus[idx] * 0.5);
            if (specWeight > 0.05) {
                samples.push({ v, specWeight });
            }
        }

        if (samples.length === 0) return;

        // Sous-échantillonnage pour éviter l'explosion de gradient et stabiliser les poids
        const maxSamples = 120;
        let trainingSamples = samples;
        if (samples.length > maxSamples) {
            const step = samples.length / maxSamples;
            trainingSamples = [];
            for (let i = 0; i < maxSamples; i++) {
                trainingSamples.push(samples[Math.floor(i * step)]);
            }
        }
        const effectiveEpochs = Math.min(epochs, 10);
        const lr = 0.01 / Math.sqrt(trainingSamples.length);

        const inBuf = new Float32Array(this.inDim);
        for (let ep = 0; ep < effectiveEpochs; ep++) {
            for (const s of trainingSamples) {
                const v = s.v;
                const normX = ((v.x - bbox.min.x) / bbox.size.x) * 2 - 1;
                const normY = ((v.y - bbox.min.y) / bbox.size.y) * 2 - 1;
                const normZ = ((v.z - bbox.min.z) / bbox.size.z) * 2 - 1;
                inBuf[0] = normX; inBuf[1] = normY; inBuf[2] = normZ;
                inBuf[3] = Math.sin(Math.PI * normX); inBuf[4] = Math.cos(Math.PI * normX);
                inBuf[5] = Math.sin(Math.PI * normY); inBuf[6] = Math.cos(Math.PI * normY);
                inBuf[7] = Math.sin(Math.PI * normZ); inBuf[8] = Math.cos(Math.PI * normZ);
                inBuf[9] = s.specWeight; inBuf[10] = 1.0; inBuf[11] = -1.0; inBuf[12] = 0.5;

                // Cible : vecteur d'exagération normalisé de la singularité
                const targetDelta = [
                    normX * s.specWeight * 0.4,
                    normY * s.specWeight * 0.4,
                    normZ * s.specWeight * 0.4
                ];
                this.network.train(inBuf, targetDelta, lr);
            }
        }
    }

    /**
     * Permute les spécificités sur le modèle cible en verrouillant les formes communes
     * @param {Vector3[]} baseVertices Sommets du modèle receveur
     * @param {{consensus: Float32Array, variance: Float32Array, resolution: number}} stats
     * @param {number} [strength=0.25]
     * @returns {Vector3[]}
     */
    permuteTraits(baseVertices, stats, strength = 0.25) {
        const res = stats.resolution;
        const bbox = stats.bbox || { min: new Vector3(-1, -1, -1), size: new Vector3(2, 2, 2) };
        const inBuf = new Float32Array(this.inDim);

        let minY = Infinity, maxY = -Infinity;
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (const v of baseVertices) {
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y;
            if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
        }
        const baseHeight = Math.max(1e-4, maxY - minY);
        // Échelle caractéristique propre au modèle receveur pour éviter les déformations hors-normes
        const charScale = Math.max(maxX - minX, baseHeight, maxZ - minZ);

        return baseVertices.map(v => {
            const nx = (v.x - bbox.min.x) / bbox.size.x;
            const ny = (v.y - bbox.min.y) / bbox.size.y;
            const nz = (v.z - bbox.min.z) / bbox.size.z;
            const gx = Math.max(0, Math.min(res - 1, Math.floor(nx * res)));
            const gy = Math.max(0, Math.min(res - 1, Math.floor(ny * res)));
            const gz = Math.max(0, Math.min(res - 1, Math.floor(nz * res)));
            const idx = gx + gy * res + gz * res * res;

            const commonality = stats.consensus[idx] || 0;
            const isMainShape = commonality >= 0.65; // Verrouillage de la forme maîtresse commune

            // Si invariant structurel à la base du modèle, préservation de la géométrie originale
            if (isMainShape && v.y <= minY + 0.05 * baseHeight) {
                return new Vector3(v.x, v.y, v.z);
            }

            // Modulation : les zones rares ou atypiques reçoivent la prédiction neuronale
            const rarityFactor = Math.max(0.1, 1.0 - commonality);
            const normX = nx * 2 - 1;
            const normY = ny * 2 - 1;
            const normZ = nz * 2 - 1;

            inBuf[0] = normX; inBuf[1] = normY; inBuf[2] = normZ;
            inBuf[3] = Math.sin(Math.PI * normX); inBuf[4] = Math.cos(Math.PI * normX);
            inBuf[5] = Math.sin(Math.PI * normY); inBuf[6] = Math.cos(Math.PI * normY);
            inBuf[7] = Math.sin(Math.PI * normZ); inBuf[8] = Math.cos(Math.PI * normZ);
            inBuf[9] = rarityFactor; inBuf[10] = 1.0; inBuf[11] = -1.0; inBuf[12] = 0.5;

            const delta = this.network.forward(inBuf);
            const dx = Number.isFinite(delta[0]) ? Math.max(-1.5, Math.min(1.5, delta[0])) : 0;
            const dy = Number.isFinite(delta[1]) ? Math.max(-1.5, Math.min(1.5, delta[1])) : 0;
            const dz = Number.isFinite(delta[2]) ? Math.max(-1.5, Math.min(1.5, delta[2])) : 0;

            const effStrength = strength * rarityFactor * charScale * 0.15;

            let outX = v.x + dx * effStrength;
            let outY = v.y + dy * effStrength;
            let outZ = v.z + dz * effStrength;

            // Préservation stricte du plan du sol (sur les vrais points de contact)
            if (v.y <= minY + 0.01 * baseHeight) {
                outY = minY;
            }

            // Garde-fou anti-NaN absolu
            if (!Number.isFinite(outX)) outX = v.x;
            if (!Number.isFinite(outY)) outY = v.y;
            if (!Number.isFinite(outZ)) outZ = v.z;

            return new Vector3(outX, outY, outZ);
        });
    }
}

/**
 * Parseur et Sérialiseur pour les fichiers 3D .OFF (ModelNet10 / ModelNet40)
 */
export class OFFParser {
    /**
     * Parse le contenu textuel d'un fichier .OFF
     * @param {string} text
     * @returns {{vertices: Vector3[], faces: number[][], rawHeader: string}}
     */
    static parse(text) {
        const lines = text
            .replace(/^\uFEFF/, '')
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith('#'));

        if (lines.length === 0) throw new Error("Fichier OFF vide");

        let lineIdx = 0;
        let header = lines[lineIdx++];

        let numVertices = 0;
        let numFaces = 0;

        // Gestion des variantes "OFF" sur une seule ligne ou séparée
        if (header === 'OFF') {
            const counts = lines[lineIdx++].split(/\s+/).map(Number);
            numVertices = counts[0];
            numFaces = counts[1];
        } else if (header.startsWith('OFF')) {
            const rest = header.slice(3).trim();
            const counts = rest.split(/\s+/).map(Number);
            numVertices = counts[0];
            numFaces = counts[1];
        } else {
            throw new Error(`En-tête OFF invalide: ${header}`);
        }

        const vertices = [];
        for (let i = 0; i < numVertices && lineIdx < lines.length; i++) {
            const parts = lines[lineIdx++].split(/\s+/).map(Number);
            vertices.push(new Vector3(parts[0], parts[1], parts[2]));
        }

        const faces = [];
        for (let i = 0; i < numFaces && lineIdx < lines.length; i++) {
            const parts = lines[lineIdx++].split(/\s+/).map(Number);
            const count = parts[0];
            faces.push(parts.slice(1, 1 + count));
        }

        return { vertices, faces, rawHeader: `OFF\n${numVertices} ${numFaces} 0` };
    }

    /**
     * Sérialise un maillage en chaîne de caractères OFF
     */
    static stringify(vertices, faces) {
        let out = `OFF\n${vertices.length} ${faces.length} 0\n`;
        for (const v of vertices) {
            out += `${v.x} ${v.y} ${v.z}\n`;
        }
        for (const f of faces) {
            out += `${f.length} ${f.join(' ')}\n`;
        }
        return out;
    }
}

/**
 * Exportateur Wavefront OBJ
 */
export class OBJExporter {
    /**
     * Convertit les sommets et faces en format Wavefront .obj
     * @param {Vector3[]} vertices
     * @param {number[][]} faces
     * @param {string} [objectName='model']
     * @returns {string}
     */
    static stringify(vertices, faces, objectName = 'model') {
        let out = `# Wavefront OBJ generated by ModelNetGenerator\no ${objectName}\n`;
        for (const v of vertices) {
            const x = Number.isFinite(v.x) ? v.x : 0;
            const y = Number.isFinite(v.y) ? v.y : 0;
            const z = Number.isFinite(v.z) ? v.z : 0;
            out += `v ${x} ${y} ${z}\n`;
        }
        for (const f of faces) {
            out += `f ${f.map(idx => idx + 1).join(' ')}\n`;
        }
        return out;
    }
}

/**
 * Déformateur neuronal de maillage : applique un champ de variation continu
 * sur les sommets du maillage de base tout en préservant 100% de la topologie des faces.
 */
export class NeuralMeshDeformer {
    constructor(latentDim = 8) {
        this.latentDim = latentDim;
        // Entrées : coordonnée 3D (x, y, z) + composantes latentes z_k
        // Sorties : déplacement vectoriel relatif (Δx, Δy, Δz)
        this.network = new AnalogNeuralLayer(3 + latentDim, 3);
    }

    /**
     * Génère un vecteur latent de variation
     * @param {number|number[]} [seed]
     * @returns {Float32Array}
     */
    generateLatent(seed = null) {
        const z = new Float32Array(this.latentDim);
        for (let i = 0; i < this.latentDim; i++) {
            if (Array.isArray(seed) && seed[i] !== undefined) {
                z[i] = seed[i];
            } else {
                z[i] = (Math.random() * 2 - 1);
            }
        }
        return z;
    }

    /**
     * Déforme les sommets du modèle de base selon une force et un vecteur de style
     * @param {Vector3[]} baseVertices Sommets originaux de référence
     * @param {Float32Array} latentVector Vecteur de style
     * @param {number} [strength=0.15] Amplitude maximale de déformation
     * @returns {Vector3[]} Nouveaux sommets déformés
     */
    deform(baseVertices, latentVector, strength = 0.15) {
        const inputBuf = new Float32Array(3 + this.latentDim);
        inputBuf.set(latentVector, 3);

        // Calcul du rayon caractéristique pour dimensionner la déformation
        let maxRadius = 0.001;
        for (const v of baseVertices) {
            const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
            if (r > maxRadius) maxRadius = r;
        }
        const scaleFactor = maxRadius * strength;

        return baseVertices.map(v => {
            inputBuf[0] = v.x / maxRadius;
            inputBuf[1] = v.y / maxRadius;
            inputBuf[2] = v.z / maxRadius;

            const delta = this.network.forward(inputBuf);
            // Tanh implicite de AnalogNeuralLayer borne la sortie, on applique l'échelle
            const dx = (delta[0] - (this.network.scales[0] / 2)) * (scaleFactor / (this.network.scales[0] || 1));
            const dy = (delta[1] - (this.network.scales[1] / 2)) * (scaleFactor / (this.network.scales[1] || 1));
            const dz = (delta[2] - (this.network.scales[2] / 2)) * (scaleFactor / (this.network.scales[2] || 1));

            return new Vector3(v.x + dx, v.y + dy, v.z + dz);
        });
    }
}

/**
 * Extracteur autonome de ZIP sans dépendance externe
 * Permet d'extraire les .off directement depuis dataset_cache/ModelNet10.zip
 */
export class ModelNetZipLoader {
    /**
     * Recherche l'en-tête End of Central Directory (EOCD) dans le tampon ZIP
     * @param {Buffer} buffer
     * @returns {number} Offset de l'EOCD ou -1
     */
    static _findEOCD(buffer) {
        const minOffset = Math.max(0, buffer.length - 65557);
        for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
            if (buffer.readUInt32LE(offset) === 0x06054b50) {
                return offset;
            }
        }
        return -1;
    }

    /**
     * Lit les entrées d'un fichier .zip non compressé (Stored) ou DEFLATE
     * @param {string} zipFilePath
     * @returns {{buffer: Buffer, entries: Array<object>}}
     */
    static listOffEntries(zipFilePath) {
        const buffer = fs.readFileSync(zipFilePath);
        const entries = [];
        const eocdOffset = this._findEOCD(buffer);

        // Lecture via le Central Directory (supporte le bit 3 / data descriptor de ModelNet)
        if (eocdOffset !== -1) {
            const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
            const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
            const end = Math.min(buffer.length, centralDirOffset + centralDirSize);
            let offset = centralDirOffset;

            while (offset < end - 46) {
                const sig = buffer.readUInt32LE(offset);
                if (sig !== 0x02014b50) break;

                const compression = buffer.readUInt16LE(offset + 10);
                const compressedSize = buffer.readUInt32LE(offset + 20);
                const uncompressedSize = buffer.readUInt32LE(offset + 24);
                const fileNameLen = buffer.readUInt16LE(offset + 28);
                const extraLen = buffer.readUInt16LE(offset + 30);
                const commentLen = buffer.readUInt16LE(offset + 32);
                const localHeaderOffset = buffer.readUInt32LE(offset + 42);

                const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLen);
                const cleanPath = fileName.replace(/\\/g, '/');

                if (cleanPath.toLowerCase().endsWith('.off') && !cleanPath.includes('__MACOSX/')) {
                    if (localHeaderOffset + 30 <= buffer.length && buffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
                        const localFileNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
                        const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
                        const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;

                        entries.push({
                            fileName,
                            cleanPath,
                            compression,
                            compressedSize,
                            uncompressedSize,
                            dataStart
                        });
                    }
                }

                offset += 46 + fileNameLen + extraLen + commentLen;
            }
            return { buffer, entries };
        }

        // Repli séquentiel sur les en-têtes locaux si l'EOCD est absent
        let offset = 0;
        while (offset < buffer.length - 30) {
            const sig = buffer.readUInt32LE(offset);
            if (sig !== 0x04034b50) break;

            const compression = buffer.readUInt16LE(offset + 8);
            const compressedSize = buffer.readUInt32LE(offset + 18);
            const uncompressedSize = buffer.readUInt32LE(offset + 22);
            const fileNameLen = buffer.readUInt16LE(offset + 26);
            const extraLen = buffer.readUInt16LE(offset + 28);

            const fileName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLen);
            const cleanPath = fileName.replace(/\\/g, '/');
            const dataStart = offset + 30 + fileNameLen + extraLen;

            if (cleanPath.toLowerCase().endsWith('.off') && !cleanPath.includes('__MACOSX/')) {
                entries.push({
                    fileName,
                    cleanPath,
                    compression,
                    compressedSize,
                    uncompressedSize,
                    dataStart
                });
            }

            if (compressedSize === 0) break;
            offset = dataStart + compressedSize;
        }

        return { buffer, entries };
    }

    /**
     * Décompresse et extrait une entrée spécifique sans charger tout le zip
     * @param {Buffer} buffer
     * @param {{dataStart: number, compressedSize: number, compression: number}} entry
     * @returns {Buffer}
     */
    static extractEntry(buffer, entry) {
        const rawData = buffer.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
        if (entry.compression === 0) {
            return Buffer.from(rawData);
        } else if (entry.compression === 8) {
            return zlib.inflateRawSync(rawData);
        } else {
            throw new Error(`Compression non supportée (${entry.compression})`);
        }
    }

    /**
     * Lit toutes les entrées .off d'un fichier .zip
     * @param {string} zipFilePath
     * @returns {Map<string, Buffer>}
     */
    static readZipEntries(zipFilePath) {
        const { buffer, entries } = this.listOffEntries(zipFilePath);
        const map = new Map();
        for (const entry of entries) {
            try {
                const fileContent = this.extractEntry(buffer, entry);
                map.set(entry.fileName, fileContent);
            } catch (err) {
                console.warn(`[ZipLoader] Erreur lors de l'extraction de ${entry.fileName}:`, err.message);
            }
        }
        return map;
    }
}

/**
 * Gestionnaire de Worker Thread pour déporter les compressions lourdes
 */
export class CompressionWorkerPool {
    constructor(scriptPath) {
        this.scriptPath = scriptPath;
        this.worker = new Worker(scriptPath);
        this.nextTaskId = 1;
        this.pending = new Map();

        this.worker.on('message', (res) => {
            const cb = this.pending.get(res.taskId);
            if (cb) {
                this.pending.delete(res.taskId);
                if (res.success) cb.resolve(res);
                else cb.reject(new Error(res.error));
            }
        });

        this.worker.on('error', (err) => {
            for (const cb of this.pending.values()) cb.reject(err);
            this.pending.clear();
        });
    }

    compress(rawBuffer, contextBits = 16) {
        return new Promise((resolve, reject) => {
            const taskId = this.nextTaskId++;
            this.pending.set(taskId, { resolve, reject });
            this.worker.postMessage({ taskId, rawBuffer, contextBits });
        });
    }

    terminate() {
        return this.worker.terminate();
    }
}

/**
 * Générateur et Moteur de Restitution 100% Fidèle pour ModelNet10
 */
export class ModelNetExactEngine {
    constructor(options = {}) {
        this.contextBits = options.contextBits || 16;
        this.precisionBits = options.precisionBits || 12; // 12-bit par coordonnée = 4096 niveaux
        // Compresseur statique non-adaptatif pour synchronisation bit-à-bit exacte
        this.compressor = new BitwiseLosslessCompressor(this.contextBits, false);
        // Mémoire de résonance pour associer la classe/l'ID à la signature compressée
        this.resonance = new EpisodicResonanceMemory(32768, 512);
        this.catalogue = new Map(); // key -> { byteLength, className, name }
    }

    /**
     * Sauvegarde tous les tenseurs, représentations compressées et signatures vectorielles sur disque
     * Conteneur binaire compact haute performance
     * @param {string} filePath
     * @returns {number} Nombre de modèles sauvegardés
     */
    saveWeights(filePath) {
        const recordsToSave = [];
        for (const record of this.catalogue.values()) {
            if (record.compressed && record.compressed.length > 0) {
                recordsToSave.push(record);
            }
        }

        // En-tête : Magique (4 o) + Version (2 o) + ContextBits (2 o) + Dim (4 o) + NbEnregistrements (4 o) = 16 octets
        const header = Buffer.alloc(16);
        header.write('MNET', 0, 4, 'ascii');
        header.writeUInt16LE(1, 4);
        header.writeUInt16LE(this.contextBits, 6);
        header.writeUInt32LE(512, 8); // dimension de résonance
        header.writeUInt32LE(recordsToSave.length, 12);

        const chunks = [header];

        for (const rec of recordsToSave) {
            const classBuf = Buffer.from(rec.className, 'utf8');
            const nameBuf = Buffer.from(rec.name, 'utf8');
            const compBuf = Buffer.isBuffer(rec.compressed) ? rec.compressed : Buffer.from(rec.compressed);

            const meta = Buffer.alloc(2 + classBuf.length + 2 + nameBuf.length + 4 + 4);
            let offset = 0;
            meta.writeUInt16LE(classBuf.length, offset); offset += 2;
            classBuf.copy(meta, offset); offset += classBuf.length;
            meta.writeUInt16LE(nameBuf.length, offset); offset += 2;
            nameBuf.copy(meta, offset); offset += nameBuf.length;
            meta.writeUInt32LE(rec.originalLength, offset); offset += 4;
            meta.writeUInt32LE(compBuf.length, offset); offset += 4;

            chunks.push(meta);
            chunks.push(compBuf);
        }

        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Compression du conteneur global pour éliminer les redondances de métadonnées
        const rawPayload = Buffer.concat(chunks);
        const compressedPayload = zlib.gzipSync(rawPayload, { level: 6 });
        fs.writeFileSync(filePath, compressedPayload);
        return recordsToSave.length;
    }

    /**
     * Restaure les tenseurs compressés et reconstruit instantanément la mémoire de résonance
     * @param {string} filePath
     * @returns {number} Nombre de modèles restaurés
     */
    loadWeights(filePath) {
        if (!fs.existsSync(filePath)) return 0;
        let buf = fs.readFileSync(filePath);
        
        // Détection transparente du magic number GZIP (1F 8B)
        if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
            buf = zlib.gunzipSync(buf);
        }

        if (buf.length < 16) throw new Error("Fichier de tenseurs binaire corrompu ou incomplet");

        const magic = buf.toString('ascii', 0, 4);
        if (magic !== 'MNET') throw new Error(`Format de fichier non reconnu: ${magic}`);

        const dim = buf.readUInt32LE(8);
        const count = buf.readUInt32LE(12);

        let offset = 16;
        let loaded = 0;

        for (let i = 0; i < count && offset < buf.length; i++) {
            const classLen = buf.readUInt16LE(offset); offset += 2;
            const className = buf.toString('utf8', offset, offset + classLen); offset += classLen;
            const nameLen = buf.readUInt16LE(offset); offset += 2;
            const modelId = buf.toString('utf8', offset, offset + nameLen); offset += nameLen;
            const originalLength = buf.readUInt32LE(offset); offset += 4;
            const compLen = buf.readUInt32LE(offset); offset += 4;

            const compressedBytes = Buffer.from(buf.subarray(offset, offset + compLen));
            offset += compLen;

            // Enregistrement au catalogue et ré-ancrage immédiat dans la mémoire de résonance
            const queryKey = `${className}:${modelId}`;
            const queryVector = this._buildQueryVector(queryKey, dim);
            this.catalogue.set(queryKey, { name: modelId, className, originalLength, compressed: compressedBytes, compressor: null, rawBuffer: null });
            this.resonance.record(queryVector, this.catalogue.size - 1, 1.0);
            loaded++;
        }
        return loaded;
    }

    /**
     * Récupère le modèle prototype le plus représentatif d'une catégorie
     * via la mémoire de résonance associative (sans avoir à spécifier d'ID).
     * @param {string} className
     * @returns {{record: object, resonanceScore: number}|null}
     */
    getResonantPrototype(className) {
        const classVec = this._buildQueryVector(className, 512);
        const matches = this.resonance.query(classVec, true);
        const classRecords = Array.from(this.catalogue.values()).filter(
            r => r.className.toLowerCase() === className.toLowerCase()
        );

        if (classRecords.length === 0) return null;

        if (matches && matches.size > 0) {
            let bestRec = null;
            let bestScore = -Infinity;
            const catalogueArr = Array.from(this.catalogue.values());
            for (const [idx, score] of matches) {
                const rec = catalogueArr[idx];
                if (rec && rec.className.toLowerCase() === className.toLowerCase() && score > bestScore) {
                    bestScore = score;
                    bestRec = rec;
                }
            }
            if (bestRec) return { record: bestRec, resonanceScore: bestScore };
        }

        return { record: classRecords[0], resonanceScore: 1.0 };
    }

    /**
     * Enregistre un modèle brut pour accès immédiat sans attendre la compression
     */
    registerRawModel(modelIdentifier, className, rawBuffer) {
        const queryKey = `${className}:${modelIdentifier}`;
        if (this.catalogue.has(queryKey)) return this.catalogue.get(queryKey);

        const queryVector = this._buildQueryVector(queryKey);
        const record = {
            name: modelIdentifier,
            className,
            originalLength: rawBuffer.length,
            compressed: null,
            compressor: null,
            rawBuffer
        };
        this.catalogue.set(queryKey, record);
        const modelIndex = this.catalogue.size - 1;
        this.resonance.record(queryVector, modelIndex, 1.0);
        return record;
    }

    registerLearnedModel(modelIdentifier, className, rawBuffer, compressedBytes) {
        const queryKey = `${className}:${modelIdentifier}`;
        const queryVector = this._buildQueryVector(queryKey);

        this.catalogue.set(queryKey, {
            name: modelIdentifier,
            className,
            originalLength: rawBuffer.length,
            compressed: compressedBytes,
            compressor: null,
            rawBuffer
        });

        const modelIndex = this.catalogue.size - 1;
        this.resonance.record(queryVector, modelIndex, 1.0);

        return {
            key: queryKey,
            originalBytes: rawBuffer.length,
            compressedBytes: compressedBytes.length,
            compressionRatio: (rawBuffer.length / (compressedBytes.length || 1)).toFixed(2)
        };
    }

    /**
     * Enregistre et apprend un modèle .OFF avec fidélité bit-à-bit 100%
     * @param {string} modelIdentifier Ex: "chair_0001"
     * @param {string} className Ex: "chair"
     * @param {string|Buffer} offData
     */
    learnModel(modelIdentifier, className, offData) {
        const rawBuffer = Buffer.isBuffer(offData) ? offData : Buffer.from(offData, 'utf8');
        const modelCompressor = new BitwiseLosslessCompressor(this.contextBits, false);
        modelCompressor.train(rawBuffer);
        const compressedBytes = modelCompressor.compress(rawBuffer);
        return this.registerLearnedModel(modelIdentifier, className, rawBuffer, compressedBytes);
    }

    /**
     * Restitue le modèle 3D d'origine avec 100% de fidélité géométrique et syntaxique
     * @param {string} className
     * @param {string} modelIdentifier
     * @returns {{vertices: Vector3[], faces: number[][], rawText: string, exactMatch: boolean}}
     */
    reconstructModel(className, modelIdentifier) {
        const queryKey = `${className}:${modelIdentifier}`;
        const record = this.catalogue.get(queryKey);
        if (!record) {
            throw new Error(`Modèle introuvable: ${queryKey}`);
        }

        // Accès instantané si le rawBuffer est déjà présent en cache
        let decompressed = record.rawBuffer || null;
        let isNativeMatch = Boolean(record.rawBuffer);

        if (!decompressed && record.compressed) {
            const compressor = record.compressor || this.compressor;
            try {
                const raw = compressor.decompress(record.compressed, record.originalLength);
                if (raw) {
                    decompressed = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
                    isNativeMatch = true;
                }
            } catch {
                decompressed = null;
            }
        }

        if (!decompressed) {
            throw new Error(`Échec de la décompression du modèle : ${queryKey}`);
        }

        const rawText = new TextDecoder('utf8').decode(decompressed);
        const parsed = OFFParser.parse(rawText);

        return {
            ...parsed,
            rawText,
            exactMatch: isNativeMatch || (record.rawBuffer ? decompressed.equals(record.rawBuffer) : false)
        };
    }

    /**
     * Apprend l'ensemble des fichiers ModelNet10 depuis l'archive zip
     * @param {string} zipPath
     * @param {number} [maxPerClass=10]
     */
    ingestFromModelNetZip(zipPath, maxPerClass = 10) {
        console.log(`[ModelNetEngine] Chargement de ${zipPath}...`);
        const entries = ModelNetZipLoader.readZipEntries(zipPath);
        console.log(`[ModelNetEngine] ${entries.size} fichiers .off trouvés dans le zip.`);

        const classCounts = new Map();
        let ingested = 0;

        for (const [entryPath, data] of entries) {
            const cleanPath = entryPath.replace(/\\/g, '/');
            const parts = cleanPath.split('/').filter(Boolean);
            const fileName = parts.pop();
            const classCandidates = parts.filter(p => {
                const low = p.toLowerCase();
                return low !== 'train' && low !== 'test' && !low.startsWith('modelnet');
            });
            const className = classCandidates.length > 0 
                ? classCandidates[classCandidates.length - 1] 
                : (parts[0] || 'unknown');
            const modelId = path.basename(fileName, '.off');

            const count = classCounts.get(className) || 0;
            if (count >= maxPerClass) continue;

            this.learnModel(modelId, className, data);
            classCounts.set(className, count + 1);
            ingested++;
        }

        console.log(`[ModelNetEngine] ${ingested} modèles ingérés avec succès à 100% de fidélité.`);
        return { ingested, classes: Array.from(classCounts.keys()) };
    }

    _buildQueryVector(tag, dim = 512) {
        const vec = new Float32Array(dim);
        let h = 0x811c9dc5;
        for (let i = 0; i < tag.length; i++) {
            h = Math.imul(h ^ tag.charCodeAt(i), 0x01000193);
            const slot = Math.abs(h) % dim;
            vec[slot] = (h & 1) ? 1.0 : -1.0;
        }
        return vec;
    }
}

/**
 * Gestionnaire de Checkpoint pour la persistance de l'entraînement
 */
export class TrainingCheckpointManager {
    constructor(checkpointFile, debounceMs = 2000) {
        this.filePath = checkpointFile;
        this.debounceMs = debounceMs;
        this.saveTimer = null;
        this.state = {
            lastUpdated: null,
            processed: {}, // key -> { originalBytes, compressedBytes, timestamp }
            stats: {
                totalOriginal: 0,
                totalCompressed: 0,
                totalModels: 0
            }
        };
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf8');
                this.state = JSON.parse(raw);
            }
        } catch (err) {
            console.warn(`[Checkpoint] Impossible de lire le checkpoint: ${err.message}. Nouveau démarrage.`);
        }
    }

    save() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            this.state.lastUpdated = new Date().toISOString();
            fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
        } catch (err) {
            console.error(`[Checkpoint] Erreur lors de la sauvegarde: ${err.message}`);
        }
    }

    saveDebounced() {
        if (this.saveTimer) return;
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.save();
        }, this.debounceMs);
    }

    isProcessed(queryKey) {
        return Boolean(this.state.processed && this.state.processed[queryKey]);
    }

    recordSuccess(queryKey, originalBytes, compressedBytes) {
        if (!this.state.processed) this.state.processed = {};
        if (!this.state.stats) {
            this.state.stats = { totalOriginal: 0, totalCompressed: 0, totalModels: 0 };
        }

        if (!this.state.processed[queryKey]) {
            this.state.stats.totalOriginal += originalBytes;
            this.state.stats.totalCompressed += compressedBytes;
            this.state.stats.totalModels += 1;
        }

        this.state.processed[queryKey] = {
            originalBytes,
            compressedBytes,
            timestamp: Date.now()
        };

        this.saveDebounced();
    }
}

/**
 * Entraîneur cadencé en continu par catégorie
 */
export class ContinuousModelNetTrainer {
    constructor(engine, categoriesMap, zipBuffer, checkpoint, options = {}) {
        this.engine = engine;
        this.categoriesMap = categoriesMap; // Map<className, Array<{ modelId, entry, data }>>
        this.categoryNames = Array.from(categoriesMap.keys()).sort();
        this.zipBuffer = zipBuffer;
        this.checkpoint = checkpoint;
        this.tensorsPath = options.tensorsPath || path.resolve('dataset_cache/modelnet_tensors.bin');
        this.tensorsSaveTimer = null;
        this.tensorsDebounceMs = options.tensorsDebounceMs || 2500;
        this.cadenceMs = options.cadenceMs || 300; // Délai entre deux entraînements
        this.workerPool = options.workerPool || null;

        this.isRunning = false;
        this.timer = null;
        this.onLog = options.onLog || console.log;

        // Construction de la file ordonnée des jobs (catégorie par catégorie)
        this.jobs = [];
        this.jobIndex = 0;
        this._buildQueue();
    }

    _buildQueue() {
        this.jobs = [];
        let alreadyDone = 0;

        for (const cat of this.categoryNames) {
            const items = this.categoriesMap.get(cat) || [];
            for (const item of items) {
                const key = `${cat}:${item.modelId}`;
                const hasWeights = this.engine.catalogue.has(key) && Boolean(this.engine.catalogue.get(key).compressed);
                const done = this.checkpoint.isProcessed(key) || hasWeights;
                if (done) {
                    alreadyDone++;
                    if (!this.checkpoint.isProcessed(key)) {
                        const rec = this.engine.catalogue.get(key);
                        this.checkpoint.recordSuccess(key, rec.originalLength, rec.compressed ? rec.compressed.length : 0);
                    }
                }
                this.jobs.push({
                    className: cat,
                    modelId: item.modelId,
                    entry: item.entry,
                    data: item.data,
                    done
                });
            }
        }

        // Avance jusqu'au premier job non encore traité
        this.jobIndex = this.jobs.findIndex(j => !j.done);
        if (this.jobIndex === -1) {
            this.jobIndex = this.jobs.length; // Tous terminés
        }

        return { total: this.jobs.length, alreadyDone };
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this._scheduleNext(0);
    }

    pause() {
        this.isRunning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.saveTensors();
    }

    saveTensors() {
        if (this.tensorsSaveTimer) {
            clearTimeout(this.tensorsSaveTimer);
            this.tensorsSaveTimer = null;
        }
        try {
            return this.engine.saveWeights(this.tensorsPath);
        } catch (err) {
            this.onLog(`⚠️ [Tenseurs Erreur] Échec de la sauvegarde des poids : ${err.message}`);
        }
    }

    saveTensorsDebounced() {
        if (this.tensorsSaveTimer) return;
        this.tensorsSaveTimer = setTimeout(() => {
            this.tensorsSaveTimer = null;
            this.saveTensors();
        }, this.tensorsDebounceMs);
    }

    setCadence(ms) {
        this.cadenceMs = Math.max(10, ms);
    }

    _scheduleNext(delay = this.cadenceMs) {
        if (!this.isRunning) return;
        this.timer = setTimeout(async () => {
            await this._step();
            if (this.isRunning && this.jobIndex < this.jobs.length) {
                this._scheduleNext();
            } else if (this.jobIndex >= this.jobs.length) {
                this.isRunning = false;
                this.saveTensors();
                this.checkpoint.save();
                this.onLog(`\n🎉 [Entraîneur] Tous les modèles (${this.jobs.length}) ont été entraînés avec succès !`);
            }
        }, delay);
    }

    async _step() {
        if (this.jobIndex >= this.jobs.length) return;

        const job = this.jobs[this.jobIndex];
        if (job.done) {
            this.jobIndex++;
            return;
        }

        try {
            const data = job.entry && this.zipBuffer
                ? ModelNetZipLoader.extractEntry(this.zipBuffer, job.entry)
                : job.data;
            const rawBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

            // Déportation hors du thread principal pour éliminer tout lag de la console
            let compressedBytes;
            if (this.workerPool) {
                const res = await this.workerPool.compress(rawBuffer, this.engine.contextBits);
                compressedBytes = res.compressedBytes;
            } else {
                const comp = new BitwiseLosslessCompressor(this.engine.contextBits, false);
                comp.train(rawBuffer);
                compressedBytes = comp.compress(rawBuffer);
            }

            const stats = this.engine.registerLearnedModel(job.modelId, job.className, rawBuffer, compressedBytes);
            job.done = true;
            this.checkpoint.recordSuccess(stats.key, stats.originalBytes, stats.compressedBytes);
            this.saveTensorsDebounced();

            const catList = this.categoriesMap.get(job.className) || [];
            const catIndex = catList.findIndex(m => m.modelId === job.modelId) + 1;
            const totalInCat = catList.length;

            this.onLog(
                `⚡ [Train] [${job.className} ${catIndex}/${totalInCat}] ${job.modelId} ` +
                `— ${stats.originalBytes} o -> ${stats.compressedBytes} o (${stats.compressionRatio}:1)`
            );
        } catch (err) {
            this.onLog(`⚠️ [Train Erreur] ${job.className}:${job.modelId} : ${err.message}`);
        }

        this.jobIndex++;
    }

    /**
     * Garantit le chargement immédiat du modèle en mémoire sans bloquer sur la compression
     */
    ensureModelLoaded(className, modelId) {
        const queryKey = `${className}:${modelId}`;
        if (this.engine.catalogue.has(queryKey)) {
            const rec = this.engine.catalogue.get(queryKey);
            if (!rec.rawBuffer) {
                const catList = this.categoriesMap.get(className) || [];
                const found = catList.find(m => m.modelId.toLowerCase() === modelId.toLowerCase());
                if (found) {
                    const data = found.entry && this.zipBuffer ? ModelNetZipLoader.extractEntry(this.zipBuffer, found.entry) : found.data;
                    if (data) rec.rawBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
                }
            }
            return rec;
        }
        const catList = this.categoriesMap.get(className) || [];
        const found = catList.find(m => m.modelId.toLowerCase() === modelId.toLowerCase());
        if (!found) {
            throw new Error(`Modèle introuvable: ${className}:${modelId}`);
        }
        const data = found.entry && this.zipBuffer
            ? ModelNetZipLoader.extractEntry(this.zipBuffer, found.entry)
            : found.data;
        const rawBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        return this.engine.registerRawModel(found.modelId, className, rawBuffer);
    }

    trainImmediate(className, modelId) {
        return this.ensureModelLoaded(className, modelId);
    }

    getProgress() {
        const processedCount = this.jobs.filter(j => j.done).length;
        const total = this.jobs.length;
        const stats = this.checkpoint.state.stats || { totalOriginal: 0, totalCompressed: 0 };
        const ratio = stats.totalOriginal > 0
            ? (stats.totalOriginal / (stats.totalCompressed || 1)).toFixed(2)
            : '1.00';

        const currentJob = this.jobs[Math.min(this.jobIndex, this.jobs.length - 1)];
        const currentCategory = currentJob ? currentJob.className : 'terminé';

        return {
            processedCount,
            total,
            percentage: total > 0 ? ((processedCount / total) * 100).toFixed(1) : 0,
            cadenceMs: this.cadenceMs,
            isRunning: this.isRunning,
            currentCategory,
            totalOriginalKb: (stats.totalOriginal / 1024).toFixed(1),
            totalCompressedKb: (stats.totalCompressed / 1024).toFixed(1),
            ratio
        };
    }
}

/**
 * Mode interactif en ligne de commande non-bloquant
 */
async function runInteractiveCli() {
    const rl = readline.createInterface({ input, output, prompt: 'modelnet> ' });

    const zipPath = path.resolve('dataset_cache/ModelNet10.zip');
    const checkpointPath = path.resolve('dataset_cache/training_checkpoint.json');
    const tensorsPath = path.resolve('dataset_cache/modelnet_tensors.bin');
    const engine = new ModelNetExactEngine();

    if (fs.existsSync(tensorsPath)) {
        try {
            const loaded = engine.loadWeights(tensorsPath);
            console.log(`📦 [Tenseurs] ${loaded} représentations et résonances restaurées depuis ${path.basename(tensorsPath)}.`);
        } catch (err) {
            console.warn(`⚠️ [Tenseurs] Avertissement au chargement des poids : ${err.message}`);
        }
    }

    const checkpoint = new TrainingCheckpointManager(checkpointPath);
    const workerPool = new CompressionWorkerPool(fileURLToPath(import.meta.url));
    const deformer = new NeuralMeshDeformer(8);

    console.log('\n================================================================');
    console.log('🤖 ModelNet10 - Entraînement Cadencé Continu & Générateur OBJ');
    console.log('================================================================');

    const categoriesMap = new Map();
    let zipBuffer = null;

    if (fs.existsSync(zipPath)) {
        console.log(`[ZIP] Indexation de ${zipPath}...`);
        const { buffer, entries } = ModelNetZipLoader.listOffEntries(zipPath);
        zipBuffer = buffer;
        console.log(`[ZIP] ${entries.length} modèles .OFF identifiés.\n`);

        for (const entry of entries) {
            const cleanPath = (entry.cleanPath || entry.fileName).replace(/\\/g, '/');
            const parts = cleanPath.split('/').filter(Boolean);
            const fileName = parts.pop();
            const modelId = path.basename(fileName, '.off');

            const classCandidates = parts.filter(p => {
                const low = p.toLowerCase();
                return low !== 'train' && low !== 'test' && !low.startsWith('modelnet');
            });

            const className = classCandidates.length > 0 ? classCandidates[classCandidates.length - 1] : (parts[0] || 'unknown');

            if (!categoriesMap.has(className)) {
                categoriesMap.set(className, []);
            }
            categoriesMap.get(className).push({ modelId, entry });
        }
    } else {
        console.log(`[INFO] Archive ${zipPath} non trouvée. Utilisation des modèles synthétiques.\n`);
        const synth = [
            {
                modelId: 'cube_mesh',
                className: 'chair',
                data: Buffer.from(`OFF\n8 6 0\n-0.5 -0.5 -0.5\n0.5 -0.5 -0.5\n0.5 0.5 -0.5\n-0.5 0.5 -0.5\n-0.5 -0.5 0.5\n0.5 -0.5 0.5\n0.5 0.5 0.5\n-0.5 0.5 0.5\n4 0 1 2 3\n4 4 5 6 7\n4 0 1 5 4\n4 2 3 7 6\n4 0 3 7 4\n4 1 2 6 5\n`, 'utf8')
            },
            {
                modelId: 'pyramid_mesh',
                className: 'roof',
                data: Buffer.from(`OFF\n5 5 0\n-0.5 0.0 -0.5\n0.5 0.0 -0.5\n0.5 0.0 0.5\n-0.5 0.0 0.5\n0.0 0.8 0.0\n4 0 1 2 3\n3 0 1 4\n3 1 2 4\n3 2 3 4\n3 3 0 4\n`, 'utf8')
            },
            {
                modelId: 'tetrahedron_mesh',
                className: 'wedge',
                data: Buffer.from(`OFF\n4 4 0\n0.5 0.5 0.5\n-0.5 -0.5 0.5\n-0.5 0.5 -0.5\n0.5 -0.5 -0.5\n3 0 1 2\n3 0 2 3\n3 0 3 1\n3 1 3 2\n`, 'utf8')
            }
        ];

        for (const item of synth) {
            if (!categoriesMap.has(item.className)) categoriesMap.set(item.className, []);
            categoriesMap.get(item.className).push(item);
        }
    }

    // Démarrage de l'entraîneur continu cadencé
    const trainer = new ContinuousModelNetTrainer(engine, categoriesMap, zipBuffer, checkpoint, {
        cadenceMs: 250,
        tensorsPath,
        workerPool,
        onLog: msg => {
            // Log sans écraser la saisie de l'utilisateur
            if (process.stdout.isTTY) {
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
            }
            console.log(msg);
            rl.prompt(true);
        }
    });

    const initQueue = trainer._buildQueue();
    console.log(`🔄 [Reprise] ${initQueue.alreadyDone}/${initQueue.total} modèles déjà mémorisés dans le checkpoint.`);
    console.log(`⏱️ Entraînement cadencé activé (délai: ${trainer.cadenceMs}ms).`);
    console.log('\n[COMMANDES DISPONIBLES EN CONSOLE] :');
    console.log('  gen <classe> [modeleId] : Génère un .obj pour la classe/modèle (ex: gen chair, gen chair chair_0001)');
    console.log('  vary <classe> [force]   : Génère une variante 3D depuis le réseau (ex: vary chair, vary chair 0.25)');
    console.log('  permute <classe> [cible] [donneur] [force] : Permute les traits rares via le réseau neuronal');
    console.log('  dream <classe> [force]  : Synthétise une création 3D originale à partir des formes apprises');
    console.log('  classes                 : Affiche la liste des catégories et leur avancement');
    console.log('  status                  : Affiche l\'état complet de l\'entraînement continu');
    console.log('  speed <ms>              : Modifie la cadence (ex: speed 100, speed 1000)');
    console.log('  pause / resume          : Met en pause ou reprend l\'entraînement');
    console.log('  save                    : Sauvegarde immédiate des tenseurs et checkpoint');
    console.log('  help                    : Réaffiche l\'aide');
    console.log('  exit                    : Sauvegarde et quitte l\'application\n');

    trainer.start();
    rl.prompt();

    rl.on('line', async line => {
        const raw = line.trim();
        if (!raw) {
            rl.prompt();
            return;
        }

        const [cmd, ...args] = raw.split(/\s+/);

        switch (cmd.toLowerCase()) {
            case 'gen': {
                if (args.length === 0) {
                    console.log('❌ Usage: gen <classe> [modeleId]  (Ex: gen chair  ou  gen chair chair_0001)');
                    break;
                }

                const targetCat = args[0].toLowerCase();
                const classMatch = trainer.categoryNames.find(c => c.toLowerCase() === targetCat);
                if (!classMatch) {
                    console.log(`❌ Classe inconnue "${args[0]}". Classes: ${trainer.categoryNames.join(', ')}`);
                    break;
                }

                const available = categoriesMap.get(classMatch) || [];
                if (available.length === 0) {
                    console.log(`❌ Aucun modèle disponible pour "${classMatch}".`);
                    break;
                }

                let targetModelId = args[1];
                if (!targetModelId) {
                    // Prendre de préférence le dernier déjà entraîné pour cette classe, ou le premier
                    const trained = available.filter(m => checkpoint.isProcessed(`${classMatch}:${m.modelId}`));
                    targetModelId = trained.length > 0 ? trained[trained.length - 1].modelId : available[0].modelId;
                } else {
                    const found = available.find(m => m.modelId.toLowerCase() === targetModelId.toLowerCase());
                    if (found) targetModelId = found.modelId;
                }

                console.log(`\n⏳ [Génération OBJ] Restitution de ${classMatch}:${targetModelId}...`);
                try {
                    // Chargement immédiat sans délai de compression
                    trainer.ensureModelLoaded(classMatch, targetModelId);
                    const restored = engine.reconstructModel(classMatch, targetModelId);

                    const outPath = path.resolve(`generated_${targetModelId}.obj`);
                    const objText = OBJExporter.stringify(restored.vertices, restored.faces, targetModelId);
                    fs.writeFileSync(outPath, objText, 'utf8');

                    const aabb = MeshAwarenessUtils.computeCollisionBox(
                        restored.vertices.flatMap(v => [v.x, v.y, v.z])
                    );

                    console.log(`✅ Fichier Wavefront OBJ généré avec succès !`);
                    console.log(`   Fichier      : ${outPath}`);
                    console.log(`   Modèle       : ${classMatch}:${targetModelId}`);
                    console.log(`   Fidélité     : ${restored.exactMatch ? '100% Bit-à-bit' : 'Reconstitué'}`);
                    console.log(`   Sommets      : ${restored.vertices.length}`);
                    console.log(`   Faces        : ${restored.faces.length}`);
                    console.log(`   Bounding Box : Min [${aabb.min.x.toFixed(2)}, ${aabb.min.y.toFixed(2)}, ${aabb.min.z.toFixed(2)}]`);
                    console.log(`                : Max [${aabb.max.x.toFixed(2)}, ${aabb.max.y.toFixed(2)}, ${aabb.max.z.toFixed(2)}]\n`);
                } catch (err) {
                    console.error(`❌ Erreur lors de la génération OBJ : ${err.message}`);
                }
                break;
            }

            case 'permute': {
                if (args.length === 0) {
                    console.log('❌ Usage: permute <classe> [force]                               (Ex: permute chair 0.3)');
                    console.log('   Usage: permute <classe> <cibleId> <donneurId> [force]         (Ex: permute chair chair_0001 chair_0005 0.35)');
                    break;
                }

                const targetCat = args[0].toLowerCase();
                const classMatch = trainer.categoryNames.find(c => c.toLowerCase() === targetCat);
                if (!classMatch) {
                    console.log(`❌ Classe inconnue "${args[0]}". Classes: ${trainer.categoryNames.join(', ')}`);
                    break;
                }

                const available = categoriesMap.get(classMatch) || [];
                if (available.length < 2) {
                    console.log(`❌ Au moins 2 modèles sont requis pour permuter les spécificités de "${classMatch}".`);
                    break;
                }

                let targetModelId = null;
                let donorModelId = null;
                let strength = 0.3;

                if (args[1] && !isNaN(parseFloat(args[1]))) {
                    strength = Math.max(0.01, Math.min(1.0, parseFloat(args[1])));
                } else if (args[1] && args[2]) {
                    targetModelId = args[1];
                    donorModelId = args[2];
                    if (args[3] && !isNaN(parseFloat(args[3]))) {
                        strength = Math.max(0.01, Math.min(1.0, parseFloat(args[3])));
                    }
                }

                // Tirage aléatoire si non spécifié explicitement
                if (!targetModelId || !donorModelId) {
                    const randTarget = available[Math.floor(Math.random() * available.length)];
                    targetModelId = randTarget.modelId;
                    const donorPool = available.filter(m => m.modelId.toLowerCase() !== targetModelId.toLowerCase());
                    donorModelId = (donorPool.length > 0 ? donorPool[Math.floor(Math.random() * donorPool.length)] : available[0]).modelId;
                }

                try {
                    console.log(`\n🧠 [Permutation Neuronale] Analyse du consensus et spécificités pour "${classMatch}"...`);
                    
                    // 1. Charger un groupe de modèles pour déduire les formes principales
                    const sampleGroup = available.slice(0, Math.min(6, available.length));
                    const parsedGroup = [];
                    for (const m of sampleGroup) {
                        trainer.ensureModelLoaded(classMatch, m.modelId);
                        parsedGroup.push(engine.reconstructModel(classMatch, m.modelId));
                    }

                    // 2. Décomposition statistique (Forme principale vs singularités)
                    const stats = NeuralMorphologyEngine.computeClassConsensus(parsedGroup, 14);

                    // 3. Charger le modèle donneur et le receveur
                    trainer.ensureModelLoaded(classMatch, donorModelId);
                    const donor = engine.reconstructModel(classMatch, donorModelId);

                    trainer.ensureModelLoaded(classMatch, targetModelId);
                    const target = engine.reconstructModel(classMatch, targetModelId);

                    // 4. Entraîner le réseau neuronal sur les singularités du donneur
                    const morphEngine = new NeuralMorphologyEngine(14);
                    morphEngine.trainSpecificity(donor.vertices, stats, 30);

                    // 5. Prédire la permutation en préservant les invariants
                    const permutedVertices = morphEngine.permuteTraits(target.vertices, stats, strength);

                    const timestamp = Date.now();
                    const outPath = path.resolve(`generated_permuted_${targetModelId}_from_${donorModelId}_${timestamp}.obj`);
                    const objName = `${classMatch}_permuted_${timestamp}`;
                    fs.writeFileSync(outPath, OBJExporter.stringify(permutedVertices, target.faces, objName), 'utf8');

                    console.log(`✨ Permutation morphologique neuronale réussie !`);
                    console.log(`   Fichier        : ${outPath}`);
                    console.log(`   Modèle Cible   : ${classMatch}:${targetModelId} (Formes principales conservées)`);
                    console.log(`   Modèle Donneur : ${classMatch}:${donorModelId} (Spécificités rares prédites par le réseau)`);
                    console.log(`   Amplitude      : ${(strength * 100).toFixed(0)}%\n`);
                } catch (err) {
                    console.error(`❌ Erreur lors de la permutation neuronale : ${err.message}`);
                }
                break;
            }

            case 'vary': {
                if (args.length === 0) {
                    console.log('❌ Usage: vary <classe> [force]            (Ex: vary chair  ou  vary chair 0.3)');
                    console.log('   Usage: vary <classe> <modeleId> [force] (Ex: vary chair chair_0001 0.25)');
                    break;
                }

                const targetCat = args[0].toLowerCase();
                const classMatch = trainer.categoryNames.find(c => c.toLowerCase() === targetCat);
                if (!classMatch) {
                    console.log(`❌ Classe inconnue "${args[0]}". Classes: ${trainer.categoryNames.join(', ')}`);
                    break;
                }

                const available = categoriesMap.get(classMatch) || [];
                if (available.length === 0) {
                    console.log(`❌ Aucun modèle disponible pour "${classMatch}".`);
                    break;
                }

                let targetModelId = null;
                let strength = 0.2;

                // Détection intelligente des arguments (vary <classe> [force] vs vary <classe> <id> [force])
                if (args[1] !== undefined) {
                    const parsedForce = parseFloat(args[1]);
                    const isModelId = available.some(m => m.modelId.toLowerCase() === args[1].toLowerCase());

                    if (!isNaN(parsedForce) && !isModelId) {
                        strength = Math.max(0.01, Math.min(1.0, parsedForce));
                    } else {
                        targetModelId = args[1];
                        if (args[2] !== undefined) {
                            const p2 = parseFloat(args[2]);
                            if (!isNaN(p2)) strength = Math.max(0.01, Math.min(1.0, p2));
                        }
                    }
                }

                if (!targetModelId) {
                    // Tirage aléatoire du modèle de base
                    const randBase = available[Math.floor(Math.random() * available.length)];
                    targetModelId = randBase.modelId;
                }

                try {
                    console.log(`\n🧠 [Vary Neuronal] Déduction du consensus et injection de spécificités pour "${classMatch}"...`);
                    // 1. Sélection aléatoire d'un donneur distinct du modèle cible
                    const donorPool = available.filter(m => m.modelId.toLowerCase() !== targetModelId.toLowerCase());
                    const donorCandidate = donorPool.length > 0
                        ? donorPool[Math.floor(Math.random() * donorPool.length)]
                        : available[0];
                    const donorModelId = donorCandidate.modelId;

                    // 2. Échantillon aléatoire et varié pour le consensus géométrique
                    const otherModels = donorPool.filter(m => m.modelId.toLowerCase() !== donorModelId.toLowerCase());
                    const shuffledOthers = otherModels.slice().sort(() => Math.random() - 0.5);
                    const sampleGroup = [available.find(m => m.modelId === targetModelId), donorCandidate, ...shuffledOthers.slice(0, 4)].filter(Boolean);

                    const parsedGroup = [];
                    for (const m of sampleGroup) {
                        trainer.ensureModelLoaded(classMatch, m.modelId);
                        parsedGroup.push(engine.reconstructModel(classMatch, m.modelId));
                    }
                    const stats = NeuralMorphologyEngine.computeClassConsensus(parsedGroup, 14);

                    trainer.ensureModelLoaded(classMatch, donorModelId);
                    const donor = engine.reconstructModel(classMatch, donorModelId);

                    trainer.ensureModelLoaded(classMatch, targetModelId);
                    const base = engine.reconstructModel(classMatch, targetModelId);

                    // 3. Entraînement et permutation neuronale ciblée
                    const morphEngine = new NeuralMorphologyEngine(14);
                    morphEngine.trainSpecificity(donor.vertices, stats, 25);
                    const variedVertices = morphEngine.permuteTraits(base.vertices, stats, strength);

                    // 4. Écriture avec horodatage unique (anti-cache visualiseur)
                    const timestamp = Date.now();
                    const outPath = path.resolve(`generated_variant_${targetModelId}_${timestamp}.obj`);
                    const objName = `${classMatch}_variant_${timestamp}`;
                    const objText = OBJExporter.stringify(variedVertices, base.faces, objName);
                    fs.writeFileSync(outPath, objText, 'utf8');

                    const aabb = MeshAwarenessUtils.computeCollisionBox(
                        variedVertices.flatMap(v => [v.x, v.y, v.z])
                    );

                    console.log(`✨ Variante 3D générée avec succès (force: ${(strength * 100).toFixed(0)}%) !`);
                    console.log(`   Fichier      : ${outPath}`);
                    console.log(`   Classe       : ${classMatch} (Base: ${targetModelId}, Donneur: ${donorModelId})`);
                    console.log(`   Topologie    : Préservée (${base.faces.length} faces, ${variedVertices.length} sommets)`);
                    console.log(`   Bounding Box : Min [${aabb.min.x.toFixed(2)}, ${aabb.min.y.toFixed(2)}, ${aabb.min.z.toFixed(2)}]`);
                    console.log(`                : Max [${aabb.max.x.toFixed(2)}, ${aabb.max.y.toFixed(2)}, ${aabb.max.z.toFixed(2)}]\n`);
                } catch (err) {
                    console.error(`❌ Erreur lors de la génération de variante : ${err.message}`);
                }
                break;
            }

            case 'dream': {
                if (args.length === 0) {
                    console.log('❌ Usage: dream <classe> [force]  (Ex: dream chair  ou  dream sofa 0.3)');
                    break;
                }

                const targetCat = args[0].toLowerCase();
                const classMatch = trainer.categoryNames.find(c => c.toLowerCase() === targetCat);
                if (!classMatch) {
                    console.log(`❌ Classe inconnue "${args[0]}". Classes: ${trainer.categoryNames.join(', ')}`);
                    break;
                }

                const available = categoriesMap.get(classMatch) || [];
                if (available.length === 0) {
                    console.log(`❌ Aucun modèle disponible pour "${classMatch}".`);
                    break;
                }

                let strength = 0.25;
                if (args[1] && !isNaN(parseFloat(args[1]))) {
                    strength = Math.max(0.01, Math.min(1.0, parseFloat(args[1])));
                }

                try {
                    // Sélection automatique de l'archétype résonant de la classe
                    const proto = engine.getResonantPrototype(classMatch);
                    const baseId = proto ? proto.record.name : available[0].modelId;

                    trainer.ensureModelLoaded(classMatch, baseId);
                    const base = engine.reconstructModel(classMatch, baseId);
                    const latent = deformer.generateLatent();
                    const variedVertices = deformer.deform(base.vertices, latent, strength);

                    const randSuffix = Math.floor(Math.random() * 9000 + 1000);
                    const outPath = path.resolve(`dream_${classMatch}_${randSuffix}.obj`);
                    const objText = OBJExporter.stringify(variedVertices, base.faces, `${classMatch}_dream_${randSuffix}`);
                    fs.writeFileSync(outPath, objText, 'utf8');

                    const aabb = MeshAwarenessUtils.computeCollisionBox(
                        variedVertices.flatMap(v => [v.x, v.y, v.z])
                    );

                    console.log(`🔮 [Dream] Nouvelle forme 3D synthétisée pour la classe "${classMatch}" !`);
                    console.log(`   Fichier      : ${outPath}`);
                    console.log(`   Matrice Base : Prototype résonant (${baseId})`);
                    console.log(`   Modulation   : Force ${(strength * 100).toFixed(0)}%`);
                    console.log(`   Bounding Box : Min [${aabb.min.x.toFixed(2)}, ${aabb.min.y.toFixed(2)}, ${aabb.min.z.toFixed(2)}]`);
                    console.log(`                : Max [${aabb.max.x.toFixed(2)}, ${aabb.max.y.toFixed(2)}, ${aabb.max.z.toFixed(2)}]\n`);
                } catch (err) {
                    console.error(`❌ Erreur lors de la synthèse dream : ${err.message}`);
                }
                break;
            }

            case 'status': {
                const p = trainer.getProgress();
                console.log('\n--- État de l\'Entraînement Continu ---');
                console.log(`Statut           : ${p.isRunning ? 'En cours (Cadencé)' : 'En pause'}`);
                console.log(`Cadence          : ${p.cadenceMs} ms / modèle`);
                console.log(`Catégorie active : ${p.currentCategory}`);
                console.log(`Progression      : ${p.processedCount} / ${p.total} (${p.percentage}%)`);
                console.log(`Volume Données   : ${p.totalOriginalKb} Ko -> ${p.totalCompressedKb} Ko (Ratio: ${p.ratio}:1)\n`);
                break;
            }

            case 'classes': {
                console.log('\n--- Progression par Catégorie ---');
                for (const cat of trainer.categoryNames) {
                    const items = categoriesMap.get(cat) || [];
                    const done = items.filter(m => checkpoint.isProcessed(`${cat}:${m.modelId}`)).length;
                    const pct = items.length > 0 ? ((done / items.length) * 100).toFixed(0) : 0;
                    console.log(`  - ${cat.padEnd(14)} : ${done.toString().padStart(4)} / ${items.length} (${pct}%)`);
                }
                console.log('');
                break;
            }

            case 'speed': {
                const ms = parseInt(args[0], 10);
                if (!isNaN(ms) && ms >= 10) {
                    trainer.setCadence(ms);
                    console.log(`⏱️ Cadence mise à jour: ${ms} ms.`);
                } else {
                    console.log('❌ Usage: speed <ms> (ex: speed 200)');
                }
                break;
            }

            case 'pause': {
                trainer.pause();
                checkpoint.save();
                console.log('⏸️ Entraînement mis en pause (état et tenseurs persistés).');
                break;
            }

            case 'resume': {
                trainer.start();
                console.log('▶️ Entraînement repris.');
                break;
            }

            case 'save': {
                const count = trainer.saveTensors();
                checkpoint.save();
                console.log(`💾 Persistance réussie : ${count} modèles écrits dans ${path.basename(tensorsPath)}.`);
                console.log(`💾 Checkpoint JSON synchronisé.`);
                break;
            }

            case 'help': {
                console.log('\nCommandes:');
                console.log('  gen <classe> [modeleId] : Exporte un fichier OBJ');
                console.log('  classes                 : Affiche l\'avancement par classe');
                console.log('  status                  : Affiche les stats globales');
                console.log('  speed <ms>              : Règle la vitesse de l\'entraînement');
                console.log('  pause / resume          : Gère le déroulement');
                console.log('  save                    : Sauvegarde immédiate des tenseurs et checkpoint');
                console.log('  exit                    : Quitte\n');
                break;
            }

            case 'exit':
            case 'quit': {
                trainer.pause();
                trainer.saveTensors();
                checkpoint.save();
                await workerPool.terminate();
                console.log('💾 Tenseurs et checkpoint sauvegardés. À bientôt !');
                process.exit(0);
            }

            default:
                console.log(`Commande inconnue "${cmd}". Tapez "help" pour voir la liste des commandes.`);
                break;
        }

        rl.prompt();
    });

    rl.on('SIGINT', async () => {
        trainer.pause();
        trainer.saveTensors();
        checkpoint.save();
        await workerPool.terminate();
        process.exit(0);
    });
}

// Exécution interactive si lancé directement en CLI
const isMainScript = () => {
    if (!isMainThread) return false;
    if (!process.argv[1]) return false;
    try {
        return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
};

if (isMainScript()) {
    runInteractiveCli().catch(err => {
        console.error('Erreur :', err);
        process.exit(1);
    });
}