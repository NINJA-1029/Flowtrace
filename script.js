const canvas = document.getElementById('hull-canvas');
const ctx = canvas.getContext('2d');
const pointsCountEl = document.getElementById('points-count');
const hullCountEl = document.getElementById('hull-count');
const completionStatusEl = document.getElementById('completion-status');
const complexityEl = document.getElementById('complexity-display');
const approachEl = document.getElementById('approach-display');
const algoDescEl = document.getElementById('algo-desc');
const codeGraham = document.getElementById('code-graham');
const codeJarvis = document.getElementById('code-jarvis');
const traceBox = document.getElementById('trace-box');
const explanationBox = document.getElementById('explanation-box');
const playBtn = document.getElementById('play-btn');
const stepBtn = document.getElementById('step-btn');
const speedRange = document.getElementById('speed-range');

function updateStatus(status) {
    if (!completionStatusEl) return;
    switch(status) {
        case 'idle':
            completionStatusEl.innerText = 'Idle';
            completionStatusEl.style.color = '#3b82f6';
            break;
        case 'running':
            completionStatusEl.innerText = 'Running';
            completionStatusEl.style.color = '#a855f7';
            break;
        case 'paused':
            completionStatusEl.innerText = 'Paused';
            completionStatusEl.style.color = '#f59e0b';
            break;
        case 'completed':
            completionStatusEl.innerText = 'Completed';
            completionStatusEl.style.color = '#10b981';
            break;
    }
}

let points = [];
let hull = [];
let currentAlgorithm = 'graham';
let isRunning = false;
let simulationGenerator = null;
let animationTimeout = null;

// Initialize Canvas
function resizeCanvas() {
    const rect = canvas.parentNode.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    draw();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Point Class
class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.color = '#3b82f6';
        this.active = false;
        this.status = null; // 'discarded', 'hull'
    }
    draw(context) {
        context.beginPath();
        context.arc(this.x, this.y, 6, 0, Math.PI * 2);
        
        let fill = this.color;
        if (this.status === 'discarded') fill = 'rgba(239, 68, 68, 0.3)';
        if (this.status === 'hull') fill = '#2dd4bf';
        if (this.active) fill = '#fff';

        context.fillStyle = fill;
        if (this.active) {
            context.shadowBlur = 15;
            context.shadowColor = '#fff';
        } else {
            context.shadowBlur = 0;
        }
        context.fill();
        context.closePath();
    }
}

/**
 * Orientation logic based on User Provided Formula:
 * val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
 */
function getOrientation(p, q, r) {
    let val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(val) < 0.0001) return 0; // collinear
    return (val > 0) ? 1 : 2; // 1: clockwise, 2: counter-clockwise
}

function clearDraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Helper to get an extended point for the "normal line"
function getExtendedPoint(p1, p2, length = 150) {
    const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    if (dist === 0) return p2;
    const ratio = length / dist;
    return {
        x: p2.x + (p2.x - p1.x) * ratio,
        y: p2.y + (p2.y - p1.y) * ratio
    };
}

function drawArrow(p1, p2, color = 'rgba(168, 85, 247, 0.5)', width = 2, dashed = false) {
    if (!p1 || !p2) return;
    const headlen = 10;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    
    ctx.save();
    ctx.beginPath();
    if (dashed) ctx.setLineDash([5, 5]);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - headlen * Math.cos(angle - Math.PI / 6), p2.y - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - headlen * Math.cos(angle + Math.PI / 6), p2.y - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
    ctx.restore();
}

function drawLine(p1, p2, color = 'rgba(255, 255, 255, 0.2)', width = 1, dashed = true) {
    ctx.save();
    if (dashed) ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
}

function draw() {
    clearDraw();
    
    // Draw edges of hull
    if (hull.length > 1) {
        ctx.beginPath();
        ctx.moveTo(hull[0].x, hull[0].y);
        for (let i = 1; i < hull.length; i++) {
            ctx.lineTo(hull[i].x, hull[i].y);
        }
        ctx.strokeStyle = '#2dd4bf';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(45, 212, 191, 0.1)';
        ctx.fill();
        ctx.closePath();
    }

    // Draw temporary items
    if (window.tempLines) {
        window.tempLines.forEach(item => {
            if (item.type === 'normal') {
                drawLine(item.p1, item.p2, item.color, item.width, true);
            } else if (item.arrow) {
                drawArrow(item.p1, item.p2, item.color, item.width, item.dashed);
            } else {
                ctx.beginPath();
                ctx.moveTo(item.p1.x, item.p1.y);
                ctx.lineTo(item.p2.x, item.p2.y);
                ctx.strokeStyle = item.color;
                ctx.lineWidth = item.width || 2;
                ctx.stroke();
            }
        });
    }

    if (window.tempTexts) {
        window.tempTexts.forEach(t => {
            ctx.fillStyle = t.color || '#fff';
            ctx.font = 'bold 14px Outfit';
            ctx.fillText(t.text, t.x, t.y);
        });
    }

    // Draw points
    points.forEach(pt => pt.draw(ctx));
}

// UI Controls
canvas.addEventListener('mousedown', (e) => {
    if (isRunning) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    points.push(new Point(x, y));
    pointsCountEl.innerText = points.length;
    draw();
});

document.getElementById('rand-btn').addEventListener('click', () => {
    if (isRunning) return;
    for (let i = 0; i < 5; i++) {
        const x = Math.random() * (canvas.width - 40) + 20;
        const y = Math.random() * (canvas.height - 40) + 20;
        points.push(new Point(x, y));
    }
    pointsCountEl.innerText = points.length;
    draw();
});

document.getElementById('clear-btn').addEventListener('click', () => {
    resetSimulation();
    points = [];
    pointsCountEl.innerText = '0';
    draw();
});

document.querySelectorAll('.switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isRunning) return;
        document.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentAlgorithm = btn.dataset.algo;
        updateAlgoInfo();
        resetSimulation();
    });
});

function updateAlgoInfo() {
    if (currentAlgorithm === 'graham') {
        complexityEl.innerText = 'O(n log n)';
        approachEl.innerText = 'Sorted Polar Angle';
        algoDescEl.innerText = 'Graham scan uses a stack to find the convex hull by sorting points and maintaining only left turns.';
        codeGraham.classList.remove('hidden');
        codeJarvis.classList.add('hidden');
    } else {
        complexityEl.innerText = 'O(nh)';
        approachEl.innerText = 'Gift Wrapping';
        algoDescEl.innerText = 'Jarvis March starts from extreme points and wraps around the set by repeatedly finding the most counter-clockwise point.';
        codeGraham.classList.add('hidden');
        codeJarvis.classList.remove('hidden');
    }
}

function updateCodeHighlight(lineId) {
    document.querySelectorAll('.code-line').forEach(l => l.classList.remove('active-line'));
    if (lineId) {
        const el = document.getElementById(lineId);
        if (el) el.classList.add('active-line');
    }
}

function updateTrace(text) {
    traceBox.innerHTML = `<strong>Trace:</strong> ${text}`;
}

// GRAHAM SCAN
function* grahamScanGenerator() {
    if (points.length < 3) return;
    updateCodeHighlight('g-line-1');
    updateTrace("Finding base point...");
    
    let startPoint = points[0];
    let startIdx = 0;
    for (let i = 1; i < points.length; i++) {
        if (points[i].y > startPoint.y || (points[i].y === startPoint.y && points[i].x < startPoint.x)) {
            startPoint = points[i];
            startIdx = i;
        }
    }
    startPoint.color = '#ef4444';
    startPoint.active = true;
    draw(); yield;

    updateCodeHighlight('g-line-2');
    updateTrace("Sorting points by polar angle...");
    let sorted = [...points];
    sorted.splice(startIdx, 1);
    sorted.sort((a, b) => {
        let val = getOrientation(startPoint, a, b);
        if (val === 0) {
            let d1 = Math.pow(startPoint.x - a.x, 2) + Math.pow(startPoint.y - a.y, 2);
            let d2 = Math.pow(startPoint.x - b.x, 2) + Math.pow(startPoint.y - b.y, 2);
            return d1 < d2 ? -1 : 1;
        }
        return (val === 2) ? -1 : 1; // CCW is 2
    });
    sorted.unshift(startPoint);
    
    updateTrace("Stack initialized with first 3 points.");
    let stack = [sorted[0], sorted[1], sorted[2]];
    stack.forEach(pt => pt.status = 'hull');
    hull = [...stack];
    draw(); yield;

    for (let i = 3; i < sorted.length; i++) {
        let pCandidate = sorted[i];
        pCandidate.active = true;
        updateCodeHighlight('g-line-4');
        updateTrace(`Evaluating point ${i}...`);
        draw(); yield;

        updateCodeHighlight('g-line-5');
        while (stack.length > 1) {
            let pTop = stack[stack.length - 1];
            let pPrev = stack[stack.length - 2];
            let orient = getOrientation(pPrev, pTop, pCandidate);
            
            const extended = getExtendedPoint(pPrev, pTop, 100);
            
            window.tempLines = [
                {p1: pPrev, p2: pTop, color: '#3b82f6', arrow: true, width: 2},
                {p1: pTop, p2: extended, color: 'rgba(255, 255, 255, 0.3)', type: 'normal', width: 1}, // Dotted Normal Line
                {p1: pTop, p2: pCandidate, color: orient === 2 ? '#10b981' : '#ef4444', arrow: true, width: 2, dashed: orient !== 2}
            ];
            window.tempTexts = [{
                x: (pTop.x + pCandidate.x)/2 + 10, y: (pTop.y + pCandidate.y)/2 - 10,
                text: orient === 2 ? "CCW (LEFT TURN)" : "CW (RIGHT TURN)",
                color: orient === 2 ? '#10b981' : '#ef4444'
            }];
            updateTrace(orient === 2 ? "Counter-Clockwise turn detected. Keep point." : "Clockwise turn detected. Discard top.");
            draw(); yield;

            if (orient === 2) break;

            let popped = stack.pop();
            popped.status = 'discarded';
            popped.active = false;
            updateCodeHighlight('g-line-6');
            hull = [...stack, pCandidate];
            draw(); yield;
        }
        
        stack.push(pCandidate);
        pCandidate.status = 'hull';
        pCandidate.active = false;
        hull = [...stack];
        hullCountEl.innerText = hull.length;
        window.tempLines = [];
        window.tempTexts = [];
        updateCodeHighlight('g-line-7');
        draw(); yield;
    }

    hull.push(hull[0]);
    updateCodeHighlight('g-line-8');
    updateTrace("Graham Scan finished.");
    draw();
}

// JARVIS MARCH
function* jarvisMarchGenerator() {
    if (points.length < 3) {
        explanationBox.innerText = "Need at least 3 points for a hull.";
        return;
    }

    updateCodeHighlight('j-line-1');
    updateTrace("Finding point with minimum X-coordinate (leftmost)...");
    
    let leftmost = points[0];
    for (let pt of points) if (pt.x < leftmost.x) leftmost = pt;
    
    updateCodeHighlight('j-line-2');
    let p = leftmost;
    hull = [];
    updateTrace(`Starting Jarvis March with p = leftmost.`);
    draw(); yield;

    do {
        updateCodeHighlight('j-line-3');
        yield;

        updateCodeHighlight('j-line-4');
        updateTrace(`Adding p to hull.`);
        hull.push(p);
        p.status = 'hull';
        hullCountEl.innerText = hull.length;
        draw(); yield;

        updateCodeHighlight('j-line-5');
        let pIdx = points.indexOf(p);
        let q = points[(pIdx + 1) % points.length];
        updateTrace("Picking initial candidate q = (p+1) mod n.");
        window.tempLines = [{p1: p, p2: q, color: '#3b82f6', arrow: true, width: 2}];
        draw(); yield;

        updateCodeHighlight('j-line-6');
        for (let r of points) {
            if (r === p || r === q) continue;

            r.active = true;
            updateTrace("Searching for a point r that is more counter-clockwise.");
            
            const extended = getExtendedPoint(p, q, 100);
            
            window.tempLines = [
                {p1: p, p2: q, color: '#3b82f6', arrow: true, width: 2},
                {p1: q, p2: extended, color: 'rgba(255, 255, 255, 0.3)', type: 'normal', width: 1}, // Dotted Normal Line
                {p1: p, p2: r, color: 'rgba(255, 255, 255, 0.4)', arrow: true, width: 1, dashed: true}
            ];
            draw(); yield;

            updateCodeHighlight('j-line-7');
            let orient = getOrientation(p, q, r);
            
            if (orient === 2) { // counter-clockwise
                updateCodeHighlight('j-line-8');
                updateTrace("orientation(p, q, r) is counter-clockwise! Setting q = r.");
                q = r;
                window.tempLines = [{p1: p, p2: q, color: '#10b981', arrow: true, width: 3}];
                window.tempTexts = [{
                    x: (p.x + q.x)/2, y: (p.y + q.y)/2 - 15,
                    text: "NEW CCW CANDIDATE", color: '#10b981'
                }];
                draw(); yield;
                window.tempTexts = [];
            }
            r.active = false;
        }

        updateCodeHighlight('j-line-9');
        p = q;
        updateTrace("Vertex found. Setting p = q for next wrapping step.");
        draw(); yield;

        updateCodeHighlight('j-line-10');
        updateTrace("Checking if we reached leftmost point...");
        yield;

    } while (p !== leftmost);

    hull.push(leftmost);
    window.tempLines = [];
    updateTrace("Jarvis March complete!");
    draw();
}

// Execution Loop
function resetSimulation() {
    isRunning = false;
    if (animationTimeout) clearTimeout(animationTimeout);
    simulationGenerator = null;
    hull = [];
    window.tempLines = [];
    window.tempTexts = [];
    points.forEach(pt => {
        pt.color = '#3b82f6';
        pt.active = false;
        pt.status = null;
    });
    hullCountEl.innerText = '0';
    playBtn.innerText = 'Start';
    explanationBox.innerText = 'Click "Start" to see the convex hull formation.';
    updateCodeHighlight(null);
    traceBox.innerHTML = '<span class="trace-placeholder">Start the simulation to see live updates...</span>';
    updateStatus('idle');
    draw();
}

function runStep() {
    if (!simulationGenerator) {
        simulationGenerator = currentAlgorithm === 'graham' ? grahamScanGenerator() : jarvisMarchGenerator();
        isRunning = true;
        playBtn.innerText = 'Pause';
        updateStatus('running');
    }
    const result = simulationGenerator.next();
    if (result.done) {
        isRunning = false;
        playBtn.innerText = 'Reset';
        simulationGenerator = null;
        updateStatus('completed');
    }
    return result.done;
}

function autoPlay() {
    if (!isRunning) return;
    const isDone = runStep();
    if (!isDone) {
        animationTimeout = setTimeout(autoPlay, 1050 - speedRange.value);
    }
}

playBtn.addEventListener('click', () => {
    if (playBtn.innerText === 'Reset') { resetSimulation(); return; }
    if (isRunning) { 
        isRunning = false; 
        playBtn.innerText = 'Resume'; 
        clearTimeout(animationTimeout); 
        updateStatus('paused');
    }
    else { 
        isRunning = true; 
        playBtn.innerText = 'Pause'; 
        updateStatus('running');
        autoPlay(); 
    }
});

stepBtn.addEventListener('click', () => {
    if (isRunning) { 
        isRunning = false; 
        playBtn.innerText = 'Resume'; 
        clearTimeout(animationTimeout); 
        updateStatus('paused');
    } else if (simulationGenerator) {
        updateStatus('paused');
    }
    runStep();
});

document.getElementById('reset-btn').addEventListener('click', resetSimulation);
document.getElementById('illustrate-btn').addEventListener('click', () => {
    document.getElementById('illustration-panel').classList.toggle('hidden');
});
document.getElementById('close-illustrate').addEventListener('click', () => {
    document.getElementById('illustration-panel').classList.add('hidden');
});
document.getElementById('view-active-only-cb').addEventListener('change', (e) => {
    if (e.target.checked) {
        codeGraham.classList.add('show-active-only');
        codeJarvis.classList.add('show-active-only');
    } else {
        codeGraham.classList.remove('show-active-only');
        codeJarvis.classList.remove('show-active-only');
    }
});
