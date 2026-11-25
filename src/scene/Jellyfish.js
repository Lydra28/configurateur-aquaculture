import * as THREE from 'three'
import { clamp, lerp } from '../core/math.js'

/**
 * Méduses — ombrelles translucides qui pulsent en pleine eau.
 *
 * Une géométrie fusionnée (ombrelle, bras oraux, tentacules en rubans),
 * instanciée. La pulsation est en vertex shader : le bord de l'ombrelle se
 * contracte, les tentacules suivent avec retard ; le CPU ne fait que la
 * dérive lente de chaque individu, calée sur la même phase.
 *
 * Récit (applyEcosystem) : c'est la seule vie qui AUGMENTE quand le milieu
 * se dégrade. Quelques individus en eau saine ; quand la santé chute (excès
 * de nutriments, moins d'oxygène, moins de poissons), elles prolifèrent —
 * le visiteur voit le vivant changer de nature, pas seulement s'éteindre.
 * (Lien pullulations / eutrophisation : généralement admis, à sourcer pour
 * le dossier du groupe.)
 */

const MAX = 40
const HEALTHY = 5
const PHASE_STEP = 2.399 // même pas de phase dans le shader (gl_InstanceID) et sur CPU
const PUSH_LAG = 1.2     // retard de la poussée sur la contraction, idem des deux côtés

const DOME = [0.92, 0.70, 0.88]
const RIM = [0.62, 0.34, 0.78]
const ARM = [0.84, 0.52, 0.76]

function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Méduse de diamètre 1, ombrelle vers +Y, tentacules vers −Y. */
function buildJellyGeometry() {
  const rnd = seededRandom(4242)
  const positions = [], colors = [], jelly = [], indices = []

  // Ombrelle : un peu plus qu'une demi-sphère aplatie, le bord rentre.
  const SEG = 10, RINGS = 6
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS
    const phi = t * 1.75
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2
      positions.push(Math.cos(a) * Math.sin(phi) * 0.5, Math.cos(phi) * 0.35, Math.sin(a) * Math.sin(phi) * 0.5)
      colors.push(lerp(DOME[0], RIM[0], t * t), lerp(DOME[1], RIM[1], t * t), lerp(DOME[2], RIM[2], t * t))
      jelly.push(t * t, 0, 0)
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let k = 0; k < SEG; k++) {
      const a = i * SEG + k, a2 = i * SEG + ((k + 1) % SEG)
      indices.push(a, a + SEG, a2 + SEG, a, a2 + SEG, a2)
    }
  }

  // Ruban pendant : attache, largeur, longueur ; `squeeze` = part de la
  // contraction du bord qu'il suit, `lagScale` = ampleur de son retard.
  const ribbon = (angle, radius, halfWidth, length, squeeze, lagScale) => {
    const base = positions.length / 3
    const phase = rnd() * 6.28
    const ax = Math.cos(angle), az = Math.sin(angle)
    const N = 6
    for (let i = 0; i <= N; i++) {
      const s = i / N
      const w = halfWidth * (1 - 0.6 * s)
      const y = -0.05 - length * s
      positions.push(ax * radius - az * w, y, az * radius + ax * w, ax * radius + az * w, y, az * radius - ax * w)
      colors.push(...ARM, ...ARM)
      jelly.push(squeeze, s * lagScale, phase, squeeze, s * lagScale, phase)
      if (i > 0) {
        const a = base + (i - 1) * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
  }
  for (let k = 0; k < 8; k++) ribbon((k / 8) * Math.PI * 2 + 0.2, 0.46, 0.022, 1.3 + rnd() * 0.9, 1, 1)
  for (let k = 0; k < 4; k++) ribbon((k / 4) * Math.PI * 2, 0.10, 0.07, 0.8 + rnd() * 0.4, 0.3, 0.6)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aJelly', new THREE.Float32BufferAttribute(jelly, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export class Jellyfish {
  constructor() {
    this.uniforms = {
      uTime: { value: 0 },
      uJellyGlow: { value: new THREE.Color() },
    }
    this.glow = 0.4 // lueur propre : la lumière traverse l'ombrelle

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    })
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          attribute vec3 aJelly; // (suivi de la contraction, retard le long du ruban, phase)
          varying float vJellyAlpha;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float jPhase = float(gl_InstanceID) * ${PHASE_STEP};
          float jBeat = 0.5 + 0.5 * sin(uTime * 1.5 + jPhase); // 1 = ombrelle contractée
          transformed.xz *= 1.0 - 0.24 * aJelly.x * jBeat;
          transformed.y -= 0.06 * aJelly.x * jBeat;
          // Tentacules : ils traînent, l'onde de la pulsation les parcourt avec retard.
          float jLag = aJelly.y;
          transformed.x += sin(uTime * 1.5 + jPhase - jLag * 3.5 + aJelly.z) * jLag * 0.30;
          transformed.z += cos(uTime * 1.1 + jPhase - jLag * 2.8 + aJelly.z * 1.7) * jLag * 0.26;
          transformed.y += (0.5 + 0.5 * sin(uTime * 1.5 + jPhase - ${PUSH_LAG})) * jLag * 0.35;
          vJellyAlpha = mix(0.5, 1.0, aJelly.x);`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uJellyGlow;
          varying float vJellyAlpha;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.a *= vJellyAlpha;`)
        .replace('#include <opaque_fragment>', `
          outgoingLight += diffuseColor.rgb * uJellyGlow;
          #include <opaque_fragment>`)
    }

    this.mesh = new THREE.InstancedMesh(buildJellyGeometry(), material, MAX)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0

    // Emplacements relatifs au regard : les premiers (toujours présents) sont
    // répartis dans la largeur du cadre, les suivants tirés au hasard.
    const rnd = seededRandom(20261126)
    this._jellies = []
    for (let i = 0; i < MAX; i++) {
      this._jellies.push({
        da: i < HEALTHY ? -0.8 + i * 0.4 + (rnd() - 0.5) * 0.15 : (rnd() * 2 - 1) * 1.0,
        r: 26 + rnd() * 46,
        depth: -6 - rnd() * 26,
        size: 1.5 + rnd() * 1.9,
        yaw: rnd() * 6.28,
        drift: rnd() * 6.28,
      })
    }
    this._dummy = new THREE.Object3D()
    this._placed = false
    this._target = HEALTHY
    this._shown = null
  }

  applyEcosystem(state) {
    const bloom = clamp((1 - state.health) * 1.3, 0, 1)
    this._target = lerp(HEALTHY, MAX, bloom * bloom)
    if (this._shown === null) this._shown = this._target // pas d'apparition au chargement
  }

  /**
   * @param viewHeading cap caméra (rad) — place les méduses face au regard, une fois
   * @param camera caméra immergée : borne la profondeur au cadre
   * @param ambientColor lumière diffusée par l'eau (Underwater)
   */
  update(dt, elapsed, viewHeading, camera, ambientColor) {
    this.uniforms.uTime.value = elapsed
    this.uniforms.uJellyGlow.value.copy(ambientColor).multiplyScalar(this.glow)
    if (!this._placed) {
      const viewAngle = Math.atan2(-Math.cos(viewHeading), -Math.sin(viewHeading))
      const tanHalf = Math.tan(camera.fov * Math.PI / 360)
      for (const j of this._jellies) {
        j.x = Math.cos(viewAngle + j.da) * j.r
        j.z = Math.sin(viewAngle + j.da) * j.r
        // Près de l'œil, le haut du cadre passe sous la surface : une méduse
        // plus haute n'y montrerait que ses tentacules, pendus à la ligne d'eau.
        const frameTop = camera.position.y + tanHalf * j.r * Math.cos(j.da)
        j.depth = Math.min(j.depth, frameTop - 3.5 - 0.4 * j.size)
      }
      this._placed = true
    }
    if (this._shown === null) this._shown = this._target
    this._shown += (this._target - this._shown) * (1 - Math.exp(-dt * 0.4))

    const count = Math.min(MAX, Math.ceil(this._shown))
    for (let i = 0; i < count; i++) {
      const j = this._jellies[i]
      // Les nouvelles venues grandissent au lieu d'apparaître d'un coup.
      const grow = clamp(this._shown - i, 0, 1)
      // Chaque contraction la pousse un peu vers le haut (phase du shader, en retard).
      const push = Math.sin(elapsed * 1.5 + i * PHASE_STEP - PUSH_LAG) * 0.12 * j.size
      this._dummy.position.set(
        j.x + Math.sin(elapsed * 0.05 + j.drift * 1.7) * 2.5,
        j.depth + Math.sin(elapsed * 0.11 + j.drift) * 2.0 + push,
        j.z + Math.cos(elapsed * 0.04 + j.drift) * 2.5,
      )
      this._dummy.rotation.set(
        Math.sin(elapsed * 0.17 + j.drift) * 0.22, j.yaw, Math.cos(elapsed * 0.13 + j.drift * 1.3) * 0.22)
      this._dummy.scale.setScalar(j.size * grow)
      this._dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this._dummy.matrix)
    }
    this.mesh.count = count
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.mesh.dispose()
  }
}
