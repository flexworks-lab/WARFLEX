import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
function makeAtmosphereApi(
  composer,
  ssaoPass,
  scene,
  renderer,
  camera,
) {
  const render = (dt = 0) => {
    if (composer) {
      composer.render(dt);
    } else {
      renderer.render(scene, camera);
    }
  };

  return {
    composer: {
      render,
    },
    ssaoPass,

    setFog({
      density = 0.012,
      color = 0x070a0e,
    } = {}) {
      scene.fog.density = density;
      scene.fog.color.setHex(color);
      scene.background.setHex(color);
    },

    resize(width, height) {
      if (composer) {
        composer.setSize(width, height);
      }

      ssaoPass?.setSize(width, height);
    },

    dispose() {
      ssaoPass?.dispose?.();
      composer?.dispose?.();
    },
  };
}

export function configureAtmosphere(scene, renderer, camera) {
  scene.background =
    new THREE.Color(0x111a22);

  scene.fog =
    new THREE.FogExp2(
      0x111a22,
      0.0042,
    );

  let composer;

  try {
    composer = new EffectComposer(renderer);

    const renderPass =
      new RenderPass(
        scene,
        camera,
      );

    composer.addPass(renderPass);

    try {
      const ssaoPass =
        new SSAOPass(
          scene,
          camera,
          innerWidth,
          innerHeight,
        );

      ssaoPass.kernelRadius = 5;
      ssaoPass.minDistance = 0.002;
      ssaoPass.maxDistance = 0.22;

      composer.addPass(ssaoPass);


      composer.addPass(
        new OutputPass(),
      );

      return makeAtmosphereApi(
        composer,
        ssaoPass,
        scene,
        renderer,
        camera,
      );
    } catch (error) {
      console.warn(
        '[WARFLEX] SSAO unavailable; using standard post-processing.',
        error,
      );


      composer.addPass(
        new OutputPass(),
      );

      return makeAtmosphereApi(
        composer,
        null,
        scene,
        renderer,
        camera,
      );
    }
  } catch (error) {
    console.warn(
      '[WARFLEX] Post-processing unavailable; falling back to direct rendering.',
      error,
    );

    return makeAtmosphereApi(
      null,
      null,
      scene,
      renderer,
      camera,
    );
  }
}
