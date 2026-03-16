// --- Core Setup ---
const canvas = document.getElementById('simulation-canvas');
const ctx = canvas.getContext('2d');
const labelsContainer = document.getElementById('labels-container');

let width, height;
let gears = [];
let nextGearId = 0;
let selectedGearId = null;

let isPlaying = true;
let baseRpm = 10;
let globalTime = 0;
let lastTime = performance.now();
let showLabels = true;

// Dragging State
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

const MODULE = 8; // Constant size unit for 2D visual scaling
const gearColors = ['#3b82f6', '#64748b', '#10b981', '#f43f5e', '#8b5cf6', '#0ea5e9', '#f59e0b'];

// --- Math Functions ---
function gcd(a, b) { return !b ? a : gcd(b, a % b); }

// Extended Euclidean Algorithm: solves ax + by = gcd(a, b)
function extGCD(a, b) {
    let old_r = a, r = b;
    let old_s = 1, s = 0;
    let old_t = 0, t = 1;

    while (r !== 0) {
        let quotient = Math.floor(old_r / r);
        [old_r, r] = [r, old_r - quotient * r];
        [old_s, s] = [s, old_s - quotient * s];
        [old_t, t] = [t, old_t - quotient * t];
    }
    return { gcd: old_r, x: old_s, y: -old_t };
}

// --- Gear Class ---
class Gear {
    constructor(data = {}) {
        this.id = data.id !== undefined ? data.id : nextGearId++;
        this.parent = data.parent || null;
        this.teeth = data.teeth || (this.parent ? 16 : 24);
        this.isInternal = data.isInternal || false;
        this.connectionAngle = data.connectionAngle || 0;
        this.color = gearColors[this.id % gearColors.length];
        
        // Allow arbitrary positioning for the root gear
        this.manualX = data.manualX || 0;
        this.manualY = data.manualY || 0;

        this.x = 0;
        this.y = 0;
        this.baseRotation = 0;
        
        this.labelEl = document.createElement('div');
        this.labelEl.className = 'gear-label';
        this.labelEl.addEventListener('mousedown', (e) => {
            e.stopPropagation(); 
            selectGear(this.id);
        });
        labelsContainer.appendChild(this.labelEl);

        this.updatePosition();
    }

    get pitchRadius() { return (this.teeth * MODULE) / 2; }
    
    get rpm() {
        if (!this.parent) return baseRpm;
        const dir = (this.isInternal || this.parent.isInternal) ? 1 : -1;
        return this.parent.rpm * (this.parent.teeth / this.teeth) * dir;
    }

    destroy() {
        this.labelEl.remove();
    }

    updatePosition() {
        if (!this.parent) {
            this.x = this.manualX;
            this.y = this.manualY;
        } else {
            const angleRad = (this.connectionAngle * Math.PI) / 180;
            let distance = this.isInternal ? (this.pitchRadius - this.parent.pitchRadius) 
                         : this.parent.isInternal ? (this.parent.pitchRadius - this.pitchRadius)
                         : (this.parent.pitchRadius + this.pitchRadius);
            
            this.x = this.parent.x + distance * Math.cos(angleRad);
            this.y = this.parent.y + distance * Math.sin(angleRad);
            
            // Align teeth physically
            const ratio = this.parent.teeth / this.teeth;
            if (this.isInternal || this.parent.isInternal) {
                this.baseRotation = angleRad + (this.parent.baseRotation - angleRad) * ratio;
            } else {
                this.baseRotation = angleRad + Math.PI + (Math.PI / this.teeth) - (this.parent.baseRotation - angleRad) * ratio;
            }
        }
        this.updateLabelContent();
    }

    draw(ctx, time) {
        const rotation = this.baseRotation + (this.rpm * time * Math.PI * 2);
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(rotation);

        const pr = this.pitchRadius;
        const addendum = MODULE * 0.8;
        const dedendum = MODULE * 1.2;

        ctx.beginPath();
        const stepAngle = Math.PI / this.teeth;
        
        if (this.isInternal) {
            ctx.arc(0, 0, pr + dedendum + 20, 0, Math.PI * 2);
            for (let i = 0; i < this.teeth; i++) {
                const angle = i * 2 * stepAngle;
                ctx.lineTo(Math.cos(angle - stepAngle*0.3) * (pr - addendum), Math.sin(angle - stepAngle*0.3) * (pr - addendum));
                ctx.lineTo(Math.cos(angle + stepAngle*0.3) * (pr - addendum), Math.sin(angle + stepAngle*0.3) * (pr - addendum));
                ctx.lineTo(Math.cos(angle + stepAngle*0.7) * (pr + dedendum), Math.sin(angle + stepAngle*0.7) * (pr + dedendum));
                ctx.lineTo(Math.cos(angle + stepAngle*1.3) * (pr + dedendum), Math.sin(angle + stepAngle*1.3) * (pr + dedendum));
            }
        } else {
            for (let i = 0; i < this.teeth; i++) {
                const angle = i * 2 * stepAngle;
                ctx.lineTo(Math.cos(angle - stepAngle*0.2) * (pr + addendum), Math.sin(angle - stepAngle*0.2) * (pr + addendum));
                ctx.lineTo(Math.cos(angle + stepAngle*0.2) * (pr + addendum), Math.sin(angle + stepAngle*0.2) * (pr + addendum));
                ctx.lineTo(Math.cos(angle + stepAngle*0.6) * (pr - dedendum), Math.sin(angle + stepAngle*0.6) * (pr - dedendum));
                ctx.lineTo(Math.cos(angle + stepAngle*1.4) * (pr - dedendum), Math.sin(angle + stepAngle*1.4) * (pr - dedendum));
            }
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, pr * 0.2, 0, Math.PI * 2, true);
        }

        ctx.fillStyle = this.id === selectedGearId ? '#1e3a8a' : this.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.id === selectedGearId ? '#60a5fa' : '#334155';
        ctx.stroke();

        ctx.restore();

        if (showLabels) {
            this.labelEl.style.display = 'block';
            this.labelEl.style.left = `${width / 2 + this.x}px`;
            this.labelEl.style.top = `${height / 2 + this.y}px`;
            
            if (this.id === selectedGearId) {
                this.labelEl.style.borderColor = '#3b82f6';
                this.labelEl.style.backgroundColor = '#ffffff';
                this.labelEl.style.color = '#1e40af';
                this.labelEl.style.zIndex = 10;
                this.labelEl.style.transform = 'translate(-50%, -50%) scale(1.1)';
            } else {
                this.labelEl.style.borderColor = '#cbd5e1';
                this.labelEl.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
                this.labelEl.style.color = '#475569';
                this.labelEl.style.zIndex = 1;
                this.labelEl.style.transform = 'translate(-50%, -50%) scale(1)';
            }
        } else {
            this.labelEl.style.display = 'none';
        }
    }

    updateLabelContent() {
        this.labelEl.innerHTML = `Gear <b>#${this.id}</b> <br> N=${this.teeth} | RPM: ${Math.abs(this.rpm).toFixed(1)}`;
    }
}

// --- Initialization & UI ---
function initSystem() {
    gears = [];
    nextGearId = 0;
    const g0 = new Gear({ teeth: 24 });
    const g1 = new Gear({ parent: g0, teeth: 16, connectionAngle: 45 });
    gears.push(g0, g1);
    selectGear(g1.id);
    resizeCanvas();
}

function updateKinematics() {
    gears.forEach(g => g.updatePosition());
    updateDiophantineMath();
}

function updateDiophantineMath() {
    const panel = document.getElementById('physics-info-panel');
    const content = document.getElementById('math-content');
    const selected = gears.find(g => g.id === selectedGearId);

    if (!selected || !selected.parent) {
        panel.style.display = 'none';
        return;
    }

    let a = selected.parent.teeth;
    let b = selected.teeth;
    let res = extGCD(a, b);
    let c = res.gcd;

    content.innerHTML = `
        <div class="flex justify-between border-b border-slate-700/50 pb-1">
            <span class="text-slate-400">Parent Teeth (a):</span>
            <span class="text-amber-400">${a}</span>
        </div>
        <div class="flex justify-between border-b border-slate-700/50 pb-1">
            <span class="text-slate-400">Child Teeth (b):</span>
            <span class="text-emerald-400">${b}</span>
        </div>
        <div class="flex justify-between border-b border-slate-700/50 pb-1">
            <span class="text-slate-400">GCD (c):</span>
            <span class="text-blue-300">${c}</span>
        </div>
        <div class="mt-3 text-center bg-slate-800 p-2 rounded">
            <div class="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Equation Formula</div>
            <div class="text-lg tracking-wider">${a}(<span class="text-amber-400">${res.x}</span>) - ${b}(<span class="text-emerald-400">${res.y}</span>) = ${c}</div>
        </div>
        <div class="mt-2 text-xs text-slate-300">
            * The parent must rotate <b>${b/c}</b> times and the child <b>${a/c}</b> times for the exact same teeth to interlock again.
        </div>
    `;
    panel.style.display = 'block';
}

function updateUI() {
    const list = document.getElementById('gear-list');
    list.innerHTML = '';
    
    gears.forEach(g => {
        const item = document.createElement('div');
        item.className = `gear-list-item ${g.id === selectedGearId ? 'selected' : ''}`;
        item.onclick = () => selectGear(g.id);
        item.innerHTML = `Gear #${g.id} <span class="float-right text-xs opacity-70">N=${g.teeth}</span>`;
        list.appendChild(item);
    });

    const selectParent = document.getElementById('input-parent');
    selectParent.innerHTML = '<option value="none">None</option>';
    gears.filter(g => g.id !== selectedGearId).forEach(g => {
        selectParent.add(new Option(`Gear #${g.id}`, g.id));
    });

    syncSidebarValues();
    document.getElementById('input-base-rpm').value = baseRpm;
    updateKinematics();
}

function syncSidebarValues() {
    const selected = gears.find(g => g.id === selectedGearId);
    if (selected) {
        document.getElementById('input-parent').value = selected.parent ? selected.parent.id : "none";
        document.getElementById('input-internal').checked = selected.isInternal;
        document.getElementById('input-teeth').value = selected.teeth;
        
        const angleInput = document.getElementById('input-angle');
        if (document.activeElement !== angleInput) {
            angleInput.value = Math.round(selected.connectionAngle);
        }
        
        const isRoot = !selected.parent;
        document.getElementById('input-angle').disabled = isRoot;
        document.getElementById('input-internal').disabled = isRoot;
    }
}

function selectGear(id) {
    selectedGearId = id;
    updateUI();
}

window.stepValue = function(id, amount) {
    const input = document.getElementById(id);
    if (!input.disabled) {
        input.value = parseFloat(input.value) + amount;
        input.dispatchEvent(new Event('change'));
    }
};

// --- Mouse / Drag Events ---
function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    // Translate mouse coords to match our centered canvas origin
    return {
        x: e.clientX - rect.left - width / 2,
        y: e.clientY - rect.top - height / 2
    };
}

canvas.addEventListener('pointerdown', (e) => {
    const mouse = getMousePos(e);
    
    // Check backwards to grab the gear drawn on top
    for (let i = gears.length - 1; i >= 0; i--) {
        const g = gears[i];
        const dist = Math.hypot(mouse.x - g.x, mouse.y - g.y);
        
        if (dist <= g.pitchRadius) {
            selectGear(g.id);
            isDragging = true;
            dragOffset.x = mouse.x - g.x;
            dragOffset.y = mouse.y - g.y;
            canvas.style.cursor = 'grabbing';
            return;
        }
    }
    isDragging = false;
});

window.addEventListener('pointermove', (e) => {
    const mouse = getMousePos(e);

    if (!isDragging) {
        // Change cursor to pointer if hovering over a gear
        let isHovering = gears.some(g => Math.hypot(mouse.x - g.x, mouse.y - g.y) <= g.pitchRadius);
        canvas.style.cursor = isHovering ? 'grab' : 'default';
        return;
    }

    const selected = gears.find(g => g.id === selectedGearId);
    if (!selected) return;

    if (!selected.parent) {
        // Dragging root gear freely
        selected.manualX = mouse.x - dragOffset.x;
        selected.manualY = mouse.y - dragOffset.y;
    } else {
        // Dragging child gear (orbits around parent)
        const dx = mouse.x - selected.parent.x;
        const dy = mouse.y - selected.parent.y;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360; // Keep angle positive
        selected.connectionAngle = angle;
    }

    updateKinematics();
    syncSidebarValues(); // Update the sidebar without redrawing the whole DOM list
});

window.addEventListener('pointerup', () => {
    if (isDragging) {
        isDragging = false;
        canvas.style.cursor = 'grab';
    }
});

// --- UI Event Listeners ---
document.getElementById('btn-toggle').addEventListener('click', (e) => {
    isPlaying = !isPlaying;
    e.target.classList.toggle('active', isPlaying);
});

document.getElementById('btn-reset').addEventListener('click', () => {
    globalTime = 0;
});

document.getElementById('btn-add').addEventListener('click', () => {
    const parent = gears.find(g => g.id === selectedGearId) || gears[0];
    const newGear = new Gear({ parent: parent, connectionAngle: 90 });
    gears.push(newGear);
    selectGear(newGear.id);
});

document.getElementById('btn-remove').addEventListener('click', () => {
    if (gears.length <= 1) return;
    const removeRecursive = (id) => {
        gears.filter(g => g.parent && g.parent.id === id).forEach(c => removeRecursive(c.id));
        const idx = gears.findIndex(g => g.id === id);
        if (idx > -1) {
            gears[idx].destroy();
            gears.splice(idx, 1);
        }
    };
    removeRecursive(selectedGearId);
    selectGear(gears[0].id);
});

document.getElementById('input-base-rpm').addEventListener('change', (e) => {
    baseRpm = parseFloat(e.target.value) || 0;
    updateUI();
});

['input-parent', 'input-teeth', 'input-angle', 'input-internal'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
        const selected = gears.find(g => g.id === selectedGearId);
        if (!selected) return;

        const parentVal = document.getElementById('input-parent').value;
        selected.parent = parentVal === "none" ? null : gears.find(g => g.id === parseInt(parentVal));
        selected.teeth = Math.max(6, parseInt(document.getElementById('input-teeth').value));
        selected.connectionAngle = parseFloat(document.getElementById('input-angle').value) || 0;
        selected.isInternal = document.getElementById('input-internal').checked;

        updateKinematics();
        updateUI();
    });
});

document.getElementById('toggle-labels').addEventListener('change', (e) => {
    showLabels = e.target.checked;
});

// --- Render Loop ---
function resizeCanvas() {
    const wrapper = document.getElementById('canvas-wrapper');
    width = wrapper.clientWidth;
    height = wrapper.clientHeight;
    canvas.width = width;
    canvas.height = height;
}
window.addEventListener('resize', resizeCanvas);

function animate() {
    requestAnimationFrame(animate);

    const currentTime = performance.now();
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (isPlaying) globalTime += deltaTime / 60; // scale RPM to minutes

    ctx.clearRect(0, 0, width, height);
    
    // Grid background
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let x=0; x<width; x+=40) { ctx.moveTo(x,0); ctx.lineTo(x,height); }
    for(let y=0; y<height; y+=40) { ctx.moveTo(0,y); ctx.lineTo(width,y); }
    ctx.stroke();

    ctx.save();
    ctx.translate(width / 2, height / 2); // Center origin
    
    // Draw all gears
    gears.forEach(g => g.draw(ctx, globalTime));
    
    ctx.restore();
}


initSystem();
animate();