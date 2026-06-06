import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- СЦЕНА ---
const scene = new THREE.Scene();

const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0, 2000);
camera.position.z = 1000;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// --- BLOOM POST-PROCESSING ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.4,   // strength
    0.4,   // radius
    0.05   // threshold
);
composer.addPass(bloomPass);

// --- ТЕКСТУРА ЧАСТИНКИ ---
function getParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0,   'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

const particleTexture = getParticleTexture();

// --- МЕНЕДЖЕР ВІКОН ---
class WindowManager {
    constructor() {
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
            if (now - wins[id].timestamp > 1500 && id !== this.id) {
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
}

const winManager = new WindowManager();

// --- ГЕНЕРАЦІЯ ТОЧОК СФЕРИ (хмарний вигляд) ---
function randomSphericalPoints(count, radiusMin, radiusMax) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        // Більше частинок ближче до поверхні
        const t = Math.pow(Math.random(), 0.5);
        const r = radiusMin + t * (radiusMax - radiusMin);
        positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
}

// --- СТВОРЕННЯ СФЕРИ ---
function createSphereGroup(shellColor, coreColor) {
    const group = new THREE.Group();
    const baseMat = {
        map: particleTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    };

    // ЯДРО — щільне, яскраве
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.BufferAttribute(randomSphericalPoints(600, 0, 35), 3));
    const coreMat = new THREE.PointsMaterial({ ...baseMat, color: coreColor, size: 3.5, opacity: 1.0 });
    group.add(new THREE.Points(coreGeo, coreMat));

    // СЕРЕДНІЙ ШАР
    const midGeo = new THREE.BufferGeometry();
    midGeo.setAttribute('position', new THREE.BufferAttribute(randomSphericalPoints(1200, 25, 70), 3));
    const midMat = new THREE.PointsMaterial({ ...baseMat, color: coreColor, size: 2.5, opacity: 0.5 });
    group.add(new THREE.Points(midGeo, midMat));

    // ОБОЛОНКА — велика, розріджена
    const shellGeo = new THREE.BufferGeometry();
    const shellPositions = randomSphericalPoints(2000, 55, 110);
    shellGeo.setAttribute('position', new THREE.BufferAttribute(shellPositions, 3));
    shellGeo.userData.originalPositions = shellPositions.slice();
    const shellMat = new THREE.PointsMaterial({ ...baseMat, color: shellColor, size: 1.8, opacity: 0.45 });
    group.add(new THREE.Points(shellGeo, shellMat));

    return group;
}

// --- МІСТ З ЧАСТИНОК ---
const BRIDGE_COUNT = 1800;

function createBridgeSystem() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(BRIDGE_COUNT * 3);
    const colors = new Float32Array(BRIDGE_COUNT * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    const mat = new THREE.PointsMaterial({
        map: particleTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        size: 2.2,
        opacity: 0.7,
        vertexColors: true
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
}

function updateBridge(bridge, posA, posB, colorA, colorB) {
    const positions = bridge.geometry.attributes.position.array;
    const colors    = bridge.geometry.attributes.color.array;

    const cA = new THREE.Color(colorA);
    const cB = new THREE.Color(colorB);

    const dir = new THREE.Vector3().subVectors(posB, posA);
    const len = dir.length();
    dir.normalize();

    // Перпендикулярні вектори для розкиду навколо осі
    const perp1 = new THREE.Vector3();
    const perp2 = new THREE.Vector3();
    if (Math.abs(dir.x) < 0.9) perp1.set(1, 0, 0);
    else perp1.set(0, 1, 0);
    perp1.crossVectors(dir, perp1).normalize();
    perp2.crossVectors(dir, perp1).normalize();

    for (let i = 0; i < BRIDGE_COUNT; i++) {
        // t ∈ [0,1] — позиція вздовж мосту
        const t = Math.random();

        // Радіус поперечного розкиду: товщий біля сфер, тонший посередині
        // Форма "гантелі" / "пісочного годинника": sin(π·t)
        const edgeFactor = Math.sin(Math.PI * t);
        const maxRadius = 28;
        const radialSpread = maxRadius * (1.0 - edgeFactor * 0.75) * Math.pow(Math.random(), 0.5);
        const angle = Math.random() * Math.PI * 2;

        const radX = Math.cos(angle) * radialSpread;
        const radY = Math.sin(angle) * radialSpread;

        positions[i * 3]     = posA.x + dir.x * t * len + perp1.x * radX + perp2.x * radY;
        positions[i * 3 + 1] = posA.y + dir.y * t * len + perp1.y * radX + perp2.y * radY;
        positions[i * 3 + 2] = posA.z + dir.z * t * len + perp1.z * radX + perp2.z * radY;

        // Колір: плавний перехід від A до B
        const c = cA.clone().lerp(cB, t);
        colors[i * 3]     = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    bridge.geometry.attributes.position.needsUpdate = true;
    bridge.geometry.attributes.color.needsUpdate    = true;
}

// --- СТАН СЦЕНИ ---
const spheres  = new Map();
const COLOR_GREEN = 0x00ff88;
const COLOR_RED   = 0xff0050;

let bridge = createBridgeSystem();
scene.add(bridge);
bridge.visible = false;

// --- ОНОВЛЕННЯ СЦЕНИ ---
function updateScene() {
    const wins = winManager.update();
    const myWin = wins[winManager.id];
    if (!myWin) return;

    const activeIds = Object.keys(wins).sort();
    const myCX = myWin.x + myWin.w / 2;
    const myCY = myWin.y + myWin.h / 2;

    const time = Date.now() * 0.0005;
    const spherePositions = [];

    // --- СФЕРИ ---
    activeIds.forEach((id, index) => {
        const winData = wins[id];
        const shellColor = (index % 2 === 0) ? COLOR_GREEN : COLOR_RED;
        const coreColor  = (index % 2 === 0) ? COLOR_RED   : COLOR_GREEN;

        let group = spheres.get(id);
        if (!group || group.children.length !== 3) {
            if (group) scene.remove(group);
            group = createSphereGroup(shellColor, coreColor);
            scene.add(group);
            spheres.set(id, group);
        }

        // Оновлення кольорів
        group.children[0].material.color.setHex(coreColor);
        group.children[1].material.color.setHex(coreColor);
        group.children[2].material.color.setHex(shellColor);

        // Позиція в локальному просторі вікна
        const wCX = winData.x + winData.w / 2;
        const wCY = winData.y + winData.h / 2;
        const pos = new THREE.Vector3(wCX - myCX, -(wCY - myCY), 0);
        group.position.copy(pos);

        // Обертання
        group.children[0].rotation.y = time * 1.2;
        group.children[1].rotation.y = time;
        group.children[1].rotation.z = time * 0.3;
        group.children[2].rotation.y = -time * 0.6;
        group.children[2].rotation.x = Math.sin(time * 0.7) * 0.3;

        // Ефект притягання до центру групи вікон
        let cx = 0, cy = 0;
        activeIds.forEach(wid => {
            cx += wins[wid].x + wins[wid].w / 2;
            cy += wins[wid].y + wins[wid].h / 2;
        });
        cx /= activeIds.length;
        cy /= activeIds.length;
        const centroid = new THREE.Vector3(cx - myCX, -(cy - myCY), 0);

        const distToCenter = pos.distanceTo(centroid);
        if (distToCenter < 500 && activeIds.length > 1) {
            group.lookAt(centroid);
            const stretch = Math.max(0, 1 - distToCenter / 500);
            group.scale.z = 1 + stretch * 0.8;
        } else {
            group.rotation.set(0, 0, 0);
            group.scale.set(1, 1, 1);
        }

        spherePositions.push({ pos, shellColor, coreColor });
    });

    // Видалення мертвих сфер
    spheres.forEach((mesh, id) => {
        if (!wins[id]) {
            scene.remove(mesh);
            spheres.delete(id);
        }
    });

    // --- МІСТ ---
    if (spherePositions.length >= 2) {
        const a = spherePositions[0];
        const b = spherePositions[1];
        updateBridge(bridge, a.pos, b.pos, a.shellColor, b.shellColor);
        bridge.visible = true;
    } else {
        bridge.visible = false;
    }
}

// --- RESIZE ---
function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.left   = -w / 2; camera.right  =  w / 2;
    camera.top    =  h / 2; camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
}
window.addEventListener('resize', resize);
resize();

// --- АНІМАЦІЯ ---
function animate() {
    requestAnimationFrame(animate);
    updateScene();
    composer.render();
}
animate();
