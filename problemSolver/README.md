# Problem Solving Library

This repository contains a JavaScript library (`library.js`) designed to solve a wide range of algorithmic and optimization problems. It is structured around two main modules:

1.  **`Dichotomy`**: A set of tools based on the principle of binary search, extended to solve complex conceptual problems beyond simple array searching.
2.  **`Optimization`**: A collection of stochastic and deterministic optimization algorithms for finding optimal solutions in large, multidimensional, and non-linear search spaces.

---

## 🧠 `Dichotomy` Module

This module generalizes the "divide and conquer" idea to apply it to functions, search spaces, and societal problems.

### Search Functions on Sorted Arrays

These functions are robust and efficient implementations for manipulating sorted arrays.

*   `Dichotomy.search(arr, target, [comparator])`: Basic binary search. Returns the index of `target` or `-1`.
*   `Dichotomy.findFirst(arr, target, [comparator])`: Finds the **first** occurrence of `target` in an array with duplicates.
*   `Dichotomy.findLast(arr, target, [comparator])`: Finds the **last** occurrence of `target`.
*   `Dichotomy.countOccurrences(arr, target, [comparator])`: Counts the total number of occurrences of `target`.
*   `Dichotomy.findInsertionPoint(arr, target, [comparator])`: Finds the index where `target` should be inserted to maintain order (equivalent to `lower_bound`).
*   `Dichotomy.findRange(arr, minTarget, maxTarget, [comparator])`: Returns a subarray containing all elements within the `[minTarget, maxTarget]` range.
*   `Dichotomy.findClosest(arr, target, distanceMetric)`: Finds the index of the element "closest" to `target` according to a provided distance metric.

### Conceptual Algorithms

These functions extend dichotomy to more abstract problems.

*   `Dichotomy.findBoundary(arr, predicate)`: Finds the index of the first element in an array that satisfies a `predicate`. The array must be "sorted" according to this predicate (all `false` values before all `true` values).

*   `Dichotomy.searchOnAnswer(low, high, predicate, [precision])`: **(Key Function)** Performs a binary search on a space of possible answers to find the smallest value that satisfies a condition. This is an extremely powerful pattern for problems like "What is the minimum/maximum value of X such that condition Y is met?".

*   `Dichotomy.findPeak(low, high, evaluator, [precision])`: Finds the input value that maximizes the result of a unimodal function (with a single peak) using a ternary search. Ideal for simple (1D) optimization problems where the function is not monotonic.

### `Dichotomy.Operators`: The Predicate Factory

This is the core of conceptual problem-solving. This namespace contains functions that generate custom `predicates` for `Dichotomy.searchOnAnswer`. Each operator encapsulates the logic of a real-world problem.

**Operator Examples:**
*   `createShippingValidator({itemSizes, maxTrips})`: Creates a predicate for the "package loader problem". It answers the question: "Is a capacity of `X` sufficient to transport all items in `maxTrips` trips?".
*   `createFairResourceAllocator({baseNeeds, totalBudget})`: For fair allocation problems.
*   `createHerdImmunityValidator({r0})`: For epidemiological modeling.
*   `createFairnessThresholdValidator(...)`: For algorithmic bias correction.
*   `createCarbonTaxValidator(...)`: For economic and ecological modeling.

#### Usage Example (`searchOnAnswer` + `Operator`)

**Problem:** We have a list of items and 3 trucks. What is the minimum capacity each truck must have to transport everything?

```javascript
import { Dichotomy } from './library.js';

// 1. Define the problem
const itemWeights = [20, 80, 55, 40, 65, 30, 70, 15, 50, 90];
const maxTrips = 3;
const totalWeight = itemWeights.reduce((a, b) => a + b, 0);

// 2. Create the predicate with the operator
// The `canShip` predicate takes a capacity and returns `true` if it's feasible.
const canShip = Dichotomy.Operators.createShippingValidator({
    itemSizes: itemWeights,
    maxTrips: maxTrips
});

// 3. Search on the space of possible answers
// The minimum capacity is between the weight of the largest item and the total weight.
const minCapacity = Dichotomy.searchOnAnswer(Math.max(...itemWeights), totalWeight, canShip, 1);

console.log(`The minimum required capacity per truck is ${Math.ceil(minCapacity)} kg.`);
// Output: The minimum required capacity per truck is 150 kg.
```

---

## 🚀 `Optimization` Module

This module provides algorithms for complex optimization problems, often multidimensional, multimodal (multiple local optima), or requiring a stochastic approach.

### Main Algorithms

*   `Optimization.simulatedAnnealing(initialSolution, evaluator, neighbor, ...)`: **Simulated Annealing**. A powerful metaheuristic algorithm for finding a good global optimum in a large search space. Ideal for problems with many "traps" (local optima).

*   `Optimization.geneticAlgorithm(createIndividual, fitness, crossover, mutate, ...)`: **Genetic Algorithm**. Evolves a population of solutions over several generations to converge towards an optimal solution. Very effective for problems where the solution structure is complex.

*   `Optimization.gradientDescent(initialSolution, gradientFunction, ...)`: **Gradient Descent**. A classic algorithm for finding a **local** minimum of a differentiable function.

*   `Optimization.geneticAlgorithmMultiObjective(...)`: An implementation inspired by **NSGA-II** for multi-objective optimization problems, where one seeks a set of compromise solutions (the **Pareto front**) rather than a single optimal solution.

### Meta-Heuristics and Utilities

*   `Optimization.runMultiple(solverFunction, numCycles)`: Executes a stochastic solver (like `simulatedAnnealing` or `geneticAlgorithm`) multiple times and returns the best result found, along with statistics.

*   `Optimization.runMultipleParallel(...)`: Parallelized version of `runMultiple` using Node.js `worker_threads` to speed up the search by exploring multiple starting points simultaneously.

### `Optimization.Operators`: The Solver Factory

Similar to the `Dichotomy` operators, this namespace provides "turnkey" functions that encapsulate the complete logic for solving standard problems.

*   `createTournamentSelection({size})`: Creates a selection function for genetic algorithms.
*   `createPortfolioAllocator({assets, maxVolatility, ...})`: Creates a *fitness* function to evaluate an asset portfolio based on its return and risk.
*   `solveTSP(cities, options)`: A complete solver for the **Traveling Salesman Problem (TSP)**, using simulated annealing with a 2-opt heuristic.
*   `solvePortfolio(assets, maxVolatility, options)`: A complete solver for portfolio optimization, using a genetic algorithm.
*   `solveFacilityLocation(customers, numFacilities, bounds, options)`: A solver for the **Facility Location Problem**, which determines where to place services to minimize the total distance to customers.

#### Usage Example (`solveTSP`)

**Problem:** Find the shortest route to visit 20 cities.

```javascript
const { Optimization } = require('./library.js');

// 1. Define the problem data
const cities = [
    { x: 60, y: 200 }, { x: 180, y: 200 }, { x: 80, y: 180 }, { x: 140, y: 180 },
    { x: 20, y: 160 }, { x: 100, y: 160 }, { x: 200, y: 160 }, { x: 140, y: 140 },
    { x: 40, y: 120 }, { x: 100, y: 120 }, { x: 180, y: 100 }, { x: 60, y: 80 },
    { x: 120, y: 80 }, { x: 180, y: 60 }, { x: 20, y: 40 }, { x: 100, y: 40 },
    { x: 200, y: 40 }, { x: 20, y: 20 }, { x: 60, y: 20 }, { x: 160, y: 20 }
];

// 2. Launch the "turnkey" solver
// The operator handles the evaluator, neighborhood, and initial solution.
const resultTSP = Optimization.Operators.solveTSP(cities, { maxIterations: 50000 });

console.log(`TSP optimization complete.`);
console.log(`Minimum distance found: ${resultTSP.energy.toFixed(2)}`);
console.log("Optimal visit order (city indices):", resultTSP.solution.join(' -> '));
```

---

## 🏛️ Architecture and Philosophy

### Dichotomy vs. Optimization

-   Use **`Dichotomy`** when the problem can be solved by testing a single variable and the test function is **monotonic** (e.g., if a capacity of 100kg works, then 110kg will also work). This is fast, deterministic, and guaranteed to find the exact boundary.

-   Use **`Optimization`** when the search space is multidimensional (e.g., portfolio allocation), non-linear, or multimodal (multiple "good" local solutions). These algorithms explore the space stochastically to find a very high-quality solution, but without formal guarantee of global optimality.

### The "Operator" Pattern

The strength of this library lies in the decoupling between the **search engines** (`searchOnAnswer`, `geneticAlgorithm`) and the **business logic** (the `Operators`).

1.  **The Engine** is a generic algorithm that knows nothing about the problem it solves. It only knows how to explore a search space.
2.  **The Operator** is a "black box" that takes a candidate solution (a number, an array, etc.) and returns a score or a boolean (`true`/`false`).

This separation allows the same powerful algorithms to be applied to an infinite number of problems simply by writing a new operator that encapsulates the rules of the domain.

---

## 🚀 Concrete Examples

The `solver_examples.js` file contains over 30 application examples, ranging from classic problems to socio-economic simulations:

-   **Finance**: Portfolio optimization to maximize return under risk constraints.
-   **Logistics**: Traveling Salesman Problem (TSP) and facility location.
-   **Economics**: Calculation of market equilibrium price or the impact of a carbon tax.
-   **Public Health**: Determination of vaccination rate for herd immunity.
-   **Ethics and AI**: Calculation of a bonus to correct algorithmic bias.
-   **Machine Learning**: Hyperparameter optimization for a regression model.
-   **Physics**: Discovery of the brachistochrone curve (the fastest slide) through gradient descent.
-   **Multi-Objective Optimization**: Finding the best trade-offs between cost and coverage for 5G antenna placement.

These examples demonstrate the flexibility and power of the library for modeling and solving complex real-world problems.

---

## 🛠️ Installation and Usage

This library is designed to be used in a Node.js environment.

```javascript
const { Dichotomy, Optimization } = require('./library.js');

// Your code here...
```

### Dependencies

-   `worker_threads` (native to Node.js) for parallelization.
-   No other external dependencies.

## 📝 Function Documentation (JSDoc)

All functions in `library.js` are documented using JSDoc. For a detailed description of the parameters and return values of each function, please refer directly to the comments in the source code.

### `Dichotomy.searchOnAnswer`

```javascript
/**
 * Performs a binary search on a function to find the smallest input value
 * that satisfies a condition. (Search on the answer).
 * @param {number} low - The lower bound of the search space.
 * @param {number} high - The upper bound of the search space.
 * @param {function(number): boolean} predicate - The test function. Must be monotonic (false...false, true...true).
 * @param {number} [precision=1e-9] - The required precision for the answer (for floating-point numbers).
 * @returns {number} The smallest (approximate) value that makes the predicate 'true'.
 */
Dichotomy.searchOnAnswer(low, high, predicate, precision)
```

### `Optimization.simulatedAnnealing`

```javascript
/**
 * Finds a good solution to an optimization problem using Simulated Annealing.
 * @template TSolution - The type of the solution (can be a number, array, object...).
 * @param {TSolution} initialSolution - The starting point of the search.
 * @param {function(TSolution): number} evaluator - Function that evaluates a solution. The goal is to minimize this score.
 * @param {function(TSolution): TSolution} neighbor - Function that generates a random "neighbor" solution.
 * @param {number} [initialTemperature=1000] - The starting temperature.
 * @param {number} [coolingRate=0.995] - The cooling rate (close to 1).
 * @param {number} [maxIterations=10000] - The total number of iterations.
 * @returns {{solution: TSolution, energy: number}} The best solution/score pair found.
 */
Optimization.simulatedAnnealing(initialSolution, evaluator, neighbor, initialTemperature, coolingRate, maxIterations)
```

### `Optimization.geneticAlgorithm`

```javascript
/**
 * Solves an optimization problem using a Genetic Algorithm.
 * @template TChromosome - The type of the solution (a "chromosome").
 * @param {function(): TChromosome} createIndividual - Function to create a random individual.
 * @param {function(TChromosome): number} fitnessFunction - Evaluates an individual. The goal is to MINIMIZE this score.
 * @param {function(TChromosome, TChromosome): TChromosome} crossover - Crosses two parents to create a child.
 * @param {function(TChromosome): TChromosome} mutate - Applies a random mutation to an individual.
 * @param {object} options - Algorithm options (populationSize, generations, etc.).
 * @returns {{solution: TChromosome, fitness: number}} The best individual found.
 */
Optimization.geneticAlgorithm(createIndividual, fitnessFunction, crossover, mutate, options)
```

---

*Developed for modeling and solving complex problems with a first-principles approach.*