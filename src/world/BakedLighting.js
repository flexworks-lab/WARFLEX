import * as THREE from 'three';

export async function applyBakedLightmap(
  root,
  textureLoader,
  url,
  intensity = 1,
) {
  const texture =
    await textureLoader.loadAsync(url);

  /*
   * Lightmaps contain linear baked illumination data.
   * MeshStandardMaterial requires a second UV set.
   */
  texture.colorSpace =
    THREE.LinearSRGBColorSpace;

  texture.flipY = false;

  root.traverse((object) => {
    if (!object.isMesh) return;

    const geometry =
      object.geometry;

    const uv1 =
      geometry.getAttribute('uv1') ||
      geometry.getAttribute('uv2');

    if (!uv1) return;

    const materials =
      Array.isArray(object.material)
        ? object.material
        : [object.material];

    for (const material of materials) {
      if (
        !material ||
        !('lightMap' in material)
      ) {
        continue;
      }

      material.lightMap =
        texture;

      material.lightMapIntensity =
        intensity;

      material.needsUpdate = true;
    }
  });

  return texture;
}

export function releaseLightmap(texture) {
  texture?.dispose?.();
}
