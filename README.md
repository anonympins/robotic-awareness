# robotic-awareness

A high-performance framework for robotic control, bitwise logic reasoning, and kinematic integration. This library focuses on turning high-level logical rules and 3D configurations into real-time actuator commands with built-in safety and learning.

![https://github.com/anonympins/robotic-awareness/blob/main/public/robot_hand.jpg?raw=true](https://github.com/anonympins/robotic-awareness/blob/main/public/robot_hand.jpg?raw=true "Title")

## 🚀 General Overview

`robotic-awareness` uses a hybrid approach combining **Bitwise Neural Networks** for logic and **Geometric Seeker Neurons** (Quaternions) for spatial awareness. It is designed to run complex robotic hands or multi-joint systems where safety rules and physical constraints must be computed at high frequencies (50Hz+).

## 🧠 Core Intelligence (`neuro-lib.js`)

The engine is built around several specialized modules that handle everything from boolean safety logic to Inverse Kinematics.

### 1. Rule Engine & Bitwise Logic
The library features a unique way to compile human-readable JSON logic into high-performance bitwise networks.

*   **`RuleInterpreter.ifnterpret(logic, varMap)`**: Compiles an nested JSON logic tree (AND, OR, NOT, XOR, MAJORITY) into a `MajorityNetwork`.
*   **`MajorityNetwork`**: A multi-layer network of bitwise neurons that processes boolean inputs (sensors/states) in parallel without standard floating-point multiplications.
*   **`StatefulMajorityNetwork`**: A recurrent version of the network (RNN) capable of memory-based decisions (e.g., "detect if a button was pressed twice").

### 2. Kinematics & Spatial Control
Movement is handled by a robust kinematic chain supporting both Forward (FK) and Inverse Kinematics (IK).

*   **`KinematicChain`**: Manages the hierarchy of robot links.
    *   `calculateFK(jointValues)`: Computes the 3D position/orientation of every part.
    *   `solveIK(targetPos, actuators)`: Uses **CCD (Cyclic Coordinate Descent)** to move the end-effector to a target while respecting joint limits and damping.
*   **`RobotActuator`**: Represents a physical joint (Servo, Motor).
    *   `update(...)`: Runs a filtered **PID controller** with Feed-forward.
    *   **Compliance Mode**: Automatically detects stalls (obstacles) and enters a "soft" mode to prevent hardware damage.

### 3. Geometric Learning
*   **`SeekerNeuron`**: A "Geometric Neuron" that uses Quaternions to learn spatial orientations. Instead of learning numbers, it learns directions in 3D space.
*   **`MeshController`**: Mapped to a sensor "skin", it learns to correlate complex tactile patterns to specific actuator positions.

---

## 📄 Example Configuration (`robot_config.json`)

This file defines the physical structure, the bitwise logic for safety, and the predefined postures.

```json
{
  "version": "1.1",
  "metadata": { 
    "name": "G-NEURO-PROTOTYPE-V1",
    "model_url": "models/robot_hand.glb"
  },
  "system_settings": {
    "loop_frequency_hz": 50,
    "ik_solver_type": "CCD"
  },
  "variables": {
    "is_active": 0,
    "contact_detected": 1,
    "emergency_stop": 2
  },
  "sensors": {
    "tactile_skin": {
      "type": "analog_array",
      "mapping": [
        { "id": "finger_tip_01", "label": "Index Tip Sensor" }
      ]
    }
  },
  "logic": {
    "safety_ok": {
      "type": "AND",
      "args": [
        { "type": "NOT", "args": [{ "var": "emergency_stop" }] }
      ]
    },
    "behavior": {
      "grasp_ready": { 
        "type": "AND", 
        "args": [{ "var": "is_active" }, { "var": "contact_detected" }] 
      }
    }
  },
  "kinematics": {
    "arm_group": {
      "states": [
        { "tag": "REST", "euler": [0, 0, 0], "pos": [0, 0, 0] },
        { "tag": "GRAB", "euler": [0, 45, 0], "values": { "finger_joint": 70 } }
      ]
    }
  },
  "actuators": [
    {
      "name": "base_joint",
      "group": "arm_group",
      "parent": "base",
      "offset": [0, 0, 0],
      "kinematics": { "type": "revolute", "axis": [0, 0, 1] },
      "primitive": { "type": "box", "size": [0.1, 0.1, 0.1], "color": "#00ffff" },
      "config": { 
        "min": -180, "max": 180, "speed": 1.0, "kp": 0.8,
        "safety_rules": [
          { "condition": { "var": "emergency_stop" }, "action": "HALT", "severity": "CRITICAL" }
        ]
      }
    },
    {
      "name": "finger_joint",
      "group": "arm_group",
      "parent": "base_joint",
      "offset": [0, 0.1, 0],
      "kinematics": { "type": "revolute", "axis": [1, 0, 0] },
      "primitive": { "type": "cylinder", "radius": 0.02, "height": 0.08, "color": "#ff00ff" },
      "config": {
        "min": 0, "max": 90, "speed": 2.0, "sensorId": "finger_tip_01"
      }
    }
  ],
  "training": {
    "examples": [
      { "label": "IDLE", "input": [0], "output": [0, 0] },
      { "label": "TOUCH", "input": [0.8], "output": [10, 45] }
    ]
  }
}
```

To simulate a complete control loop to simulate the movement to the pose GRAB : 
```javascript
import { RobotFactory } from './neuro-lib.js';
import fs from 'fs';
import path from 'path';

// 1. Load the configuration from the provided JSON file
const configPath = 'C:/Dev/robotic-awareness/robot_config.json';
const robotConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 2. Use the Factory to build the components
// This is where sensorMapper is generated!
const { 
    hub, 
    actuators, 
    varMap, 
    safetyNet, 
    sensorMapper 
} = RobotFactory.build(robotConfig);

console.log("=== G-NEURO STANDALONE DEMO ===");
console.log(`Model loaded: ${robotConfig.metadata.name}`);
console.log(`Configured sensors: ${sensorMapper.inputSize} input points`);

// 3. Simulation of raw data coming from Hardware (e.g., Arduino/ESP32)
const rawHardwareData = {
    "finger_tip_01": 0.85,    // Strong pressure on the sensor defined in the JSON
    "system_voltage": 12.1
};

// 4. Transformation of raw data into a vector via the sensorMapper
// It places 0.85 at the correct index corresponding to "finger_tip_01" defined in the JSON
const sensorVector = sensorMapper.format(rawHardwareData);

// 5. Preparation of inputs for binary logic (Safety)
const decisionInputs = new Uint8Array(Object.keys(varMap).length);

// Map sensors to logical variables defined in "variables"
decisionInputs[varMap.is_active] = 1;
decisionInputs[varMap.contact_detected] = rawHardwareData.finger_tip_01 > 0.5 ? 1 : 0;
decisionInputs[varMap.emergency_stop] = 0; // No emergency stop

// 6. Safety evaluation via the compiled binary network
const isSafe = safetyNet.predict(decisionInputs)[0] === 1;

console.log("\n--- Real-Time Diagnostic ---");
console.log(`Logical State [contact_detected]: ${decisionInputs[varMap.contact_detected]}`);
console.log(`Global Safety (safety_ok): ${isSafe ? "✅ OK" : "❌ DANGER"}`);

// 7. Update a specific actuator
const finger = actuators.find(a => a.name === "finger_joint");

if (finger) {
    // Simulate movement toward the "GRAB" pose
    hub.selectState("arm_group", "GRAB");
    const state = hub.getTarget("arm_group");
    
    // Inject the direct joint value if it exists in the state (70° for GRAB)
    if (state.values && state.values[finger.name]) {
        finger.directJointCommand = state.values[finger.name];
    }

    const pressure = sensorVector[sensorMapper.registry.get("finger_tip_01").globalIndex];
    finger.update(decisionInputs, state.orientation, 0, isSafe, null, 0.02, pressure);

    console.log(`Position finger_joint: ${finger.currentValue.toFixed(2)}° (Pressure: ${pressure})`);
}
```

### 🛠 Automated Configuration Extraction
If you have a new 3D model (e.g., a rigged FBX hand) and need a starting `robot_config.json`:

```bash
# Using the extraction script
node extract.js ./models/my-robot.fbx ./my-config.json
```

---

## 📚 API & Neuron Documentation

### 1. Mathematical Foundation

#### `Quaternion`
High-performance 4D complex number class for spatial rotation.
*   **`fromEuler(x, y, z)`**: Creates a quaternion from degrees.
*   **`rotateVector(v)`**: Rotates a `Vector3` using an optimized Rodrigues formula (avoids full matrix multiplication).
*   **`static slerp(q1, q2, t)`**: Performs Spherical Linear Interpolation for smooth motion between two poses.

#### `Vector3`
Standard 3D vector class optimized for zero-allocation reuse.
*   **`dot(v)` / `cross(v)`**: Standard vector products.
*   **`distanceTo(v)`**: Calculates Euclidean distance.

 ---

### 2. Logical & Bitwise Neurons

These neurons process boolean signals using bitwise operators, making them extremely fast on embedded hardware.

#### `MajorityNeuron`
A neuron that fires based on a weighted vote of its inputs.
*   **Usage**: `new MajorityNeuron(weights, threshold)`
*   **Logic**: Returns `1` if `sum(inputs[i] * weights[i]) >= threshold`, else `0`.

#### `MajorityNetwork`
A multi-layer architecture composed of `MajorityNeurons`.
*   **`predict(inputs)`**: Propagates boolean signals through all layers.
*   **`export()`**: Returns the weights and thresholds in a portable JSON format.

#### `StatefulMajorityNetwork`
A Recurrent Neural Network (RNN) implementation for bitwise logic.
*   **Memory**: Uses its own previous output as an input for the next cycle.
*   **Use Case**: Pattern detection (e.g., detecting a double-click or a sequence of sensor events).

#### `BitwiseNetwork`
A collection of static methods for pure bit-level operations.
*   **`halfAdder(a, b)`**: Returns `{sum, carry}` using XOR and AND.
*   **`xor(x1, x2)`**: A 2-layer logical implementation of the XOR gate.

 ---

### 3. Geometric Neurons

#### `SeekerNeuron`
A "Spatial Neuron" that learns to point in a specific direction.
*   **Weight**: Its internal weight is a `Quaternion`.
*   **`predict(inputQ)`**: Returns the alignment (dot product) between its orientation and the input.
*   **`update(inputQ, error, lr)`**: Adjusts its orientation to reduce spatial error using momentum-based condensation.

#### `QuaternionAttention`
A spatial attention mechanism.
*   **Logic**: Uses the dot product of quaternions to weigh information. It accumulates orientations instead of scalar values, preserving 3D phase information.

 ---

### 4. Machine Learning & Sequence Modeling

#### `BinaryTransformer`
A transformer architecture designed to process bitstreams.
*   **`MultiHeadAttentionBinary`**: Uses XOR-based causal attention.
*   **`generate(seed, nTokens)`**: Generates sequences by predicting the next bitstream based on previous context.

#### `StochasticPerceptron`
A neuron that uses probability-to-bitstream conversion (Bernoulli samples).
*   **`predictStochastic(xStreams)`**: Performs multiplication via bitwise AND on stochastic streams and counts the result (popcount).

 ---

### 5. Robotic Control (Cerebellum)

#### `AnalogNeuralLayer`
A continuous-value neuron layer for motor control.
*   **Standardization**: Automatically tracks `runningMeans` and `runningVars` to normalize sensor data on the fly.
*   **Momentum**: Uses EMA-based momentum to stabilize learning of physical constraints.

#### `MeshController`
The "Brain" for smart fabrics or complex sensor meshes.
*   **`addAnchorsFromExamples(examples)`**: Sets master reference points for interpolation.
*   **`compute(meshSensors)`**: Uses Inverse Distance Weighting (IDW) to find the optimal actuator response based on the current tactile "skin" deformation.

 ---

### 6. Rule Compiler

#### `RuleInterpreter`
The compiler that turns human-logic into machine-bitwise code.
*   **Supported Types**: `AND`, `OR`, `NOT`, `XOR`, `MAJORITY`, `AT_LEAST_N`.
*   **Optimization**: Automatically transforms complex gates (like XOR) into basic bitwise networks and handles "pass-through" signals between layers.

---

## 🧠 Advanced Features

### Neural Skinning
The `GLBViewer` includes a "Soft Rigging" algorithm. If your 3D model isn't rigged with bones, the viewer calculates "Neural Weights" to deform the mesh realistically based on joint proximity.

### Unified Control UI
The viewer automatically injects a diagnostic panel providing:
- **Precision Mode:** Toggle LOD settings.
- **Subsystem Diagnostic:** Real-time info on the selected actuator (Limits, Speed, Parent).
- **Manual Override:** Integration with external control panels.

## 🛠 Requirements

- **Frontend:** Three.js (r150+), OrbitControls, GLTFLoader.
- **Backend (Extraction):** Node.js, `@gltf-transform/core`, `assimpjs`.

---
*Developed for physical integration and logical safety rules.*