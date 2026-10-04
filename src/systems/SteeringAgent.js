import * as THREE from 'three';

export class SteeringAgent {
  constructor({
    object,
    obstacles = [],
    getNeighbors = () => [],
    radius = 0.55,
  }) {
    this.object = object;
    this.obstacles = obstacles;
    this.getNeighbors = getNeighbors;
    this.radius = radius;

    this.velocity = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.separation = new THREE.Vector3();
    this.avoidance = new THREE.Vector3();
    this.toTarget = new THREE.Vector3();
    this.side = new THREE.Vector3();

    this.raycaster = new THREE.Raycaster();
  }

  update(dt, target, {
    speed = 2.7,
    desiredDistance = 2.2,
  } = {}) {
    this.toTarget
      .subVectors(target, this.object.position);

    this.toTarget.y = 0;

    const distance = this.toTarget.length();
    if (distance > 0.001) {
      this.toTarget.normalize();
    }

    const approach =
      THREE.MathUtils.clamp(
        (distance - desiredDistance) / 5,
        -1,
        1,
      );

    this.desired
      .copy(this.toTarget)
      .multiplyScalar(speed * approach);

    this.separation.set(0, 0, 0);

    for (const neighbor of this.getNeighbors()) {
      if (!neighbor || neighbor === this.object) continue;

      const delta =
        this.object.position
          .clone()
          .sub(neighbor.position);

      delta.y = 0;

      const distanceToNeighbor = delta.length();
      const minimum = this.radius * 2.1;

      if (
        distanceToNeighbor < 0.001 ||
        distanceToNeighbor >= minimum
      ) {
        continue;
      }

      delta.normalize();

      const strength =
        1 -
        distanceToNeighbor / minimum;

      this.separation.addScaledVector(
        delta,
        strength,
      );
    }

    this.avoidance.set(0, 0, 0);

    const forward =
      this.velocity.lengthSq() > 0.01
        ? this.velocity.clone().normalize()
        : this.toTarget.clone();

    if (forward.lengthSq() < 0.01) {
      forward.set(0, 0, -1);
    }

    this.side.set(
      -forward.z,
      0,
      forward.x,
    );

    const feelers = [
      forward,
      forward.clone()
        .addScaledVector(this.side, 0.65)
        .normalize(),
      forward.clone()
        .addScaledVector(this.side, -0.65)
        .normalize(),
    ];

    for (const feeler of feelers) {
      this.raycaster.set(
        this.object.position,
        feeler,
      );
      this.raycaster.far = 2.25;

      const hit =
        this.raycaster.intersectObjects(
          this.obstacles,
          false,
        )[0];

      if (!hit) continue;

      const normal = hit.face?.normal
        ? hit.face.normal.clone()
        : feeler.clone().negate();

      normal.y = 0;

      if (normal.lengthSq() > 0.001) {
        this.avoidance.add(
          normal.normalize(),
        );
      }
    }

    if (this.avoidance.lengthSq() > 0.001) {
      this.avoidance.normalize();
    }

    this.desired.addScaledVector(
      this.separation,
      speed * 1.1,
    );

    this.desired.addScaledVector(
      this.avoidance,
      speed * 1.8,
    );

    const maxSpeed = Math.max(
      0.1,
      speed,
    );

    if (
      this.desired.lengthSq() >
      maxSpeed * maxSpeed
    ) {
      this.desired.normalize().multiplyScalar(maxSpeed);
    }

    const acceleration = 16;
    const delta = this.desired
      .clone()
      .sub(this.velocity);

    const maxDelta = acceleration * dt;

    if (delta.length() > maxDelta) {
      delta.normalize().multiplyScalar(maxDelta);
    }

    this.velocity.add(delta);

    if (this.velocity.lengthSq() < 0.0001) {
      this.velocity.set(0, 0, 0);
    }

    this.object.position.addScaledVector(
      this.velocity,
      dt,
    );
  }

  stop() {
    this.velocity.set(0, 0, 0);
  }
}
