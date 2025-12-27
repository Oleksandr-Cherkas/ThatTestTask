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

// --- МЕНЕДЖЕР СТАНУ (LocalStorage) ---
class WindowManager {
    constructor() {
        this.windows = {}; 
        this.id = `win_${Date.now()}_${Math.random()}`;
        this.winChangeCallback = null;

        // 1. Одразу спробуємо почистити старі "завислі" вікна при старті
        this.cleanGhosts();

        // 2. Надійніше видалення при закритті
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

    // Нова функція для видалення старих даних
    cleanGhosts() {
        const wins = this.getWindows();
        const now = Date.now();
        let changed = false;

        Object.keys(wins).forEach(id => {
            // Якщо вікно не оновлювалось більше 500мс (було 1000) - видаляємо
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
        
        // Регулярна очистка
        Object.keys(wins).forEach(id => {
            if (now - wins[id].timestamp > 500 && id !== this.id) {
                delete wins[id];
            }
        });

        // Оновлюємо себе
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

// [ЗМІНЕНО] Функція тепер створює Групу з двох сфер (Ядро + Оболонка)
function createSphere() {
    const group = new THREE.Group();

    // 1. ЯДРО (Лишаємо жорстким, як "серце")
    const coreGeo = new THREE.IcosahedronGeometry(60, 2);
    const coreMat = new THREE.MeshBasicMaterial({ 
        color: 0xff0050, 
        wireframe: true,
        transparent: true,
        opacity: 0.9 
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // 2. ОБОЛОНКА (Готуємо до деформації)
    const shellGeo = new THREE.IcosahedronGeometry(100, 4); // Більше деталізації (4) для плавності хвиль
    const shellMat = new THREE.MeshBasicMaterial({ 
        color: 0xff0050, 
        wireframe: true,
        transparent: true,
        opacity: 0.3 
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    
    // ВАЖЛИВО: Зберігаємо початкові координати точок у пам'ять об'єкта
    // Це потрібно, щоб ми могли накладати хвилі, не ламаючи форму назавжди
    const pos = shellGeo.attributes.position;
    const originalPositions = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        originalPositions[i * 3] = pos.getX(i);
        originalPositions[i * 3 + 1] = pos.getY(i);
        originalPositions[i * 3 + 2] = pos.getZ(i);
    }
    shell.userData.originalPositions = originalPositions; // Ховаємо в "кишеню" об'єкта

    group.add(shell);

    return group;
}

function createLine() {
    // Використовуємо звичайну лінію, але з режимом накладання кольорів
    const material = new THREE.LineBasicMaterial({ 
        color: 0xff0050, // Червоний колір, як у сфер
        linewidth: 1,    
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending // Змушує лінію "світитися"
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

    const myCenterX = myWin.x + myWin.w / 2;
    const myCenterY = myWin.y + myWin.h / 2;

    const activeIds = Object.keys(wins);
    const sphereCenters = [];

    // 1. ОНОВЛЕННЯ СФЕР
    activeIds.forEach(id => {
        const winData = wins[id];
        
        if (!spheres.has(id)) {
            const mesh = createSphere();
            scene.add(mesh);
            spheres.set(id, mesh);
        }

        const group = spheres.get(id); // Тепер це група

        const otherCenterX = winData.x + winData.w / 2;
        const otherCenterY = winData.y + winData.h / 2;

        const offsetX = otherCenterX - myCenterX;
        const offsetY = otherCenterY - myCenterY;

        if (!isNaN(offsetX) && !isNaN(offsetY)) {
            group.position.set(offsetX, -offsetY, 0);
            
            // [ЗМІНЕНО] Обертання
            const t = Date.now() * 0.001;
            
            // Ядро крутиться швидко в один бік
            group.children[0].rotation.y = t;
            group.children[0].rotation.x = t * 0.5;

            // Оболонка крутиться повільно в інший бік (ефект інтерференції)
            group.children[1].rotation.y = -t * 0.5;
            group.children[1].rotation.z = t * 0.2;

            sphereCenters.push(group.position.clone());
        }
    });

    // Видалення старих
    spheres.forEach((mesh, id) => {
        if (!wins[id]) {
            scene.remove(mesh);
            spheres.delete(id);
        }
    });

    // 2. МАЛЮВАННЯ ЛІНІЇ
    if (!connectionLine) {
        connectionLine = createLine();
        scene.add(connectionLine);
    }

    if (sphereCenters.length >= 2) {
        const pos = connectionLine.geometry.attributes.position.array;
        
        pos[0] = sphereCenters[0].x;
        pos[1] = sphereCenters[0].y;
        pos[2] = 0;
        
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