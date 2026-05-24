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

## 🏗 Building the Engine

The `RobotFactory` is the main entry point to instantiate the entire system from a configuration file.

```javascript
import { RobotFactory } from './test.js';

// 1. Build the full stack from JSON
const { 
    hub,             // Target/Posture manager
    actuators,       // Array of RobotActuator instances
    safetyNet,       // Compiled safety logic
    kinematicChain,  // FK/IK Solver
    sensorMapper     // Raw data to Bitwise mapper
} = RobotFactory.build(robotConfiguration);
```

---

## 🛠 Usage Guide

### Control Loop Implementation
Here is how you typically run the control loop to sync logic, sensors, and hardware:

```javascript
function controlLoop() {
    // 1. Prepare inputs (from real sensors or state)
    const decisionInputs = sensorMapper.format(rawHardwareData);

    // 2. Resolve High-Level Posture (e.g., "GRAB")
    hub.selectState("index", "GRAB");
    const target = hub.getTarget("index"); // Returns target orientation/position

    // 3. Optional: Solve Inverse Kinematics for a 3D point
    kinematicChain.solveIK(new Vector3(0.1, 0.2, 0), actuators);

    // 4. Update Actuators (PID + Safety + Compliance)
    actuators.forEach(actuator => {
        actuator.update(
            decisionInputs, 
            target.orientation, 
            currentLoad,      // Ampere/Torque feedback
            true              // Global enable
        );
    });

    requestAnimationFrame(controlLoop);
}
```

### Automated Configuration Extraction
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