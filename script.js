
// ===============================
// AIR CANVAS AI - SETTINGS
// ===============================

let currentColor = "#a855f7";
let brushSize = 8;
let isErasing = false;

// ===============================
// HTML ELEMENTS
// ===============================

const video = document.getElementById("video");
const canvas = document.getElementById("drawCanvas");
const cursor = document.getElementById("cursorCanvas");

const ctx = canvas.getContext("2d");
const pointer = cursor.getContext("2d");
const status = document.getElementById("status");

canvas.width = 800;
canvas.height = 450;

cursor.width = 800;
cursor.height = 450;

// ===============================
// DRAWING VARIABLES
// ===============================

let lastX = null;
let lastY = null;

let smoothX = null;
let smoothY = null;

let missingFrames = 0;
let drawFrames = 0;
let stopFrames = 0;

let isDrawing = false;
let strokeStarted = false;
let wasDrawing = false;

// ===============================
// UNDO AND REDO HISTORY
// ===============================

let undoStack = [];
let redoStack = [];

const MAX_HISTORY = 30;

function saveHistory() {

    if (undoStack.length >= MAX_HISTORY) {
        undoStack.shift();
    }

    undoStack.push(
        ctx.getImageData(0, 0, canvas.width, canvas.height)
    );

    redoStack = [];
}

function undoDrawing() {

    if (undoStack.length === 0) return;

    redoStack.push(
        ctx.getImageData(0, 0, canvas.width, canvas.height)
    );

    const previous = undoStack.pop();

    ctx.putImageData(previous, 0, 0);

    lastX = null;
    lastY = null;
}

function redoDrawing() {

    if (redoStack.length === 0) return;

    undoStack.push(
        ctx.getImageData(0, 0, canvas.width, canvas.height)
    );

    const next = redoStack.pop();

    ctx.putImageData(next, 0, 0);

    lastX = null;
    lastY = null;
}

// ===============================
// COLOR AND BRUSH CONTROLS
// ===============================

function changeColor(color) {
    currentColor = color;
    usePen();
}

function changeBrush(size) {
    brushSize = size;
}

function usePen() {
    isErasing = false;
}

function useEraser() {
    isErasing = true;
}

// ===============================
// BACKGROUND CONTROL
// ===============================

function changeBackground(color) {
    canvas.style.backgroundColor = color;
}

// ===============================
// CLEAR CANVAS
// ===============================

function clearCanvas() {

    saveHistory();

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    lastX = null;
    lastY = null;

    strokeStarted = false;
}

// ===============================
// SAVE DRAWING
// ===============================

function saveDrawing() {

    const exportCanvas = document.createElement("canvas");

    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;

    const exportCtx = exportCanvas.getContext("2d");

    const background = canvas.style.backgroundColor;

    if (background && background !== "transparent") {

        exportCtx.fillStyle = background;

        exportCtx.fillRect(
            0,
            0,
            exportCanvas.width,
            exportCanvas.height
        );
    }

    exportCtx.drawImage(canvas, 0, 0);

    const link = document.createElement("a");

    link.download = "AirCanvas.png";

    link.href = exportCanvas.toDataURL("image/png");

    link.click();
}

// ===============================
// FINGER ANGLE CALCULATION
// ===============================

function getAngle(a, b, c) {

    const ab = {
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z
    };

    const cb = {
        x: c.x - b.x,
        y: c.y - b.y,
        z: c.z - b.z
    };

    const dot =
        ab.x * cb.x +
        ab.y * cb.y +
        ab.z * cb.z;

    const magAB = Math.hypot(ab.x, ab.y, ab.z);
    const magCB = Math.hypot(cb.x, cb.y, cb.z);

    if (!magAB || !magCB) return 0;

    const cosine = Math.max(
        -1,
        Math.min(1, dot / (magAB * magCB))
    );

    return Math.acos(cosine) * 180 / Math.PI;
}

// ===============================
// FINGER DETECTION
// ===============================

function isFingerUp(landmarks, mcp, pip, tip) {

    return getAngle(
        landmarks[mcp],
        landmarks[pip],
        landmarks[tip]
    ) > 145;
}

// ===============================
// DRAWING FUNCTION
// ===============================

function drawLine(x, y) {

    if (lastX !== null) {

        const distance = Math.hypot(
            x - lastX,
            y - lastY
        );

        const steps = Math.max(
            1,
            Math.ceil(distance / 8)
        );

        ctx.globalCompositeOperation = isErasing
            ? "destination-out"
            : "source-over";

        ctx.strokeStyle = currentColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();

        ctx.moveTo(lastX, lastY);

        for (let i = 1; i <= steps; i++) {

            const nextX =
                lastX + (x - lastX) * i / steps;

            const nextY =
                lastY + (y - lastY) * i / steps;

            ctx.lineTo(nextX, nextY);
        }

        ctx.stroke();

        ctx.globalCompositeOperation = "source-over";
    }

    lastX = x;
    lastY = y;
}

// ===============================
// MEDIAPIPE INITIALIZATION
// ===============================

const hands = new Hands({

    locateFile: file =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`

});

hands.setOptions({

    maxNumHands: 1,

    modelComplexity: 1,

    minDetectionConfidence: 0.35,

    minTrackingConfidence: 0.35

});

// ===============================
// HAND DETECTION RESULTS
// ===============================

hands.onResults(results => {

    pointer.clearRect(
        0,
        0,
        cursor.width,
        cursor.height
    );

    // Check if hand is missing

    if (
        !results.multiHandLandmarks ||
        results.multiHandLandmarks.length === 0
    ) {

        missingFrames++;

        status.innerText = "Tracking hand...";

        if (missingFrames > 12) {

            lastX = null;
            lastY = null;

            smoothX = null;
            smoothY = null;

            isDrawing = false;
            wasDrawing = false;
            strokeStarted = false;

            drawFrames = 0;
            stopFrames = 0;
        }

        return;
    }

    missingFrames = 0;

    // Recover after tracking loss

    if (wasDrawing) {

        lastX = null;
        lastY = null;

        wasDrawing = false;
    }

    const landmarks = results.multiHandLandmarks[0];

    // Detect fingers

    const indexUp = isFingerUp(landmarks, 5, 6, 8);

    const middleUp = isFingerUp(landmarks, 9, 10, 12);

    const ringUp = isFingerUp(landmarks, 13, 14, 16);

    const pinkyUp = isFingerUp(landmarks, 17, 18, 20);

    // Drawing gesture

    const drawGesture =
        indexUp &&
        !middleUp &&
        !ringUp &&
        !pinkyUp;

    // Stable gesture detection

    if (drawGesture) {

        drawFrames++;

        stopFrames = 0;

        if (drawFrames >= 2) {
            isDrawing = true;
        }

    } else {

        stopFrames++;

        drawFrames = 0;

        if (stopFrames >= 8) {
            isDrawing = false;
        }
    }

    // Finger position

    const x = (1 - landmarks[8].x) * canvas.width;

    const y = landmarks[8].y * canvas.height;

    // Smooth movement

    smoothX = smoothX === null
        ? x
        : smoothX * 0.55 + x * 0.45;

    smoothY = smoothY === null
        ? y
        : smoothY * 0.55 + y * 0.45;

    // Red fingertip pointer

    pointer.fillStyle = "red";

    pointer.beginPath();

    pointer.arc(
        smoothX,
        smoothY,
        8,
        0,
        Math.PI * 2
    );

    pointer.fill();

    // Draw

    if (isDrawing) {

        status.innerText = "🟢 DRAWING";

        if (!strokeStarted) {

            saveHistory();

            strokeStarted = true;
        }

        drawLine(smoothX, smoothY);

    } else {

        status.innerText = "✋ DRAWING STOPPED";

        strokeStarted = false;

        lastX = null;
        lastY = null;
    }

});

// ===============================
// START CAMERA
// ===============================

async function startCamera() {

    try {

        status.innerText = "Loading AI...";

        const camera = new Camera(video, {

            onFrame: async () => {

                if (video.readyState >= 2) {

                    await hands.send({
                        image: video
                    });
                }
            },

            width: 1280,

            height: 720

        });

        await camera.start();

        status.innerText = "Show your index finger to draw";

    } catch (error) {

        console.error(error);

        status.innerText = "Camera Error: " + error.message;
    }
}

// ===============================
// START AIR CANVAS
// ===============================

startCamera();
