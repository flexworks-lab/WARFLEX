import * as THREE from 'three';

function seeded(seed) {
  const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export class GraphicsFX {
  constructor({
    scene,
    camera,
    width = 260,
    depth = 150,
  }) {
    this.scene = scene;
    this.camera = camera;
    this.width = width;
    this.depth = depth;
    this.root = new THREE.Group();
    this.root.name = 'WARFLEX_GRAPHICS_FX';
    scene.add(this.root);

    this.clock = 0;
    this.wind = new THREE.Vector3(0.55, 0.028, -0.20);

    this.makeDust();
    this.makeMicroDust();
  }

  makeDust() {
    const count = 760;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const color = new THREE.Color();

    for (let i = 0; i < count; i += 1) {
      const seed = i + 410.17;
      const x = (seeded(seed) * 2 - 1) * this.width * 0.5;
      const y = 0.35 + seeded(seed + 1.2) * 17.5;
      const z = (seeded(seed + 2.4) * 2 - 1) * this.depth * 0.5;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const warm = seeded(seed + 5.8) > 0.76;
      color.set(warm ? 0xffead2 : 0xdce8ed);
      const brightness = 0.34 + seeded(seed + 8.3) * 0.52;
      colors[i * 3] = color.r * brightness;
      colors[i * 3 + 1] = color.g * brightness;
      colors[i * 3 + 2] = color.b * brightness;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(colors, 3),
    );

    const material = new THREE.PointsMaterial({
      size: 0.045,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: true,
      fog: true,
      blending: THREE.NormalBlending,
    });

    this.dust = new THREE.Points(geometry, material);
    this.dust.name = 'WARFLEX_AmbientDust';
    this.dust.frustumCulled = false;
    this.root.add(this.dust);

    this.dustPositions = positions;
  }

  makeMicroDust() {
    const count = 260;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const seed = i + 901.31;
      positions[i * 3] =
        (seeded(seed) * 2 - 1) * 115;
      positions[i * 3 + 1] =
        0.25 + seeded(seed + 1.5) * 4.8;
      positions[i * 3 + 2] =
        (seeded(seed + 2.7) * 2 - 1) * 67;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    );

    const material = new THREE.PointsMaterial({
      size: 0.022,
      sizeAttenuation: true,
      color: 0xc9d3d5,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      depthTest: true,
      fog: true,
    });

    this.microDust = new THREE.Points(geometry, material);
    this.microDust.name = 'WARFLEX_GroundDust';
    this.microDust.frustumCulled = false;
    this.root.add(this.microDust);

    this.microPositions = positions;
  }

  update(dt) {
    this.clock += dt;

    if (this.dust) {
      const positions = this.dustPositions;

      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += this.wind.x * dt;
        positions[i + 1] +=
          this.wind.y * Math.sin(this.clock * 0.75 + i * 0.013) * dt * 8;
        positions[i + 2] += this.wind.z * dt;

        if (positions[i] > this.width * 0.5) {
          positions[i] = -this.width * 0.5;
        } else if (positions[i] < -this.width * 0.5) {
          positions[i] = this.width * 0.5;
        }

        if (positions[i + 2] > this.depth * 0.5) {
          positions[i + 2] = -this.depth * 0.5;
        } else if (positions[i + 2] < -this.depth * 0.5) {
          positions[i + 2] = this.depth * 0.5;
        }

        positions[i + 1] = THREE.MathUtils.clamp(
          positions[i + 1],
          0.24,
          18.5,
        );
      }

      this.dust.geometry.attributes.position.needsUpdate = true;
      this.dust.rotation.y =
        Math.sin(this.clock * 0.035) * 0.004;
    }

    if (this.microDust) {
      const positions = this.microPositions;

      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += this.wind.x * dt * 1.35;
        positions[i + 2] += this.wind.z * dt * 1.35;
        positions[i + 1] +=
          Math.sin(this.clock * 1.7 + i * 0.02) * dt * 0.08;

        if (positions[i] > 116) positions[i] = -116;
        if (positions[i] < -116) positions[i] = 116;
        if (positions[i + 2] > 67) positions[i + 2] = -67;
        if (positions[i + 2] < -67) positions[i + 2] = 67;
        positions[i + 1] = THREE.MathUtils.clamp(
          positions[i + 1],
          0.16,
          5.0,
        );
      }

      this.microDust.geometry.attributes.position.needsUpdate = true;
    }

    if (this.root) {
      // Keep the effect centered on the player so long maps do not
      // accumulate particles outside the useful render volume.
      this.root.position.set(
        this.camera.position.x,
        0,
        this.camera.position.z,
      );
    }
  }

  dispose() {
    this.root.removeFromParent();

    for (const points of [this.dust, this.microDust]) {
      points?.geometry?.dispose?.();
      points?.material?.dispose?.();
    }
  }
}
