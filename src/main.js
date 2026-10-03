import * as THREE from 'three';

const CONFIG = {
  maxHealth: 100,
  magSize: 30,
  reserveAmmo: 120,
  fireInterval: 0.105,
  reloadTime: 1.35,
  walkSpeed: 7.5,
  sprintSpeed: 11.5,
  backwardSpeed: 6.4,
  jumpSpeed: 7.8,
  gravity: 22,
  mouseSensitivity: 0.0018,
  enemyBaseHealth: 55,
  enemySpeed: 2.7,
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
};

const player = {
  position: new THREE.Vector3(0, 1.65, 18),
  radius: 0.45,
};

const UPDATE_STORAGE_KEY = 'warfex:lastSeenUpdate';
let pendingUpdate = null;

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

  const dark = createMaterial(0x151a20, .7, .32);
  const bodyMat = createMaterial(0x303943, .75, .35);
  const accent = createMaterial(0xd6dde4, .45, .28);
  const rubber = createMaterial(0x111418, .05, .85);

  const body = new THREE.Mesh(new THREE.BoxGeometry(.42, .28, 1.65), bodyMat);
  body.position.set(0, 0, -.68);
  body.castShadow = true;
  weapon.add(body);

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(.48, .22, .66), dark);
  receiver.position.set(0, .15, -.08);
  receiver.castShadow = true;
  weapon.add(receiver);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.045, .055, 1.45, 12), accent);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, .05, -1.58);
  barrel.castShadow = true;
  weapon.add(barrel);

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .16, 12), dark);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, .05, -2.3);
  weapon.add(muzzle);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(.34, .22, .7), rubber);
  stock.position.set(0, -.02, .44);
  stock.rotation.x = -.08;
  weapon.add(stock);

  const magazine = new THREE.Mesh(new THREE.BoxGeometry(.16, .45, .32), dark);
  magazine.position.set(0, -.3, -.35);
  magazine.rotation.x = -.18;
  weapon.add(magazine);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(.16, .46, .2), rubber);
  grip.position.set(0, -.28, .18);
  grip.rotation.x = -.18;
  weapon.add(grip);

  const sightBase = new THREE.Mesh(new THREE.BoxGeometry(.16, .08, .4), dark);
  sightBase.position.set(0, .23, -.36);
  weapon.add(sightBase);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(.05, .08, .18), accent);
  sight.position.set(0, .29, -.43);
  weapon.add(sight);

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  const armMat = createMaterial(0xbfc7cf, .15, .62);

  const leftSleeve = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, .7, 10), armMat);
  leftSleeve.rotation.z = -.35;
  leftSleeve.position.set(-.34, -.05, -.48);
  leftArm.add(leftSleeve);

  const rightSleeve = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, .7, 10), armMat);
  rightSleeve.rotation.z = .35;
  rightSleeve.position.set(.34, -.05, -.48);
  rightArm.add(rightSleeve);

  weapon.add(leftArm, rightArm);

  const flash = new THREE.PointLight(0xffcf6a, 0, 6, 2);
  flash.position.set(0, .05, -2.42);
  weapon.add(flash);

  const flashMesh = new THREE.Mesh(
    new THREE.ConeGeometry(.11, .4, 8),
    new THREE.MeshBasicMaterial({ color: 0xffdc85, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
  );
  flashMesh.rotation.x = -Math.PI / 2;
  flashMesh.position.set(0, .05, -2.48);
  weapon.add(flashMesh);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(.2, .07, .72), dark);
  rail.position.set(0, .27, -.36);
  weapon.add(rail);

  const opticBase = new THREE.Mesh(new THREE.BoxGeometry(.18, .11, .24), dark);
  opticBase.position.set(0, .36, -.28);
  weapon.add(opticBase);

  const opticGlass = new THREE.Mesh(
    new THREE.BoxGeometry(.12, .09, .16),
    new THREE.MeshStandardMaterial({
      color: 0x081218,
      emissive: 0x3c98b7,
      emissiveIntensity: 2.5,
      metalness: .8,
      roughness: .12,
    })
  );
  opticGlass.position.set(0, .4, -.27);
  weapon.add(opticGlass);

  const foregrip = new THREE.Mesh(new THREE.BoxGeometry(.13, .3, .2), rubber);
  foregrip.position.set(0, -.2, -1.1);
  foregrip.rotation.x = -.18;
  weapon.add(foregrip);

  const handMat = createMaterial(0x8c6d59, .05, .9);
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), handMat);
  leftHand.scale.set(1, .75, 1.25);
  leftHand.position.set(-.29, -.16, -.9);
  weapon.add(leftHand);

  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), handMat);
  rightHand.scale.set(1, .75, 1.25);
  rightHand.position.set(.29, -.16, .12);
  weapon.add(rightHand);

  weapon.userData.flash = flash;
  weapon.userData.flashMesh = flashMesh;
  weapon.userData.muzzle = muzzle;
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

  const armor = createMaterial(0x55616c, .62, .34);
  const armorDark = createMaterial(0x303941, .7, .3);
  const cloth = createMaterial(0x151a1f, .06, .82);
  const rubber = createMaterial(0x0b0e11, .03, .9);
  const trim = createMaterial(0x77838e, .55, .3);
  const skin = createMaterial(0x9f806b, .04, .88);
  const lens = new THREE.MeshStandardMaterial({
    color: 0x121d25,
    emissive: 0x174b61,
    emissiveIntensity: 1.8,
    metalness: .65,
    roughness: .15,
  });

  const box = (size, position, material, parent, name = '') => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  };

  const cyl = (radiusTop, radiusBottom, height, position, material, parent, rotation = [0,0,0], name = '') => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 10, 1),
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

  const sphere = (radius, position, material, parent, scale = [1,1,1], name = '') => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
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

  // Torso / plate carrier.
  box([1.02, 1.12, .62], [0, .62, 0], cloth, hips, 'Torso');
  box([1.10, .72, .68], [0, .72, -.045], armorDark, hips, 'PlateCarrier');
  box([.78, .44, .72], [0, .82, -.085], armor, hips, 'ChestPlate');
  box([.58, .18, .70], [0, 1.12, -.01], trim, hips, 'CollarPlate');
  sphere(.19, [-.60, 1.08, 0], armor, hips, [1.05, .72, 1.1], 'LeftShoulder');
  sphere(.19, [.60, 1.08, 0], armor, hips, [1.05, .72, 1.1], 'RightShoulder');

  // Magazines, battle belt, and pouches.
  for (const x of [-.30, 0, .30]) {
    box([.22, .22, .13], [x, .42, -.39], rubber, hips, 'ChestPouch');
  }
  box([.94, .17, .68], [0, .25, 0], cloth, hips, 'BattleBelt');
  box([.22, .24, .16], [-.42, .18, -.40], rubber, hips, 'LeftHipPouch');
  box([.22, .24, .16], [.42, .18, -.40], rubber, hips, 'RightHipPouch');

  // Backpack and radio.
  box([.64, .72, .28], [0, .57, .43], cloth, hips, 'Backpack');
  box([.45, .28, .18], [0, .72, .58], rubber, hips, 'PackTop');
  cyl(.018, .026, .72, [.22, 1.14, .48], trim, hips, [0, 0, -.12], 'RadioAntenna');

  // Neck, headset, and combat helmet.
  cyl(.16, .18, .22, [0, 1.28, 0], skin, hips, [0,0,0], 'Neck');
  const head = sphere(.39, [0, 1.57, 0], skin, hips, [1, 1.05, .94], 'RagdollHead');
  sphere(.46, [0, 1.79, 0], rubber, hips, [1.03, .64, 1.0], 'CombatHelmet');
  box([.62, .15, .12], [0, 1.72, -.37], armorDark, hips, 'HelmetVisorFrame');
  box([.49, .08, .045], [0, 1.72, -.42], lens, hips, 'HelmetVisor');
  box([.12, .23, .09], [-.43, 1.61, -.02], rubber, hips, 'HeadsetLeft');
  box([.12, .23, .09], [.43, 1.61, -.02], rubber, hips, 'HeadsetRight');
  cyl(.035, .035, .22, [.27, 1.86, .03], trim, hips, [0, 0, Math.PI / 2], 'HelmetMount');

  // Left arm with elbow articulation.
  const leftArm = new THREE.Group();
  leftArm.name = 'RagdollLeftArm';
  leftArm.position.set(-.70, 1.05, 0);
  hips.add(leftArm);
  sphere(.17, [0, .03, 0], armor, leftArm, [1, .85, 1.05], 'LeftShoulderCap');
  box([.31, .62, .32], [0, -.34, 0], armor, leftArm, 'LeftUpperArm');
  const leftElbow = new THREE.Group();
  leftElbow.name = 'RagdollLeftElbow';
  leftElbow.position.set(0, -.68, 0);
  leftArm.add(leftElbow);
  sphere(.14, [0,0,0], armorDark, leftElbow, [1, .9, 1], 'LeftElbowPad');
  box([.29, .58, .30], [0, -.32, 0], armorDark, leftElbow, 'LeftForearm');
  box([.28, .20, .32], [0, -.68, -.01], rubber, leftElbow, 'LeftGlove');

  // Right arm with elbow articulation.
  const rightArm = new THREE.Group();
  rightArm.name = 'RagdollRightArm';
  rightArm.position.set(.70, 1.05, 0);
  hips.add(rightArm);
  sphere(.17, [0, .03, 0], armor, rightArm, [1, .85, 1.05], 'RightShoulderCap');
  box([.31, .62, .32], [0, -.34, 0], armor, rightArm, 'RightUpperArm');
  const rightElbow = new THREE.Group();
  rightElbow.name = 'RagdollRightElbow';
  rightElbow.position.set(0, -.68, 0);
  rightArm.add(rightElbow);
  sphere(.14, [0,0,0], armorDark, rightElbow, [1, .9, 1], 'RightElbowPad');
  box([.29, .58, .30], [0, -.32, 0], armorDark, rightElbow, 'RightForearm');
  box([.28, .20, .32], [0, -.68, -.01], rubber, rightElbow, 'RightGlove');

  // Assault rifle silhouette.
  const rifle = new THREE.Group();
  rifle.name = 'Rifle';
  rifle.position.set(.20, .58, -.42);
  rifle.rotation.set(.02, 0, -.08);
  hips.add(rifle);
  box([.18, .20, .90], [0, 0, -.35], armorDark, rifle, 'RifleReceiver');
  box([.14, .16, .64], [0, .03, -.92], rubber, rifle, 'RifleHandguard');
  box([.10, .10, .55], [0, .04, -1.28], trim, rifle, 'RifleBarrel');
  box([.14, .16, .44], [0, -.03, .24], rubber, rifle, 'RifleStock');
  box([.14, .35, .24], [0, -.25, -.38], rubber, rifle, 'RifleMagazine');
  box([.16, .07, .28], [0, .15, -.55], armorDark, rifle, 'RifleRail');
  box([.13, .10, .20], [0, .23, -.55], lens, rifle, 'RifleOptic');
  box([.15, .26, .16], [0, -.22, -.76], rubber, rifle, 'RifleGrip');

  // Left leg with knee articulation.
  const leftLeg = new THREE.Group();
  leftLeg.name = 'RagdollLeftLeg';
  leftLeg.position.set(-.29, .08, 0);
  hips.add(leftLeg);
  box([.39, .72, .42], [0, -.38, 0], cloth, leftLeg, 'LeftThigh');
  box([.47, .20, .45], [0, -.62, -.02], armorDark, leftLeg, 'LeftKneePad');
  const leftKnee = new THREE.Group();
  leftKnee.name = 'RagdollLeftKnee';
  leftKnee.position.set(0, -.76, 0);
  leftLeg.add(leftKnee);
  box([.34, .62, .36], [0, -.31, 0], armor, leftKnee, 'LeftShin');
  box([.42, .25, .64], [0, -.66, -.08], rubber, leftKnee, 'LeftBoot');

  // Right leg with knee articulation.
  const rightLeg = new THREE.Group();
  rightLeg.name = 'RagdollRightLeg';
  rightLeg.position.set(.29, .08, 0);
  hips.add(rightLeg);
  box([.39, .72, .42], [0, -.38, 0], cloth, rightLeg, 'RightThigh');
  box([.47, .20, .45], [0, -.62, -.02], armorDark, rightLeg, 'RightKneePad');
  const rightKnee = new THREE.Group();
  rightKnee.name = 'RagdollRightKnee';
  rightKnee.position.set(0, -.76, 0);
  rightLeg.add(rightKnee);
  box([.34, .62, .36], [0, -.31, 0], armor, rightKnee, 'RightShin');
  box([.42, .25, .64], [0, -.66, -.08], rubber, rightKnee, 'RightBoot');

  group.userData.parts = {
    hips,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    head,
  };

  group.userData.baseScale = .54;
  group.scale.setScalar(group.userData.baseScale);
  return group;
}

function resetGame() {
  for (const enemy of enemies) scene.remove(enemy.group);
  enemies.length = 0;
  for (const t of tracers) scene.remove(t.mesh);
  tracers.length = 0;
  for (const p of particles) scene.remove(p.mesh);
  particles.length = 0;
  for (const rag of ragdolls) scene.remove(rag.group);
  ragdolls.length = 0;
  for (const shell of shellCasings) scene.remove(shell.mesh);
  shellCasings.length = 0;

  Object.assign(state, {
    active: true, over: false, yaw: 0, pitch: 0, verticalVelocity: 0, onGround: true,
    health: CONFIG.maxHealth, ammo: CONFIG.magSize, reserve: CONFIG.reserveAmmo,
    kills: 0, score: 0, wave: state.selectedWave > 0 ? state.selectedWave : 1, spawnLeft: 0, nextWaveTimer: 0,
    fireTimer: 0, reloadTimer: 0, damageCooldown: 0, hurtFlash: 0, walkTime: 0,
    weaponKick: 0, muzzleFlash: 0, shake: 0,
  });
  player.position.set(0, 1.65, 18);
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  weapon.position.set(.43, -.48, -1.03);
  weapon.rotation.set(-.03, -.04, -.015);
  spawnWave();
  updateHud();
}

function getSpawnPoint(index) {
  const ring = 25 + (index % 3) * 4;
  const angle = (index * 2.399963) % (Math.PI * 2);
  const points = [
    new THREE.Vector3(Math.cos(angle) * ring, 0, Math.sin(angle) * ring),
    new THREE.Vector3((index % 2 ? -1 : 1) * 40, 0, -35 + index * 7),
    new THREE.Vector3(-40 + index * 9, 0, (index % 2 ? -1 : 1) * 38),
  ];
  const p = points[index % points.length].clone();
  p.x = THREE.MathUtils.clamp(p.x, -45, 45);
  p.z = THREE.MathUtils.clamp(p.z, -45, 45);
  if (p.distanceTo(player.position) < 15) p.z -= 18;
  return p;
}

function spawnWave() {
  const count = Math.min(4 + state.wave * 2, 18);
  state.spawnLeft = count;
  for (let i = 0; i < count; i += 1) spawnEnemy(i);
  state.nextWaveTimer = 0;
  updateHud();
}

function spawnEnemy(index = 0) {
  const group = spawnEnemyModel();
  const spawn = getSpawnPoint(index);
  group.position.copy(spawn);
  scene.add(group);

  enemies.push({
    group,
    health: CONFIG.enemyBaseHealth + state.wave * 7,
    maxHealth: CONFIG.enemyBaseHealth + state.wave * 7,
    speed: CONFIG.enemySpeed + Math.min(state.wave * .08, 1.2),
    attackTimer: .7 + Math.random() * 1.4,
    radius: .58,
    baseScale: group.userData.baseScale || .78,
    phase: Math.random() * Math.PI * 2,
    walkTime: Math.random() * Math.PI * 2,
    hurtFlash: 0,
    deathTimer: 0,
    dying: false,
  });
}

function createRagdoll(enemy, impactPoint, direction, headshot = false) {
  enemy.group.updateMatrixWorld(true);

  const ragGroup = enemy.group.clone(true);
  ragGroup.name = 'ConnectedEnemyRagdoll';
  ragGroup.visible = true;
  ragGroup.position.copy(enemy.group.position);
  ragGroup.quaternion.copy(enemy.group.quaternion);
  ragGroup.scale.setScalar(enemy.baseScale || enemy.group.userData.baseScale || .78);
  scene.add(ragGroup);

  const jointConfigs = [
    ['RagdollLeftArm', 'RagdollLeftElbow', 1.25, .95],
    ['RagdollRightArm', 'RagdollRightElbow', 1.25, .95],
    ['RagdollLeftLeg', 'RagdollLeftKnee', .85, .72],
    ['RagdollRightLeg', 'RagdollRightKnee', .85, .72],
  ];

  const joints = jointConfigs.map(([upperName, lowerName, upperLimit, lowerLimit]) => {
    const upper = ragGroup.getObjectByName(upperName);
    const lower = ragGroup.getObjectByName(lowerName);
    return {
      upper,
      lower,
      upperAngle: 0,
      lowerAngle: 0,
      upperVelocity: (Math.random() - .5) * 8,
      lowerVelocity: (Math.random() - .5) * 10,
      upperTarget: (Math.random() - .5) * .35,
      lowerTarget: (Math.random() - .5) * .28,
      upperLimit,
      lowerLimit,
      damping: 4.8,
    };
  }).filter(j => j.upper && j.lower);

  const kick = headshot ? 5.2 : 3.6;
  const rootVelocity = direction
    ? direction.clone().multiplyScalar(kick)
    : new THREE.Vector3();
  rootVelocity.y = headshot ? 4.2 : 2.8;

  const impact = impactPoint ? impactPoint.clone() : enemy.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
  const side = direction
    ? new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar((Math.random() - .5) * 2.4)
    : new THREE.Vector3();

  ragdolls.push({
    group: ragGroup,
    velocity: rootVelocity.add(side),
    angularVelocity: new THREE.Vector3(
      (Math.random() - .5) * (headshot ? 7 : 5),
      (Math.random() - .5) * 9,
      (Math.random() - .5) * (headshot ? 7 : 5)
    ),
    joints,
    impact,
    life: CONFIG.ragdollLife + Math.random() * 1.8,
  });

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

function addTracer(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(.018, .018, len, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: .9 })
  );
  mesh.position.copy(from).addScaledVector(dir, .5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  scene.add(mesh);
  tracers.push({ mesh, life: .055 });
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

  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const forwardSpeed = sprinting ? CONFIG.sprintSpeed : CONFIG.walkSpeed;
  const speed = input.y > 0 ? CONFIG.backwardSpeed : forwardSpeed;

  const lookForward = new THREE.Vector3();
  camera.getWorldDirection(lookForward);
  lookForward.y = 0;
  if (lookForward.lengthSq() < 0.0001) lookForward.set(0, 0, -1);
  lookForward.normalize();

  const right = new THREE.Vector3(-lookForward.z, 0, lookForward.x);
  const velocity = new THREE.Vector3()
    .addScaledVector(right, input.x * speed)
    .addScaledVector(lookForward, -input.y * speed);

  const next = player.position.clone().addScaledVector(velocity, dt);
  if (!playerCollides(new THREE.Vector3(next.x, player.position.y, player.position.z))) player.position.x = next.x;
  if (!playerCollides(new THREE.Vector3(player.position.x, player.position.y, next.z))) player.position.z = next.z;

  if (keys.has('Space') && state.onGround) {
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

  if (moving) state.walkTime += dt * (sprinting ? 12 : 8);
  const moveBob = moving && state.onGround ? Math.sin(state.walkTime) * (sprinting ? .045 : .028) : 0;

  camera.position.copy(player.position);
  camera.position.y += moveBob;
  camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
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

  const targets = enemies.filter(e => !e.dying).flatMap(e => e.group.getObjectByName('EnemySoldier') ? [e.group] : e.group.children);
  const allEnemyMeshes = [];
  for (const enemy of enemies) {
    if (!enemy.dying) enemy.group.traverse(o => { if (o.isMesh) allEnemyMeshes.push(o); });
  }

  const wallHits = raycaster.intersectObjects(obstacles, false);
  const enemyHits = raycaster.intersectObjects(allEnemyMeshes, false);
  let hitPoint = origin.clone().addScaledVector(direction, 90);
  const wallDistance = wallHits[0]?.distance ?? Infinity;
  const enemyHit = enemyHits.find(hit => hit.distance < wallDistance);

  if (enemyHit) {
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
  } else if (wallHits[0]) {
    hitPoint = wallHits[0].point;
    spawnBurst(hitPoint.clone(), 0xb8c3cc);
  }

  addTracer(origin.clone().add(direction.clone().multiplyScalar(.8)), hitPoint);
  updateHud();
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

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];

    if (enemy.dying) {
      enemy.deathTimer -= dt;
      enemy.group.rotation.z += dt * 7;
      enemy.group.position.y = Math.max(0, enemy.group.position.y - dt * 2.8);
      enemy.group.scale.multiplyScalar(Math.max(.001, 1 - dt * 1.5));
      if (enemy.deathTimer <= 0) {
        scene.remove(enemy.group);
        enemies.splice(i, 1);
      }
      continue;
    }

    enemy.attackTimer -= dt;
    enemy.hurtFlash = Math.max(0, enemy.hurtFlash - dt);

    const toPlayer = new THREE.Vector3().subVectors(player.position, enemy.group.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    if (dist > 2.2) {
      toPlayer.normalize();
      enemy.group.position.addScaledVector(toPlayer, enemy.speed * dt);
      enemy.group.position.x = THREE.MathUtils.clamp(enemy.group.position.x, -51, 51);
      enemy.group.position.z = THREE.MathUtils.clamp(enemy.group.position.z, -51, 51);
      enemy.walkTime += dt * 9;
    }

    enemy.group.lookAt(player.position.x, enemy.group.position.y + 1.05, player.position.z);

    const parts = enemy.group.userData.parts;
    const swing = Math.sin(enemy.walkTime + enemy.phase) * (dist > 2.2 ? .6 : .12);
    parts.leftArm.rotation.x = swing;
    parts.rightArm.rotation.x = -swing;
    parts.leftLeg.rotation.x = -swing;
    parts.rightLeg.rotation.x = swing;
    parts.hips.position.y = .8 + Math.abs(Math.sin(enemy.walkTime * .5)) * .04;
    parts.head.rotation.y = Math.sin(enemy.walkTime * .25) * .05;

    if (enemy.hurtFlash > 0) {
      // Hit feedback must never change the soldier's physical size.
      enemy.group.scale.setScalar(enemy.baseScale);
    }

    if (dist < 18 && enemy.attackTimer <= 0) {
      enemy.attackTimer = Math.max(.45, 1.25 - state.wave * .03);
      const chance = THREE.MathUtils.clamp(1 - dist / 22, .1, .8);
      if (Math.random() < chance) damagePlayer(6 + Math.floor(state.wave * .6));
    }
  }
}

function updateRagdolls(dt) {
  for (let i = ragdolls.length - 1; i >= 0; i -= 1) {
    const rag = ragdolls[i];
    rag.life -= dt;

    rag.velocity.y -= CONFIG.ragdollGravity * dt;
    rag.group.position.addScaledVector(rag.velocity, dt);

    rag.angularVelocity.multiplyScalar(Math.exp(-2.2 * dt));
    rag.group.rotation.x += rag.angularVelocity.x * dt;
    rag.group.rotation.y += rag.angularVelocity.y * dt;
    rag.group.rotation.z += rag.angularVelocity.z * dt;

    for (const joint of rag.joints) {
      joint.upperVelocity += (
        (joint.upperTarget - joint.upperAngle) * 22 -
        joint.upperVelocity * joint.damping
      ) * dt;
      joint.upperAngle += joint.upperVelocity * dt;
      joint.upperAngle = THREE.MathUtils.clamp(joint.upperAngle, -joint.upperLimit, joint.upperLimit);

      joint.lowerVelocity += (
        (joint.lowerTarget - joint.lowerAngle) * 26 -
        joint.lowerVelocity * joint.damping
      ) * dt;
      joint.lowerAngle += joint.lowerVelocity * dt;
      joint.lowerAngle = THREE.MathUtils.clamp(joint.lowerAngle, -joint.lowerLimit, joint.lowerLimit);

      joint.upper.rotation.x = joint.upperAngle;
      joint.upper.rotation.z = Math.sin(joint.upperAngle * 1.7) * .12;
      joint.lower.rotation.x = joint.lowerAngle;
      joint.lower.rotation.z = Math.sin(joint.lowerAngle * 1.4) * .08;
    }

    if (rag.group.position.y < .10) {
      rag.group.position.y = .10;
      if (Math.abs(rag.velocity.y) > .7) {
        rag.velocity.y *= -.18;
        rag.velocity.x *= .82;
        rag.velocity.z *= .82;
        rag.angularVelocity.multiplyScalar(.72);
      } else {
        rag.velocity.y = 0;
        rag.velocity.x *= .90;
        rag.velocity.z *= .90;
        rag.angularVelocity.multiplyScalar(.65);
      }
    }

    if (rag.velocity.lengthSq() < .08 && rag.angularVelocity.lengthSq() < .08) {
      rag.velocity.multiplyScalar(.7);
      rag.angularVelocity.multiplyScalar(.7);
    }

    if (rag.life <= 0) {
      scene.remove(rag.group);
      ragdolls.splice(i, 1);
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
  els.healthFill.style.width = `${state.health}%`;
  els.ammo.textContent = state.ammo;
  els.reserve.textContent = state.reserve;
  els.kills.textContent = state.kills;
  els.score.textContent = state.score.toLocaleString();
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
  resetGame();
  renderer.domElement.style.display = 'block';
  els.start.classList.add('hidden');
  els.pause.classList.add('hidden');
  els.gameOver.classList.add('hidden');
  els.hud.classList.remove('hidden');
  renderer.domElement.requestPointerLock();
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
