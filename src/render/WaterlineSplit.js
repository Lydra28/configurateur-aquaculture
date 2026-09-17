import * as THREE from 'three'

/**
 * Compositeur « ligne de flottaison ».
 *
 * Voir la surface ET le fond dans la même image est physiquement impossible
 * avec une seule caméra (le brouillard, le ciel et l'état émergé/submergé sont
 * globaux au rendu). On assume donc la coupe : deux rendus complets — le monde
 * émergé et le monde submergé — recollés à l'écran le long d'une ligne d'eau,
 * avec un ménisque (le petit bourrelet lumineux qu'on voit sur une vitre
 * d'aquarium) et une légère réfraction juste sous la ligne.
 *
 * Les deux passes rendent en HDR linéaire ; bloom et tone mapping restent dans
 * l'EffectComposer, en aval — rien ne change pour les shaders existants.
 */

const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
#define PROFILE_N 128

uniform sampler2D tAbove;
uniform sampler2D tBelow;
uniform float uLine;      // hauteur écran MOYENNE de la ligne d'eau (0 = bas)
uniform float uTime;
uniform float uBelowGain; // compense l'exposition unique du composite : l'œil
                          // (et l'ancien tone mapping) donnait ~2× plus de
                          // sensibilité au monde immergé qu'au ciel du soir
uniform float uProfile[PROFILE_N]; // profil de la houle en fraction d'écran,
                                   // échantillonné sur la vraie surface (CPU)
uniform vec3  uFoamColor; // crête d'écume — blanche saine, beige quand l'eau se charge

in vec2 vUv;
out vec4 fragColor;

// Interpolation manuelle : robuste partout, aucun prérequis de filtrage float.
float waveProfile(float x) {
  float p = clamp(x, 0.0, 1.0) * float(PROFILE_N - 1);
  float i = floor(p);
  float f = p - i;
  int a = int(i);
  int b = int(min(i + 1.0, float(PROFILE_N - 1)));
  return mix(uProfile[a], uProfile[b], f);
}

void main() {
  // La ligne d'eau n'est pas droite : c'est le PROFIL de la houle vu de côté.
  float line = uLine + waveProfile(vUv.x);
  float d = vUv.y - line;

  // Juste sous la ligne, l'eau réfracte : léger tremblement horizontal-dépendant.
  vec2 uvBelow = vUv;
  uvBelow.y += smoothstep(0.05, 0.0, abs(d)) * 0.004
             * sin(uTime * 1.4 + vUv.x * 34.0);

  // Chaque texture contient le rendu COMPLET de sa bande (caméra à aspect
  // dédié) : on remappe la hauteur de bande vers [0,1] de la texture.
  vec3 color;
  if (d > 0.0) {
    float va = (vUv.y - line) / max(1.0 - line, 1e-3);
    color = texture(tAbove, vec2(vUv.x, va)).rgb;
  } else {
    float vb = uvBelow.y / max(line, 1e-3);
    color = texture(tBelow, vec2(uvBelow.x, vb)).rgb * uBelowGain;
    // La lumière entre par la surface : sans le plafond de vagues (retiré),
    // c'est ce dégradé qui dit « on est juste sous l'eau ».
    float depthBelow = clamp((line - vUv.y) / max(line, 1e-3), 0.0, 1.0);
    color *= mix(1.45, 1.0, smoothstep(0.0, 0.38, depthBelow));
  }

  // Crête d'écume : une fine frange posée SUR la ligne, comme sur une vague
  // vue de profil. Elle suit l'état du milieu via uFoamColor.
  float foam = (1.0 - smoothstep(0.0005, 0.0065, d)) * step(0.0, d);
  color = mix(color, uFoamColor * 1.15, foam * 0.85);

  // Ménisque : une bande fine et claire côté immergé.
  float glow = smoothstep(0.0032, 0.0, abs(d + 0.0022));
  color += vec3(0.30, 0.52, 0.58) * glow * 0.6;

  fragColor = vec4(color, 1.0);
}
`

export class WaterlineSplit {
  constructor({ line = 1 / 3 } = {}) {
    // uLine est en uv depuis le BAS : 1/3 d'écran pour le ciel → ligne à 2/3.
    this.baseLine = 1 - line

    const options = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      samples: 0,
    }
    this.rtAbove = new THREE.WebGLRenderTarget(1, 1, options)
    this.rtBelow = new THREE.WebGLRenderTarget(1, 1, options)

    this.profileSize = 128
    this.profile = new Float32Array(this.profileSize)

    this.uniforms = {
      tAbove: { value: this.rtAbove.texture },
      tBelow: { value: this.rtBelow.texture },
      uLine: { value: this.baseLine },
      uTime: { value: 0 },
      uBelowGain: { value: 2.0 },
      uProfile: { value: this.profile },
      uFoamColor: { value: new THREE.Color(0.94, 0.97, 1.0) },
    }

    // Scène minimale que l'EffectComposer rend en première passe.
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: this.uniforms,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    )
    quad.frustumCulled = false
    this.scene.add(quad)
  }

  setSize(width, height, pixelRatio) {
    const w = Math.round(width * pixelRatio)
    const h = Math.round(height * pixelRatio)
    this.rtAbove.setSize(w, h)
    this.rtBelow.setSize(w, h)
  }

  update(elapsed) {
    this.uniforms.uTime.value = elapsed
    // Plus de respiration artificielle : la ligne vit par le profil de houle
    // réel que main.js écrit chaque frame dans uProfile.
  }

  dispose() {
    this.rtAbove.dispose()
    this.rtBelow.dispose()
  }
}
