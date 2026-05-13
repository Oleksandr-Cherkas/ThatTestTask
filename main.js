import * as THREE from 'three';

// --- НАЛАШТУВАННЯ СЦЕНИ ---
const scene = new THREE.Scene();

// Камера (Orthographic ідеально підходить для цього ефекту)
const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0, 2000);
camera.position.z = 1000;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- ТЕКСТУРА ЧАСТИНКИ ---
function getParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 32, 32);

    // М'яке світіння
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); 
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)'); 
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    
    return new THREE.CanvasTexture(canvas);
}

const particleTexture = getParticleTexture();
// --- МЕНЕДЖЕР ВІКОН ---
class WindowManager {
    constructor() {
        this.windows = {}; 
        this.id = `win_${Date.now()}_${Math.random()}`;
        this.winChangeCallback = null;

        window.addEventListener('beforeunload', () => {
            const wins = this.getWindows();
            delete wins[this.id];
            localStorage.setItem('windows', JSON.stringify(wins));
        });

        window.addEventListener('storage', () => {
            if (this.winChangeCallback) this.winChangeCallback();
        });
    }

    getWindows() {
        try { return JSON.parse(localStorage.getItem('windows') || '{}'); } 
        catch (e) { return {}; }
    }

    update() {
        const wins = this.getWindows();
        const now = Date.now();
        
        Object.keys(wins).forEach(id => {
            if (now - wins[id].timestamp > 1000 && id !== this.id) {
                delete wins[id];
            }
        });

        wins[this.id] = {
            x: window.screenX,
            y: window.screenY,
            w: window.innerWidth,
            h: window.innerHeight,
            timestamp: now
        };

        localStorage.setItem('windows', JSON.stringify(wins));
        return wins;
    }

    setWinChangeCallback(cb) { this.winChangeCallback = cb; }
}

const winManager = new WindowManager();

// --- СТВОРЕННЯ ОБ'ЄКТІВ ---
const spheres = new Map();
let connectionLine;

function createComplexSphere(shellColor, coreColor) {
    const group = new THREE.Group();

    // Спільний матеріал
    const baseMaterial = new THREE.PointsMaterial({
        map: particleTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });

    // 1. ЯДРО (Core) - маленьке, щільне
    const coreGeo = new THREE.IcosahedronGeometry(40, 4); 
    const coreMat = baseMaterial.clone();
    coreMat.color.setHex(coreColor);
    coreMat.size = 3.0;
    coreMat.opacity = 0.9;
    const core = new THREE.Points(coreGeo, coreMat);
    group.add(core); // index 0

    // 2. СЯЙВО (Glow) - середнє, розріджене
    const glowGeo = new THREE.IcosahedronGeometry(60, 3);
    const glowMat = baseMaterial.clone();
    glowMat.color.setHex(coreColor);
    glowMat.size = 4.0;
    glowMat.opacity = 0.4;
    const glow = new THREE.Points(glowGeo, glowMat);
    group.add(glow); // index 1

    // 3. ОБОЛОНКА (Shell) - велика, формує контур
    const shellGeo = new THREE.IcosahedronGeometry(90, 5); 
    const shellMat = baseMaterial.clone();
    shellMat.color.setHex(shellColor);
    shellMat.size = 1.5;
    shellMat.opacity = 0.6;
    const shell = new THREE.Points(shellGeo, shellMat);
    
    // Зберігаємо початкові координати для оболонки
    const positions = shellGeo.attributes.position;
    const originalPositions = new Float32Array(positions.count * 3);
    for(let i = 0; i < positions.count; i++) {
        originalPositions[i*3] = positions.getX(i);
        originalPositions[i*3+1] = positions.getY(i);
        originalPositions[i*3+2] = positions.getZ(i);
    }
    shell.geometry.userData = { originalPositions: originalPositions };
    
    group.add(shell); // index 2

    return group;
}

function createLine() {
    const material = new THREE.LineBasicMaterial({ 
        color: 0xffffff, 
        linewidth: 2,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending 
    });
    
    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), 
        new THREE.Vector3(0, 0, 0)
    ]);
    
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    return line;
}

function updateScene() {
    const wins = winManager.update();
    const myWin = wins[winManager.id];

    if (!myWin) return;

    const activeIds = Object.keys(wins).sort();
    
    const myCenterX = myWin.x + myWin.w / 2;
    const myCenterY = myWin.y + myWin.h / 2;

    const sphereCenters = [];
    const time = Date.now() * 0.0005;

    // Неонові кольори з репозиторію
    const COLOR_RED = 0xff0050;   
    const COLOR_GREEN = 0x00ff88; 

    // --- ОНОВЛЕННЯ СФЕР ---
    activeIds.forEach(id => {
        const winData = wins[id];
        const index = activeIds.indexOf(id);
        
        // Визначаємо кольори
        let shellColorVal = (index % 2 === 0) ? COLOR_GREEN : COLOR_RED;
        let coreColorVal  = (index % 2 === 0) ? COLOR_RED : COLOR_GREEN;

        // Перевірка: чи існує сфера і чи має вона правильну структуру (3 дітей)
        let group = spheres.get(id);
        
        if (!group || group.children.length !== 3) {
            // Якщо сфера стара або пошкоджена - видаляємо і створюємо нову
            if (group) scene.remove(group);
            group = createComplexSphere(shellColorVal, coreColorVal);
            scene.add(group);
            spheres.set(id, group);
        }

        group.children[0].material.color.setHex(coreColorVal);
        group.children[1].material.color.setHex(coreColorVal);
        group.children[2].material.color.setHex(shellColorVal);
        
        // Позиція
        const otherCenterX = winData.x + winData.w / 2;
        const otherCenterY = winData.y + winData.h / 2;
        const spherePos = new THREE.Vector3(
            otherCenterX - myCenterX,
            -(otherCenterY - myCenterY),
            0
        );
        group.position.copy(spherePos);

        // Анімація обертання
        group.children[0].rotation.y = time;
        group.children[1].rotation.y = time;
        group.children[2].rotation.y = -time * 0.5;
        group.children[2].rotation.x = Math.sin(time * 0.5) * 0.2;

        // Ефект тяжіння
        let centerX = 0, centerY = 0;
        activeIds.forEach(wid => {
            centerX += wins[wid].x + wins[wid].w / 2;
            centerY += wins[wid].y + wins[wid].h / 2;
        });
        centerX /= activeIds.length;
        centerY /= activeIds.length;

        const localCentroid = new THREE.Vector3(centerX - myCenterX, -(centerY - myCenterY), 0);
        group.lookAt(localCentroid);

        const distToCenter = spherePos.distanceTo(localCentroid);
        if (distToCenter < 400 && activeIds.length > 1) {
            const stretch = Math.max(0, 1 - (distToCenter / 400));
            group.scale.z = 1 + stretch * 0.5;
        } else {
            group.scale.set(1, 1, 1);
        }

        sphereCenters.push(group.position.clone());
    });

    // Видалення "мертвих" сфер
    spheres.forEach((mesh, id) => {
        if (!wins[id]) {
            scene.remove(mesh);
            spheres.delete(id);
        }
    });

    // --- ЛІНІЯ ---
    if (!connectionLine) {
        connectionLine = createLine();
        scene.add(connectionLine);
    }

    if (sphereCenters.length >= 2) {
        const pos = connectionLine.geometry.attributes.position.array;
        pos[0] = sphereCenters[0].x; pos[1] = sphereCenters[0].y; pos[2] = 0;
        pos[3] = sphereCenters[1].x; pos[4] = sphereCenters[1].y; pos[5] = 0;
        connectionLine.geometry.attributes.position.needsUpdate = true;
        connectionLine.visible = true;
    } else {
        connectionLine.visible = false;
    }
}

// --- ГОЛОВНИЙ ЦИКЛ ---
function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}
window.addEventListener('resize', resize);
resize();

function animate() {
    requestAnimationFrame(animate);
    updateScene();
    renderer.render(scene, camera);
}
animate();