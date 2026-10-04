import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

export class AssetManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();

    this.gltfLoader = new GLTFLoader();

    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(
      'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/draco/'
    );
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    this.ktx2Loader = null;

    try {
      const ktx2Loader = new KTX2Loader();
      ktx2Loader.setTranscoderPath(
        'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/basis/'
      );
      ktx2Loader.detectSupport(renderer);
      this.ktx2Loader = ktx2Loader;
      this.gltfLoader.setKTX2Loader(ktx2Loader);
    } catch (error) {
      console.warn(
        '[WARFLEX] KTX2 texture support unavailable; continuing without it.',
        error,
      );
    }
  }

  async loadGLTF(url) {
    if (this.cache.has(url)) {
      return this.cache.get(url);
    }

    const gltf = await this.gltfLoader.loadAsync(url);
    this.prepare(gltf.scene);

    const asset = {
      scene: gltf.scene,
      animations: gltf.animations || [],
      parser: gltf.parser,
    };

    this.cache.set(url, asset);
    return asset;
  }

  async cloneGLTF(url) {
    const asset = await this.loadGLTF(url);
    return {
      scene: cloneSkeleton(asset.scene),
      animations: asset.animations,
    };
  }

  async loadHDR(url) {
    const hdr = await new HDRLoader().loadAsync(url);
    hdr.mapping = THREE.EquirectangularReflectionMapping;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = pmrem.fromEquirectangular(hdr).texture;

    hdr.dispose();
    pmrem.dispose();

    return environment;
  }

  prepare(root) {
    root.traverse((object) => {
      if (!object.isMesh) return;

      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = true;

      this.prepareMaterial(object.material);
    });
  }

  prepareMaterial(material) {
    const materials = Array.isArray(material)
      ? material
      : [material];

    for (const mat of materials) {
      if (!mat) continue;

      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.anisotropy = Math.min(
          8,
          this.renderer.capabilities.getMaxAnisotropy(),
        );
      }

      for (const key of [
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'aoMap',
        'bumpMap',
        'displacementMap',
      ]) {
        if (mat[key]) {
          mat[key].colorSpace = THREE.NoColorSpace;
        }
      }

      if (mat.emissiveMap) {
        mat.emissiveMap.colorSpace =
          THREE.SRGBColorSpace;
      }

      mat.envMapIntensity =
        mat.envMapIntensity ?? 1;
    }
  }

  disposeGLTF(root) {
    root.traverse((object) => {
      if (!object.isMesh) return;

      object.geometry?.dispose();

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      for (const material of materials) {
        material?.dispose?.();
      }
    });
  }

  dispose() {
    for (const asset of this.cache.values()) {
      this.disposeGLTF(asset.scene);
    }

    this.cache.clear();
    this.dracoLoader.dispose();
    this.ktx2Loader?.dispose?.();
  }
}
