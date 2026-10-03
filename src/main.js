import * as THREE from 'three';

const CONFIG = {
  maxHealth: 100,
  magSize: 30,
  reserveAmmo: 120,
  fireInterval: 0.105,
  reloadTime: 1.35,
  walkSpeed: 7.5,
  sprintSpeed: 12.8,
  backwardSpeed: 6.4,
  slideSpeed: 18.5,
  slideDuration: .72,
  defaultFov: 78,
  sprintFov: 87,
  slideFov: 93,
  jumpSpeed: 7.8,
  gravity: 22,
  mouseSensitivity: 0.0018,
  enemyBaseHealth: 55,
  enemySpeed: 2.7,
  enemyShootRange: 42,
  ragdollGravity: 20,
  ragdollLife: 5.5,
};

const els = {
  hud: document.querySelector('#hud'),
  start: document.querySelector('#start-screen'),
  pause: document.querySelector('#pause-screen'),
  gameOver: document.querySelector('#game-over'),
  startButton: document.querySelector('#start-button'),
  resumeButton: document.querySelector('#resume-button'),
  restartButton: document.querySelector('#restart-button'),
  wave: document.querySelector('#wave'),
  health: document.querySelector('#health'),
  healthFill: document.querySelector('#health-fill'),
  ammo: document.querySelector('#ammo'),
  reserve: document.querySelector('#reserve'),
  reload: document.querySelector('#reload'),
  kills: document.querySelector('#kills'),
  score: document.querySelector('#score'),
  hitmarker: document.querySelector('#hitmarker'),
  finalWave: document.querySelector('#final-wave'),
  finalKills: document.querySelector('#final-kills'),
  finalScore: document.querySelector('#final-score'),
  updateNotice: document.querySelector('#update-notice'),
  updateTitle: document.querySelector('#update-title'),
  updateMessage: document.querySelector('#update-message'),
  updateReload: document.querySelector('#update-reload'),
  updateDismiss: document.querySelector('#update-dismiss'),
  selectedWaveLabel: document.querySelector('#selected-wave-label'),
  mainMenu: document.querySelector('#menu-main'),
  waveMenu: document.querySelector('#wave-menu'),
  optionsMenu: document.querySelector('#options-menu'),
  wavesButton: document.querySelector('#waves-button'),
  optionsButton: document.querySelector('#options-button'),
  backFromWaves: document.querySelector('#back-from-waves'),
  backFromOptions: document.querySelector('#back-from-options'),
  waveChoices: [...document.querySelectorAll('[data-wave-choice]')],
  damageOverlay: document.querySelector('#damage-overlay'),
  combatCallout: document.querySelector('#combat-callout'),
  comboCount: document.querySelector('#combo-count'),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a0e);
scene.fog = new THREE.Fog(0x070a0e, 28, 110);

const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 180);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.display = 'none';

scene.add(new THREE.HemisphereLight(0xaec4d8, 0x11151c, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(24, 35, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const keys = new Set();
const obstacles = [];
const enemies = [];
const tracers = [];
const particles = [];
const ragdolls = [];
const droppedGuns = [];
const shellCasings = [];
const arenaLights = [];

const state = {
  active: false,
  over: false,
  yaw: 0,
  pitch: 0,
  verticalVelocity: 0,
  onGround: true,
  health: CONFIG.maxHealth,
  ammo: CONFIG.magSize,
  reserve: CONFIG.reserveAmmo,
  kills: 0,
  score: 0,
  wave: 1,
  spawnLeft: 0,
  nextWaveTimer: 0,
  fireTimer: 0,
  reloadTimer: 0,
  damageCooldown: 0,
  hurtFlash: 0,
  walkTime: 0,
  weaponKick: 0,
  muzzleFlash: 0,
  shake: 0,
  selectedWave: 1,
  menuTime: 0,
  slideTimer: 0,
  slideCooldown: 0,
  slideQueued: false,
  slideDirection: new THREE.Vector3(),
  combo: 0,
  comboTimer: 0,
};

const player = {
  position: new THREE.Vector3(0, 1.65, 18),
  radius: 0.45,
};

const UPDATE_STORAGE_KEY = 'warfex:lastSeenUpdate';
let pendingUpdate = null;

const DEBUG_MODE = new URLSearchParams(location.search).has('debug');

function showRuntimeError(error, context = 'Runtime error') {
  console.error('[WARFLEX]', context, error);

  if (!DEBUG_MODE) return;

  const existing = document.querySelector('#warfex-debug-error');
  const panel = existing || document.createElement('pre');
  panel.id = 'warfex-debug-error';
  panel.textContent =
    'WARFLEX ERROR\\n\\n' +
    context + '\\n' +
    (error?.stack || error?.message || String(error));
  Object.assign(panel.style, {
    position: 'fixed',
    left: '12px',
    right: '12px',
    bottom: '12px',
    maxHeight: '45vh',
    overflow: 'auto',
    zIndex: '100000',
    margin: '0',
    padding: '12px',
    background: 'rgba(80,0,0,.94)',
    color: '#fff',
    font: '12px/1.45 monospace',
    whiteSpace: 'pre-wrap',
    pointerEvents: 'auto',
  });
  if (!existing) document.body.appendChild(panel);
}

window.addEventListener('error', (event) => {
  showRuntimeError(event.error || event.message, 'Uncaught error');
});

window.addEventListener('unhandledrejection', (event) => {
  showRuntimeError(event.reason, 'Unhandled promise rejection');
});

window.WARFLEX_DEBUG = {
  get state() { return state; },
  get enemies() { return enemies; },
  get ragdolls() { return ragdolls; },
  get droppedGuns() { return droppedGuns; },
  get scene() { return scene; },
  get renderer() { return renderer; },
};

function assertBootIntegrity() {
  const requiredElements = [
    ['start button', els.startButton],
    ['start screen', els.start],
    ['hud', els.hud],
    ['wave menu', els.waveMenu],
    ['options menu', els.optionsMenu],
  ];

  const missing = requiredElements
    .filter(([, element]) => !element)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error('Missing required DOM elements: ' + missing.join(', '));
  }

  if (!renderer || !camera || !scene) {
    throw new Error('Three.js renderer, camera, or scene failed to initialize.');
  }
}

assertBootIntegrity();

function showUpdateNotification(info, live = false) {
  pendingUpdate = info;
  els.updateTitle.textContent = 'UPDATE AVAILABLE';
  els.updateMessage.textContent = info.message || 'A new WARFLEX update is ready. Reload to get the latest version.';
  els.updateNotice.classList.remove('hidden');

  if (live && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('WARFLEX updated', {
        body: info.message || 'A new update is ready to install.',
        tag: 'warfex-update',
      });
    } catch {}
  }
}

async function checkForUpdates(initial = false) {
  try {
    const response = await fetch(`./update.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const info = await response.json();
    if (!info?.version) return;

    const seen = localStorage.getItem(UPDATE_STORAGE_KEY);
    if (!seen) {
      localStorage.setItem(UPDATE_STORAGE_KEY, info.version);
      return;
    }
    if (seen !== info.version) showUpdateNotification(info, !initial);
  } catch {
    // The game still works when the update manifest is temporarily unavailable.
  }
}

function makeBox(size, position, color, cast = true) {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const material = new THREE.MeshStandardMaterial({ color, roughness: .9, metalness: .05 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addArena() {
  const floor = makeBox(new THREE.Vector3(110, 1, 110), new THREE.Vector3(0, -0.5, 0), 0x151a20, false);
  floor.material.roughness = 1;

  const border = [
    [new THREE.Vector3(110, 10, 1), new THREE.Vector3(0, 5, -55)],
    [new THREE.Vector3(110, 10, 1), new THREE.Vector3(0, 5, 55)],
    [new THREE.Vector3(1, 10, 110), new THREE.Vector3(-55, 5, 0)],
    [new THREE.Vector3(1, 10, 110), new THREE.Vector3(55, 5, 0)],
  ];
  for (const [size, position] of border) obstacles.push(makeBox(size, position, 0x10151b));

  const cover = [
    [8, 5, 3, -18, 2.5, -8], [8, 5, 3, 18, 2.5, -8],
    [3, 4, 10, -7, 2, -22], [3, 4, 10, 7, 2, -22],
    [6, 3, 3, 0, 1.5, -7], [6, 4, 3, -24, 2, 17],
    [6, 4, 3, 24, 2, 17], [3, 6, 3, 0, 3, 24],
    [4, 2, 10, -35, 1, 0], [4, 2, 10, 35, 1, -2],
  ];
  for (const [sx, sy, sz, x, y, z] of cover) {
    obstacles.push(makeBox(new THREE.Vector3(sx, sy, sz), new THREE.Vector3(x, y, z), 0x232a33));
  }

  const lightPositions = [[-25, 8, -25], [25, 8, -25], [-25, 8, 25], [25, 8, 25], [0, 10, 0]];
  for (const [x, y, z] of lightPositions) {
    const light = new THREE.PointLight(0xdcecff, 48, 32, 2);
    light.position.set(x, y, z);
    scene.add(light);
    arenaLights.push(light);
  }
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x25313a,
    emissive: 0x273a46,
    emissiveIntensity: 2.2,
    metalness: .6,
    roughness: .35,
  });
  for (const z of [-48, 48]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(86, .08, .18), accentMat);
    strip.position.set(0, .08, z);
    scene.add(strip);
  }
  for (const x of [-48, 48]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(.18, .08, 86), accentMat);
    strip.position.set(x, .08, 0);
    scene.add(strip);
  }
}

addArena();

const arenaGrid = new THREE.GridHelper(108, 54, 0x33404b, 0x1b242d);
arenaGrid.position.y = 0.015;
arenaGrid.material.transparent = true;
arenaGrid.material.opacity = 0.38;
scene.add(arenaGrid);

function createMaterial(color, metalness = .1, roughness = .65) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function createWeapon() {
  const weapon = new THREE.Group();
  weapon.name = 'MK-01_3D_RIFLE';

  const dark = createMaterial(0x11151a, .82, .28);
  const bodyMat = createMaterial(0x303943, .76, .32);
  const bodyDark = createMaterial(0x20262d, .78, .3);
  const metal = createMaterial(0x9da8b2, .72, .25);
  const accent = createMaterial(0xd6dde4, .52, .24);
  const rubber = createMaterial(0x0c1014, .05, .88);
  const polymer = createMaterial(0x242b32, .18, .58);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x071116,
    emissive: 0x2f9abf,
    emissiveIntensity: 2.2,
    metalness: .85,
    roughness: .1,
  });

  const addBox = (size, position, material, rotation = [0,0,0], name = '') => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    weapon.add(mesh);
    return mesh;
  };

  const addCyl = (rt, rb, height, position, material, rotation = [0,0,0], radial = 12, name = '') => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(rt, rb, height, radial, 1),
      material
    );
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    weapon.add(mesh);
    return mesh;
  };

  // Receiver / action.
  addBox([.46, .28, 1.64], [0, 0, -.72], bodyMat, [0,0,0], 'RifleBody');
  addBox([.52, .18, .58], [0, .14, -.02], dark);
  addBox([.38, .11, .48], [0, .24, -.18], bodyDark);
  addBox([.21, .08, .32], [.14, .13, -.12], metal, [0,0,0], 'EjectionPort');
  addBox([.10, .045, .28], [.17, .22, -.12], dark);
  addBox([.07, .035, .24], [-.17, .22, -.16], metal);
  addBox([.055, .055, .22], [.20, -.01, -.16], metal, [0,0,0], 'ChargingHandle');

  // Muzzle, gas system, and handguard.
  addCyl(.056, .062, 1.46, [0, .035, -1.62], metal, [Math.PI/2,0,0], 14, 'Barrel');
  addCyl(.11, .10, .17, [0, .035, -2.35], dark, [Math.PI/2,0,0], 14, 'MuzzleDevice');
  addCyl(.087, .09, .26, [0, .035, -2.18], bodyDark, [Math.PI/2,0,0], 14);
  addBox([.28, .25, .86], [0, .025, -1.05], polymer, [0,0,0], 'Handguard');

  for (let i = -2; i <= 2; i += 1) {
    const z = -1.03 + i * .15;
    addBox([.34, .055, .06], [0, .17, z], dark);
    addBox([.05, .12, .06], [.19, .02, z], dark);
    addBox([.05, .12, .06], [-.19, .02, z], dark);
  }

  // Rail / optic stack.
  addBox([.22, .07, .92], [0, .20, -.42], dark, [0,0,0], 'TopRail');
  addBox([.19, .11, .26], [0, .31, -.30], bodyDark, [0,0,0], 'OpticBase');
  addBox([.14, .10, .20], [0, .40, -.28], glass, [0,0,0], 'OpticGlass');
  addBox([.07, .13, .12], [0, .42, -.48], dark);
  addBox([.06, .11, .10], [0, .42, -.08], dark);
  addCyl(.018, .018, .15, [.12, .34, -.28], accent, [0,0,Math.PI/2], 8);
  addCyl(.018, .018, .15, [-.12, .34, -.28], accent, [0,0,Math.PI/2], 8);

  // Front sight and side hardware.
  addBox([.07, .13, .07], [0, .29, -1.30], dark);
  addBox([.035, .10, .04], [0, .37, -1.30], accent);
  addBox([.05, .08, .42], [.17, .07, -1.23], dark);
  addBox([.05, .08, .42], [-.17, .07, -1.23], dark);

  // Magazine, release, trigger and guard.
  const magazine = addBox([.19, .46, .31], [0, -.28, -.40], bodyDark, [-.18,0,0], 'Magazine');
  addBox([.215, .05, .25], [0, -.52, -.40], rubber, [-.18,0,0]);
  addBox([.07, .30, .05], [.11, -.35, -.40], metal, [-.18,0,0]);
  addBox([.045, .08, .18], [.22, -.17, -.18], metal);
  addCyl(.025, .025, .16, [0, -.16, .02], metal, [0,0,Math.PI/2], 10);
  addBox([.17, .07, .23], [0, -.30, .16], dark, [-.18,0,0], 'TriggerGuard');
  addBox([.10, .24, .16], [0, -.29, .20], rubber, [-.18,0,0], 'Grip');

  // Stock with cheek rest, buttpad and sling points.
  addBox([.36, .23, .64], [0, -.015, .50], rubber, [-.08,0,0], 'Stock');
  addBox([.39, .12, .22], [0, .085, .56], bodyDark, [-.08,0,0]);
  addBox([.40, .19, .08], [0, -.035, .83], dark, [-.08,0,0]);
  addBox([.37, .17, .07], [0, -.13, .83], rubber, [-.08,0,0]);
  addCyl(.028, .028, .11, [.21, .02, .56], metal, [0,Math.PI/2,0], 8);
  addCyl(.028, .028, .11, [-.21, .02, .56], metal, [0,Math.PI/2,0], 8);

  // Angled foregrip / support.
  addBox([.14, .31, .18], [0, -.19, -1.04], rubber, [-.18,0,0], 'Foregrip');
  addBox([.18, .08, .18], [0, -.07, -1.05], dark);

  // Detailed hands wrapped around the weapon.
  const handMat = createMaterial(0x80634f, .03, .9);
  const gloveMat = createMaterial(0x171c21, .04, .84);
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(.125, 14, 10), gloveMat);
  leftHand.scale.set(1.05, .72, 1.35);
  leftHand.position.set(-.27, -.14, -.87);
  leftHand.castShadow = true;
  weapon.add(leftHand);
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(.12, 14, 10), gloveMat);
  rightHand.scale.set(1.0, .75, 1.3);
  rightHand.position.set(.27, -.13, .17);
  rightHand.castShadow = true;
  weapon.add(rightHand);
  addCyl(.055, .055, .16, [-.27, -.15, -.78], handMat, [0,0,Math.PI/2], 10);
  addCyl(.055, .055, .16, [.27, -.15, .10], handMat, [0,0,Math.PI/2], 10);

  // Weapon support arms.
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.name = 'WeaponLeftArm';
  rightArm.name = 'WeaponRightArm';

  const armMat = createMaterial(0xb6bec7, .18, .58);
  const sleeveL = new THREE.Mesh(new THREE.CylinderGeometry(.115, .145, .72, 12), armMat);
  sleeveL.rotation.z = -.35;
  sleeveL.position.set(-.34, -.04, -.50);
  sleeveL.castShadow = true;
  leftArm.add(sleeveL);
  const sleeveR = new THREE.Mesh(new THREE.CylinderGeometry(.115, .145, .72, 12), armMat);
  sleeveR.rotation.z = .35;
  sleeveR.position.set(.34, -.04, -.50);
  sleeveR.castShadow = true;
  rightArm.add(sleeveR);
  weapon.add(leftArm, rightArm);

  // Muzzle flash.
  const flash = new THREE.PointLight(0xffcf6a, 0, 7, 2);
  flash.position.set(0, .04, -2.42);
  weapon.add(flash);
  const flashMesh = new THREE.Mesh(
    new THREE.ConeGeometry(.12, .44, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffdc85,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending
    })
  );
  flashMesh.rotation.x = -Math.PI / 2;
  flashMesh.position.set(0, .04, -2.52);
  weapon.add(flashMesh);

  weapon.userData.flash = flash;
  weapon.userData.flashMesh = flashMesh;
  weapon.userData.muzzle = weapon.getObjectByName('MuzzleDevice');
  weapon.position.set(.43, -.48, -1.03);
  weapon.rotation.set(-.03, -.04, -.015);
  camera.add(weapon);
  scene.add(camera);

  return weapon;
}

const weapon = createWeapon();
weapon.visible = false;

function spawnEnemyModel() {
  const group = new THREE.Group();
  group.name = 'EnemySoldier';

  const armor = createMaterial(0x55616c, .66, .32);
  const armorDark = createMaterial(0x2b333b, .78, .28);
  const armorBlack = createMaterial(0x171d23, .55, .38);
  const cloth = createMaterial(0x14191f, .04, .84);
  const clothMid = createMaterial(0x20272e, .08, .78);
  const rubber = createMaterial(0x090c10, .02, .94);
  const trim = createMaterial(0x77838e, .58, .27);
  const metal = createMaterial(0x9ca8b2, .72, .25);
  const skin = createMaterial(0x9f806b, .04, .88);
  const skinDark = createMaterial(0x6f5344, .03, .94);
  const lens = new THREE.MeshStandardMaterial({
    color: 0x0b141a,
    emissive: 0x174f69,
    emissiveIntensity: 2.0,
    metalness: .7,
    roughness: .12,
  });

  const box = (size, position, material, parent, name = '', rotation = [0,0,0]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  };

  const cyl = (rt, rb, height, position, material, parent, rotation = [0,0,0], radial = 12, name = '') => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, height, radial, 1), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  };

  const sphere = (radius, position, material, parent, scale = [1,1,1], name = '') => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  };

  const capsule = (radius, length, position, material, parent, rotation = [0,0,0], name = '') => {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, length, 6, 12),
      material
    );
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  };

  const torus = (radius, tube, position, material, parent, rotation = [0,0,0], arc = Math.PI * 2, name = '') => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 16, arc), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  };

  const hips = new THREE.Group();
  hips.name = 'RagdollHips';
  hips.position.y = 1.42;
  group.add(hips);

  // Lower torso / tactical belt.
  box([1.08, 1.16, .64], [0, .62, 0], cloth, hips, 'Torso');
  box([1.16, .76, .70], [0, .70, -.04], armorDark, hips, 'PlateCarrier');
  box([.84, .46, .74], [0, .82, -.10], armor, hips, 'ChestPlate');
  sphere(.38, [0, .84, -.24], armor, hips, [1.15, .62, .55]);
  box([.60, .18, .72], [0, 1.12, -.02], trim, hips, 'CollarPlate');
  sphere(.20, [-.50, .86, -.04], armorDark, hips, [1.0, .7, .9]);
  sphere(.20, [.50, .86, -.04], armorDark, hips, [1.0, .7, .9]);

  // Plate carrier segmentation / MOLLE rows.
  for (const x of [-.30, 0, .30]) {
    box([.20, .18, .06], [x, .49, -.405], armorBlack, hips, 'MollePanel');
    box([.20, .18, .14], [x, .43, -.44], rubber, hips, 'ChestPouch');
    box([.16, .06, .05], [x, .54, -.49], trim, hips);
  }
  for (const x of [-.44, -.22, 0, .22, .44]) {
    box([.08, .06, .06], [x, .31, -.40], trim, hips);
  }

  // Shoulder protection.
  sphere(.20, [-.60, 1.08, 0], armor, hips, [1.08, .72, 1.12], 'LeftShoulder');
  sphere(.20, [.60, 1.08, 0], armor, hips, [1.08, .72, 1.12], 'RightShoulder');
  box([.26, .09, .46], [-.63, .89, -.04], armorDark, hips, 'LeftShoulderStrap', [0,0,-.05]);
  box([.26, .09, .46], [.63, .89, -.04], armorDark, hips, 'RightShoulderStrap', [0,0,.05]);

  // Battle belt, holsters and side pouches.
  box([1.02, .18, .70], [0, .22, 0], clothMid, hips, 'BattleBelt');
  box([.22, .26, .18], [-.48, .18, -.40], rubber, hips, 'LeftHipPouch');
  box([.22, .26, .18], [.48, .18, -.40], rubber, hips, 'RightHipPouch');
  box([.18, .30, .22], [-.42, .02, -.35], armorBlack, hips, 'LeftUtilityPouch');
  box([.18, .30, .22], [.42, .02, -.35], armorBlack, hips, 'RightUtilityPouch');
  torus(.08, .018, [-.26, .25, -.38], metal, hips, [Math.PI/2,0,0], Math.PI * 1.55, 'BeltBuckle');

  // Backpack with straps, side cells and radio.
  box([.68, .78, .30], [0, .58, .43], clothMid, hips, 'Backpack');
  box([.50, .28, .20], [0, .72, .60], rubber, hips, 'PackTop');
  box([.10, .56, .08], [-.38, .60, .37], armorBlack, hips, 'PackLeftStrap');
  box([.10, .56, .08], [.38, .60, .37], armorBlack, hips, 'PackRightStrap');
  box([.20, .34, .22], [-.27, .55, .56], cloth, hips, 'PackSideLeft');
  box([.20, .34, .22], [.27, .55, .56], cloth, hips, 'PackSideRight');
  cyl(.018, .027, .76, [.23, 1.16, .50], trim, hips, [0,0,-.12], 8, 'RadioAntenna');
  box([.18, .30, .10], [.28, 1.02, .48], rubber, hips, 'RadioBody');

  // Neck / jaw / head.
  cyl(.16, .18, .22, [0, 1.27, 0], skin, hips, [0,0,0], 12, 'Neck');
  sphere(.39, [0, 1.56, 0], skin, hips, [1, 1.06, .95], 'RagdollHead');
  box([.50, .22, .34], [0, 1.44, -.03], skinDark, hips, 'JawShadow');
  box([.18, .10, .08], [-.13, 1.61, -.36], armorBlack, hips, 'LeftEyeline');
  box([.18, .10, .08], [.13, 1.61, -.36], armorBlack, hips, 'RightEyeline');

  // High-cut helmet, rails, NV mount, straps and visor.
  sphere(.47, [0, 1.79, 0], rubber, hips, [1.05, .66, 1.02], 'CombatHelmet');
  box([.66, .11, .13], [0, 1.72, -.38], armorDark, hips, 'HelmetVisorFrame');
  box([.51, .075, .046], [0, 1.72, -.425], lens, hips, 'HelmetVisor');
  box([.57, .08, .12], [-.33, 1.81, .03], armorBlack, hips, 'HelmetRailLeft');
  box([.57, .08, .12], [.33, 1.81, .03], armorBlack, hips, 'HelmetRailRight');
  box([.18, .13, .12], [0, 1.93, -.07], armorDark, hips, 'NVGMount');
  torus(.10, .018, [0, 1.92, -.11], metal, hips, [Math.PI/2,0,0], Math.PI * 1.45, 'NVGRing');
  box([.12, .18, .12], [-.43, 1.61, -.02], rubber, hips, 'HeadsetLeft');
  box([.12, .18, .12], [.43, 1.61, -.02], rubber, hips, 'HeadsetRight');
  cyl(.018, .018, .25, [.45, 1.48, -.05], metal, hips, [0,0,Math.PI/2], 8, 'HeadsetMic');

  // Arms with articulated elbows, forearm armor, gloves and wrist hardware.
  const leftArm = new THREE.Group();
  leftArm.name = 'RagdollLeftArm';
  leftArm.position.set(-.70, 1.04, 0);
  hips.add(leftArm);
  sphere(.18, [0, .03, 0], armor, leftArm, [1.05, .9, 1.1], 'LeftShoulderCap');
  capsule(.17, .43, [0, -.35, 0], clothMid, leftArm, [0,0,0], 'LeftUpperArm');
  box([.29, .48, .31], [0, -.36, -.06], armorDark, leftArm, 'LeftUpperArmor', [0,0,-.03]);
  sphere(.16, [0, -.34, -.07], armor, leftArm, [1.0, .82, 1.0]);
  const leftElbow = new THREE.Group();
  leftElbow.name = 'RagdollLeftElbow';
  leftElbow.position.set(0, -.68, 0);
  leftArm.add(leftElbow);
  sphere(.15, [0,0,0], armorDark, leftElbow, [1, .95, 1.05], 'LeftElbowPad');
  box([.31, .58, .30], [0, -.32, 0], cloth, leftElbow, 'LeftForearm');
  box([.26, .43, .33], [0, -.34, -.05], armor, leftElbow, 'LeftForearmGuard');
  box([.30, .20, .34], [0, -.68, -.01], rubber, leftElbow, 'LeftGlove');
  for (const x of [-.08, 0, .08]) box([.035, .13, .11], [x, -.78, -.08], clothMid, leftElbow);

  const rightArm = new THREE.Group();
  rightArm.name = 'RagdollRightArm';
  rightArm.position.set(.70, 1.04, 0);
  hips.add(rightArm);
  sphere(.18, [0, .03, 0], armor, rightArm, [1.05, .9, 1.1], 'RightShoulderCap');
  capsule(.17, .43, [0, -.35, 0], clothMid, rightArm, [0,0,0], 'RightUpperArm');
  box([.29, .48, .31], [0, -.36, -.06], armorDark, rightArm, 'RightUpperArmor', [0,0,.03]);
  sphere(.16, [0, -.34, -.07], armor, rightArm, [1.0, .82, 1.0]);
  const rightElbow = new THREE.Group();
  rightElbow.name = 'RagdollRightElbow';
  rightElbow.position.set(0, -.68, 0);
  rightArm.add(rightElbow);
  sphere(.15, [0,0,0], armorDark, rightElbow, [1, .95, 1.05], 'RightElbowPad');
  box([.31, .58, .30], [0, -.32, 0], cloth, rightElbow, 'RightForearm');
  box([.26, .43, .33], [0, -.34, -.05], armor, rightElbow, 'RightForearmGuard');
  box([.30, .20, .34], [0, -.68, -.01], rubber, rightElbow, 'RightGlove');
  for (const x of [-.08, 0, .08]) box([.035, .13, .11], [x, -.78, -.08], clothMid, rightElbow);

  // Visible rifle with more than a silhouette.
  const rifle = new THREE.Group();
  rifle.name = 'Rifle';
  rifle.position.set(.20, .58, -.42);
  rifle.rotation.set(.02, 0, -.08);
  hips.add(rifle);

  box([.20, .22, .94], [0, 0, -.34], armorDark, rifle, 'RifleReceiver');
  box([.15, .17, .65], [0, .03, -.93], rubber, rifle, 'RifleHandguard');
  box([.08, .10, .57], [0, .04, -1.27], metal, rifle, 'RifleBarrel');
  box([.15, .17, .44], [0, -.03, .24], rubber, rifle, 'RifleStock');
  box([.15, .36, .25], [0, -.25, -.38], rubber, rifle, 'RifleMagazine');
  box([.18, .07, .30], [0, .15, -.55], armorDark, rifle, 'RifleRail');
  box([.13, .11, .20], [0, .23, -.55], lens, rifle, 'RifleOptic');
  box([.15, .26, .17], [0, -.22, -.76], rubber, rifle, 'RifleGrip');
  cyl(.05, .06, .16, [0, .04, -1.58], armorBlack, rifle, [Math.PI/2,0,0], 10, 'RifleMuzzle');
  box([.05, .05, .20], [.11, .05, -1.17], metal, rifle);
  box([.05, .05, .20], [-.11, .05, -1.17], metal, rifle);

  // Legs with layered pants, knee shells, shin guards and proper boots.
  const makeLeg = (side, name, kneeName) => {
    const leg = new THREE.Group();
    leg.name = name;
    leg.position.set(side * .29, .08, 0);
    hips.add(leg);
    box([.41, .74, .44], [0, -.38, 0], cloth, leg, side < 0 ? 'LeftThigh' : 'RightThigh');
    box([.35, .48, .44], [0, -.39, -.07], clothMid, leg, side < 0 ? 'LeftThighArmor' : 'RightThighArmor', [0,0,side * .04]);
    box([.46, .12, .48], [0, -.66, -.03], armorDark, leg, side < 0 ? 'LeftKneePad' : 'RightKneePad');
    const knee = new THREE.Group();
    knee.name = kneeName;
    knee.position.set(0, -.76, 0);
    leg.add(knee);
    capsule(.17, .44, [0, -.34, 0], cloth, knee, [0,0,0], side < 0 ? 'LeftShin' : 'RightShin');
    box([.29, .46, .40], [0, -.34, -.08], armor, knee, side < 0 ? 'LeftShinGuard' : 'RightShinGuard');
    sphere(.17, [0, -.35, -.07], armorDark, knee, [1.0, .9, 1.0]);
    box([.44, .26, .68], [0, -.68, -.08], rubber, knee, side < 0 ? 'LeftBoot' : 'RightBoot');
    box([.46, .08, .25], [0, -.78, -.16], armorBlack, knee);
    box([.10, .08, .16], [side * .15, -.79, -.20], metal, knee);
    return { leg, knee };
  };

  const leftLegParts = makeLeg(-1, 'RagdollLeftLeg', 'RagdollLeftKnee');
  const rightLegParts = makeLeg(1, 'RagdollRightLeg', 'RagdollRightKnee');
  const leftLeg = leftLegParts.leg;
  const rightLeg = rightLegParts.leg;
  const leftKnee = leftLegParts.knee;
  const rightKnee = rightLegParts.knee;

  // Keep the upper/lower hierarchy required by the ragdoll solver.
  const lowerBody = new THREE.Group();
  lowerBody.name = 'RagdollLowerBody';
  hips.add(lowerBody);

  const upperBody = new THREE.Group();
  upperBody.name = 'RagdollUpperBody';
  hips.add(upperBody);

  for (const child of [...hips.children]) {
    if (child === lowerBody || child === upperBody) continue;

    const isLower =
      child === leftLeg ||
      child === rightLeg ||
      child.name === 'BattleBelt' ||
      child.name === 'LeftHipPouch' ||
      child.name === 'RightHipPouch' ||
      child.name === 'LeftUtilityPouch' ||
      child.name === 'RightUtilityPouch';

    (isLower ? lowerBody : upperBody).add(child);
  }

  upperBody.userData.isSpine = true;

  group.userData.parts = {
    hips,
    lowerBody,
    upperBody,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    head,
    rifle,
  };
  group.userData.visuals = { armor, lens };
  group.userData.baseScale = .54;
  group.scale.setScalar(group.userData.baseScale);
  return group;
}

function resetGame(spawnImmediately = true) {
  for (const enemy of enemies) scene.remove(enemy.group);
  enemies.length = 0;
  for (const t of tracers) scene.remove(t.mesh);
  tracers.length = 0;
  for (const p of particles) scene.remove(p.mesh);
  particles.length = 0;
  for (const rag of ragdolls) scene.remove(rag.group);
  ragdolls.length = 0;
  for (const gun of droppedGuns) scene.remove(gun.mesh);
  droppedGuns.length = 0;
  for (const shell of shellCasings) scene.remove(shell.mesh);
  shellCasings.length = 0;

  Object.assign(state, {
    active: true, over: false, yaw: 0, pitch: 0, verticalVelocity: 0, onGround: true,
    health: CONFIG.maxHealth, ammo: CONFIG.magSize, reserve: CONFIG.reserveAmmo,
    kills: 0, score: 0, wave: state.selectedWave > 0 ? state.selectedWave : 1, spawnLeft: 0, nextWaveTimer: 0,
    fireTimer: 0, reloadTimer: 0, damageCooldown: 0, hurtFlash: 0, walkTime: 0,
    weaponKick: 0, muzzleFlash: 0, shake: 0,
    slideTimer: 0, slideCooldown: 0, slideQueued: false,
    slideDirection: new THREE.Vector3(),
    combo: 0, comboTimer: 0,
  });
  player.position.set(0, 1.65, 18);
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  camera.fov = CONFIG.defaultFov;
  camera.updateProjectionMatrix();
  weapon.position.set(.43, -.48, -1.03);
  weapon.rotation.set(-.03, -.04, -.015);
  updateHud();
  if (spawnImmediately) spawnWave();
}

function getSpawnPoint(index) {
  // Put the first wave in a clear forward arc so enemies are immediately
  // visible after spawning instead of appearing mostly behind the player.
  const forwardArc = [
    new THREE.Vector3(-12, 0, 1),
    new THREE.Vector3(-6, 0, -7),
    new THREE.Vector3(0, 0, -11),
    new THREE.Vector3(6, 0, -7),
    new THREE.Vector3(12, 0, 1),
    new THREE.Vector3(-17, 0, -14),
    new THREE.Vector3(17, 0, -14),
    new THREE.Vector3(0, 0, -22),
  ];

  const p = forwardArc[index % forwardArc.length].clone();
  if (p.distanceTo(player.position) < 12) p.z -= 8;
  return p;
}

function spawnWave() {
  const count = Math.min(4 + state.wave * 2, 18);
  state.spawnLeft = count;
  state.nextWaveTimer = 0;
  updateHud();

  // Spawn one soldier per frame so START/REDEPLOY never freezes while
  // the higher-detail models and their materials are being constructed.
  let nextIndex = 0;
  const spawnNext = () => {
    if (!state.active || state.over || nextIndex >= count) return;
    spawnEnemy(nextIndex);
    nextIndex += 1;
    updateHud();
    if (nextIndex < count) requestAnimationFrame(spawnNext);
  };

  requestAnimationFrame(spawnNext);
}

function createEnemyFallbackModel() {
  const group = new THREE.Group();
  group.name = 'EnemySoldierFallback';

  const armor = new THREE.MeshStandardMaterial({
    color: 0x687783,
    roughness: .42,
    metalness: .38,
    emissive: 0x0a1015,
    emissiveIntensity: .18,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x20272e,
    roughness: .7,
    metalness: .15,
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0x9a7864, roughness: .92 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0b1c24,
    emissive: 0x217f9d,
    emissiveIntensity: 1.4,
    metalness: .5,
    roughness: .15,
  });

  const hips = new THREE.Group();
  hips.name = 'RagdollHips';
  hips.position.y = 1.42;
  group.add(hips);

  const upperBody = new THREE.Group();
  upperBody.name = 'RagdollUpperBody';
  hips.add(upperBody);

  const lowerBody = new THREE.Group();
  lowerBody.name = 'RagdollLowerBody';
  hips.add(lowerBody);

  const box = (size, pos, mat, parent, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    m.position.set(...pos);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    parent.add(m);
    return m;
  };
  const sphere = (r, pos, mat, parent, name) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
    m.position.set(...pos);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    parent.add(m);
    return m;
  };

  box([1.05, 1.15, .65], [0, .64, 0], dark, upperBody, 'Torso');
  box([.86, .50, .73], [0, .82, -.08], armor, upperBody, 'ChestPlate');
  sphere(.21, [-.60, 1.05, 0], armor, upperBody, 'LeftShoulder');
  sphere(.21, [.60, 1.05, 0], armor, upperBody, 'RightShoulder');
  sphere(.37, [0, 1.55, 0], skin, upperBody, 'RagdollHead');
  sphere(.44, [0, 1.78, 0], dark, upperBody, 'CombatHelmet');
  box([.54, .08, .07], [0, 1.72, -.39], glass, upperBody, 'HelmetVisor');

  const makeArm = (side, armName, elbowName) => {
    const arm = new THREE.Group();
    arm.name = armName;
    arm.position.set(side * .68, 1.02, 0);
    hips.add(arm);
    box([.30, .62, .32], [0, -.33, 0], armor, arm, side < 0 ? 'LeftUpperArm' : 'RightUpperArm');
    const elbow = new THREE.Group();
    elbow.name = elbowName;
    elbow.position.y = -.68;
    arm.add(elbow);
    sphere(.14, [0,0,0], dark, elbow, side < 0 ? 'LeftElbowPad' : 'RightElbowPad');
    box([.28, .58, .30], [0, -.32, 0], armor, elbow, side < 0 ? 'LeftForearm' : 'RightForearm');
    box([.30, .20, .32], [0, -.67, 0], dark, elbow, side < 0 ? 'LeftGlove' : 'RightGlove');
    return arm;
  };

  const leftArm = makeArm(-1, 'RagdollLeftArm', 'RagdollLeftElbow');
  const rightArm = makeArm(1, 'RagdollRightArm', 'RagdollRightElbow');

  const makeLeg = (side, legName, kneeName) => {
    const leg = new THREE.Group();
    leg.name = legName;
    leg.position.set(side * .29, .08, 0);
    hips.add(leg);
    box([.39, .72, .42], [0,-.38,0], dark, leg, side < 0 ? 'LeftThigh' : 'RightThigh');
    box([.43, .14, .45], [0,-.66,-.03], armor, leg, side < 0 ? 'LeftKneePad' : 'RightKneePad');
    const knee = new THREE.Group();
    knee.name = kneeName;
    knee.position.y = -.76;
    leg.add(knee);
    box([.34, .62, .36], [0,-.31,0], armor, knee, side < 0 ? 'LeftShin' : 'RightShin');
    box([.45, .25, .64], [0,-.66,-.08], dark, knee, side < 0 ? 'LeftBoot' : 'RightBoot');
    return leg;
  };

  const leftLeg = makeLeg(-1, 'RagdollLeftLeg', 'RagdollLeftKnee');
  const rightLeg = makeLeg(1, 'RagdollRightLeg', 'RagdollRightKnee');

  const rifle = new THREE.Group();
  rifle.name = 'Rifle';
  rifle.position.set(.18, .55, -.42);
  hips.add(rifle);
  box([.18,.20,.92],[0,0,-.35],dark,rifle,'RifleReceiver');
  box([.12,.12,.72],[0,.02,-.95],armor,rifle,'RifleHandguard');
  box([.07,.07,.60],[0,.03,-1.30],glass,rifle,'RifleBarrel');
  box([.15,.34,.24],[0,-.24,-.38],dark,rifle,'RifleMagazine');

  group.userData.parts = {
    hips, lowerBody, upperBody,
    leftArm, rightArm,
    leftLeg, rightLeg,
    leftKnee: leftLeg.getObjectByName('RagdollLeftKnee'),
    rightKnee: rightLeg.getObjectByName('RagdollRightKnee'),
    head: group.getObjectByName('RagdollHead'),
    rifle,
  };
  group.userData.visuals = { armor, lens: glass };
  group.userData.baseScale = .54;

  group.traverse((o) => {
    if (o.isMesh) {
      o.visible = true;
      o.frustumCulled = false;
    }
  });

  return group;
}

function spawnEnemy(index = 0) {
  let group;
  let usedFallback = false;

  try {
    group = spawnEnemyModel();
    let meshCount = 0;
    group.traverse((o) => { if (o.isMesh) meshCount += 1; });
    if (!meshCount) throw new Error('Enemy model was created without renderable meshes.');
  } catch (error) {
    usedFallback = true;
    showRuntimeError(error, 'Enemy model construction failed; using fallback model');
    group = createEnemyFallbackModel();
  }

  const spawn = getSpawnPoint(index);
  group.position.copy(spawn);
  group.visible = true;
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (o.isMesh) {
      o.visible = true;
      o.frustumCulled = false;
    }
  });

  const roll = Math.random();
  let role = 'rusher';
  if (state.wave >= 2 && roll > .78) role = 'heavy';
  else if (roll > .38) role = 'rifleman';

  const roleStats = {
    rusher: { health: .78, speed: 1.22, damage: 8, cooldown: .72, range: 16 },
    rifleman: { health: 1.00, speed: .92, damage: 7, cooldown: .95, range: 42 },
    heavy: { health: 1.85, speed: .62, damage: 13, cooldown: 1.25, range: 38 },
  }[role];

  const baseHealth = CONFIG.enemyBaseHealth + state.wave * 7;
  const visual = group.userData.visuals;
  if (role === 'heavy') {
    visual.armor.color.setHex(0x6f3439);
    visual.lens.emissive.setHex(0x6b121b);
  } else if (role === 'rusher') {
    visual.armor.color.setHex(0x465867);
  }

  group.userData.role = role;
  group.userData.usedFallback = usedFallback;
  scene.add(group);

  enemies.push({
    group,
    role,
    health: baseHealth * roleStats.health,
    maxHealth: baseHealth * roleStats.health,
    speed: (CONFIG.enemySpeed + Math.min(state.wave * .08, 1.2)) * roleStats.speed,
    damage: roleStats.damage + Math.floor(state.wave * .35),
    attackTimer: .55 + Math.random() * roleStats.cooldown,
    attackCooldown: roleStats.cooldown,
    attackRange: Math.min(CONFIG.enemyShootRange, roleStats.range),
    radius: role === 'heavy' ? .68 : .58,
    baseScale: group.userData.baseScale || .54,
    phase: Math.random() * Math.PI * 2,
    walkTime: Math.random() * Math.PI * 2,
    animTime: Math.random() * Math.PI * 2,
    shootRecoil: 0,
    strafeSign: Math.random() < .5 ? -1 : 1,
    strafeTimer: .5 + Math.random(),
    hurtFlash: 0,
    deathTimer: 0,
    dying: false,
  });
}

function createRagdoll(enemy, impactPoint, direction, headshot = false) {
  enemy.group.updateMatrixWorld(true);

  const model = enemy.group.clone(true);
  model.name = 'ConnectedEnemyRagdoll';
  model.visible = true;
  model.scale.setScalar(enemy.baseScale || enemy.group.userData.baseScale || .54);

  // Rotate around the soldier's hips, not the feet, so the body collapses instead of spinning around its feet.
  const fallPivot = new THREE.Group();
  fallPivot.name = 'RagdollFallPivot';
  fallPivot.position.copy(enemy.group.position);
  fallPivot.position.y += 1.42 * model.scale.x;
  fallPivot.quaternion.copy(enemy.group.quaternion);
  scene.add(fallPivot);

  model.position.set(0, -(1.42 * model.scale.x), 0);
  model.rotation.set(0, 0, 0);
  fallPivot.add(model);
  model.updateMatrixWorld(true);

  const ragParts = {
    hips: model.getObjectByName('RagdollHips'),
    upperBody: model.getObjectByName('RagdollUpperBody'),
    lowerBody: model.getObjectByName('RagdollLowerBody'),
    leftArm: model.getObjectByName('RagdollLeftArm'),
    rightArm: model.getObjectByName('RagdollRightArm'),
    leftLeg: model.getObjectByName('RagdollLeftLeg'),
    rightLeg: model.getObjectByName('RagdollRightLeg'),
    leftKnee: model.getObjectByName('RagdollLeftKnee'),
    rightKnee: model.getObjectByName('RagdollRightKnee'),
    leftElbow: model.getObjectByName('RagdollLeftElbow'),
    rightElbow: model.getObjectByName('RagdollRightElbow'),
    head: model.getObjectByName('RagdollHead'),
    rifle: model.getObjectByName('Rifle'),
  };
  model.userData.ragdollParts = ragParts;

  const impactLocal = impactPoint ? model.worldToLocal(impactPoint.clone()) : new THREE.Vector3(0, .6, 0);
  const impactSide = THREE.MathUtils.clamp(impactLocal.x * 1.2, -.9, .9);
  const impactBack = THREE.MathUtils.clamp(-impactLocal.z * .9, -.8, .8);

  const jointConfigs = [
    ['RagdollLeftArm', 'RagdollLeftElbow', 1.35, 1.05],
    ['RagdollRightArm', 'RagdollRightElbow', 1.35, 1.05],
    ['RagdollLeftLeg', 'RagdollLeftKnee', .95, .78],
    ['RagdollRightLeg', 'RagdollRightKnee', .95, .78],
  ];

  const joints = jointConfigs.map(([upperName, lowerName, upperLimit, lowerLimit]) => {
    const upper = model.getObjectByName(upperName);
    const lower = model.getObjectByName(lowerName);
    const isArm = upperName.includes('Arm');
    return {
      upper,
      lower,
      upperAngle: 0,
      lowerAngle: 0,
      // Strong initial impulse makes limbs visibly fling away from the hit.
      upperVelocity: (Math.random() - .5) * (isArm ? 15 : 9) + impactSide * (isArm ? 3.2 : 1.8),
      lowerVelocity: (Math.random() - .5) * (isArm ? 18 : 12) + impactBack * (isArm ? 2.8 : 2.1),
      upperVelocityZ: (Math.random() - .5) * (isArm ? 11 : 7),
      lowerVelocityZ: (Math.random() - .5) * (isArm ? 13 : 8),
      upperTarget: (Math.random() - .5) * (isArm ? .45 : .32) + impactBack * .16,
      lowerTarget: (Math.random() - .5) * (isArm ? .38 : .28),
      upperTargetZ: (Math.random() - .5) * (isArm ? .5 : .3),
      lowerTargetZ: (Math.random() - .5) * (isArm ? .45 : .28),
      upperLimit,
      lowerLimit,
      damping: isArm ? 1.35 : 1.95,
      targetDecay: isArm ? .58 : .78,
      fling: isArm ? 1.4 : 1.0,
    };
  }).filter(j => j.upper && j.lower);

  const spine = {
    object: ragParts.upperBody,
    angleX: 0,
    angleZ: 0,
    velocityX: -impactBack * .7 + (Math.random() - .5) * 2.2,
    velocityZ: impactSide * .6 + (Math.random() - .5) * 1.8,
    targetX: THREE.MathUtils.clamp(-impactBack * .22, -.55, .55),
    targetZ: THREE.MathUtils.clamp(impactSide * .18, -.45, .45),
  };

  const lowerBody = {
    object: ragParts.lowerBody,
    angleX: 0,
    angleZ: 0,
    velocityX: (Math.random() - .5) * 1.5,
    velocityZ: (Math.random() - .5) * 1.2,
  };

  const neck = {
    object: ragParts.head,
    angleX: 0,
    angleY: 0,
    velocityX: (Math.random() - .5) * 5.5 - impactBack * .55,
    velocityY: (Math.random() - .5) * 6 + impactSide * .55,
  };

  const kick = headshot ? 5.4 : 3.8;
  const rootVelocity = direction
    ? direction.clone().multiplyScalar(kick)
    : new THREE.Vector3();
  rootVelocity.y = headshot ? 3.8 : 2.35;

  const side = direction
    ? new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar((Math.random() - .5) * 2.8)
    : new THREE.Vector3();

  // Detach a real dropped rifle from the dead soldier.
  const droppedRifle = ragParts.rifle;
  let droppedGun = null;
  if (droppedRifle) {
    scene.attach(droppedRifle);
    droppedRifle.visible = true;
    const gunVelocity = direction
      ? direction.clone().multiplyScalar(2.4 + Math.random() * 1.8)
      : new THREE.Vector3();
    gunVelocity.y = 2.2 + Math.random() * 1.8;
    gunVelocity.x += (Math.random() - .5) * 2.2;
    gunVelocity.z += (Math.random() - .5) * 2.2;

    const gunSpin = new THREE.Vector3(
      (Math.random() - .5) * 16,
      (Math.random() - .5) * 18,
      (Math.random() - .5) * 16
    );

    droppedGun = {
      mesh: droppedRifle,
      velocity: gunVelocity,
      angularVelocity: gunSpin,
      bounds: new THREE.Box3(),
      life: 9 + Math.random() * 3,
    };
    droppedGuns.push(droppedGun);
  }

  ragdolls.push({
    group: fallPivot,
    model,
    velocity: rootVelocity.add(side),
    angularVelocity: new THREE.Vector3(
      (Math.random() - .5) * (headshot ? 5.8 : 4.8),
      (Math.random() - .5) * 9,
      (Math.random() - .5) * (headshot ? 5.2 : 4.2)
    ),
    joints,
    spine,
    lowerBody,
    neck,
    bounds: new THREE.Box3(),
    meshes: [],
    age: 0,
    grounded: false,
    groundTime: 0,
    groundContact: 0,
    // Kept only as metadata for debugging; permanent ragdolls are never removed by age.
    life: Infinity,
  });

  const rag = ragdolls[ragdolls.length - 1];
  if (rag) {
    rag.model.traverse(o => {
      if (o.isMesh) rag.meshes.push(o);
    });
  }

  scene.remove(enemy.group);
}

function removeEnemy(enemy, headshot = false, hitPoint = null, direction = null) {
  if (enemy.dying) return;
  enemy.dying = true;
  state.kills += 1;
  state.score += headshot ? 150 : 100;
  state.spawnLeft -= 1;
  state.shake = Math.max(state.shake, headshot ? .12 : .075);
  spawnBurst(
    hitPoint || enemy.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
    headshot ? 0xffe6a2 : 0xff5b66,
    headshot ? 18 : 12
  );
  state.combo += 1;
  state.comboTimer = 2.6;
  state.score += Math.min(state.combo, 10) * 15;
  createRagdoll(enemy, hitPoint, direction, headshot);
  const index = enemies.indexOf(enemy);
  if (index !== -1) enemies.splice(index, 1);
  updateHud();
}

function spawnBurst(position, color, count = 12) {
  for (let i = 0; i < count; i += 1) {
    const size = .04 + Math.random() * .08;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .95 })
    );
    mesh.position.copy(position).add(new THREE.Vector3(
      (Math.random()-.5) * .18,
      (Math.random()-.5) * .18,
      (Math.random()-.5) * .18
    ));
    scene.add(mesh);
    const vel = new THREE.Vector3(
      (Math.random()-.5) * 8,
      Math.random() * 7 + 1,
      (Math.random()-.5) * 8
    );
    particles.push({ mesh, vel, life: .25 + Math.random() * .6 });
  }
}
function spawnMuzzleVfx() {
  const muzzleWorld = new THREE.Vector3();
  weapon.userData.muzzle.getWorldPosition(muzzleWorld);
  spawnBurst(muzzleWorld, 0xffd36b, 7);

  for (let i = 0; i < 2; i += 1) {
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(.025, .025, .16, 8),
      createMaterial(0xb8a06b, .7, .32)
    );
    shell.position.copy(muzzleWorld).add(new THREE.Vector3(.08 + Math.random()*.06, .02, .02));
    shell.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
    scene.add(shell);
    shellCasings.push({
      mesh: shell,
      velocity: new THREE.Vector3(.9 + Math.random(), 1.3 + Math.random()*1.5, (Math.random()-.5)*1.2),
      angularVelocity: new THREE.Vector3((Math.random()-.5)*18, (Math.random()-.5)*18, (Math.random()-.5)*18),
      life: 2.4,
    });
  }
  state.shake = Math.max(state.shake, .055);
}

function addTracer(from, to, color = 0xfff0c8, life = .055) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(.018, .018, len, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9 })
  );
  mesh.position.copy(from).addScaledVector(dir, .5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  scene.add(mesh);
  tracers.push({ mesh, life });
}

function playerCollides(next) {
  for (const wall of obstacles) {
    const p = wall.geometry.parameters;
    const hx = (p.width ?? 1) / 2 + player.radius;
    const hz = (p.depth ?? 1) / 2 + player.radius;
    if (Math.abs(next.x - wall.position.x) < hx &&
        Math.abs(next.z - wall.position.z) < hz &&
        next.y < wall.position.y + (p.height ?? 1) / 2 + 0.8) return true;
  }
  return false;
}

function movePlayer(dt) {
  const inputForward = keys.has('KeyW');
  const inputBack = keys.has('KeyS');
  const inputLeft = keys.has('KeyA');
  const inputRight = keys.has('KeyD');
  const rawX = Number(inputRight) - Number(inputLeft);
  const rawZ = Number(inputBack) - Number(inputForward);
  const input = new THREE.Vector2(rawX, rawZ);
  const moving = input.lengthSq() > 0;
  if (moving) input.normalize();

  const sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && moving;
  const lookForward = new THREE.Vector3();
  camera.getWorldDirection(lookForward);
  lookForward.y = 0;
  if (lookForward.lengthSq() < 0.0001) lookForward.set(0, 0, -1);
  lookForward.normalize();
  const right = new THREE.Vector3(-lookForward.z, 0, lookForward.x);

  state.slideCooldown = Math.max(0, state.slideCooldown - dt);

  if (
    state.slideQueued &&
    state.slideTimer <= 0 &&
    state.slideCooldown <= 0 &&
    state.onGround &&
    sprinting
  ) {
    const slideVector = new THREE.Vector3()
      .addScaledVector(right, input.x)
      .addScaledVector(lookForward, -input.y);
    if (slideVector.lengthSq() > .001) {
      state.slideDirection.copy(slideVector.normalize());
      state.slideTimer = CONFIG.slideDuration;
      state.slideCooldown = .35;
    }
    state.slideQueued = false;
  }

  if (state.slideTimer > 0) {
    state.slideTimer = Math.max(0, state.slideTimer - dt);
    const slideNext = player.position.clone().addScaledVector(state.slideDirection, CONFIG.slideSpeed * dt);
    if (!playerCollides(new THREE.Vector3(slideNext.x, 1.65, player.position.z))) player.position.x = slideNext.x;
    if (!playerCollides(new THREE.Vector3(player.position.x, 1.65, slideNext.z))) player.position.z = slideNext.z;

    if (keys.has('Space')) {
      state.slideTimer = 0;
      state.verticalVelocity = CONFIG.jumpSpeed * .98;
      state.onGround = false;
      keys.delete('Space');
    }
  } else {
    const forwardSpeed = sprinting ? CONFIG.sprintSpeed : CONFIG.walkSpeed;
    const speed = input.y > 0 ? CONFIG.backwardSpeed : forwardSpeed;
    const velocity = new THREE.Vector3()
      .addScaledVector(right, input.x * speed)
      .addScaledVector(lookForward, -input.y * speed);
    const next = player.position.clone().addScaledVector(velocity, dt);
    if (!playerCollides(new THREE.Vector3(next.x, player.position.y, player.position.z))) player.position.x = next.x;
    if (!playerCollides(new THREE.Vector3(player.position.x, player.position.y, next.z))) player.position.z = next.z;
  }

  if (keys.has('Space') && state.onGround && state.slideTimer <= 0) {
    state.verticalVelocity = CONFIG.jumpSpeed;
    state.onGround = false;
    keys.delete('Space');
  }

  state.verticalVelocity -= CONFIG.gravity * dt;
  player.position.y += state.verticalVelocity * dt;
  if (player.position.y <= 1.65) {
    player.position.y = 1.65;
    state.verticalVelocity = 0;
    state.onGround = true;
  }

  if (moving) state.walkTime += dt * (sprinting ? 15 : 9);
  const moveBob = state.slideTimer > 0
    ? -.34
    : (moving && state.onGround ? Math.sin(state.walkTime) * (sprinting ? .05 : .03) : 0);

  camera.position.copy(player.position);
  camera.position.y += moveBob;
  camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');

  const targetFov = state.slideTimer > 0
    ? CONFIG.slideFov
    : sprinting ? CONFIG.sprintFov : CONFIG.defaultFov;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-10 * dt));
  camera.updateProjectionMatrix();
}

function shoot() {
  if (!state.active || state.over || state.reloadTimer > 0 || state.fireTimer > 0) return;
  if (state.ammo <= 0) {
    reload();
    return;
  }

  state.ammo -= 1;
  state.fireTimer = CONFIG.fireInterval;
  state.weaponKick = 1;
  state.muzzleFlash = .075;
  spawnMuzzleVfx();

  const origin = camera.position.clone();
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  raycaster.set(origin, direction);

  const allEnemyMeshes = [];
  for (const enemy of enemies) {
    if (!enemy.dying) enemy.group.traverse(o => { if (o.isMesh) allEnemyMeshes.push(o); });
  }

  const wallHits = raycaster.intersectObjects(obstacles, false);
  const enemyHits = raycaster.intersectObjects(allEnemyMeshes, false);
  const ragdollMeshes = [];
  for (const rag of ragdolls) ragdollMeshes.push(...rag.meshes);
  const ragdollHits = raycaster.intersectObjects(ragdollMeshes, false);

  let hitPoint = origin.clone().addScaledVector(direction, 90);
  const wallDistance = wallHits[0]?.distance ?? Infinity;
  const enemyHit = enemyHits.find(hit => hit.distance < wallDistance);
  const ragdollHit = ragdollHits.find(hit => hit.distance < wallDistance);
  const closestEnemyDistance = enemyHit?.distance ?? Infinity;
  const closestRagdollDistance = ragdollHit?.distance ?? Infinity;

  if (closestEnemyDistance <= closestRagdollDistance && enemyHit) {
    const enemy = enemies.find(e => {
      let found = false;
      e.group.traverse(o => { if (o === enemyHit.object) found = true; });
      return found;
    });

    if (enemy) {
      const parts = enemy.group.userData.parts;
      const headshot = enemyHit.object === parts.head;
      enemy.health -= headshot ? 70 : 34;
      enemy.hurtFlash = .08;
      hitPoint = enemyHit.point;
      spawnBurst(hitPoint, headshot ? 0xff8b93 : 0xcbd6df, headshot ? 14 : 8);
      state.score += headshot ? 25 : 10;
      showHitmarker(headshot);
      if (enemy.health <= 0) removeEnemy(enemy, headshot, hitPoint, direction);
    }
  } else if (ragdollHit) {
    const rag = ragdolls.find(r => {
      let found = false;
      r.model.traverse(o => { if (o === ragdollHit.object) found = true; });
      return found;
    });

    if (rag) {
      hitPoint = ragdollHit.point;
      applyRagdollHit(rag, hitPoint, direction, ragdollHit.object);
      spawnBurst(hitPoint, 0xcbd6df, 7);
      showHitmarker(false);
    }
  } else if (wallHits[0]) {
    hitPoint = wallHits[0].point;
    spawnBurst(hitPoint.clone(), 0xb8c3cc);
  }

  addTracer(origin.clone().add(direction.clone().multiplyScalar(.8)), hitPoint);
  updateHud();
}

function getRagdollHitPart(hitObject) {
  let node = hitObject;
  while (node) {
    if (node.name === 'RagdollHead') return 'head';
    if (node.name === 'RagdollLeftArm') return 'leftArm';
    if (node.name === 'RagdollRightArm') return 'rightArm';
    if (node.name === 'RagdollLeftLeg') return 'leftLeg';
    if (node.name === 'RagdollRightLeg') return 'rightLeg';
    if (node.name === 'RagdollUpperBody') return 'upperBody';
    if (node.name === 'RagdollLowerBody') return 'lowerBody';

    if (
      node.name === 'CombatHelmet' ||
      node.name === 'HelmetVisor' ||
      node.name === 'HelmetVisorFrame' ||
      node.name === 'HeadsetLeft' ||
      node.name === 'HeadsetRight'
    ) return 'head';

    node = node.parent;
  }

  return 'body';
}

function applyRagdollHit(rag, hitPoint, direction, hitObject) {
  if (!rag || !rag.model) return;

  const localImpact = rag.model.worldToLocal(hitPoint.clone());
  const hitPart = getRagdollHitPart(hitObject);
  const sideImpulse = THREE.MathUtils.clamp(localImpact.x * 1.5, -1.6, 1.6);
  const verticalImpact = THREE.MathUtils.clamp(localImpact.y, -.7, 1.9);

  const force =
    hitPart === 'head' ? 4.0 :
    hitPart === 'leftArm' || hitPart === 'rightArm' ? 2.9 :
    hitPart === 'leftLeg' || hitPart === 'rightLeg' ? 2.7 :
    3.2;

  // Treat a body shot like a real impulse at the point of impact:
  // linear kick + torque from the offset between the hip center and hit point.
  rag.velocity.addScaledVector(direction, force);
  rag.velocity.y += hitPart === 'head' ? 1.7 : .6;

  const bodyCenter = rag.group.getWorldPosition(new THREE.Vector3());
  const impactOffset = hitPoint.clone().sub(bodyCenter);
  const impulse = direction.clone().multiplyScalar(force);
  const torque = impactOffset.cross(impulse);

  rag.angularVelocity.addScaledVector(torque, .75);
  rag.angularVelocity.x += (Math.random() - .5) * 1.8 + verticalImpact * .7;
  rag.angularVelocity.y += sideImpulse * 1.8 + (Math.random() - .5) * 1.8;
  rag.angularVelocity.z += (Math.random() - .5) * 1.8 - sideImpulse * .8;

  const limbBoost = hitPart === 'head' ? 5 : hitPart.includes('Arm') ? 11 : hitPart.includes('Leg') ? 9 : 6;

  for (const joint of rag.joints) {
    const isTarget =
      hitPart === 'leftArm' ? joint.upper.name === 'RagdollLeftArm' :
      hitPart === 'rightArm' ? joint.upper.name === 'RagdollRightArm' :
      hitPart === 'leftLeg' ? joint.upper.name === 'RagdollLeftLeg' :
      hitPart === 'rightLeg' ? joint.upper.name === 'RagdollRightLeg' :
      false;

    const boost = isTarget ? limbBoost * 1.8 : limbBoost * .45;

    joint.upperVelocity += (Math.random() - .5) * boost + sideImpulse * (isTarget ? 2.8 : .7);
    joint.lowerVelocity += (Math.random() - .5) * (boost + 3) + direction.y * (isTarget ? 5 : 1.8);
    joint.upperVelocityZ += (Math.random() - .5) * boost * .75 - sideImpulse * (isTarget ? 2.2 : .6);
    joint.lowerVelocityZ += (Math.random() - .5) * boost * .85 + sideImpulse * (isTarget ? 1.8 : .5);

    joint.upperTarget += (Math.random() - .5) * (isTarget ? .42 : .16);
    joint.lowerTarget += (Math.random() - .5) * (isTarget ? .48 : .18);
    joint.upperTargetZ += (Math.random() - .5) * (isTarget ? .34 : .12);
    joint.lowerTargetZ += (Math.random() - .5) * (isTarget ? .38 : .14);
  }

  rag.spine.velocityX += (Math.random() - .5) * 3.2 - direction.y * .8;
  rag.spine.velocityZ += sideImpulse * 1.8;
  rag.neck.velocityX += (Math.random() - .5) * 5.5;
  rag.neck.velocityY += sideImpulse * 2.8;

  // A dead body can always be kicked again; shots wake the sleeping solver.
  rag.grounded = false;
  rag.groundTime = 0;
  rag.groundContact = 0;
}
 
function reload() {
  if (state.reloadTimer > 0 || state.ammo >= CONFIG.magSize || state.reserve <= 0 || state.over) return;
  state.reloadTimer = CONFIG.reloadTime;
  els.reload.classList.remove('hidden');
}

function finishReload() {
  const needed = CONFIG.magSize - state.ammo;
  const take = Math.min(needed, state.reserve);
  state.ammo += take;
  state.reserve -= take;
  state.reloadTimer = 0;
  els.reload.classList.add('hidden');
  updateHud();
}

function showHitmarker(headshot) {
  els.hitmarker.textContent = headshot ? '✦' : '✕';
  els.hitmarker.classList.add('show');
  clearTimeout(showHitmarker.timer);
  showHitmarker.timer = setTimeout(() => els.hitmarker.classList.remove('show'), 80);
}

function damagePlayer(amount) {
  if (state.damageCooldown > 0 || state.over) return;
  state.damageCooldown = .22;
  state.health = Math.max(0, state.health - amount);
  state.hurtFlash = .18;
  state.shake = Math.max(state.shake, .13);
  updateHud();
  if (state.health <= 0) endGame();
}

function enemyHasLineOfSight(enemy) {
  const origin = enemy.group.localToWorld(new THREE.Vector3(.16, 1.05, -.70));
  const target = camera.position.clone();
  const direction = new THREE.Vector3().subVectors(target, origin);
  const distance = direction.length();
  if (distance <= 0.01) return { origin, target, clear: true };
  direction.normalize();
  raycaster.set(origin, direction);
  const wallHit = raycaster.intersectObjects(obstacles, false)[0];
  return { origin, target, clear: !wallHit || wallHit.distance > distance };
}

function enemyShoot(enemy) {
  const sight = enemyHasLineOfSight(enemy);
  if (!sight.clear) return false;

  enemy.attackTimer = enemy.attackCooldown * (.75 + Math.random() * .5);
  enemy.shootRecoil = 1;

  const direction = new THREE.Vector3().subVectors(sight.target, sight.origin).normalize();
  const accuracy = enemy.role === 'heavy' ? .80 : .68;
  const spread = enemy.role === 'heavy' ? .018 : .035;

  // Every soldier has a real chance to miss instead of laser-locking the player.
  if (Math.random() > accuracy) {
    direction.x += (Math.random() - .5) * .22;
    direction.y += (Math.random() - .5) * .16;
    direction.z += (Math.random() - .5) * .22;
  } else {
    direction.x += (Math.random() - .5) * spread;
    direction.y += (Math.random() - .5) * spread;
    direction.z += (Math.random() - .5) * spread;
  }
  direction.normalize();

  const shotEnd = sight.origin.clone().addScaledVector(direction, CONFIG.enemyShootRange);
  raycaster.set(sight.origin, direction);
  const wall = raycaster.intersectObjects(obstacles, false)[0];
  if (wall && wall.distance < CONFIG.enemyShootRange) shotEnd.copy(wall.point);

  if (shotEnd.distanceTo(sight.target) < 1.1 && sight.clear) {
    damagePlayer(enemy.damage);
  }

  spawnBurst(sight.origin, enemy.role === 'heavy' ? 0xffb052 : 0xff5666, enemy.role === 'heavy' ? 5 : 3);
  addTracer(sight.origin, shotEnd, enemy.role === 'heavy' ? 0xffb052 : 0xff5666, .065);
  return true;
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    enemy.attackTimer -= dt;
    enemy.hurtFlash = Math.max(0, enemy.hurtFlash - dt);
    enemy.strafeTimer -= dt;

    const toPlayer = new THREE.Vector3().subVectors(player.position, enemy.group.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    if (enemy.role === 'rusher') {
      if (dist > 2.25) {
        toPlayer.normalize();
        enemy.group.position.addScaledVector(toPlayer, enemy.speed * dt);
      }
      if (dist < 2.65 && enemy.attackTimer <= 0) {
        enemy.attackTimer = enemy.attackCooldown;
        damagePlayer(enemy.damage + 2);
      }
    } else {
      let desired = toPlayer.clone();
      if (enemy.role === 'rifleman') {
        if (dist < 15) desired.multiplyScalar(-1);
        else if (dist > 28) desired.multiplyScalar(1);
        else desired.set(0, 0, 0);
      } else {
        if (dist < 19) desired.multiplyScalar(-1);
        else if (dist > 32) desired.multiplyScalar(1);
        else desired.set(0, 0, 0);
      }

      if (desired.lengthSq() > .01) {
        desired.normalize();
        enemy.group.position.addScaledVector(desired, enemy.speed * dt);
      } else {
        if (enemy.strafeTimer <= 0) {
          enemy.strafeTimer = .8 + Math.random() * 1.4;
          enemy.strafeSign *= -1;
        }
        const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
        enemy.group.position.addScaledVector(side, enemy.strafeSign * enemy.speed * .75 * dt);
      }

      if (enemy.attackTimer <= 0 && dist < enemy.attackRange) {
        enemyShoot(enemy);
      }
    }

    enemy.group.position.x = THREE.MathUtils.clamp(enemy.group.position.x, -51, 51);
    enemy.group.position.z = THREE.MathUtils.clamp(enemy.group.position.z, -51, 51);

    // The soldier model faces local -Z, so explicitly aim that front side at the player.
    const faceX = player.position.x - enemy.group.position.x;
    const faceZ = player.position.z - enemy.group.position.z;
    enemy.group.rotation.y = Math.atan2(faceX, faceZ) + Math.PI;

    const parts = enemy.group.userData.parts;
    enemy.shootRecoil = Math.max(0, enemy.shootRecoil - dt * 7);

    const moveAmount = enemy.role === 'rusher' ? 1 : .48;
    const stride = Math.sin(enemy.animTime) * moveAmount;
    const counterStride = Math.sin(enemy.animTime + Math.PI) * moveAmount;
    const bounce = Math.abs(Math.sin(enemy.animTime * .5)) * (enemy.role === 'rusher' ? .035 : .015);
    const breath = Math.sin(enemy.animTime * .65 + enemy.phase) * .018;
    const isAiming = enemy.role !== 'rusher';

    // Procedural locomotion: rushers run, ranged units keep their rifle up.
    parts.leftLeg.rotation.x = -stride * (enemy.role === 'rusher' ? .72 : .28);
    parts.rightLeg.rotation.x = -counterStride * (enemy.role === 'rusher' ? .72 : .28);
    parts.leftKnee.rotation.x = Math.max(0, stride) * (enemy.role === 'rusher' ? .34 : .12);
    parts.rightKnee.rotation.x = Math.max(0, counterStride) * (enemy.role === 'rusher' ? .34 : .12);

    if (isAiming) {
      parts.leftArm.rotation.x = -.34 + counterStride * .08 + breath;
      parts.rightArm.rotation.x = -.30 + stride * .08 - breath;
      parts.leftArm.rotation.z = .08;
      parts.rightArm.rotation.z = -.08;
    } else {
      parts.leftArm.rotation.x = -.08 + stride * .42;
      parts.rightArm.rotation.x = -.10 + counterStride * .42;
      parts.leftArm.rotation.z = .10;
      parts.rightArm.rotation.z = -.10;
    }

    parts.upperBody.rotation.x = isAiming
      ? -.035 + breath * .35
      : -.065 + breath * .25;
    parts.upperBody.rotation.z = Math.sin(enemy.animTime * .5 + enemy.phase) * .012;
    parts.hips.position.y = 1.42 + bounce;

    parts.head.rotation.x = Math.sin(enemy.animTime * .42 + enemy.phase) * .025;
    parts.head.rotation.y = Math.sin(enemy.animTime * .27 + enemy.phase) * .07;
    parts.rifle.rotation.x = .02 - enemy.shootRecoil * .16 + breath * .2;
    parts.rifle.rotation.z = -.08 + Math.sin(enemy.animTime * .55) * .01;

    enemy.walkTime += dt * (enemy.role === 'rusher' ? 11 : 7);
    enemy.animTime += dt * (enemy.role === 'rusher' ? 12 : 6.5);
  }
}

function updateRagdolls(dt) {
  for (let i = ragdolls.length - 1; i >= 0; i -= 1) {
    const rag = ragdolls[i];
    rag.age += dt;

    rag.velocity.y -= CONFIG.ragdollGravity * dt;
    rag.group.position.addScaledVector(rag.velocity, dt);

    // Root motion is fully momentum-driven on all three axes.
    // There is no canned fall direction fighting the body's angular velocity.
    const airDamping = rag.grounded ? .52 : .10;
    rag.angularVelocity.multiplyScalar(Math.exp(-airDamping * dt));
    rag.group.rotation.x += rag.angularVelocity.x * dt;
    rag.group.rotation.y += rag.angularVelocity.y * dt;
    rag.group.rotation.z += rag.angularVelocity.z * dt;

    // Loose body mechanics: the limbs keep their own angular momentum.
    // A small inward bias develops over time, but never fully overrides the fling.
    const settle = THREE.MathUtils.clamp((rag.age - .45) / 2.2, 0, 1);
    const curlBias = settle * .28;

    const spine = rag.spine;
    spine.targetX *= Math.exp(-.55 * dt);
    spine.targetZ *= Math.exp(-.55 * dt);
    spine.targetX += Math.sign(spine.targetX || 1) * curlBias * .18 * dt;
    spine.targetZ += Math.sign(spine.targetZ || 1) * curlBias * .10 * dt;
    spine.velocityX += ((spine.targetX - spine.angleX) * 7.5 - spine.velocityX * 2.35) * dt;
    spine.velocityZ += ((spine.targetZ - spine.angleZ) * 7.0 - spine.velocityZ * 2.15) * dt;
    spine.angleX += spine.velocityX * dt;
    spine.angleZ += spine.velocityZ * dt;
    spine.angleX = THREE.MathUtils.clamp(spine.angleX, -1.05, 1.05);
    spine.angleZ = THREE.MathUtils.clamp(spine.angleZ, -.75, .75);
    spine.object.rotation.x = spine.angleX;
    spine.object.rotation.z = spine.angleZ;

    const lower = rag.lowerBody;
    lower.velocityX += (-lower.angleX * 4.0 - lower.velocityX * 1.65) * dt;
    lower.velocityZ += (-lower.angleZ * 3.8 - lower.velocityZ * 1.55) * dt;
    lower.angleX += lower.velocityX * dt;
    lower.angleZ += lower.velocityZ * dt;
    lower.angleX = THREE.MathUtils.clamp(lower.angleX, -.4, .4);
    lower.angleZ = THREE.MathUtils.clamp(lower.angleZ, -.3, .3);
    lower.object.rotation.x = lower.angleX;
    lower.object.rotation.z = lower.angleZ;

    const neck = rag.neck;
    neck.velocityX += (-neck.angleX * 6.0 - neck.velocityX * 1.8) * dt;
    neck.velocityY += (-neck.angleY * 5.8 - neck.velocityY * 1.7) * dt;
    neck.angleX += neck.velocityX * dt;
    neck.angleY += neck.velocityY * dt;
    neck.angleX = THREE.MathUtils.clamp(neck.angleX, -1.15, 1.15);
    neck.angleY = THREE.MathUtils.clamp(neck.angleY, -1.15, 1.15);
    neck.object.rotation.x = neck.angleX;
    neck.object.rotation.y = neck.angleY;

    for (const joint of rag.joints) {
      const isArm = joint.upper.name.includes('Arm');
      const isLeg = joint.upper.name.includes('Leg');
      const curl = settle * (isLeg ? .22 : isArm ? .16 : .12);

      joint.upperTarget *= Math.exp(-joint.targetDecay * dt);
      joint.lowerTarget *= Math.exp(-joint.targetDecay * dt);
      joint.upperTargetZ *= Math.exp(-joint.targetDecay * dt);
      joint.lowerTargetZ *= Math.exp(-joint.targetDecay * dt);

      if (isLeg) {
        joint.lowerTarget += curl;
      } else if (isArm) {
        joint.lowerTarget += curl * .8;
      }

      const flingDamping = rag.age < .65 ? .35 : THREE.MathUtils.lerp(.85, 1.35, settle);

      joint.upperVelocity += (
        (joint.upperTarget - joint.upperAngle) * 7.2 -
        joint.upperVelocity * (joint.damping * flingDamping)
      ) * dt;
      joint.lowerVelocity += (
        (joint.lowerTarget - joint.lowerAngle) * 8.6 -
        joint.lowerVelocity * (joint.damping * flingDamping)
      ) * dt;
      joint.upperVelocityZ += (
        (joint.upperTargetZ - joint.upper.rotation.z) * 6.4 -
        joint.upperVelocityZ * (joint.damping * .9)
      ) * dt;
      joint.lowerVelocityZ += (
        (joint.lowerTargetZ - joint.lower.rotation.z) * 7.2 -
        joint.lowerVelocityZ * (joint.damping * .95)
      ) * dt;

      joint.upperAngle += joint.upperVelocity * dt;
      joint.lowerAngle += joint.lowerVelocity * dt;
      joint.upperAngle = THREE.MathUtils.clamp(joint.upperAngle, -joint.upperLimit, joint.upperLimit);
      joint.lowerAngle = THREE.MathUtils.clamp(joint.lowerAngle, -joint.lowerLimit, joint.lowerLimit);

      joint.upper.rotation.x = joint.upperAngle;
      joint.lower.rotation.x = joint.lowerAngle;

      const upperZ = THREE.MathUtils.clamp(joint.upper.rotation.z + joint.upperVelocityZ * dt, -1.0, 1.0);
      const lowerZ = THREE.MathUtils.clamp(joint.lower.rotation.z + joint.lowerVelocityZ * dt, -1.0, 1.0);
      joint.upper.rotation.z = upperZ;
      joint.lower.rotation.z = lowerZ;
    }

    // Keep the entire body above the floor, not just the hip pivot.
    // The soldier can rotate onto its side, so every frame we resolve the
    // lowest visible body point against the floor surface at y = 0.
    // Hard floor solver: inspect every visible ragdoll mesh and push the
    // entire body upward until its lowest world-space point is above y=0.
    rag.model.updateMatrixWorld(true);
    rag.bounds.makeEmpty();
    rag.model.traverse((part) => {
      if (!part.isMesh || !part.visible) return;
      part.geometry.computeBoundingBox();
      if (part.geometry.boundingBox) {
        const meshBox = part.geometry.boundingBox.clone().applyMatrix4(part.matrixWorld);
        rag.bounds.union(meshBox);
      }
    });

    const floorClearance = .04;
    const penetration = floorClearance - rag.bounds.min.y;

    if (penetration > 0) {
      rag.group.position.y += penetration;
      rag.groundContact = Math.min(1, rag.groundContact + dt * 12);

      // Never allow downward travel while any body part is touching the floor.
      if (rag.velocity.y < 0) rag.velocity.y = 0;
      rag.velocity.x *= Math.exp(-3.4 * dt);
      rag.velocity.z *= Math.exp(-3.4 * dt);
      rag.angularVelocity.multiplyScalar(Math.exp(-2.9 * dt));

      if (!rag.grounded) {
        rag.grounded = true;
        rag.groundTime = 0;
        spine.velocityX *= .58;
        spine.velocityZ *= .58;
        neck.velocityX *= .52;
        neck.velocityY *= .52;
        for (const joint of rag.joints) {
          joint.upperVelocity *= .62;
          joint.lowerVelocity *= .62;
        }
      }
    } else {
      rag.groundContact = Math.max(0, rag.groundContact - dt * 2.5);
      if (rag.groundContact <= 0) rag.grounded = false;
    }

    if (rag.grounded) {
      rag.groundTime += dt;
    } else {
      rag.groundTime = Math.max(0, rag.groundTime - dt * 2);
    }

    if (rag.velocity.lengthSq() < .008 && rag.angularVelocity.lengthSq() < .008 && rag.groundTime > .8) {
      rag.velocity.multiplyScalar(.9);
      rag.angularVelocity.multiplyScalar(.88);
    }

  }

  for (let i = droppedGuns.length - 1; i >= 0; i -= 1) {
    const gun = droppedGuns[i];
    gun.life -= dt;

    gun.velocity.y -= CONFIG.ragdollGravity * dt;
    gun.mesh.position.addScaledVector(gun.velocity, dt);
    gun.mesh.rotation.x += gun.angularVelocity.x * dt;
    gun.mesh.rotation.y += gun.angularVelocity.y * dt;
    gun.mesh.rotation.z += gun.angularVelocity.z * dt;

    gun.bounds.setFromObject(gun.mesh);
    if (gun.bounds.min.y < .025) {
      gun.mesh.position.y += .025 - gun.bounds.min.y;
      gun.velocity.y = Math.max(0, gun.velocity.y);
      gun.velocity.x *= Math.exp(-3.2 * dt);
      gun.velocity.z *= Math.exp(-3.2 * dt);
      gun.angularVelocity.multiplyScalar(Math.exp(-2.8 * dt));
    }

    if (gun.life <= 0) {
      scene.remove(gun.mesh);
      droppedGuns.splice(i, 1);
    }
  }

  for (let i = shellCasings.length - 1; i >= 0; i -= 1) {
    const shell = shellCasings[i];
    shell.life -= dt;
    shell.velocity.y -= 12 * dt;
    shell.mesh.position.addScaledVector(shell.velocity, dt);
    shell.mesh.rotation.x += shell.angularVelocity.x * dt;
    shell.mesh.rotation.y += shell.angularVelocity.y * dt;
    shell.mesh.rotation.z += shell.angularVelocity.z * dt;
    if (shell.mesh.position.y < .05) {
      shell.mesh.position.y = .05;
      shell.velocity.y *= -.22;
      shell.velocity.x *= .75;
      shell.velocity.z *= .75;
    }
    if (shell.life <= 0) {
      scene.remove(shell.mesh);
      shellCasings.splice(i, 1);
    }
  }
}

function updateWave(dt) {
  if (state.spawnLeft > 0 || enemies.length > 0) return;
  state.nextWaveTimer += dt;
  if (state.nextWaveTimer >= 2) {
    state.wave += 1;
    state.reserve = Math.min(CONFIG.reserveAmmo + (state.wave - 1) * 10, state.reserve + 45);
    state.health = Math.min(CONFIG.maxHealth, state.health + 12);
    spawnWave();
  }
}

function updateWeapon(dt) {
  const moving = keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD');
  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const bobSpeed = sprinting ? 15 : 10;
  const bobAmount = moving && state.onGround ? (sprinting ? .035 : .018) : .006;
  const t = performance.now() * .001;

  state.weaponKick = Math.max(0, state.weaponKick - dt * 10);
  state.muzzleFlash = Math.max(0, state.muzzleFlash - dt);

  const breathing = Math.sin(t * 1.7) * .006;
  weapon.position.x = .43 + Math.sin(t * bobSpeed) * bobAmount;
  weapon.position.y = -.48 + breathing + Math.abs(Math.cos(t * bobSpeed)) * bobAmount - state.weaponKick * .045;
  weapon.position.z = -1.03 + state.weaponKick * .09;
  weapon.rotation.x = -.03 - state.weaponKick * .09;
  weapon.rotation.y = -.04 + Math.sin(t * bobSpeed * .5) * bobAmount * 1.2;
  weapon.rotation.z = -.015 + Math.sin(t * bobSpeed) * bobAmount * .8;
  weapon.children.forEach((child) => {
    if (child.isMesh) child.frustumCulled = false;
  });

  const visible = state.active && !state.over;
  weapon.visible = visible;

  const flashPower = state.muzzleFlash > 0 ? 18 : 0;
  weapon.userData.flash.intensity = flashPower;
  weapon.userData.flashMesh.material.opacity = state.muzzleFlash > 0 ? .9 : 0;

  if (state.reloadTimer > 0) {
    const reloadProgress = 1 - state.reloadTimer / CONFIG.reloadTime;
    weapon.rotation.x = -.03 - Math.sin(reloadProgress * Math.PI) * .55;
    weapon.position.y -= Math.sin(reloadProgress * Math.PI) * .12;
  }
}

function updateHud() {
  els.wave.textContent = state.wave;
  els.health.textContent = Math.ceil(state.health);
  els.healthFill.style.width = state.health + '%';
  els.ammo.textContent = state.ammo;
  els.reserve.textContent = state.reserve;
  els.kills.textContent = state.kills;
  els.score.textContent = state.score.toLocaleString();
  if (els.comboCount) els.comboCount.textContent = state.combo;
  if (els.combatCallout) els.combatCallout.classList.toggle('hidden', state.combo < 2);
}

function endGame() {
  state.over = true;
  state.active = false;
  document.exitPointerLock?.();
  els.hud.classList.add('hidden');
  els.gameOver.classList.remove('hidden');
  els.finalWave.textContent = state.wave;
  els.finalKills.textContent = state.kills;
  els.finalScore.textContent = state.score.toLocaleString();
}

function tickEffects(dt) {
  state.fireTimer = Math.max(0, state.fireTimer - dt);
  state.damageCooldown = Math.max(0, state.damageCooldown - dt);
  state.hurtFlash = Math.max(0, state.hurtFlash - dt);
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer <= 0) state.combo = 0;

  if (state.reloadTimer > 0) {
    state.reloadTimer -= dt;
    if (state.reloadTimer <= 0) finishReload();
  }

  for (let i = tracers.length - 1; i >= 0; i -= 1) {
    tracers[i].life -= dt;
    tracers[i].mesh.material.opacity = Math.max(0, tracers[i].life * 18);
    if (tracers[i].life <= 0) {
      scene.remove(tracers[i].mesh);
      tracers.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.vel.y -= 9 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }

  if (state.hurtFlash > 0) {
    renderer.domElement.style.filter = 'brightness(1.2) contrast(1.12) saturate(1.08)';
    els.damageOverlay.classList.add('show');
  } else {
    renderer.domElement.style.filter = '';
    els.damageOverlay.classList.remove('show');
  }
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05);

  if (state.active && document.pointerLockElement === renderer.domElement) {
    movePlayer(dt);
    updateEnemies(dt);
    updateWave(dt);
    tickEffects(dt);
  } else {
    tickEffects(dt);
  }

  updateRagdolls(dt);
  updateWeapon(dt);

  state.shake = Math.max(0, state.shake - dt * 1.9);
  if (state.shake > 0 && state.active) {
    camera.position.x += (Math.random()-.5) * state.shake;
    camera.position.y += (Math.random()-.5) * state.shake;
    camera.rotation.z += (Math.random()-.5) * state.shake * .7;
  }

  renderer.render(scene, camera);
}

function setWaveChoice(value) {
  state.selectedWave = value === 'endless' ? -1 : Number(value);
  if (els.selectedWaveLabel) {
    els.selectedWaveLabel.textContent = state.selectedWave === -1 ? 'ENDLESS' : `WAVE ${state.selectedWave}`;
  }
  for (const button of els.waveChoices) {
    button.classList.toggle('active', button.dataset.waveChoice === String(value));
  }
}

function showMenuView(view) {
  els.mainMenu.classList.toggle('hidden', view !== 'main');
  els.waveMenu.classList.toggle('hidden', view !== 'waves');
  els.optionsMenu.classList.toggle('hidden', view !== 'options');
}

for (const button of els.waveChoices) {
  button.addEventListener('click', () => setWaveChoice(button.dataset.waveChoice));
}

els.wavesButton.addEventListener('click', () => showMenuView('waves'));
els.optionsButton.addEventListener('click', () => showMenuView('options'));
els.backFromWaves.addEventListener('click', () => showMenuView('main'));
els.backFromOptions.addEventListener('click', () => showMenuView('main'));

setWaveChoice('1');
showMenuView('main');

function enterGame() {
  // Reset the arena state first, but defer enemy construction until the
  // browser has painted the game screen. This keeps the START button
  // responsive even with the high-detail soldier models.
  resetGame(false);
  renderer.domElement.style.display = 'block';
  els.start.classList.add('hidden');
  els.pause.classList.add('hidden');
  els.gameOver.classList.add('hidden');
  els.hud.classList.remove('hidden');

  renderer.domElement.requestPointerLock?.();
  requestAnimationFrame(() => {
    if (state.active && !state.over && enemies.length === 0 && state.spawnLeft === 0) {
      spawnWave();
    }
  });
}

els.startButton.addEventListener('click', enterGame);
els.resumeButton.addEventListener('click', () => renderer.domElement.requestPointerLock());
els.restartButton.addEventListener('click', enterGame);
els.updateReload.addEventListener('click', () => {
  if (pendingUpdate?.version) localStorage.setItem(UPDATE_STORAGE_KEY, pendingUpdate.version);
  location.reload();
});
els.updateDismiss.addEventListener('click', () => {
  if (pendingUpdate?.version) localStorage.setItem(UPDATE_STORAGE_KEY, pendingUpdate.version);
  pendingUpdate = null;
  els.updateNotice.classList.add('hidden');
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyR') reload();
  if (event.code === 'ControlLeft' || event.code === 'ControlRight' || event.code === 'KeyC') {
    state.slideQueued = true;
    event.preventDefault();
  }
  keys.add(event.code);
});

window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement || state.over) return;
  state.yaw -= event.movementX * CONFIG.mouseSensitivity;
  state.pitch -= event.movementY * CONFIG.mouseSensitivity;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -Math.PI / 2 + .02, Math.PI / 2 - .02);
});

renderer.domElement.addEventListener('mousedown', (event) => {
  if (event.button === 0 && document.pointerLockElement === renderer.domElement) shoot();
});

renderer.domElement.addEventListener('click', () => {
  if (state.active && !state.over && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  if (state.over || !state.active) return;
  if (document.pointerLockElement === renderer.domElement) {
    els.pause.classList.add('hidden');
    els.hud.classList.remove('hidden');
  } else {
    els.pause.classList.remove('hidden');
    els.hud.classList.add('hidden');
  }
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

camera.position.set(0, 0, 0);
checkForUpdates(true);
setInterval(() => checkForUpdates(false), 30000);
frame();
