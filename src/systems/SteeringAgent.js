import * as THREE from 'three';
import { resolveObstacleOverlap } from './ObstacleAvoidance.js';

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
    this.wallNormal = new THREE.Vector3();
    this.wallTangent = new THREE.Vector3();
    this.beforeMove = new THREE.Vector3();

    this.raycaster =
      new THREE.Raycaster();
  }

  resolveCurrentPosition() {
    return resolveObstacleOverlap(
      this.object,
      this.obstacles,
      this.radius,
    );
  }

  update(
    dt,
    target,
    {
      speed = 2.7,
      desiredDistance = 2.2,
    } = {},
  ) {
    this.toTarget
      .subVectors(
        target,
        this.object.position,
      );

    this.toTarget.y = 0;

    const distance =
      this.toTarget.length();

    if (distance > .001) {
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
      .multiplyScalar(
        speed * approach,
      );

    this.separation.set(0, 0, 0);

    for (const neighbor of this.getNeighbors()) {
      if (!neighbor || neighbor === this.object) {
        continue;
      }

      const delta =
        this.object.position
          .clone()
          .sub(neighbor.position);

      delta.y = 0;

      const separationDistance =
        delta.length();
      const minimum =
        this.radius * 2.1;

      if (
        separationDistance < .001 ||
        separationDistance >= minimum
      ) {
        continue;
      }

      delta.normalize();

      this.separation.addScaledVector(
        delta,
        1 -
        separationDistance / minimum,
      );
    }

    this.avoidance.set(0, 0, 0);

    const forward =
      this.velocity.lengthSq() > .01
        ? this.velocity.clone().normalize()
        : this.toTarget.clone();

    if (forward.lengthSq() < .01) {
      forward.set(0, 0, -1);
    }

    this.side.set(
      -forward.z,
      0,
      forward.x,
    );

    const feelers = [
      [forward, 2.9],
      [
        forward.clone()
          .addScaledVector(this.side, .8)
          .normalize(),
        2.6,
      ],
      [
        forward.clone()
          .addScaledVector(this.side, -.8)
          .normalize(),
        2.6,
      ],
      [this.side.clone(), 1.8],
      [this.side.clone().negate(), 1.8],
    ];

    for (const [feeler, length] of feelers) {
      this.raycaster.set(
        this.object.position,
        feeler,
      );
      this.raycaster.far = length;

      const hit =
        this.raycaster.intersectObjects(
          this.obstacles,
          false,
        )[0];

      if (!hit) continue;

      this.wallNormal
        .copy(
          hit.face?.normal ||
          feeler.clone().negate(),
        )
        .transformDirection(
          hit.object.matrixWorld,
        );

      this.wallNormal.y = 0;

      if (
        this.wallNormal.lengthSq() < .001
      ) {
        continue;
      }

      this.wallNormal.normalize();

      this.wallTangent.set(
        -this.wallNormal.z,
        0,
        this.wallNormal.x,
      );

      if (
        this.wallTangent.dot(
          this.toTarget,
        ) < 0
      ) {
        this.wallTangent.negate();
      }

      const strength =
        1 -
        hit.distance / length;

      this.avoidance.addScaledVector(
        this.wallNormal,
        strength * 1.6,
      );

      this.avoidance.addScaledVector(
        this.wallTangent,
        strength * 1.5,
      );
    }

    this.desired.addScaledVector(
      this.separation,
      speed * 1.2,
    );

    if (this.avoidance.lengthSq() > .001) {
      this.avoidance.normalize();

      this.desired.addScaledVector(
        this.avoidance,
        speed * 2.8,
      );
    }

    const maxSpeed =
      Math.max(.1, speed);

    if (
      this.desired.lengthSq() >
      maxSpeed * maxSpeed
    ) {
      this.desired.normalize()
        .multiplyScalar(maxSpeed);
    }

    const delta =
      this.desired
        .clone()
        .sub(this.velocity);

    const maxDelta =
      18 * dt;

    if (delta.length() > maxDelta) {
      delta.normalize()
        .multiplyScalar(maxDelta);
    }

    this.velocity.add(delta);

    this.beforeMove.copy(
      this.object.position,
    );

    this.object.position.addScaledVector(
      this.velocity,
      dt,
    );

    const corrected =
      this.resolveCurrentPosition();

    if (corrected) {
      const correction =
        this.object.position
          .clone()
          .sub(this.beforeMove);

      if (correction.lengthSq() > .000001) {
        correction.normalize();

        const intoWall =
          this.velocity.dot(correction);

        if (intoWall < 0) {
          this.velocity.addScaledVector(
            correction,
            -intoWall,
          );
        }
      }
    }

    if (this.velocity.lengthSq() > .02) {
      this.object.rotation.y =
        Math.atan2(
          this.velocity.x,
          this.velocity.z,
        ) + Math.PI;
    }
  }

  stop() {
    this.velocity.set(0, 0, 0);
  }
}
