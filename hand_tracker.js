// Secure Context Check for mobile cameras
if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    const warningDiv = document.createElement('div');
    warningDiv.style.background = '#f59e0b';
    warningDiv.style.color = '#000';
    warningDiv.style.padding = '12px 20px';
    warningDiv.style.textAlign = 'center';
    warningDiv.style.fontWeight = 'bold';
    warningDiv.style.position = 'fixed';
    warningDiv.style.top = '0';
    warningDiv.style.left = '0';
    warningDiv.style.right = '0';
    warningDiv.style.zIndex = '99999';
    warningDiv.style.fontSize = '14px';
    warningDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
    warningDiv.innerHTML = '⚠️ انتبه: المتصفحات على الهاتف تشترط استخدام رابط آمن (HTTPS) لتشغيل الكاميرا والمستشعرات. يرجى الدخول باستخدام HTTPS.';
    document.body.appendChild(warningDiv);
}

// --- UI and State Management ---
const homeScreen = document.getElementById('home_screen');
const drawingMode = document.getElementById('drawing_mode');
const mode3d = document.getElementById('3d_mode');
const modeAr = document.getElementById('ar_mode');
const modeArGround = document.getElementById('ar_ground_mode');
const modeArLocked = document.getElementById('ar_locked_mode');
const threejsContainer = document.getElementById('threejs_container');

const btnDrawing = document.getElementById('btn_drawing');
const btn3d = document.getElementById('btn_3d');
const btnAr = document.getElementById('btn_ar');
const btnArGround = document.getElementById('btn_ar_ground');
const btnArLocked = document.getElementById('btn_ar_locked');

const backFromDrawing = document.getElementById('back_from_drawing');
const backFrom3d = document.getElementById('back_from_3d');
const backFromAr = document.getElementById('back_from_ar');
const backFromArGround = document.getElementById('back_from_ar_ground');
const backFromArLocked = document.getElementById('back_from_ar_locked');

const statusArGround = document.getElementById('status_ar_ground');
const statusArLocked = document.getElementById('status_ar_locked');

let deviceOrientation = null;
function handleOrientation(event) {
    deviceOrientation = event;
}

function resetCamera() {
    if (camera) {
        camera.position.set(0, 0, 10);
        camera.rotation.set(0, 0, 0);
        camera.quaternion.set(0, 0, 0, 1);
    }
}

let currentMode = 'home'; // 'home', 'drawing', '3d', 'ar', 'ar_ground', 'ar_locked'
let currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)
let activeFacingMode = 'user';
let smoothedLandmarks = null;
const LANDMARK_SMOOTHING_XY = 0.25; // High responsiveness for position
const LANDMARK_SMOOTHING_Z = 0.05;  // Heavy filtering for depth to eliminate rotation jitter

function showScreen(screen) {
    homeScreen.classList.remove('active');
    drawingMode.classList.remove('active');
    mode3d.classList.remove('active');
    modeAr.classList.remove('active');
    if (modeArGround) modeArGround.classList.remove('active');
    if (modeArLocked) modeArLocked.classList.remove('active');
    
    resetCamera();
    
    // Manage ThreeJS container visibility
    if (screen === '3d' || screen === 'ar' || screen === 'ar_ground' || screen === 'ar_locked') {
        threejsContainer.style.display = 'block';
    } else {
        threejsContainer.style.display = 'none';
        if (loadedModel) loadedModel.visible = false;
    }
    
    // Manage AR Video Background
    if (screen === 'ar' || screen === 'ar_ground' || screen === 'ar_locked') {
        videoElement.classList.add('ar-video');
    } else {
        videoElement.classList.remove('ar-video');
    }
    updateVideoMirror();
    
    if(screen === 'home' && homeScreen) homeScreen.classList.add('active');
    if(screen === 'drawing' && drawingMode) drawingMode.classList.add('active');
    if(screen === '3d' && mode3d) mode3d.classList.add('active');
    if(screen === 'ar' && modeAr) modeAr.classList.add('active');
    if(screen === 'ar_ground' && modeArGround) modeArGround.classList.add('active');
    if(screen === 'ar_locked' && modeArLocked) modeArLocked.classList.add('active');
    
    currentMode = screen;
}

function updateVideoMirror() {
    if (activeFacingMode === 'user') {
        videoElement.classList.add('mirrored');
    } else {
        videoElement.classList.remove('mirrored');
    }
}

if (btnDrawing) {
    btnDrawing.addEventListener('click', () => {
        // Play/activate video element within user gesture for Safari compatibility
        if (videoElement) videoElement.play().catch(() => {});
        if (currentFacingMode !== 'user') {
            currentFacingMode = 'user';
            updateVideoMirror();
            startWebcam(true);
        } else if (!isWebcamStarted) {
            startWebcam();
        }
        showScreen('drawing');
    });
}

if (btn3d) {
    btn3d.addEventListener('click', () => {
        if (videoElement) videoElement.play().catch(() => {});
        if (currentFacingMode !== 'user') {
            currentFacingMode = 'user';
            updateVideoMirror();
            startWebcam(true);
        } else if (!isWebcamStarted) {
            startWebcam();
        }
        showScreen('3d');
        if (!isThreeJsInitialized) initThreeJs();
    });
}

if (btnAr) {
    btnAr.addEventListener('click', () => {
        if (videoElement) videoElement.play().catch(() => {});
        // Default to back camera for AR mode to see the floor/environment
        if (currentFacingMode !== 'environment') {
            currentFacingMode = 'environment';
            updateVideoMirror();
            startWebcam(true);
        } else if (!isWebcamStarted) {
            startWebcam();
        }
        showScreen('ar');
        if (!isThreeJsInitialized) initThreeJs();
    });
}

if (btnArGround) {
    btnArGround.addEventListener('click', () => {
        if (videoElement) videoElement.play().catch(() => {});
        // Default to back camera for Ground AR mode
        if (currentFacingMode !== 'environment') {
            currentFacingMode = 'environment';
            updateVideoMirror();
            startWebcam(true);
        } else if (!isWebcamStarted) {
            startWebcam();
        }
        
        // Request permission for DeviceOrientation on iOS
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') {
                        window.addEventListener('deviceorientation', handleOrientation);
                    }
                })
                .catch(err => {
                    console.error("DeviceOrientation permission rejected:", err);
                });
        } else {
            window.addEventListener('deviceorientation', handleOrientation);
        }
        
        showScreen('ar_ground');
        if (!isThreeJsInitialized) initThreeJs();
    });
}

if (btnArLocked) {
    btnArLocked.addEventListener('click', () => {
        if (videoElement) videoElement.play().catch(() => {});
        // Default to back camera for Locked AR mode (similar to AR mode)
        if (currentFacingMode !== 'environment') {
            currentFacingMode = 'environment';
            updateVideoMirror();
            startWebcam(true);
        } else if (!isWebcamStarted) {
            startWebcam();
        }
        showScreen('ar_locked');
        if (!isThreeJsInitialized) initThreeJs();
    });
}

if (backFromDrawing) backFromDrawing.addEventListener('click', () => showScreen('home'));
if (backFrom3d) backFrom3d.addEventListener('click', () => showScreen('home'));
if (backFromAr) backFromAr.addEventListener('click', () => showScreen('home'));
if (backFromArGround) {
    backFromArGround.addEventListener('click', () => {
        window.removeEventListener('deviceorientation', handleOrientation);
        deviceOrientation = null;
        showScreen('home');
    });
}
if (backFromArLocked) backFromArLocked.addEventListener('click', () => showScreen('home'));

// --- Webcam and MediaPipe Shared Setup ---
const videoElement = document.getElementById('webcam');
const statusHome = document.getElementById('status_home');
const statusDrawing = document.getElementById('status_drawing');
const status3d = document.getElementById('status_3d');
const statusAr = document.getElementById('status_ar');
let isWebcamStarted = false;
let currentStream = null;

function updateStatus(msg, type) {
    [statusDrawing, status3d, statusAr, statusArGround, statusArLocked].forEach(el => {
        if(el) {
            el.textContent = msg;
            el.className = `status-indicator ${type}`;
        }
    });
}

function calculateDistance(p1, p2) {
    if (!p1 || !p2) return 0;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function calculateDistance3D(p1, p2) {
    if (!p1 || !p2) return 0;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isFist(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;
    const wrist = landmarks[0];
    const isFolded = (tipIdx, mcpIdx) => {
        if (!landmarks[tipIdx] || !landmarks[mcpIdx] || !wrist) return false;
        // Use 3D distance and 0.85 tolerance to prevent false-positives when hand is open but tilted
        return calculateDistance3D(landmarks[tipIdx], wrist) < calculateDistance3D(landmarks[mcpIdx], wrist) * 0.85;
    };
    return isFolded(8, 5) && isFolded(12, 9) && isFolded(16, 13) && isFolded(20, 17);
}

// --- Drawing Mode Logic ---
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const lineWidthInput = document.getElementById('lineWidth');
const clearBtn = document.getElementById('clearBtn');
const cursor = document.getElementById('cursor');

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentX = null;
let currentY = null;
const SMOOTHING_FACTOR = 0.15;

function resizeCanvas() {
    if (canvasElement) {
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
    }
}
window.addEventListener('resize', resizeCanvas);
if (canvasElement) {
    resizeCanvas();
}

if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        if (canvasCtx && canvasElement) {
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        }
    });
}

function handleDrawingMode(landmarks) {
    if (!landmarks || landmarks.length < 21) return;
    const indexFinger = landmarks[8];
    const thumb = landmarks[4];
    if (!indexFinger || !thumb) return;
    
    if (isFist(landmarks)) {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        updateStatus('تم مسح الشاشة!', 'ready');
        setTimeout(() => {
            if(statusDrawing.textContent === 'تم مسح الشاشة!') {
                updateStatus('جاهز للرسم! (قرّب الإبهام من السبابة للرسم)', 'ready');
            }
        }, 1000);
    }
    
    // Calculate position based on video mirroring
    const isMirrored = videoElement.classList.contains('mirrored');
    const targetX = isMirrored ? ((1 - indexFinger.x) * canvasElement.width) : (indexFinger.x * canvasElement.width);
    const targetY = indexFinger.y * canvasElement.height;
    
    if (currentX === null || currentY === null) {
        currentX = targetX;
        currentY = targetY;
    } else {
        currentX += (targetX - currentX) * SMOOTHING_FACTOR;
        currentY += (targetY - currentY) * SMOOTHING_FACTOR;
    }
    
    const x = currentX;
    const y = currentY;
    
    cursor.style.display = 'block';
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    cursor.style.borderColor = colorPicker.value;
    
    const distance = calculateDistance(indexFinger, thumb);
    const pinchThreshold = 0.08;
    
    if (distance < pinchThreshold) {
        cursor.style.backgroundColor = colorPicker.value;
        if (!isDrawing) {
            isDrawing = true;
            lastX = x;
            lastY = y;
        }
        canvasCtx.beginPath();
        canvasCtx.moveTo(lastX, lastY);
        canvasCtx.lineTo(x, y);
        canvasCtx.strokeStyle = colorPicker.value;
        canvasCtx.lineWidth = lineWidthInput.value;
        canvasCtx.lineCap = 'round';
        canvasCtx.stroke();
        lastX = x;
        lastY = y;
    } else {
        isDrawing = false;
        cursor.style.backgroundColor = 'transparent';
    }
}

function resetDrawingState() {
    isDrawing = false;
    cursor.style.display = 'none';
    currentX = null;
    currentY = null;
}

// --- 3D & AR Mode Logic (Three.js) ---
let isThreeJsInitialized = false;
let scene, camera, renderer, loadedModel;
let targetModelX = 0;
let targetModelY = 0;
let targetModelZ = 0;
let currentModelX = 0;
let currentModelY = 0;
let currentModelZ = 0;
let wasModelVisible = false;

let targetQuaternion = new THREE.Quaternion();
let currentQuaternion = new THREE.Quaternion();

let targetScale = 1;
let currentScale = 1;

function initThreeJs() {
    isThreeJsInitialized = true;
    
    scene = new THREE.Scene();
    scene.background = null; 

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 10;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    threejsContainer.appendChild(renderer.domElement);

    // Better Lighting to see shape clearly
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    scene.add(hemiLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(5, 10, 10);
    scene.add(directionalLight);
    
    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight.position.set(-5, 0, -5);
    scene.add(fillLight);

    const loader = new THREE.GLTFLoader();
    updateStatus('جاري تحميل المجسم (qwqee.glb)...', 'loading');
    
    loader.load(
        'qwqee.glb',
        function (gltf) {
            const model = gltf.scene;
            
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            
            const normalizedScale = 3 / maxDim;
            model.scale.set(normalizedScale, normalizedScale, normalizedScale);
            
            // Translate the model so its bounding box center is at (0, 0, 0) of the aligner
            model.position.x = -center.x * normalizedScale;
            model.position.y = -center.y * normalizedScale;
            model.position.z = -center.z * normalizedScale;
            
            // Create an aligner group to rotate the model around its center
            const aligner = new THREE.Group();
            aligner.add(model);
            
            // Align the model's dimensions automatically to match the hand:
            // Longest dimension -> Y (hand length), Medium -> X (hand width), Shortest -> Z (thickness)
            const dx = size.x;
            const dy = size.y;
            const dz = size.z;
            
            if (dx >= dy && dx >= dz) {
                if (dy >= dz) {
                    aligner.rotation.z = Math.PI / 2;
                } else {
                    aligner.rotation.z = Math.PI / 2;
                    aligner.rotation.y = Math.PI / 2;
                }
            } else if (dy >= dx && dy >= dz) {
                if (dx >= dz) {
                    // Already aligned Y-longest, X-medium, Z-shortest
                } else {
                    aligner.rotation.y = Math.PI / 2;
                }
            } else {
                if (dx >= dy) {
                    aligner.rotation.x = Math.PI / 2;
                } else {
                    aligner.rotation.x = Math.PI / 2;
                    aligner.rotation.y = Math.PI / 2;
                }
            }
            
            // Create the main wrapper group that tracks hand position/rotation
            const wrapper = new THREE.Group();
            wrapper.add(aligner);
            wrapper.visible = false;
            
            scene.add(wrapper);
            loadedModel = wrapper; 

            updateStatus('جاهز! حرّك يدك للتحكم بالمجسم.', 'ready');
        },
        undefined,
        function (error) {
            console.error(error);
            updateStatus('لم يتم العثور على ملف qwqee.glb.', 'error');
        }
    );

    window.addEventListener('resize', () => {
        if(currentMode === '3d' || currentMode === 'ar' || currentMode === 'ar_locked') {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    });

    animateThreeJs();
}

function animateThreeJs() {
    requestAnimationFrame(animateThreeJs);
    
    const is3dMode = currentMode === '3d' || currentMode === 'ar' || currentMode === 'ar_locked';
    
    if (currentMode === 'ar_ground') {
        if (loadedModel) {
            loadedModel.visible = true;
            loadedModel.position.set(0, -1.5, -4);
            loadedModel.quaternion.set(0, 0, 0, 1);
            
            const slider = document.getElementById('groundScaleSlider');
            const scaleVal = slider ? parseFloat(slider.value) : 1.0;
            loadedModel.scale.set(scaleVal, scaleVal, scaleVal);
        }
        
        camera.position.set(0, 0, 0); // Position camera at origin for look-around
        
        if (deviceOrientation) {
            const pitch = THREE.MathUtils.degToRad(deviceOrientation.beta - 90);
            const yaw = THREE.MathUtils.degToRad(deviceOrientation.alpha);
            const roll = THREE.MathUtils.degToRad(deviceOrientation.gamma);
            
            const euler = new THREE.Euler();
            euler.set(pitch, yaw, roll, 'YXZ');
            camera.quaternion.setFromEuler(euler);
        }
        
        renderer.render(scene, camera);
    } else if (loadedModel && is3dMode && loadedModel.visible) {
        if (currentMode === 'ar_locked') {
            // Rigidly lock position and rotation instantly (no float lag!)
            currentModelX = targetModelX;
            currentModelY = targetModelY;
            currentModelZ = targetModelZ;
            currentQuaternion.copy(targetQuaternion);
            currentScale = targetScale;
            wasModelVisible = true;
        } else {
            // Snap instantly to hand position when hand is first detected to prevent flying across screen
            if (!wasModelVisible) {
                currentModelX = targetModelX;
                currentModelY = targetModelY;
                currentModelZ = targetModelZ;
                currentQuaternion.copy(targetQuaternion);
                currentScale = targetScale;
                wasModelVisible = true;
            }
            
            currentModelX += (targetModelX - currentModelX) * 0.08; // Butter-smooth slow interpolation to completely eliminate position jitter
            currentModelY += (targetModelY - currentModelY) * 0.08;
            currentModelZ += (targetModelZ - currentModelZ) * 0.08;
            
            currentQuaternion.slerp(targetQuaternion, 0.04); // Extra-smooth slow rotation tracking to remove any rotation shaking
            currentScale += (targetScale - currentScale) * 0.08;
        }
        
        loadedModel.position.set(currentModelX, currentModelY, currentModelZ);
        loadedModel.quaternion.copy(currentQuaternion);
        loadedModel.scale.set(currentScale, currentScale, currentScale);
        
        renderer.render(scene, camera);
    } else if (loadedModel && is3dMode && !loadedModel.visible) {
        wasModelVisible = false;
        renderer.render(scene, camera);
    }
}

function handle3DMode(landmarks) {
    if (!loadedModel) return;
    if (!landmarks || landmarks.length < 21) return;
    
    if (isFist(landmarks)) {
        loadedModel.visible = false;
        return;
    } else {
        loadedModel.visible = true;
    }
    
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];
    const pinkyMcp = landmarks[17];
    if (!wrist || !indexMcp || !middleMcp || !pinkyMcp) return;
    
    // Anchor at the exact center of the palm (averaging wrist and base knuckles)
    // This places the model deep and centered inside the palm as if being held
    const palmX = (wrist.x + indexMcp.x + middleMcp.x + pinkyMcp.x) / 4;
    const palmY = (wrist.y + indexMcp.y + middleMcp.y + pinkyMcp.y) / 4;
    
    // Check if the video is currently mirrored
    const isMirrored = videoElement.classList.contains('mirrored');
    
    // Calculate X coordinate in Normalized Device Coordinates (NDC)
    // If mirrored, flip the X axis. If not, use standard mapping.
    const ndcX = isMirrored ? (((1 - palmX) * 2) - 1) : ((palmX * 2) - 1);
    const ndcY = -(palmY * 2) + 1;
    
    // Scale: Use the rigid palm length (wrist to middle finger MCP)
    // This keeps the size completely stable and prevents shrinking when curling fingers
    const palmLength = calculateDistance3D(wrist, middleMcp);
    
    // Calculate 3D distance dynamically based on palm length to allow true forward/backward depth movement.
    // If palmLength is 0.15 (normal), distance is 7.5 units from camera, bringing it closer to the user.
    const distance = 1.12 / Math.max(0.05, palmLength);
    
    const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
    vector.unproject(camera);
    const dir = vector.sub(camera.position).normalize();
    const pos = camera.position.clone().add(dir.multiplyScalar(distance));
    
    // Model tracks the hand in BOTH 3D and AR modes, including depth (Z)
    targetModelX = pos.x;
    targetModelY = pos.y;
    targetModelZ = pos.z;
    
    // Stable scale constant. Scaling is handled naturally by 3D perspective depth!
    targetScale = 0.45;
    
    // Flip the sign of relative X components for direction vectors if mirrored
    const xSign = isMirrored ? -1 : 1;
    
    // Rigid 3D space vectors with no depth warping, to match palm-front and hand-back perfectly
    const vUp = new THREE.Vector3(
        xSign * (middleMcp.x - wrist.x), 
        -(middleMcp.y - wrist.y), 
        -(middleMcp.z - wrist.z)
    ).normalize();
    
    const vRight = new THREE.Vector3(
        xSign * (pinkyMcp.x - indexMcp.x), 
        -(pinkyMcp.y - indexMcp.y), 
        -(pinkyMcp.z - indexMcp.z)
    ).normalize();
    
    const vForward = new THREE.Vector3().crossVectors(vRight, vUp).normalize();
    vRight.crossVectors(vUp, vForward).normalize();
    
    const matrix = new THREE.Matrix4();
    matrix.makeBasis(vRight, vUp, vForward);
    
    targetQuaternion.setFromRotationMatrix(matrix);
}

// --- MediaPipe Hand Tracking Setup ---
const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        
        // Apply Exponential Moving Average (EMA) to landmarks to eliminate camera jitter at source
        const len = landmarks.length;
        if (!smoothedLandmarks || smoothedLandmarks.length !== len) {
            smoothedLandmarks = [];
            for (let i = 0; i < len; i++) {
                smoothedLandmarks.push({
                    x: landmarks[i].x,
                    y: landmarks[i].y,
                    z: landmarks[i].z
                });
            }
        } else {
            for (let i = 0; i < len; i++) {
                if (landmarks[i]) {
                    smoothedLandmarks[i].x += (landmarks[i].x - smoothedLandmarks[i].x) * LANDMARK_SMOOTHING_XY;
                    smoothedLandmarks[i].y += (landmarks[i].y - smoothedLandmarks[i].y) * LANDMARK_SMOOTHING_XY;
                    smoothedLandmarks[i].z += (landmarks[i].z - smoothedLandmarks[i].z) * LANDMARK_SMOOTHING_Z;
                }
            }
        }
        
        if (currentMode === 'drawing') {
            handleDrawingMode(smoothedLandmarks);
        } else if (currentMode === '3d' || currentMode === 'ar' || currentMode === 'ar_locked') {
            handle3DMode(smoothedLandmarks);
        }
    } else {
        smoothedLandmarks = null;
        if (currentMode === 'drawing') {
            resetDrawingState();
        } else if ((currentMode === '3d' || currentMode === 'ar' || currentMode === 'ar_locked') && loadedModel) {
            loadedModel.visible = false;
        }
    }
});

// --- Start Video processing ---
let processingFrame = false;

async function startWebcam(forceRestart = false) {
    if (isWebcamStarted && !forceRestart) return;
    
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    
    updateStatus('جاري تشغيل الكاميرا...', 'loading');
    
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("insecure-context");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: { ideal: currentFacingMode },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        isWebcamStarted = true;
        currentStream = stream;
        videoElement.srcObject = stream;
        
        // Query active facingMode from stream track settings
        const track = stream.getVideoTracks()[0];
        const settings = track && track.getSettings ? track.getSettings() : {};
        activeFacingMode = settings.facingMode || currentFacingMode;
        updateVideoMirror();
        
        videoElement.onloadedmetadata = () => {
            videoElement.play().then(() => {
                updateStatus('جاهز للاستخدام!', 'ready');
                if (!processingFrame) {
                    processingFrame = true;
                    processVideoFrame();
                }
            }).catch(err => {
                console.error("Video play failed:", err);
                updateStatus('خطأ: تشغيل الفيديو محجوب من المتصفح. يرجى الضغط مجدداً.', 'error');
            });
        };
    } catch (err) {
        console.error("Error accessing webcam: ", err);
        if (err.message === "insecure-context") {
            updateStatus('خطأ: الكاميرا تتطلب اتصالاً آمناً (HTTPS) على الهاتف.', 'error');
        } else {
            updateStatus('خطأ: يرجى إعطاء صلاحية الكاميرا والمحاولة مجدداً.', 'error');
        }
    }
}

async function processVideoFrame() {
    if (videoElement.readyState >= 2) {
        try {
            await hands.send({image: videoElement});
        } catch (err) {
            console.error("MediaPipe prediction error: ", err);
        }
    }
    requestAnimationFrame(processVideoFrame);
}
