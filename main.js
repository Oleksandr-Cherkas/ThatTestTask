import * as THREE from 'three';

// --- НАЛАШТУВАННЯ ---
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0, 2000);
camera.position.z = 1000;

// Чорний фон
scene.background = new THREE.Color(0x000000);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- ТЕКСТУРА (Плавна, без білого центру) ---
function getParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 32, 32);

    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    // ЗМІНА: Робимо центр білим, але дуже прозорим.
    // Основний колір буде задаватися в матеріалі.
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
const objects = new Map();
let connectionLine;

function createComplexSphere() {
    const group = new THREE.Group();

    // 1. ЯДРО (Геометричне, чітке)
    const coreGeo = new THREE.IcosahedronGeometry(70, 1);
    const coreMat = new THREE.MeshBasicMaterial({ 
        color: 0xff0044, // Малиновий
        wireframe: true,
        transparent: true,
        opacity: 0.8 // Яскраве ядро
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // 2. ХМАРА ЧАСТИНОК (Випадкова генерація)
    // Замість Icosahedron ми генеруємо точки вручну
    const particleCount = 1500; // Кількість точок
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const color = new THREE.Color();

    for (let i = 0; i < particleCount; i++) {
        // Випадкова точка на сфері (рівномірний розподіл)
        // radius = від 80 до 100 (створює об'ємну оболонку, а не тонку шкірку)
        const radius = 80 + Math.random() * 20; 
        
        // Сферичні координати
        const phi = Math.acos(-1 + (2 * i) / particleCount);
        const theta = Math.sqrt(particleCount * Math.PI) * phi;

        const x = radius * Math.cos(theta) * Math.sin(phi);
        const y = radius * Math.sin(theta) * Math.sin(phi);
        const z = radius * Math.cos(phi);

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        // Колір: Тільки червоні відтінки
        color.setHSL(0.98 + Math.random() * 0.04, 0.9, 0.5); // Червоний
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particlesMat = new THREE.PointsMaterial({
        map: particleTexture,
        size: 5, // Середній розмір
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false // Це важливо! Точки не перекривають одна одну, а "світяться" разом
    });

    const particles = new THREE.Points(geometry, particlesMat);
    group.add(particles);

    return group;
}

function createLine() {
    // Лінія
    const material = new THREE.LineBasicMaterial({ 
        color: 0xff0044, // Червона лінія (під колір сфер)
        linewidth: 2,
        transparent: true,
        opacity: 0.5
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

    activeIds.forEach(id => {
        const winData = wins[id];
        
        if (!objects.has(id)) {
            const group = createComplexSphere();
            scene.add(group);
            objects.set(id, group);
        }

        const group = objects.get(id);

        const otherCenterX = winData.x + winData.w / 2;
        const otherCenterY = winData.y + winData.h / 2;

        const offsetX = otherCenterX - myCenterX;
        const offsetY = otherCenterY - myCenterY;

        if (!isNaN(offsetX) && !isNaN(offsetY)) {
            group.position.set(offsetX, -offsetY, 0);
            
            // Анімація
            const t = Date.now() * 0.001;
            
            // Ядро крутиться чітко
            group.children[0].rotation.y = t;
            group.children[0].rotation.x = t * 0.5;

            // Хмара частинок крутиться повільніше і в інший бік (ефект об'єму)
            group.children[1].rotation.y = -t * 0.2;
            group.children[1].rotation.x = -t * 0.1;
            
            // Легка пульсація
            const scale = 1 + Math.sin(t * 3) * 0.02;
            group.scale.set(scale, scale, scale);

            sphereCenters.push(group.position.clone());
        }
    });

    // Видалення
    objects.forEach((group, id) => {
        if (!wins[id]) {
            scene.remove(group);
            objects.delete(id);
        }
    });

    // Оновлення лінії
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

// --- RESIZE ---
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