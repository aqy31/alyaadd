// --- UI Element Handles ---
const loadingOverlay = document.getElementById('loading_overlay');
const loadingStatus = document.getElementById('loading_status');
const topBarPanel = document.getElementById('top_bar_panel');
const arStatusDesc = document.getElementById('ar_status_desc');
const bottomControlsPanel = document.getElementById('bottom_controls_panel');
const modelParameters = document.getElementById('model_parameters');

const btnToggleScaleMode = document.getElementById('btn_toggle_scale_mode');
const btnReposition = document.getElementById('btn_reposition');
const btnInfo = document.getElementById('btn_info');
const btnResetAr = document.getElementById('btn_reset_ar');
const btnExitAr = document.getElementById('btn_exit_ar');

const infoOverlay = document.getElementById('info_overlay');
const btnCloseInfo = document.getElementById('btn_close_info');

// Parameter UI sliders
const sliderScale = document.getElementById('param_scale');
const scaleValLabel = document.getElementById('scale_val_label');
const sliderRotation = document.getElementById('param_rotation');
const rotateValLabel = document.getElementById('rotate_val_label');
const sliderHeight = document.getElementById('param_height');
const heightValLabel = document.getElementById('height_val_label');

const webcamStream = document.getElementById('webcam_stream');
const canvasContainer = document.getElementById('threejs_canvas_container');

// --- Three.js & AR state variables ---
let scene, camera, renderer;
let isThreeJsInitialized = false;
let loadedModel = null;
let shadowPlane = null;
let mainLight = null;

// WebXR session states
let isXRSupported = false;
let xrSession = null;
let xrHitTestSource = null;
let xrLocalRefSpace = null;
let xrViewerSpace = null;
let isWebXRActive = false;
let webxrReticle = null;

// Fallback sensor states
let deviceOrientation = null;
let fallbackReticle = null;
let isModelPlaced = false;
let placedPosition = new THREE.Vector3(0, -1.5, -4);
let placedRotationY = 0;
let placedHeightOffset = 0;
let fallbackYawOffset = 0;

// Interactive touch state
let isTouching = false;
let touchStartX = 0;
let touchStartY = 0;
let touchStartDistance = 0;
let touchStartScale = 1.0;
let isScaleModeRealWorld = false; // Toggle between 1:1 real-world and Tabletop

// Default normalization scale (will be calculated dynamically)
let defaultModelScaleFactor = 1.0;

// --- Initialize Application ---
window.addEventListener('DOMContentLoaded', () => {
    checkWebXRSupport();
    setupGeneralUI();
});

// Check if WebXR immersive-ar session is supported
function checkWebXRSupport() {
    if (navigator.xr) {
        navigator.xr.isSessionSupported('immersive-ar')
            .then((supported) => {
                isXRSupported = supported;
                if (supported) {
                    loadingStatus.textContent = 'منصتك تدعم الواقع المعزز الحقيقي! جاري التجهيز...';
                } else {
                    loadingStatus.textContent = 'وضع محاكاة الواقع المعزز بحساسات الجيروسكوب جاهز...';
                }
                setTimeout(startARSystem, 1000);
            })
            .catch(() => {
                isXRSupported = false;
                loadingStatus.textContent = 'وضع محاكاة الواقع المعزز بحساسات الجيروسكوب جاهز...';
                setTimeout(startARSystem, 1000);
            });
    } else {
        isXRSupported = false;
        loadingStatus.textContent = 'وضع محاكاة الواقع المعزز بحساسات الجيروسكوب جاهز...';
        setTimeout(startARSystem, 1000);
    }
}

// Start AR system based on WebXR availability
function startARSystem() {
    initThreeJs();
    
    if (isXRSupported) {
        // Native WebXR flow: Show a visual overlay button to initialize
        loadingOverlay.style.opacity = '0';
        setTimeout(() => loadingOverlay.style.display = 'none', 500);
        
        // Show status
        arStatusDesc.textContent = 'اضغط على زر "دخول الواقع المعزز" لتفعيل الكاميرا والبدء.';
        
        // Let's customize UI for XR launch
        const startButton = document.createElement('button');
        startButton.className = 'btn-museum';
        startButton.id = 'btn_start_webxr';
        startButton.style.position = 'absolute';
        startButton.style.top = '50%';
        startButton.style.left = '50%';
        startButton.style.transform = 'translate(-50%, -50%)';
        startButton.style.zIndex = '1001';
        startButton.innerHTML = '🌐 دخول الواقع المعزز (AR)';
        document.body.appendChild(startButton);
        
        startButton.addEventListener('click', () => {
            startButton.style.display = 'none';
            requestWebXRSession();
        });
    } else {
        // Sensor fallback flow (iOS/Safari)
        startSensorFallbackAR();
    }
}

// --- Initialize Three.js Engine ---
function initThreeJs() {
    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Beautiful soft shadows
    renderer.outputEncoding = THREE.sRGBEncoding;
    
    canvasContainer.appendChild(renderer.domElement);
    isThreeJsInitialized = true;

    // Setup lights for museum-quality rendering
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    scene.add(hemiLight);

    // Directional light representing sunlight (casting realistic shadows)
    mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(10, 20, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048; // High res shadow map
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 40;
    
    // Expand shadow camera view boundary to cover larger palace structures
    const d = 15;
    mainLight.shadow.camera.left = -d;
    mainLight.shadow.camera.right = d;
    mainLight.shadow.camera.top = d;
    mainLight.shadow.camera.bottom = -d;
    mainLight.shadow.bias = -0.0005; // Prevent shadow acne
    scene.add(mainLight);

    // Dynamic invisible ground shadow plane
    const shadowPlaneGeo = new THREE.PlaneGeometry(150, 150);
    shadowPlaneGeo.rotateX(-Math.PI / 2);
    const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.5 }); // Soft translucent shadow
    shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.receiveShadow = true;
    shadowPlane.position.y = -1.5;
    scene.add(shadowPlane);

    // Load archaeological 3D model (qwqee.glb)
    loadModel();

    // Create Reticle indicator meshes
    createReticles();

    // Bind pointer & gesture interactions
    setupTouchGestures();

    // Handle resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation render loop
    renderer.setAnimationLoop(animate);
}

// Load and prepare the GLB model
function loadModel() {
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        'qwqee.glb',
        (gltf) => {
            const model = gltf.scene;
            
            // Enable shadow casting & receiving for all child meshes
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Calculate model boundaries to center and normalize scale
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            // Scale factor to normalize size to a standard starting size of 3 meters max dimension
            defaultModelScaleFactor = 3.0 / maxDim;
            model.scale.set(defaultModelScaleFactor, defaultModelScaleFactor, defaultModelScaleFactor);

            // Center geometry inside an aligner group
            model.position.set(-center.x * defaultModelScaleFactor, -center.y * defaultModelScaleFactor, -center.z * defaultModelScaleFactor);

            const aligner = new THREE.Group();
            aligner.add(model);

            // Rotate model around its center to align correctly with floor plane
            // Longest dimension matches Y (hand-forward) or horizontal X/Z base
            aligner.rotation.set(0, 0, 0);

            loadedModel = new THREE.Group();
            loadedModel.add(aligner);
            loadedModel.visible = false; // Invisible until placed on floor
            
            scene.add(loadedModel);

            console.log("Archaeological model loaded successfully.");
            
            // Hide loading overlays if in fallback mode
            if (!isXRSupported) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => loadingOverlay.style.display = 'none', 500);
            }
        },
        (xhr) => {
            const pct = Math.round((xhr.loaded / xhr.total) * 100);
            if (!isNaN(pct)) {
                loadingStatus.textContent = `جاري تحميل القصر الأثري: ${pct}%`;
            }
        },
        (err) => {
            console.error("Error loading glb model: ", err);
            loadingStatus.textContent = 'خطأ: لم نتمكن من تحميل مجسم القصر الأثري (qwqee.glb).';
            loadingStatus.style.color = '#ef4444';
        }
    );
}

// Create Reticles for tracking surface alignment
function createReticles() {
    // 1. WebXR Reticle (Golden Ring + crosshair)
    const ringGeom = new THREE.RingGeometry(0.12, 0.15, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xe5c158, side: THREE.DoubleSide });
    webxrReticle = new THREE.Mesh(ringGeom, ringMat);
    webxrReticle.matrixAutoUpdate = false;
    webxrReticle.visible = false;
    scene.add(webxrReticle);

    // Crosshair lines inside reticle for fine placement
    const lineMat = new THREE.LineBasicMaterial({ color: 0xe5c158 });
    const lineXGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.1, 0, 0), new THREE.Vector3(0.1, 0, 0)]);
    const lineZGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, 0, 0.1)]);
    const lineX = new THREE.Line(lineXGeom, lineMat);
    const lineZ = new THREE.Line(lineZGeom, lineMat);
    lineX.rotateX(-Math.PI / 2);
    lineZ.rotateX(-Math.PI / 2);
    webxrReticle.add(lineX);
    webxrReticle.add(lineZ);

    // 2. Fallback Reticle (Golden Circle with soft borders)
    const fallbackGeom = new THREE.RingGeometry(0.12, 0.15, 32);
    fallbackGeom.rotateX(-Math.PI / 2);
    const fallbackMat = new THREE.MeshBasicMaterial({ color: 0xe5c158, side: THREE.DoubleSide, opacity: 0.7, transparent: true });
    fallbackReticle = new THREE.Mesh(fallbackGeom, fallbackMat);
    fallbackReticle.visible = false;
    scene.add(fallbackReticle);

    const fLineX = new THREE.Line(lineXGeom, lineMat);
    const fLineZ = new THREE.Line(lineZGeom, lineMat);
    fLineX.rotateX(-Math.PI / 2);
    fLineZ.rotateX(-Math.PI / 2);
    fallbackReticle.add(fLineX);
    fallbackReticle.add(fLineZ);
}

// --- WebXR Immersive AR Logic ---
async function requestWebXRSession() {
    try {
        const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local-floor', 'hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.getElementById('ar_container') }
        });

        xrSession = session;
        isWebXRActive = true;
        renderer.xr.enabled = true;
        await renderer.xr.setSession(session);

        session.addEventListener('end', onXRSessionEnded);
        session.addEventListener('select', onXRSelect);

        const refSpaceViewer = await session.requestReferenceSpace('viewer');
        xrHitTestSource = await session.requestHitTestSource({ space: refSpaceViewer });
        xrLocalRefSpace = await session.requestReferenceSpace('local-floor');

        arStatusDesc.textContent = 'وجه كاميرا الهاتف نحو السطح لمسحه، ثم اضغط على الشاشة لتثبيت القصر.';
        btnResetAr.style.display = 'block';

        if (loadedModel) {
            loadedModel.visible = false; // Hide until tapped
        }
    } catch (e) {
        console.error("WebXR session initialization failed: ", e);
        // Fallback to sensor orientation on failure
        startSensorFallbackAR();
    }
}

function onXRSessionEnded() {
    xrSession = null;
    isWebXRActive = false;
    xrHitTestSource = null;
    xrLocalRefSpace = null;
    renderer.xr.enabled = false;
    if (webxrReticle) webxrReticle.visible = false;
    
    // Return to main layout or reload page
    window.location.reload();
}

function onXRSelect() {
    if (webxrReticle && webxrReticle.visible && loadedModel) {
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        
        webxrReticle.matrix.decompose(position, quaternion, scale);
        
        placedPosition.copy(position);
        loadedModel.position.copy(placedPosition);
        loadedModel.quaternion.copy(quaternion);
        
        // Ensure shadow plane lies at exact hit test height
        shadowPlane.position.y = position.y;
        
        // Align directional light slightly offset from placed position for accurate shadows
        mainLight.position.set(position.x + 10, position.y + 20, position.z + 10);
        mainLight.target = loadedModel;

        loadedModel.visible = true;
        isModelPlaced = true;
        webxrReticle.visible = false;

        // Show UI controllers
        modelParameters.style.display = 'flex';
        btnToggleScaleMode.style.display = 'block';
        btnReposition.style.display = 'block';
        
        arStatusDesc.textContent = 'تم تثبيت القصر الآشوري! استخدم شريط التحكم بالأسفل أو اللمس للتدوير والتكبير.';
    }
}

// --- Sensor Orientation Fallback Logic ---
function startSensorFallbackAR() {
    isWebXRActive = false;
    renderer.xr.enabled = false;
    isModelPlaced = false;

    // Enable pointer capture on canvas container
    canvasContainer.style.pointerEvents = 'auto';

    // Show reset and recalibrate options
    btnResetAr.style.display = 'block';
    
    // Request permission to deviceorientation
    requestOrientationPermission();

    // Start back-facing environment webcam feed
    startWebcamFeed();

    // Hide loader
    loadingOverlay.style.opacity = '0';
    setTimeout(() => loadingOverlay.style.display = 'none', 500);

    arStatusDesc.textContent = 'وضع المحاكاة: وجه الكاميرا للأسفل نحو الأرض، ثم اضغط على الشاشة لوضع القصر.';
}

function requestOrientationPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                if (response === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation);
                } else {
                    arStatusDesc.textContent = 'تنبيه: تم رفض إذن حساسات الحركة. لن تتمكن من التحرك حول المجسم.';
                }
            })
            .catch(err => {
                console.error("Orientation permissions rejected: ", err);
                window.addEventListener('deviceorientation', handleOrientation);
            });
    } else {
        window.addEventListener('deviceorientation', handleOrientation);
    }
}

function handleOrientation(e) {
    deviceOrientation = e;
}

async function startWebcamFeed() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("unsupported");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        webcamStream.srcObject = stream;
        webcamStream.style.display = 'block';
    } catch (e) {
        console.error("Error launching webcam: ", e);
        arStatusDesc.textContent = 'خطأ: لم نتمكن من الوصول لكاميرا الهاتف الخلفية. يرجى تفعيل إذن الكاميرا.';
    }
}

// --- Touch Gesture Interaction Handlers ---
function setupTouchGestures() {
    const dom = renderer.domElement;
    
    dom.addEventListener('mousedown', onPointerDown);
    dom.addEventListener('mousemove', onPointerMove);
    dom.addEventListener('mouseup', onPointerUp);
    
    dom.addEventListener('touchstart', onTouchStart, { passive: false });
    dom.addEventListener('touchmove', onTouchMove, { passive: false });
    dom.addEventListener('touchend', onTouchEnd);
}

function onPointerDown(e) {
    if (isWebXRActive) return; // WebXR handles select events internally

    if (!isModelPlaced) {
        // Place model on virtual plane
        if (fallbackReticle && fallbackReticle.visible && loadedModel) {
            placedPosition.copy(fallbackReticle.position);
            loadedModel.position.copy(placedPosition);
            loadedModel.rotation.set(0, placedRotationY, 0);
            
            shadowPlane.position.y = placedPosition.y;
            
            loadedModel.visible = true;
            isModelPlaced = true;
            fallbackReticle.visible = false;
            
            // Show param UI
            modelParameters.style.display = 'flex';
            btnToggleScaleMode.style.display = 'block';
            btnReposition.style.display = 'block';
            
            arStatusDesc.textContent = 'تم تثبيت المجسم! اسحب بإصبعك لتدوير القصر الأثري، أو تحرك حوله.';
        }
    } else {
        isTouching = true;
        touchStartX = e.clientX;
        touchStartY = e.clientY;
    }
}

function onPointerMove(e) {
    if (!isTouching || isWebXRActive || !loadedModel || !isModelPlaced) return;
    
    const deltaX = e.clientX - touchStartX;
    placedRotationY += deltaX * 0.007; // Smooth rotation multiplier
    loadedModel.rotation.set(0, placedRotationY, 0);
    
    // Update slider UI
    const degrees = Math.round((placedRotationY * 180 / Math.PI) % 360);
    sliderRotation.value = degrees >= 0 ? degrees : (360 + degrees);
    rotateValLabel.textContent = `${sliderRotation.value}°`;

    touchStartX = e.clientX;
}

function onPointerUp() {
    isTouching = false;
}

function onTouchStart(e) {
    if (isWebXRActive) return;
    e.preventDefault();

    if (e.touches.length === 1) {
        if (!isModelPlaced) {
            if (fallbackReticle && fallbackReticle.visible && loadedModel) {
                placedPosition.copy(fallbackReticle.position);
                loadedModel.position.copy(placedPosition);
                loadedModel.rotation.set(0, placedRotationY, 0);
                
                shadowPlane.position.y = placedPosition.y;
                
                loadedModel.visible = true;
                isModelPlaced = true;
                fallbackReticle.visible = false;
                
                modelParameters.style.display = 'flex';
                btnToggleScaleMode.style.display = 'block';
                btnReposition.style.display = 'block';
                
                arStatusDesc.textContent = 'تم تثبيت المجسم! اسحب للتدوير، أو قرّص الشاشة لتعديل الحجم.';
            }
        } else {
            isTouching = true;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    } else if (e.touches.length === 2 && isModelPlaced && loadedModel) {
        // Double touch for scaling/pinching
        isTouching = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDistance = Math.sqrt(dx * dx + dy * dy);
        touchStartScale = sliderScale.value;
    }
}

function onTouchMove(e) {
    if (isWebXRActive) return;
    e.preventDefault();

    if (e.touches.length === 1 && isTouching && isModelPlaced && loadedModel) {
        const deltaX = e.touches[0].clientX - touchStartX;
        placedRotationY += deltaX * 0.007;
        loadedModel.rotation.set(0, placedRotationY, 0);
        
        const degrees = Math.round((placedRotationY * 180 / Math.PI) % 360);
        sliderRotation.value = degrees >= 0 ? degrees : (360 + degrees);
        rotateValLabel.textContent = `${sliderRotation.value}°`;
        
        touchStartX = e.touches[0].clientX;
    } else if (e.touches.length === 2 && isModelPlaced && loadedModel) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (touchStartDistance > 0) {
            const factor = dist / touchStartDistance;
            let newScale = touchStartScale * factor;
            newScale = Math.max(0.05, Math.min(3.0, newScale));
            
            sliderScale.value = newScale.toFixed(2);
            scaleValLabel.textContent = `${newScale.toFixed(1)}x`;
            
            const totalScale = defaultModelScaleFactor * newScale;
            loadedModel.scale.set(totalScale, totalScale, totalScale);
        }
    }
}

function onTouchEnd() {
    isTouching = false;
    touchStartDistance = 0;
}

// --- Render / Frame Update Loop ---
function animate(timestamp, frame) {
    if (isWebXRActive && frame) {
        // --- WebXR Render Path ---
        if (xrHitTestSource && xrLocalRefSpace) {
            const hitTestResults = frame.getHitTestResults(xrHitTestSource);
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(xrLocalRefSpace);
                
                if (webxrReticle) {
                    webxrReticle.visible = true;
                    webxrReticle.matrix.fromArray(pose.transform.matrix);
                }
            } else {
                if (webxrReticle) webxrReticle.visible = false;
            }
        }

        // Apply sliders changes in WebXR
        if (loadedModel && isModelPlaced) {
            // Apply scale
            const scaleMultiplier = parseFloat(sliderScale.value);
            const totalScale = defaultModelScaleFactor * scaleMultiplier;
            loadedModel.scale.set(totalScale, totalScale, totalScale);

            // Apply rotation (combined with user touch rotation)
            const sliderRotRad = THREE.MathUtils.degToRad(parseFloat(sliderRotation.value));
            loadedModel.rotation.set(0, sliderRotRad, 0);

            // Apply height offset
            const heightOffset = parseFloat(sliderHeight.value);
            loadedModel.position.y = placedPosition.y + heightOffset;
            shadowPlane.position.y = placedPosition.y + heightOffset;
        }

        renderer.render(scene, camera);
    } else {
        // --- Gyroscope Fallback Render Path ---
        camera.position.set(0, 0, 0);

        if (deviceOrientation) {
            const alpha = deviceOrientation.alpha ? THREE.MathUtils.degToRad(deviceOrientation.alpha - fallbackYawOffset) : 0;
            const beta = deviceOrientation.beta ? THREE.MathUtils.degToRad(deviceOrientation.beta) : 0;
            const gamma = deviceOrientation.gamma ? THREE.MathUtils.degToRad(deviceOrientation.gamma) : 0;
            const orient = window.orientation ? THREE.MathUtils.degToRad(window.orientation) : 0;

            const euler = new THREE.Euler();
            const q0 = new THREE.Quaternion();
            const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90 deg X
            const zee = new THREE.Vector3(0, 0, 1);

            euler.set(beta, alpha, -gamma, 'YXZ');
            camera.quaternion.setFromEuler(euler);
            camera.quaternion.multiply(q1); // Correct camera facing
            camera.quaternion.multiply(q0.setFromAxisAngle(zee, -orient)); // Correct orientation
        }

        // Intersect ray from camera gaze with virtual floor plane (y = -1.5)
        if (!isModelPlaced) {
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            if (dir.y < -0.1) { // Pointing down
                const t = -1.5 / dir.y;
                const intersectionPoint = dir.clone().multiplyScalar(t);
                
                if (fallbackReticle) {
                    fallbackReticle.visible = true;
                    fallbackReticle.position.copy(intersectionPoint);
                }
            } else {
                if (fallbackReticle) fallbackReticle.visible = false;
            }
        } else if (loadedModel) {
            // Apply parameters from sliders
            const scaleMultiplier = parseFloat(sliderScale.value);
            const totalScale = defaultModelScaleFactor * scaleMultiplier;
            loadedModel.scale.set(totalScale, totalScale, totalScale);

            const heightOffset = parseFloat(sliderHeight.value);
            loadedModel.position.y = placedPosition.y + heightOffset;
            shadowPlane.position.y = placedPosition.y + heightOffset;
        }

        renderer.render(scene, camera);
    }
}

// --- Interface & Controls Setup ---
function setupGeneralUI() {
    // Range slider updates
    sliderScale.addEventListener('input', () => {
        const val = parseFloat(sliderScale.value);
        scaleValLabel.textContent = `${val.toFixed(1)}x`;
        if (loadedModel) {
            const totalScale = defaultModelScaleFactor * val;
            loadedModel.scale.set(totalScale, totalScale, totalScale);
        }
    });

    sliderRotation.addEventListener('input', () => {
        const val = parseInt(sliderRotation.value);
        rotateValLabel.textContent = `${val}°`;
        if (loadedModel) {
            placedRotationY = THREE.MathUtils.degToRad(val);
            loadedModel.rotation.set(0, placedRotationY, 0);
        }
    });

    sliderHeight.addEventListener('input', () => {
        const val = parseFloat(sliderHeight.value);
        heightValLabel.textContent = `${val.toFixed(1)}m`;
        if (loadedModel) {
            loadedModel.position.y = placedPosition.y + val;
            shadowPlane.position.y = placedPosition.y + val;
        }
    });

    // Toggle 1:1 Scale vs Tabletop Mode
    btnToggleScaleMode.addEventListener('click', () => {
        if (!loadedModel) return;
        isScaleModeRealWorld = !isScaleModeRealWorld;
        
        if (isScaleModeRealWorld) {
            // 1:1 Real-world scale
            sliderScale.value = 6.0; // scale factor to walk inside
            scaleValLabel.textContent = "6.0x (أبعاد طبيعية)";
            btnToggleScaleMode.innerHTML = "🔍 نمط الطاولة (صغير)";
            btnToggleScaleMode.classList.remove('btn-museum-secondary');
            arStatusDesc.textContent = 'نمط الحجم الطبيعي مفعل! يمكنك الآن المشي بداخل الغرف والوقوف بجانب الجدران.';
        } else {
            // Tabletop miniature scale
            sliderScale.value = 0.2;
            scaleValLabel.textContent = "0.2x (منضدي)";
            btnToggleScaleMode.innerHTML = "🏛️ نمط الحجم الحقيقي (1:1)";
            btnToggleScaleMode.classList.add('btn-museum-secondary');
            arStatusDesc.textContent = 'نمط المنضدة مفعل! يمكنك رؤية القصر كنموذج مجسم صغير أمامك.';
        }

        const totalScale = defaultModelScaleFactor * parseFloat(sliderScale.value);
        loadedModel.scale.set(totalScale, totalScale, totalScale);
    });

    // Reposition Button
    btnReposition.addEventListener('click', () => {
        isModelPlaced = false;
        if (loadedModel) loadedModel.visible = false;
        modelParameters.style.display = 'none';
        btnToggleScaleMode.style.display = 'none';
        btnReposition.style.display = 'none';
        
        if (isWebXRActive) {
            arStatusDesc.textContent = 'وجه الكاميرا ببطء لمسح الأرض، واضغط لوضع المجسم في مكان جديد.';
        } else {
            fallbackReticle.visible = true;
            arStatusDesc.textContent = 'وجه الكاميرا للأرض، واضغط على الشاشة لإعادة تثبيت القصر في موقع جديد.';
        }
    });

    // Reset AR environment
    btnResetAr.addEventListener('click', () => {
        if (isWebXRActive && xrSession) {
            xrSession.end();
        } else {
            // Recalibrate gyroscope offset
            if (deviceOrientation) {
                fallbackYawOffset = deviceOrientation.alpha || 0;
            }
            isModelPlaced = false;
            if (loadedModel) loadedModel.visible = false;
            placedRotationY = 0;
            sliderRotation.value = 0;
            rotateValLabel.textContent = '0°';
            sliderScale.value = 1.0;
            scaleValLabel.textContent = '1.0x';
            sliderHeight.value = 0;
            heightValLabel.textContent = '0.0m';
            
            modelParameters.style.display = 'none';
            btnToggleScaleMode.style.display = 'none';
            btnReposition.style.display = 'none';
            
            if (fallbackReticle) fallbackReticle.visible = true;
            updateStatus('تمت إعادة تهيئة البيئة بنجاح.', 'ready');
        }
    });

    // Exit application
    btnExitAr.addEventListener('click', () => {
        if (isWebXRActive && xrSession) {
            xrSession.end();
        }
        window.location.href = 'index.html';
    });

    // Info overlay toggling
    btnInfo.addEventListener('click', () => {
        infoOverlay.classList.add('active');
    });

    btnCloseInfo.addEventListener('click', () => {
        infoOverlay.classList.remove('active');
    });
}

function updateStatus(msg, type) {
    arStatusDesc.textContent = msg;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
