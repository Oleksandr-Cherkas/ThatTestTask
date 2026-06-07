import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- СЦЕНА ---
const scene = new THREE.Scene();

const camera = new THREE.OrthographicCamera(0, 0, 0, 0, -2000, 2000);
camera.position.z = 1000;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const PIXEL_RATIO = renderer.getPixelRatio();

// --- BLOOM POST-PROCESSING ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.9,   // strength
    0.7,   // radius
    0.0    // threshold
);
composer.addPass(bloomPass);

// --- ТЕКСТУРА ЧАСТИНКИ (для ядра) ---
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
            if (now - wins[id].timestamp > 1500 && id !== this.id) delete wins[id];
        });
        wins[this.id] = {
            x: window.screenX, y: window.screenY,
            w: window.innerWidth, h: window.innerHeight,
            timestamp: now
        };
        localStorage.setItem('windows', JSON.stringify(wins));
        return wins;
    }
}
const winManager = new WindowManager();

// --- GLSL: 3D simplex noise (Ashima / Stefan Gustavson) ---
const SNOISE_GLSL = `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

// --- ШЕЙДЕР ОБОЛОНКИ (хмара частинок з шумовими "язиками") ---
const shellVertex = `
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
uniform float uRadius;
uniform float uThickness;
uniform float uNoiseFreq;
uniform float uNoiseAmp;
uniform float uTongueAmp;
uniform float uSpeed;
uniform float uSpin;
uniform float uOpacity;
uniform vec3  uReachDir;
uniform float uReachAmount;
uniform float uReachLen;

attribute float aRandom;

varying float vGlow;
varying float vAlpha;

${SNOISE_GLSL}

vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }

void main(){
    vec3 dir = normalize(position);

    // Шумове поле, що повільно обертається і дрейфує — "тканина", що дихає
    vec3 np = rotY(dir, uTime * uSpin);
    float n1 = snoise(np * uNoiseFreq + vec3(0.0, uTime * uSpeed, 0.0));
    float n2 = snoise(np * uNoiseFreq * 2.1 + vec3(uTime * uSpeed * 0.6, 0.0, 0.0)) * 0.5;
    float n = n1 + n2;

    // "Язики полум'я" — м'які виступи лише там, де шум високий
    float tongue = pow(max(n, 0.0), 1.8);
    float disp = uNoiseAmp * n + uTongueAmp * tongue;

    float baseR = uRadius + (aRandom - 0.5) * uThickness;
    vec3 pos = dir * (baseR + disp);

    // Тяжіння до сусідньої сфери (злиття): бік, повернутий до неї, витягується
    float facing = max(dot(dir, uReachDir), 0.0);
    float reach = pow(facing, 3.0) * uReachAmount;
    pos += uReachDir * reach * uReachLen;

    vGlow  = tongue;
    vAlpha = uOpacity * (0.45 + 0.75 * tongue) * (0.65 + 0.7 * aRandom);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.6 + 0.8 * aRandom) * (1.0 + 0.7 * tongue);
}
`;

const shellFragment = `
uniform vec3 uColor;
varying float vGlow;
varying float vAlpha;
void main(){
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    a = pow(a, 1.5);
    vec3 col = uColor * (1.0 + vGlow * 0.9);
    gl_FragColor = vec4(col, a * vAlpha);
}
`;

// --- ГЕОМЕТРІЯ ОБОЛОНКИ: рівномірний розподіл (Фібоначчі) — без сітки ---
function buildShellGeometry(count) {
    const positions = new Float32Array(count * 3);
    const randoms   = new Float32Array(count);
    const golden    = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
        let y = 1 - (i / (count - 1)) * 2;          // [1, -1]
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * i;
        let x = Math.cos(theta) * r;
        let z = Math.sin(theta) * r;

        // Невеликий джиттер, щоб прибрати будь-яку залишкову регулярність
        x += (Math.random() - 0.5) * 0.03;
        y += (Math.random() - 0.5) * 0.03;
        z += (Math.random() - 0.5) * 0.03;

        positions[i * 3]     = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        randoms[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRandom',  new THREE.BufferAttribute(randoms, 1));
    return geo;
}

function makeShellMaterial(color, opts) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime:        { value: 0 },
            uPixelRatio:  { value: PIXEL_RATIO },
            uColor:       { value: new THREE.Color(color) },
            uSize:        { value: opts.size },
            uRadius:      { value: opts.radius },
            uThickness:   { value: opts.thickness },
            uNoiseFreq:   { value: opts.freq },
            uNoiseAmp:    { value: opts.amp },
            uTongueAmp:   { value: opts.tongue },
            uSpeed:       { value: opts.speed },
            uSpin:        { value: opts.spin },
            uOpacity:     { value: opts.opacity },
            uReachDir:    { value: new THREE.Vector3(0, 0, 0) },
            uReachAmount: { value: 0 },
            uReachLen:    { value: opts.reachLen },
        },
        vertexShader: shellVertex,
        fragmentShader: shellFragment,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
    });
}

// --- ВИПАДКОВІ ТОЧКИ ДЛЯ ОБ'ЄМНОГО ЯДРА ---
function randomSphericalPoints(count, radiusMin, radiusMax) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const r     = radiusMin + Math.pow(Math.random(), 0.5) * (radiusMax - radiusMin);
        positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
}

// --- СТВОРЕННЯ ГРУПИ СФЕРИ ---
// children[0] — зовнішня оболонка (shellColor)
// children[1] — внутрішня оболонка (coreColor)
// children[2] — об'ємне ядро Points (coreColor)
function createSphereGroup(shellColor, coreColor) {
    const group = new THREE.Group();

    // Зовнішня оболонка — велика щільна мембрана з м'якими "язиками"
    const outerShell = new THREE.Points(
        buildShellGeometry(26000),
        makeShellMaterial(shellColor, {
            size: 2.2, radius: 102, thickness: 7,
            freq: 1.25, amp: 4, tongue: 36,
            speed: 0.22, spin: 0.05, opacity: 0.42, reachLen: 1.0,
        })
    );
    group.add(outerShell);

    // Внутрішня оболонка — менша, щільніша, обертається в інший бік
    const innerShell = new THREE.Points(
        buildShellGeometry(11000),
        makeShellMaterial(coreColor, {
            size: 2.1, radius: 60, thickness: 6,
            freq: 1.7, amp: 3, tongue: 18,
            speed: 0.30, spin: -0.08, opacity: 0.4, reachLen: 0.55,
        })
    );
    group.add(innerShell);

    // Ядро — м'яка хмара частинок (стримана гаряча серцевина)
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.BufferAttribute(
        randomSphericalPoints(1000, 0, 36), 3
    ));
    const coreMat = new THREE.PointsMaterial({
        map: particleTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        sizeAttenuation: true,
        color: coreColor,
        size: 3.5,
        opacity: 0.5,
    });
    group.add(new THREE.Points(coreGeo, coreMat));

    return group;
}

// --- ДЖГУТ-МІСТ З ЧАСТИНОК (вир, що з'єднує дві сфери) ---
const BRIDGE_COUNT = 4200;

const bridgeVertex = `
uniform vec3  uPosA;
uniform vec3  uDir;
uniform vec3  uPerp1;
uniform vec3  uPerp2;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uLen;
uniform float uMaxR;
uniform float uTime;
uniform float uSwirl;
uniform float uPixelRatio;
uniform float uSize;
uniform float uOpacity;

attribute float aT;
attribute float aAngle;
attribute float aRand;

varying vec3  vColor;
varying float vAlpha;

void main(){
    float t = aT;
    float edge   = sin(3.14159265 * t);              // 0 на кінцях, 1 у центрі
    float spread = uMaxR * (1.0 - edge * 0.80);       // вузька талія, широкі кінці
    float ang    = aAngle + uTime * uSwirl * (0.4 + t * 1.2) + t * 6.0;
    float rr     = spread * sqrt(aRand);

    vec3 pos = uPosA + uDir * (t * uLen)
             + uPerp1 * (cos(ang) * rr)
             + uPerp2 * (sin(ang) * rr);

    vColor = mix(uColorA, uColorB, t);
    float coreBright = 1.0 - (rr / uMaxR);            // яскравіше до осі джгута
    vAlpha = uOpacity * (0.30 + 0.70 * coreBright);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.7 + 0.6 * aRand);
}
`;

const bridgeFragment = `
varying vec3  vColor;
varying float vAlpha;
void main(){
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    a = pow(a, 1.5);
    gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

function createBridgeSystem() {
    const geo = new THREE.BufferGeometry();
    const ts     = new Float32Array(BRIDGE_COUNT);
    const angles = new Float32Array(BRIDGE_COUNT);
    const rands  = new Float32Array(BRIDGE_COUNT);
    // dummy position attribute (потрібен three.js для підрахунку кількості)
    const positions = new Float32Array(BRIDGE_COUNT * 3);

    for (let i = 0; i < BRIDGE_COUNT; i++) {
        ts[i]     = Math.random();
        angles[i] = Math.random() * Math.PI * 2;
        rands[i]  = Math.random();
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aT',     new THREE.BufferAttribute(ts, 1));
    geo.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
    geo.setAttribute('aRand',  new THREE.BufferAttribute(rands, 1));

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uPosA:       { value: new THREE.Vector3() },
            uDir:        { value: new THREE.Vector3(1, 0, 0) },
            uPerp1:      { value: new THREE.Vector3(0, 1, 0) },
            uPerp2:      { value: new THREE.Vector3(0, 0, 1) },
            uColorA:     { value: new THREE.Color(0xffffff) },
            uColorB:     { value: new THREE.Color(0xffffff) },
            uLen:        { value: 0 },
            uMaxR:       { value: 34 },
            uTime:       { value: 0 },
            uSwirl:      { value: 1.6 },
            uPixelRatio: { value: PIXEL_RATIO },
            uSize:       { value: 2.4 },
            uOpacity:    { value: 0.7 },
        },
        vertexShader: bridgeVertex,
        fragmentShader: bridgeFragment,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
}

const _bDir = new THREE.Vector3();
const _bP1  = new THREE.Vector3();
const _bP2  = new THREE.Vector3();

function updateBridge(bridge, posA, posB, colorA, colorB) {
    const u = bridge.material.uniforms;

    _bDir.subVectors(posB, posA);
    const len = _bDir.length();
    if (len < 1e-3) { bridge.visible = false; return; }
    _bDir.normalize();

    if (Math.abs(_bDir.x) < 0.9) _bP1.set(1, 0, 0); else _bP1.set(0, 1, 0);
    _bP1.crossVectors(_bDir, _bP1).normalize();
    _bP2.crossVectors(_bDir, _bP1).normalize();

    u.uPosA.value.copy(posA);
    u.uDir.value.copy(_bDir);
    u.uPerp1.value.copy(_bP1);
    u.uPerp2.value.copy(_bP2);
    u.uLen.value = len;
    u.uColorA.value.setHex(colorA);
    u.uColorB.value.setHex(colorB);
}

// --- СТАН СЦЕНИ ---
const spheres     = new Map();
const COLOR_GREEN = 0x33ff66;
const COLOR_RED   = 0xff1840;

let bridge = createBridgeSystem();
scene.add(bridge);
bridge.visible = false;

const _reach = new THREE.Vector3();

function setReach(group, dirVec, amount, gap) {
    const outer = group.children[0].material.uniforms;
    const inner = group.children[1].material.uniforms;
    outer.uReachDir.value.copy(dirVec);
    inner.uReachDir.value.copy(dirVec);
    outer.uReachAmount.value = amount;
    inner.uReachAmount.value = amount;
    outer.uReachLen.value = gap * 0.45;
    inner.uReachLen.value = gap * 0.28;
}

function clearReach(group) {
    group.children[0].material.uniforms.uReachAmount.value = 0;
    group.children[1].material.uniforms.uReachAmount.value = 0;
}

// --- ОНОВЛЕННЯ СЦЕНИ ---
function updateScene(time) {
    const wins  = winManager.update();
    const myWin = wins[winManager.id];
    if (!myWin) return;

    const activeIds = Object.keys(wins).sort();
    const myCX = myWin.x + myWin.w / 2;
    const myCY = myWin.y + myWin.h / 2;
    const sphereData = [];

    activeIds.forEach((id, index) => {
        const winData    = wins[id];
        const shellColor = (index % 2 === 0) ? COLOR_GREEN : COLOR_RED;
        const coreColor  = (index % 2 === 0) ? COLOR_RED   : COLOR_GREEN;

        let group = spheres.get(id);
        if (!group) {
            group = createSphereGroup(shellColor, coreColor);
            scene.add(group);
            spheres.set(id, group);
        }

        // Оновлення кольорів (на випадок зміни порядку вікон)
        group.children[0].material.uniforms.uColor.value.setHex(shellColor);
        group.children[1].material.uniforms.uColor.value.setHex(coreColor);
        group.children[2].material.color.setHex(coreColor);

        // Час анімації для шейдерів
        group.children[0].material.uniforms.uTime.value = time;
        group.children[1].material.uniforms.uTime.value = time;

        // М'яке обертання ядра
        group.children[2].rotation.y = time * 0.25;
        group.children[2].rotation.x = time * 0.12;

        // Позиція відносно поточного вікна
        const wCX = winData.x + winData.w / 2;
        const wCY = winData.y + winData.h / 2;
        const pos = new THREE.Vector3(wCX - myCX, -(wCY - myCY), 0);
        group.position.copy(pos);
        group.rotation.set(0, 0, 0);
        group.scale.set(1, 1, 1);

        sphereData.push({ group, pos, shellColor });
    });

    // Видалення мертвих сфер
    spheres.forEach((group, id) => {
        if (!wins[id]) { scene.remove(group); spheres.delete(id); }
    });

    // Скидаємо тяжіння для всіх, далі ввімкнемо лише для з'єднаної пари
    sphereData.forEach(s => clearReach(s.group));

    // Міст + злиття між першими двома сферами
    if (sphereData.length >= 2) {
        const a = sphereData[0];
        const b = sphereData[1];
        const gap = a.pos.distanceTo(b.pos);

        // Сила злиття: повна зблизька, згасає на відстані
        const amount = THREE.MathUtils.clamp((620 - gap) / (620 - 240), 0, 1);

        _reach.subVectors(b.pos, a.pos).normalize();
        setReach(a.group, _reach, amount, gap);
        _reach.subVectors(a.pos, b.pos).normalize();
        setReach(b.group, _reach, amount, gap);

        bridge.material.uniforms.uTime.value = time;
        updateBridge(bridge, a.pos, b.pos, a.shellColor, b.shellColor);
        bridge.visible = gap > 1;
    } else {
        bridge.visible = false;
    }
}

// --- RESIZE ---
function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.left = -w / 2; camera.right  =  w / 2;
    camera.top  =  h / 2; camera.bottom = -h / 2;
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
    const time = performance.now() * 0.001;
    updateScene(time);
    composer.render();
}
animate();
