const { Vector3, Quaternion, StochasticPerceptron } = require('./test.js');

/**
 * Simulation par Perception Environnementale
 * Le photon "matérialise" son prochain point de collision selon la vibration solaire.
 */
class SolarVibrationSim {
    constructor() {
        const config = require('./solar_config.json');

        // --- Constantes Astrophysiques ---
        this.RSun = config.astrophysics.sunRadiusKm;
        this.C = config.astrophysics.speedOfLightKms;
        this.SEC_PER_YEAR = config.astrophysics.secondsPerYear;
        this.MFP_BASE = config.astrophysics.meanFreePathBaseKm;

        this.R_Radiative = config.astrophysics.radiativeZoneLimit * this.RSun;
        this.R_Core = config.astrophysics.coreLimit * this.RSun;

        // --- Données de Vie du Soleil ---
        this.SunTotalLife = config.solarHistory.totalLifeYears;
        this.SunCurrentAge = config.solarHistory.currentAgeYears;

        // --- Paramètres de Simulation ---
        this.MFP_SCALE = config.simulation.mfpScale;
        this.MAX_STEPS = config.simulation.maxSteps;
        this.LOG_FREQ = config.simulation.logFrequency;
        this.CORRUPTION_CHANCE = config.simulation.corruptionChance;
        this.COOLING_FREQ = config.simulation.coolingFrequency;
        
        // Génération d'épicentres latents (localisés)
        this.latentEpicenters = [];
        this.generateEpicenters(config.simulation.epicenterCount);

        // Le cerveau perceptif du photon
        this.perceptron = new StochasticPerceptron([0.5]);

        // Buffers de recyclage pour éviter le Garbage Collector
        this._tempVec = new Vector3();
        this._tempRot = new Quaternion();
        this._jumpVec = new Vector3();
    }

    /**
     * Distribue des épicentres latents dans le volume solaire.
     * La probabilité est plus élevée vers le centre (Fusion).
     */
    generateEpicenters(count) {
        for (let i = 0; i < count; i++) {
            // Direction aléatoire
            let p = new Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize();
            // Distribution selon le volume (plus dense au centre)
            let r = Math.pow(Math.random(), 0.33) * this.RSun;
            p = p.scale(r);

            this.latentEpicenters.push({
                pos: p,
                strength: (r < this.R_Core) ? 0.4 : 0.1, // Plus violent dans le cœur
                freq: 0.0001 + Math.random() * 0.002, // Fréquence de pulsation
                phase: Math.random() * Math.PI * 2,
                range: 30000 + Math.random() * 70000,
                rangeSq: Math.pow(30000 + Math.random() * 70000, 2)
            });
        }
    }

    /**
     * Calcule la "Vibration" locale du Soleil.
     * Ne simule que les épicentres à portée du photon (Perception locale).
     */
    getEnvironmentVibration(position, step = 0) {
        const r = position.length();
        const normalizedR = r / this.RSun;

        // 1. Profil de densité basé sur le SSM (décroissance poly-exponentielle)
        // Modélise la chute brutale de l'opacité vers la surface
        let densityProfile = Math.exp(-normalizedR * 8.0) + 0.001;

        // 2. Ondes Acoustiques (Modes p) - Héliosismologie
        let waveInterference = 0;
        for (const ep of this.latentEpicenters) {
            const distSq = position.distanceToSquared(ep.pos);
            if (distSq < ep.rangeSq) {
                const dist = Math.sqrt(distSq);
                const pulsation = Math.sin(step * ep.freq + ep.phase);
                const attenuation = 1.0 - (dist / ep.range);
                waveInterference += ep.strength * pulsation * attenuation;
            }
        }

        return Math.max(0.000001, densityProfile + waveInterference * 0.2);
    }

    /**
     * Génère le prochain saut (Libre Parcours Moyen dynamique)
     */
    generateNextCollision(currentPos, currentDirection, step) {
        const vibe = this.getEnvironmentVibration(currentPos, step);
        
        // MFP Physique : Très court au centre (~10^-7 km), long à la surface
        // On applique le MFP_SCALE pour permettre l'exécution CPU
        const meanFreePath = (this.MFP_BASE / vibe) * this.MFP_SCALE;

        const dist = currentPos.length();
        let dx = currentDirection.x;
        let dy = currentDirection.y;
        let dz = currentDirection.z;

        // Modèle de convection : Drift radial sortant (Vitesse de circulation ~1-2 km/s)
        if (dist > this.R_Radiative && dist > 0) {
            const convectionStrength = (dist - this.R_Radiative) / (this.RSun - this.R_Radiative);
            const driftScale = convectionStrength * 0.15; // Poussée ascendante des cellules de convection
            dx += (currentPos.x / dist) * driftScale;
            dy += (currentPos.y / dist) * driftScale;
            dz += (currentPos.z / dist) * driftScale;
        }

        this._jumpVec.x = dx * meanFreePath;
        this._jumpVec.y = dy * meanFreePath;
        this._jumpVec.z = dz * meanFreePath;

        // On met à jour le buffer temporaire pour éviter "new Vector3"
        this._tempVec.x = currentPos.x + this._jumpVec.x;
        this._tempVec.y = currentPos.y + this._jumpVec.y;
        this._tempVec.z = currentPos.z + this._jumpVec.z;

        return { nextPos: this._tempVec, meanFreePath, localVib: vibe };
    }

    getZoneName(r) {
        if (r < this.R_Core) return "COEUR (Fusion)    ";
        if (r < this.R_Radiative) return "ZONE RADIATIVE    ";
        return "ZONE CONVECTIVE   ";
    }

    run(initialSignal = 0b10101010, maxStepsOverride = null) {
        let pos = new Vector3(0, 0, 0);
        let dir = new Vector3(1, 0, 0).normalize();
        let signal = initialSignal;
        let steps = 0;
        let totalLightDistance = 0; // Distance réelle parcourue par le photon
        const effectiveMaxSteps = maxStepsOverride !== null ? maxStepsOverride : this.MAX_STEPS;

        console.log(`--- Lancement Simulation G-NEURO (Précision Scientifique) ---`);
        console.log(`Vie restante du Soleil : ${(this.SunTotalLife - this.SunCurrentAge).toLocaleString()} années.`);

        while (pos.length() < this.RSun && steps < effectiveMaxSteps) {
            // Le photon perçoit son environnement et décide de son prochain saut (dynamique temporelle)
            const { nextPos, meanFreePath, localVib } = this.generateNextCollision(pos, dir, steps);
            
            // --- LOGIQUE SCIENTIFIQUE : Loi de la Diffusion ---
            // Dans un plasma, le chemin réel parcouru est proportionnel au CARRÉ du pas effectué
            // divisé par le libre parcours moyen physique (sans le scale).
            const physicalMFP = this.MFP_BASE / localVib;
            const pathEquivalent = (meanFreePath * meanFreePath) / physicalMFP;
            
            totalLightDistance += pathEquivalent;

            pos.copyFrom(nextPos);
            
            // Interaction : Le photon rebondit
            Quaternion.random(this._tempRot);
            this._tempRot.rotateVector(dir, dir).normalize();
            
            // 1. Entropie de Signal (Physique des Plasmas)
            // Réduction pour compenser le grand pas
            const corruptionProb = Math.min(this.CORRUPTION_CHANCE, localVib * 0.0001);
            const noise = this.perceptron.probabilityToBitStream(corruptionProb, 8);
            signal = (signal ^ noise) & 0xFF;

            // 2. Redshifting Thermique (Thermalisation vers le spectre visible)
            if (steps % this.COOLING_FREQ === 0 && signal > 0) {
                signal = signal & (signal - 1); // "Cooling" : éteint un bit à 1 progressivement
            }

            steps++;

            if (steps % this.LOG_FREQ === 0) {
                const energy = this.perceptron.popCount(signal);
                const r = pos.length();
                const zone = this.getZoneName(r);
                const years = (totalLightDistance / this.C) / this.SEC_PER_YEAR;
                console.log(`[${zone}] Étaccpe ${steps.toLocaleString().padStart(9)} | R: ${Math.round(r).toString().padStart(7)}km | Age: ${Math.round(years).toLocaleString().padStart(8)} ans | Signal: ${energy} bits`);
            }
        }

        const totalYears = (totalLightDistance / this.C) / this.SEC_PER_YEAR;
        const remainingLife = (this.SunTotalLife - this.SunCurrentAge) - totalYears;
        const finalRadius = pos.length();
        const efficiency = (finalRadius / totalLightDistance) * 100;

        const hasExited = pos.length() >= this.RSun;
        console.log(`\n--- ${hasExited ? "SORTIE DU SOLEIL" : "FIN DE SIMULATION (LIMITE D'ÉTAPES)"} ---`);
        console.log(`Temps écoulé (Photon)     : ${Math.round(totalYears).toLocaleString()} ans`);
        console.log(`Vie du Soleil après sortie  : ${remainingLife.toLocaleString()} ans`);
        console.log(`Sauts effectués           : ${steps.toLocaleString()}`);
        console.log(`Rayon atteint             : ${Math.round(finalRadius).toLocaleString()} km`);
        console.log(`Efficacité de progression : ${efficiency.toExponential(4)} % (Distance réelle vs Trajet total)`);
        console.log(`Signal final (Spectre)    : ${signal.toString(2).padStart(8, '0')}`);
        console.log(`Entropie finale           : ${((1 - this.perceptron.popCount(signal ^ initialSignal) / 8) * 100).toFixed(2)}% d'altération`);
        
        return { 
            steps, 
            signal, 
            totalYears, 
            finalRadius, 
            totalDistanceKm: totalLightDistance,
            efficiency 
        };
    }
}

const sim = new SolarVibrationSim();
sim.run();
module.exports = { SolarVibrationSim };