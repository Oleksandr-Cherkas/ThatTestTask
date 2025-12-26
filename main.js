import * as THREE from 'three';

// --- НАЛАШТУВАННЯ ---
const scene = new THREE.Scene();

// Використовуємо OrthographicCamera
const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0, 1000);
camera.position.z = 100;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- МЕНЕДЖЕР СТАНУ (LocalStorage) ---

class WindowManager {
    constructor() {
        this.windows = {}; 
        this.id = `win_${Date.now()}_${Math.random()}`;
        this.winChangeCallback = null;

        // При закритті - видаляємо себе
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
        try {
            return JSON.parse(localStorage.getItem('windows') || '{}');
        } catch (e) {
            return {};
        }
    }

    update() {
        const wins = this.getWindows();
        const now = Date.now();
        
        // Очищення старих вікон
        Object.keys(wins).forEach(id => {
            if (now - wins[id].timestamp > 1000 && id !== this.id) {
                delete wins[id];
            }
        });

        // Записуємо себе
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

function createSphere() {
    const geometry = new THREE.IcosahedronGeometry(100, 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: true });
    return new THREE.Mesh(geometry, material);
}

function createLine() {
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), 
        new THREE.Vector3(0, 0, 0)
    ]);
    const line = new THREE.Line(geometry, material);
    
    // ВАЖЛИВО: Вимикаємо автоматичний розрахунок меж, щоб уникнути помилки NaN
    line.frustumCulled = false; 
    return line;
}

function updateScene() {
    const wins = winManager.update();
    const myWin = wins[winManager.id];

    // Якщо мої дані ще не записались - чекаємо
    if (!myWin) return;

    const myCenterX = myWin.x + myWin.w / 2;
    const myCenterY = myWin.y + myWin.h / 2;

    const activeIds = Object.keys(wins);
    const sphereCenters = [];

    // 1. ОНОВЛЕННЯ СФЕР
    activeIds.forEach(id => {
        const winData = wins[id];
        
        // Створюємо сферу, якщо немає
        if (!spheres.has(id)) {
            const mesh = createSphere();
            scene.add(mesh);
            spheres.set(id, mesh);
        }

        const sphere = spheres.get(id);

        const otherCenterX = winData.x + winData.w / 2;
        const otherCenterY = winData.y + winData.h / 2;

        const offsetX = otherCenterX - myCenterX;
        const offsetY = otherCenterY - myCenterY;

        // Перевірка на валідність чисел (ЗАПОБІЖНИК)
        if (!isNaN(offsetX) && !isNaN(offsetY)) {
            sphere.position.set(offsetX, -offsetY, 0);
            
            // Обертання
            const t = Date.now() * 0.001;
            sphere.rotation.x = t;
            sphere.rotation.y = t;

            // Додаємо в список центрів тільки якщо це валидна позиція
            sphereCenters.push(sphere.position.clone());
        }
    });

    // Видалення старих сфер
    spheres.forEach((mesh, id) => {
        if (!wins[id]) {
            scene.remove(mesh);
            spheres.delete(id);
        }
    });

    // 2. МАЛЮВАННЯ ЛІНІЇ
    // Створюємо лінію один раз
    if (!connectionLine) {
        connectionLine = createLine();
        scene.add(connectionLine);
    }

    if (sphereCenters.length >= 2) {
        const pos = connectionLine.geometry.attributes.position.array;
        
        // Безпечне оновлення точок
        // Точка А
        pos[0] = sphereCenters[0].x;
        pos[1] = sphereCenters[0].y;
        pos[2] = 0;
        
        // Точка Б
        pos[3] = sphereCenters[1].x;
        pos[4] = sphereCenters[1].y;
        pos[5] = 0;

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