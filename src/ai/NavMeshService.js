import * as THREE from 'three';
const DEFAULT_ZONE = 'WARFLEX';

export class NavMeshService {
  constructor({
    assetManager,
    zoneId = DEFAULT_ZONE,
  }) {
    this.assetManager = assetManager;
    this.zoneId = zoneId;
    this.pathfinding = null;
    this.ready = false;

    this.navRoot = null;
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
      if (
        object.isMesh &&
        !navmesh
      ) {
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
      Pathfinding.createZone(
        geometry,
      ),
    );

    geometry.dispose();

    this.navRoot = asset.scene;
    this.ready = true;

    return this;
  }

  getGroup(position) {
    if (!this.ready) return null;

    return this.pathfinding.getGroup(
      this.zoneId,
      position,
    );
  }

  findPath(
    start,
    target,
    groupId = null,
  ) {
    if (!this.ready) return null;

    const group =
      groupId ??
      this.getGroup(start);

    if (group == null) {
      return null;
    }

    return (
      this.pathfinding.findPath(
        start,
        target,
        this.zoneId,
        group,
      ) || null
    );
  }

  dispose() {
    this.ready = false;
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
  }
}
