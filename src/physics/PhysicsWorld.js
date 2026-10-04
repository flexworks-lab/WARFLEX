import * as CANNON from 'cannon-es';

const THREE_TO_CANNON = 1;

export class PhysicsWorld {
  constructor({
    gravity = -22,
    fixedStep = 1 / 60,
    maxSubSteps = 3,
  } = {}) {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, gravity, 0),
      allowSleep: true,
    });

    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.55;
    this.world.defaultContactMaterial.restitution = 0.08;

    this.fixedStep = fixedStep;
    this.maxSubSteps = maxSubSteps;
    this.accumulator = 0;

    this.staticGroup = 1;
    this.ragdollGroup = 2;
  }

  addBox(size, position, {
    group = this.staticGroup,
    mask = this.ragdollGroup,
    friction = 0.8,
    restitution = 0.02,
  } = {}) {
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: new CANNON.Material({
        friction,
        restitution,
      }),
      collisionFilterGroup: group,
      collisionFilterMask: mask,
    });

    body.addShape(
      new CANNON.Box(
        new CANNON.Vec3(
          size.x * 0.5 * THREE_TO_CANNON,
          size.y * 0.5 * THREE_TO_CANNON,
          size.z * 0.5 * THREE_TO_CANNON,
        )
      )
    );

    body.position.set(
      position.x,
      position.y,
      position.z,
    );

    this.world.addBody(body);
    return body;
  }

  addGround(width = 110, depth = 110, y = -0.5) {
    return this.addBox(
      { x: width, y: 1, z: depth },
      { x: 0, y, z: 0 },
    );
  }

  addTerrainHeightfield({
    width,
    depth,
    sampleHeight,
    minHeight = -1,
    resolutionX = 64,
    resolutionZ = 40,
  } = {}) {
    if (typeof sampleHeight !== 'function') return null;

    const data = [];
    let terrainMin = Infinity;

    for (let ix = 0; ix <= resolutionX; ix += 1) {
      const column = [];
      const x = THREE_TO_CANNON * (-width * 0.5 + (ix / resolutionX) * width);

      for (let iz = 0; iz <= resolutionZ; iz += 1) {
        const z = THREE_TO_CANNON * (-depth * 0.5 + (iz / resolutionZ) * depth);
        const y = Number(sampleHeight(x, z));
        const safeY = Number.isFinite(y) ? y : minHeight;
        terrainMin = Math.min(terrainMin, safeY);
        column.push(safeY);
      }

      data.push(column);
    }

    terrainMin = Math.min(terrainMin, minHeight);

    // Cannon's Heightfield uses Z as its local height axis. Rotate the shape
    // so Cannon-Z becomes world-Y, matching WARFLEX's Three.js coordinate system.
    const shifted = data.map(column =>
      column.map(y => y - terrainMin)
    );

    const shape = new CANNON.Heightfield(shifted, {
      elementSize: (width / resolutionX) * THREE_TO_CANNON,
    });

    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: new CANNON.Material({
        friction: 0.82,
        restitution: 0.01,
      }),
      collisionFilterGroup: this.staticGroup,
      collisionFilterMask: this.ragdollGroup,
    });

    body.addShape(
      shape,
      new CANNON.Vec3(0, 0, 0),
      new CANNON.Quaternion(
        -Math.SQRT1_2,
        0,
        0,
        Math.SQRT1_2,
      ),
    );

    body.position.set(
      -width * 0.5,
      terrainMin,
      depth * 0.5,
    );

    this.world.addBody(body);
    return body;
  }

  syncArena(obstacles = [], terrain = null) {
    const bodies = [];

    if (
      terrain &&
      typeof terrain.sampleHeight === 'function'
    ) {
      const terrainBody = this.addTerrainHeightfield(terrain);
      if (terrainBody) bodies.push(terrainBody);
    } else {
      // Flat fallback ground for custom/editor maps.
      bodies.push(
        this.addGround(264, 154, -0.5),
      );
    }

    for (const obstacle of obstacles) {
      const p = obstacle.geometry?.parameters;
      if (!p) continue;

      const size = {
        x: p.width ?? 1,
        y: p.height ?? 1,
        z: p.depth ?? 1,
      };

      bodies.push(
        this.addBox(
          size,
          obstacle.position,
        ),
      );
    }

    return bodies;
  }

  removeBodies(bodies = []) {
    for (const body of bodies) {
      this.world.removeBody(body);
    }
  }

  step(dt) {
    this.accumulator += Math.min(dt, 0.1);

    let steps = 0;
    while (
      this.accumulator >= this.fixedStep &&
      steps < this.maxSubSteps
    ) {
      this.world.step(this.fixedStep);
      this.accumulator -= this.fixedStep;
      steps += 1;
    }

    if (steps === this.maxSubSteps) {
      this.accumulator = Math.min(
        this.accumulator,
        this.fixedStep,
      );
    }
  }

  dispose() {
    for (const body of [...this.world.bodies]) {
      this.world.removeBody(body);
    }

    for (const constraint of [...this.world.constraints]) {
      this.world.removeConstraint(constraint);
    }
  }
}
