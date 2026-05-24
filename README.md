# robotic-awareness

A high-performance framework for robotic control, bitwise logic reasoning, and kinematic integration. This library focuses on turning high-level logical rules and 3D configurations into real-time actuator commands with built-in safety and learning.

![https://github.com/anonympins/robotic-awareness/blob/main/public/robot_hand.jpg?raw=true](https://github.com/anonympins/robotic-awareness/blob/main/public/robot_hand.jpg?raw=true "Title")

## 🚀 General Overview

`robotic-awareness` uses a hybrid approach combining **Bitwise Neural Networks** for logic and **Geometric Seeker Neurons** (Quaternions) for spatial awareness. It is designed to run complex robotic hands or multi-joint systems where safety rules and physical constraints must be computed at high frequencies (50Hz+).

## 🧠 Core Intelligence (`test.js`)

The engine is built around several specialized modules that handle everything from boolean safety logic to Inverse Kinematics.

### 1. Rule Engine & Bitwise Logic
The library features a unique way to compile human-readable JSON logic into high-performance bitwise networks.

*   **`RuleInterpreter.interpret(logic, varMap)`**: Compiles an nested JSON logic tree (AND, OR, NOT, XOR, MAJORITY) into a `MajorityNetwork`.
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
    *   **Safety Integration**: Injects real-time HALT or REDUCE_SPEED commands based on logical safety rules.

### 3. Geometric Learning
*   **`SeekerNeuron`**: A "Geometric Neuron" that uses Quaternions to learn spatial orientations. Instead of learning numbers, it learns directions in 3D space.
*   **`MeshController`**: Mapped to a sensor "skin", it learns to correlate complex tactile patterns to specific actuator positions.

---

## 🛠 Quick Start: Control Loop & 3D Sync

To run the system instantly, use the following pattern. It synchronizes your hardware data, bitwise logic, and the 3D visualizer using the same logic as the simulation in `test.js`.

```javascript
import { RobotFactory, Vector3, Quaternion } from './test.js';
import { GLBViewer } from './public/viewer.js';

// 1. Initialize the Engine and 3D Visualizer
const { 
    hub, actuators, varMap, safetyNet, behaviorNet, kinematicChain, sensorMapper 
} = RobotFactory.build(robotConfig);

const viewer = new GLBViewer('container-id');

async function start() {
    // Load the GLB model and setup skeletal mapping
    await viewer.initRobot(robotConfig);
    
    // Launch the real-time loop (50Hz)
    requestAnimationFrame(controlLoop);
}

function controlLoop() {
    const deltaTime = 0.02; // 20ms steps

    // 1. Fetch & Map raw sensor data (Analog to Vector)
    const rawHardwareData = { "idx_p1": 0.8, "torque_wrist": 0.1 };
    const sensorVector = sensorMapper.format(rawHardwareData);

    // 2. Prepare Bitwise Decision Inputs
    const decisionInputs = new Uint8Array(Object.keys(varMap).length);
    // Example: Map raw pressure to binary "contact" variable
    decisionInputs[varMap.contact] = rawHardwareData.idx_p1 > 0.5 ? 1 : 0;

    // 3. Evaluate Safety Logic (Compiled Bitwise Network)
    const isSafe = safetyNet.predict(decisionInputs)[0] === 1;

    // 4. Resolve Kinematics & Postures
    // Set a high-level target state from config
    hub.selectState("index", "GRAB");
    
    // Optional: Solve Inverse Kinematics for a 3D coordinate
    // kinematicChain.solveIK(new Vector3(0.1, 0.2, 0), actuators);

    // 5. Update Physical Actuators (PID + Compliance + Logic)
    actuators.forEach(actuator => {
        // Get tactile pressure if a sensor is mapped to this specific joint
        const sensorInfo = sensorMapper.registry.get(actuator.sensorId);
        const pressure = sensorInfo ? sensorVector[sensorInfo.globalIndex] : 0;

        actuator.update(
            decisionInputs, 
            hub.getTarget(actuator.group).orientation, 
            0,          // currentLoad (Torque feedback)
            isSafe,     // global movement enable
            null,       // learnedTarget override
            deltaTime,
            pressure    // tactile feedback
        );
    });

    // 6. Synchronize 3D Visualizer
    viewer.updateJoints(actuators);        // Sync joint rotations
    viewer.updateSensors(rawHardwareData); // Sync sensor heatmaps

    requestAnimationFrame(controlLoop);
}

start();
```

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

### 🛠 Automated Configuration Extraction
If you have a new 3D model (e.g., a rigged FBX hand) and need a starting `robot_config.json`:

```bash
# Using the extraction script
node extract.js ./models/my-robot.fbx ./my-config.json
```

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