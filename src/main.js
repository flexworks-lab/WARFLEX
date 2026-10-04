import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js?v=modulefix-20261004';
import { RagdollController } from './physics/RagdollController.js?v=modulefix-20261004';
import { WaveDirector } from './systems/WaveDirector.js?v=modulefix-20261004';
import { SteeringAgent } from './systems/SteeringAgent.js?v=wide-map-20261003';
import { AssetManager } from './assets/AssetManager.js?v=modulefix-20261004';
import { MapLoader } from './world/MapLoader.js?v=modulefix-20261004';
import { PropInstancer } from './world/PropInstancer.js?v=modulefix-20261004';
import { applyBakedLightmap } from './world/BakedLighting.js?v=modulefix-20261004';
import { configureAtmosphere } from './world/Atmosphere.js?v=brightai-20261003';
import { NavMeshService } from './ai/NavMeshService.js?v=wide-map-20261003';
import { NavMeshAgent } from './ai/NavMeshAgent.js?v=wide-map-20261003';

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

const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 260);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.55;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.display = 'none';

const gunViewportScene = new THREE.Scene();
const gunViewportCamera = new THREE.PerspectiveCamera(
  78,
  innerWidth / innerHeight,
  0.01,
  50,
);
gunViewportCamera.position.set(0, 0, 0);

const gunViewportRenderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
gunViewportRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
gunViewportRenderer.setSize(innerWidth, innerHeight);
gunViewportRenderer.outputColorSpace = THREE.SRGBColorSpace;
gunViewportRenderer.toneMapping = THREE.AgXToneMapping;
gunViewportRenderer.toneMappingExposure = 1.1;
gunViewportRenderer.setClearColor(0x000000, 0);
gunViewportRenderer.domElement.className = 'gun-viewport-canvas';
Object.assign(gunViewportRenderer.domElement.style, {
  position: 'fixed',
  inset: '0',
  width: '100vw',
  height: '100vh',
  zIndex: '5',
  pointerEvents: 'none',
  display: 'none',
});
document.body.appendChild(gunViewportRenderer.domElement);

gunViewportScene.add(
  new THREE.HemisphereLight(0xdbe9ff, 0x11151a, 1.8),
);
const gunKeyLight = new THREE.DirectionalLight(0xffffff, 2.4);
gunKeyLight.position.set(2.8, 4.8, 2.2);
gunViewportScene.add(gunKeyLight);

const gunFillLight = new THREE.DirectionalLight(
  0x9eb8ff,
  1.15,
);
gunFillLight.position.set(-3.5, 2.0, 3.0);
gunViewportScene.add(gunFillLight);

const gunRimLight = new THREE.DirectionalLight(
  0xffffff,
  1.35,
);
gunRimLight.position.set(-2.0, 4.0, -4.5);
gunViewportScene.add(gunRimLight);

const atmosphere = configureAtmosphere(
  scene,
  renderer,
  camera,
);

const assetManager = new AssetManager(renderer);

// Bright outdoor daylight rig: a strong sun plus soft sky/ground fill
// keeps the arena readable while preserving directional shadows.
const worldHemiLight = new THREE.HemisphereLight(
  0xe7f2ff,
  0x26313a,
  2.6,
);
scene.add(worldHemiLight);

const sun = new THREE.DirectionalLight(
  0xfff7e8,
  5.8,
);
sun.position.set(-28, 48, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.025;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 250;
sun.shadow.camera.left = -140;
sun.shadow.camera.right = 140;
sun.shadow.camera.top = 85;
sun.shadow.camera.bottom = -85;
scene.add(sun);

const daylightFill = new THREE.DirectionalLight(
  0x9fc4ff,
  1.3,
);
daylightFill.position.set(34, 22, -30);
scene.add(daylightFill);

const ambientLight = new THREE.AmbientLight(
  0xc8d9e8,
  0.42,
);
scene.add(ambientLight);

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
  aiming: false,
  aimBlend: 0,
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

let startRequestedBeforeBoot = Boolean(window.__WARFLEX_START_REQUESTED);
window.addEventListener('warfex-start-request', () => {
  startRequestedBeforeBoot = true;
  if (typeof window.WARFLEX_START_GAME === 'function') {
    window.WARFLEX_START_GAME();
  }
});

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

const fallbackArenaRoot = new THREE.Group();
fallbackArenaRoot.name = 'FallbackArena';
scene.add(fallbackArenaRoot);

function makeBox(
  size,
  position,
  color,
  cast = true,
  roughness = .9,
  metalness = .05,
) {
  const geometry = new RoundedBoxGeometry(
    size.x,
    size.y,
    size.z,
    2,
    Math.min(
      .08,
      Math.min(size.x, size.y, size.z) * .08,
    ),
  );

  const material =
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
    });

  const mesh = new THREE.Mesh(
    geometry,
    material,
  );

  mesh.position.copy(position);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  fallbackArenaRoot.add(mesh);

  // Detailed architectural dressing for cover/structures. The collision
  // object stays simple, while the visible object gets real modeled panels,
  // trim, fasteners, and edge pieces.
  const isLargeFloor =
    size.x * size.z > 500 ||
    size.y < .12;

  const isBoundary =
    size.x > 40 ||
    size.z > 40;

  if (
    cast &&
    !isLargeFloor &&
    !isBoundary
  ) {
    const detailMaterial =
      new THREE.MeshStandardMaterial({
        color:
          color > 0x300000
            ? Math.max(
                0,
                color - 0x0d0d0d,
              )
            : 0x1a2228,
        roughness: .72,
        metalness: .14,
      });

    const detailGroup =
      new THREE.Group();

    const trimHeight =
      Math.min(
        .08,
        Math.max(.025, size.y * .028),
      );

    const trimThickness =
      Math.min(
        .075,
        Math.max(.025, Math.min(size.x, size.z) * .018),
      );

    const topTrim =
      new THREE.Mesh(
        new RoundedBoxGeometry(
          Math.max(.4, size.x * .94),
          trimHeight,
          Math.max(.25, size.z * .94),
          2,
          Math.min(.018, trimHeight * .28),
        ),
        detailMaterial,
      );

    topTrim.position.y =
      size.y * .5 + trimHeight * .35;

    topTrim.castShadow = true;
    topTrim.receiveShadow = true;
    detailGroup.add(topTrim);

    // Front service panel.
    if (
      size.z > 1.4 &&
      size.y > .8
    ) {
      const panelDepth =
        Math.min(
          .045,
          size.z * .018,
        );

      const panel =
        new THREE.Mesh(
          new RoundedBoxGeometry(
            Math.max(.35, size.x * .62),
            Math.max(.16, size.y * .48),
            panelDepth,
            2,
            Math.min(.025, panelDepth * .45),
          ),
          detailMaterial,
        );

      panel.position.set(
        0,
        0,
        size.z * .5 + panelDepth * .5 + .002,
      );

      panel.castShadow = true;
      detailGroup.add(panel);

      // Panel seams.
      for (const x of [-.5, 0, .5]) {
        const seam =
          new THREE.Mesh(
            new RoundedBoxGeometry(
              Math.max(.012, size.x * .018),
              Math.max(.10, size.y * .34),
              .012,
              1,
              .004,
            ),
            new THREE.MeshStandardMaterial({
              color: 0x0d1216,
              roughness: .88,
              metalness: .08,
            }),
          );

        seam.position.set(
          x * Math.max(.18, size.x * .48),
          0,
          size.z * .5 + panelDepth + .006,
        );

        detailGroup.add(seam);
      }

      // Four visible fasteners.
      for (const x of [-1, 1]) {
        for (const y of [-1, 1]) {
          const bolt =
            new THREE.Mesh(
              new THREE.CylinderGeometry(
                .018,
                .018,
                .010,
                12,
              ),
              new THREE.MeshStandardMaterial({
                color: 0x7f8a90,
                metalness: .82,
                roughness: .22,
              }),
            );

          bolt.rotation.x =
            Math.PI / 2;

          bolt.position.set(
            x * size.x * .24,
            y * size.y * .16,
            size.z * .5 + panelDepth + .016,
          );

          detailGroup.add(bolt);
        }
      }
    }

    mesh.add(detailGroup);
  }

  return mesh;
}

function makeArenaCylinder(
  radius,
  height,
  position,
  color,
  parent = fallbackArenaRoot,
) {
  const geometry =
    new THREE.CylinderGeometry(
      radius,
      radius * .96,
      height,
      24,
      2,
    );

  const material =
    new THREE.MeshStandardMaterial({
      color,
      roughness: .76,
      metalness: .18,
    });

  const mesh =
    new THREE.Mesh(
      geometry,
      material,
    );

  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  // Drum bands and top/bottom lips make the prop read as a modeled mesh.
  const bandMat =
    new THREE.MeshStandardMaterial({
      color: 0x202a2f,
      metalness: .58,
      roughness: .32,
    });

  for (const y of [-.30, .30]) {
    const band =
      new THREE.Mesh(
        new THREE.TorusGeometry(
          radius * 1.005,
          .028,
          12,
          28,
        ),
        bandMat,
      );

    band.position.set(
      0,
      y * height,
      0,
    );

    parent.add(band);
  }

  const cap =
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        radius * .80,
        radius * .80,
        .035,
        24,
      ),
      bandMat,
    );

  cap.position.y =
    height * .5 + .018;

  parent.add(cap);

  return mesh;
}

function addArena() {
  // -------------------------------------------------------------------------
  // WARFLEX WIDE BATTLEFIELD
  //
  // The map is organized into readable military districts rather than
  // scattered props:
  //
  // SOUTH  -> forward staging / player deployment
  // CENTER -> main supply road + open combat boulevard
  // WEST   -> fortified command / barracks district
  // EAST   -> logistics / container yard / maintenance district
  // NORTH  -> defensive line / artillery / hardened positions
  //
  // Overall footprint: 260m x 150m.
  // -------------------------------------------------------------------------

  const MAP_WIDTH = 260;
  const MAP_DEPTH = 150;
  const HALF_W = MAP_WIDTH * .5;
  const HALF_D = MAP_DEPTH * .5;

  const floor =
    makeBox(
      new THREE.Vector3(
        MAP_WIDTH,
        1,
        MAP_DEPTH,
      ),
      new THREE.Vector3(
        0,
        -.5,
        0,
      ),
      0x151b1f,
      false,
      1,
      .015,
    );

  floor.material.roughness = 1;

  // Large asphalt/concrete slabs create intentional road geometry.
  const roadMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x20272b,
      roughness: .94,
      metalness: .02,
    });

  const concreteMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x3b4144,
      roughness: .90,
      metalness: .08,
    });

  const shoulderMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x515047,
      roughness: .98,
      metalness: .01,
    });

  const makeVisualSlab = (
    size,
    position,
    material,
    rotation = 0,
  ) => {
    const slab =
      new THREE.Mesh(
        new RoundedBoxGeometry(
          size.x,
          size.y,
          size.z,
          2,
          Math.min(.025, size.y * .4),
        ),
        material,
      );

    slab.position.copy(position);
    slab.rotation.y = rotation;
    slab.receiveShadow = true;
    fallbackArenaRoot.add(slab);
    return slab;
  };

  // Main north/south military avenue.
  makeVisualSlab(
    new THREE.Vector3(19, .07, 142),
    new THREE.Vector3(0, .035, 0),
    roadMaterial,
  );

  makeVisualSlab(
    new THREE.Vector3(46, .055, 18),
    new THREE.Vector3(0, .045, -2),
    roadMaterial,
  );

  // Secondary east/west roads split the districts cleanly.
  makeVisualSlab(
    new THREE.Vector3(244, .055, 12),
    new THREE.Vector3(0, .03, 30),
    roadMaterial,
  );

  makeVisualSlab(
    new THREE.Vector3(244, .055, 12),
    new THREE.Vector3(0, .03, -27),
    roadMaterial,
  );

  // Concrete hardstand areas define the major military facilities.
  makeVisualSlab(
    new THREE.Vector3(52, .06, 48),
    new THREE.Vector3(-80, .035, 22),
    concreteMaterial,
  );

  makeVisualSlab(
    new THREE.Vector3(58, .06, 46),
    new THREE.Vector3(79, .035, 18),
    concreteMaterial,
  );

  makeVisualSlab(
    new THREE.Vector3(70, .06, 38),
    new THREE.Vector3(32, .035, -48),
    shoulderMaterial,
  );

  // Outer containment wall.
  const border = [
    [
      new THREE.Vector3(MAP_WIDTH, 10, 1.5),
      new THREE.Vector3(0, 5, -HALF_D),
    ],
    [
      new THREE.Vector3(MAP_WIDTH, 10, 1.5),
      new THREE.Vector3(0, 5, HALF_D),
    ],
    [
      new THREE.Vector3(1.5, 10, MAP_DEPTH),
      new THREE.Vector3(-HALF_W, 5, 0),
    ],
    [
      new THREE.Vector3(1.5, 10, MAP_DEPTH),
      new THREE.Vector3(HALF_W, 5, 0),
    ],
  ];

  const borderMaterial = 0x11171b;

  for (const [size, position] of border) {
    obstacles.push(
      makeBox(
        size,
        position,
        borderMaterial,
        true,
        .72,
        .25,
      ),
    );
  }

  const coverColor = 0x303a40;
  const concrete = 0x41484c;
  const metal = 0x46545b;
  const darkCover = 0x20292e;

  const addCover = (
    sx,
    sy,
    sz,
    x,
    y,
    z,
    color = coverColor,
  ) => {
    obstacles.push(
      makeBox(
        new THREE.Vector3(
          sx,
          sy,
          sz,
        ),
        new THREE.Vector3(
          x,
          y,
          z,
        ),
        color,
        true,
        .82,
        .16,
      ),
    );
  };

  const addSolid = (
    size,
    position,
    material = concrete,
    rotation = 0,
  ) => {
    const mesh =
      makeBox(
        new THREE.Vector3(
          size[0],
          size[1],
          size[2],
        ),
        new THREE.Vector3(
          position[0],
          position[1],
          position[2],
        ),
        material.color.getHex(),
        true,
        material.roughness,
        material.metalness,
      );

    mesh.material = material;
    mesh.rotation.y = rotation;
    obstacles.push(mesh);
    return mesh;
  };

  const addTrimBox = (
    parent,
    size,
    position,
    material,
    rotation = 0,
  ) => {
    const mesh =
      new THREE.Mesh(
        new RoundedBoxGeometry(
          size[0],
          size[1],
          size[2],
          2,
          Math.min(
            .045,
            Math.min(...size) * .12,
          ),
        ),
        material,
      );

    mesh.position.set(...position);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const addRoadLine = (
    x,
    z,
    width,
    depth,
    rotation = 0,
    color = 0xb5a95d,
  ) => {
    const mat =
      new THREE.MeshStandardMaterial({
        color,
        roughness: .86,
        metalness: .02,
        emissive: color,
        emissiveIntensity: .04,
      });

    makeVisualSlab(
      new THREE.Vector3(
        width,
        .018,
        depth,
      ),
      new THREE.Vector3(
        x,
        .078,
        z,
      ),
      mat,
      rotation,
    );
  };

  // Deliberate lane markings on the main roads.
  for (
    let z = -56;
    z <= 56;
    z += 14
  ) {
    addRoadLine(
      0,
      z,
      3.2,
      1.0,
    );
  }

  for (
    let x = -110;
    x <= 110;
    x += 18
  ) {
    addRoadLine(
      x,
      30,
      8.2,
      .18,
    );
  }

  for (
    let x = -110;
    x <= 110;
    x += 18
  ) {
    addRoadLine(
      x,
      -27,
      8.2,
      .18,
    );
  }

  // =========================================================================
  // BUILDINGS
  // =========================================================================

  const buildingWall =
    new THREE.MeshStandardMaterial({
      color: 0x3a4448,
      roughness: .82,
      metalness: .13,
    });

  const buildingDark =
    new THREE.MeshStandardMaterial({
      color: 0x1a2125,
      roughness: .78,
      metalness: .16,
    });

  const windowMat =
    new THREE.MeshStandardMaterial({
      color: 0x162e39,
      emissive: 0x2b90ad,
      emissiveIntensity: 1.35,
      roughness: .18,
      metalness: .55,
    });

  const interiorLightMat =
    new THREE.MeshStandardMaterial({
      color: 0x8f742c,
      emissive: 0xffbf57,
      emissiveIntensity: 1.9,
      roughness: .35,
      metalness: .22,
    });

  const addBuilding = ({
    x,
    z,
    width,
    depth,
    height,
    doorWidth = 3.4,
    rotation = 0,
    label = 'FACILITY',
  }) => {
    const root =
      new THREE.Group();

    root.position.set(x, 0, z);
    root.rotation.y = rotation;
    fallbackArenaRoot.add(root);

    // Interior floor.
    addTrimBox(
      root,
      [width - .6, .08, depth - .6],
      [0, .04, 0],
      buildingDark,
    );

    // Four wall sides; the front has a deliberate door opening.
    addSolid(
      [width, height, .55],
      [x, height * .5, z - depth * .5],
      buildingWall,
      rotation,
    );

    addSolid(
      [.55, height, depth],
      [x - width * .5, height * .5, z],
      buildingWall,
      rotation,
    );

    addSolid(
      [.55, height, depth],
      [x + width * .5, height * .5, z],
      buildingWall,
      rotation,
    );

    const frontSegment =
      (width - doorWidth) * .5;

    addSolid(
      [frontSegment, height, .55],
      [
        x - doorWidth * .5 - frontSegment * .5,
        height * .5,
        z + depth * .5,
      ],
      buildingWall,
      rotation,
    );

    addSolid(
      [frontSegment, height, .55],
      [
        x + doorWidth * .5 + frontSegment * .5,
        height * .5,
        z + depth * .5,
      ],
      buildingWall,
      rotation,
    );

    // Roof / parapet is visual only.
    addTrimBox(
      root,
      [width + .35, .32, depth + .35],
      [0, height + .08, 0],
      buildingDark,
    );

    // Entrance frame.
    addTrimBox(
      root,
      [.16, 3.7, .18],
      [-doorWidth * .5, 1.9, depth * .5 + .08],
      paintedMetal,
    );

    addTrimBox(
      root,
      [.16, 3.7, .18],
      [doorWidth * .5, 1.9, depth * .5 + .08],
      paintedMetal,
    );

    addTrimBox(
      root,
      [doorWidth + .25, .16, .18],
      [0, 3.72, depth * .5 + .08],
      hazardYellow,
    );

    // Exterior windows are consistent around the district.
    for (
      let wx = -width * .32;
      wx <= width * .32;
      wx += width * .32
    ) {
      if (Math.abs(wx) < doorWidth * .35) continue;

      addTrimBox(
        root,
        [Math.max(.95, width * .18), 1.0, .06],
        [wx, height * .57, depth * .5 + .06],
        windowMat,
      );
    }

    // Rooftop HVAC and cable tray.
    addTrimBox(
      root,
      [2.0, .55, 1.25],
      [-width * .25, height + .42, -.05],
      buildingDark,
    );

    addPipeRun(
      [
        [-width * .38, height + .15, -.35],
        [-width * .16, height + .52, -.35],
        [width * .08, height + .52, -.35],
      ],
      .035,
      paintedMetal,
    );

    // Interior ceiling lamp visible from the entrance.
    const lamp =
      new THREE.Mesh(
        new RoundedBoxGeometry(
          .72,
          .08,
          .24,
          1,
          .02,
        ),
        interiorLightMat,
      );

    lamp.position.set(
      0,
      height - .22,
      0,
    );
    root.add(lamp);

    const point =
      new THREE.PointLight(
        0xffbc58,
        14,
        12,
        2,
      );

    point.position.set(
      0,
      height - .8,
      0,
    );
    root.add(point);

    // Small facade sign.
    const sign =
      addTrimBox(
        root,
        [2.5, .42, .08],
        [0, height * .82, depth * .5 + .10],
        buildingDark,
      );

    const signLight =
      addTrimBox(
        root,
        [1.95, .08, .04],
        [0, height * .82, depth * .55],
        windowMat,
      );

    sign.userData.facilityLabel = label;
    signLight.userData.facilityLabel = label;

    return root;
  };

  const addPipeRun = (
    points,
    radius = .055,
    material = paintedMetal,
  ) => {
    for (
      let i = 0;
      i < points.length - 1;
      i += 1
    ) {
      const a = new THREE.Vector3(...points[i]);
      const b = new THREE.Vector3(...points[i + 1]);
      const midpoint =
        a.clone()
          .add(b)
          .multiplyScalar(.5);

      const pipe =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            radius,
            radius,
            a.distanceTo(b),
            14,
            2,
          ),
          material,
        );

      pipe.position.copy(midpoint);
      pipe.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      );
      pipe.castShadow = true;
      pipe.receiveShadow = true;
      fallbackArenaRoot.add(pipe);
    }
  };

  const paintedMetal =
    new THREE.MeshStandardMaterial({
      color: 0x66747b,
      roughness: .48,
      metalness: .52,
    });

  const hazardYellow =
    new THREE.MeshStandardMaterial({
      color: 0x927626,
      roughness: .58,
      metalness: .30,
    });

  // West command compound.
  addBuilding({
    x: -82,
    z: 18,
    width: 22,
    depth: 18,
    height: 6.2,
    doorWidth: 4.2,
    rotation: 0,
    label: 'COMMAND',
  });

  addBuilding({
    x: -57,
    z: 39,
    width: 16,
    depth: 13,
    height: 5.1,
    doorWidth: 3.5,
    rotation: 0,
    label: 'BARRACKS',
  });

  addBuilding({
    x: 74,
    z: 18,
    width: 30,
    depth: 20,
    height: 7.0,
    doorWidth: 6.5,
    rotation: 0,
    label: 'LOGISTICS',
  });

  addBuilding({
    x: 49,
    z: 40,
    width: 17,
    depth: 13,
    height: 5.4,
    doorWidth: 3.5,
    rotation: 0,
    label: 'WORKSHOP',
  });

  // Small southern guard building keeps the deployment area purposeful.
  addBuilding({
    x: -50,
    z: 56,
    width: 13,
    depth: 8,
    height: 4.4,
    doorWidth: 2.8,
    rotation: 0,
    label: 'GUARD',
  });

  // =========================================================================
  // WEST: FORTIFIED COMMAND DISTRICT
  // =========================================================================

  // Command courtyard walls.
  addCover(
    15,
    2.0,
    1.2,
    -101,
    1.0,
    18,
    concrete,
  );

  addCover(
    1.2,
    2.0,
    12,
    -94,
    1.0,
    25,
    concrete,
  );

  addCover(
    1.2,
    2.0,
    12,
    -67,
    1.0,
    25,
    concrete,
  );

  // Motor-pool parking bays.
  for (const x of [-77, -68, -59]) {
    addCover(
      7.0,
      .95,
      .95,
      x,
      .48,
      53,
      darkCover,
    );
  }

  // =========================================================================
  // EAST: LOGISTICS / CONTAINER YARD
  // =========================================================================

  const containerMatA =
    new THREE.MeshStandardMaterial({
      color: 0x365767,
      roughness: .55,
      metalness: .38,
    });

  const containerMatB =
    new THREE.MeshStandardMaterial({
      color: 0x625246,
      roughness: .58,
      metalness: .34,
    });

  const addContainer = (
    x,
    z,
    rotation,
    material,
  ) => {
    const root =
      new THREE.Group();

    root.position.set(x, 2.0, z);
    root.rotation.y = rotation;
    fallbackArenaRoot.add(root);

    addTrimBox(
      root,
      [8.0, 3.7, .18],
      [0, 0, -1.72],
      material,
    );

    addTrimBox(
      root,
      [8.0, 3.7, .18],
      [0, 0, 1.72],
      material,
    );

    addTrimBox(
      root,
      [.18, 3.7, 3.5],
      [-3.9, 0, 0],
      material,
    );

    addTrimBox(
      root,
      [.18, 3.7, 3.5],
      [3.9, 0, 0],
      material,
    );

    addTrimBox(
      root,
      [7.7, .18, 3.4],
      [0, 1.77, 0],
      material,
    );

    for (const xPos of [
      -2.9,
      -1.95,
      -1.0,
      -.05,
      .90,
      1.85,
      2.8,
    ]) {
      addTrimBox(
        root,
        [.045, 3.2, .06],
        [xPos, 0, -1.83],
        buildingDark,
      );
    }

    addTrimBox(
      root,
      [1.7, 3.1, .08],
      [2.7, 0, -1.84],
      paintedMetal,
    );

    addTrimBox(
      root,
      [1.25, .12, .08],
      [2.7, -.95, -1.9],
      hazardYellow,
    );

    // Collision volume stays separate and clean.
    addSolid(
      [7.9, 3.5, 3.5],
      [x, 1.78, z],
      buildingDark,
      rotation,
    ).visible = false;
  };

  // Containers are aligned into two logistics rows.
  for (const [x, z, rot, mat] of [
    [52, 7, 0, containerMatA],
    [61, 7, 0, containerMatA],
    [70, 7, 0, containerMatB],
    [79, 7, 0, containerMatB],
    [52, -5, 0, containerMatB],
    [61, -5, 0, containerMatB],
    [70, -5, 0, containerMatA],
    [79, -5, 0, containerMatA],
  ]) {
    addContainer(
      x,
      z,
      rot,
      mat,
    );
  }

  // =========================================================================
  // NORTH: DEFENSIVE LINE / ARTILLERY
  // =========================================================================

  const addBunker =
    (x, z, rotation = 0, width = 11) => {
      const root =
        new THREE.Group();

      root.position.set(x, 0, z);
      root.rotation.y = rotation;
      fallbackArenaRoot.add(root);

      addSolid(
        [width, 3.8, 6.2],
        [x, 1.9, z],
        concrete,
        rotation,
      );

      addTrimBox(
        root,
        [width - .8, .85, .25],
        [0, 2.52, 3.06],
        buildingDark,
      );

      addTrimBox(
        root,
        [width * .54, .16, .18],
        [0, 2.15, 3.18],
        hazardYellow,
      );

      for (
        let bx = -width * .32;
        bx <= width * .32;
        bx += width * .32
      ) {
        addTrimBox(
          root,
          [1.2, .55, .12],
          [bx, 2.08, 3.20],
          windowMat,
        );
      }

      return root;
    };

  addBunker(-56, -54, 0, 13);
  addBunker(-28, -55, 0, 12);
  addBunker(0, -54, 0, 14);
  addBunker(29, -55, 0, 12);
  addBunker(58, -53, 0, 13);

  // Parallel trench lips create readable defensive geometry.
  for (const x of [-70, -42, -14, 14, 42, 70]) {
    addCover(
      16,
      1.35,
      1.25,
      x,
      .68,
      -44,
      darkCover,
    );

    addCover(
      10,
      1.15,
      1.15,
      x + 5,
      .58,
      -37,
      concrete,
    );
  }

  // Artillery pads are aligned behind the bunkers.
  const gunMat =
    new THREE.MeshStandardMaterial({
      color: 0x39464d,
      roughness: .62,
      metalness: .48,
    });

  const addArtillery =
    (x, z, rotation = 0) => {
      const root =
        new THREE.Group();

      root.position.set(x, .2, z);
      root.rotation.y = rotation;
      fallbackArenaRoot.add(root);

      addTrimBox(
        root,
        [5.5, .18, 3.8],
        [0, 0, 0],
        buildingDark,
      );

      addTrimBox(
        root,
        [1.25, .50, 1.25],
        [0, .48, 0],
        gunMat,
      );

      const barrel =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            .13,
            .18,
            4.4,
            20,
            2,
          ),
          gunMat,
        );

      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(
        1.35,
        .78,
        0,
      );
      barrel.castShadow = true;
      root.add(barrel);

      addTrimBox(
        root,
        [.35, .52, 2.0],
        [-.35, .43, 0],
        paintedMetal,
      );

      return root;
    };

  addArtillery(-50, -31, 0);
  addArtillery(0, -31, 0);
  addArtillery(50, -31, Math.PI);

  // =========================================================================
  // FIELD DETAILS / WAR DAMAGE
  // =========================================================================

  const wreckMat =
    new THREE.MeshStandardMaterial({
      color: 0x252b2e,
      roughness: .90,
      metalness: .25,
    });

  const rustMat =
    new THREE.MeshStandardMaterial({
      color: 0x4d3225,
      roughness: .94,
      metalness: .12,
    });

  const addWreck =
    (x, z, rotation = 0, scale = 1) => {
      const root =
        new THREE.Group();

      root.position.set(x, .28, z);
      root.rotation.y = rotation;
      root.scale.setScalar(scale);
      fallbackArenaRoot.add(root);

      const hull =
        new THREE.Mesh(
          new RoundedBoxGeometry(
            5.2,
            1.15,
            2.7,
            3,
            .18,
          ),
          wreckMat,
        );

      hull.castShadow = true;
      hull.receiveShadow = true;
      root.add(hull);

      for (const side of [-1, 1]) {
        for (let i = -1; i <= 1; i += 1) {
          const wheel =
            new THREE.Mesh(
              new THREE.CylinderGeometry(
                .58,
                .58,
                .30,
                18,
              ),
              rustMat,
            );

          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(
            i * 1.35,
            -.42,
            side * 1.18,
          );
          wheel.castShadow = true;
          root.add(wheel);
        }
      }

      const turret =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            .72,
            .78,
            .38,
            20,
          ),
          wreckMat,
        );

      turret.position.set(
        -.25,
        .78,
        0,
      );
      turret.castShadow = true;
      root.add(turret);

      const barrel =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            .12,
            .18,
            2.8,
            16,
          ),
          rustMat,
        );

      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(
        1.25,
        .90,
        0,
      );
      root.add(barrel);

      const smoke =
        new THREE.Mesh(
          new THREE.SphereGeometry(
            .42,
            16,
            12,
          ),
          new THREE.MeshStandardMaterial({
            color: 0x141818,
            emissive: 0x1d2324,
            emissiveIntensity: .55,
            roughness: 1,
          }),
        );

      smoke.position.set(
        -.35,
        1.65,
        .15,
      );
      root.add(smoke);
    };

  // Wrecks sit alongside the main road as intentional battle-story props.
  addWreck(
    -25,
    42,
    .08,
    1.0,
  );

  addWreck(
    30,
    -16,
    -.18,
    1.08,
  );

  addWreck(
    84,
    -38,
    .04,
    .92,
  );

  // Craters stay in open ground, not inside the roads or building doors.
  const craterMat =
    new THREE.MeshStandardMaterial({
      color: 0x171a19,
      roughness: 1,
      metalness: 0,
    });

  const rubbleMat =
    new THREE.MeshStandardMaterial({
      color: 0x44423d,
      roughness: .96,
      metalness: .03,
    });

  const addCrater = (
    x,
    z,
    radius,
  ) => {
    const crater =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          radius,
          radius * .84,
          .025,
          28,
        ),
        craterMat,
      );

    crater.position.set(
      x,
      .02,
      z,
    );
    crater.rotation.y = .18;
    crater.receiveShadow = true;
    fallbackArenaRoot.add(crater);

    for (const angle of [0, 1.9, 3.7]) {
      const piece =
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(
            radius * .12,
            0,
          ),
          rubbleMat,
        );

      piece.position.set(
        x + Math.cos(angle) * radius * .82,
        .08,
        z + Math.sin(angle) * radius * .82,
      );
      piece.castShadow = true;
      fallbackArenaRoot.add(piece);
    }
  };

  addCrater(-39, 6, 2.7);
  addCrater(41, 31, 3.1);
  addCrater(17, -17, 2.25);
  addCrater(-22, -32, 2.8);
  addCrater(101, -12, 2.1);

  // Barbed-wire style perimeter pieces are deliberately confined to the
  // northern defensive belt and the outer command perimeter.
  const wireMat =
    new THREE.MeshStandardMaterial({
      color: 0x272d30,
      roughness: .58,
      metalness: .62,
    });

  const addWireFence = (
    x,
    z,
    width,
    rotation = 0,
  ) => {
    const root =
      new THREE.Group();

    root.position.set(x, 0, z);
    root.rotation.y = rotation;
    fallbackArenaRoot.add(root);

    for (let i = 0; i <= 4; i += 1) {
      const px =
        i * (width / 4) -
        width * .5;

      const post =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            .035,
            .035,
            1.6,
            10,
          ),
          wireMat,
        );

      post.position.set(
        px,
        .8,
        0,
      );
      post.castShadow = true;
      root.add(post);
    }

    for (const y of [.58, 1.10]) {
      const wire =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            .014,
            .014,
            width,
            8,
          ),
          wireMat,
        );

      wire.rotation.z = Math.PI / 2;
      wire.position.set(
        0,
        y,
        0,
      );
      root.add(wire);
    }

    const concertina =
      new THREE.Mesh(
        new THREE.TorusGeometry(
          width * .31,
          .022,
          8,
          46,
        ),
        wireMat,
      );

    concertina.scale.x = 1.6;
    concertina.rotation.y = Math.PI / 2;
    concertina.position.y = .28;
    root.add(concertina);
  };

  addWireFence(
    -84,
    2,
    24,
    Math.PI / 2,
  );

  addWireFence(
    94,
    -2,
    24,
    Math.PI / 2,
  );

  addWireFence(
    0,
    -63,
    200,
    0,
  );

  // =========================================================================
  // LOCAL LIGHTING / NIGHT-WAR DETAIL
  // =========================================================================

  const localLights = [
    [-82, 8, 12, 0xffb85c, 32],
    [-57, 8, 39, 0xffb85c, 22],
    [74, 9, 18, 0xa6d9ff, 44],
    [49, 8, 40, 0xa6d9ff, 26],
    [-70, 7, 54, 0xff9d48, 18],
    [70, 7, 6, 0xa6d9ff, 28],
    [-53, 7, -46, 0xff8f45, 20],
    [2, 7, -46, 0xff8f45, 20],
    [53, 7, -46, 0xff8f45, 20],
  ];

  for (const [
    x,
    y,
    z,
    color,
    intensity,
  ] of localLights) {
    const light =
      new THREE.PointLight(
        color,
        intensity,
        24,
        2,
      );

    light.position.set(x, y, z);
    scene.add(light);
    arenaLights.push(light);

    const bulb =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          .10,
          12,
          8,
        ),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 2.8,
        }),
      );

    bulb.position.set(
      x,
      y,
      z,
    );

    fallbackArenaRoot.add(bulb);
  }

  // A few elevated light poles keep the wide battlefield readable.
  const poleMat =
    new THREE.MeshStandardMaterial({
      color: 0x252c30,
      roughness: .62,
      metalness: .52,
    });

  for (const [x, z] of [
    [-105, 47],
    [-25, 49],
    [25, 49],
    [105, 47],
    [-104, -18],
    [104, -18],
  ]) {
    const pole =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          .075,
          .11,
          9.5,
          14,
        ),
        poleMat,
      );

    pole.position.set(
      x,
      4.75,
      z,
    );
    pole.castShadow = true;
    fallbackArenaRoot.add(pole);

    const lamp =
      new THREE.PointLight(
        0xffd58d,
        40,
        30,
        2,
      );

    lamp.position.set(
      x,
      9.2,
      z,
    );
    scene.add(lamp);
    arenaLights.push(lamp);

    const head =
      new THREE.Mesh(
        new RoundedBoxGeometry(
          .55,
          .13,
          .32,
          2,
          .03,
        ),
        interiorLightMat,
      );

    head.position.set(
      x,
      9.3,
      z,
    );
    fallbackArenaRoot.add(head);
  }
}
addArena();

const fallbackObstacleCount = obstacles.length;

const arenaGrid = new THREE.GridHelper(258, 86, 0x33404b, 0x1b242d);
arenaGrid.position.y = 0.015;
arenaGrid.material.transparent = true;
arenaGrid.material.opacity = 0.06;
scene.add(arenaGrid);

const physicsWorld = new PhysicsWorld({
  gravity: -22,
  fixedStep: 1 / 60,
  maxSubSteps: 3,
});
const fallbackPhysicsBodies =
  physicsWorld.syncArena(obstacles);

const ragdollController = new RagdollController({
  scene,
  physicsWorld,
  cleanupSeconds: 10,
});

let waveDirector = null;

const mapLoader = new MapLoader({
  scene,
  assetManager,
  physicsWorld,
  obstacles,
});

const propInstancer = new PropInstancer(scene);
const navMeshService = new NavMeshService({
  assetManager,
  obstacles,
  fallbackHalfWidth: 128,
  fallbackHalfDepth: 73,
  fallbackCellSize: 2.5,
});

let environmentTexture = null;
let bakedLightmapTexture = null;
let worldAssetsReady = false;

async function loadWorldAssets() {
  /*
   * Optional production map:
   *   public/assets/maps/warfex-map.glb
   *
   * Meshes named COL_ / COLLISION / PHYS_ become invisible physics boxes.
   */
  try {
    const loadedMap = await mapLoader.loadMap(
      './assets/maps/warfex-map.glb',
    );

    /*
     * Remove the fallback collision/raycast objects from gameplay once the
     * production map successfully supplies its own collision meshes.
     */
    for (
      let i = 0;
      i < fallbackObstacleCount;
      i += 1
    ) {
      obstacles.shift();
    }

    physicsWorld.removeBodies(
      fallbackPhysicsBodies,
    );

    fallbackArenaRoot.visible = false;
    arenaGrid.visible = false;

    /*
     * Optional baked lighting texture. The map must export a second UV set.
     */
    try {
      bakedLightmapTexture =
        await applyBakedLightmap(
          mapLoader.visualRoot,
          new THREE.TextureLoader(),
          './assets/maps/warfex-lightmap.jpg',
          1.0,
        );
    } catch (error) {
      console.info(
        '[WARFLEX] No baked lightmap loaded; using dynamic PBR lighting.',
        error,
      );
    }

    /*
     * Optional HDR environment. If absent, the dynamic lights remain active.
     */
    try {
      environmentTexture =
        await assetManager.loadHDR(
          './assets/environment/warfex.hdr',
        );

      scene.environment =
        environmentTexture;
    } catch (error) {
      console.info(
        '[WARFLEX] No HDR environment loaded; keeping fallback lighting.',
        error,
      );
    }

    worldAssetsReady = true;
    return true;
  } catch (error) {
    console.info(
      '[WARFLEX] Production map not present yet; keeping built-in arena.',
      error,
    );
    return false;
  }
}

async function loadNavMeshAsset() {
  try {
    await navMeshService.load(
      './assets/maps/warfex-navmesh.glb',
    );

    console.info(
      '[WARFLEX] NavMesh loaded.',
    );
    return true;
  } catch (error) {
    navMeshService.buildFallbackGrid();

    console.info(
      '[WARFLEX] NavMesh GLB not present; using built-in A* obstacle grid.',
      error,
    );
    return false;
  }
}

function buildInstancedProps() {
  // These props are visual-only and intentionally use full meshes rather
  // than GPU-instanced placeholder cubes. Each one is dressed with slats,
  // brackets, seams, and hardware.

  const crateMat =
    new THREE.MeshStandardMaterial({
      color: 0x4b4032,
      roughness: .88,
      metalness: .04,
    });

  const crateDark =
    new THREE.MeshStandardMaterial({
      color: 0x1b2023,
      roughness: .68,
      metalness: .24,
    });

  const createDetailedCrate = (
    position,
    scale,
    rotation = 0,
  ) => {
    const root =
      new THREE.Group();

    root.position.copy(position);
    root.rotation.y = rotation;
    root.scale.setScalar(scale);
    fallbackArenaRoot.add(root);

    const core =
      new THREE.Mesh(
        new RoundedBoxGeometry(
          1.45,
          1.18,
          1.45,
          3,
          .045,
        ),
        crateMat,
      );

    core.castShadow = true;
    core.receiveShadow = true;
    root.add(core);

    for (const side of [-1, 1]) {
      for (const y of [-.32, 0, .32]) {
        const slat =
          new THREE.Mesh(
            new RoundedBoxGeometry(
              .09,
              .075,
              1.18,
              2,
              .012,
            ),
            crateDark,
          );

        slat.position.set(
          side * .72,
          y,
          0,
        );

        slat.rotation.y =
          side * .035;

        slat.castShadow = true;
        root.add(slat);
      }
    }

    for (const z of [-.58, 0, .58]) {
      const slat =
        new THREE.Mesh(
          new RoundedBoxGeometry(
            1.14,
            .075,
            .085,
            2,
            .012,
          ),
          crateDark,
        );

      slat.position.set(
        0,
        0,
        z,
      );

      root.add(slat);
    }

    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        const bracket =
          new THREE.Mesh(
            new RoundedBoxGeometry(
              .10,
              .10,
              .12,
              2,
              .015,
            ),
            crateDark,
          );

        bracket.position.set(
          x * .64,
          y * .48,
          .65,
        );

        root.add(bracket);
      }
    }
  };

  for (const [x, z, scale, rotation] of [
    [-43, -30, 1.0, -.12],
    [-44, 7, .86, .08],
    [43, -8, 1.08, .16],
    [42, 27, .92, -.11],
    [16, 31, .82, .05],
    [-12, 28, .9, -.10],
    [-38, -4, .72, .28],
    [36, -24, .74, -.20],
    [8, 35, .68, .12],
  ]) {
    createDetailedCrate(
      new THREE.Vector3(
        x,
        .62 * scale,
        z,
      ),
      scale,
      rotation,
    );
  }

  // Detailed steel barriers.
  const barrierMat =
    new THREE.MeshStandardMaterial({
      color: 0x4b555b,
      roughness: .62,
      metalness: .42,
    });

  const barrierDark =
    new THREE.MeshStandardMaterial({
      color: 0x20282d,
      roughness: .58,
      metalness: .50,
    });

  const createBarrier = (
    position,
    rotation = 0,
  ) => {
    const root =
      new THREE.Group();

    root.position.copy(position);
    root.rotation.y = rotation;
    fallbackArenaRoot.add(root);

    const body =
      new THREE.Mesh(
        new RoundedBoxGeometry(
          2.8,
          1.05,
          .55,
          4,
          .06,
        ),
        barrierMat,
      );

    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);

    for (const x of [-.92, 0, .92]) {
      const support =
        new THREE.Mesh(
          new RoundedBoxGeometry(
            .14,
            1.28,
            .68,
            3,
            .035,
          ),
          barrierDark,
        );

      support.position.set(
        x,
        .02,
        .02,
      );

      root.add(support);

      const brace =
        new THREE.Mesh(
          new RoundedBoxGeometry(
            .12,
            .14,
            .44,
            2,
            .025,
          ),
          barrierDark,
        );

      brace.position.set(
        x,
        .44,
        -.10,
      );

      brace.rotation.z =
        x === 0
          ? 0
          : x < 0
            ? -.18
            : .18;

      root.add(brace);
    }

    const warning =
      new THREE.Mesh(
        new RoundedBoxGeometry(
          2.0,
          .065,
          .035,
          2,
          .01,
        ),
        new THREE.MeshStandardMaterial({
          color: 0x8a5a2b,
          roughness: .64,
          metalness: .28,
        }),
      );

    warning.position.set(
      0,
      .18,
      -.295,
    );

    root.add(warning);
  };

  for (const [x, z, rotation] of [
    [-34, -22, .05],
    [-30, 16, -.18],
    [-4, 5, .0],
    [25, 7, .12],
    [31, -14, -.08],
    [18, -33, .18],
    [36, 22, .25],
    [-18, 36, -.12],
  ]) {
    createBarrier(
      new THREE.Vector3(
        x,
        .52,
        z,
      ),
      rotation,
    );
  }
}
buildInstancedProps();

Promise.all([
  loadWorldAssets(),
  loadNavMeshAsset(),
]).then(() => {
  console.info(
    '[WARFLEX] World systems initialized.',
  );
});

function createMaterial(color, metalness = .1, roughness = .65) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function createWeapon() {
  const weapon = new THREE.Group();
  weapon.name = 'MK-01_3D_RIFLE';

  // True custom hard-surface mesh helpers. These are actual polygonal weapon
  // parts rather than stretched boxes, giving the rifle a real side silhouette.
  const dark = createMaterial(0x0a0d10, .90, .20);
  const receiverMat = createMaterial(0x252d35, .86, .21);
  const upperMat = createMaterial(0x313a43, .82, .22);
  const polymer = createMaterial(0x161c21, .20, .43);
  const polymerSoft = createMaterial(0x10151a, .08, .66);
  const metal = createMaterial(0x68747f, .88, .18);
  const metalDark = createMaterial(0x343d46, .84, .21);
  const accent = createMaterial(0xb8c0c8, .62, .18);
  const rubber = createMaterial(0x05070a, .02, .94);

  const glass = new THREE.MeshStandardMaterial({
    color: 0x061015,
    emissive: 0x1b7693,
    emissiveIntensity: 2.2,
    metalness: .88,
    roughness: .07,
  });

  const addMesh = (
    geometry,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    material = receiverMat,
    name = '',
  ) => {
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    weapon.add(mesh);
    return mesh;
  };

  // Real beveled hard-surface profile. The shape is built in the rifle's
  // side plane, then extruded across its width with actual bevel geometry.
  const makeProfile = (
    points,
    width,
    material,
    name,
    bevelOffset = Math.min(.022, width * .12),
  ) => {
    const shape = new THREE.Shape();

    shape.moveTo(
      points[0][0],
      points[0][1],
    );

    for (let i = 1; i < points.length; i += 1) {
      shape.lineTo(
        points[i][0],
        points[i][1],
      );
    }

    shape.closePath();

    const geometry =
      new THREE.ExtrudeGeometry(
        shape,
        {
          depth: width,
          steps: 1,
          curveSegments: 4,
          bevelEnabled: true,
          bevelThickness: bevelOffset,
          bevelSize: bevelOffset,
          bevelOffset: 0,
          bevelSegments: 3,
        },
      );

    // Shape X = rifle Z, Shape Y = rifle Y, extrusion = rifle X.
    // Center the extrusion before rotating it into world orientation.
    geometry.translate(
      0,
      0,
      -width * .5,
    );
    geometry.rotateY(-Math.PI / 2);
    geometry.computeVertexNormals();

    return addMesh(
      geometry,
      [0, 0, 0],
      [0, 0, 0],
      material,
      name,
    );
  };

  const addCylinder = (
    radius,
    height,
    position,
    material,
    rotation = [0, 0, 0],
    segments = 24,
    name = '',
  ) => {
    const geometry = new THREE.CylinderGeometry(
      radius,
      radius * .94,
      height,
      Math.max(32, segments),
      2,
      false,
    );
    return addMesh(
      geometry,
      position,
      rotation,
      material,
      name,
    );
  };

  const addBoxDetail = (
    size,
    position,
    material,
    rotation = [0, 0, 0],
    name = '',
    bevel = .008,
  ) => {
    const geometry = new RoundedBoxGeometry(
      size[0],
      size[1],
      size[2],
      2,
      Math.min(
        bevel,
        Math.min(...size) * .18,
      ),
    );

    return addMesh(
      geometry,
      position,
      rotation,
      material,
      name,
    );
  };

  // Narrow receiver profile — this is the main silhouette of the rifle.
  makeProfile(
    [
      [-1.18, .16],
      [-1.00, .22],
      [-.68, .22],
      [-.54, .16],
      [-.08, .15],
      [.10, .10],
      [.18, -.08],
      [.06, -.22],
      [-.28, -.28],
      [-.62, -.20],
      [-.96, -.05],
      [-1.18, .06],
    ],
    .34,
    receiverMat,
    'RifleReceiverMesh',
  );

  // Raised upper receiver and rear housing.
  makeProfile(
    [
      [-.70, .24],
      [-.44, .31],
      [-.05, .27],
      [.10, .18],
      [.02, .10],
      [-.48, .12],
    ],
    .30,
    upperMat,
    'UpperReceiverMesh',
  );

  // Tapered handguard — noticeably slimmer than the previous version.
  makeProfile(
    [
      [-2.03, .16],
      [-1.18, .17],
      [-1.10, .10],
      [-1.10, -.05],
      [-2.02, -.02],
      [-2.12, .05],
    ],
    .19,
    polymer,
    'HandguardMesh',
  );

  // Top rail follows the receiver instead of sitting on a giant rectangular
  // block.
  for (let i = 0; i < 9; i += 1) {
    const z = -.92 - i * .125;
    addBoxDetail(
      [.20, .032, .065],
      [0, .30 - Math.max(0, i - 4) * .006, z],
      dark,
      [0, 0, 0],
      'RailTooth',
    );
  }

  // Low optic with a genuine beveled-ish custom prism body.
  makeProfile(
    [
      [-.67, .35],
      [-.56, .42],
      [-.28, .42],
      [-.19, .36],
      [-.22, .29],
      [-.63, .29],
    ],
    .13,
    polymerSoft,
    'OpticBodyMesh',
  );

  addMesh(
    new THREE.OctahedronGeometry(.075, 1),
    [0, .355, -.42],
    [0, 0, 0],
    glass,
    'OpticLens',
  );

  // Barrel is thin and centered inside the handguard.
  addCylinder(
    .045,
    1.48,
    [0, .06, -2.35],
    metal,
    [Math.PI / 2, 0, 0],
    24,
    'Barrel',
  );

  // Compact muzzle brake.
  makeProfile(
    [
      [-2.97, .08],
      [-2.92, .11],
      [-2.66, .10],
      [-2.60, .06],
      [-2.62, -.06],
      [-2.95, -.07],
    ],
    .12,
    metalDark,
    'MuzzleDeviceMesh',
  );

  addBoxDetail(
    [.15, .045, .025],
    [0, .12, -2.78],
    accent,
    [0, 0, 0],
    'MuzzleTopCut',
  );

  // Magazine well and a visibly angled magazine.
  makeProfile(
    [
      [-.55, -.12],
      [-.25, -.10],
      [-.12, -.22],
      [-.18, -.35],
      [-.52, -.31],
      [-.61, -.20],
    ],
    .20,
    metalDark,
    'MagazineWellMesh',
  );

  makeProfile(
    [
      [-.44, -.29],
      [-.12, -.36],
      [.02, -.80],
      [-.22, -.86],
      [-.50, -.70],
    ],
    .17,
    polymer,
    'MagazineMesh',
  );

  // Trigger guard and pistol grip have an actual sloped silhouette.
  makeProfile(
    [
      [-.04, -.23],
      [.28, -.25],
      [.34, -.38],
      [.25, -.48],
      [.05, -.45],
      [-.02, -.36],
    ],
    .18,
    dark,
    'TriggerGuardMesh',
  );

  makeProfile(
    [
      [.12, -.27],
      [.30, -.30],
      [.42, -.68],
      [.24, -.75],
      [.03, -.60],
    ],
    .16,
    rubber,
    'PistolGripMesh',
  );

  // Buttstock is no longer a block: tapered and kicked downward.
  makeProfile(
    [
      [.08, .08],
      [.44, .08],
      [.98, -.05],
      [1.10, -.18],
      [.98, -.28],
      [.54, -.21],
      [.13, -.08],
    ],
    .22,
    polymer,
    'StockMesh',
  );

  makeProfile(
    [
      [.94, -.10],
      [1.16, -.16],
      [1.20, -.27],
      [1.00, -.32],
      [.90, -.25],
    ],
    .24,
    rubber,
    'ButtpadMesh',
  );

  // Cheek rest.
  makeProfile(
    [
      [.38, .05],
      [.76, .07],
      [.84, -.02],
      [.44, -.06],
    ],
    .20,
    upperMat,
    'CheekRestMesh',
  );

  // Angled front grip.
  makeProfile(
    [
      [-1.24, -.06],
      [-1.08, -.08],
      [-1.02, -.44],
      [-1.19, -.49],
      [-1.34, -.15],
    ],
    .12,
    rubber,
    'ForegripMesh',
  );

  // Small controls make the mesh read as a functional firearm.
  addBoxDetail(
    [.035, .06, .16],
    [.18, .08, -.40],
    metal,
    [0, 0, 0],
    'ChargingHandle',
  );

  addBoxDetail(
    [.05, .06, .13],
    [.18, .02, -.10],
    metalDark,
    [0, 0, 0],
    'BoltRelease',
  );

  addCylinder(
    .018,
    .12,
    [0, -.17, .02],
    accent,
    [0, 0, Math.PI / 2],
    16,
    'TriggerPin',
  );

  // Hands and sleeves stay the same overall idea, but are kept close to the
  // narrower weapon silhouette.
  const handMat = createMaterial(0x795b49, .02, .88);
  const gloveMat = createMaterial(0x10151a, .08, .80);

  const leftHand = new THREE.Mesh(
    new THREE.SphereGeometry(.115, 20, 14),
    gloveMat,
  );
  leftHand.scale.set(1.0, .66, 1.30);
  leftHand.position.set(-.16, -.18, -1.02);
  leftHand.castShadow = true;
  weapon.add(leftHand);

  const rightHand = new THREE.Mesh(
    new THREE.SphereGeometry(.11, 20, 14),
    gloveMat,
  );
  rightHand.scale.set(.98, .68, 1.24);
  rightHand.position.set(.16, -.16, .17);
  rightHand.castShadow = true;
  weapon.add(rightHand);

  addCylinder(
    .045,
    .15,
    [-.17, -.18, -.93],
    handMat,
    [0, 0, Math.PI / 2],
    18,
  );

  addCylinder(
    .045,
    .15,
    [.16, -.16, .09],
    handMat,
    [0, 0, Math.PI / 2],
    18,
  );

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.name = 'WeaponLeftArm';
  rightArm.name = 'WeaponRightArm';

  const armMat = createMaterial(0xa5afb9, .18, .56);

  const sleeveL = new THREE.Mesh(
    new THREE.CapsuleGeometry(.10, .44, 6, 12),
    armMat,
  );
  sleeveL.rotation.z = -.35;
  sleeveL.position.set(-.25, -.03, -.56);
  sleeveL.castShadow = true;
  leftArm.add(sleeveL);

  const sleeveR = new THREE.Mesh(
    new THREE.CapsuleGeometry(.10, .44, 6, 12),
    armMat,
  );
  sleeveR.rotation.z = .35;
  sleeveR.position.set(.25, -.03, -.56);
  sleeveR.castShadow = true;
  rightArm.add(sleeveR);

  weapon.add(leftArm, rightArm);

  // Muzzle flash.
  const flash = new THREE.PointLight(
    0xffcf6a,
    0,
    7,
    2,
  );
  flash.position.set(0, .04, -2.96);
  weapon.add(flash);

  const flashMesh = new THREE.Mesh(
    new THREE.ConeGeometry(.11, .40, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffdc85,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    }),
  );
  flashMesh.rotation.x = -Math.PI / 2;
  flashMesh.position.set(0, .04, -3.06);
  weapon.add(flashMesh);

  weapon.userData.flash = flash;
  weapon.userData.flashMesh = flashMesh;
  weapon.userData.muzzle = weapon.getObjectByName('MuzzleDeviceMesh');

  weapon.position.set(.39, -.48, -1.01);
  weapon.rotation.set(-.025, -.045, -.012);

  gunViewportScene.add(weapon);
  scene.add(camera);

  return weapon;
}
const weapon = createWeapon();
weapon.visible = false;

const worldWeaponAnchor = new THREE.Group();
const worldMuzzleAnchor = new THREE.Object3D();
worldWeaponAnchor.add(worldMuzzleAnchor);
camera.add(worldWeaponAnchor);

const syncWorldWeaponAnchor = () => {
  worldWeaponAnchor.position.copy(weapon.position);
  worldWeaponAnchor.quaternion.copy(weapon.quaternion);
  worldWeaponAnchor.scale.copy(weapon.scale);
  worldMuzzleAnchor.position.copy(
    weapon.userData.muzzle?.position ||
    new THREE.Vector3(0, .04, -2.42),
  );
};

syncWorldWeaponAnchor();

const worldHitMarkers = [];

function createWorldHitMarker() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });

  const armA = new THREE.Mesh(
    new THREE.BoxGeometry(.16, .018, .018),
    material.clone(),
  );
  const armB = new THREE.Mesh(
    new THREE.BoxGeometry(.018, .16, .018),
    material.clone(),
  );
  const armC = new THREE.Mesh(
    new THREE.BoxGeometry(.16, .018, .018),
    material.clone(),
  );
  const armD = new THREE.Mesh(
    new THREE.BoxGeometry(.018, .16, .018),
    material.clone(),
  );

  armA.position.set(.055, .055, 0);
  armB.position.set(.055, .055, 0);
  armC.position.set(-.055, -.055, 0);
  armD.position.set(-.055, -.055, 0);

  group.add(armA, armB, armC, armD);
  group.visible = false;
  scene.add(group);

  return {
    group,
    materials: [
      armA.material,
      armB.material,
      armC.material,
      armD.material,
    ],
    life: 0,
    maxLife: .11,
  };
}

for (let i = 0; i < 16; i += 1) {
  worldHitMarkers.push(createWorldHitMarker());
}

function showWorldHitMarker(position, headshot = false) {
  const marker =
    worldHitMarkers.find(item => item.life <= 0) ||
    worldHitMarkers[0];

  marker.group.position.copy(position);
  marker.group.quaternion.copy(camera.quaternion);

  const scale = headshot ? 1.35 : 1;
  marker.group.scale.setScalar(scale);

  for (const material of marker.materials) {
    material.opacity = 1;
  }

  marker.group.visible = true;
  marker.life = marker.maxLife;

  if (headshot) {
    marker.group.scale.multiplyScalar(1.15);
  }
}

function updateWorldHitMarkers(dt) {
  for (const marker of worldHitMarkers) {
    if (marker.life <= 0) continue;

    marker.life -= dt;

    if (marker.life <= 0) {
      marker.life = 0;
      marker.group.visible = false;
      continue;
    }

    marker.group.quaternion.copy(camera.quaternion);

    const alpha = THREE.MathUtils.clamp(
      marker.life / marker.maxLife,
      0,
      1,
    );

    for (const material of marker.materials) {
      material.opacity = alpha;
    }
  }
}

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

  const box = (
    size,
    position,
    material,
    parent,
    name = '',
    rotation = [0,0,0],
  ) => {
    // Keep the same dimensions/names for the ragdoll, but use real beveled
    // hard-surface geometry so armor no longer looks like raw cubes.
    const minSize = Math.min(...size);
    const geometry = new RoundedBoxGeometry(
      size[0],
      size[1],
      size[2],
      3,
      Math.min(
        .035,
        Math.max(.008, minSize * .12),
      ),
    );

    const mesh = new THREE.Mesh(
      geometry,
      material,
    );

    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (name) mesh.name = name;

    parent.add(mesh);
    return mesh;
  };

  const cyl = (
    rt,
    rb,
    height,
    position,
    material,
    parent,
    rotation = [0,0,0],
    radial = 12,
    name = '',
  ) => {
    const geometry = new THREE.CylinderGeometry(
      rt,
      rb,
      height,
      Math.max(24, radial),
      2,
      false,
    );
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geometry,
      material,
    );

    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (name) mesh.name = name;

    parent.add(mesh);
    return mesh;
  };

  const sphere = (
    radius,
    position,
    material,
    parent,
    scale = [1,1,1],
    name = '',
  ) => {
    const geometry = new THREE.SphereGeometry(
      radius,
      28,
      20,
    );
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geometry,
      material,
    );

    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (name) mesh.name = name;

    parent.add(mesh);
    return mesh;
  };

  const capsule = (
    radius,
    length,
    position,
    material,
    parent,
    rotation = [0,0,0],
    name = '',
  ) => {
    const geometry = new THREE.CapsuleGeometry(
      radius,
      length,
      8,
      20,
    );
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geometry,
      material,
    );

    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (name) mesh.name = name;

    parent.add(mesh);
    return mesh;
  };

  const torus = (
    radius,
    tube,
    position,
    material,
    parent,
    rotation = [0,0,0],
    arc = Math.PI * 2,
    name = '',
  ) => {
    const geometry = new THREE.TorusGeometry(
      radius,
      tube,
      14,
      28,
      arc,
    );
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geometry,
      material,
    );

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

  for (const tracer of tracers) scene.remove(tracer.mesh);
  tracers.length = 0;

  for (const particle of particles) scene.remove(particle.mesh);
  particles.length = 0;

  ragdollController.dispose();
  ragdolls.length = 0;

  for (const gun of droppedGuns) scene.remove(gun.mesh);
  droppedGuns.length = 0;

  for (const shell of shellCasings) scene.remove(shell.mesh);
  shellCasings.length = 0;

  const selected =
    window.__WARFLEX_SELECTED_WAVE === 'endless'
      ? -1
      : Number(window.__WARFLEX_SELECTED_WAVE || state.selectedWave || 1);

  Object.assign(state, {
    active: true,
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
    wave: selected > 0 ? selected : 1,
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
    selectedWave: selected,
    aiming: false,
    aimBlend: 0,
    slideTimer: 0,
    slideCooldown: 0,
    slideQueued: false,
    slideDirection: new THREE.Vector3(),
    combo: 0,
    comboTimer: 0,
  });

  player.position.set(0, 1.65, 56);
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  camera.fov = CONFIG.defaultFov;
  camera.updateProjectionMatrix();

  weapon.position.set(.43, -.48, -1.03);
  weapon.rotation.set(-.03, -.04, -.015);

  updateHud();

  if (waveDirector) {
    waveDirector.wave = state.wave;
    waveDirector.stop();
  }

  if (spawnImmediately && waveDirector) {
    waveDirector.start();
  }
}

function getSpawnPoint(index) {
  // Put the first wave in a clear forward arc so enemies are immediately
  // visible after spawning instead of appearing mostly behind the player.
  const forwardArc = [
    new THREE.Vector3(-64, 0, -61),
    new THREE.Vector3(-34, 0, -64),
    new THREE.Vector3(0, 0, -64),
    new THREE.Vector3(34, 0, -64),
    new THREE.Vector3(64, 0, -61),
    new THREE.Vector3(-96, 0, -48),
    new THREE.Vector3(96, 0, -48),
    new THREE.Vector3(0, 0, -57),
  ];

  const p = forwardArc[index % forwardArc.length].clone();
  if (p.distanceTo(player.position) < 12) p.z -= 8;
  return p;
}

function spawnWave() {
  if (!waveDirector) return;

  waveDirector.wave = state.wave;
  waveDirector.start();
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
  // Keep the fallback at the same size as the detailed enemy model.
  group.scale.setScalar(group.userData.baseScale);

  group.traverse((o) => {
    if (o.isMesh) {
      o.visible = true;
      o.frustumCulled = false;
    }
  });

  return group;
}

function spawnEnemy(index = 0, spawnPosition = null) {
  let group;
  let usedFallback = false;

  try {
    group = spawnEnemyModel();
    let meshCount = 0;
    group.traverse((o) => {
      if (o.isMesh) meshCount += 1;
    });
    if (!meshCount) {
      throw new Error(
        'Enemy model was created without renderable meshes.',
      );
    }
  } catch (error) {
    usedFallback = true;
    showRuntimeError(
      error,
      'Enemy model construction failed; using fallback model',
    );
    group = createEnemyFallbackModel();
  }

  const spawn =
    spawnPosition?.clone() ||
    getSpawnPoint(index);

  group.position.copy(spawn);
  group.scale.setScalar(
    group.userData.baseScale || .54,
  );
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

  if (state.wave >= 2 && roll > .78) {
    role = 'heavy';
  } else if (roll > .38) {
    role = 'rifleman';
  }

  const roleStats = {
    rusher: {
      health: .78,
      speed: 1.22,
      damage: 8,
      cooldown: .72,
      range: 16,
    },
    rifleman: {
      health: 1.00,
      speed: .92,
      damage: 7,
      cooldown: .95,
      range: 42,
    },
    heavy: {
      health: 1.85,
      speed: .62,
      damage: 13,
      cooldown: 1.25,
      range: 38,
    },
  }[role];

  const baseHealth =
    CONFIG.enemyBaseHealth +
    state.wave * 7;

  const visual = group.userData.visuals;

  if (role === 'heavy') {
    visual.armor.color.setHex(0x6f3439);
    visual.lens.emissive.setHex(0x6b121b);
  } else if (role === 'rusher') {
    visual.armor.color.setHex(0x465867);
  }

  const radius =
    role === 'heavy' ? .68 : .58;

  const steering = new SteeringAgent({
    object: group,
    obstacles,
    radius,
    getNeighbors: () =>
      enemies
        .filter(other => !other.dying)
        .map(other => other.group),
  });

  group.userData.role = role;
  group.userData.usedFallback = usedFallback;
  scene.add(group);

  const navAgent = navMeshService.canPathfind
    ? new NavMeshAgent({
        object: group,
        navMesh: navMeshService,
        getTarget: () => player.position,
        speed:
          (CONFIG.enemySpeed +
            Math.min(state.wave * .08, 1.2)) *
          roleStats.speed,
        repathInterval: .35,
        obstacles,
        radius,
        desiredDistance:
          role === 'rusher'
            ? 2.25
            : role === 'rifleman'
              ? 24
              : 26,
      })
    : null;

  enemies.push({
    group,
    role,
    health: baseHealth * roleStats.health,
    maxHealth: baseHealth * roleStats.health,
    speed:
      (CONFIG.enemySpeed +
        Math.min(state.wave * .08, 1.2)) *
      roleStats.speed,
    damage:
      roleStats.damage +
      Math.floor(state.wave * .35),
    attackTimer:
      .55 + Math.random() * roleStats.cooldown,
    attackCooldown: roleStats.cooldown,
    attackRange:
      Math.min(
        CONFIG.enemyShootRange,
        roleStats.range,
      ),
    radius,
    baseScale:
      group.userData.baseScale || .54,
    phase:
      Math.random() * Math.PI * 2,
    walkTime:
      Math.random() * Math.PI * 2,
    animTime:
      Math.random() * Math.PI * 2,
    shootRecoil: 0,
    strafeSign:
      Math.random() < .5 ? -1 : 1,
    strafeTimer:
      .5 + Math.random(),
    hurtFlash: 0,
    deathTimer: 0,
    // Short-lived velocity used for bullet knockback. AI steering still
    // controls normal movement, while this impulse physically pushes the
    // enemy after every successful hit.
    shotVelocity: new THREE.Vector3(),
    dying: false,
    steering,
    navAgent,
  });
}

function createRagdoll(
  enemy,
  impactPoint,
  direction,
  headshot = false,
  hitPart = 'upperBody',
) {
  const rag = ragdollController.create(enemy, {
    hitPoint: impactPoint,
    direction,
    headshot,
    hitPart,
  });

  if (rag) {
    ragdolls.push(rag);
  }

  return rag;
}

function removeEnemy(
  enemy,
  headshot = false,
  hitPoint = null,
  direction = null,
  hitPart = 'upperBody',
) {
  if (enemy.dying) return;

  enemy.dying = true;
  enemy.steering?.stop();

  state.kills += 1;
  state.score += headshot ? 150 : 100;
  state.spawnLeft = Math.max(0, state.spawnLeft - 1);
  state.shake = Math.max(
    state.shake,
    headshot ? .12 : .075,
  );

  spawnBurst(
    hitPoint ||
      enemy.group.position
        .clone()
        .add(new THREE.Vector3(0, 1.2, 0)),
    headshot ? 0xffe6a2 : 0xff5b66,
    headshot ? 18 : 12,
  );

  state.combo += 1;
  state.comboTimer = 2.6;
  state.score +=
    Math.min(state.combo, 10) * 15;

  createRagdoll(
    enemy,
    hitPoint,
    direction,
    headshot,
    hitPart,
  );

  const index = enemies.indexOf(enemy);
  if (index !== -1) {
    enemies.splice(index, 1);
  }

  updateHud();
}

function spawnBurst(position, color, count = 12) {
  for (let i = 0; i < count; i += 1) {
    const size = .035 + Math.random() * .075;

    // Volumetric 3D chunks instead of flat-looking square particles.
    const geometry =
      Math.random() < .65
        ? new THREE.IcosahedronGeometry(size, 0)
        : new THREE.TetrahedronGeometry(size * 1.12, 0);

    const material =
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: .55,
        metalness: .18,
        roughness: .48,
        transparent: true,
        opacity: .96,
      });

    const mesh = new THREE.Mesh(
      geometry,
      material,
    );

    mesh.position.copy(position).add(
      new THREE.Vector3(
        (Math.random() - .5) * .20,
        (Math.random() - .5) * .20,
        (Math.random() - .5) * .20,
      ),
    );

    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    );

    mesh.scale.set(
      .75 + Math.random() * .55,
      .55 + Math.random() * .95,
      .75 + Math.random() * .55,
    );

    scene.add(mesh);

    const vel = new THREE.Vector3(
      (Math.random() - .5) * 8,
      Math.random() * 7 + 1,
      (Math.random() - .5) * 8,
    );

    particles.push({
      mesh,
      vel,
      spin: new THREE.Vector3(
        (Math.random() - .5) * 16,
        (Math.random() - .5) * 16,
        (Math.random() - .5) * 16,
      ),
      life: .22 + Math.random() * .58,
    });
  }
}

function spawnMuzzleVfx() {
  const muzzleWorld = new THREE.Vector3();
  worldMuzzleAnchor.getWorldPosition(muzzleWorld);

  spawnBurst(
    muzzleWorld,
    0xffd36b,
    9,
  );

  // A real 3D muzzle blast: several faceted cones around a bright core.
  const blastGroup = new THREE.Group();
  blastGroup.position.copy(muzzleWorld);

  const blastMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd36b,
    emissive: 0xff9f22,
    emissiveIntensity: 4.2,
    metalness: .05,
    roughness: .28,
    transparent: true,
    opacity: .92,
  });

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(.075, 1),
    blastMaterial.clone(),
  );
  blastGroup.add(core);

  for (let i = 0; i < 4; i += 1) {
    const petal = new THREE.Mesh(
      new THREE.ConeGeometry(
        .045,
        .24 + Math.random() * .15,
        8,
      ),
      blastMaterial.clone(),
    );

    petal.position.set(
      (Math.random() - .5) * .07,
      (Math.random() - .5) * .07,
      -.08 - Math.random() * .04,
    );

    petal.rotation.set(
      (Math.random() - .5) * .55,
      (Math.random() - .5) * .55,
      Math.random() * Math.PI,
    );

    blastGroup.add(petal);
  }

  scene.add(blastGroup);

  particles.push({
    mesh: blastGroup,
    vel: new THREE.Vector3(0, 0, 0),
    spin: new THREE.Vector3(
      0,
      0,
      8,
    ),
    life: .055,
    muzzleBlast: true,
  });

  for (let i = 0; i < 2; i += 1) {
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(
        .025,
        .022,
        .16,
        16,
        2,
      ),
      createMaterial(0xb8a06b, .78, .25),
    );

    shell.position.copy(muzzleWorld).add(
      new THREE.Vector3(
        .08 + Math.random() * .06,
        .02,
        .02,
      ),
    );

    shell.rotation.set(
      Math.random() * 3,
      Math.random() * 3,
      Math.random() * 3,
    );

    scene.add(shell);

    shellCasings.push({
      mesh: shell,
      velocity: new THREE.Vector3(
        .9 + Math.random(),
        1.3 + Math.random() * 1.5,
        (Math.random() - .5) * 1.2,
      ),
      angularVelocity: new THREE.Vector3(
        (Math.random() - .5) * 18,
        (Math.random() - .5) * 18,
        (Math.random() - .5) * 18,
      ),
      resting: false,
      life: 2.4,
    });
  }

  state.shake = Math.max(
    state.shake,
    .055,
  );
}

function addTracer(from, to, color = 0xfff0c8, life = .055) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();

  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 2.8,
    metalness: .05,
    roughness: .24,
    transparent: true,
    opacity: .96,
  });

  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(
      .020,
      .013,
      len,
      12,
      2,
    ),
    material,
  );

  body.position.set(0, 0, 0);
  group.add(body);

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(.028, 12, 8),
    material.clone(),
  );
  tip.position.y = len * .5;
  group.add(tip);

  group.position.copy(from).addScaledVector(
    dir,
    .5,
  );

  group.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.normalize(),
  );

  scene.add(group);
  tracers.push({
    mesh: group,
    life,
  });
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

function getShotDirection() {
  const base =
    new THREE.Vector3(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .normalize();

  const moving =
    keys.has('KeyW') ||
    keys.has('KeyA') ||
    keys.has('KeyS') ||
    keys.has('KeyD');

  const sprinting =
    keys.has('ShiftLeft') ||
    keys.has('ShiftRight');

  const spreadDegrees =
    state.slideTimer > 0
      ? 1.55
      : sprinting
        ? 1.10
        : moving
          ? .55
          : .24;

  const angle =
    THREE.MathUtils.degToRad(
      spreadDegrees,
    );

  if (angle <= 0) {
    return base;
  }

  const right =
    new THREE.Vector3()
      .crossVectors(
        base,
        new THREE.Vector3(0, 1, 0),
      );

  if (right.lengthSq() < .00001) {
    right.set(1, 0, 0);
  }

  right.normalize();

  const up =
    new THREE.Vector3()
      .crossVectors(
        right,
        base,
      )
      .normalize();

  const radius =
    Math.sqrt(Math.random());

  const theta =
    Math.random() *
    Math.PI * 2;

  const offset =
    Math.tan(angle) * radius;

  base
    .addScaledVector(
      right,
      Math.cos(theta) * offset,
    )
    .addScaledVector(
      up,
      Math.sin(theta) * offset,
    )
    .normalize();

  return base;
}

function shoot() {
  if (
    !state.active ||
    state.over ||
    state.reloadTimer > 0 ||
    state.fireTimer > 0
  ) {
    return;
  }

  if (state.ammo <= 0) {
    reload();
    return;
  }

  state.ammo -= 1;
  state.fireTimer =
    CONFIG.fireInterval;

  state.weaponKick = 1;
  state.muzzleFlash = .075;
  state.shake =
    Math.max(
      state.shake,
      .035,
    );

  spawnMuzzleVfx();

  const origin =
    camera.position.clone();

  const direction =
    getShotDirection();

  raycaster.set(
    origin,
    direction,
  );

  const allEnemyMeshes = [];

  for (const enemy of enemies) {
    if (enemy.dying) continue;

    enemy.group.traverse(o => {
      if (o.isMesh) {
        allEnemyMeshes.push(o);
      }
    });
  }

  const wallHits =
    raycaster.intersectObjects(
      obstacles,
      false,
    );

  const enemyHits =
    raycaster.intersectObjects(
      allEnemyMeshes,
      false,
    );

  const ragdollMeshes = [];

  for (const rag of ragdolls) {
    if (
      ragdollController.active.has(rag)
    ) {
      ragdollMeshes.push(
        ...rag.meshes,
      );
    }
  }

  const ragdollHits =
    raycaster.intersectObjects(
      ragdollMeshes,
      false,
    );

  const wallDistance =
    wallHits[0]?.distance ??
    Infinity;

  const enemyHit =
    enemyHits.find(
      hit => hit.distance < wallDistance,
    );

  const ragdollHit =
    ragdollHits.find(
      hit => hit.distance < wallDistance,
    );

  const closestEnemyDistance =
    enemyHit?.distance ??
    Infinity;

  const closestRagdollDistance =
    ragdollHit?.distance ??
    Infinity;

  let hitPoint =
    origin.clone()
      .addScaledVector(
        direction,
        90,
      );

  if (
    closestEnemyDistance <=
      closestRagdollDistance &&
    enemyHit
  ) {
    const enemy =
      enemies.find(e => {
        let found = false;

        e.group.traverse(o => {
          if (o === enemyHit.object) {
            found = true;
          }
        });

        return found;
      });

    if (enemy) {
      const hitPart =
        getRagdollHitPart(
          enemyHit.object,
        );

      const headshot =
        hitPart === 'head';

      enemy.health -=
        headshot ? 70 : 34;

      // Bullets physically shove living enemies backward from the impact.
      // Keep this horizontal so shots do not make soldiers randomly fly
      // upward, and stack repeated hits for a stronger push.
      const knockbackDirection =
        direction.clone();

      knockbackDirection.y = 0;

      if (knockbackDirection.lengthSq() > .0001) {
        knockbackDirection.normalize();

        enemy.shotVelocity.addScaledVector(
          knockbackDirection,
          headshot ? 4.8 : 3.2,
        );

        // Prevent rapid-fire from building an absurd amount of momentum.
        const maxKnockbackSpeed =
          headshot ? 7.5 : 5.5;

        const maxKnockbackSpeedSq =
          maxKnockbackSpeed *
          maxKnockbackSpeed;

        if (
          enemy.shotVelocity.lengthSq() >
          maxKnockbackSpeedSq
        ) {
          enemy.shotVelocity
            .setLength(maxKnockbackSpeed);
        }
      }

      enemy.hurtFlash = .08;

      hitPoint =
        enemyHit.point;

      spawnBurst(
        hitPoint,
        headshot
          ? 0xff8b93
          : 0xcbd6df,
        headshot ? 14 : 8,
      );

      state.score +=
        headshot ? 25 : 10;

      showHitmarker(
        headshot,
      );

      showWorldHitMarker(
        hitPoint,
        headshot,
      );

      if (enemy.health <= 0) {
        removeEnemy(
          enemy,
          headshot,
          hitPoint,
          direction,
          hitPart,
        );
      }
    }
  } else if (ragdollHit) {
    const rag =
      ragdolls.find(
        candidate =>
          ragdollController.active.has(
            candidate,
          ) &&
          candidate.meshes.includes(
            ragdollHit.object,
          ),
      );

    if (rag) {
      hitPoint =
        ragdollHit.point;

      applyRagdollHit(
        rag,
        hitPoint,
        direction,
        ragdollHit.object,
      );

      spawnBurst(
        hitPoint,
        0xcbd6df,
        7,
      );

      showHitmarker(false);
      showWorldHitMarker(
        hitPoint,
        false,
      );
    }
  } else if (wallHits[0]) {
    hitPoint =
      wallHits[0].point;

    spawnBurst(
      hitPoint.clone(),
      0xb8c3cc,
    );
  }

  addTracer(
    origin
      .clone()
      .addScaledVector(
        direction,
        .8,
      ),
    hitPoint,
  );

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
    ) {
      return 'head';
    }

    node = node.parent;
  }

  return 'body';
}

function applyRagdollHit(
  rag,
  hitPoint,
  direction,
  hitObject,
) {
  if (!rag) return;

  const hitPart =
    getRagdollHitPart(hitObject);

  const force =
    hitPart === 'head' ? 4.2 :
    hitPart === 'leftArm' ||
    hitPart === 'rightArm' ? 2.2 :
    hitPart === 'leftLeg' ||
    hitPart === 'rightLeg' ? 1.9 :
    2.8;

  ragdollController.applyBulletImpulse(
    rag,
    hitPoint,
    direction,
    force,
    hitPart,
  );

  ragdollController.update();
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
    enemy.hurtFlash =
      Math.max(0, enemy.hurtFlash - dt);
    enemy.strafeTimer -= dt;

    const toPlayer =
      new THREE.Vector3()
        .subVectors(
          player.position,
          enemy.group.position,
        );

    toPlayer.y = 0;

    const dist = toPlayer.length();

    const desiredDistance =
      enemy.role === 'rusher'
        ? 2.25
        : enemy.role === 'rifleman'
          ? 24
          : 26;

    if (!enemy.navAgent && navMeshService.canPathfind) {
      enemy.navAgent = new NavMeshAgent({
        object: enemy.group,
        navMesh: navMeshService,
        getTarget: () => player.position,
        speed: enemy.speed,
        repathInterval: .35,
        obstacles,
        radius:
          enemy.role === 'heavy'
            ? .68
            : .58,
        desiredDistance:
          enemy.role === 'rusher'
            ? 2.25
            : enemy.role === 'rifleman'
              ? 24
              : 26,
      });
    }

    if (enemy.navAgent) {
      enemy.navAgent.speed = enemy.speed;
      enemy.navAgent.update(dt);
    } else {
      enemy.steering?.update(
        dt,
        player.position,
        {
          speed: enemy.speed,
          desiredDistance,
        },
      );
    }

    /*
     * Ranged enemies add a mild lateral strafe while their steering agent
     * maintains the correct combat distance.
     */
    if (
      enemy.role !== 'rusher' &&
      dist > 16 &&
      dist < 32
    ) {
      if (enemy.strafeTimer <= 0) {
        enemy.strafeTimer =
          .8 + Math.random() * 1.4;
        enemy.strafeSign *= -1;
      }

      const side =
        new THREE.Vector3(
          -toPlayer.z,
          0,
          toPlayer.x,
        );

      if (side.lengthSq() > .001) {
        side.normalize();

        enemy.group.position.addScaledVector(
          side,
          enemy.strafeSign *
            enemy.speed *
            .24 *
            dt,
        );
      }
    }

    // Keep local combat strafing and bullet knockback outside world cover.
    if (enemy.navAgent) {
      enemy.navAgent.resolveCurrentPosition();
    } else {
      enemy.steering?.resolveCurrentPosition();
    }

    // Apply bullet knockback after AI steering/strafe so the hit
    // visibly moves the enemy instead of being overwritten by the pathing
    // controller on the same frame.
    if (enemy.shotVelocity.lengthSq() > .0001) {
      enemy.group.position.addScaledVector(
        enemy.shotVelocity,
        dt,
      );

      if (enemy.navAgent) {
        enemy.navAgent.resolveCurrentPosition();
      } else {
        enemy.steering?.resolveCurrentPosition();
      }

      // Strong initial resistance gives each shot a clear shove without
      // leaving enemies sliding around forever.
      enemy.shotVelocity.multiplyScalar(
        Math.exp(-9.5 * dt),
      );
    } else {
      enemy.shotVelocity.set(0, 0, 0);
    }

    if (
      enemy.role === 'rusher' &&
      dist < 2.65 &&
      enemy.attackTimer <= 0
    ) {
      enemy.attackTimer =
        enemy.attackCooldown;

      damagePlayer(
        enemy.damage + 2,
      );
    }

    if (
      enemy.role !== 'rusher' &&
      enemy.attackTimer <= 0 &&
      dist < enemy.attackRange
    ) {
      enemyShoot(enemy);
    }

    enemy.group.position.x =
      THREE.MathUtils.clamp(
        enemy.group.position.x,
        -122,
        122,
      );

    enemy.group.position.z =
      THREE.MathUtils.clamp(
        enemy.group.position.z,
        -68,
        68,
      );

    const faceX =
      player.position.x -
      enemy.group.position.x;

    const faceZ =
      player.position.z -
      enemy.group.position.z;

    enemy.group.rotation.y =
      Math.atan2(faceX, faceZ) +
      Math.PI;

    const parts =
      enemy.group.userData.parts;

    enemy.shootRecoil =
      Math.max(
        0,
        enemy.shootRecoil - dt * 7,
      );

    const movementVelocity =
      enemy.navAgent?.velocity ||
      enemy.steering?.velocity;

    const moving =
      movementVelocity?.lengthSq() >
      .05;

    const moveAmount =
      enemy.role === 'rusher'
        ? 1
        : .48;

    const stride =
      Math.sin(enemy.animTime) *
      moveAmount *
      (moving ? 1 : .2);

    const counterStride =
      Math.sin(
        enemy.animTime + Math.PI,
      ) *
      moveAmount *
      (moving ? 1 : .2);

    const bounce =
      Math.abs(
        Math.sin(enemy.animTime * .5),
      ) *
      (
        enemy.role === 'rusher'
          ? .035
          : .015
      );

    const breath =
      Math.sin(
        enemy.animTime * .65 +
        enemy.phase,
      ) * .018;

    const isAiming =
      enemy.role !== 'rusher';

    parts.leftLeg.rotation.x =
      -stride *
      (enemy.role === 'rusher' ? .72 : .28);

    parts.rightLeg.rotation.x =
      -counterStride *
      (enemy.role === 'rusher' ? .72 : .28);

    parts.leftKnee.rotation.x =
      Math.max(0, stride) *
      (enemy.role === 'rusher' ? .34 : .12);

    parts.rightKnee.rotation.x =
      Math.max(0, counterStride) *
      (enemy.role === 'rusher' ? .34 : .12);

    if (isAiming) {
      parts.leftArm.rotation.x =
        -.34 +
        counterStride * .08 +
        breath;

      parts.rightArm.rotation.x =
        -.30 +
        stride * .08 -
        breath;

      parts.leftArm.rotation.z = .08;
      parts.rightArm.rotation.z = -.08;
    } else {
      parts.leftArm.rotation.x =
        -.08 + stride * .42;

      parts.rightArm.rotation.x =
        -.10 + counterStride * .42;

      parts.leftArm.rotation.z = .10;
      parts.rightArm.rotation.z = -.10;
    }

    parts.upperBody.rotation.x =
      isAiming
        ? -.035 + breath * .35
        : -.065 + breath * .25;

    parts.upperBody.rotation.z =
      Math.sin(
        enemy.animTime * .5 +
        enemy.phase,
      ) * .012;

    parts.hips.position.y =
      1.42 + bounce;

    if (parts.head?.isObject3D) {
      parts.head.rotation.x =
        Math.sin(
          enemy.animTime * .42 +
          enemy.phase,
        ) * .025;

      parts.head.rotation.y =
        Math.sin(
          enemy.animTime * .27 +
          enemy.phase,
        ) * .07;
    }

    parts.rifle.rotation.x =
      .02 -
      enemy.shootRecoil * .16 +
      breath * .2;

    parts.rifle.rotation.z =
      -.08 +
      Math.sin(
        enemy.animTime * .55,
      ) * .01;

    enemy.walkTime +=
      dt *
      (enemy.role === 'rusher'
        ? 11
        : 7);

    enemy.animTime +=
      dt *
      (enemy.role === 'rusher'
        ? 12
        : 6.5);
  }
}

function updateRagdolls(dt) {
  physicsWorld.step(dt);
  ragdollController.update();

  for (let i = ragdolls.length - 1; i >= 0; i -= 1) {
    if (!ragdollController.active.has(ragdolls[i])) {
      ragdolls.splice(i, 1);
    }
  }
}

function updateWave(dt) {
  waveDirector?.update(dt);
}

function updateWeapon(dt) {
  const moving = keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD');
  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const bobSpeed = sprinting ? 15 : 10;
  const bobAmount = moving && state.onGround ? (sprinting ? .035 : .018) : .006;
  const t = performance.now() * .001;

  state.weaponKick = Math.max(0, state.weaponKick - dt * 10);
  state.muzzleFlash = Math.max(0, state.muzzleFlash - dt);

  // Smooth first-person ADS. Hold right mouse to bring the optic toward
  // the center of the screen and tighten the camera FOV.
  const targetAim =
    state.aiming && state.active && !state.over
      ? 1
      : 0;

  state.aimBlend = THREE.MathUtils.damp(
    state.aimBlend,
    targetAim,
    15,
    dt,
  );

  const breathing = Math.sin(t * 1.7) * .006;
  const hipBobX =
    Math.sin(t * bobSpeed) *
    bobAmount;

  const hipBobY =
    breathing +
    Math.abs(Math.cos(t * bobSpeed)) *
    bobAmount;

  const hipPosition = new THREE.Vector3(
    .39 + hipBobX,
    -.48 + hipBobY - state.weaponKick * .045,
    -1.01 + state.weaponKick * .09,
  );

  // Keep the rifle narrow and bring its optic onto the camera centerline.
  const adsPosition = new THREE.Vector3(
    -.005,
    -.405 - state.weaponKick * .015,
    -.78 + state.weaponKick * .035,
  );

  weapon.position.lerpVectors(
    hipPosition,
    adsPosition,
    state.aimBlend,
  );

  const hipRotation = new THREE.Euler(
    -.025 - state.weaponKick * .09,
    -.045 + Math.sin(t * bobSpeed * .5) * bobAmount * 1.2,
    -.012 + Math.sin(t * bobSpeed) * bobAmount * .8,
  );

  const adsRotation = new THREE.Euler(
    -.015 - state.weaponKick * .035,
    -.002,
    0,
  );

  weapon.rotation.set(
    THREE.MathUtils.lerp(hipRotation.x, adsRotation.x, state.aimBlend),
    THREE.MathUtils.lerp(hipRotation.y, adsRotation.y, state.aimBlend),
    THREE.MathUtils.lerp(hipRotation.z, adsRotation.z, state.aimBlend),
  );

  const targetFov =
    THREE.MathUtils.lerp(
      CONFIG.defaultFov,
      54,
      state.aimBlend,
    );

  camera.fov =
    THREE.MathUtils.damp(
      camera.fov,
      targetFov,
      14,
      dt,
    );
  camera.updateProjectionMatrix();
  weapon.children.forEach((child) => {
    if (child.isMesh) child.frustumCulled = false;
  });

  const visible = state.active && !state.over;
  weapon.visible = visible;
  gunViewportRenderer.domElement.style.display = visible ? 'block' : 'none';
  syncWorldWeaponAnchor();

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

    tracers[i].mesh.traverse((child) => {
      if (
        child.material &&
        'opacity' in child.material
      ) {
        child.material.opacity =
          Math.max(
            0,
            tracers[i].life * 18,
          );
      }
    });

    if (tracers[i].life <= 0) {
      scene.remove(tracers[i].mesh);
      tracers.splice(i, 1);
    }
  }

  // Brass casing physics. Casings receive gravity, bounce, lose energy,
  // and reliably settle on the arena floor.
  for (let i = shellCasings.length - 1; i >= 0; i -= 1) {
    const shell = shellCasings[i];
    shell.life -= dt;

    if (!shell.resting) {
      shell.velocity.y -= 24 * dt;

      shell.mesh.position.addScaledVector(
        shell.velocity,
        dt,
      );

      shell.mesh.rotation.x +=
        shell.angularVelocity.x * dt;
      shell.mesh.rotation.y +=
        shell.angularVelocity.y * dt;
      shell.mesh.rotation.z +=
        shell.angularVelocity.z * dt;

      const floorY = .028;

      if (shell.mesh.position.y <= floorY) {
        shell.mesh.position.y = floorY;

        if (Math.abs(shell.velocity.y) > .55) {
          shell.velocity.y =
            Math.abs(shell.velocity.y) * .24;

          shell.velocity.x *= .68;
          shell.velocity.z *= .68;
          shell.angularVelocity.multiplyScalar(.58);
        } else {
          shell.velocity.set(0, 0, 0);
          shell.angularVelocity.multiplyScalar(.10);
          shell.resting = true;
        }
      }
    }

    shell.velocity.x *= Math.exp(-2.3 * dt);
    shell.velocity.z *= Math.exp(-2.3 * dt);

    if (shell.resting) {
      shell.angularVelocity.multiplyScalar(
        Math.exp(-8 * dt),
      );
    }

    if (shell.life <= 0) {
      scene.remove(shell.mesh);
      shellCasings.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;

    if (p.muzzleBlast) {
      p.mesh.scale.multiplyScalar(
        1 + dt * 18,
      );
    } else {
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(
        p.vel,
        dt,
      );

      if (p.spin) {
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;
      }
    }

    p.mesh.traverse((child) => {
      if (!child.material) return;
      if ('opacity' in child.material) {
        child.material.opacity =
          Math.max(
            0,
            Math.min(
              .96,
              p.life * (p.muzzleBlast ? 20 : 2.8),
            ),
          );
      }
    });

    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }

  updateWorldHitMarkers(dt);

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

  const dt =
    Math.min(
      clock.getDelta(),
      .05,
    );

  if (
    state.active &&
    document.pointerLockElement ===
      renderer.domElement
  ) {
    movePlayer(dt);
    updateEnemies(dt);
    updateWave(dt);
    tickEffects(dt);
  } else {
    tickEffects(dt);
  }

  updateRagdolls(dt);
  updateWeapon(dt);

  state.shake =
    Math.max(
      0,
      state.shake - dt * 1.9,
    );

  if (
    state.shake > 0 &&
    state.active
  ) {
    camera.position.x +=
      (Math.random() - .5) *
      state.shake;

    camera.position.y +=
      (Math.random() - .5) *
      state.shake;

    camera.rotation.z +=
      (Math.random() - .5) *
      state.shake *
      .7;
  }

  atmosphere.composer.render(dt);

  if (state.active && !state.over) {
    gunViewportRenderer.render(
      gunViewportScene,
      gunViewportCamera,
    );
  }
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

let directorWaveInitialized = false;

const waveDirectorSpawnPoints = [
  new THREE.Vector3(-64, 0, -61),
  new THREE.Vector3(-34, 0, -64),
  new THREE.Vector3(0, 0, -64),
  new THREE.Vector3(34, 0, -64),
  new THREE.Vector3(64, 0, -61),
  new THREE.Vector3(-96, 0, -48),
  new THREE.Vector3(96, 0, -48),
  new THREE.Vector3(0, 0, -57),
];

function getWaveSpawnPoints() {
  return waveDirectorSpawnPoints.map(
    point => {
      const next = point.clone();

      if (
        next.distanceTo(player.position) <
        12
      ) {
        next.z -= 8;
      }

      return next;
    },
  );
}

waveDirector = new WaveDirector({
  camera,
  player,
  obstacles,
  getSpawnPoints:
    getWaveSpawnPoints,
  spawnEnemy:
    (index, spawnPosition) =>
      spawnEnemy(
        index,
        spawnPosition,
      ),
  getAliveCount:
    () => enemies.length,
  startWave: state.wave,
  intermissionSeconds: 2,
  baseSpawnCount: 4,
  spawnGrowth: 2,
  maxWaveSpawn: 18,
  maxEnemies: 28,
  spawnInterval: .10,
  onWaveChanged: (wave) => {
    if (
      directorWaveInitialized &&
      wave !== state.selectedWave
    ) {
      state.reserve =
        Math.min(
          CONFIG.reserveAmmo +
            (wave - 1) * 10,
          state.reserve + 45,
        );

      state.health =
        Math.min(
          CONFIG.maxHealth,
          state.health + 12,
        );
    }

    state.wave = wave;
    directorWaveInitialized = true;
    updateHud();
  },
});

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
  // Put the UI into gameplay state first. Optional systems must not be able
  // to prevent the player from entering the arena.
  renderer.domElement.style.display = 'block';
  els.start.classList.add('hidden');
  els.pause.classList.add('hidden');
  els.gameOver.classList.add('hidden');
  els.hud.classList.remove('hidden');

  try {
    resetGame(false);
  } catch (error) {
    console.error('[WARFLEX] resetGame failed during start:', error);
    // A first launch has no enemies/ragdolls that need cleanup. Restore only
    // the minimum gameplay state and continue into the arena.
    Object.assign(state, {
      active: true,
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
      wave: Number(state.selectedWave) > 0 ? Number(state.selectedWave) : 1,
      reloadTimer: 0,
      damageCooldown: 0,
      hurtFlash: 0,
      weaponKick: 0,
      muzzleFlash: 0,
      shake: 0,
      slideTimer: 0,
      slideCooldown: 0,
      slideQueued: false,
      combo: 0,
      comboTimer: 0,
    });
    player.position.set(0, 1.65, 56);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    camera.fov = CONFIG.defaultFov;
    camera.updateProjectionMatrix();
    updateHud();
  }

  if (waveDirector) {
    try {
      waveDirector.wave = state.wave;
      waveDirector.start();
    } catch (error) {
      console.error('[WARFLEX] wave director failed during start:', error);
    }
  }

  try {
    renderer.domElement.requestPointerLock?.();
  } catch (error) {
    console.warn('[WARFLEX] Pointer lock unavailable:', error);
  }
}

window.WARFLEX_START_GAME = enterGame;
if (startRequestedBeforeBoot) {
  startRequestedBeforeBoot = false;
  enterGame();
}
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
window.addEventListener('blur', () => {
  keys.clear();
  state.aiming = false;
});

window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement || state.over) return;
  state.yaw -= event.movementX * CONFIG.mouseSensitivity;
  state.pitch -= event.movementY * CONFIG.mouseSensitivity;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -Math.PI / 2 + .02, Math.PI / 2 - .02);
});

renderer.domElement.addEventListener('mousedown', (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;

  if (event.button === 0) {
    shoot();
  }

  if (event.button === 2) {
    state.aiming = true;
    event.preventDefault();
  }
});

window.addEventListener('mouseup', (event) => {
  if (event.button === 2) {
    state.aiming = false;
  }
});

renderer.domElement.addEventListener('contextmenu', (event) => {
  event.preventDefault();
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
  gunViewportRenderer.setSize(innerWidth, innerHeight);
  gunViewportCamera.aspect = innerWidth / innerHeight;
  gunViewportCamera.updateProjectionMatrix();
  atmosphere.resize(innerWidth, innerHeight);
});

camera.position.set(0, 0, 0);
checkForUpdates(true);
setInterval(() => checkForUpdates(false), 30000);
frame();
