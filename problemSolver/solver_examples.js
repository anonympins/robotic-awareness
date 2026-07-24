/**
 * @file @/testiment.js
 * @description Fichier d'exemples et de tests pour la bibliothèque d'optimisation.
 * Ce fichier importe la bibliothèque depuis `library.js` et démontre son utilisation
 * à travers une série de problèmes concrets.
 */

import { Dichotomy, Optimization } from './library.js';

/**
 * @namespace Dichotomy
 * @description Un ensemble d'outils de recherche puissants pour les tableaux triés.
 */

// --- EXEMPLES D'UTILISATION ---

console.log("--- Démonstration de la bibliothèque Dichotomy ---");

const sortedNumbers = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
const numbersWithDuplicates = [1, 2, 4, 4, 4, 4, 4, 8, 9, 11, 11, 15];

const users = [
    { id: 1, name: 'Alice', age: 25 },
    { id: 3, name: 'Bob', age: 30 },
    { id: 4, name: 'Charlie', age: 30 },
    { id: 8, name: 'David', age: 35 },
    { id: 12, name: 'Eve', age: 40 },
];

// --- Définition d'un comparateur pour les objets 'user' ---
const userAgeComparator = (user, targetAge) => {
    if (user.age < targetAge) return -1;
    if (user.age > targetAge) return 1;
    return 0;
};

console.log("\n1. Recherche de base (Dichotomy.search)");
console.log(`Tableau: [${sortedNumbers}]`);
console.log(`Chercher 23: index ${Dichotomy.search(sortedNumbers, 23)}`); // Devrait être 5
console.log(`Chercher 15: index ${Dichotomy.search(sortedNumbers, 15)}`); // Devrait être -1

console.log("\n2. Recherche sur un tableau d'objets (avec comparateur)");
console.log(`Cherche un utilisateur de 30 ans: index ${Dichotomy.search(users, 30, userAgeComparator)}`); // 1 ou 2

console.log("\n3. Recherche de la première/dernière occurrence");
console.log(`Tableau: [${numbersWithDuplicates}]`);
console.log(`Première occurrence de 4: index ${Dichotomy.findFirst(numbersWithDuplicates, 4)}`); // Devrait être 2
console.log(`Dernière occurrence de 4: index ${Dichotomy.findLast(numbersWithDuplicates, 4)}`); // Devrait être 6
console.log(`Nombre d'utilisateurs de 30 ans: ${Dichotomy.countOccurrences(users, 30, userAgeComparator)}`); // Devrait être 2

console.log("\n4. Point d'insertion (pour maintenir le tri)");
console.log(`Tableau: [${sortedNumbers}]`);
console.log(`Point d'insertion pour 1: ${Dichotomy.findInsertionPoint(sortedNumbers, 1)}`);   // Devrait être 0
console.log(`Point d'insertion pour 25: ${Dichotomy.findInsertionPoint(sortedNumbers, 25)}`); // Devrait être 6

console.log("\n--- NOUVELLES FONCTIONNALITÉS ---");

console.log("\n5. Recherche d'un intervalle (findRange)");
const ageRange = Dichotomy.findRange(users, 30, 35, userAgeComparator);
console.log("Utilisateurs entre 30 et 35 ans (inclus):", ageRange.map(u => u.name)); // Devrait être ['Bob', 'Charlie', 'David']

console.log("\n6. Recherche de l'élément le plus proche (findClosest)");
const distanceToTarget = (val, target) => val - target;
console.log(`Tableau: [${sortedNumbers}]`);
const closestIndex = Dichotomy.findClosest(sortedNumbers, 60, distanceToTarget);
console.log(`Le plus proche de 60: index ${closestIndex} (valeur: ${sortedNumbers[closestIndex]})`); // 56 (index 7)

console.log("\n7. Recherche de frontière (findBoundary)");
const dataWithBoundary = [false, false, false, true, true, true, true];
const boundaryIndex = Dichotomy.findBoundary(dataWithBoundary, (val) => val === true);
console.log(`Frontière dans [${dataWithBoundary}]: index ${boundaryIndex}`); // Devrait être 3
const firstAdultIndex = Dichotomy.findBoundary(users, (user) => user.age >= 30);
console.log(`Premier utilisateur d'au moins 30 ans: ${users[firstAdultIndex].name}`); // Devrait être Bob

console.log("\n8. Arbre Binaire de Recherche (BinarySearchTree)");
const bst = new Dichotomy.BinarySearchTree();
[10, 5, 15, 3, 7, 12, 18].forEach(v => bst.insert(v));
console.log(`L'arbre contient 7 ? ${bst.contains(7)}`); // true
console.log(`L'arbre contient 9 ? ${bst.contains(9)}`); // false
console.log(`Parcours trié (In-Order): [${bst.inOrderTraversal()}]`); // [3, 5, 7, 10, 12, 15, 18]

console.log("\n9. Recherche sur la réponse (searchOnAnswer)");
// Problème : Quelle est la racine carrée de 81 ?
// On cherche un nombre 'x' tel que x*x >= 81.
const sqrtOf = 81;
const predicate = (x) => x * x >= sqrtOf;
const result = Dichotomy.searchOnAnswer(0, sqrtOf, predicate, 1e-9);
console.log(`Racine carrée de ${sqrtOf} (approximative): ${result}`); // Devrait être très proche de 9

// Problème : On a 50 objets à charger. Un camion peut faire 3 voyages.
// Quelle est la capacité minimale du camion pour tout transporter ?
// Les poids des objets sont dans un tableau.
const items = Array.from({length: 50}, () => 1 + Math.random() * 99); // 50 objets entre 1 et 100kg
const itemWeights = items.map(Math.floor);
const totalWeight = itemWeights.reduce((a, b) => a + b, 0);

// 1. On crée notre opérateur (prédicat) spécialisé
const canShipIn3Trips = Dichotomy.Operators.createShippingValidator({ itemSizes: itemWeights, maxTrips: 3 });

// 2. On lance le "moteur de recherche" avec ce prédicat
const minCapacity = Dichotomy.searchOnAnswer(1, totalWeight, canShipIn3Trips, 1);
console.log(`Capacité minimale du camion pour 3 voyages : ${Math.ceil(minCapacity)} kg`);


console.log("\n--- EXEMPLES ÉTHIQUES ET SOCIÉTAUX ---");

console.log("\n10. Allocation Équitable de Ressources");
// 5 écoles avec des besoins de base différents. Budget total de 500'000€.
const schoolNeeds = [80000, 60000, 120000, 95000, 70000];
const totalBudget = 500000;
const resourcePredicate = Dichotomy.Operators.createFairResourceAllocator({ baseNeeds: schoolNeeds, totalBudget });
// On cherche le niveau de base garanti le plus haut possible.
// Le pire cas est que tout le budget va à une école, le meilleur est une division parfaite.
// Pour trouver la dernière valeur `true` (le plus haut niveau), on cherche la première `false` et on prend la valeur juste avant.
const invertedResourcePredicate = (level) => !resourcePredicate(level);
const firstUnfeasibleLevel = Dichotomy.searchOnAnswer(0, totalBudget, invertedResourcePredicate, 1);
const maxGuaranteedLevel = firstUnfeasibleLevel - 1;
console.log(`Niveau de financement de base maximal garanti par école: ${Math.floor(maxGuaranteedLevel).toLocaleString('fr-FR')}€`);

console.log("\n11. Santé Publique et Immunité Collective");
const r0_covid_delta = 6.0; // R0 estimé pour le variant Delta
const immunityPredicate = Dichotomy.Operators.createHerdImmunityValidator({ r0: r0_covid_delta });
// On cherche le taux d'immunité minimal (entre 0% et 100%)
const requiredImmunity = Dichotomy.searchOnAnswer(0, 1, immunityPredicate, 1e-5);
console.log(`Pour un R0 de ${r0_covid_delta}, le taux d'immunité requis est d'au moins ${(requiredImmunity * 100).toFixed(2)}%`);

console.log("\n12. Correction de Biais Algorithmique");
// Scores d'un modèle de prêt. Le groupe B est historiquement désavantagé.
const scoresA = [750, 800, 680, 720, 790]; // Moyenne: 748
const scoresB = [650, 710, 620, 600, 660]; // Moyenne: 648
const avgA = scoresA.reduce((a,b)=>a+b,0)/scoresA.length;
const avgB = scoresB.reduce((a,b)=>a+b,0)/scoresB.length;
console.log(`Score moyen initial - Groupe A: ${avgA}, Groupe B: ${avgB} (Écart: ${((avgA-avgB)/avgA*100).toFixed(2)}%)`);

// Objectif : réduire l'écart à moins de 2%
const fairnessPredicate = Dichotomy.Operators.createFairnessThresholdValidator({ scoresGroupA: scoresA, scoresGroupB: scoresB, maxAllowedDisparity: 0.02 });
// On cherche un bonus entre 0 et la différence des moyennes.
const requiredBonus = Dichotomy.searchOnAnswer(0, avgA - avgB, fairnessPredicate, 0.1);
console.log(`Bonus de score minimal requis pour le groupe B: ${requiredBonus.toFixed(2)} points`);
const avgB_corrected = avgB + requiredBonus;
console.log(`Nouveau score moyen - Groupe A: ${avgA.toFixed(2)}, Groupe B (corrigé): ${avgB_corrected.toFixed(2)} (Nouvel écart: ${((avgA-avgB_corrected)/avgA*100).toFixed(2)}%)`);

console.log("\n--- AUTRES EXEMPLES POUR LA SOCIÉTÉ ---");

console.log("\n13. Écologie et Taxe Carbone");
// Modèle simple : sans taxe, on émet 500M de tonnes. Chaque 10€ de taxe réduit les émissions de 5%.
const initialEmissions = 500;
const emissionModel = (taxPrice) => initialEmissions * Math.pow(0.95, taxPrice / 10);
const targetEmissions = 400; // Objectif : réduire de 500M à 400M de tonnes.
const carbonTaxPredicate = Dichotomy.Operators.createCarbonTaxValidator({ emissionModel, targetEmissions });
const requiredTax = Dichotomy.searchOnAnswer(0, 500, carbonTaxPredicate, 0.1);
console.log(`Pour atteindre ${targetEmissions}M de tonnes, il faut une taxe carbone d'au moins: ${requiredTax.toFixed(2)}€/tonne`);

console.log("\n14. Économie et Salaire Minimum");
// Modèle simple : chaque dollar au-dessus de 10$/h augmente la perte d'emploi de 0.1%.
const jobLossModel = (wage) => (wage > 10 ? (wage - 10) * 0.001 : 0);
const maxLoss = 0.01; // 1% de perte d'emploi maxacceptable
// On cherche le premier salaire INACCEPTABLE.
const wagePredicate = Dichotomy.Operators.createMinimumWageValidator({ jobLossModel, maxAcceptableJobLoss: maxLoss });
const firstUnacceptableWage = Dichotomy.searchOnAnswer(10, 50, wagePredicate, 0.01);
// Le salaire maximum acceptable est juste en dessous de cette valeur.
const maxAcceptableWage = firstUnacceptableWage - 0.01;
console.log(`Le salaire minimum le plus élevé pour moins de ${maxLoss*100}% de perte d'emploi est: ${maxAcceptableWage.toFixed(2)}$/h`);

console.log("\n15. Éducation et Égalité des Chances");
// 10 lycées de tailles différentes. L'université a 1000 places.
const highSchoolSizes = [500, 120, 80, 250, 300, 180, 400, 90, 220, 310];
const universityCapacity = 1000;
// Ici, le prédicat est inversé : un % plus élevé est "meilleur" tant que c'est `true`.
// On cherche la dernière valeur `true`. On peut faire ça en cherchant la première `false`
// dans un `searchOnAnswer` inversé, ou plus simplement en adaptant la recherche.
const admissionPredicate = Dichotomy.Operators.createAdmissionQuotaValidator({ highSchoolSizes, universityCapacity });

// Pour trouver la dernière valeur `true`, on peut chercher la première `false` et prendre la valeur d'avant.
const invertedPredicate = (p) => !admissionPredicate(p);
const firstBadPercentage = Dichotomy.searchOnAnswer(0, 1, invertedPredicate, 1e-4);
const maxGoodPercentage = firstBadPercentage - 1e-4;

console.log(`L'université peut admettre automatiquement les ${(maxGoodPercentage * 100).toFixed(2)}% meilleurs de chaque lycée.`);
const totalAdmitted = highSchoolSizes.reduce((sum, size) => sum + Math.ceil(size * maxGoodPercentage), 0);
console.log(`Cela représente ${totalAdmitted} étudiants pour ${universityCapacity} places.`);

console.log("\n--- DERNIERS EXEMPLES CONCEPTUELS ---");

console.log("\n16. Écologie et Pêche Durable");
// Modèle simple : la population de poissons double chaque année, moins ce qui est pêché.
const initialFishStock = 10000; // 10,000 tonnes
const fishPopulationModel = (quota) => (initialFishStock - quota) * 2;
const sustainabilityPredicate = Dichotomy.Operators.createSustainableHarvestValidator({ populationModel: fishPopulationModel, initialPopulation: initialFishStock });
// On cherche le dernier quota qui est `true`. On cherche donc le premier `false`.
const firstUnsustainableQuota = Dichotomy.searchOnAnswer(0, initialFishStock, (q) => !sustainabilityPredicate(q), 1);
const maxSustainableQuota = firstUnsustainableQuota - 1;
console.log(`Le quota de pêche durable maximal est de ${Math.floor(maxSustainableQuota)} tonnes.`);

console.log("\n17. Justice et Sursis Pénal");
// 10 détenus non-violents. Population actuelle: 110, Cible: 100. Risque moyen max: 0.2
const inmates = [
    { sentenceLength: 60, timeServed: 55, riskScore: 0.1 }, { sentenceLength: 24, timeServed: 20, riskScore: 0.3 },
    { sentenceLength: 36, timeServed: 34, riskScore: 0.15 }, { sentenceLength: 120, timeServed: 65, riskScore: 0.25 },
    { sentenceLength: 48, timeServed: 25, riskScore: 0.4 }, { sentenceLength: 84, timeServed: 70, riskScore: 0.1 },
    { sentenceLength: 24, timeServed: 22, riskScore: 0.18 }, { sentenceLength: 60, timeServed: 32, riskScore: 0.35 },
    { sentenceLength: 72, timeServed: 70, riskScore: 0.05 }, { sentenceLength: 36, timeServed: 20, riskScore: 0.22 },
];
const earlyReleasePredicate = Dichotomy.Operators.createEarlyReleaseValidator({
    inmates,
    targetPopulation: 100,
    maxAverageRisk: 0.2,
    currentPopulation: 110
});
// On cherche le % de peine purgée minimum. Un % plus élevé est plus strict (moins de libérés).
// Le prédicat devient `true` quand le % est assez élevé pour que les conditions soient respectées.
const minSentencePercentage = Dichotomy.searchOnAnswer(0, 1, earlyReleasePredicate, 0.01);
console.log(`Pour atteindre les objectifs, les détenus doivent avoir purgé au moins ${(minSentencePercentage * 100).toFixed(0)}% de leur peine.`);

console.log("\n18. Modération de Contenu et Santé Mentale");
// Modèle : plus le seuil de toxicité est élevé, moins on bloque de choses.
const moderationModel = (threshold) => {
    // Simulation très simpliste
    const workloadReduction = 1 - threshold; // Seuil à 0.8 -> 20% de la charge reste. Réduction de 80%.
    const falsePositiveRate = Math.pow(1 - threshold, 3) * 0.01; // Le taux de faux positifs diminue vite avec le seuil.
    return { workloadReduction, falsePositiveRate };
};
const minWorkloadRed = 0.9; // Réduire la charge de 90%
const maxFP = 0.001; // Moins de 0.1% de faux positifs
const moderationPredicate = Dichotomy.Operators.createContentModerationValidator({
    moderationModel,
    minWorkloadReduction: minWorkloadRed,
    maxFalsePositiveRate: maxFP
});
// On cherche un seuil. Un seuil plus bas est plus agressif.
// Le prédicat est `false` pour les seuils bas (trop de FP) et `false` pour les seuils hauts (pas assez de réduction).
// Ce problème n'est pas monotone ! `searchOnAnswer` ne s'applique pas directement.
// Cela montre les limites du pattern : il faut une propriété monotone..
// Pour le résoudre, il faut trouver le "pic" de la fonction d'évaluation.

// On définit une fonction d'évaluation qui retourne un score (plus il est haut, mieux c'est).
// Ici, un score de 1 signifie que les deux conditions sont respectées, sinon 0.
const moderationEvaluator = (threshold) => {
    const { workloadReduction, falsePositiveRate } = moderationModel(threshold);
    const conditionsMet = workloadReduction >= minWorkloadRed && falsePositiveRate <= maxFP;
    
    if (conditionsMet) {
        // Si les conditions sont respectées, on veut maximiser la réduction de charge.
        return workloadReduction;
    } else {
        // Sinon, on retourne une forte pénalité, proportionnelle à la violation des contraintes.
        return -1 - Math.max(0, minWorkloadRed - workloadReduction) - Math.max(0, falsePositiveRate - maxFP) * 1000;
    }
};

const optimalThreshold = Dichotomy.findPeak(0, 1, moderationEvaluator, 1e-4);
console.log(`Le problème de modération n'est pas monotone. On utilise findPeak.`);
console.log(`Le seuil optimal trouvé est d'environ: ${optimalThreshold.toFixed(3)}`);
const resultAtPeak = moderationModel(optimalThreshold);
console.log(`A ce seuil, la réduction de charge est de ${(resultAtPeak.workloadReduction * 100).toFixed(1)}% et le taux de FP est de ${(resultAtPeak.falsePositiveRate * 100).toFixed(3)}%`);

console.log("\n--- TROUVER LE COMPROMIS OPTIMAL (findPeak) ---");

console.log("\n19. Stratégie Commerciale : Prix Optimal");
// Modèle de demande : à 0€, on vend 2000 unités. Chaque euro de plus réduit les ventes de 10 unités.
const demandModel = (price) => Math.max(0, 2000 - 10 * price);
const revenueEvaluator = Dichotomy.Operators.createOptimalPricingModel({ demandModel });
// On cherche le prix optimal entre 0€ et 200€ (au-delà, les ventes sont nulles).
const optimalPrice = Dichotomy.findPeak(0, 200, revenueEvaluator, 0.01);
const maxRevenue = revenueEvaluator(optimalPrice);
console.log(`Le prix optimal pour maximiser le revenu est de ${optimalPrice.toFixed(2)}€.`);
console.log(`Revenu maximal estimé: ${maxRevenue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`);

console.log("\n20. Programmation Génétique : Découverte de Formule");
// Problème : Retrouver la formule f(x) = x^2 + 3x + 5 à partir de quelques points.
// C'est un problème de régression symbolique. La solution n'est pas un nombre, mais un arbre de syntaxe.
const samplePoints = [{x: 1, y: 9}, {x: 2, y: 15}, {x: 3, y: 23}, {x: -1, y: 3}];

// Un AG spécialisé (programmation génétique) manipulerait des arbres représentant des formules.
// createIndividual -> crée une formule aléatoire comme `(+ x 5)` ou `(* 2 x)`
// fitnessFunction -> évalue l'erreur de la formule sur les points de test
// crossover -> échange des branches entre deux formules parentes
// mutate -> change un noeud (ex: `+` devient `*`) ou une valeur.
console.log("La programmation génétique permet de rechercher des programmes ou des formules.");
console.log("C'est un problème d'une complexité supérieure car l'espace de recherche est structurel.");

console.log("\n21. Expérience Utilisateur : Durée d'Animation Idéale");
// Les designers estiment que la durée idéale est de 280ms.
const satisfactionEvaluator = Dichotomy.Operators.createAnimationTimingModel({ idealDuration: 280 });
const idealDuration = Dichotomy.findPeak(50, 800, satisfactionEvaluator, 1);
console.log(`La durée d'animation qui maximise la satisfaction utilisateur est d'environ ${idealDuration.toFixed(0)}ms.`);


console.log("\n--- NOUVEAUX OPÉRATEURS ET PROBLÈMES N-D ---");

console.log("\n22. Économie : Recherche du Point d'Équilibre du Marché");
// On cherche le prix où l'offre est égale à la demande.
// Modèle de demande : plus le prix est haut, moins les gens achètent.
const demand = (price) => Math.max(0, 1000 - 2 * price);
// Modèle d'offre : plus le prix est haut, plus les entreprises produisent.
const supply = (price) => 100 + 3 * price;

const marketEvaluator = Optimization.Operators.createMarketEquilibriumEvaluator(demand, supply);

// On peut utiliser `findPeak` en minimisant le déséquilibre (en retournant son opposé).
const imbalanceMinimizer = (price) => -marketEvaluator(price);
const equilibriumPrice = Dichotomy.findPeak(0, 1000, imbalanceMinimizer, 0.01);
console.log(`Le prix d'équilibre du marché est d'environ: ${equilibriumPrice.toFixed(2)}€`);
console.log(`À ce prix, la demande est de ${demand(equilibriumPrice).toFixed(0)} unités et l'offre de ${supply(equilibriumPrice).toFixed(0)} unités.`);


console.log("\n23. Finance : Optimisation de Portefeuille (N-Dimensionnel)");
// Problème : comment répartir 1000€ sur 3 actifs pour maximiser le rendement attendu tout en respectant une contrainte de risque ?
const assets = [
    { name: 'Action Tech', expectedReturn: 0.12, volatility: 0.20 }, // Rendement 12%, Risque 20%
    { name: 'Obligation État', expectedReturn: 0.03, volatility: 0.05 }, // Rendement 3%, Risque 5%
    { name: 'Matière Première', expectedReturn: 0.07, volatility: 0.15 }, // Rendement 7%, Risque 15%
];
const maxPortfolioVolatility = 0.10; // On ne veut pas que le risque global dépasse 10%

// Définition déclarative des corrélations entre les actifs
const correlations = [
    { assets: ['Action Tech', 'Obligation État'], correlation: -0.6 }, // Forte corrélation négative (couverture)
    { assets: ['Action Tech', 'Matière Première'], correlation: 0.4 },  // Corrélation positive modérée
    { assets: ['Obligation État', 'Matière Première'], correlation: 0.2 } // Faible corrélation positive
];

// Génération de la matrice de covariance à partir des déclarations
const covarianceMatrix = Optimization.Operators.createCovarianceMatrixFromCorrelations({ assets, correlations });
console.log("Matrice de covariance générée :", covarianceMatrix.map(row => row.map(val => val.toExponential(2))));

// La redéfinition de la fonction createPortfolioAllocator ici est pour l'exemple, elle est déjà dans library.js
Optimization.Operators.createPortfolioAllocator = ({ assets, maxVolatility, covarianceMatrix }) => {
    // La fonction de fitness évalue un portefeuille (un tableau de poids).
    // L'objectif est de MINIMISER le score, donc on minimise le rendement NÉGATIF.
    return function portfolioFitness(weights) {
        // Normaliser les poids pour qu'ils somment à 1
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
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

// Fonctions pour l'algorithme génétique
console.log("Utilisation du solveur de portefeuille clé en main :");
const resultPortfolio = Optimization.Operators.solvePortfolio(assets, maxPortfolioVolatility, { covarianceMatrix });

// La solution doit être normalisée pour l'affichage final.
const totalWeightSolution = resultPortfolio.solution.reduce((sum, w) => sum + w, 0);
const bestWeights = resultPortfolio.solution.map(w => w / totalWeightSolution);
console.log(`Meilleure allocation trouvée pour un risque < ${maxPortfolioVolatility * 100}% :`);
bestWeights.forEach((w, i) => console.log(`- ${assets[i].name}: ${(w * 100).toFixed(2)}%`));
console.log(`Rendement attendu maximal : ${(-resultPortfolio.fitness * 100).toFixed(2)}%`);

console.log("\n--- BIBLIOTHÈQUE D'OPTIMISATION AVANCÉE ---");

console.log("\n24. Recuit Simulé (Simulated Annealing)");
// Problème : trouver le minimum d'une fonction multimodale (plusieurs "vallées").
// f(x) = sin(x) + sin(10x/3) + x/10
// Cette fonction a de nombreux minima locaux, mais un seul minimum global.
const multimodalEvaluator = (x) => Math.sin(x) + Math.sin(10 * x / 3) + x / 10;

// La fonction "neighbor" explore les alentours du point actuel.
const neighbor = (x) => x + (Math.random() - 0.5) * 2; // Se déplace de -1 à +1

const initialSolution = 20; // Un point de départ arbitraire

const resultSA = Optimization.simulatedAnnealing(
    initialSolution,
    multimodalEvaluator,
    neighbor,
    100,    // Température initiale
    0.99,   // Taux de refroidissement
    20000   // Itérations
);

console.log(`Le minimum global de la fonction a été trouvé près de x = ${resultSA.solution.toFixed(4)}`);
console.log(`La valeur minimale (énergie) est d'environ: ${resultSA.energy.toFixed(4)}`);

console.log("\n25. Algorithme Génétique (Genetic Algorithm)");
// Problème : maximiser une fonction (ou minimiser son opposé).
// f(x) = x * sin(10 * PI * x) + 2.0 sur l'intervalle [-1, 2]
// C'est une fonction avec de nombreux pics. On veut trouver le plus haut.
const targetFunction = (x) => x * Math.sin(10 * Math.PI * x) + 2.0;
const fitnessFunction = (x) => -targetFunction(x); // On minimise l'opposé

// Un individu est un simple nombre.
const createIndividual = () => -1 + Math.random() * 3; // Un nombre entre -1 et 2

// Croisement : moyenne des parents
const crossover = (parent1, parent2) => (parent1 + parent2) / 2;

// Mutation : petit déplacement aléatoire
const mutate = (individual) => individual + (Math.random() - 0.5) * 0.1;

const resultGA = Optimization.geneticAlgorithm(
    createIndividual,
    fitnessFunction,
    crossover,
    mutate,
    { generations: 100, populationSize: 50, mutationRate: 0.2, selectionFunction: Optimization.Operators.createTournamentSelection({ size: 5 }) }
);

console.log(`Le maximum de la fonction a été trouvé près de x = ${resultGA.solution.toFixed(4)}`);
console.log(`La valeur maximale est d'environ: ${-resultGA.fitness.toFixed(4)}`);


console.log("\n26. Descente de Gradient (Gradient Descent)");
// Problème : trouver le minimum de la fonction f(x) = x^4 - 4x^2 + 2
// C'est une fonction en "W" avec deux minima locaux.
const costFunction = (x) => Math.pow(x, 4) - 4 * Math.pow(x, 2) + 2;
// La dérivée (gradient) est f'(x) = 4x^3 - 8x
const gradientFunction = (x) => 4 * Math.pow(x, 3) - 8 * x;

// Point de départ 1
const start1 = 3.0;
const minimum1 = Optimization.gradientDescent(start1, gradientFunction, { learningRate: 0.01 });
console.log(`En partant de x=${start1}, la descente de gradient trouve le minimum à x = ${minimum1.toFixed(4)}`);
console.log(`Valeur de la fonction à ce minimum: ${costFunction(minimum1).toFixed(4)}`);

// Point de départ 2 (de l'autre côté du "W")
const start2 = -3.0;
const minimum2 = Optimization.gradientDescent(start2, gradientFunction, { learningRate: 0.01 });
console.log(`En partant de x=${start2}, la descente de gradient trouve le minimum à x = ${minimum2.toFixed(4)}`);
console.log(`Valeur de la fonction à ce minimum: ${costFunction(minimum2).toFixed(4)}`);

// Cela illustre bien que la descente de gradient trouve un minimum LOCAL.

console.log("\n27. Optimisation Multidimensionnelle (Modèle Climatique)");
// Problème : "Quels sont les 5 paramètres de mon modèle de simulation climatique qui,
// une fois optimisés, minimisent l'écart avec les données réelles ?"

// 1. Les "données réelles" observées sur 10 ans.
const realTemperatures = [14.1, 14.3, 14.5, 14.4, 14.6, 14.8, 15.0, 14.9, 15.1, 15.2];

// 2. Notre "modèle climatique" simplifié. Il prend 5 paramètres et retourne une prédiction pour chaque année.
const climateModel = (params, years) => {
    const [p1, p2, p3, p4, p5] = params;
    const predictions = [];
    for (let year = 0; year < years; year++) {
        // Formule complexe et non-linéaire pour simuler un vrai modèle.
        const prediction = p1 * Math.log(year + 1) + Math.sin(year / p2) * p3 + p4 * Math.sqrt(year) + p5;
        predictions.push(prediction);
    }
    return predictions;
};

// 3. La fonction de coût (ou "énergie") : l'erreur quadratique moyenne.
// C'est ce que nous voulons minimiser.
const modelEvaluator = (params) => {
    const predictions = climateModel(params, realTemperatures.length);
    let squaredError = 0;
    for (let i = 0; i < realTemperatures.length; i++) {
        squaredError += Math.pow(realTemperatures[i] - predictions[i], 2);
    }
    return squaredError / realTemperatures.length; // Mean Squared Error
};

// 4. La fonction de voisinage : elle modifie légèrement un des 5 paramètres au hasard.
const modelNeighbor = (params) => {
    const newParams = [...params];
    const paramToChange = Math.floor(Math.random() * newParams.length);
    const change = (Math.random() - 0.5) * 0.5; // Petite modification
    newParams[paramToChange] += change;
    return newParams;
};

// 5. Lancement de l'optimisation avec le Recuit Simulé.
const initialParams = [1, 5, 1, 0.1, 14]; // Un jeu de paramètres de départ.
const initialError = modelEvaluator(initialParams);
console.log(`Erreur du modèle avec les paramètres initiaux: ${initialError.toFixed(4)}`);

const resultClimate = Optimization.simulatedAnnealing(initialParams, modelEvaluator, modelNeighbor, 1.0, 0.999, 50000);

console.log(`Optimisation terminée.`);
console.log(`Erreur minimale trouvée: ${resultClimate.energy.toFixed(4)}`);
console.log("Meilleurs paramètres trouvés:", resultClimate.solution.map(p => p.toFixed(4)));

console.log("\n28. Problème du Voyageur de Commerce (TSP) avec Recuit Simulé");
// Problème N-D classique : trouver le chemin le plus court qui visite chaque ville une seule fois.
const cities = [
    { x: 60, y: 200 }, { x: 180, y: 200 }, { x: 80, y: 180 }, { x: 140, y: 180 },
    { x: 20, y: 160 }, { x: 100, y: 160 }, { x: 200, y: 160 }, { x: 140, y: 140 },
    { x: 40, y: 120 }, { x: 100, y: 120 }, { x: 180, y: 100 }, { x: 60, y: 80 },
    { x: 120, y: 80 }, { x: 180, y: 60 }, { x: 20, y: 40 }, { x: 100, y: 40 },
    { x: 200, y: 40 }, { x: 20, y: 20 }, { x: 60, y: 20 }, { x: 160, y: 20 }
];

console.log("Utilisation du solveur TSP clé en main :");
// Tout est encapsulé. On fournit juste les données du problème.
const resultTSP = Optimization.Operators.solveTSP(cities);

console.log(`Distance initiale (chemin aléatoire) est maintenant gérée en interne.`);
console.log(`Optimisation TSP terminée.`);
console.log(`Distance minimale trouvée: ${resultTSP.energy.toFixed(2)}`);
console.log("Ordre de visite optimal (indices des villes):", resultTSP.solution.join(' -> '));


console.log("\n29. Agriculture : Optimisation de Rendement N-Dimensionnel");
// Problème: Trouver la combinaison optimale de 4 facteurs (N, P, K, Eau) pour maximiser le rendement.
const cropFactors = [
    { name: 'Azote (N)', optimalAmount: 150, weight: 5, sensitivity: 1.0 },   // Sensibilité normale
    { name: 'Phosphore (P)', optimalAmount: 70, weight: 3, sensitivity: 2.5 },    // Très sensible à un manque/excès
    { name: 'Potassium (K)', optimalAmount: 100, weight: 2.5, sensitivity: 0.8 },  // Moins sensible
    { name: 'Eau (mm)', optimalAmount: 500, weight: 4, sensitivity: 1.2 }
];
const baseYield = 1.5; // Rendement de base sans rien faire

// 1. Créer l'évaluateur N-D. On veut MAXIMISER le rendement.
const multiFactorEvaluator = Dichotomy.Operators.createMultiFactorCropYieldModel({ factors: cropFactors, baseYield });

// 2. Les algorithmes d'optimisation minimisent. On minimise donc le rendement NÉGATIF.
const yieldMinimizer = (amounts) => -multiFactorEvaluator(amounts);

// 3. La fonction "voisin" modifie légèrement un des facteurs au hasard.
const cropNeighbor = (amounts) => {
    const newAmounts = [...amounts];
    const i = Math.floor(Math.random() * newAmounts.length);
    const change = (Math.random() - 0.5) * (cropFactors[i].optimalAmount * 0.1); // Change de +/- 5% de l'optimum
    newAmounts[i] = Math.max(0, newAmounts[i] + change); // La quantité ne peut être négative
    return newAmounts;
};

const initialAmounts = [100, 50, 80, 400]; // Point de départ
const resultCrop = Optimization.simulatedAnnealing(initialAmounts, yieldMinimizer, cropNeighbor, 10, 0.999, 30000);

console.log(`Le rendement maximal est de ${(-resultCrop.energy).toFixed(2)} tonnes/ha.`);
console.log("Obtenu avec la combinaison de facteurs suivante :");
resultCrop.solution.forEach((amount, i) => console.log(`- ${cropFactors[i].name}: ${amount.toFixed(2)}`));


console.log("\n30. Problème de Placement d'Infrastructures (Facility Location)");
// Problème : Où placer 4 antennes 5G pour couvrir au mieux 50 villages, sachant que chaque antenne coûte 150 unités ?
const numAntennas = 4;
const mapBounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
const fixedCostPerAntenna = 150;
// Au lieu d'exécuter le solveur une seule fois et d'espérer un bon résultat,
// nous le lançons plusieurs fois pour affiner la solution et choisir la meilleure.
console.log(`Lancement de 5 cycles d'optimisation (coût fixe/antenne: ${fixedCostPerAntenna})...`);

// On crée une fonction anonyme qui encapsule un appel au solveur.
// IMPORTANT : Les données aléatoires (les villages) sont maintenant générées ICI,
// à l'intérieur de la fonction, pour que chaque cycle soit un problème unique.
const facilitySolver = () => {
    const villages = Array.from({ length: 50 }, () => ({ x: Math.random() * 100, y: Math.random() * 100 }));
    return Optimization.Operators.solveFacilityLocation(villages, numAntennas, mapBounds, { fixedCostPerFacility: fixedCostPerAntenna });
};
const resultFacilities = Optimization.runMultiple(facilitySolver, 5, true);

// On déstructure le meilleur résultat de l'objet retourné par runMultiple.
const { bestResult } = resultFacilities;
const connectionCost = bestResult.energy - (bestResult.solution.length * fixedCostPerAntenna);

console.log(`\nMeilleur résultat trouvé sur 5 exécutions :`);
console.log(`Le coût total minimal est de ${bestResult.energy.toFixed(2)} (Connexions: ${connectionCost.toFixed(2)} + Installation: ${bestResult.solution.length * fixedCostPerAntenna}).`);

console.log("Positions optimales pour les 4 antennes :");
bestResult.solution.forEach((pos, i) => {
    console.log(`- Antenne ${i + 1}: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}`);
});

console.log("\n31. Problème d'Ordonnancement de Tâches (Job-Shop Scheduling)");
// Problème : Organiser 10 tâches avec des durées différentes sur 2 machines pour finir au plus tôt.
const tasks = [
    { id: 'A', duration: 5 }, { id: 'B', duration: 8 }, { id: 'C', duration: 3 }, { id: 'D', duration: 6 },
    { id: 'E', duration: 10 }, { id: 'F', duration: 2 }, { id: 'G', duration: 4 }, { id: 'H', duration: 7 },
    { id: 'I', duration: 5 }, { id: 'J', duration: 9 }
];
const numMachines = 2;

// Évaluateur : calcule le "makespan" (temps total pour finir toutes les tâches) pour un ordre donné.
const scheduleEvaluator = (schedule) => {
    const machineFinishTimes = Array(numMachines).fill(0);
    for (const task of schedule) {
        const earliestMachine = machineFinishTimes.indexOf(Math.min(...machineFinishTimes));
        machineFinishTimes[earliestMachine] += task.duration;
    }
    return Math.max(...machineFinishTimes); // Le makespan est le temps de la machine qui finit en dernier.
};

// Voisinage : échange deux tâches au hasard dans le planning.
const scheduleNeighbor = (schedule) => {
    const newSchedule = [...schedule];
    const i = Math.floor(Math.random() * newSchedule.length);
    const j = Math.floor(Math.random() * newSchedule.length);
    [newSchedule[i], newSchedule[j]] = [newSchedule[j], newSchedule[i]]; // Swap
    return newSchedule;
};

const initialSchedule = [...tasks].sort(() => Math.random() - 0.5); // Ordre aléatoire
const resultSchedule = Optimization.simulatedAnnealing(initialSchedule, scheduleEvaluator, scheduleNeighbor, 50, 0.99, 20000);

console.log(`Le temps de production total peut être réduit à ${resultSchedule.energy} unités de temps.`);
console.log("Ordre optimal des tâches trouvé :", resultSchedule.solution.map(t => t.id).join(' -> '));


// --- DÉMONSTRATION DE LA PARALLÉLISATION ---

// On utilise une fonction auto-exécutante asynchrone car `await` ne peut être utilisé qu'au niveau supérieur d'un module ES ou dans une fonction `async`.
(async () => {
    console.log("\n32. Placement d'Infrastructures (Exécution Parallèle)");
    const numAntennasParallel = 4;
    const mapBoundsParallel = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    const numCycles = 8; // On augmente le nombre de cycles pour bien voir l'effet

    console.log(`Lancement de ${numCycles} cycles d'optimisation en parallèle...`);
    const startTime = Date.now();

    const parallelResult = await Optimization.runMultipleParallel('solveFacilityLocation', [numAntennasParallel, mapBoundsParallel], numCycles, false); // logProgress est géré par la fonction elle-même
    
    const endTime = Date.now();
    console.log(`\nExécution parallèle terminée en ${(endTime - startTime) / 1000} secondes.`);

    console.log(`Meilleur résultat trouvé : Coût total = ${parallelResult.bestResult.energy.toFixed(2)}`);
    console.log(`Statistiques (${parallelResult.stats.concurrency} workers) : Score moyen = ${parallelResult.stats.average.toFixed(2)}, Écart-type = ${parallelResult.stats.stdDev.toFixed(2)}`);
})();


// --- NOUVEAUX EXEMPLES AVANCÉS ---

console.log("\n33. Optimisation Multi-Objectifs : Antennes 5G (Front de Pareto)");
// Problème : Placer 4 antennes pour MINIMISER le coût ET MAXIMISER la couverture.
const villagesMOP = Array.from({ length: 50 }, () => ({ x: Math.random() * 100, y: Math.random() * 100 }));
const numAntennasMOP = 4;
const mapBoundsMOP = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
const coverageRadius = 25; // Rayon de couverture d'une antenne

// L'évaluateur retourne maintenant un tableau d'objectifs à MINIMISER.
const multiObjectiveFacilityEvaluator = (facilities) => {
    const distanceSq = (p1, p2) => Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
    
    let totalDistanceCost = 0;
    const coveredVillages = new Set();

    for (const village of villagesMOP) {
        let minDistanceToVillage = Infinity;
        for (const facility of facilities) {
            minDistanceToVillage = Math.min(minDistanceToVillage, distanceSq(village, facility));
        }
        totalDistanceCost += Math.sqrt(minDistanceToVillage);
        if (Math.sqrt(minDistanceToVillage) <= coverageRadius) {
            coveredVillages.add(village);
        }
    }
    
    // Objectif 1: minimiser le coût (somme des distances).
    const objective1 = totalDistanceCost;
    // Objectif 2: maximiser la couverture. Comme l'algo minimise, on minimise la couverture NÉGATIVE.
    const objective2 = -coveredVillages.size;

    return [objective1, objective2];
};

// Fonctions pour l'AG Multi-Objectifs
const createFacilities = () => Array.from({ length: numAntennasMOP }, () => ({
    x: mapBoundsMOP.minX + Math.random() * (mapBoundsMOP.maxX - mapBoundsMOP.minX), y: mapBoundsMOP.minY + Math.random() * (mapBoundsMOP.maxY - mapBoundsMOP.minY)
}));

const crossoverFacilities = (p1, p2) => { // Croisement à un point
    const pivot = Math.floor(Math.random() * p1.length);
    return [...p1.slice(0, pivot), ...p2.slice(pivot)];
};

const mutateFacilities = (facilities) => {
    const newFacilities = facilities.map(f => ({...f}));
    const i = Math.floor(Math.random() * numAntennasMOP);
    const moveX = (Math.random() - 0.5) * (mapBoundsMOP.maxX - mapBoundsMOP.minX) * 0.2;
    const moveY = (Math.random() - 0.5) * (mapBoundsMOP.maxY - mapBoundsMOP.minY) * 0.2;
    newFacilities[i].x = Math.max(mapBoundsMOP.minX, Math.min(mapBoundsMOP.maxX, newFacilities[i].x + moveX));
    newFacilities[i].y = Math.max(mapBoundsMOP.minY, Math.min(mapBoundsMOP.maxY, newFacilities[i].y + moveY));
    return newFacilities;
};

const paretoFront = Optimization.geneticAlgorithmMultiObjective(
    createFacilities, multiObjectiveFacilityEvaluator, crossoverFacilities, mutateFacilities, 
    { generations: 200, populationSize: 100, mutationRate: 0.2 }
);

console.log(`Front de Pareto trouvé avec ${paretoFront.length} solutions de compromis :`);
paretoFront.sort((a,b) => a.objectives[0] - b.objectives[0]); // Trier par coût pour l'affichage
paretoFront.forEach(res => {
    console.log(`  - Coût: ${res.objectives[0].toFixed(2)}, Couverture: ${-res.objectives[1]} villages`);
});

console.log("\n34. Optimisation de Trajectoire : Toboggan Aquatique le plus Rapide");
// Problème : Trouver la forme d'un toboggan (une courbe) qui minimise le temps de descente.
// On représente la courbe par 10 points verticaux (y0, y1, ..., y9) équidistants horizontalement.
// La solution est un vecteur de 10 hauteurs.
const startPoint = { x: 0, y: 50 }; // Départ à 50m de haut
const endPoint = { x: 80, y: 0 };   // Arrivée à 80m de distance, au sol
const numPoints = 10;

// Évaluateur (simplifié) : calcule le temps de descente. On minimise le temps.
const slideTimeEvaluator = Dichotomy.Operators.createBrachistochroneEvaluator({ startPoint, endPoint, numPoints });
// Gradient de l'évaluateur (nécessaire pour la descente de gradient)
const slideTimeGradient = Dichotomy.Operators.createBrachistochroneGradient({ startPoint, endPoint, numPoints });

const initialSlideShape = Array.from({ length: numPoints }, (_, i) => startPoint.y - (startPoint.y * (i + 1) / (numPoints + 1))); // Une ligne droite
const optimalShape = Optimization.gradientDescent(initialSlideShape, slideTimeGradient, { learningRate: 100, maxIterations: 2000 });

console.log(`Le temps de descente minimal estimé est de ${slideTimeEvaluator(optimalShape).toFixed(3)} secondes.`);
console.log("Forme optimale du toboggan (hauteur y à chaque segment x) :");
optimalShape.forEach((y, i) => {
    const x = endPoint.x * (i + 1) / (numPoints + 1);
    console.log(`  - à x=${x.toFixed(1)}m, hauteur y=${y.toFixed(2)}m`);
});

console.log("\n35. Problème du Sac à Dos (Knapsack Problem) avec AG");
// Problème : Maximiser la valeur des objets dans un sac sans dépasser son poids maximum.
const knapsackItems = [
    { name: "Boussole", weight: 1, value: 150 }, { name: "Corde", weight: 3, value: 250 },
    { name: "Tente", weight: 10, value: 600 }, { name: "Eau", weight: 9, value: 500 },
    { name: "Nourriture", weight: 8, value: 450 }, { name: "Hache", weight: 4, value: 300 },
    { name: "Lampe", weight: 2, value: 200 }, { name: "Panneaux solaires", weight: 7, value: 400 },
    { name: "Kit de survie", weight: 5, value: 350 }, { name: "Vêtements", weight: 6, value: 100 }
];
const maxWeight = 25;

// Évaluateur : On MINIMISE la valeur NÉGATIVE.
const knapsackFitness = (individual) => {
    let totalValue = 0;
    let totalWeight = 0;
    for (let i = 0; i < individual.length; i++) {
        if (individual[i] === 1) {
            totalValue += knapsackItems[i].value;
            totalWeight += knapsackItems[i].weight;
        }
    }

    // Pénalité forte si le poids est dépassé
    if (totalWeight > maxWeight) {
        return 10000 + (totalWeight - maxWeight) * 100; // Score très mauvais, proportionnel à la violation
    }
    return -totalValue; // Minimiser l'opposé de la valeur pour la maximiser.
};

// Fonctions pour l'AG
const createKnapsackIndividual = () => Array.from({ length: knapsackItems.length }, () => Math.round(Math.random()));
const crossoverKnapsack = (p1, p2) => { // Croisement à un point correct
    const pivot = Math.floor(Math.random() * p1.length);
    return [...p1.slice(0, pivot), ...p2.slice(pivot, p1.length)];
};
const mutateKnapsack = (ind) => { // Inverser un bit au hasard
    const newInd = [...ind];
    const i = Math.floor(Math.random() * newInd.length);
    newInd[i] = 1 - newInd[i]; // Inversion (0 -> 1, 1 -> 0)
    return newInd;
};

const resultKnapsack = Optimization.geneticAlgorithm(
    createKnapsackIndividual, knapsackFitness, crossoverKnapsack, mutateKnapsack,
    { generations: 100, populationSize: 50, mutationRate: 0.1, selectionFunction: Optimization.Operators.createTournamentSelection({ size: 5 }) }
);

const chosenItems = knapsackItems.filter((_, i) => resultKnapsack.solution[i] === 1);
const finalWeight = chosenItems.reduce((sum, item) => sum + item.weight, 0);
console.log(`Valeur maximale pour un poids <= ${maxWeight}kg : ${-resultKnapsack.fitness.toLocaleString('fr-FR')}€`);
console.log(`Poids total du sac : ${finalWeight}kg`);
console.log("Objets à emporter :", chosenItems.map(it => it.name).join(', '));

console.log("\n37. Découverte de Lexique par Analyse Fréquentielle et AG");
// Problème : Peut-on découvrir des "mots" (séquences de sons stables) à partir d'un flux de sons brut ?

// 1. L'Alphabet des Sons (Phonèmes)
// Notre mini-langue est composée de ces sons fondamentaux.
const phonemes = ['p', 't', 'k', 'm', 'n', 's', 'l', 'a', 'i', 'u'];

// 2. Le Corpus "Caché"
// C'est le flux sonore ambiant. Il contient des "proto-mots" cachés (`ka`, `pi`, `sun`)
// mélangés à du bruit aléatoire. L'algorithme ne connaît pas ces mots.
const protoWords = [['k', 'a'], ['p', 'i'], ['s', 'u', 'n']];
let hiddenCorpus = [];
for (let i = 0; i < 200; i++) {
    if (Math.random() < 0.4) { // 40% de chance d'insérer un proto-mot
        hiddenCorpus.push(...protoWords[Math.floor(Math.random() * protoWords.length)]);
    } else { // 60% de chance d'insérer un son aléatoire (bruit)
        hiddenCorpus.push(phonemes[Math.floor(Math.random() * phonemes.length)]);
    }
}
console.log(`Le corpus sonore brut contient ${hiddenCorpus.length} phonèmes.`);

// 3. Le "Linguiste de Terrain" (Analyseur de Fréquence)
// Cette fonction analyse le corpus brut pour trouver des séquences de sons récurrentes.
const analyzeCorpus = (corpus, minLen = 2, maxLen = 4, minFreq = 3) => {
    const counts = new Map();
    for (let len = minLen; len <= maxLen; len++) {
        for (let i = 0; i <= corpus.length - len; i++) {
            const sequence = corpus.slice(i, i + len).join('');
            counts.set(sequence, (counts.get(sequence) || 0) + 1);
        }
    }
    // On ne garde que les séquences suffisamment fréquentes pour être considérées comme des "mots" potentiels.
    const discoveredLexicon = new Map();
    for (const [sequence, freq] of counts.entries()) {
        if (freq >= minFreq) {
            discoveredLexicon.set(sequence, freq);
        }
    }
    return discoveredLexicon;
};

const discoveredLexicon = analyzeCorpus(hiddenCorpus);
console.log(`Le 'Linguiste' a identifié ${discoveredLexicon.size} proto-mots potentiels :`);
const sortedLexicon = [...discoveredLexicon.entries()].sort((a, b) => b[1] - a[1]);
console.log(sortedLexicon.map(([word, freq]) => `${word} (vu ${freq} fois)`).join(', '));

// 4. Le "Bébé-Babilleur" (Algorithme Génétique)
// L'AG va essayer de produire des séquences sonores qui correspondent au lexique découvert.

// Fitness : le score est d'autant meilleur que le "babillage" contient des proto-mots connus.
// On veut maximiser le score, donc on minimise son opposé.
const babbleFitness = (babble) => {
    const babbleString = babble.join('');
    let score = 0;
    for (const [word, freq] of discoveredLexicon.entries()) {
        const occurrences = (babbleString.match(new RegExp(word, "g")) || []).length;
        if (occurrences > 0) {
            // Le score est pondéré par la fréquence du mot :
            // il est plus "payant" de prononcer un mot commun.
            score += occurrences * Math.log(1 + freq);
        }
    }
    return -score; // L'AG minimise, donc on minimise le score négatif.
};

// Fonctions pour l'AG
const createBabble = () => { // Crée un "babillage" de 5 à 15 sons
    const length = 5 + Math.floor(Math.random() * 11);
    return Array.from({ length }, () => phonemes[Math.floor(Math.random() * phonemes.length)]);
};

const crossoverBabbles = (b1, b2) => { // Croisement à un point
    const pivot = Math.floor(Math.random() * Math.min(b1.length, b2.length));
    return [...b1.slice(0, pivot), ...b2.slice(pivot)];
};

const mutateBabble = (babble) => { // Remplace un son au hasard
    const newBabble = [...babble];
    if (newBabble.length > 0) {
        const i = Math.floor(Math.random() * newBabble.length);
        newBabble[i] = phonemes[Math.floor(Math.random() * phonemes.length)];
    }
    return newBabble;
};

const resultBabble = Optimization.geneticAlgorithm(
    createBabble, babbleFitness, crossoverBabbles, mutateBabble,
    { generations: 200, populationSize: 100, mutationRate: 0.4, selectionFunction: Optimization.Operators.createTournamentSelection({ size: 5 }) }
);

console.log(`\nAprès évolution, le meilleur "babilleur" a produit la séquence :`);
console.log(`-> "${resultBabble.solution.join('')}" (Score: ${-resultBabble.fitness.toFixed(2)})`);

console.log("\n36. Machine Learning : Optimisation d'Hyperparamètres avec AG");
// Problème : Trouver les meilleurs hyperparamètres pour un modèle de ML afin de minimiser son erreur.
// Ici, on cherche le meilleur "learning rate" et "nombre d'itérations" pour une régression linéaire simple.

// 1. Données d'entraînement (y ≈ 2.5x + 1.5)
const trainingData = [
    { x: 0, y: 1.8 }, { x: 1, y: 3.9 }, { x: 2, y: 6.3 },
    { x: 3, y: 9.2 }, { x: 4, y: 11.8 }, { x: 5, y: 14.1 }
];

// 2. Le "modèle" : une régression linéaire entraînée par descente de gradient.
const trainLinearRegression = (data, learningRate, iterations) => {
    let m = 0, b = 0; // Pente et ordonnée à l'origine
    for (let i = 0; i < iterations; i++) {
        let m_grad = 0, b_grad = 0;
        for (const point of data) {
            const prediction = m * point.x + b;
            m_grad += -2 * point.x * (point.y - prediction);
            b_grad += -2 * (point.y - prediction);
        }
        m -= (m_grad / data.length) * learningRate;
        b -= (b_grad / data.length) * learningRate;
    }
    return { m, b };
};

// 3. La fonction de fitness : elle entraîne le modèle et retourne son erreur (Mean Squared Error).
const hyperparameterFitness = (hyperparams) => {
    const { lr, iterations } = hyperparams;
    // S'assurer que les hyperparamètres sont valides
    if (lr <= 0 || iterations <= 0) return Number.MAX_VALUE;

    const model = trainLinearRegression(trainingData, lr, Math.round(iterations));
    
    let error = 0;
    for (const point of trainingData) {
        const prediction = model.m * point.x + model.b;
        error += Math.pow(point.y - prediction, 2);
    }
    return error / trainingData.length; // MSE
};

// 4. Fonctions pour l'AG
const createHyperparameterIndividual = () => ({
    lr: Math.random() * 0.5, // learning rate entre 0 et 0.5
    iterations: Math.random() * 2000 + 100 // iterations entre 100 et 2100
});

const crossoverHyperparameters = (p1, p2) => {
    // Croisement à 50/50 pour chaque propriété
    return {
        lr: Math.random() < 0.5 ? p1.lr : p2.lr,
        iterations: Math.random() < 0.5 ? p1.iterations : p2.iterations
    };
};

const mutateHyperparameters = (ind) => {
    const newInd = { ...ind };
    if (Math.random() < 0.5) {
        newInd.lr += (Math.random() - 0.5) * 0.05;
        newInd.lr = Math.max(1e-5, newInd.lr); // Doit rester positif
    } else {
        newInd.iterations += (Math.random() - 0.5) * 200;
        newInd.iterations = Math.max(1, newInd.iterations); // Doit rester positif
    }
    return newInd;
};

const resultHP = Optimization.geneticAlgorithm(
    createHyperparameterIndividual, 
    hyperparameterFitness, 
    crossoverHyperparameters, 
    mutateHyperparameters, 
    { generations: 50, populationSize: 40, selectionFunction: Optimization.Operators.createTournamentSelection({ size: 5 }) });

console.log(`Erreur minimale du modèle : ${resultHP.fitness.toFixed(4)}`);
console.log("Meilleurs hyperparamètres trouvés :");
console.log(`  - Learning Rate : ${resultHP.solution.lr.toFixed(5)}`);
console.log(`  - Itérations : ${Math.round(resultHP.solution.iterations)}`);
