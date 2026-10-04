import * as THREE from 'three';

const DEFAULT_ZONE = 'WARFLEX';

export class NavMeshService {
  constructor({
    assetManager,
    zoneId = DEFAULT_ZONE,
    obstacles = [],
    fallbackBounds = 54,
    fallbackCellSize = 1.5,
  }) {
    this.assetManager = assetManager;
    this.zoneId = zoneId;
    this.pathfinding = null;
    this.ready = false;
    this.navRoot = null;

    this.obstacles = obstacles;
    this.fallbackBounds = fallbackBounds;
    this.fallbackCellSize = fallbackCellSize;
    this.fallbackReady = false;
    this.fallbackBoundsList = [];
    this.fallbackBlocked = null;
    this.fallbackWidth = 0;
    this.fallbackHeight = 0;
    this.fallbackSignature = '';
  }

  get canPathfind() {
    return this.ready || this.fallbackReady;
  }

  async load(url) {
    const { Pathfinding } =
      await import('three-pathfinding');

    this.pathfinding =
      new Pathfinding();

    const asset =
      await this.assetManager.loadGLTF(url);

    let navmesh = null;

    asset.scene.traverse((object) => {
      if (object.isMesh && !navmesh) {
        navmesh = object;
      }
    });

    if (!navmesh) {
      throw new Error(
        'NavMesh GLB contains no mesh.',
      );
    }

    navmesh.visible = false;

    const geometry =
      navmesh.geometry.clone();

    this.pathfinding.setZoneData(
      this.zoneId,
      Pathfinding.createZone(geometry),
    );

    geometry.dispose();

    this.navRoot = asset.scene;
    this.ready = true;
    this.fallbackReady = false;

    return this;
  }

  getGroup(position) {
    if (this.ready) {
      return this.pathfinding.getGroup(
        this.zoneId,
        position,
      );
    }

    if (this.fallbackReady) {
      this.ensureFallbackGrid();
      return 0;
    }

    return null;
  }

  findPath(start, target, groupId = null) {
    if (this.ready) {
      const group =
        groupId ?? this.getGroup(start);

      if (group == null) return null;

      return (
        this.pathfinding.findPath(
          start,
          target,
          this.zoneId,
          group,
        ) || null
      );
    }

    this.ensureFallbackGrid();

    if (!this.fallbackReady) return null;

    return this.findFallbackPath(
      start,
      target,
    );
  }

  buildFallbackGrid() {
    this.ensureFallbackGrid(true);
    return this;
  }

  ensureFallbackGrid(force = false) {
    if (this.ready) return;

    const signature =
      this.obstacles
        .map((object) => object?.uuid || '')
        .join('|');

    if (
      !force &&
      this.fallbackReady &&
      signature === this.fallbackSignature
    ) {
      return;
    }

    this.fallbackSignature = signature;

    const min = -this.fallbackBounds;
    const max = this.fallbackBounds;
    const cell = this.fallbackCellSize;

    this.fallbackWidth =
      Math.ceil((max - min) / cell) + 1;
    this.fallbackHeight =
      this.fallbackWidth;

    this.fallbackBlocked =
      new Uint8Array(
        this.fallbackWidth *
        this.fallbackHeight,
      );

    this.fallbackBoundsList = [];

    for (const obstacle of this.obstacles) {
      if (!obstacle) continue;

      obstacle.updateWorldMatrix?.(
        true,
        true,
      );

      const box =
        new THREE.Box3()
          .setFromObject(obstacle);

      box.expandByScalar(.95);

      if (
        box.max.x < min ||
        box.min.x > max ||
        box.max.z < min ||
        box.min.z > max
      ) {
        continue;
      }

      this.fallbackBoundsList.push(box);
    }

    for (
      let z = 0;
      z < this.fallbackHeight;
      z += 1
    ) {
      for (
        let x = 0;
        x < this.fallbackWidth;
        x += 1
      ) {
        const world =
          this.cellToWorld(x, z);

        if (
          this.isBlockedWorld(
            world.x,
            world.z,
          )
        ) {
          this.fallbackBlocked[
            this.toIndex(x, z)
          ] = 1;
        }
      }
    }

    this.fallbackReady = true;
  }

  toIndex(x, z) {
    return z * this.fallbackWidth + x;
  }

  worldToCell(position) {
    const min = -this.fallbackBounds;
    const cell = this.fallbackCellSize;

    return {
      x: THREE.MathUtils.clamp(
        Math.round(
          (position.x - min) / cell,
        ),
        0,
        this.fallbackWidth - 1,
      ),
      z: THREE.MathUtils.clamp(
        Math.round(
          (position.z - min) / cell,
        ),
        0,
        this.fallbackHeight - 1,
      ),
    };
  }

  cellToWorld(x, z) {
    const min = -this.fallbackBounds;
    const cell = this.fallbackCellSize;

    return new THREE.Vector3(
      min + x * cell,
      0,
      min + z * cell,
    );
  }

  isBlockedCell(x, z) {
    if (
      x < 0 ||
      z < 0 ||
      x >= this.fallbackWidth ||
      z >= this.fallbackHeight
    ) {
      return true;
    }

    return Boolean(
      this.fallbackBlocked[
        this.toIndex(x, z)
      ],
    );
  }

  isBlockedWorld(x, z) {
    for (const box of this.fallbackBoundsList) {
      if (
        x >= box.min.x &&
        x <= box.max.x &&
        z >= box.min.z &&
        z <= box.max.z
      ) {
        return true;
      }
    }

    return false;
  }

  findNearestOpenCell(cell) {
    if (
      !this.isBlockedCell(
        cell.x,
        cell.z,
      )
    ) {
      return cell;
    }

    for (
      let radius = 1;
      radius <= 12;
      radius += 1
    ) {
      for (
        let z = -radius;
        z <= radius;
        z += 1
      ) {
        for (
          let x = -radius;
          x <= radius;
          x += 1
        ) {
          if (
            Math.abs(x) !== radius &&
            Math.abs(z) !== radius
          ) {
            continue;
          }

          const cx = cell.x + x;
          const cz = cell.z + z;

          if (
            !this.isBlockedCell(
              cx,
              cz,
            )
          ) {
            return {
              x: cx,
              z: cz,
            };
          }
        }
      }
    }

    return null;
  }

  canStep(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;

    if (
      this.isBlockedCell(
        b.x,
        b.z,
      )
    ) {
      return false;
    }

    if (
      dx !== 0 &&
      dz !== 0 &&
      (
        this.isBlockedCell(
          a.x + dx,
          a.z,
        ) ||
        this.isBlockedCell(
          a.x,
          a.z + dz,
        )
      )
    ) {
      return false;
    }

    return true;
  }

  findFallbackPath(start, target) {
    const startCell =
      this.findNearestOpenCell(
        this.worldToCell(start),
      );
    const targetCell =
      this.findNearestOpenCell(
        this.worldToCell(target),
      );

    if (!startCell || !targetCell) {
      return null;
    }

    if (
      startCell.x === targetCell.x &&
      startCell.z === targetCell.z
    ) {
      return [
        target.clone().setY(start.y),
      ];
    }

    const open = new Map();
    const closed = new Set();
    const cameFrom = new Map();
    const nodes = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const key = (x, z) => `${x}:${z}`;

    const heuristic = (a, b) => {
      const dx = Math.abs(a.x - b.x);
      const dz = Math.abs(a.z - b.z);
      return (
        Math.max(dx, dz) +
        (Math.SQRT2 - 1) *
        Math.min(dx, dz)
      );
    };

    const startKey =
      key(
        startCell.x,
        startCell.z,
      );

    nodes.set(startKey, startCell);
    open.set(startKey, true);
    gScore.set(startKey, 0);
    fScore.set(
      startKey,
      heuristic(
        startCell,
        targetCell,
      ),
    );

    const directions = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ];

    let iterations = 0;

    while (
      open.size &&
      iterations < 12000
    ) {
      iterations += 1;

      let currentKey = null;
      let current = null;
      let currentF = Infinity;

      for (const candidateKey of open.keys()) {
        const score =
          fScore.get(candidateKey) ??
          Infinity;

        if (score < currentF) {
          currentF = score;
          currentKey = candidateKey;
          current =
            nodes.get(candidateKey);
        }
      }

      if (!current) break;

      if (
        current.x === targetCell.x &&
        current.z === targetCell.z
      ) {
        const cells = [];
        let trace = currentKey;

        while (trace) {
          const node =
            nodes.get(trace);

          if (!node) break;

          cells.push(node);

          const previous =
            cameFrom.get(trace);

          if (!previous) break;

          trace = key(
            previous.x,
            previous.z,
          );
        }

        cells.reverse();

        const points =
          cells.map((cellNode) =>
            this.cellToWorld(
              cellNode.x,
              cellNode.z,
            ).setY(start.y),
          );

        points.push(
          target.clone().setY(start.y),
        );

        return this.simplifyPath(points);
      }

      open.delete(currentKey);
      closed.add(currentKey);

      for (const [
        dx,
        dz,
        stepCost,
      ] of directions) {
        const next = {
          x: current.x + dx,
          z: current.z + dz,
        };

        if (!this.canStep(current, next)) {
          continue;
        }

        const nextKey =
          key(next.x, next.z);

        if (closed.has(nextKey)) {
          continue;
        }

        const tentative =
          (gScore.get(currentKey) ?? Infinity) +
          stepCost;

        if (
          tentative >=
          (gScore.get(nextKey) ?? Infinity)
        ) {
          continue;
        }

        nodes.set(nextKey, next);
        cameFrom.set(
          nextKey,
          current,
        );
        gScore.set(
          nextKey,
          tentative,
        );
        fScore.set(
          nextKey,
          tentative +
          heuristic(
            next,
            targetCell,
          ),
        );
        open.set(nextKey, true);
      }
    }

    return null;
  }

  simplifyPath(points) {
    if (points.length <= 2) {
      return points;
    }

    const simplified = [points[0]];
    let lastDirection = null;

    for (
      let i = 1;
      i < points.length;
      i += 1
    ) {
      const direction =
        points[i]
          .clone()
          .sub(points[i - 1])
          .setY(0)
          .normalize();

      if (
        lastDirection &&
        direction.dot(
          lastDirection,
        ) > .996
      ) {
        simplified[
          simplified.length - 1
        ] = points[i];
      } else {
        simplified.push(points[i]);
      }

      lastDirection = direction;
    }

    return simplified;
  }

  dispose() {
    this.ready = false;
    this.fallbackReady = false;
    this.navRoot?.traverse(
      (object) => {
        if (!object.isMesh) return;
        object.geometry?.dispose();

        const materials =
          Array.isArray(object.material)
            ? object.material
            : [object.material];

        for (const material of materials) {
          material?.dispose?.();
        }
      },
    );

    this.navRoot = null;
    this.fallbackBlocked = null;
    this.fallbackBoundsList.length = 0;
  }
}
