import * as THREE from 'three';

export class NavMeshAgent {
  constructor({
    object,
    navMesh,
    getTarget,
    speed = 2.7,
    repathInterval = 0.35,
    desiredDistance = 1.8,
  }) {
    this.object = object;
    this.navMesh = navMesh;
    this.getTarget = getTarget;
    this.speed = speed;
    this.repathInterval = repathInterval;
    this.desiredDistance = desiredDistance;

    this.timer = 0;
    this.path = [];
    this.pathIndex = 0;
    this.groupId = null;

    this.velocity =
      new THREE.Vector3();

    this.tmp =
      new THREE.Vector3();
  }

  update(dt) {
    this.timer -= dt;

    const target =
      this.getTarget();

    if (
      !target
    ) {
      return;
    }

    if (
      this.timer <= 0 ||
      this.pathIndex >=
        this.path.length
    ) {
      this.repath(
        target,
      );

      this.timer =
        this.repathInterval;
    }

    const waypoint =
      this.path[
        this.pathIndex
      ];

    if (!waypoint) {
      return;
    }

    this.tmp
      .subVectors(
        waypoint,
        this.object.position,
      );

    this.tmp.y = 0;

    if (
      this.tmp.lengthSq() <
      0.35 * 0.35
    ) {
      this.pathIndex += 1;
      return;
    }

    this.tmp.normalize();

    if (
      this.tmp.lengthSq() <
      this.desiredDistance * this.desiredDistance
    ) {
      this.velocity.multiplyScalar(
        Math.exp(-12 * dt),
      );
      return;
    }

    const desired =
      this.tmp
        .multiplyScalar(
          this.speed,
        );

    const acceleration = 15;
    const delta =
      desired.clone()
        .sub(this.velocity);

    const maxDelta =
      acceleration * dt;

    if (
      delta.length() >
      maxDelta
    ) {
      delta
        .normalize()
        .multiplyScalar(
          maxDelta,
        );
    }

    this.velocity.add(
      delta,
    );

    this.object.position.addScaledVector(
      this.velocity,
      dt,
    );

    if (
      this.velocity.lengthSq() >
      0.02
    ) {
      this.object.rotation.y =
        Math.atan2(
          this.velocity.x,
          this.velocity.z,
        ) + Math.PI;
    }
  }

  repath(target) {
    const start =
      this.object.position.clone();

    if (
      this.groupId == null
    ) {
      this.groupId =
        this.navMesh.getGroup(
          start,
        );
    }

    if (
      this.groupId == null
    ) {
      return;
    }

    const path =
      this.navMesh.findPath(
        start,
        target,
        this.groupId,
      );

    if (
      path &&
      path.length
    ) {
      this.path = path;
      this.pathIndex = 0;
    }
  }

  stop() {
    this.velocity.set(
      0,
      0,
      0,
    );

    this.path.length = 0;
    this.pathIndex = 0;
  }
}
