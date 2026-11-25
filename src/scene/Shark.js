import * as THREE from 'three'
import { clamp, lerp } from '../core/math.js'

/**
 * Requin — une seule silhouette qui croise au large, dans le voile.
 *
 * Forme : fuseau contre-ombré (dos bleu ardoise, ventre clair), longues
 * pectorales, dorsale haute, queue asymétrique — la silhouette d'un requin
 * peau bleue, grossie pour rester lisible à 40-85 m (tailles stylisées,
 * comme le reste de la faune).
 *
 * Comportement : il ne chasse pas, il patrouille. Une grande boucle aplatie
 * face au regard — il traverse le cadre au loin dans un sens, revient plus
 * près dans l'autre — donc presque toujours visible, jamais au premier plan.
 *
 * Récit (applyEcosystem) : le grand prédateur est le signe d'un milieu qui
 * tient. Quand la biodiversité recule, sa boucle s'éloigne dans le voile
 * jusqu'à disparaître ; l'oxygène règle son allure.
 */

const LENGTH = 7.5 // mètres, stylisé

// [x, demi-hauteur, demi-largeur] — museau en +X, longueur 1
const STATIONS = [
  [0.50, 0.004, 0.004],
  [0.44, 0.030, 0.032],
  [0.34, 0.058, 0.060],
  [0.18, 0.082, 0.074],
  [0.00, 0.088, 0.070],
  [-0.16, 0.070, 0.052],
  [-0.30, 0.042, 0.030],
  [-0.40, 0.020, 0.014],
  [-0.46, 0.012, 0.008],
]
const BACK = [0.10, 0.17, 0.26]
const FLANK = [0.30, 0.40, 0.50]
const BELLY = [0.82, 0.86, 0.88]
const FIN = [0.12, 0.19, 0.28]
const RING = 8

function buildSharkGeometry() {
  const positions = [], colors = [], indices = []
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

  for (const [x, h, w] of STATIONS) {
    for (let k = 0; k < RING; k++) {
      const a = (k / RING) * Math.PI * 2
      const up = Math.cos(a)
      positions.push(x, up * h, Math.sin(a) * w)
      // Contre-ombrage : la bascule dos → ventre se fait bas sur le flanc.
      const t = clamp((up + 0.35) / 0.7, 0, 1)
      colors.push(...(t > 0.5 ? mix(FLANK, BACK, t * 2 - 1) : mix(BELLY, FLANK, t * 2)))
    }
  }
  for (let s = 0; s < STATIONS.length - 1; s++) {
    for (let k = 0; k < RING; k++) {
      const a = s * RING + k
      const a2 = s * RING + ((k + 1) % RING)
      indices.push(a, a + RING, a2 + RING, a, a2 + RING, a2)
    }
  }

  const fin = (p0, p1, p2) => {
    const base = positions.length / 3
    positions.push(...p0, ...p1, ...p2)
    colors.push(...FIN, ...FIN, ...FIN)
    indices.push(base, base + 1, base + 2)
  }
  fin([0.10, 0.080, 0], [-0.10, 0.225, 0], [-0.07, 0.072, 0])    // dorsale
  fin([-0.28, 0.044, 0], [-0.355, 0.088, 0], [-0.34, 0.034, 0])  // seconde dorsale
  for (const side of [1, -1]) {
    fin([0.22, -0.030, 0.058 * side], [0.01, -0.105, 0.27 * side], [0.11, -0.036, 0.064 * side]) // pectorale
    fin([-0.18, -0.058, 0.036 * side], [-0.27, -0.10, 0.085 * side], [-0.25, -0.048, 0.03 * side]) // pelvienne
  }
  fin([-0.44, 0.012, 0], [-0.65, 0.225, 0], [-0.52, 0, 0])       // caudale : grand lobe haut
  fin([-0.44, -0.012, 0], [-0.56, -0.11, 0], [-0.50, 0, 0])      // petit lobe bas

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export class Shark {
  constructor({ sheen = null } = {}) {
    this.group = new THREE.Group()
    this._time = { value: 0 }

    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this._time
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          // Nage : l'onde part du milieu du corps et s'amplifie vers la queue.
          float tailness = clamp(0.3 - position.x, 0.0, 1.0);
          transformed.z += sin(uTime * 2.1 + position.x * 5.0) * tailness * tailness * 0.16;`)
    }
    sheen?.patch(material)

    this.mesh = new THREE.Mesh(buildSharkGeometry(), material)
    this.mesh.scale.setScalar(LENGTH)
    this.mesh.frustumCulled = false
    this.group.add(this.mesh)

    this._viewAngle = null
    this._tau = 0.6
    this._presence = null // calée sur la cible au premier état reçu
    this._target = 1
    this._pace = 1
  }

  applyEcosystem(state) {
    const { biodiversity, oxygen } = state
    this._target = clamp((biodiversity - 0.35) * 3, 0, 1)
    if (this._presence === null) this._presence = this._target // pas de fuite au chargement
    this._pace = lerp(0.5, 1, clamp(oxygen * 1.3, 0, 1))
  }

  /** @param viewHeading cap caméra (rad) — fixe la boucle face au regard, une fois. */
  update(dt, elapsed, viewHeading = 0) {
    if (this._viewAngle === null) {
      this._viewAngle = Math.atan2(-Math.cos(viewHeading), -Math.sin(viewHeading))
    }
    if (this._presence === null) this._presence = this._target
    this._presence += (this._target - this._presence) * (1 - Math.exp(-dt * 0.25))
    this.mesh.visible = this._presence > 0.03
    if (!this.mesh.visible) return

    this._tau += dt * 0.055 * this._pace
    this._time.value += dt * (0.6 + 0.4 * this._pace)

    // Boucle aplatie : 70 m de part et d'autre du regard, 22 m en profondeur
    // de champ, centrée à 62 m (plus loin quand le milieu ne le porte plus).
    const fx = Math.cos(this._viewAngle), fz = Math.sin(this._viewAngle)
    const lx = -fz, lz = fx
    const dist = lerp(190, 62, this._presence)
    const c = Math.cos(this._tau), s = Math.sin(this._tau)
    const x = fx * (dist + 22 * s) + lx * 70 * c
    const z = fz * (dist + 22 * s) + lz * 70 * c
    const dx = fx * 22 * c - lx * 70 * s
    const dz = fz * 22 * c - lz * 70 * s
    this.mesh.position.set(x, -31 + Math.sin(elapsed * 0.07) * 3, z)
    this.mesh.rotation.y = Math.atan2(-dz, dx)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
