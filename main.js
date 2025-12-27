import * as THREE from 'three';

// --- НАЛАШТУВАННЯ ---
const scene = new THREE.Scene();

// Використовуємо OrthographicCamera (як у твоїй базі)
const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0, 1000);
camera.position.z = 100;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
// Функція для створення текстури частинки з більш "гарячим" градієнтом

function getParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 32, 32);

    // Більш "гарячий" градієнт
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); // Яскравий центр
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)'); // Широке світіння
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    
    return new THREE.CanvasTexture(canvas);
}

const particleTexture = getParticleTexture();

// --- МЕНЕДЖЕР СТАНУ (LocalStorage) ---
class WindowManager {
    constructor() {
        this.windows = {}; 
        this.id = `win_${Date.now()}_${Math.random()}`;
        this.winChangeCallback = null;

        // почистити старі "завислі" вікна при старті
        this.cleanGhosts();

        // видалення при закритті
        window.addEventListener('beforeunload', () => {
            const wins = this.getWindows();
            delete wins[this.id];
            localStorage.setItem('windows', JSON.stringify(wins));
        });

        window.addEventListener('storage', (event) => {
            if (event.key === 'windows' && this.winChangeCallback) {
                this.winChangeCallback();
            }
        });
    }

    getWindows() {
        try {
            return JSON.parse(localStorage.getItem('windows') || '{}');
        } catch (e) {
            return {};
        }
    }

    // для видалення старих даних
    cleanGhosts() {
        const wins = this.getWindows();
        const now = Date.now();
        let changed = false;

        Object.keys(wins).forEach(id => {
            // вікно не оновлювалось більше 500мс (було 1000) то видалити
            if (now - wins[id].timestamp > 500) {
                delete wins[id];
                changed = true;
            }
        });

        if (changed) {
            localStorage.setItem('windows', JSON.stringify(wins));
        }
    }

    update() {
        const wins = this.getWindows();
        const now = Date.now();
        
        //  очистка №2
        Object.keys(wins).forEach(id => {
            if (now - wins[id].timestamp > 500 && id !== this.id) {
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

// --- 3D ОБ'ЄКТИ ---
const spheres = new Map();
let connectionLine;

// приймає кольори для оболонки (shellColor) і ядра (coreColor)
function createComplexSphere(shellColor, coreColor) {
    const group = new THREE.Group();

    // 1. ЯДРО (Дуже щільне)
    const coreCount = 4000; // Більше точок у ядрі
    const coreGeo = new THREE.BufferGeometry();
    const corePos = new Float32Array(coreCount * 3);

    for(let i = 0; i < coreCount; i++) {
        // Заповнюємо весь об'єм ядра
        const r = 40 * Math.cbrt(Math.random()); 
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);
        
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        
        corePos[i*3] = x; corePos[i*3+1] = y; corePos[i*3+2] = z;
    }
    coreGeo.setAttribute('position', new THREE.BufferAttribute(corePos, 3));
    
    const coreMat = new THREE.PointsMaterial({
        color: coreColor,
        size: 1.5, // Дрібні, але їх багато
        map: particleTexture,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const core = new THREE.Points(coreGeo, coreMat);
    group.add(core);

    // 2. ОБОЛОНКА (Густа плазма)
    const shellCount = 15000; // <<< ЗБІЛЬШЕНО У 4 РАЗИ
    const shellGeo = new THREE.BufferGeometry();
    const shellPos = new Float32Array(shellCount * 3);
    const originalShellPos = new Float32Array(shellCount * 3);
    const randoms = new Float32Array(shellCount); 

    for(let i = 0; i < shellCount; i++) {
        // ВАЖЛИВО: Товстий шар (від 85 до 115)
        const r = 85 + Math.random() * 30; 
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);
        
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        
        shellPos[i*3] = x; shellPos[i*3+1] = y; shellPos[i*3+2] = z;
        originalShellPos[i*3] = x; originalShellPos[i*3+1] = y; originalShellPos[i*3+2] = z;
        
        randoms[i] = Math.random();
    }
    shellGeo.setAttribute('position', new THREE.BufferAttribute(shellPos, 3));
    
    shellGeo.userData = { 
        originalPositions: originalShellPos,
        randoms: randoms 
    };

    const shellMat = new THREE.PointsMaterial({
        color: shellColor,
        size: 2.0, // Оптимальний розмір для "густоти"
        map: particleTexture,
        transparent: true,
        opacity: 0.5, // Напівпрозорі, щоб нашаровувалися
        blending: THREE.AdditiveBlending, // Це створює світіння при накладанні
        depthWrite: false
    });
    const shell = new THREE.Points(shellGeo, shellMat);
    group.add(shell);

    return group;
}

function createLine() {
    //   лінія
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
    const myIndex = activeIds.indexOf(winManager.id); 

    const myCenterX = myWin.x + myWin.w / 2;
    const myCenterY = myWin.y + myWin.h / 2;

    const sphereCenters = [];
    const time = Date.now() * 0.002; // Швидше (було 0.0015)

    // Ультра-яскраві неонові кольори
    const COLOR_RED = 0xff0033;   
    const COLOR_GREEN = 0x00ff44; 

    activeIds.forEach(id => {
        const winData = wins[id];
        const index = activeIds.indexOf(id);
        
        let shellColorVal = (index % 2 === 0) ? COLOR_GREEN : COLOR_RED;
        let coreColorVal  = (index % 2 === 0) ? COLOR_RED : COLOR_GREEN;

        if (!spheres.has(id)) {
            const mesh = createComplexSphere(shellColorVal, coreColorVal);
            scene.add(mesh);
            spheres.set(id, mesh);
        }

        const group = spheres.get(id);
        
        // Оновлюємо кольори
        group.children[0].material.color.setHex(coreColorVal);
        group.children[1].material.color.setHex(shellColorVal);
        
        const otherCenterX = winData.x + winData.w / 2;
        const otherCenterY = winData.y + winData.h / 2;
        const spherePos = new THREE.Vector3(
            otherCenterX - myCenterX,
            -(otherCenterY - myCenterY),
            0
        );
        group.position.copy(spherePos);

        // --- ТУРБУЛЕНТНІСТЬ ---
        const shell = group.children[1];
        const positions = shell.geometry.attributes.position;
        const userData = shell.geometry.userData;
        const originalPositions = userData.originalPositions;
        const randoms = userData.randoms;

        for (let i = 0; i < positions.count; i++) {
            const ix = i * 3;
            const ox = originalPositions[ix];
            const oy = originalPositions[ix + 1];
            const oz = originalPositions[ix + 2];
            const rnd = randoms[i];

            const v = new THREE.Vector3(ox, oy, oz);

            // Більш агресивний шум для ефекту плазми
            const noise = Math.sin(ox * 0.03 + time) * Math.cos(oy * 0.03 + time) * Math.sin(oz * 0.03 + time);
            
            // "Дихання" товщини оболонки
            const distortion = 1 + (noise * 0.4 * rnd); 
            v.multiplyScalar(distortion);

            // Вихори
            v.x += Math.sin(time * 2 * rnd) * 3;
            v.y += Math.cos(time * 2 * rnd) * 3;

            positions.setXYZ(i, v.x, v.y, v.z);
        }
        positions.needsUpdate = true;

        // --- ТЯЖІННЯ ---
        let centerX = 0, centerY = 0;
        activeIds.forEach(wid => {
            centerX += wins[wid].x + wins[wid].w / 2;
            centerY += wins[wid].y + wins[wid].h / 2;
        });
        centerX /= activeIds.length;
        centerY /= activeIds.length;

        const localCentroid = new THREE.Vector3(centerX - myCenterX, -(centerY - myCenterY), 0);
        const distToCenter = spherePos.distanceTo(localCentroid);
        
        group.lookAt(localCentroid);
        
        if (distToCenter < 500 && activeIds.length > 1) {
            const stretch = Math.max(0, 1 - (distToCenter / 500));
            // Сильніше витягування при зближенні
            group.scale.z = 1 + stretch * 2.5; 
            group.scale.x = 1 - stretch * 0.4;
            group.scale.y = 1 - stretch * 0.4;
        } else {
            group.scale.set(1, 1, 1);
        }

        group.children[0].rotation.z -= 0.05; // Швидке обертання ядра

        sphereCenters.push(group.position.clone());
    });

    spheres.forEach((mesh, id) => {
        if (!wins[id]) {
            scene.remove(mesh);
            spheres.delete(id);
        }
    });

    if (!connectionLine) {
        connectionLine = createLine();
        scene.add(connectionLine);
    }

    if (sphereCenters.length >= 2) {
        const pos = connectionLine.geometry.attributes.position.array;
        pos[0] = sphereCenters[0].x; pos[1] = sphereCenters[0].y; pos[2] = 0;
        pos[3] = sphereCenters[1].x; pos[4] = sphereCenters[1].y; pos[5] = 0;
        connectionLine.geometry.attributes.position.needsUpdate = true;
        connectionLine.material.color.setHex(0xffffff);
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