import * as THREE from 'three'
import { NOISE_GLSL } from '../shaders/noise.glsl.js'
import { clamp } from '../core/math.js'

/**
 * Rais de lumière sous-marins (« god rays »), version fausse-volumétrique.
 *
 * Pas de vrai volumetric marching (une passe de plus, chère sur GPU intégré) :
 * des quads croisés additifs, ancrés sous la surface et inclinés selon la
 * direction RÉFRACTÉE du soleil — c'est cette inclinaison qui les rend
 * crédibles, un rai vertical à 17 h se lit immédiatement comme faux.
 *
 * Les rais racontent aussi l'état du milieu : leur intensité suit la clarté de
 * l'eau (une eau à bloom les éteint) et la hauteur du soleil. Aucune géométrie
 * n'est régénérée : les ancres s'enroulent autour de la caméra dans le vertex
 * shader, comme la neige marine.
 */

const VERT = /* glsl */ `
precision highp float;

uniform vec3  uCameraPos;
uniform vec3  uShaftDir;   // direction de propagation sous l'eau (normalisée, vers le bas)
uniform float uBoxRadius;  // rayon de la zone enroulée autour de la caméra
uniform float uLength;     // longueur d'un rai le long de uShaftDir

// L'attribut position est injecté par ShaderMaterial : (u dans [-0.5, 0.5], v dans [0, 1], z inutilisé)
in vec2 aAnchor;           // ancre xz du rai, à enrouler autour de la caméra
in vec2 aAxis;             // axe horizontal du quad (les deux quads d'un rai se croisent)
in vec2 aParams;           // x : demi-largeur, y : graine

out float vU;
out float vV;
out float vSeed;

void main() {
  // Enroulement : le champ de rais suit la caméra sans jamais être régénéré.
  vec2 rel = mod(aAnchor - uCameraPos.xz + uBoxRadius, 2.0 * uBoxRadius) - uBoxRadius;
  vec3 base = vec3(uCameraPos.x + rel.x, 0.0, uCameraPos.z + rel.y);

  vec3 axis = normalize(vec3(aAxis.x, 0.0, aAxis.y));
  vec3 world = base + axis * (position.x * aParams.x * 2.0) + uShaftDir * (position.y * uLength);

  vU = position.x;
  vV = position.y;
  vSeed = aParams.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
${NOISE_GLSL}

uniform vec3  uColor;
uniform float uIntensity;
uniform float uTime;

in float vU;
in float vV;
in float vSeed;
out vec4 fragColor;

void main() {
  // Bord doux, naissance sous la surface, extinction en profondeur.
  float edge = 1.0 - smoothstep(0.05, 0.5, abs(vU));
  float head = smoothstep(0.02, 0.16, vV);
  float tail = 1.0 - smoothstep(0.45, 1.0, vV);

  // Scintillement : les colonnes de lumière dérivent lentement, comme la
  // surface qui les focalise. Le bruit se déplace le long du rai, pas en travers.
  float n = 0.5 + 0.5 * noised(vec2(vSeed * 41.0 + vU * 2.5, vV * 5.0 - uTime * 0.32)).x;
  n *= 0.6 + 0.4 * (0.5 + 0.5 * noised(vec2(vSeed * 13.0 - uTime * 0.05, vV * 1.5)).x);

  float a = edge * edge * head * tail * n * uIntensity;
  if (a < 0.002) discard;
  fragColor = vec4(uColor * a, 1.0);
}
`

export class LightShafts {
  constructor({ count = 26, boxRadius = 55, length = 46 } = {}) {
    this.uniforms = {
      uCameraPos: { value: new THREE.Vector3() },
      uShaftDir: { value: new THREE.Vector3(0, -1, 0) },
      uBoxRadius: { value: boxRadius },
      uLength: { value: length },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uIntensity: { value: 0 },
      uTime: { value: 0 },
    }

    this.mesh = new THREE.Mesh(
      this._buildGeometry(count),
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: this.uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 4
    this.mesh.visible = false

    this._clarity = 1
    this._sunElevation = 10
    this._refracted = new THREE.Vector3(0, -1, 0)
  }

  _buildGeometry(count) {
    // Deux quads croisés par rai : lisibles sous tous les azimuts sans billboard.
    const quads = count * 2
    const positions = new Float32Array(quads * 4 * 3)
    const anchors = new Float32Array(quads * 4 * 2)
    const axes = new Float32Array(quads * 4 * 2)
    const params = new Float32Array(quads * 4 * 2)
    const indices = []

    let s = 20260915
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }

    const corners = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]
    for (let i = 0; i < count; i++) {
      const ax = rnd() * 55 * 2 - 55
      const az = rnd() * 55 * 2 - 55
      const halfWidth = 0.9 + rnd() * 2.6
      const seed = rnd()
      const angle = rnd() * Math.PI
      for (let q = 0; q < 2; q++) {
        const a = angle + q * Math.PI * 0.5
        const quad = i * 2 + q
        for (let c = 0; c < 4; c++) {
          const v = quad * 4 + c
          positions[v * 3] = corners[c][0]
          positions[v * 3 + 1] = corners[c][1]
          positions[v * 3 + 2] = 0
          anchors[v * 2] = ax
          anchors[v * 2 + 1] = az
          axes[v * 2] = Math.cos(a)
          axes[v * 2 + 1] = Math.sin(a)
          params[v * 2] = halfWidth
          params[v * 2 + 1] = seed
        }
        const b = quad * 4
        indices.push(b, b + 1, b + 2, b, b + 2, b + 3)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aAnchor', new THREE.BufferAttribute(anchors, 2))
    geometry.setAttribute('aAxis', new THREE.BufferAttribute(axes, 2))
    geometry.setAttribute('aParams', new THREE.BufferAttribute(params, 2))
    geometry.setIndex(indices)
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    return geometry
  }

  applyEcosystem(state) {
    this._clarity = state.clarity
    this._sunElevation = state.sunElevation
  }

  /**
   * @param lightColor couleur du soleil déjà filtrée par la colonne d'eau
   *                   (Underwater.lightColor) : les rais s'éteignent donc en
   *                   profondeur au même rythme que la lumière directe.
   */
  update(elapsed, camera, sky, lightColor) {
    const depth = Math.max(0, -camera.position.y)
    const sunUp = clamp(this._sunElevation / 14, 0, 1)

    // Bande utile : rien collé à la surface (l'écume s'en charge), rien près
    // du fond (les caustiques prennent le relais).
    const band = clamp((depth - 2) / 7, 0, 1) * (1 - clamp((depth - 34) / 20, 0, 1))
    const intensity = 0.30 * band * Math.pow(this._clarity, 1.6) * sunUp

    this.mesh.visible = intensity > 0.004
    if (!this.mesh.visible) return

    // Direction réfractée (Snell, n = 1.333) : c'est l'inclinaison réelle des
    // rais sous l'eau, plus verticale que le soleil ne le laisse penser.
    const eta = 1 / 1.333
    const sun = sky.sunDirection
    const cosI = clamp(sun.y, 0.001, 1)
    const sin2T = eta * eta * (1 - cosI * cosI)
    const cosT = Math.sqrt(Math.max(1 - sin2T, 0))
    this._refracted.set(-sun.x * eta, 0, -sun.z * eta)
    this._refracted.y = -(cosT)
    this._refracted.normalize()

    this.uniforms.uShaftDir.value.copy(this._refracted)
    this.uniforms.uTime.value = elapsed
    this.uniforms.uCameraPos.value.copy(camera.position)
    this.uniforms.uIntensity.value = intensity
    this.uniforms.uColor.value.copy(lightColor).multiplyScalar(2.2)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
