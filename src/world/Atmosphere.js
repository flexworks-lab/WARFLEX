import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function configureAtmosphere(scene, renderer, camera) {
  scene.background =
    new THREE.Color(0x05070a);

  scene.fog =
    new THREE.FogExp2(
      0x070a0e,
      0.012,
    );

  const composer =
    new EffectComposer(renderer);

  const renderPass =
    new RenderPass(
      scene,
      camera,
    );

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

  composer.addPass(renderPass);
  composer.addPass(ssaoPass);
  composer.addPass(
    new OutputPass(),
  );

  return {
    composer,
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
      composer.setSize(
        width,
        height,
      );

      ssaoPass.setSize(
        width,
        height,
      );
    },

    dispose() {
      composer.dispose();
      ssaoPass.dispose();
    },
  };
}
