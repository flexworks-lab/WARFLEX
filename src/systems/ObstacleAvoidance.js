import * as THREE from 'three';

export function resolveObstacleOverlap(
  object,
  obstacles,
  radius,
  cache = null,
) {
  let corrected = false;

  let bounds;

  if (cache) {
    const signature =
      obstacles
        .map((item) => item?.uuid || '')
        .join('|');

    if (
      cache.signature !== signature
    ) {
      cache.signature = signature;
      cache.bounds =
        obstacles
          .filter(Boolean)
          .map((obstacle) =>
            new THREE.Box3().setFromObject(
              obstacle,
            ),
          );
    }

    bounds = cache.bounds;
  } else {
    bounds =
      obstacles
        .filter(Boolean)
        .map((obstacle) =>
          new THREE.Box3().setFromObject(
            obstacle,
          ),
        );
  }

  for (let pass = 0; pass < 3; pass += 1) {
    for (const box of bounds) {

      const closestX =
        THREE.MathUtils.clamp(
          object.position.x,
          box.min.x,
          box.max.x,
        );
      const closestZ =
        THREE.MathUtils.clamp(
          object.position.z,
          box.min.z,
          box.max.z,
        );

      let dx =
        object.position.x - closestX;
      let dz =
        object.position.z - closestZ;

      const distanceSq =
        dx * dx + dz * dz;

      if (
        distanceSq >=
        radius * radius
      ) {
        continue;
      }

      if (
        distanceSq > .000001
      ) {
        const distance =
          Math.sqrt(distanceSq);
        const push =
          (radius - distance) /
          distance;

        dx *= push;
        dz *= push;
      } else {
        const left =
          object.position.x - box.min.x;
        const right =
          box.max.x - object.position.x;
        const front =
          object.position.z - box.min.z;
        const back =
          box.max.z - object.position.z;

        const nearest =
          Math.min(
            left,
            right,
            front,
            back,
          );

        if (nearest === left) {
          dx = radius - left;
          dz = 0;
        } else if (nearest === right) {
          dx = -(radius - right);
          dz = 0;
        } else if (nearest === front) {
          dx = 0;
          dz = radius - front;
        } else {
          dx = 0;
          dz = -(radius - back);
        }
      }

      object.position.x += dx;
      object.position.z += dz;
      corrected = true;
    }
  }

  return corrected;
}

export function getObstacleBounds(obstacles) {
  return obstacles
    .filter(Boolean)
    .map((object) =>
      new THREE.Box3().setFromObject(
        object,
      ),
    );
}
