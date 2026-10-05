import * as THREE from 'three';
import { resolveObstacleOverlap } from '../systems/ObstacleAvoidance.js';

export class NavMeshAgent {
  constructor({
    object,
    navMesh,
    getTarget,
    speed = 2.7,
    repathInterval = 0.35,
    desiredDistance = 1.8,
    obstacles = [],
    radius = 0.55,
    getNeighbors = () => [],
    separationRadius = 4.25,
  }) {
    this.object = object;
    this.navMesh = navMesh;
    this.getTarget = getTarget;
    this.speed = speed;
    this.repathInterval = repathInterval;
    this.desiredDistance = desiredDistance;
    this.obstacles = obstacles;
    this.radius = radius;
    this.getNeighbors = getNeighbors;
    this.separationRadius = separationRadius;

    this.separation =
      new THREE.Vector3();

    this.timer = 0;
    this.path = [];
    this.pathIndex = 0;
    this.groupId = null;

    this.velocity =
      new THREE.Vector3();

    this.tmp =
      new THREE.Vector3();
    this.beforeMove =
      new THREE.Vector3();
    this.obstacleCache = {
      signature: '',
      bounds: [],
    };
  }

  resolveCurrentPosition() {
    return resolveObstacleOverlap(
      this.object,
      this.obstacles,
      this.radius,
      this.obstacleCache,
    );
  }

  update(dt) {
    this.timer -= dt;

    const target =
      this.getTarget();

    if (!target) return;

    if (
      this.timer <= 0 ||
      this.pathIndex >= this.path.length
    ) {
      this.repath(target);
      this.timer =
        this.repathInterval;
    }

    const waypoint =
      this.path[this.pathIndex];

    if (!waypoint) {
      this.velocity.multiplyScalar(
        Math.exp(-16 * dt),
      );
      return;
    }

    const toWaypoint =
      this.tmp.subVectors(
        waypoint,
        this.object.position,
      );

    toWaypoint.y = 0;

    const distance =
      toWaypoint.length();

    if (distance < .4) {
      this.pathIndex += 1;
      return;
    }

    const isFinal =
      this.pathIndex >=
      this.path.length - 1;

    if (
      isFinal &&
      distance <=
      this.desiredDistance
    ) {
      this.velocity.multiplyScalar(
        Math.exp(-14 * dt),
      );
      return;
    }

    toWaypoint.normalize();

    const desired =
      toWaypoint.multiplyScalar(
        this.speed,
      );

    // Strong squad spacing. Navmesh pathing used to let several enemies
    // converge on the same waypoint and form a single clump.
    this.separation.set(0, 0, 0);
    const neighbors = this.getNeighbors?.() || [];
    for (const neighbor of neighbors) {
      if (!neighbor || neighbor === this.object) continue;

      const deltaFromNeighbor =
        this.object.position
          .clone()
          .sub(neighbor.position);
      deltaFromNeighbor.y = 0;

      const distance = deltaFromNeighbor.length();
      const minimum =
        Math.max(
          this.radius * 2.15,
          this.separationRadius,
        );

      if (
        distance < .001 ||
        distance >= minimum
      ) continue;

      deltaFromNeighbor.normalize();
      const strength =
        1 - distance / minimum;

      this.separation.addScaledVector(
        deltaFromNeighbor,
        strength * strength,
      );
    }

    if (this.separation.lengthSq() > .001) {
      this.separation.normalize();
      desired.addScaledVector(
        this.separation,
        this.speed * 2.9,
      );
    }

    const delta =
      desired.clone().sub(
        this.velocity,
      );

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

      const normal = correction;

      if (normal.lengthSq() > .000001) {
        normal.normalize();

        const intoWall =
          this.velocity.dot(normal);

        if (intoWall < 0) {
          this.velocity.addScaledVector(
            normal,
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

  repath(target) {
    const start =
      this.object.position.clone();

    if (this.groupId == null) {
      this.groupId =
        this.navMesh.getGroup(start);
    }

    if (this.groupId == null) {
      this.path = [];
      this.pathIndex = 0;
      return;
    }

    const path =
      this.navMesh.findPath(
        start,
        target,
        this.groupId,
      );

    if (path?.length) {
      this.path = path;
      this.pathIndex = 0;
    } else {
      this.path = [];
      this.pathIndex = 0;
    }
  }

  stop() {
    this.velocity.set(0, 0, 0);
    this.path.length = 0;
    this.pathIndex = 0;
  }
}
