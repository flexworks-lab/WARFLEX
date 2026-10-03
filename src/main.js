import * as THREE from 'three';

const CONFIG = {
  maxHealth: 100,
  magSize: 30,
  reserveAmmo: 120,
  fireInterval: 0.105,
  reloadTime: 1.35,
  walkSpeed: 7.5,
  sprintSpeed: 11.5,
  jumpSpeed: 7.8,
  gravity: 22,
  mouseSensitivity: 0.0018,
  enemyBaseHealth: 55,
  enemySpeed: 2.7,
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
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a0e);
scene.fog = new THREE.Fog(0x070a0e, 28, 110);

const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 180);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

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
};

const player = {
  position: new THREE.Vector3(0, 1.65, 18),
  radius: 0.45,
};

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
  for (const [size, position] of border) {
    obstacles.push(makeBox(size, position, 0x10151b));
  }

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

  const lightPositions = [
    [-25, 8, -25], [25, 8, -25], [-25, 8, 25], [25, 8, 25], [0, 10, 0],
  ];
  for (const [x, y, z] of lightPositions) {
    const light = new THREE.PointLight(0xdcecff, 35, 28, 2);
    light.position.set(x, y, z);
    scene.add(light);
  }
}

addArena();

function resetGame() {
  for (const enemy of enemies) scene.remove(enemy.group);
  enemies.length = 0;
  for (const t of tracers) scene.remove(t.mesh);
  tracers.length = 0;
  for (const p of particles) scene.remove(p.mesh);
  particles.length = 0;

  Object.assign(state, {
    active: true, over: false, yaw: 0, pitch: 0, verticalVelocity: 0, onGround: true,
    health: CONFIG.maxHealth, ammo: CONFIG.magSize, reserve: CONFIG.reserveAmmo,
    kills: 0, score: 0, wave: 1, spawnLeft: 0, nextWaveTimer: 0,
    fireTimer: 0, reloadTimer: 0, damageCooldown: 0, hurtFlash: 0, walkTime: 0,
  });
  player.position.set(0, 1.65, 18);
  camera.position.copy(player.position);
  camera.rotation.set(0, 0, 0);
  spawnWave();
  updateHud();
}

function spawnWave() {
  const count = Math.min(4 + state.wave * 2, 18);
  state.spawnLeft = count;
  for (let i = 0; i < count; i += 1) spawnEnemy(i);
  state.nextWaveTimer = 0;
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

function spawnEnemy(index = 0) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 1.8, 1.05),
    new THREE.MeshStandardMaterial({ color: 0x9ca8b4, roughness: .65, metalness: .1 })
  );
  body.position.y = 0.95;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(.9, .9, .9),
    new THREE.MeshStandardMaterial({ color: 0xcbd4db, roughness: .7 })
  );
  head.position.y = 2.3;
  head.castShadow = true;
  group.add(head);

  const eye = new THREE.Mesh(
    new THREE.BoxGeometry(.55, .12, .05),
    new THREE.MeshBasicMaterial({ color: 0xff3d3d })
  );
  eye.position.set(0, 2.32, -.46);
  group.add(eye);

  const spawn = getSpawnPoint(index);
  group.position.copy(spawn);
  scene.add(group);

  enemies.push({
    group,
    health: CONFIG.enemyBaseHealth + state.wave * 7,
    maxHealth: CONFIG.enemyBaseHealth + state.wave * 7,
    speed: CONFIG.enemySpeed + Math.min(state.wave * .08, 1.2),
    attackTimer: 0.7 + Math.random() * 1.4,
    radius: 0.8,
    phase: Math.random() * Math.PI * 2,
  });
}

function removeEnemy(enemy, headshot = false) {
  const idx = enemies.indexOf(enemy);
  if (idx !== -1) enemies.splice(idx, 1);
  spawnBurst(enemy.group.position, headshot ? 0xffe6a2 : 0xdfe8ef);
  scene.remove(enemy.group);
  state.kills += 1;
  state.score += headshot ? 150 : 100;
  state.spawnLeft -= 1;
  updateHud();
}

function spawnBurst(position, color) {
  for (let i = 0; i < 8; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(.08, .08, .08),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.copy(position).add(new THREE.Vector3(0, 1.3, 0));
    scene.add(mesh);
    const vel = new THREE.Vector3((Math.random()-.5)*5, Math.random()*5, (Math.random()-.5)*5);
    particles.push({ mesh, vel, life: .4 + Math.random() * .3 });
  }
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
    if (Math.abs(next.x - wall.position.x) < hx && Math.abs(next.z - wall.position.z) < hz &&
        next.y < wall.position.y + (p.height ?? 1) / 2 + 0.8) return true;
  }
  return false;
}

function movePlayer(dt) {
  const move = new THREE.Vector3();
  if (keys.has('KeyW')) move.z -= 1;
  if (keys.has('KeyS')) move.z += 1;
  if (keys.has('KeyA')) move.x -= 1;
  if (keys.has('KeyD')) move.x += 1;
  const moving = move.lengthSq() > 0;
  if (moving) move.normalize();

  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = sprinting ? CONFIG.sprintSpeed : CONFIG.walkSpeed;

  const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
  const velocity = new THREE.Vector3()
    .addScaledVector(right, move.x * speed)
    .addScaledVector(forward, move.z * speed);

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
  const bob = moving && state.onGround ? Math.sin(state.walkTime) * (sprinting ? .045 : .028) : 0;
  camera.position.copy(player.position);
  camera.position.y += bob;
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

  const origin = camera.position.clone();
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  raycaster.set(origin, direction);
  const targets = enemies.flatMap(e => e.group.children);
  const wallHits = raycaster.intersectObjects(obstacles, false);
  const enemyHits = raycaster.intersectObjects(targets, false);
  let hitPoint = origin.clone().addScaledVector(direction, 90);
  const wallDistance = wallHits[0]?.distance ?? Infinity;
  const enemyHit = enemyHits.find(hit => hit.distance < wallDistance);

  if (enemyHit) {
    const enemy = enemies.find(e => e.group === enemyHit.object.parent || e.group === enemyHit.object.parent?.parent);
    if (enemy) {
      const headshot = enemyHit.object === enemy.group.children[1] || enemyHit.object.position.y > 1.7;
      enemy.health -= headshot ? 70 : 34;
      hitPoint = enemyHit.point;
      state.score += headshot ? 25 : 10;
      showHitmarker(headshot);
      if (enemy.health <= 0) removeEnemy(enemy, headshot);
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
  state.hurtFlash = .12;
  updateHud();
  if (state.health <= 0) endGame();
}

function updateEnemies(dt) {
  for (const enemy of enemies) {
    enemy.attackTimer -= dt;
    const toPlayer = new THREE.Vector3().subVectors(player.position, enemy.group.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (dist > 2.2) {
      toPlayer.normalize();
      enemy.group.position.addScaledVector(toPlayer, enemy.speed * dt);
      enemy.group.position.x = THREE.MathUtils.clamp(enemy.group.position.x, -51, 51);
      enemy.group.position.z = THREE.MathUtils.clamp(enemy.group.position.z, -51, 51);
    }
    enemy.group.lookAt(player.position.x, enemy.group.position.y + 1.1, player.position.z);

    if (dist < 18 && enemy.attackTimer <= 0) {
      enemy.attackTimer = Math.max(.45, 1.25 - state.wave * .03);
      const chance = THREE.MathUtils.clamp(1 - dist / 22, .1, .8);
      if (Math.random() < chance) damagePlayer(6 + Math.floor(state.wave * 0.6));
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
  if (state.hurtFlash > 0) renderer.domElement.style.filter = 'brightness(1.15) contrast(1.1)';
  else renderer.domElement.style.filter = '';
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
  renderer.render(scene, camera);
}

function enterGame() {
  resetGame();
  els.start.classList.add('hidden');
  els.pause.classList.add('hidden');
  els.gameOver.classList.add('hidden');
  els.hud.classList.remove('hidden');
  renderer.domElement.requestPointerLock();
}

els.startButton.addEventListener('click', enterGame);
els.resumeButton.addEventListener('click', () => renderer.domElement.requestPointerLock());
els.restartButton.addEventListener('click', enterGame);

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
  if (state.active && !state.over && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
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

camera.position.set(0, 4.5, 32);
camera.lookAt(0, 4, 0);
frame();