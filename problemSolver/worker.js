
import { workerData, parentPort } from 'worker_threads';
import { Optimization } from './library.js';

// Ce worker est conçu pour exécuter une fonction de résolution d'optimisation
// de manière isolée, afin de permettre la parallélisation.

const { solverName, solverArgs } = workerData;

if (!solverName || !solverArgs) {
    throw new Error("Le worker a été appelé sans 'solverName' ou 'solverArgs'.");
}

// Recherche de la fonction de résolution dans l'objet Optimization.Operators
const solverFunction = Optimization.Operators[solverName];

if (typeof solverFunction !== 'function') {
    throw new Error(`Le solveur nommé '${solverName}' n'a pas été trouvé dans Optimization.Operators.`);
}

try {
    // Exécution de la fonction de résolution avec les arguments fournis
    const result = solverFunction(...solverArgs); // Les arguments contiennent déjà toutes les données nécessaires
    parentPort.postMessage(result); // Envoi du résultat au thread principal
} catch (error) {
    // En cas d'erreur pendant l'exécution, on la propage au thread principal
    console.error(`Erreur dans le worker pour le solveur '${solverName}':`, error);
    throw error;
}
