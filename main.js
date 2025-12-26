import * as THREE from 'three';

// --- НАЛАШТУВАННЯ СЦЕНИ ---
const scene = new THREE.Scene();

// Використовуємо OrthographicCamera (Ортогональна камера)
// Вона прибирає перспективні викривлення, що ідеально для цього ефекту.
// Але можна використати і PerspectiveCamera, якщо налаштувати setViewOffset.
// Для початку спробуємо Perspective, але з правильною логікою viewOffset.
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000); 
camera.position.z = 1000; // Відсуваємо камеру далеко

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- СТВОРЕННЯ ОБ'ЄКТА ---
// Робимо радіус більшим, оскільки камера далеко
const geometry = new THREE.IcosahedronGeometry(300, 2); 
const material = new THREE.MeshBasicMaterial({ 
    color: 0xff0055, 
    wireframe: true 
});
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// --- СИНХРОНІЗАЦІЯ ---

function updateCamera() {
    // 1. Отримуємо параметри всього монітора
    const fullWidth = window.screen.width;
    const fullHeight = window.screen.height;

    // 2. Отримуємо параметри поточного вікна
    // Увага: window.screenX/Y включають рамки браузера.
    // Нам потрібні координати саме контенту (canvas).
    // Це складний момент, бо браузери по-різному рахують відступи.
    
    // Спробуємо компенсувати верхню панель браузера:
    const barHeight = window.outerHeight - window.innerHeight;
    
    const x = window.screenX;
    // Додаємо barHeight, якщо вважаємо, що відлік йде від верху вікна браузера, 
    // але іноді краще просто window.screenY, якщо він вказує на контент.
    // Для більшості випадків screenY вказує на верхній лівий кут ВІКНА, а не контенту.
    const y = window.screenY + barHeight; 
    
    const w = window.innerWidth;
    const h = window.innerHeight;

    // 3. МАГІЯ: setViewOffset
    // Ми кажемо камері: "Твоє повне поле зору - це весь екран (fullWidth/Height).
    // Але зараз рендери тільки прямокутник (x, y, w, h)".
    
    camera.setViewOffset(fullWidth, fullHeight, x, y, w, h);
    
    // Аспект камери тепер прив'язаний до повного екрану, а не вікна
    camera.aspect = fullWidth / fullHeight;
    camera.updateProjectionMatrix();
}

function animate() {
    requestAnimationFrame(animate);

    // Обертання за часом (Time based)
    const t = Date.now() * 0.0005;
    sphere.rotation.x = t;
    sphere.rotation.y = t * 0.8;

    updateCamera();
    renderer.render(scene, camera);
}

// --- ОБРОБКА ЗМІНИ РОЗМІРУ ---
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();