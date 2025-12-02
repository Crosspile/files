<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Three.js Physics Humanoid - Dynamic Animation Styles</title>
    <style>
        body { margin: 0; overflow: hidden; background-color: #1a1a1a; font-family: sans-serif; }
        #instructions {
            position: absolute;
            top: 20px;
            width: 100%;
            text-align: center;
            color: white;
            pointer-events: none;
            text-shadow: 1px 1px 2px black;
            user-select: none;
        }
        #controls-help {
            position: absolute;
            bottom: 20px;
            width: 100%;
            text-align: center;
            color: #ccc;
            font-size: 0.8em;
            pointer-events: none;
            user-select: none;
        }
        canvas { display: block; }
        .dg.main {
            z-index: 1000 !important;
            font-size: 11px !important;
            width: 340px !important; 
            max-height: 90vh;
            overflow-y: auto;
        }
        .dg input {
            color: #000;
        }
    </style>
    <script type="importmap">
        {
            "imports": {
                "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
                "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
            }
        }
    </script>
</head>
<body>
    <div id="instructions">
        <h1>Physics-Based Humanoid</h1>
        <p><b>W A S D</b> to Move | <b>SHIFT</b> for Run/Sprint | <b>SPACE</b> to Jump</p>
        <p><b>Left Click + Drag</b> to Orbit | <b>Scroll</b> to Zoom</p>
    </div>
    <div id="controls-help">System: Harmonic Spine, JSON Presets, Mirrored Joint Control</div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.9/dat.gui.min.js"></script>
    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        // Helper functions for degree/radian conversion
        const DTR = THREE.MathUtils.degToRad;
        const RTD = THREE.MathUtils.radToDeg;

        // --- Camera Control Manager (Decoupled Logic) ---
        class CameraManager {
            constructor(camera, rendererDomElement, targetObject) {
                this.targetObject = targetObject;
                this.worldPos = new THREE.Vector3(); // Reusable vector for world position

                // Initialize OrbitControls
                this.controls = new OrbitControls(camera, rendererDomElement);
                this.controls.enableDamping = true; // for a smoother feel
                this.controls.dampingFactor = 0.05;
                this.controls.minDistance = 2;
                this.controls.maxDistance = 20;
                this.controls.enablePan = false; // Disable panning to keep focus locked on torso

                // Set initial target to current torso position
                if (this.targetObject) {
                    this.targetObject.getWorldPosition(this.worldPos);
                    this.controls.target.copy(this.worldPos);
                }

                // Set initial position: offset from the target
                // We calculate a nice angle behind the bot
                const initialOffset = new THREE.Vector3(0, 2, -5); 
                camera.position.copy(this.controls.target).add(initialOffset);
                camera.lookAt(this.controls.target);
            }

            update(delta) {
                if (this.targetObject) {
                    // 1. Get the real-time position of the robot's torso
                    this.targetObject.getWorldPosition(this.worldPos);

                    // 2. Calculate the smoothed new target position for the controls
                    const currentTarget = this.controls.target.clone();
                    const smoothTarget = currentTarget.clone().lerp(this.worldPos, 0.1);
                    
                    // 3. Calculate how much the target moved in this frame
                    const deltaMove = smoothTarget.clone().sub(currentTarget);

                    // 4. Apply the move to the controls target
                    this.controls.target.copy(smoothTarget);

                    // 5. CRITICAL: Apply the SAME movement to the camera position
                    // This keeps the relative distance (zoom) and angle (orbit) exactly as the user set it,
                    // effectively dragging the camera along with the robot.
                    this.controls.object.position.add(deltaMove);
                }

                // 6. Update controls (handles damping and user input)
                this.controls.update(); 
            }
        }

        // --- 0. ANIMATION CONFIGURATION DATA ---
        const ANIM_CONFIGS = {
            'Walk': { speedFactor: 1.0, rotSpeed: 1.0, stepDuration: 0.45, stepHeight: 0.3, stanceHeight: 1.55, forwardLean: 0.1, armAmp: 1.5, armRestAngle: 0.0, hipTilt: 0.1, hipYaw: 0.15, chestYaw: 1.2, armOutwardRoll: 0.2, elbowBend: -0.1, stepLength: 1.0, legSpread: 0.25 },
            'Run': { speedFactor: 3.0, rotSpeed: 1.75, stepDuration: 0.22, stepHeight: 0.5, stanceHeight: 1.40, forwardLean: 0.6, armAmp: 2.5, armRestAngle: 0.5, hipTilt: 0.2, hipYaw: 0.05, chestYaw: 0.8, armOutwardRoll: 0.4, elbowBend: -1.57, stepLength: 1.3, legSpread: 0.2 },
            'Crouch Walk': { speedFactor: 0.25, rotSpeed: 0.5, stepDuration: 0.6, stepHeight: 0.15, stanceHeight: 1.0, forwardLean: 0.2, armAmp: 0.5, armRestAngle: 0.2, hipTilt: 0.05, hipYaw: 0.05, chestYaw: 0.5, armOutwardRoll: 0.2, elbowBend: 0.0, stepLength: 0.8, legSpread: 0.3 },
            'Stealth Walk': { speedFactor: 0.5, rotSpeed: 0.75, stepDuration: 0.6, stepHeight: 0.2, stanceHeight: 1.45, forwardLean: 0.1, armAmp: 0.7, armRestAngle: 0.3, hipTilt: 0.05, hipYaw: 0.05, chestYaw: 0.5, armOutwardRoll: 0.2, elbowBend: -0.2, stepLength: 0.9, legSpread: 0.25 },
            'Manly': { speedFactor: 1.0, rotSpeed: 0.75, stepDuration: 0.5, stepHeight: 0.25, stanceHeight: 1.5, forwardLean: 0.05, armAmp: 1.0, armRestAngle: 0.1, hipTilt: 0.05, hipYaw: 0.25, chestYaw: 0.5, armOutwardRoll: 0.5, elbowBend: -0.2, stepLength: 1.1, legSpread: 0.35 },
            'Feminine': { speedFactor: 1.0, rotSpeed: 1.25, stepDuration: 0.4, stepHeight: 0.35, stanceHeight: 1.6, forwardLean: 0.08, armAmp: 1.8, armRestAngle: -0.1, hipTilt: 0.2, hipYaw: 0.05, chestYaw: 1.8, armOutwardRoll: 0.15, elbowBend: -0.1, stepLength: 0.9, legSpread: 0.15 },
            'Catwalk': { speedFactor: 0.8, rotSpeed: 1.5, stepDuration: 0.55, stepHeight: 0.4, stanceHeight: 1.65, forwardLean: 0.0, armAmp: 1.2, armRestAngle: 0.0, hipTilt: 0.4, hipYaw: 0.0, chestYaw: 3.0, armOutwardRoll: 0.1, elbowBend: 0.0, stepLength: 1.2, legSpread: 0.1 },
            'Cartoon Walk': { speedFactor: 1.5, rotSpeed: 1.5, stepDuration: 0.3, stepHeight: 0.6, stanceHeight: 1.3, forwardLean: 0.4, armAmp: 3.5, armRestAngle: 0.5, hipTilt: 0.1, hipYaw: 0.1, chestYaw: 1.0, armOutwardRoll: 0.5, elbowBend: -1.2, stepLength: 1.4, legSpread: 0.3 },
            'Tired Walk': { speedFactor: 0.5, rotSpeed: 0.5, stepDuration: 0.7, stepHeight: 0.1, stanceHeight: 1.4, forwardLean: 0.2, armAmp: 0.5, armRestAngle: 0.6, hipTilt: 0.0, hipYaw: 0.1, chestYaw: 0.5, armOutwardRoll: 0.1, elbowBend: 0.1, stepLength: 0.7, legSpread: 0.25 },
            'Energetic Walk': { speedFactor: 1.2, rotSpeed: 1.5, stepDuration: 0.35, stepHeight: 0.4, stanceHeight: 1.55, forwardLean: 0.2, armAmp: 2.0, armRestAngle: 0.4, hipTilt: 0.15, hipYaw: 0.1, chestYaw: 1.5, armOutwardRoll: 0.3, elbowBend: -0.5, stepLength: 1.1, legSpread: 0.25 },
            'Angry Walk': { speedFactor: 0.9, rotSpeed: 0.75, stepDuration: 0.45, stepHeight: 0.2, stanceHeight: 1.5, forwardLean: 0.3, armAmp: 2.5, armRestAngle: 0.2, hipTilt: 0.05, hipYaw: 0.3, chestYaw: 2.0, armOutwardRoll: 0.2, elbowBend: -0.8, stepLength: 1.2, legSpread: 0.3 },
        };

        const DEFAULT_PHYSICS = {
            spineCounterFactor: 1.6, absTiltWeight: 0.4, chestTiltWeight: 0.6,
            neckCorrection: 0.0, headStiff: 0.8, spineSmooth: 0.6,
            stepLength: 1.0, legSpread: 0.25,
            // New Jump Physics Defaults
            jumpStrength: 8.0, gravity: -25.0
        };

        // Manual Joint Offsets (STORED IN RADIANS)
        const jointOffsets = {
            hips: { x: 0, y: 0, z: 0 }, abs: { x: 0, y: 0, z: 0 }, chest: { x: 0, y: 0, z: 0 }, neck: { x: 0, y: 0, z: 0 }, head: { x: 0, y: 0, z: 0 },
            arm_shoulder: { x: 0, y: 0, z: 0 }, arm_upper: { x: 0, y: 0, z: 0 }, arm_lower: { x: 0, y: 0, z: 0 }, arm_hand: { x: 0, y: 0, z: 0 },
            leg_upper: { x: 0, y: 0, z: 0 }, leg_lower: { x: 0, y: 0, z: 0 }, leg_foot: { x: 0, y: 0, z: 0 },
        };

        // Procedural State (prevents accumulation errors)
        const proceduralState = {
            hips: { x:0, y:0, z:0 }, abs: { x:0, y:0, z:0 }, chest: { x:0, y:0, z:0 },
            armL: { root: {x:0,y:0,z:0}, upper: {x:0,y:0,z:0}, mid: {x:0,y:0,z:0} },
            armR: { root: {x:0,y:0,z:0}, upper: {x:0,y:0,z:0}, mid: {x:0,y:0,z:0} }
        };

        // UI State
        const guiConfig = { ...ANIM_CONFIGS['Walk'], ...DEFAULT_PHYSICS };
        const currentConfig = { ...guiConfig };
        let fetchedData = {};

        const uiState = {
            movementStyle: 'Walk',
            styleKeys: Object.keys(ANIM_CONFIGS),
            secondaryStyle: 'None',
            secondaryKeys: ['None'],
            stepNoise: 0.08, 
            exportConfig: function() {
                const exportObj = {};
                Object.keys(ANIM_CONFIGS['Walk']).forEach(k => exportObj[k] = parseFloat(guiConfig[k].toFixed(3)));
                Object.keys(DEFAULT_PHYSICS).forEach(k => exportObj[k] = parseFloat(guiConfig[k].toFixed(3)));
                const offsets = {};
                let hasOffsets = false;
                for(let key in jointOffsets) {
                    const j = jointOffsets[key];
                    if(Math.abs(j.x)>0.001 || Math.abs(j.y)>0.001 || Math.abs(j.z)>0.001) {
                        offsets[key] = { x: parseFloat(j.x.toFixed(3)), y: parseFloat(j.y.toFixed(3)), z: parseFloat(j.z.toFixed(3)) };
                        hasOffsets = true;
                    }
                }
                if(hasOffsets) exportObj.jointOffsets = offsets;
                const jsonString = JSON.stringify(exportObj, null, 4);
                console.log(`%c[${uiState.movementStyle} Export]`, 'color: #bada55; font-weight: bold;');
                console.log(jsonString);
                // Replaced alert() with a console log/message for better UX
                document.getElementById('controls-help').innerText = 'Config successfully exported to Console (F12)!';
                setTimeout(() => {
                     document.getElementById('controls-help').innerText = 'System: Harmonic Spine, JSON Presets, Mirrored Joint Control';
                }, 3000);
            },
            resetJoints: function(partKey) {
                if(partKey) {
                    jointOffsets[partKey].x=0; jointOffsets[partKey].y=0; jointOffsets[partKey].z=0;
                } else {
                    for(let k in jointOffsets) { jointOffsets[k].x=0; jointOffsets[k].y=0; jointOffsets[k].z=0; }
                }
                updateAllDisplays();
            }
        };

        // Global variable for the camera manager
        let cameraManager; 

        // --- 1. SETUP ---
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x222222); 
        scene.fog = new THREE.Fog(0x222222, 10, 50);

        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        document.body.appendChild(renderer.domElement);

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        scene.add(hemiLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(5, 10, 5);
        dirLight.castShadow = true;
        scene.add(dirLight);

        // --- 2. GUI SETUP ---
        const gui = new dat.GUI();

        function updateAllDisplays() {
            for (let i in gui.__controllers) gui.__controllers[i].updateDisplay();
            for (let f in gui.__folders) {
                const folder = gui.__folders[f];
                for (let i in folder.__controllers) folder.__controllers[i].updateDisplay();
                for (let sub in folder.__folders) { 
                    const subfolder = folder.__folders[sub];
                    for (let j in subfolder.__controllers) subfolder.__controllers[j].updateDisplay();
                }
            }
        }
        
        // --- Biomechanical Limits in Degrees ---
        const getAxisRange = (partKey, axis) => {
            let min = -180, max = 180, step = 1;
            let axisName = '';

            // Pitch (X) controls forward/backward movement (flexion/extension)
            if (axis === 'x') {
                axisName = 'Pitch (Flex/Ext)';
                if (partKey === 'arm_lower') { // Elbow Flexion (0 to -140 degrees bend)
                    min = -140; max = 0; step = 0.5;
                } else if (partKey === 'leg_lower') { // Knee Flexion (0 to -150 degrees bend)
                    min = -150; max = 0; step = 0.5;
                } else if (partKey === 'leg_upper') { // Hip Flexion/Extension
                    min = -90; max = 90; step = 1;
                } else if (partKey.includes('hips') || partKey.includes('abs') || partKey.includes('chest')) { // Torso Flexion
                    min = -45; max = 45; step = 1;
                } else if (partKey.includes('neck') || partKey.includes('head')) { // Head Nod
                    min = -45; max = 45; step = 1;
                }
            } 
            // Yaw (Y) controls side-to-side rotation (twist)
            else if (axis === 'y') {
                axisName = 'Yaw (Twist)';
                if (partKey.includes('neck') || partKey.includes('head')) { // Head Turn
                    min = -60; max = 60; step = 1;
                } else if (partKey.includes('hips') || partKey.includes('abs') || partKey.includes('chest')) { // Torso Twist
                    min = -30; max = 30; step = 1;
                } else if (partKey === 'arm_shoulder' || partKey === 'arm_upper') { // Shoulder/Upper arm twist
                    min = -90; max = 90; step = 1;
                } else if (partKey === 'arm_lower' || partKey === 'leg_lower' || partKey === 'leg_foot') {
                    // Lower limb yaw is very limited or handled by roll/supination. Keep small.
                    min = -10; max = 10; step = 0.1;
                }
            } 
            // Roll (Z) controls tilting/abduction/adduction
            else if (axis === 'z') {
                axisName = 'Roll (Tilt/Ab-Ad)';
                 if (partKey.includes('hips') || partKey.includes('abs') || partKey.includes('chest')) { // Torso Side Bend
                    min = -30; max = 30; step = 1;
                } else if (partKey === 'leg_upper') { // Hip Abduction/Adduction
                    min = -45; max = 45; step = 1;
                } else if (partKey === 'arm_shoulder' || partKey === 'arm_upper') { // Shoulder Abduction/Adduction
                    min = -90; max = 90; step = 1;
                } else if (partKey === 'arm_lower') { // Forearm supination/pronation
                    min = -90; max = 90; step = 1;
                } else if (partKey === 'leg_foot') {
                    min = -30; max = 30; step = 1;
                } else if (partKey === 'leg_lower') {
                    // Knee roll is almost zero
                    min = -5; max = 5; step = 0.1;
                }
            }

            return { min, max, step, axisName };
        };

        const globalFolder = gui.addFolder('1. Global Settings');
        globalFolder.add(uiState, 'movementStyle', uiState.styleKeys).name('Base Preset').onChange(val => {
            uiState.resetJoints(); 
            const preset = ANIM_CONFIGS[val];
            for (const key in preset) guiConfig[key] = preset[key];
            updateAllDisplays();
        });
        
        let secondaryCtrl = globalFolder.add(uiState, 'secondaryStyle', ['None']).name('Secondary Presets');
        
        globalFolder.add(uiState, 'stepNoise', 0.0, 0.2).name('Step Noise');
        globalFolder.add(guiConfig, 'speedFactor', 0.1, 5.0).name('Speed Mult');
        globalFolder.open();

        const procFolder = gui.addFolder('2. Procedural Tuning');
        const stanceSub = procFolder.addFolder('Stance & Legs');
        stanceSub.add(guiConfig, 'stepDuration', 0.1, 1.0).name('Step Time');
        stanceSub.add(guiConfig, 'stepHeight', 0.0, 1.0).name('Leg Lift');
        stanceSub.add(guiConfig, 'stepLength', 0.5, 3.0).name('Step Length');
        stanceSub.add(guiConfig, 'legSpread', 0.0, 1.0).name('Leg Spread');
        stanceSub.add(guiConfig, 'stanceHeight', 0.8, 1.8).name('Stance Height');
        stanceSub.add(guiConfig, 'forwardLean', 0.0, 1.0).name('Fwd Lean');
        stanceSub.open();

        const bodySub = procFolder.addFolder('Torso & Arms');
        bodySub.add(guiConfig, 'hipTilt', 0.0, 0.8).name('Hip Tilt');
        bodySub.add(guiConfig, 'hipYaw', 0.0, 0.8).name('Hip Yaw');
        bodySub.add(guiConfig, 'spineCounterFactor', 0.0, 3.0).name('Spine Harmonic');
        bodySub.add(guiConfig, 'armAmp', 0.0, 5.0).name('Arm Amp');
        bodySub.add(guiConfig, 'headStiff', 0.0, 1.0).name('Head Lock');
        // Add Jump controls to GUI
        bodySub.add(guiConfig, 'jumpStrength', 1.0, 15.0).name('Jump Strength');
        bodySub.add(guiConfig, 'gravity', -50.0, -5.0).name('Gravity');
        bodySub.open();
        procFolder.open();

        const jointsFolder = gui.addFolder('3. Manual Joint Offsets (Degrees)');

        // Function to create joint controls with degree/radian conversion
        const addJointControl = (folder, partName, partKey, obj) => {
            const f = folder.addFolder(partName);
            
            // Create a temporary proxy object to handle degree <-> radian conversion for the GUI
            const jointProxy = {};

            const createAxisProxy = (axis) => {
                const { min, max, step, axisName } = getAxisRange(partKey, axis);
                
                Object.defineProperty(jointProxy, axis, {
                    // Getter: Converts internal radian value to degrees for GUI display
                    get: () => RTD(obj[axis]),
                    // Setter: Takes degree value from GUI, clamps it, and converts back to radians for internal use
                    set: (v) => { obj[axis] = DTR(THREE.MathUtils.clamp(v, min, max)); },
                    enumerable: true,
                    configurable: true
                });

                // Add the control using degree limits
                f.add(jointProxy, axis, min, max, step).name(`${axis.toUpperCase()} (${axisName})`);
            };
            
            createAxisProxy('x');
            createAxisProxy('y');
            createAxisProxy('z');

            f.add({ reset: () => uiState.resetJoints(partKey) }, 'reset').name('Reset ' + partName);
        };
        
        // --- Joint Control Setup using Degree Controls ---
        addJointControl(jointsFolder, 'Hips', 'hips', jointOffsets.hips);
        addJointControl(jointsFolder, 'Abs', 'abs', jointOffsets.abs);
        addJointControl(jointsFolder, 'Chest', 'chest', jointOffsets.chest);
        addJointControl(jointsFolder, 'Neck', 'neck', jointOffsets.neck);
        addJointControl(jointsFolder, 'Head', 'head', jointOffsets.head);
        addJointControl(jointsFolder, 'Shoulders', 'arm_shoulder', jointOffsets.arm_shoulder);
        addJointControl(jointsFolder, 'Upper Arms', 'arm_upper', jointOffsets.arm_upper);
        addJointControl(jointsFolder, 'Forearms', 'arm_lower', jointOffsets.arm_lower);
        addJointControl(jointsFolder, 'Hands', 'arm_hand', jointOffsets.arm_hand);
        addJointControl(jointsFolder, 'Thighs', 'leg_upper', jointOffsets.leg_upper);
        addJointControl(jointsFolder, 'Shins', 'leg_lower', jointOffsets.leg_lower);
        addJointControl(jointsFolder, 'Feet', 'leg_foot', jointOffsets.leg_foot);
        
        jointsFolder.add({reset: ()=>uiState.resetJoints()}, 'reset').name('Reset ALL Joints');
        gui.add(uiState, 'exportConfig').name('★ EXPORT CONFIG');

        fetch('https://raw.githubusercontent.com/Crosspile/files/refs/heads/main/scripts/proceduralanimtest/animation-data.json')
            .then(res => res.text())
            .then(text => {
                try {
                    fetchedData = JSON.parse(text);
                    const newKeys = Object.keys(fetchedData);
                    if(newKeys.length > 0) {
                        uiState.secondaryKeys = ['None', ...newKeys];
                        secondaryCtrl.remove();
                        secondaryCtrl = globalFolder.add(uiState, 'secondaryStyle', uiState.secondaryKeys).name('Secondary Presets').onChange(val => {
                            uiState.resetJoints(); 
                            if(val !== 'None' && fetchedData[val]) {
                                const preset = fetchedData[val];
                                for (const key in preset) if(guiConfig.hasOwnProperty(key)) guiConfig[key] = preset[key];
                                if(preset.jointOffsets) {
                                    for(const jKey in preset.jointOffsets) {
                                        if(jointOffsets[jKey]) {
                                            jointOffsets[jKey].x = preset.jointOffsets[jKey].x;
                                            jointOffsets[jKey].y = preset.jointOffsets[jKey].y;
                                            jointOffsets[jKey].z = preset.jointOffsets[jKey].z;
                                        }
                                    }
                                }
                            }
                            updateAllDisplays();
                        });
                    }
                } catch(e) { console.error(e); }
            });


        // --- 3. ENVIRONMENT ---
        const worldGroup = new THREE.Group();
        scene.add(worldGroup);
        scene.add(new THREE.GridHelper(50, 50, 0x444444, 0x111111));
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        worldGroup.add(plane);
        
        for(let i=0; i<5; i++) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5+i*0.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x444444 }));
            m.position.set(0, (0.5+i*0.5)/2 + i*0.25, 3 + i*1.5);
            m.castShadow=true; m.receiveShadow=true; worldGroup.add(m);
        }


        // --- 4. RIG ---
        const robot = { root: new THREE.Group(), hips:null, abs:null, chest:null, neck:null, head:null, legL:null, legR:null, armL:null, armR:null };
        scene.add(robot.root);
        const mats = { 
            hips: new THREE.MeshStandardMaterial({ color: 0xcc3333 }), 
            abs: new THREE.MeshStandardMaterial({ color: 0xff5555 }), 
            chest: new THREE.MeshStandardMaterial({ color: 0xff8888 }), 
            limb: new THREE.MeshStandardMaterial({ color: 0x3388ff }), 
            joint: new THREE.MeshStandardMaterial({ color: 0x888888 }),
            skin: new THREE.MeshStandardMaterial({ color: 0xffccaa }) 
        };

        robot.hips = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.35), mats.hips); robot.hips.castShadow=true; robot.root.add(robot.hips);
        robot.abs = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.3), mats.abs); robot.abs.position.y=0.25; robot.abs.castShadow=true; robot.hips.add(robot.abs);
        robot.chest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.4), mats.chest); robot.chest.position.y=0.3; robot.chest.castShadow=true; robot.abs.add(robot.chest);
        
        // NECK (FIXED PIVOT): Translate geometry up so pivot is at bottom
        const neckGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.15, 8);
        neckGeo.translate(0, 0.075, 0); // Shift up by half height
        robot.neck = new THREE.Mesh(neckGeo, new THREE.MeshStandardMaterial({color:0x444444})); 
        robot.neck.position.y=0.175; // Top of chest (Chest center 0 + 0.35/2)
        robot.chest.add(robot.neck);

        // HEAD (FIXED PIVOT): Translate geometry up so pivot is at bottom
        const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        headGeo.translate(0, 0.15, 0); // Shift up by half height
        robot.head = new THREE.Mesh(headGeo, mats.skin); 
        robot.head.position.y=0.15; // Top of neck (Neck height 0.15)
        robot.head.castShadow=true; 
        robot.neck.add(robot.head);
        
        // EYES (Adjusted for new head pivot)
        // Head pivot is now at chin (y=0). Center of face is y=0.15.
        // Old eyes were 0.05 above center. So new y = 0.15 + 0.05 = 0.2
        const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.1), new THREE.MeshBasicMaterial({color:0x000000}));
        eyeL.position.set(0.08, 0.2, 0.15);
        robot.head.add(eyeL);

        const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.1), new THREE.MeshBasicMaterial({color:0x000000}));
        eyeR.position.set(-0.08, 0.2, 0.15);
        robot.head.add(eyeR);

        function createLimb(parent, x, y, isArm) {
            const root = new THREE.Group(); root.position.set(x, y, 0); parent.add(root);
            root.add(new THREE.Mesh(new THREE.SphereGeometry(isArm?0.08:0.09), mats.joint));
            const upper = new THREE.Group(); root.add(upper);
            const l1 = isArm?0.5:0.7, l2 = isArm?0.5:0.7;
            const um = new THREE.Mesh(new THREE.BoxGeometry(isArm?0.1:0.15, l1, isArm?0.1:0.15), isArm?mats.chest:mats.limb);
            um.position.y = -l1/2; um.castShadow=true; upper.add(um);
            const mid = new THREE.Group(); mid.position.y = -l1; upper.add(mid);
            mid.add(new THREE.Mesh(new THREE.SphereGeometry(isArm?0.08:0.09), mats.joint));
            const lm = new THREE.Mesh(new THREE.BoxGeometry(isArm?0.08:0.12, l2, isArm?0.08:0.12), isArm?mats.chest:mats.limb);
            lm.position.y = -l2/2; lm.castShadow=true; mid.add(lm);
            let endEffector;
            if(!isArm) {
                endEffector = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.3), new THREE.MeshStandardMaterial({color:0x111111}));
                endEffector.position.set(0, -l2-0.05, 0.05); endEffector.castShadow=true; mid.add(endEffector);
            } else {
                endEffector = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mats.skin);
                endEffector.position.set(0, -l2, 0); endEffector.castShadow=true; mid.add(endEffector);
            }
            return { root, upper, mid, endEffector, len1:l1, len2:l2 };
        }
        robot.legL = createLimb(robot.hips, 0.25, -0.1, false); robot.legR = createLimb(robot.hips, -0.25, -0.1, false);
        robot.armL = createLimb(robot.chest, 0.35, 0.1, true); robot.armR = createLimb(robot.chest, -0.35, 0.1, true);

        // --- Camera Manager Initialization (After Robot Rig is created) ---
        // Updated to target the chest (torso) directly
        cameraManager = new CameraManager(camera, renderer.domElement, robot.chest);

        // --- 5. LOGIC & INPUT ---
        const raycaster = new THREE.Raycaster(); 
        const down = new THREE.Vector3(0,-1,0);
        function getFloorY(x, z) {
            raycaster.set(new THREE.Vector3(x, 5, z), down);
            const hits = raycaster.intersectObjects(worldGroup.children);
            return hits.length > 0 ? hits[0].point.y : -999;
        }

        const state = {
            targetPos: new THREE.Vector3(0,0,2), rotY: 0,
            footL: new THREE.Vector3(0.25, 0.1, 0), footR: new THREE.Vector3(-0.25, 0.1, 0),
            isStepping: false, swingLeg: null, stepStart: new THREE.Vector3(), stepEnd: new THREE.Vector3(),
            stepTime: 0, stepDuration: 0.45,
            // Jump State
            isJumping: false,
            jumpVelocity: 0,
            jumpHeightOffset: 0
        };
        const inputTarget = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({color: 0xffff00, transparent: true, opacity: 0.5}));
        scene.add(inputTarget);

        const keys = { w:false, a:false, s:false, d:false, space: false };
        window.addEventListener('keydown', e => { 
            keys[e.key.toLowerCase()] = true; 
            if(e.key === 'Shift') keys.shift = true; 
            if(e.code === 'Space') keys.space = true;
        });
        window.addEventListener('keyup', e => { 
            keys[e.key.toLowerCase()] = false; 
            if(e.key === 'Shift') keys.shift = false;
            if(e.code === 'Space') keys.space = false;
        });

        // --- 6. IK SOLVER ---
        function solveLegIK(leg, targetPos, poleVec) {
            const hipPos = new THREE.Vector3(); leg.root.getWorldPosition(hipPos);
            const toTarget = new THREE.Vector3().subVectors(targetPos, hipPos);
            const dist = toTarget.length();
            const maxLen = leg.len1 + leg.len2 - 0.001;
            const clampedDist = Math.min(dist, maxLen);
            const a = leg.len1, b = leg.len2, c = clampedDist;
            const cosC = THREE.MathUtils.clamp((a*a + b*b - c*c)/(2*a*b), -1, 1);
            const kneeBend = Math.PI - Math.acos(cosC);
            const cosA = THREE.MathUtils.clamp((a*a + c*c - b*b)/(2*a*c), -1, 1);
            const hipAngle = Math.acos(cosA);
            const dummy = new THREE.Object3D(); dummy.position.copy(hipPos); dummy.up.copy(poleVec);
            dummy.lookAt(targetPos); dummy.rotateX(-Math.PI/2); dummy.rotateX(-hipAngle);
            const invP = new THREE.Quaternion(); leg.root.getWorldQuaternion(invP); invP.invert();
            leg.upper.quaternion.copy(invP.multiply(dummy.quaternion));
            leg.mid.rotation.x = kneeBend;
        }

        // --- 7. ANIMATION LOOP ---
        const clock = new THREE.Clock();
        const LERP_SPEED = 0.05;

        function animate() {
            requestAnimationFrame(animate);
            const delta = clock.getDelta();
            const isMove = keys.w || keys.s;
            
            // Config Interpolation
            let targetConf = keys.shift && isMove ? ANIM_CONFIGS['Run'] : guiConfig;
            for(let k in currentConfig) {
                let v = targetConf[k] !== undefined ? targetConf[k] : guiConfig[k];
                if(v !== undefined) currentConfig[k] = THREE.MathUtils.lerp(currentConfig[k], v, LERP_SPEED);
            }
            state.stepDuration = currentConfig.stepDuration;

            // Movement Input
            let speed = 2.0 * currentConfig.speedFactor;
            if(keys.a) state.rotY += speed * 0.5 * delta;
            if(keys.d) state.rotY -= speed * 0.5 * delta;
            const fwd = new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0), state.rotY);
            if(keys.w) state.targetPos.add(fwd.clone().multiplyScalar(speed * delta));
            if(keys.s) state.targetPos.add(fwd.clone().multiplyScalar(-speed * delta));

            // --- DECOUPLED CAMERA UPDATE ---
            if (cameraManager) {
                cameraManager.update(delta);
            }
            // ---------------------------------

            // Tether Logic (Stuck Fix)
            let triggerDist = currentConfig.stepLength * 0.55 * currentConfig.speedFactor;
            triggerDist = Math.min(triggerDist, 1.5);
            if(!isMove && (keys.a||keys.d)) triggerDist = 0.2;
            if(keys.shift) triggerDist = Math.min(0.95 * currentConfig.stepLength, 1.4);
            const tetherLimit = Math.max(0.8, triggerDist + 0.5); 
            
            const center = new THREE.Vector3().addVectors(state.footL, state.footR).multiplyScalar(0.5);
            const tFlat = state.targetPos.clone(); tFlat.y=0;
            const cFlat = center.clone(); cFlat.y=0;
            if(tFlat.distanceTo(cFlat) > tetherLimit) {
                const dir = new THREE.Vector3().subVectors(tFlat, cFlat).normalize();
                const clamped = cFlat.add(dir.multiplyScalar(tetherLimit));
                state.targetPos.x = clamped.x; state.targetPos.z = clamped.z;
            }
            const fy = getFloorY(state.targetPos.x, state.targetPos.z);
            if(fy !== -999) state.targetPos.y = fy + 0.1;
            inputTarget.position.copy(state.targetPos);

            // --- JUMP PHYSICS LOGIC ---
            // Trigger Jump
            if (keys.space && !state.isJumping && state.jumpHeightOffset <= 0.01) {
                state.isJumping = true;
                state.jumpVelocity = currentConfig.jumpStrength;
            }

            // Apply Physics if airborne
            if (state.isJumping || state.jumpHeightOffset > 0) {
                state.jumpVelocity += currentConfig.gravity * delta;
                state.jumpHeightOffset += state.jumpVelocity * delta;

                // Landing Detection
                if (state.jumpHeightOffset <= 0) {
                    state.jumpHeightOffset = 0;
                    state.isJumping = false;
                    state.jumpVelocity = 0;
                }
            }
            // ---------------------------

            // Body Positioning
            const diff = new THREE.Vector3().subVectors(state.targetPos, center); diff.y=0;
            const bodyPos = center.clone().add(diff.multiplyScalar(0.2 * currentConfig.forwardLean));
            
            // Calculate base hip height from feet + stance
            let h = (state.footL.y + state.footR.y)/2 + currentConfig.stanceHeight - 0.1;
            h -= state.footL.distanceTo(state.footR) * 0.15;
            
            // Apply Jump Offset to final height
            h += state.jumpHeightOffset;

            if(bodyPos.distanceTo(state.footL) > 1.48) bodyPos.y -= 0.1; // Max reach drop
            robot.root.position.lerp(new THREE.Vector3(bodyPos.x, h, bodyPos.z), 0.1);
            robot.root.quaternion.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), state.rotY), 0.1);

            // Step Trigger
            const offL = new THREE.Vector3(currentConfig.legSpread, 0, 0).applyAxisAngle(new THREE.Vector3(0,1,0), state.rotY);
            const offR = new THREE.Vector3(-currentConfig.legSpread, 0, 0).applyAxisAngle(new THREE.Vector3(0,1,0), state.rotY);
            const idealL = state.targetPos.clone().add(offL);
            const idealR = state.targetPos.clone().add(offR);
            const dL = new THREE.Vector3(state.footL.x,0,state.footL.z).distanceTo(new THREE.Vector3(idealL.x,0,idealL.z));
            const dR = new THREE.Vector3(state.footR.x,0,state.footR.z).distanceTo(new THREE.Vector3(idealR.x,0,idealR.z));
            
            // Only allow stepping if NOT jumping
            if(!state.isStepping && !state.isJumping) {
                let swing = null;
                if(dL > triggerDist && dL > dR) swing = 'left';
                else if(dR > triggerDist) swing = 'right';
                
                if(swing) {
                    const start = swing==='left' ? state.footL : state.footR;
                    const ideal = swing==='left' ? idealL : idealR;
                    const ly = getFloorY(ideal.x, ideal.z);
                    if(ly !== -999) {
                        state.isStepping = true; state.swingLeg = swing;
                        state.stepStart.copy(start);
                        const noise = uiState.stepNoise;
                        state.stepEnd.set(ideal.x + (Math.random()-0.5)*noise, ly+0.1, ideal.z + (Math.random()-0.5)*noise);
                        state.stepTime = 0;
                    }
                }
            }
            if(state.isStepping) {
                state.stepTime += delta;
                const t = Math.min(state.stepTime / state.stepDuration, 1.0);
                const pos = new THREE.Vector3().lerpVectors(state.stepStart, state.stepEnd, t);
                pos.y += Math.sin(t*Math.PI) * currentConfig.stepHeight;
                if(state.swingLeg === 'left') state.footL.copy(pos); else state.footR.copy(pos);
                if(t >= 1.0) state.isStepping = false;
            }

            // --- ANIMATION (Procedural + Offsets) ---
            const invRot = robot.root.quaternion.clone().invert();
            const localL = state.footL.clone().sub(robot.root.position).applyQuaternion(invRot);
            const localR = state.footR.clone().sub(robot.root.position).applyQuaternion(invRot);
            
            // Hips Procedural
            const pHipYaw = (localL.z - localR.z) * -currentConfig.hipYaw;
            let pTargetTilt = 0;
            if(state.isStepping) pTargetTilt = (state.swingLeg==='left'?-1:1) * currentConfig.hipTilt;
            proceduralState.hips.y = THREE.MathUtils.lerp(proceduralState.hips.y, pHipYaw, 0.1);
            proceduralState.hips.z = THREE.MathUtils.lerp(proceduralState.hips.z, pTargetTilt, 0.1);
            proceduralState.hips.x = THREE.MathUtils.lerp(proceduralState.hips.x, currentConfig.forwardLean*0.5, 0.1);
            // Apply Hips
            robot.hips.rotation.set(
                proceduralState.hips.x + jointOffsets.hips.x,
                proceduralState.hips.y + jointOffsets.hips.y,
                proceduralState.hips.z + jointOffsets.hips.z
            );

            // Spine Procedural
            const ctr = -proceduralState.hips.z * currentConfig.spineCounterFactor;
            proceduralState.abs.z = THREE.MathUtils.lerp(proceduralState.abs.z, ctr * currentConfig.absTiltWeight, currentConfig.spineSmooth);
            proceduralState.chest.z = THREE.MathUtils.lerp(proceduralState.chest.z, ctr * currentConfig.chestTiltWeight, currentConfig.spineSmooth);
            // Apply Spine
            robot.abs.rotation.set(
                THREE.MathUtils.lerp(robot.abs.rotation.x, currentConfig.forwardLean*0.2, 0.1) + jointOffsets.abs.x,
                jointOffsets.abs.y,
                proceduralState.abs.z + jointOffsets.abs.z
            );
            robot.chest.rotation.set(
                THREE.MathUtils.lerp(robot.chest.rotation.x, currentConfig.forwardLean*0.1, 0.1) + jointOffsets.chest.x,
                THREE.MathUtils.lerp(robot.chest.rotation.y, -pHipYaw*currentConfig.chestYaw, 0.1) + jointOffsets.chest.y,
                proceduralState.chest.z + jointOffsets.chest.z
            );
            
            robot.hips.position.z = -Math.sin(robot.hips.rotation.x)*0.25; // Balance

            // Head Procedural
            const sway = Math.sin(robot.hips.rotation.z)*0.25 + Math.sin(robot.hips.rotation.z+robot.abs.rotation.z)*0.3;
            const pNeckZ = Math.asin(THREE.MathUtils.clamp(-sway/0.25, -0.8, 0.8)) * currentConfig.neckCorrection;
            robot.neck.rotation.set(jointOffsets.neck.x, jointOffsets.neck.y, pNeckZ + jointOffsets.neck.z);
            
            robot.neck.updateWorldMatrix(true, false);
            const tHeadQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(jointOffsets.head.x, state.rotY + jointOffsets.head.y, jointOffsets.head.z));
            const pHeadQ = new THREE.Quaternion(); robot.neck.getWorldQuaternion(pHeadQ);
            robot.head.quaternion.slerp(pHeadQ.invert().multiply(tHeadQ), currentConfig.headStiff);

            // Arms Procedural
            const extL = localL.z, extR = localR.z;
            const pArmL = currentConfig.armRestAngle + extL*currentConfig.armAmp;
            const pArmR = currentConfig.armRestAngle + extR*currentConfig.armAmp;
            const pArmSwingYaw = proceduralState.hips.y * 0.5;
            
            proceduralState.armL.root.y = THREE.MathUtils.lerp(proceduralState.armL.root.y, -pArmSwingYaw, 0.1);
            proceduralState.armL.upper.x = THREE.MathUtils.lerp(proceduralState.armL.upper.x, pArmL, 0.1);
            proceduralState.armR.root.y = THREE.MathUtils.lerp(proceduralState.armR.root.y, pArmSwingYaw, 0.1);
            proceduralState.armR.upper.x = THREE.MathUtils.lerp(proceduralState.armR.upper.x, pArmR, 0.1);

            const rollL = currentConfig.armOutwardRoll - robot.chest.rotation.z * 0.5;
            const rollR = -currentConfig.armOutwardRoll - robot.chest.rotation.z * 0.5;
            
            // Apply Arms (Left)
            robot.armL.root.rotation.set(
                jointOffsets.arm_shoulder.x,
                proceduralState.armL.root.y + jointOffsets.arm_shoulder.y,
                THREE.MathUtils.lerp(robot.armL.root.rotation.z, rollL, 0.1) + jointOffsets.arm_shoulder.z
            );
            robot.armL.upper.rotation.set(
                proceduralState.armL.upper.x + jointOffsets.arm_upper.x,
                jointOffsets.arm_upper.y,
                jointOffsets.arm_upper.z
            );
            
            let bendL = currentConfig.elbowBend;
            if(isMove) bendL -= Math.abs(pArmL)*0.5;
            if(keys.shift && isMove) bendL = -1.57 + Math.abs(pArmL)*0.1;

            // FIX: Use Quaternions to apply combined rotation to arm_lower (elbow) to prevent 360-degree wrapping
            const targetEulerL_mid = new THREE.Euler(
                bendL + jointOffsets.arm_lower.x, // Combined X (Procedural + Manual Offset)
                jointOffsets.arm_lower.y,         // Y (Manual Offset)
                THREE.MathUtils.lerp(robot.armL.mid.rotation.z, -0.4, 0.1) + jointOffsets.arm_lower.z // Z (Procedural Lerp + Manual Offset)
            );
            robot.armL.mid.quaternion.slerp(new THREE.Quaternion().setFromEuler(targetEulerL_mid), 0.1);
            
            robot.armL.endEffector.rotation.set(jointOffsets.arm_hand.x, jointOffsets.arm_hand.y, jointOffsets.arm_hand.z);

            // Apply Arms (Right - Mirrored)
            robot.armR.root.rotation.set(
                jointOffsets.arm_shoulder.x,
                proceduralState.armR.root.y - jointOffsets.arm_shoulder.y,
                THREE.MathUtils.lerp(robot.armR.root.rotation.z, rollR, 0.1) - jointOffsets.arm_shoulder.z
            );
            robot.armR.upper.rotation.set(
                proceduralState.armR.upper.x + jointOffsets.arm_upper.x,
                -jointOffsets.arm_upper.y,
                -jointOffsets.arm_upper.z
            );
            
            let bendR = currentConfig.elbowBend;
            if(isMove) bendR -= Math.abs(pArmR)*0.5;
            if(keys.shift && isMove) bendR = -1.57 + Math.abs(pArmR)*0.1;
            
            // FIX: Use Quaternions to apply combined rotation to arm_lower (elbow) to prevent 360-degree wrapping
            const targetEulerR_mid = new THREE.Euler(
                bendR + jointOffsets.arm_lower.x, // Combined X (Procedural + Manual Offset)
                -jointOffsets.arm_lower.y,        // Y (Mirrored Manual Offset)
                THREE.MathUtils.lerp(robot.armR.mid.rotation.z, 0.4, 0.1) - jointOffsets.arm_lower.z // Z (Procedural Lerp + Mirrored Manual Offset)
            );
            robot.armR.mid.quaternion.slerp(new THREE.Quaternion().setFromEuler(targetEulerR_mid), 0.1);

            robot.armR.endEffector.rotation.set(jointOffsets.arm_hand.x, -jointOffsets.arm_hand.y, -jointOffsets.arm_hand.z);

            // Legs & IK
            const inward = 0.05;
            robot.legL.root.rotation.z = THREE.MathUtils.lerp(robot.legL.root.rotation.z, inward, 0.1);
            robot.legR.root.rotation.z = THREE.MathUtils.lerp(robot.legR.root.rotation.z, -inward, 0.1);
            
            solveLegIK(robot.legL, state.footL, new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0), state.rotY));
            solveLegIK(robot.legR, state.footR, new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0), state.rotY));

            robot.legL.upper.rotation.x += jointOffsets.leg_upper.x;
            robot.legL.upper.rotation.y += jointOffsets.leg_upper.y;
            robot.legL.upper.rotation.z += jointOffsets.leg_upper.z;
            robot.legL.mid.rotation.x += jointOffsets.leg_lower.x;
            robot.legL.mid.rotation.y += jointOffsets.leg_lower.y;
            robot.legL.mid.rotation.z += jointOffsets.leg_lower.z;
            robot.legL.endEffector.rotation.set(jointOffsets.leg_foot.x, jointOffsets.leg_foot.y, jointOffsets.leg_foot.z);

            robot.legR.upper.rotation.x += jointOffsets.leg_upper.x;
            robot.legR.upper.rotation.y -= jointOffsets.leg_upper.y;
            robot.legR.upper.rotation.z -= jointOffsets.leg_upper.z;
            robot.legR.mid.rotation.x += jointOffsets.leg_lower.x;
            robot.legR.mid.rotation.y -= jointOffsets.leg_lower.y;
            robot.legR.mid.rotation.z -= jointOffsets.leg_lower.z;
            robot.legR.endEffector.rotation.set(jointOffsets.leg_foot.x, -jointOffsets.leg_foot.y, -jointOffsets.leg_foot.z);

            renderer.render(scene, camera);
        }
        animate();
        window.addEventListener('resize', () => { camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
    </script>
</body>
</html>
