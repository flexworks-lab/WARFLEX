import * as THREE from 'three';

export const WAVE_STATE = Object.freeze({
  INTERMISSION: 'INTERMISSION',
  ACTIVE: 'ACTIVE',
  COMPLETE: 'COMPLETE',
});

export class WaveDirector {
  constructor({
    camera,
    player,
    obstacles,
    getSpawnPoints,
    spawnEnemy,
    getAliveCount,
    onWaveChanged,
    startWave = 1,
    intermissionSeconds = 2,
    baseSpawnCount = 4,
    spawnGrowth = 2,
    maxWaveSpawn = 18,
    maxEnemies = 28,
    spawnInterval = 0.08,
  }) {
    this.camera = camera;
    this.player = player;
    this.obstacles = obstacles;
    this.getSpawnPoints = getSpawnPoints;
    this.spawnEnemy = spawnEnemy;
    this.getAliveCount = getAliveCount;
    this.onWaveChanged = onWaveChanged;

    this.state = WAVE_STATE.INTERMISSION;
    this.wave = startWave;

    this.intermissionTimer = 0;
    this.spawnTimer = 0;
    this.queue = [];
    this.maxEnemies = maxEnemies;
    this.baseSpawnCount = baseSpawnCount;
    this.spawnGrowth = spawnGrowth;
    this.maxWaveSpawn = maxWaveSpawn;
    this.spawnInterval = spawnInterval;
    this.spawnIndex = 0;

    this.frustum = new THREE.Frustum();
    this.projection = new THREE.Matrix4();
    this.raycaster = new THREE.Raycaster();
  }

  start() {
    this.state = WAVE_STATE.INTERMISSION;
    this.intermissionTimer = 0;
    this.queue.length = 0;
  }

  stop() {
    this.state = WAVE_STATE.COMPLETE;
    this.queue.length = 0;
  }

  update(dt) {
    if (this.state === WAVE_STATE.INTERMISSION) {
      this.intermissionTimer -= dt;

      if (this.intermissionTimer <= 0) {
        this.#beginWave();
      }

      return;
    }

    if (this.state === WAVE_STATE.ACTIVE) {
      this.#updateActive(dt);
      return;
    }

    if (
      this.state === WAVE_STATE.COMPLETE &&
      this.getAliveCount() === 0
    ) {
      this.state = WAVE_STATE.INTERMISSION;
      this.intermissionTimer = 2;
    }
  }

  #beginWave() {
    const spawnCount = Math.min(
      this.baseSpawnCount +
        Math.max(0, this.wave - 1) *
        this.spawnGrowth,
      this.maxWaveSpawn,
    );

    this.queue.length = spawnCount;
    for (let i = 0; i < spawnCount; i++) {
      this.queue[i] = i;
    }

    this.spawnTimer = 0;
    this.spawnIndex = 0;
    this.state = WAVE_STATE.ACTIVE;

    this.onWaveChanged?.(this.wave);
  }

  #updateActive(dt) {
    this.spawnTimer -= dt;

    if (
      this.queue.length > 0 &&
      this.spawnTimer <= 0 &&
      this.getAliveCount() < this.getMaxEnemies()
    ) {
      const spawnPosition =
        this.findSpawnPoint(
          this.spawnIndex,
        );

      if (spawnPosition) {
        const index = this.queue.shift();
        this.spawnEnemy(index, spawnPosition);

        this.spawnIndex += 1;
        this.spawnTimer = this.spawnInterval;
      } else {
        this.spawnTimer = 0.12;
      }
    }

    if (
      this.queue.length === 0 &&
      this.getAliveCount() === 0
    ) {
      this.state = WAVE_STATE.COMPLETE;
      this.wave += 1;
    }
  }

  getMaxEnemies() {
    return Math.min(
      this.maxEnemies,
      Math.floor(
        this.baseSpawnCount +
        Math.sqrt(this.wave) * 5,
      ),
    );
  }

  getEnemyScale() {
    return {
      health:
        1 +
        Math.pow(1.11, Math.max(0, this.wave - 1)) - 1,
      speed:
        1 +
        Math.pow(1.035, Math.max(0, this.wave - 1)) - 1,
    };
  }

  findSpawnPoint(index = 0) {
    this.projection.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );

    this.frustum.setFromProjectionMatrix(
      this.projection,
    );

    const points = this.getSpawnPoints();

    if (!points.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const point of points) {
      const distance = point.distanceTo(
        this.player.position,
      );

      if (distance < 14) continue;

      const sphere = new THREE.Sphere(
        point.clone(),
        1.5,
      );

      if (this.frustum.intersectsSphere(sphere)) {
        continue;
      }

      if (this.#hasLineOfSight(point)) {
        continue;
      }

      const cameraForward = new THREE.Vector3();
      this.camera.getWorldDirection(cameraForward);

      const toPoint = point.clone()
        .sub(this.camera.position)
        .normalize();

      // Higher score = farther from direct sight + farther from player.
      const behindScore =
        1 -
        cameraForward.dot(toPoint);

      const distanceScore =
        THREE.MathUtils.clamp(
          distance / 45,
          0,
          2,
        );

      const jitter =
        Math.sin(
          (index + 1) *
          (point.x * 0.13 + point.z * 0.07)
        ) * 0.15;

      const score =
        behindScore * 3 +
        distanceScore * 2 +
        jitter;

      if (score > bestScore) {
        bestScore = score;
        best = point;
      }
    }

    if (best) return best.clone();

    // Fallback: farthest spawn point when every point is technically visible.
    let fallback = points[0];
    let fallbackDistance = -Infinity;

    for (const point of points) {
      const distance = point.distanceTo(
        this.player.position,
      );

      if (distance > fallbackDistance) {
        fallback = point;
        fallbackDistance = distance;
      }
    }

    return fallback.clone();
  }

  #hasLineOfSight(point) {
    const origin =
      this.camera.getWorldPosition(
        new THREE.Vector3(),
      );

    const direction =
      point.clone().sub(origin);

    const distance = direction.length();
    if (distance <= 0.01) return true;

    direction.normalize();

    this.raycaster.set(origin, direction);
    this.raycaster.near = 0;
    this.raycaster.far = distance;

    const hits =
      this.raycaster.intersectObjects(
        this.obstacles,
        false,
      );

    return hits.length === 0;
  }
}
