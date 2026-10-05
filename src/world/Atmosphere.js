import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GraphicsFX } from './GraphicsFX.js';
function makeAtmosphereApi(
  composer,
  ssaoPass,
  bloomPass,
  smaaPass,
  graphicsFX,
  scene,
  renderer,
  camera,
) {
  const render = (dt = 0) => {
    graphicsFX?.update?.(dt);

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
    bloomPass,
    smaaPass,
    graphicsFX,

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
      smaaPass?.setSize(width, height);
      bloomPass?.setSize(width, height);
    },

    dispose() {
      ssaoPass?.dispose?.();
      bloomPass?.dispose?.();
      smaaPass?.dispose?.();
      graphicsFX?.dispose?.();
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

      ssaoPass.kernelRadius = 6.5;
      ssaoPass.minDistance = 0.001;
      ssaoPass.maxDistance = 0.34;
      ssaoPass.output = SSAOPass.OUTPUT.Default;

      composer.addPass(ssaoPass);

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(innerWidth, innerHeight),
        'ontouchstart' in window || navigator.maxTouchPoints > 0 ? 0.075 : 0.16,
        0.58,
        0.80,
      );

      // Bloom is deliberately restrained: emissive lamps and weapon flashes
      // glow, but the daylight map keeps hard detail instead of looking hazy.
      bloomPass.threshold = 0.80;
      composer.addPass(bloomPass);

      const smaaPass = new SMAAPass(
        innerWidth,
        innerHeight,
      );
      composer.addPass(smaaPass);

      composer.addPass(
        new OutputPass(),
      );

      const graphicsFX = new GraphicsFX({
        scene,
        camera,
        width: 270,
        depth: 160,
      });

      return makeAtmosphereApi(
        composer,
        ssaoPass,
        bloomPass,
        smaaPass,
        graphicsFX,
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

    const graphicsFX = new GraphicsFX({
      scene,
      camera,
      width: 270,
      depth: 160,
    });

    return makeAtmosphereApi(
      null,
      null,
      null,
      null,
      graphicsFX,
      scene,
      renderer,
      camera,
    );
  }
}
