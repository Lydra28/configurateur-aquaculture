import * as THREE from 'three'
import { NOISE_GLSL } from '../shaders/noise.glsl.js'
import { CAUSTICS_GLSL } from '../shaders/caustics.glsl.js'

/**
 * Lumière des caustiques, partagée par tout ce qui vit au fond : le sol
 * (shader maison) et les objets Lambert — roches, flore, faune fixe — greffés
 * par `patch()`. Une seule source : même couleur, même force, même horloge,
 * sinon le réseau du sol et celui d'une roche ne coïncideraient pas.
 *
 * Additif et débrayable : intensité 0 → image strictement identique à avant.
 * Le réseau n'éclaire que les faces tournées vers la surface et se multiplie
 * par l'albédo — c'est de la lumière, pas un calque posé dessus.
 */
export class CausticLight {
  constructor() {
    this.uniforms = {
      uCausticStrength: { value: 0 },
      uCausticScale: { value: 0.14 },
      uCausticColor: { value: new THREE.Color() },
      uCausticTime: { value: 0 },
      uCausticOnObjects: { value: 1 },
    }
    this.gain = 1.2 // réglage debug ; 0 = coupé
    this.onObjects = 0.8 // dose sur les objets, relative au sol
  }

  /**
   * L'appelant connaît la turbidité, la profondeur et la lumière filtrée ; la
   * couleur mêle soleil filtré et ambiante, comme le faisait le sol.
   */
  update(elapsed, strength, lightColor, ambientColor) {
    const u = this.uniforms
    u.uCausticTime.value = elapsed
    u.uCausticStrength.value = strength * this.gain
    u.uCausticOnObjects.value = this.onObjects
    u.uCausticColor.value.copy(ambientColor).lerp(lightColor, 0.45).multiplyScalar(3.2)
  }

  /** Greffe le réseau sur un MeshLambertMaterial (instancié ou non), en respectant son éventuel onBeforeCompile. */
  patch(material) {
    const previous = material.onBeforeCompile
    const uniforms = this.uniforms
    material.onBeforeCompile = (shader, renderer) => {
      previous?.(shader, renderer)
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vCausticPos;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 causticPos = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          causticPos = instanceMatrix * causticPos;
          #endif
          vCausticPos = (modelMatrix * causticPos).xyz;`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          ${NOISE_GLSL}
          ${CAUSTICS_GLSL}
          varying vec3 vCausticPos;
          uniform float uCausticStrength;
          uniform float uCausticScale;
          uniform vec3  uCausticColor;
          uniform float uCausticTime;
          uniform float uCausticOnObjects;`)
        .replace('#include <opaque_fragment>', `
          float causticUp = clamp(dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)), 0.0, 1.0);
          outgoingLight += uCausticColor * diffuseColor.rgb
            * caustics(vCausticPos.xz, uCausticTime, uCausticScale)
            * uCausticStrength * uCausticOnObjects * causticUp;
          #include <opaque_fragment>`)
    }
    // three met les programmes en cache sur le TEXTE de onBeforeCompile : la
    // greffe étant la même fonction partout, la clé doit porter l'injection
    // d'origine, sinon une roche hériterait du programme d'une algue.
    material.customProgramCacheKey = () => `${previous ? previous.toString() : ''}|caustics`
    return material
  }
}
