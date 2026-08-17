/**
 * @file @/library.js
 * @description Une bibliothèque d'outils basés sur le principe fondamental de la dichotomie (division en deux).
 * Inclut des algorithmes pour les tableaux triés, des structures de données et des solveurs de problèmes conceptuels.
 *
 * @template T
 * @callback Comparator
 * @param {T} element - L'élément du tableau.
 * @param {any} target - La valeur cible.
 * @returns {number} -1 si element < target, 0 si element == target, 1 si element > target.
 *
 */

import { Worker } from 'worker_threads';
import os from 'os';
/**
 * @namespace Dichotomy
 * @description Un ensemble d'outils de recherche puissants pour les tableaux triés.
 */
const Dichotomy = {
    /**
     * Comparateur par défaut pour les types primitifs (nombres, chaînes).
     * @private
     */
    _defaultComparator(a, b) {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    },

    /**
     * L'algorithme de base de la recherche dichotomique.
     * Trouve l'index d'une valeur cible dans un tableau trié.
     * Si plusieurs occurrences existent, l'index retourné n'est pas garanti (peut être n'importe laquelle des occurrences).
     * @template T
     * @param {Array<T>} arr - Le tableau trié dans lequel chercher.
     * @param {any} target - La valeur à trouver.
     * @param {Comparator<T>} [comparator] - Fonction de comparaison.
     * @returns {number} L'index de la cible si elle est trouvée, sinon -1.
     */
    search(arr, target, comparator = this._defaultComparator) {
        let low = 0;
        let high = arr.length - 1;

        while (low <= high) {
            // Utiliser Math.floor pour éviter les problèmes avec les nombres flottants
            // et pour s'assurer que mid est un entier.
            const mid = Math.floor(low + (high - low) / 2);
            const comparison = comparator(arr[mid], target);

            if (comparison === 0) {
                return mid; // Cible trouvée
            } else if (comparison < 0) {
                low = mid + 1; // La cible est dans la moitié droite
            } else {
                high = mid - 1; // La cible est dans la moitié gauche
            }
        }

        return -1; // Cible non trouvée
    },

    /**
     * Trouve l'index de la PREMIÈRE occurrence d'une valeur cible.
     * Utile quand le tableau contient des doublons.
     * @template T
     * @param {Array<T>} arr - Le tableau trié.
     * @param {any} target - La valeur à trouver.
     * @param {Comparator<T>} [comparator] - Fonction de comparaison.
     * @returns {number} L'index de la première occurrence, sinon -1.
     */
    findFirst(arr, target, comparator = this._defaultComparator) {
        let low = 0;
        let high = arr.length - 1;
        let result = -1;

        while (low <= high) {
            const mid = Math.floor(low + (high - low) / 2);
            const comparison = comparator(arr[mid], target);

            if (comparison === 0) {
                result = mid;
                high = mid - 1; // Continuer à chercher à gauche
            } else if (comparison < 0) {
                low = mid + 1;
            } else {
                high = mid - 1; // On continue de chercher à gauche
            }
        }

        return result;
    },

    /**
     * Trouve l'index de la DERNIÈRE occurrence d'une valeur cible.
     * Utile quand le tableau contient des doublons.
     * @template T
     * @param {Array<T>} arr - Le tableau trié.
     * @param {any} target - La valeur à trouver.
     * @param {Comparator<T>} [comparator] - Fonction de comparaison.
     * @returns {number} L'index de la dernière occurrence, sinon -1.
     */
    findLast(arr, target, comparator = this._defaultComparator) {
        let low = 0;
        let high = arr.length - 1;
        let result = -1;

        while (low <= high) {
            const mid = Math.floor(low + (high - low) / 2);
            const comparison = comparator(arr[mid], target);

            if (comparison === 0) {
                result = mid;
                low = mid + 1; // Continuer à chercher à droite
            } else if (comparison < 0) {
                low = mid + 1; // On continue de chercher à droite
            } else {
                high = mid - 1;
            }
        }

        return result;
    },

    /**
     * Compte le nombre total d'occurrences d'une valeur cible.
     * Combine findFirst et findLast pour une efficacité maximale.
     * @template T
     * @param {Array<T>} arr - Le tableau trié.
     * @param {any} target - La valeur à compter.
     * @param {Comparator<T>} [comparator] - Fonction de comparaison.
     * @returns {number} Le nombre d'occurrences de la cible.
     */
    countOccurrences(arr, target, comparator = this._defaultComparator) {
        const firstIndex = this.findFirst(arr, target, comparator);

        if (firstIndex === -1) {
            return 0; // Si la première n'existe pas, il n'y en a aucune.
        }

        // On peut passer `firstIndex` comme point de départ à `findLast` pour optimiser, mais restons simple.
        const lastIndex = this.findLast(arr, target, comparator);
        return lastIndex - firstIndex + 1;
    },

    /**
     * Trouve l'index où la cible devrait être insérée pour maintenir l'ordre du tableau.
     * C'est l'équivalent de la fonction `lower_bound` en C++.
     * @template T
     * @param {Array<T>} arr - Le tableau trié.
     * @param {any} target - La valeur à insérer.
     * @param {Comparator<T>} [comparator] - Fonction de comparaison.
     * @returns {number} L'index d'insertion approprié.
     */
    findInsertionPoint(arr, target, comparator = this._defaultComparator) {
        let low = 0;
        let high = arr.length; // Note: high est la longueur du tableau, pas length - 1

        while (low < high) {
            const mid = Math.floor(low + (high - low) / 2);
            if (comparator(arr[mid], target) < 0) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        return low; // ou high, ils sont égaux à la fin de la boucle
    },

    /**
     * Vérifie si une valeur cible est présente dans le tableau.
     * Plus sémantique que `search(arr, target) !== -1`.
     * @template T
     * @param {Array<T>} arr - Le tableau trié.
     * @param {any} target - La valeur à vérifier.
     * @param {Comparator<T>} [comparator] - Fonction de comparaison.
     * @returns {boolean} `true` si la cible est présente, sinon `false`.
     */
    contains(arr, target, comparator = this._defaultComparator) {
        return this.search(arr, target, comparator) !== -1;
    },

    // --- NOUVEAUX ALGORITHMES PUISSANTS ---

    /**
     * Trouve tous les éléments dans un intervalle [minTarget, maxTarget].
     * @template T
     * @param {Array<T>} arr - Le tableau trié.
     * @param {any} minTarget - La borne inférieure de l'intervalle (inclusive).
     * @param {any} maxTarget - La borne supérieure de l'intervalle (inclusive).
     * @param {Comparator<T>} [comparator] - Fonction de comparaison.
     * @returns {Array<T>} Un sous-tableau contenant les éléments de l'intervalle.
     */
    findRange(arr, minTarget, maxTarget, comparator = this._defaultComparator) {
        // Trouve l'index du premier élément >= minTarget
        const startIndex = this.findInsertionPoint(arr, minTarget, comparator);

        // Trouve l'index du premier élément > maxTarget
        let endIndex = this.findInsertionPoint(arr, maxTarget, comparator);
        
        // Il faut aussi trouver le dernier élément ÉGAL à maxTarget
        const lastElement = this.findLast(arr, maxTarget, comparator);
        if (lastElement !== -1) {
            endIndex = lastElement + 1;
        }

        return arr.slice(startIndex, endIndex);
    },

    /**
     * Trouve l'index de l'élément le plus proche de la cible dans le tableau.
     * @template T
     * @param {Array<T>} arr - Le tableau trié.
     * @param {any} target - La valeur numérique cible.
     * @param {function(T, any): number} distanceMetric - Une fonction qui retourne la "distance" (un nombre) entre un élément et la cible.
     * @returns {number} L'index de l'élément le plus proche, ou -1 si le tableau est vide.
     */
    findClosest(arr, target, distanceMetric) {
        if (arr.length === 0) {
            return -1;
        }

        let low = 0;
        let high = arr.length - 1;

        while (low <= high) {
            const mid = Math.floor(low + (high - low) / 2);
            const midValue = arr[mid];

            if (distanceMetric(midValue, target) === 0) {
                return mid;
            } else if (distanceMetric(midValue, target) < 0) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        // À la fin de la boucle, `low` et `high` encadrent la position où `target` serait insérée.
        // L'élément le plus proche est soit à `high`, soit à `low`.
        if (high < 0) high = 0; // S'assurer que high est un index valide
        if (low >= arr.length) low = arr.length - 1; // S'assurer que low est un index valide
        const diffHigh = Math.abs(distanceMetric(arr[high], target));
        const diffLow = Math.abs(distanceMetric(arr[low], target));

        return diffLow <= diffHigh ? low : high;
    },

    /**
     * Trouve la "frontière" dans un tableau où une condition (prédicat) passe de false à true.
     * C'est une généralisation de findInsertionPoint et findFirst.
     * @template T
     * @param {Array<T>} arr - Le tableau où chaque élément peut être évalué par le prédicat.
     * @param {function(T): boolean} predicate - Une fonction qui retourne true ou false pour un élément.
     * Le tableau doit être "trié" selon ce prédicat (tous les false avant tous les true).
     * @returns {number} L'index du premier élément pour lequel le prédicat est true. Retourne arr.length si non trouvé.
     */
    findBoundary(arr, predicate) {
        let low = 0;
        let high = arr.length;
        while (low < high) {
            const mid = Math.floor(low + (high - low) / 2);
            if (predicate(arr[mid])) {
                high = mid; // On a trouvé un 'true', la frontière est peut-être avant
            } else {
                low = mid + 1; // C'est 'false', la frontière est forcément après
            }
        }
        return low;
    },

    /**
     * Effectue une recherche dichotomique sur une fonction pour trouver la plus petite valeur d'entrée
     * qui satisfait une condition. (Recherche sur la réponse).
     * @param {number} low - La borne inférieure de l'espace de recherche.
     * @param {number} high - La borne supérieure de l'espace de recherche.
     * @param {function(number): boolean} predicate - La fonction de test. Doit être monotone (false...false, true...true).
     * @param {number} [precision=1e-9] - La précision requise pour la réponse (pour les nombres flottants).
     * @returns {number} La plus petite valeur (approximative) qui rend le prédicat 'true'.
     */
    searchOnAnswer(low, high, predicate, precision = 1e-9) {
        // Si on travaille avec des entiers, la boucle s'arrête quand low == high
        const isIntegerSearch = Number.isInteger(low) && Number.isInteger(high) && precision === 1;

        while (high - low > precision) {
            const mid = isIntegerSearch ? Math.floor(low + (high - low) / 2) : low + (high - low) / 2;
            if (predicate(mid)) {
                high = mid; // Cette réponse est possible, essayons plus petit
            } else {
                low = mid;  // Cette réponse n'est pas possible, il faut viser plus haut
            }
        }
        // Pour les entiers, 'high' est la première bonne réponse. Pour les flottants, c'est une approximation.
        return high;
    },

    /**
     * Trouve la valeur d'entrée qui maximise le résultat d'une fonction unimodale (avec un seul pic).
     * C'est l'outil adapté pour les problèmes d'optimisation non-monotones.
     * @param {number} low - La borne inférieure de l'espace de recherche.
     * @param {number} high - La borne supérieure de l'espace de recherche.
     * @param {function(number): number} evaluator - Une fonction qui prend une valeur et retourne son "score" ou "altitude".
     * @param {number} [precision=1e-9] - La précision requise pour la réponse.
     * @returns {number} La valeur (approximative) qui maximise le résultat de l'évaluateur.
     */
    findPeak(low, high, evaluator, precision = 1e-9) {
        while (high - low > precision) {
            // On divise l'intervalle restant en trois.
            const mid1 = low + (high - low) / 3;
            const mid2 = high - (high - low) / 3;

            const eval1 = evaluator(mid1);
            const eval2 = evaluator(mid2);

            if (eval1 < eval2) {
                // Le pic est dans la partie droite (incluant mid2).
                // On peut éliminer le premier tiers.
                low = mid1;
            } else {
                // Le pic est dans la partie gauche (incluant mid1).
                // On peut éliminer le troisième tiers.
                high = mid2;
            }
        }

        // low et high sont maintenant très proches. Le pic est entre les deux.
        // On retourne le milieu de l'intervalle final pour une meilleure approximation.
        return (low + high) / 2;
    },

    /**
     * Trouve la valeur d'entrée qui maximise le résultat d'une fonction unimodale en utilisant une recherche par N-section.
     * C'est une généralisation de la recherche ternaire (`findPeak`).
     * @param {number} low - La borne inférieure de l'espace de recherche.
     * @param {number} high - La borne supérieure de l'espace de recherche.
     * @param {function(number): number} evaluator - Une fonction unimodale qui prend une valeur et retourne son "score".
     * @param {object} [options={}] - Options pour la recherche.
     * @param {number} [options.precision=1e-9] - La précision requise pour la réponse.
     * @param {number} [options.sections=3] - Le nombre de sections à diviser (N). Doit être >= 3. 3 correspond à une recherche ternaire.
     * @returns {number} La valeur (approximative) qui maximise le résultat de l'évaluateur.
     */
    findPeakN(low, high, evaluator, options = {}) {
        const { precision = 1e-9, sections = 3 } = options;
        if (sections < 3) throw new Error("Le nombre de sections doit être au moins 3.");

        while (high - low > precision) {
            const points = [];
            const scores = [];
            const step = (high - low) / sections;

            // Générer N-1 points de test internes
            for (let i = 1; i < sections; i++) {
                const point = low + i * step;
                points.push(point);
                scores.push(evaluator(point));
            }

            // Trouver le point avec le score le plus élevé
            const maxScoreIndex = scores.indexOf(Math.max(...scores));

            // Réduire l'intervalle de recherche autour du meilleur point trouvé
            low = points[maxScoreIndex] - step;
            high = points[maxScoreIndex] + step;
        }

        return (low + high) / 2;
    }
};

/**
 * @namespace Dichotomy.Operators
 * @description Une bibliothèque de "fabriques de prédicats" pour des problèmes complexes,
 * à utiliser avec `Dichotomy.searchOnAnswer`.
 * Ces opérateurs sont conçus pour des problèmes où la réponse peut être trouvée en testant
 * une seule variable (monodimensionnel).
 */
Dichotomy.Operators = {


    /**
     * Crée un prédicat pour trouver le niveau de financement de base le plus élevé possible.
     * @param {object} config - L'objet de configuration.
     * @param {Array<number>} config.baseNeeds - Tableau des besoins de base de chaque entité.
     * @param {number} config.totalBudget - Le budget total disponible.
     * @returns {function(number): boolean} Un prédicat qui prend un `guaranteedLevel` et retourne `true` si le budget est suffisant.
     */
    createFairResourceAllocator({ baseNeeds, totalBudget }) {
        return function isFeasible(guaranteedLevel) {
            let requiredBudget = 0;
            for (const need of baseNeeds) {
                // Chaque entité reçoit AU MOINS le niveau garanti, ou son besoin de base si celui-ci est plus élevé.
                requiredBudget += Math.max(need, guaranteedLevel);
            }
            return requiredBudget <= totalBudget;
        };
    },

    /**
     * Crée un prédicat pour déterminer le taux de vaccination nécessaire pour l'immunité collective.
     * @param {object} config - L'objet de configuration.
     * @param {number} config.r0 - Le taux de reproduction de base du virus.
     * @returns {function(number): boolean} Un prédicat qui prend un `vaccinationRate` (entre 0 et 1) et retourne `true` si l'immunité est atteinte.
     */
    createHerdImmunityValidator({ r0 }) {
        // La formule de base est R_effectif = R0 * (1 - taux_immunité)
        // On veut R_effectif < 1
        return function achievesHerdImmunity(immunityRate) {
            const rEffective = r0 * (1 - immunityRate);
            return rEffective < 1;
        };
    },

    /**
     * Crée un prédicat pour trouver le bonus de score minimal pour atteindre un objectif d'équité.
     * @param {object} config - L'objet de configuration.
     * @param {Array<number>} config.scoresGroupA - Les scores du groupe de référence.
     * @param {Array<number>} config.scoresGroupB - Les scores du groupe désavantagé.
     * @param {number} config.maxAllowedDisparity - L'écart de score moyen maximal toléré (ex: 0.05 pour 5%).
     * @returns {function(number): boolean} Un prédicat qui prend un `bonus` et retourne `true` si l'équité est atteinte.
     */
    createFairnessThresholdValidator({ scoresGroupA, scoresGroupB, maxAllowedDisparity }) {
        const avgA = scoresGroupA.reduce((a, b) => a + b, 0) / scoresGroupA.length;

        return function isFairEnough(bonus) {
            const avgB_corrected = (scoresGroupB.reduce((a, b) => a + b, 0) / scoresGroupB.length) + bonus;
            const newDisparity = Math.abs(avgA - avgB_corrected) / avgA;
            return newDisparity <= maxAllowedDisparity;
        };
    },

    /**
     * Crée un prédicat pour résoudre le "problème du chargeur de paquets" (Packer Problem).
     * Le prédicat généré vérifie s'il est possible de transporter une liste d'objets
     * en un nombre de voyages donné, avec une certaine capacité par voyage.
     *
     * @param {object} config - L'objet de configuration.
     * @param {Array<number>} config.itemSizes - Un tableau des "tailles" de chaque objet (poids, volume, etc.).
     * @param {number} config.maxTrips - Le nombre maximum de "conteneurs" ou de voyages disponibles.
     * @returns {function(number): boolean} Un prédicat qui prend une `capacity` et retourne `true` si l'opération est possible.
     */
    createShippingValidator({ itemSizes, maxTrips }) {
        // On pré-calcule le plus gros objet pour une optimisation.
        const maxItemSize = Math.max(0, ...itemSizes);

        return function isSufficient(capacity) {
            if (capacity < maxItemSize) {
                return false; // Impossible si un objet est plus gros que la capacité.
            }

            let trips = 1;
            let currentLoad = 0;
            for (const size of itemSizes) {
                if (currentLoad + size <= capacity) {
                    currentLoad += size;
                } else {
                    trips++;
                    currentLoad = size;
                }
            }
            return trips <= maxTrips;
        };
    },

    // On pourrait ajouter d'autres opérateurs ici :
    // - createLoadBalancingValidator(...)
    // - createRateLimiterValidator(...)
    // - etc.

    /**
     * Crée un prédicat pour modéliser l'impact d'une taxe carbone.
     * @param {object} config - L'objet de configuration.
     * @param {function(number): number} config.emissionModel - Une fonction qui prend un prix de taxe et retourne les émissions totales (ex: en millions de tonnes).
     * @param {number} config.targetEmissions - Le niveau d'émission à ne pas dépasser.
     * @returns {function(number): boolean} Un prédicat qui prend un `taxPrice` et retourne `true` si l'objectif est atteint.
     */
    createCarbonTaxValidator({ emissionModel, targetEmissions }) {
        return function isEffective(taxPrice) {
            const currentEmissions = emissionModel(taxPrice);
            return currentEmissions <= targetEmissions;
        };
    },

    /**
     * Crée un prédicat pour évaluer l'impact d'une augmentation du salaire minimum.
     * @param {object} config - L'objet de configuration.
     * @param {function(number): number} config.jobLossModel - Une fonction qui prend un salaire horaire et retourne le % de perte d'emploi estimé.
     * @param {number} config.maxAcceptableJobLoss - Le seuil de perte d'emploi à ne pas dépasser (ex: 0.01 pour 1%).
     * @returns {function(number): boolean} Un prédicat qui prend un `hourlyWage` et retourne `true` si l'impact est jugé acceptable.
     */
    createMinimumWageValidator({ jobLossModel, maxAcceptableJobLoss }) {
        // Attention : ici, un salaire plus élevé est "moins bon" pour le prédicat.
        // La fonction `searchOnAnswer` cherche la première valeur qui retourne `true`.
        // On doit donc inverser la logique. On cherche le premier salaire qui est "inacceptable".
        return function isUnacceptable(hourlyWage) {
            const estimatedJobLoss = jobLossModel(hourlyWage);
            return estimatedJobLoss > maxAcceptableJobLoss;
        };
    },

    /**
     * Crée un prédicat pour un système de quota d'admission universitaire.
     * @param {object} config - L'objet de configuration.
     * @param {Array<number>} config.highSchoolSizes - Un tableau avec le nombre de diplômés par lycée.
     * @param {number} config.universityCapacity - Le nombre total de places disponibles.
     * @returns {function(number): boolean} Un prédicat qui prend un `quotaPercentage` (0 à 1) et retourne `true` si la capacité n'est pas dépassée.
     */
    createAdmissionQuotaValidator({ highSchoolSizes, universityCapacity }) {
        return function isWithinCapacity(quotaPercentage) {
            let admittedStudents = 0;
            for (const size of highSchoolSizes) {
                admittedStudents += Math.ceil(size * quotaPercentage);
            }
            return admittedStudents <= universityCapacity;
        };
    },

    /**
     * Crée un prédicat pour trouver un quota de récolte durable.
     * @param {object} config - L'objet de configuration.
     * @param {function(number): number} config.populationModel - Fonction qui prend le quota de l'année N et retourne la population de l'année N+1.
     * @param {number} config.initialPopulation - La population actuelle.
     * @returns {function(number): boolean} Un prédicat qui prend un `harvestQuota` et retourne `true` si la population reste stable ou augmente.
     */
    createSustainableHarvestValidator({ populationModel, initialPopulation }) {
        return function isSustainable(harvestQuota) {
            const nextYearPopulation = populationModel(harvestQuota);
            return nextYearPopulation >= initialPopulation;
        };
    },

    /**
     * Crée un prédicat pour une politique de libération anticipée.
     * @param {object} config - L'objet de configuration.
     * @param {Array<{sentenceLength: number, timeServed: number, riskScore: number}>} config.inmates - Données sur les détenus.
     * @param {number} config.targetPopulation - La population carcérale cible.
     * @param {number} config.maxAverageRisk - Le score de risque moyen acceptable pour le groupe libéré.
     * @param {number} config.currentPopulation - La population carcérale actuelle.
     * @returns {function(number): boolean} Un prédicat qui prend un `minSentenceServedPercentage` et retourne `true` si les conditions sont remplies.
     */
    createEarlyReleaseValidator({ inmates, targetPopulation, maxAverageRisk, currentPopulation }) {
        return function isViable(minSentenceServedPercentage) {
            const eligibleInmates = inmates.filter(p => (p.timeServed / p.sentenceLength) >= minSentenceServedPercentage);
            
            if (eligibleInmates.length === 0) {
                // Si personne n'est éligible, la population ne baisse pas.
                return currentPopulation <= targetPopulation;
            }

            const finalPopulation = currentPopulation - eligibleInmates.length;
            if (finalPopulation > targetPopulation) {
                return false; // Pas assez de libérations pour atteindre l'objectif.
            }

            const totalRisk = eligibleInmates.reduce((sum, p) => sum + p.riskScore, 0);
            const averageRisk = totalRisk / eligibleInmates.length;

            return averageRisk <= maxAverageRisk;
        };
    },

    /**
     * Crée un prédicat pour équilibrer la modération de contenu.
     * @param {object} config - L'objet de configuration.
     * @param {function(number): {workloadReduction: number, falsePositiveRate: number}} config.moderationModel - Modèle qui simule l'impact d'un seuil.
     * @param {number} config.minWorkloadReduction - L'objectif de réduction de charge de travail (ex: 0.9).
     * @param {number} config.maxFalsePositiveRate - Le taux de faux positifs à ne pas dépasser (ex: 0.001).
     * @returns {function(number): boolean} Un prédicat qui prend un `toxicityThreshold` et retourne `true` si les objectifs sont atteints.
     */
    createContentModerationValidator({ moderationModel, minWorkloadReduction, maxFalsePositiveRate }) {
        return function isBalanced(toxicityThreshold) {
            const { workloadReduction, falsePositiveRate } = moderationModel(toxicityThreshold);
            return workloadReduction >= minWorkloadReduction && falsePositiveRate <= maxFalsePositiveRate;
        };
    },

    /**
     * Crée un évaluateur pour trouver le prix qui maximise le revenu.
     * @param {object} config - L'objet de configuration.
     * @param {function(number): number} config.demandModel - Fonction qui prend un prix et retourne le nombre d'unités vendues.
     * @returns {function(number): number} Un évaluateur qui prend un `price` et retourne le revenu total.
     */
    createOptimalPricingModel({ demandModel }) {
        return function revenueEvaluator(price) {
            if (price < 0) return 0;
            const unitsSold = demandModel(price);
            return price * unitsSold;
        };
    },

    /**
     * Crée un évaluateur N-Dimensionnel pour le rendement d'une culture en fonction de multiples facteurs.
     * @param {object} config - L'objet de configuration.
     * @param {Array<{name: string, optimalAmount: number, weight: number, sensitivity: number}>} config.factors - Chaque facteur a une quantité optimale, un poids, et une sensibilité.
     * @param {number} config.baseYield - Le rendement de base sans aucun apport.
     * @returns {function(Array<number>): number} Un évaluateur qui prend un tableau de quantités (`amounts`) et retourne le rendement total. Le but est de MAXIMISER ce rendement.
     */
    createMultiFactorCropYieldModel({ factors, baseYield }) {
        return function multiFactorYieldEvaluator(amounts) {
            if (amounts.length !== factors.length) {
                throw new Error("Le nombre de quantités doit correspondre au nombre de facteurs.");
            }

            let totalYield = baseYield;
            for (let i = 0; i < factors.length; i++) {
                const factor = factors[i];
                const amount = amounts[i];
                if (amount < 0) return -Infinity; // Pénalité forte pour les valeurs impossibles

                const deviation = amount - factor.optimalAmount;
                // La sensibilité contrôle la "largeur" de la parabole. Une sensibilité élevée rend le rendement plus sensible aux écarts.
                totalYield += factor.weight - (factor.sensitivity * deviation * deviation) / (factor.optimalAmount + 1e-6);
            }
            return totalYield;
        };
    },

    /**
     * Crée un évaluateur pour le rendement d'une culture en fonction de la quantité d'engrais.
     * @param {object} config - L'objet de configuration.
     * @param {number} config.optimalAmount - La quantité d'engrais qui produit le rendement maximal.
     * @param {number} config.maxYield - Le rendement maximal possible.
     * @returns {function(number): number} Un évaluateur qui prend une `fertilizerAmount` et retourne le rendement.
     */
    createCropYieldModel({ optimalAmount, maxYield }) {
        // Modèle quadratique simple : le rendement diminue symétriquement autour de l'optimum.
        return function yieldEvaluator(fertilizerAmount) {
            if (fertilizerAmount < 0) return 0;
            const deviation = fertilizerAmount - optimalAmount;
            // La formule est une parabole inversée.
            const yieldValue = maxYield - (deviation * deviation) / optimalAmount;
            return Math.max(0, yieldValue); // Le rendement ne peut pas être négatif.
        };
    },

    /**
     * Crée un évaluateur pour la satisfaction utilisateur d'une durée d'animation.
     * @param {object} config - L'objet de configuration.
     * @param {number} config.idealDuration - La durée perçue comme parfaite (ex: 250ms).
     * @returns {function(number): number} Un évaluateur qui prend une `duration` et retourne un score de satisfaction.
     */
    createAnimationTimingModel({ idealDuration }) {
        // Modèle basé sur une fonction de Gauss. Le score est maximal à la durée idéale et chute rapidement.
        return function satisfactionEvaluator(duration) {
            if (duration <= 0) return 0;
            const deviation = duration - idealDuration;
            const sigma = idealDuration / 2; // L'écart-type contrôle la "tolérance" autour de l'idéal.
            return Math.exp(-(deviation * deviation) / (2 * sigma * sigma));
        };
    },

    /**
     * Crée un évaluateur pour le problème de la brachistochrone (toboggan le plus rapide).
     * @param {object} config - L'objet de configuration.
     * @param {{x: number, y: number}} config.startPoint - Le point de départ.
     * @param {{x: number, y: number}} config.endPoint - Le point d'arrivée.
     * @param {number} config.numPoints - Le nombre de points intermédiaires pour discrétiser la courbe.
     * @returns {function(Array<number>): number} Un évaluateur qui prend un tableau de hauteurs `y` et retourne le temps de descente.
     */
    createBrachistochroneEvaluator({ startPoint, endPoint, numPoints }) {
        const g = 9.81; // Accélération gravitationnelle
        const segmentLengthX = endPoint.x / (numPoints + 1);
        const epsilon = 1e-6; // Pour éviter la division par zéro au départ

        return function evaluateSlideTime(slideShape) {
            const points = [
                startPoint,
                ...slideShape.map((y, i) => ({ x: (i + 1) * segmentLengthX, y })),
                endPoint
            ];

            let totalTime = 0;
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i+1];

                const deltaX = p2.x - p1.x;
                const deltaY = p2.y - p1.y;
                const segmentDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                // Vitesse basée sur la conservation de l'énergie: v = sqrt(2*g*h)
                const v1 = Math.sqrt(2 * g * (startPoint.y - p1.y + epsilon));
                const v2 = Math.sqrt(2 * g * (startPoint.y - p2.y + epsilon));
                const avgVelocity = (v1 + v2) / 2;

                if (avgVelocity > 0) {
                    totalTime += segmentDistance / avgVelocity;
                }
            }
            return totalTime;
        };
    },

    /**
     * Crée une fonction qui calcule le gradient pour le problème de la brachistochrone.
     * @param {object} config - L'objet de configuration.
     * @param {{x: number, y: number}} config.startPoint - Le point de départ.
     * @param {{x: number, y: number}} config.endPoint - Le point d'arrivée.
     * @param {number} config.numPoints - Le nombre de points intermédiaires.
     * @returns {function(Array<number>): Array<number>} Une fonction qui retourne le gradient du temps de descente par rapport aux hauteurs `y`.
     */
    createBrachistochroneGradient({ startPoint, endPoint, numPoints }) {
        const evaluator = this.createBrachistochroneEvaluator({ startPoint, endPoint, numPoints });
        const h = 1e-5; // Petit pas pour la différenciation numérique

        return function calculateGradient(slideShape) {
            const gradient = [];
            const baseTime = evaluator(slideShape);

            for (let i = 0; i < slideShape.length; i++) {
                const newShape = [...slideShape];
                newShape[i] += h;
                const newTime = evaluator(newShape);
                
                // Dérivée partielle par différence finie
                const derivative = (newTime - baseTime) / h;
                gradient.push(derivative);
            }
            return gradient;
        };
    }
};

/**
 * @namespace Optimization
 * @description Une bibliothèque d'algorithmes d'optimisation pour des problèmes complexes (multimodaux, multidimensionnels).
 */
const Optimization = {
    /**
     * Trouve une bonne solution à un problème d'optimisation en utilisant le Recuit Simulé.
     * Cet algorithme est efficace pour trouver un optimum global dans un grand espace de recherche
     * avec de nombreux optima locaux (plusieurs "pics" ou "vallées").
     * @template TSolution - Le type de la solution (peut être un nombre, un tableau, un objet...).
     * @param {TSolution} initialSolution - Le point de départ de la recherche.
     * @param {function(TSolution): number} evaluator - Fonction qui évalue une solution. L'objectif est de minimiser ce score.
     * @param {function(TSolution): TSolution} neighbor - Fonction qui génère une solution "voisine" aléatoire.
     * @param {number} [initialTemperature=1000] - La température de départ.
     * @param {number} [coolingRate=0.995] - Le taux de refroidissement (proche de 1).
     * @param {number} [maxIterations=10000] - Le nombre total d'itérations.
     * @returns {{solution: TSolution, energy: number}} Le meilleur couple solution/score trouvé.
     */
    simulatedAnnealing(
        initialSolution,
        evaluator,
        neighbor,
        initialTemperature = 1000,
        coolingRate = 0.995,
        maxIterations = 10000
    ) {
        let currentSolution = initialSolution;
        let currentEnergy = evaluator(currentSolution);

        let bestSolution = currentSolution;
        let bestEnergy = currentEnergy;

        let temperature = initialTemperature;

        for (let i = 0; i < maxIterations; i++) {
            const newSolution = neighbor(currentSolution);
            const newEnergy = evaluator(newSolution);

            // Calcule la probabilité d'accepter une moins bonne solution.
            const acceptanceProbability = Math.exp((currentEnergy - newEnergy) / temperature);

            // Décide si on se déplace vers la nouvelle solution.
            if (newEnergy < currentEnergy || Math.random() < acceptanceProbability) {
                currentSolution = newSolution;
                currentEnergy = newEnergy;
            }

            // Met à jour la meilleure solution trouvée jusqu'à présent.
            if (currentEnergy < bestEnergy) {
                bestSolution = currentSolution;
                bestEnergy = currentEnergy;
            }

            // Refroidit la température.
            temperature *= coolingRate;
        }

        return { solution: bestSolution, energy: bestEnergy };
    },

    /**
     * Résout un problème d'optimisation en utilisant un Algorithme Génétique.
     * Idéal pour les problèmes complexes où l'espace de recherche est vaste et non-linéaire.
     * @template TChromosome - Le type de la solution (un "chromosome").
     * @param {function(): TChromosome} createIndividual - Fonction pour créer un individu aléatoire.
     * @param {function(TChromosome): number} fitnessFunction - Évalue un individu. L'objectif est de MINIMISER ce score.
     * @param {function(TChromosome, TChromosome): TChromosome} crossover - Croise deux parents pour créer un enfant.
     * @param {function(TChromosome): TChromosome} mutate - Applique une mutation aléatoire à un individu.
     * @param {object} options - Options de l'algorithme.
     * @param {number} [options.populationSize=100] - Taille de la population.
     * @param {number} [options.generations=100] - Nombre de générations à simuler.
     * @param {number} [options.crossoverRate=0.8] - Probabilité de croisement.
     * @param {number} [options.mutationRate=0.1] - Probabilité de mutation.
     * @param {function} [options.selectionFunction] - Fonction de sélection des parents. Par défaut, un tournoi.
     * @param {boolean} [options.returnPopulation=false] - Si true, retourne la population finale au lieu du meilleur individu.
     * @returns {{solution: TChromosome, fitness: number}} Le meilleur individu trouvé.
     */
    geneticAlgorithm(
        createIndividual,
        fitnessFunction,
        crossover,
        mutate,
        options = {}
    ) {
        const populationSize = options.populationSize || 100;
        const generations = options.generations || 100;
        const crossoverRate = options.crossoverRate !== undefined ? options.crossoverRate : 0.8;
        const mutationRate = options.mutationRate !== undefined ? options.mutationRate : 0.1;
        const selectionFunction = options.selectionFunction || this.Operators.createTournamentSelection({ size: 5 });
        const returnPopulation = options.returnPopulation || false;

        // 1. Initialisation
        // La population est un tableau d'objets { chromosome, fitness }
        // La fitness est calculée une seule fois par individu.
        let population = Array.from({ length: populationSize }, () => {
            const chromosome = createIndividual();
            return { chromosome, fitness: fitnessFunction(chromosome) };
        });

        // Trier la population initiale pour trouver le meilleur
        population.sort((a, b) => a.fitness - b.fitness);
        let bestOverall = population[0];

        // 2. Boucle des générations
        for (let gen = 0; gen < generations; gen++) {
            const newPopulation = [];

            // Élitisme : le meilleur individu de la génération précédente est conservé.
            // Il est déjà à l'index 0 grâce au tri à la fin de la boucle précédente.
            newPopulation.push(population[0]);

            while (newPopulation.length < populationSize) {
                // 3. Sélection
                const parent1 = selectionFunction(population);
                const parent2 = selectionFunction(population);

                let offspringChromosome;
                // 4. Croisement
                if (Math.random() < crossoverRate) {
                    offspringChromosome = crossover(parent1.chromosome, parent2.chromosome);
                } else {
                    offspringChromosome = parent1.chromosome;
                }

                // 5. Mutation
                if (Math.random() < mutationRate) {
                    offspringChromosome = mutate(offspringChromosome);
                }

                // S'assurer que les opérateurs ont bien retourné un individu
                if (offspringChromosome) {
                    newPopulation.push({
                        chromosome: offspringChromosome,
                        fitness: fitnessFunction(offspringChromosome)
                    });
                } else {
                    // Si le croisement/mutation échoue, on réinsère un parent pour garder la taille de la population
                    newPopulation.push(parent1);
                }
            }

            population = newPopulation;

            // Trier la nouvelle population pour la prochaine génération (élitisme) et la mise à jour du meilleur
            population.sort((a, b) => a.fitness - b.fitness);

            if (population[0].fitness < bestOverall.fitness) {
                bestOverall = population[0];
            }
        }

        if (returnPopulation) {
            return population;
        }

        return { solution: bestOverall.chromosome, fitness: bestOverall.fitness };
    },

    /**
     * Exécute un solveur stochastique plusieurs fois et retourne le meilleur résultat.
     * C'est une méta-heuristique pour augmenter la probabilité de trouver un optimum global
     * en échange d'un temps de calcul plus long.
     * @param {function(): {solution: any, energy?: number, fitness?: number}} solverFunction - Une fonction qui, lorsqu'elle est appelée, exécute un algorithme d'optimisation et retourne un objet résultat.
     * @param {number} numCycles - Le nombre de fois où exécuter le solveur.
     * @param {boolean} [logProgress=false] - Si true, affiche le score de chaque cycle dans la console.
     * @returns {{bestResult: object, stats: {scores: Array<number>, average: number, stdDev: number}}} Le meilleur résultat et des statistiques sur les exécutions.
     */
    runMultiple(solverFunction, numCycles, logProgress = false) {
        let bestResult = null;
        const allScores = [];

        for (let i = 0; i < numCycles; i++) {
            const currentResult = solverFunction();

            // Gère les résultats du Recuit Simulé (energy) et des Algorithmes Génétiques (fitness).
            // On suppose que pour les deux, un score plus bas est meilleur.
            const currentScore = currentResult.energy !== undefined ? currentResult.energy : currentResult.fitness;
            allScores.push(currentScore);

            if (logProgress) {
                console.log(`   -> Cycle ${i + 1}/${numCycles}: Score trouvé = ${currentScore.toFixed(2)}`);
            }

            if (!bestResult || currentScore < (bestResult.energy !== undefined ? bestResult.energy : bestResult.fitness)) {
                bestResult = currentResult;
            }
        }

        // Calcul des statistiques
        const sum = allScores.reduce((a, b) => a + b, 0);
        const average = sum / numCycles;
        const variance = allScores.reduce((a, b) => a + Math.pow(b - average, 2), 0) / numCycles;
        const stdDev = Math.sqrt(variance);

        return {
            bestResult,
            stats: {
                scores: allScores,
                average: average,
                stdDev: stdDev
            }
        };
    },

    /**
     * Trouve un minimum local d'une fonction en utilisant l'algorithme de Descente de Gradient.
     * Nécessite que la fonction soit différentiable et que son gradient soit connu.
     * @template TSolution - Le type de la solution (nombre ou tableau de nombres).
     * @param {TSolution} initialSolution - Le point de départ.
     * @param {function(TSolution): TSolution} gradientFunction - Fonction qui calcule le gradient au point donné.
     * @param {object} options - Options de l'algorithme.
     * @param {number} [options.learningRate=0.01] - Le "pas" de la descente.
     * @param {number} [options.maxIterations=1000] - Nombre d'itérations.
     * @param {number} [options.tolerance=1e-6] - Seuil pour arrêter si la solution ne change plus beaucoup.
     * @returns {TSolution} La solution (minimum local) trouvée.
     */
    gradientDescent(initialSolution, gradientFunction, options = {}) {
        const { learningRate = 0.01, maxIterations = 1000, tolerance = 1e-6 } = options;
    
        // Détection si la solution est un objet avec des méthodes vectorielles/quaternion
        const isObjectWithMethods = typeof initialSolution === 'object' && initialSolution !== null && 'sub' in initialSolution && 'scale' in initialSolution && 'copyFrom' in initialSolution;
    
        let currentSolution = isObjectWithMethods 
            ? Object.create(Object.getPrototypeOf(initialSolution)).copyFrom(initialSolution)
            : (Array.isArray(initialSolution) ? [...initialSolution] : initialSolution);
    
        for (let i = 0; i < maxIterations; i++) {
            const gradient = gradientFunction(currentSolution);
    
            if (isObjectWithMethods) {
                // Cas pour Quaternion, Vector3, etc.
                const step = gradient.scale(learningRate); // Calcule le pas de descente
                currentSolution.sub(step, currentSolution); // Applique le pas : solution = solution - (lr * gradient)
    
                // La vérification de la tolérance est plus complexe pour les objets, on l'ignore pour l'instant
                // pour se concentrer sur la correction du bug.
    
            } else if (Array.isArray(currentSolution)) {
                // Cas pour les tableaux de nombres
                const prevSolution = [...currentSolution];
                for (let j = 0; j < currentSolution.length; j++) {
                    currentSolution[j] -= learningRate * (gradient[j] || 0);
                }
                const change = prevSolution.reduce((sum, val, idx) => sum + Math.abs(val - currentSolution[idx]), 0);
                if (change < tolerance) break;
    
            } else {
                // Cas pour un simple nombre
                const prevSolution = currentSolution;
                currentSolution -= learningRate * gradient;
                if (Math.abs(prevSolution - currentSolution) < tolerance) break;
            }
        }
    
        return currentSolution;
    },

    /**
     * Exécute un solveur stochastique plusieurs fois en parallèle en utilisant un pool de workers pour éviter de surcharger le système.
     * @param {string} solverName - Le nom de la fonction solveur à appeler dans `Optimization.Operators`.
     * @param {Array<any>} baseSolverArgs - Les arguments de base à passer au solveur (sans les données aléatoires qui seront générées par worker).
     * @param {number} numCycles - Le nombre total de cycles à exécuter.
     * @param {boolean} [logProgress=false] - Si true, affiche la progression dans la console.
     * @param {object} [options={}] - Options pour la parallélisation.
     * @param {number} [options.concurrency] - Le nombre de workers à utiliser en parallèle. Par défaut, le nombre de cœurs CPU.
     * @returns {Promise<{bestResult: object, stats: {scores: Array<number>, average: number, stdDev: number}}>} Le meilleur résultat et des statistiques.
     */
    async runMultipleParallel(solverName, baseSolverArgs, numCycles, logProgress = false, options = {}) {
        const concurrency = options.concurrency || os.cpus().length;
        if (logProgress) {
            console.log(`   (Utilisation d'un pool de ${concurrency} workers pour ${numCycles} cycles)`);
        }

        const allResults = new Array(numCycles);
        const tasks = Array.from({ length: numCycles }, (_, i) => i);
        let tasksCompleted = 0;

        const runWorker = async (workerId) => {
            while (tasks.length > 0) {
                const taskIndex = tasks.shift();
                if (taskIndex === undefined) continue;

                const workerData = {
                    solverName,                    solverArgs: baseSolverArgs // Les arguments sont maintenant passés directement
                };

                const result = await new Promise((resolve, reject) => {
                    const worker = new Worker('./worker.js', { workerData });
                    worker.on('message', resolve);
                    worker.on('error', reject);
                    worker.on('exit', (code) => {
                        if (code !== 0) reject(new Error(`Worker ${workerId} a terminé avec le code ${code}`));
                    });
                });

                allResults[taskIndex] = result;
                tasksCompleted++;
                if (logProgress) {
                    const score = result.energy !== undefined ? result.energy : result.fitness;
                    console.log(`   -> Cycle ${tasksCompleted}/${numCycles} (Worker ${workerId}): Score = ${score.toFixed(2)}`);
                }
            }
        };

        const workerPromises = Array.from({ length: concurrency }, (_, i) => runWorker(i + 1));
        await Promise.all(workerPromises);

        // Le reste de la logique est identique à `runMultiple`
        let bestResult = null;
        const allScores = [];
        allResults.forEach(result => {
            const score = result.energy !== undefined ? result.energy : result.fitness;
            allScores.push(score);
            if (!bestResult || score < (bestResult.energy !== undefined ? bestResult.energy : bestResult.fitness)) {
                bestResult = result;
            }
        });

        const sum = allScores.reduce((a, b) => a + b, 0);
        const average = sum / numCycles;
        const variance = allScores.reduce((a, b) => a + Math.pow(b - average, 2), 0) / numCycles;
        const stdDev = Math.sqrt(variance);

        return {
            bestResult,
            stats: { scores: allScores, average, stdDev, concurrency }
        };
    }

};

/**
 * Détermine si la solution A domine la solution B en multi-objectifs (problème de minimisation).
 * @private
 * @param {number[]} objectivesA - Tableau des scores des objectifs pour la solution A.
 * @param {number[]} objectivesB - Tableau des scores des objectifs pour la solution B.
 * @returns {boolean} - True si A domine B.
 */
function paretoDominates(objectivesA, objectivesB) {
    let aIsBetterInOne = false;
    for (let i = 0; i < objectivesA.length; i++) {
        if (objectivesA[i] > objectivesB[i]) {
            return false; // A est pire sur au moins un objectif, donc ne domine pas.
        }
        if (objectivesA[i] < objectivesB[i]) {
            aIsBetterInOne = true; // A est strictement meilleur sur au moins un objectif.
        }
    }
    return aIsBetterInOne; // A domine B si elle n'est jamais pire et au moins une fois meilleure.
}

/**
 * Trie une population en fronts de Pareto non-dominés (inspiré de NSGA-II).
 * @private
 * @param {Array<{individual: any, objectives: number[]}>} populationWithObjectives - La population à trier.
 * @returns {Array<Array<{individual: any, objectives: number[]}>>} - Un tableau de fronts, où le premier est le meilleur.
 */
function nonDominatedSort(populationWithObjectives) {
    const fronts = [[]];
    for (const p1 of populationWithObjectives) {
        p1.dominationCount = 0;
        p1.dominatedSolutions = [];
        for (const p2 of populationWithObjectives) {
            if (p1 === p2) continue;
            if (paretoDominates(p1.objectives, p2.objectives)) {
                p1.dominatedSolutions.push(p2);
            } else if (paretoDominates(p2.objectives, p1.objectives)) {
                p1.dominationCount++;
            }
        }
        if (p1.dominationCount === 0) {
            p1.rank = 0;
            fronts[0].push(p1);
        }
    }

    let i = 0;
    while (fronts[i] && fronts[i].length > 0) {
        const nextFront = [];
        for (const p1 of fronts[i]) {
            for (const p2 of p1.dominatedSolutions) {
                p2.dominationCount--;
                if (p2.dominationCount === 0) {
                    p2.rank = i + 1;
                    nextFront.push(p2);
                }
            }
        }
        i++;
        if (nextFront.length > 0) {
            fronts[i] = nextFront;
        }
    }
    return fronts;
}


/**
 * Calcule la distance de promiscuité (crowding distance) pour un front, afin de préserver la diversité.
 * @private
 * @param {Array<{individual: any, objectives: number[]}>} front - Le front de Pareto.
 */
function calculateCrowdingDistance(front) {
    if (front.length === 0) return;
    front.forEach(p => p.crowdingDistance = 0);
    const numObjectives = front[0].objectives.length;

    for (let i = 0; i < numObjectives; i++) {
        front.sort((a, b) => a.objectives[i] - b.objectives[i]);
        const minObj = front[0].objectives[i];
        const maxObj = front[front.length - 1].objectives[i];

        // Les solutions aux extrémités sont cruciales, on leur donne une distance infinie.
        front[0].crowdingDistance = Infinity;
        front[front.length - 1].crowdingDistance = Infinity;

        if (maxObj === minObj) continue;

        for (let j = 1; j < front.length - 1; j++) {
            front[j].crowdingDistance += (front[j + 1].objectives[i] - front[j - 1].objectives[i]) / (maxObj - minObj);
        }
    }
}

/**
 * Algorithme génétique multi-objectifs (inspiré de NSGA-II) pour trouver un front de Pareto.
 * @param {function(): any} createIndividual - Fonction qui crée un individu aléatoire.
 * @param {function(any): number[]} fitnessFunction - Fonction qui évalue un individu et retourne un tableau d'objectifs à MINIMISER.
 * @param {function(any, any): any} crossover - Fonction de croisement.
 * @param {function(any): any} mutate - Fonction de mutation.
 * @param {object} options - Options de l'algorithme.
 * @returns {Array<{solution: any, objectives: number[]}>} Le premier front de Pareto (l'ensemble des meilleures solutions de compromis).
 */
Optimization.geneticAlgorithmMultiObjective = function(createIndividual, fitnessFunction, crossover, mutate, options = {}) {
    const { generations = 100, populationSize = 50, mutationRate = 0.1 } = options;

    let population = Array.from({ length: populationSize }, () => ({ individual: createIndividual() }));
    population.forEach(p => p.objectives = fitnessFunction(p.individual));

    for (let gen = 0; gen < generations; gen++) {
        // 1. Créer une population d'enfants
        const offspring = [];
        for (let i = 0; i < populationSize; i++) {
            // Sélection simple pour l'exemple
            const parent1 = population[Math.floor(Math.random() * population.length)];
            const parent2 = population[Math.floor(Math.random() * population.length)];
            let childIndividual = crossover(parent1.individual, parent2.individual);
            if (Math.random() < mutationRate) {
                childIndividual = mutate(childIndividual);
            }
            const child = { individual: childIndividual };
            child.objectives = fitnessFunction(child.individual);
            offspring.push(child);
        }

        // 2. Combiner parents et enfants
        const combinedPopulation = [...population, ...offspring];

        // 3. Trier la population combinée en fronts
        const fronts = nonDominatedSort(combinedPopulation);

        // 4. Construire la nouvelle population
        const newPopulation = [];
        for (const front of fronts) {
            if (newPopulation.length + front.length <= populationSize) {
                newPopulation.push(...front);
            } else {
                // Si le front est trop grand, on utilise la distance de promiscuité pour choisir les individus les plus diversifiés.
                calculateCrowdingDistance(front);
                front.sort((a, b) => b.crowdingDistance - a.crowdingDistance); // Trier par distance décroissante
                const remaining = populationSize - newPopulation.length;
                newPopulation.push(...front.slice(0, remaining));
                break;
            }
        }
        population = newPopulation;
    }

    // Retourner le premier front de la population finale
    const finalFronts = nonDominatedSort(population);
    const bestFront = finalFronts.length > 0 ? finalFronts[0] : [];

    // Filtrer le front pour ne garder que les solutions avec des objectifs uniques
    const uniqueSolutionsMap = new Map();
    for (const p of bestFront) {
        const key = JSON.stringify(p.objectives);
        if (!uniqueSolutionsMap.has(key)) {
            uniqueSolutionsMap.set(key, { solution: p.individual, objectives: p.objectives });
        }
    }
    return Array.from(uniqueSolutionsMap.values());
};

/**
 * @class BinarySearchTree
 * @description Implémentation d'un Arbre Binaire de Recherche.
 * Chaque noeud a une valeur, et des sous-arbres gauche/droit.
 */
Dichotomy.BinarySearchTree = class {
    constructor(comparator = Dichotomy._defaultComparator) {
        this.root = null;
        this.comparator = comparator;
    }

    /**
     * Insère une nouvelle valeur dans l'arbre.
     * @param {*} value 
     */
    insert(value) {
        const newNode = { value, left: null, right: null };
        if (!this.root) {
            this.root = newNode;
            return;
        }

        let current = this.root;
        while (true) {
            const comparison = this.comparator(value, current.value);
            if (comparison < 0) { // Aller à gauche
                if (!current.left) {
                    current.left = newNode;
                    return;
                }
                current = current.left;
            } else { // Aller à droite (ou si égal, pour permettre les doublons)
                if (!current.right) {
                    current.right = newNode;
                    return;
                }
                current = current.right;
            }
        }
    }

    /**
     * Vérifie si une valeur est présente dans l'arbre.
     * @param {*} value 
     * @returns {boolean}
     */
    contains(value) {
        let current = this.root;
        while (current) {
            const comparison = this.comparator(value, current.value);
            if (comparison === 0) {
                return true;
            } else if (comparison < 0) {
                current = current.left;
            } else {
                current = current.right;
            }
        }
        return false;
    }

    /**
     * Effectue un parcours In-Order (gauche, racine, droite) qui retourne les éléments triés.
     * @returns {Array<*>}
     */
    inOrderTraversal() {
        const result = [];
        function traverse(node) {
            if (node) {
                traverse(node.left);
                result.push(node.value);
                traverse(node.right);
            }
        }
        traverse(this.root);
        return result;
    }
}

/**
 * @namespace Optimization.Operators
 * @description Une bibliothèque de "fabriques d'évaluateurs" pour des problèmes d'optimisation complexes,
 * souvent multidimensionnels, à utiliser avec les algorithmes de `Optimization` (Recuit Simulé, Algorithmes Génétiques, etc.).
 */
Optimization.Operators = {}; // Création du namespace

/**
 * Crée une fonction de sélection par tournoi pour un algorithme génétique.
 * @param {object} [options] - Options pour le tournoi.
 * @param {number} [options.size=5] - Le nombre de participants par tournoi.
 * @returns {function(Array<{chromosome: any, fitness: number}>): {chromosome: any, fitness: number}} Une fonction de sélection.
 */
Optimization.Operators.createTournamentSelection = (options = {}) => {
    const tournamentSize = options.size || 5;

    return function tournamentSelection(population) {
        let best = null;

        for (let i = 0; i < tournamentSize; i++) {
            const individual = population[Math.floor(Math.random() * population.length)];
            if (!best || individual.fitness < best.fitness) {
                best = individual;
            }
        }
        // Retourne le meilleur trouvé. Dans le pire des cas (tous les scores sont Infinity),
        // on retourne le premier candidat sélectionné au lieu de null.
        if (!best) {
            return population[Math.floor(Math.random() * population.length)];
        }
        return best;
    };
};

/**
 * Crée une matrice de covariance à partir de coefficients de corrélation déclarés.
 * C'est une manière plus intuitive de définir les relations de risque entre les actifs.
 * @param {object} config - L'objet de configuration.
 * @param {Array<{name: string, volatility: number}>} config.assets - La liste des actifs avec leur volatilité.
 * @param {Array<{assets: [string, string], correlation: number}>} config.correlations - Une liste de relations de corrélation.
 * @returns {Array<Array<number>>} La matrice de covariance calculée.
 */
Optimization.Operators.createCovarianceMatrixFromCorrelations = ({ assets, correlations }) => {
    const n = assets.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));

    // Créer un map pour un accès rapide aux infos des actifs par leur nom.
    const assetInfo = new Map();
    assets.forEach((asset, index) => {
        assetInfo.set(asset.name, { index, volatility: asset.volatility });
    });

    // 1. Remplir la diagonale avec les variances (volatilité^2)
    for (let i = 0; i < n; i++) {
        const variance = Math.pow(assets[i].volatility, 2);
        matrix[i][i] = variance;
    }

    // 2. Remplir les autres cellules avec les covariances calculées
    for (const corr of correlations) {
        const [nameA, nameB] = corr.assets;
        if (!assetInfo.has(nameA) || !assetInfo.has(nameB)) {
            console.warn(`Avertissement: L'un des actifs [${nameA}, ${nameB}] n'a pas été trouvé. La corrélation est ignorée.`);
            continue;
        }

        const infoA = assetInfo.get(nameA);
        const infoB = assetInfo.get(nameB);

        // Cov(A,B) = Corr(A,B) * Vol(A) * Vol(B)
        const covariance = corr.correlation * infoA.volatility * infoB.volatility;

        matrix[infoA.index][infoB.index] = covariance;
        matrix[infoB.index][infoA.index] = covariance; // La matrice est symétrique
    }

    return matrix;
};

// Le "déséquilibre" est la différence absolue entre l'offre et la demande. On veut le minimiser.
Optimization.Operators.createMarketEquilibriumEvaluator = (demandModel, supplyModel) => {
    return function marketImbalance(price) {
        const d = demandModel(price);
        const s = supplyModel(price);
        return Math.abs(d - s);
    };
};

// Un "individu" est un tableau de 3 poids (ex: [0.5, 0.2, 0.3]) qui doivent sommer à 1.
/**
 * Crée une fonction de fitness pour l'optimisation de portefeuille.
 * @param {object} config - L'objet de configuration.
 * @param {Array<{name: string, expectedReturn: number, volatility: number}>} config.assets - Les actifs disponibles.
 * @param {number} config.maxVolatility - La contrainte de volatilité maximale du portefeuille.
 * @param {Array<Array<number>>} [config.covarianceMatrix] - Matrice de covariance pour un calcul de risque précis.
 * @returns {function(Array<number>): number} Une fonction de fitness qui évalue un portefeuille (tableau de poids).
 */
Optimization.Operators.createPortfolioAllocator = ({ assets, maxVolatility, covarianceMatrix }) => {
    // La fonction de fitness évalue un portefeuille (un tableau de poids).
    // L'objectif est de MINIMISER le score, donc on minimise le rendement NÉGATIF.
    return function portfolioFitness(weights) {
        // Normaliser les poids pour qu'ils somment à 1
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        if (totalWeight === 0) return Infinity; // Éviter la division par zéro, score très mauvais
        const normalizedWeights = weights.map(w => w / totalWeight);

        let portfolioReturn = normalizedWeights.reduce((sum, w, i) => sum + w * assets[i].expectedReturn, 0);
        let portfolioVolatility;

        if (covarianceMatrix) {
            // Calcul de la volatilité avec la matrice de covariance (plus précis)
            // Volatilité^2 = w' * C * w
            let variance = 0;
            for (let i = 0; i < assets.length; i++) {
                for (let j = 0; j < assets.length; j++) {
                    variance += normalizedWeights[i] * normalizedWeights[j] * covarianceMatrix[i][j];
                }
            }
            portfolioVolatility = Math.sqrt(variance);
        } else {
            // Calcul simplifié (moins précis) : moyenne pondérée des volatilités individuelles.
            portfolioVolatility = normalizedWeights.reduce((sum, w, i) => sum + w * assets[i].volatility, 0);
        }

        for (let i = 0; i < assets.length; i++) {
        }

        // Forte pénalité si la contrainte de risque n'est pas respectée.
        if (portfolioVolatility > maxVolatility) {
            return 1000 + (portfolioVolatility - maxVolatility) * 1000; // Pénalité proportionnelle à la violation.
        }

        // On veut maximiser le rendement, donc on minimise son opposé.
        return -portfolioReturn;
    };
};

/**
 * Crée un solveur complet pour le problème du voyageur de commerce (TSP) en utilisant le Recuit Simulé.
 * Cette fonction factorise la création de l'évaluateur de chemin et de la fonction de voisinage.
 * @param {Array<{x: number, y: number}>} cities - Un tableau d'objets représentant les coordonnées des villes.
 * @param {object} [options] - Options pour l'algorithme de recuit simulé.
 * @returns {{solution: Array<number>, energy: number}} Le chemin optimal (indices des villes) et sa distance.
 */
Optimization.Operators.solveTSP = (cities, options = {}) => {
    // Fonction interne pour calculer la distance entre deux villes.
    const distance = (city1, city2) => Math.sqrt(Math.pow(city1.x - city2.x, 2) + Math.pow(city1.y - city2.y, 2));

    // Évaluateur : calcule la longueur totale d'un chemin donné.
    const pathEvaluator = (path) => {
        let totalDistance = 0;
        for (let i = 0; i < path.length - 1; i++) {
            totalDistance += distance(cities[path[i]], cities[path[i + 1]]);
        }
        totalDistance += distance(cities[path[path.length - 1]], cities[path[0]]); // Retour au départ
        return totalDistance;
    };

    // Voisinage : génère un chemin voisin en inversant une sous-séquence (heuristique 2-opt).
    const pathNeighbor = (path) => {
        const newPath = [...path];
        let i = Math.floor(Math.random() * newPath.length);
        let j = Math.floor(Math.random() * newPath.length);
        if (i === j) j = (j + 1) % newPath.length;
        const [start, end] = [Math.min(i, j), Math.max(i, j)];
        
        const segment = newPath.slice(start, end + 1).reverse();
        newPath.splice(start, segment.length, ...segment);
        return newPath;
    };

    // Solution initiale : un chemin aléatoire.
    const initialPath = Array.from({ length: cities.length }, (_, i) => i).sort(() => Math.random() - 0.5);

    // Paramètres par défaut pour le TSP, pouvant être surchargés par `options`.
    const saOptions = {
        initialTemperature: 10000,
        coolingRate: 0.999,
        maxIterations: 100000,
        ...options
    };

    return Optimization.simulatedAnnealing(initialPath, pathEvaluator, pathNeighbor, saOptions.initialTemperature, saOptions.coolingRate, saOptions.maxIterations);
};

/**
 * Crée un solveur complet pour le problème d'optimisation de portefeuille en utilisant un Algorithme Génétique.
 * @param {Array<{name: string, expectedReturn: number, volatility: number}>} assets - Les actifs disponibles.
 * @param {number} maxVolatility - La contrainte de volatilité maximale du portefeuille.
 * @param {object} [options] - Options pour l'algorithme génétique.
 * @returns {{solution: Array<number>, fitness: number}} L'allocation de poids optimale et le score de fitness associé.
 */
Optimization.Operators.solvePortfolio = (assets, maxVolatility, options = {}) => {
    // La fonction de fitness est créée par notre opérateur existant.
    const fitnessFunction = Optimization.Operators.createPortfolioAllocator({ assets, maxVolatility, covarianceMatrix: options.covarianceMatrix });

    // Fonctions spécifiques au problème pour l'AG, maintenant encapsulées.
    const createIndividual = () => Array.from({ length: assets.length }, () => Math.random());
    
    const crossover = (p1, p2) => p1.map((w1, i) => (w1 + p2[i]) / 2); // Moyenne des poids
    
    const mutate = (p) => {
        const newP = [...p];
        const i = Math.floor(Math.random() * newP.length);
        newP[i] += (Math.random() - 0.5) * 0.2; // Mutation douce
        newP[i] = Math.max(0, newP[i]); // Les poids ne peuvent être négatifs
        return newP;
    };

    const gaOptions = {
        generations: 150,
        populationSize: 100,
        ...options
    };

    return Optimization.geneticAlgorithm(createIndividual, fitnessFunction, crossover, mutate, gaOptions);
};

/**
 * Crée un solveur pour le problème de placement d'infrastructures (Facility Location Problem).
 * @param {Array<{x: number, y: number}>} customers - Coordonnées des clients.
 * @param {number} numFacilities - Le nombre d'infrastructures à placer.
 * @param {{minX: number, maxX: number, minY: number, maxY: number}} bounds - Les limites de la carte où placer les infrastructures.
 * @param {number} [options.fixedCostPerFacility=0] - Coût fixe pour chaque infrastructure installée.
 * @param {object} [options] - Options pour le recuit simulé.
 * @returns {{solution: Array<{x: number, y: number}>, energy: number}} Les coordonnées optimales des infrastructures et le coût total.
 */
Optimization.Operators.solveFacilityLocation = (customers, numFacilities, bounds, options = {}) => {
    const fixedCostPerFacility = options.fixedCostPerFacility || 0;
    const distanceSq = (p1, p2) => Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2); // On utilise la distance au carré pour l'efficacité

    // Évaluateur : calcule la somme des distances de chaque client à son infrastructure la plus proche.
    const facilityEvaluator = (facilities) => {
        let totalConnectionCost = 0;
        for (const customer of customers) {
            let minDistanceToCustomer = Infinity;
            for (const facility of facilities) {
                const d = distanceSq(customer, facility);
                if (d < minDistanceToCustomer) {
                    minDistanceToCustomer = d;
                }
            }
            totalConnectionCost += Math.sqrt(minDistanceToCustomer); // On utilise la vraie distance pour le coût
        }
        // Le coût total est la somme des coûts de connexion + le coût fixe des infrastructures.
        return totalConnectionCost + (facilities.length * fixedCostPerFacility);
    };

    // Voisinage : déplace légèrement une infrastructure au hasard.
    const facilityNeighbor = (facilities) => {
        const newFacilities = facilities.map(f => ({...f}));
        const i = Math.floor(Math.random() * numFacilities);
        const moveX = (Math.random() - 0.5) * (bounds.maxX - bounds.minX) * 0.1;
        const moveY = (Math.random() - 0.5) * (bounds.maxY - bounds.minY) * 0.1;

        newFacilities[i].x = Math.max(bounds.minX, Math.min(bounds.maxX, newFacilities[i].x + moveX));
        newFacilities[i].y = Math.max(bounds.minY, Math.min(bounds.maxY, newFacilities[i].y + moveY));

        return newFacilities;
    };

    // Solution initiale : place les infrastructures au hasard sur la carte.
    const initialFacilities = Array.from({ length: numFacilities }, () => ({
        x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
        y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY)
    }));

    const saOptions = {
        initialTemperature: 100000,
        coolingRate: 0.999,
        maxIterations: 50000,
        ...options
    };

    const result = Optimization.simulatedAnnealing(
        initialFacilities,
        facilityEvaluator,
        facilityNeighbor,
        saOptions.initialTemperature,
        saOptions.coolingRate,
        saOptions.maxIterations
    );

    return result;
};

export { Dichotomy, Optimization };