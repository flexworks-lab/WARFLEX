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

  syncArena(obstacles = []) {
    const bodies = [];

    // The fallback battlefield is 260m x 150m. Keep the physics floor
    // larger than the playable footprint so ragdolls never fall off the map.
    bodies.push(
      this.addGround(264, 154, -0.5),
    );

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
