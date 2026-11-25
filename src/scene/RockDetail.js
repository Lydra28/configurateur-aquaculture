import { NOISE_GLSL } from '../shaders/noise.glsl.js'
import { ROCK_DETAIL_GLSL } from '../shaders/rockDetail.glsl.js'

/**
 * Matière des roches (option « stylisé, en mieux » de la DA) : greffe le
 * détail procédural de `rockDetail.glsl.js` sur les matériaux Lambert des
 * blocs et des galets. Les teintes par instance, pilotées par l'écosystème,
 * restent la base : le détail les module, il ne les remplace pas.
 *
 * Additif et débrayable : `uRockDetail` à 0 → image strictement identique.
 */
export class RockDetail {
  constructor() {
    this.uniforms = {
      uRockDetail: { value: 1 },
      uRockRelief: { value: 0.35 },
    }
  }

  /**
   * @param halfHeight demi-hauteur de la géométrie (repère de l'assise)
   * @param strata     1 pour les blocs stratifiés, 0 pour les galets lisses
   * À appeler AVANT toute autre greffe qui lit `normal` ou `diffuseColor`.
   */
  patch(material, { halfHeight, strata = 1 }) {
    const previous = material.onBeforeCompile
    const uniforms = {
      ...this.uniforms,
      uRockHalfHeight: { value: halfHeight },
      uRockStrata: { value: strata },
    }
    material.onBeforeCompile = (shader, renderer) => {
      previous?.(shader, renderer)
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uRockHalfHeight;
          varying vec3 vRockPos;
          varying float vRockHeight;
          varying float vRockSeed;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 rockPos = vec4(transformed, 1.0);
          vRockSeed = 0.5;
          #ifdef USE_INSTANCING
          rockPos = instanceMatrix * rockPos;
          vRockSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          #endif
          vRockPos = (modelMatrix * rockPos).xyz;
          vRockHeight = position.y / (2.0 * uRockHalfHeight) + 0.5;`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          #ifndef NEMO_NOISE
          #define NEMO_NOISE
          ${NOISE_GLSL}
          #endif
          ${ROCK_DETAIL_GLSL}
          uniform float uRockDetail;
          uniform float uRockRelief;
          uniform float uRockStrata;
          varying vec3 vRockPos;
          varying float vRockHeight;
          varying float vRockSeed;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          rockDetail(diffuseColor.rgb, normal, vRockPos, vRockHeight, vRockSeed, viewMatrix,
            uRockDetail, uRockRelief, uRockStrata);`)
    }
    material.customProgramCacheKey = () => `${previous ? previous.toString() : ''}|rock-detail`
    return material
  }
}
