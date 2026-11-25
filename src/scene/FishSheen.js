import * as THREE from 'three'

/**
 * Reflet d'écailles, partagé par tous les poissons (banc, rôdeurs, élevage).
 *
 * Les palettes restent volontairement sombres — c'est la silhouette qui fait
 * lire un poisson sur le sable. Ce module n'éclaircit donc rien : il ajoute
 * l'éclat bref d'un flanc qui se présente à la lumière tombée de la surface
 * et à l'œil, celui qui fait scintiller un banc quand il vire.
 *
 * Récit : l'éclat suit la clarté de l'eau — dans une eau chargée, les
 * poissons ternissent. Additif et débrayable : `gain` à 0 → image identique.
 */
export class FishSheen {
  constructor() {
    this.uniforms = {
      uSheenStrength: { value: 0 },
      uSheenColor: { value: new THREE.Color() },
      uSheenPower: { value: 18 },
    }
    this.gain = 1.2 // réglage debug ; 0 = coupé
  }

  /** @param clarity 1 en eau claire près de la surface, 0 en eau chargée ou profonde (même mesure que les caustiques). */
  update(clarity, lightColor, ambientColor) {
    this.uniforms.uSheenStrength.value = clarity * this.gain
    this.uniforms.uSheenColor.value.copy(ambientColor).lerp(lightColor, 0.45)
  }

  /** Greffe l'éclat sur un MeshLambertMaterial, en respectant son onBeforeCompile (la nage). */
  patch(material) {
    const previous = material.onBeforeCompile
    const uniforms = this.uniforms
    material.onBeforeCompile = (shader, renderer) => {
      previous?.(shader, renderer)
      Object.assign(shader.uniforms, uniforms)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uSheenStrength;
          uniform vec3  uSheenColor;
          uniform float uSheenPower;`)
        .replace('#include <opaque_fragment>', `
          if (uSheenStrength > 0.0) {
            vec3 sheenUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
            // + epsilon : vu pile du dessous, les deux directions s'annulent.
            vec3 sheenHalf = normalize(sheenUp + normalize(vViewPosition) + 1e-5);
            outgoingLight += uSheenColor * uSheenStrength
              * pow(max(dot(normal, sheenHalf), 0.0), uSheenPower);
          }
          #include <opaque_fragment>`)
    }
    // Clé de cache : three compare le TEXTE de onBeforeCompile, identique ici
    // pour toutes les espèces — elle doit porter la nage d'origine.
    material.customProgramCacheKey = () => `${previous ? previous.toString() : ''}|sheen`
    return material
  }
}
