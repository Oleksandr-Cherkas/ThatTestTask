import * as THREE from 'three';

// --- НАЛАШТУВАННЯ СЦЕНИ ---
const scene = new THREE.Scene();

// Налаштування камери (OrthographicCamera краще підходить для 2D-ефектів, але Perspective цікавіше для 3D)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- СТВОРЕННЯ ОБ'ЄКТА (СФЕРИ) ---
// Використовуємо Wireframe (сітку), щоб було схоже на відео
const geometry = new THREE.IcosahedronGeometry(2, 4); // Радіус 2, деталізація 4
const material = new THREE.MeshBasicMaterial({ 
    color: 0xff0055, // Червонуватий колір
    wireframe: true  // Режим сітки
});
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// --- ГОЛОВНА МАГІЯ: СИНХРОНІЗАЦІЯ ПОЗИЦІЇ ---

function updateCameraPosition() {
    // 1. Отримуємо розміри монітора (приблизні, бо браузер не завжди дає точні)
    const monitorWidth = window.screen.availWidth;
    const monitorHeight = window.screen.availHeight;

    // 2. Отримуємо позицію вікна на екрані
    const windowX = window.screenX;
    const windowY = window.screenY;

    // 3. Знаходимо центр вікна
    const centerX = windowX + (window.innerWidth / 2);
    const centerY = windowY + (window.innerHeight / 2);

    // 4. Обчислюємо зміщення від центру монітора
    // (0, 0) сцени має бути в центрі монітора
    const worldCenterX = monitorWidth / 2;
    const worldCenterY = monitorHeight / 2;

    // Зміщуємо сферу так, щоб вона завжди була по центру монітора
    // Ми рухаємо сферу ПРОТИЛЕЖНО руху вікна
    sphere.position.x = (worldCenterX - centerX) * 0.01; // 0.01 - коефіцієнт масштабу для сцени
    sphere.position.y = -(worldCenterY - centerY) * 0.01; // Y інвертовано в 3D
}

// --- АНІМАЦІЯ ---
function animate() {
    requestAnimationFrame(animate);

    // Оновлюємо позицію сфери відносно положення вікна
    updateCameraPosition();

    // Додамо трохи обертання самій сфері для краси
    sphere.rotation.x += 0.005;
    sphere.rotation.y += 0.005;

    renderer.render(scene, camera);
}

// --- ОБРОБКА ЗМІНИ РОЗМІРУ ВІКНА ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Запуск
camera.position.z = 5; // Відсуваємо камеру назад, щоб бачити сферу
animate();