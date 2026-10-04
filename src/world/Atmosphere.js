import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';


const CombatGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tTime: { value: 0 },
    tResolution: {
      value: new THREE.Vector2(1, 1),
    },
  },

  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position =
        projectionMatrix *
        modelViewMatrix *
        vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float tTime;

    varying vec2 vUv;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 centered = vUv - .5;
      float radius = length(centered);

      float aberration =
        smoothstep(.2, .88, radius) * .0016;

      vec3 color;

      color.r = texture2D(
        tDiffuse,
        vUv + vec2(aberration, 0.0)
      ).r;

      color.g = texture2D(
        tDiffuse,
        vUv
      ).g;

      color.b = texture2D(
        tDiffuse,
        vUv - vec2(aberration, 0.0)
      ).b;

      float luminance =
        dot(
          color,
          vec3(.2126, .7152, .0722)
        );

      float shadow =
        1.0 - smoothstep(.12, .52, luminance);

      float highlight =
        smoothstep(.54, .98, luminance);

      color *= mix(
        vec3(1.0),
        vec3(.91, .97, 1.07),
        shadow * .15
      );

      color *= mix(
        vec3(1.0),
        vec3(1.06, 1.015, .95),
        highlight * .10
      );

      color =
        (color - .5) * 1.10 + .5;

      float grain =
        hash21(
          gl_FragCoord.xy +
          vec2(tTime * 13.0, tTime * 9.0)
        ) - .5;

      color += grain * .009;

      float vignette =
        1.0 -
        smoothstep(.22, .82, radius) * .14;

      color *= vignette;

      gl_FragColor =
        vec4(
          max(color, vec3(.004, .006, .008)),
          texture2D(tDiffuse, vUv).a
        );
    }
  `,
};

function createCombatGradePass() {
  return new ShaderPass(CombatGradeShader);
}

function makeAtmosphereApi(
  composer,
  ssaoPass,
  scene,
  renderer,
  camera,
) {
  let shaderTime = 0;

  const render = (dt = 0) => {
    shaderTime += dt;

    if (composer) {
      for (const pass of composer.passes || []) {
        if (
          pass.uniforms?.tTime
        ) {
          pass.uniforms.tTime.value =
            shaderTime;
        }
      }

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

      for (const pass of composer?.passes || []) {
        if (pass.uniforms?.tResolution) {
          pass.uniforms.tResolution.value.set(
            width,
            height,
          );
        }
      }
    },

    dispose() {
      ssaoPass?.dispose?.();
      composer?.dispose?.();
    },
  };
}

export function configureAtmosphere(scene, renderer, camera) {
  scene.background =
    new THREE.Color(0x05070a);

  scene.fog =
    new THREE.FogExp2(
      0x070a0e,
      0.012,
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

      const combatGrade =
        createCombatGradePass();

      combatGrade.uniforms.tResolution.value.set(
        innerWidth,
        innerHeight,
      );

      composer.addPass(
        combatGrade,
      );

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
        createCombatGradePass(),
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
