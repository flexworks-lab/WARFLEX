import * as THREE from 'three';

export class MapLoader {
  constructor({
    scene,
    assetManager,
    physicsWorld,
    obstacles,
  }) {
    this.scene = scene;
    this.assetManager = assetManager;
    this.physicsWorld = physicsWorld;
    this.obstacles = obstacles;

    this.mapRoot = null;
    this.visualRoot = new THREE.Group();
    this.collisionRoot = new THREE.Group();

    this.visualRoot.name = 'MapVisuals';
    this.collisionRoot.name =
      'MapCollisionDebugHidden';

    this.scene.add(
      this.visualRoot,
      this.collisionRoot,
    );

    this.loaded = false;
    this.physicsBodies = [];
  }

  isCollisionMesh(object) {
    const name =
      object.name.toLowerCase();

    return (
      name.startsWith('col_') ||
      name.startsWith('collision') ||
      name.startsWith('phys_') ||
      name.includes('_collision')
    );
  }

  async loadMap(url) {
    const asset =
      await this.assetManager.loadGLTF(url);

    const root = asset.scene;
    root.name = 'LoadedMap';

    this.mapRoot = root;

    root.traverse((object) => {
      if (!object.isMesh) return;

      if (this.isCollisionMesh(object)) {
        /*
         * Collision meshes are hidden from rendering.
         * They remain in memory only as source data for physics/raycasting.
         */
        object.visible = false;
        object.castShadow = false;
        object.receiveShadow = false;

        this.collisionRoot.attach(object);

        const box =
          new THREE.Box3()
            .setFromObject(object);

        const center =
          box.getCenter(
            new THREE.Vector3(),
          );

        const size =
          box.getSize(
            new THREE.Vector3(),
          );

        const physicsBody =
          this.physicsWorld.addBox(
            size,
            center,
            {
              group:
                this.physicsWorld.staticGroup,
              mask:
                this.physicsWorld.ragdollGroup,
            },
          );

        physicsBody.userData.source =
          object;
        this.physicsBodies.push(
          physicsBody,
        );

        this.obstacles.push(object);

        return;
      }

      object.visible = true;
      object.castShadow = true;
      object.receiveShadow = true;

      this.visualRoot.attach(object);
    });

    this.loaded = true;
    return {
      root,
      animations: asset.animations,
    };
  }

  unload() {
    if (!this.mapRoot) return;

    for (const body of this.physicsBodies) {
      this.physicsWorld.world.removeBody(body);
    }

    this.physicsBodies.length = 0;

    for (const root of [
      this.visualRoot,
      this.collisionRoot,
    ]) {
      root.traverse((object) => {
        if (!object.isMesh) return;
      object.geometry?.dispose();

      const materials =
        Array.isArray(object.material)
          ? object.material
          : [object.material];

      for (const material of materials) {
        material?.dispose?.();
      }
      });
    }

    if (this.mapRoot.parent) {
      this.mapRoot.parent.remove(
        this.mapRoot,
      );
    }

    this.mapRoot = null;
    this.loaded = false;
  }
}
