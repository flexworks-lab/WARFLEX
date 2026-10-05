import * as THREE from 'three';

export class PropInstancer {
  constructor(scene) {
    this.scene = scene;
    this.instances = new Map();

    this.dummy = new THREE.Object3D();
    this.seed = 0x91e10da;
  }

  random() {
    // Deterministic xorshift so the same map layout returns after reload.
    let x = this.seed |= 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x;
    return ((x >>> 0) / 4294967296);
  }

  createBoxProp({
    name,
    count,
    size,
    color,
    metalness = 0.15,
    roughness = 0.8,
    castShadow = true,
    receiveShadow = true,
  }) {
    const geometry = new THREE.BoxGeometry(
      size.x,
      size.y,
      size.z,
    );

    const material = new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
    });

    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      count,
    );

    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.frustumCulled = true;
    mesh.name = name;

    this.scene.add(mesh);
    this.instances.set(name, mesh);

    return mesh;
  }

  populate(mesh, {
    center = new THREE.Vector3(),
    halfExtents = new THREE.Vector2(48, 48),
    minScale = 0.85,
    maxScale = 1.15,
    y = 0,
    avoidRadius = 10,
    rotationSnap = 0,
  } = {}) {
    const count = mesh.count;

    for (let i = 0; i < count; i += 1) {
      let x;
      let z;
      let tries = 0;

      do {
        x = center.x +
          (this.random() * 2 - 1) *
          halfExtents.x;

        z = center.z +
          (this.random() * 2 - 1) *
          halfExtents.y;

        tries += 1;
      } while (
        Math.hypot(
          x - center.x,
          z - center.z,
        ) < avoidRadius &&
        tries < 12
      );

      const scale =
        THREE.MathUtils.lerp(
          minScale,
          maxScale,
          this.random(),
        );

      const yawRaw =
        this.random() *
        Math.PI *
        2;

      const yaw =
        rotationSnap > 0
          ? Math.round(
              yawRaw / rotationSnap,
            ) * rotationSnap
          : yawRaw;

      this.dummy.position.set(
        x,
        y,
        z,
      );

      this.dummy.rotation.set(
        0,
        yaw,
        0,
      );

      this.dummy.scale.setScalar(
        scale,
      );

      this.dummy.updateMatrix();

      mesh.setMatrixAt(
        i,
        this.dummy.matrix,
      );
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  dispose() {
    for (const mesh of this.instances.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }

    this.instances.clear();
  }
}
