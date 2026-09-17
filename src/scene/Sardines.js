import * as THREE from 'three'
import { clamp, lerp, damp } from '../core/math.js'

/**
 * Faune mobile — banc de sardines (références « sardine 1 » et « banc de
 * sardines », celle-ci pour le comportement : espacement, alignement,
 * courbure du banc — pas pour les couleurs).
 *
 * Le poisson : fusiforme low-poly tête vers +X, contre-ombré comme la
 * référence (dos bleu-nuit, flanc argenté, ventre clair), queue fourchue.
 * À la distance du décor, ce qui se lit est la MASSE du banc et son
 * scintillement — le détail est volontairement économe (~40 sommets).
 *
 * Le banc : pseudo-boids sans coût quadratique — chaque poisson tient une
 * position d'ancrage dans un ellipsoïde autour d'un centre de banc qui
 * ORBITE lentement autour du point de vue, plus une nage propre (orbite
 * locale bruitée + ondulation du corps en vertex shader, phase par individu).
 * Deux bancs déphasés : il y en a presque toujours un dans le champ.
 *
 * Récit (applyEcosystem) : le banc vit d'oxygène. Quand l'O₂ chute, le banc
 * SE DISPERSE (l'ellipsoïde gonfle, la cohésion se perd), ralentit, puis se
 * raréfie avec la biodiversité — la disparition du vivant mobile est le
 * signal le plus lisible de l'effondrement.
 */

function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Sardine low-poly, tête +X, longueur 1, sections en losange. */
function buildSardineGeometry() {
  const positions = []
  const colors = []
  const indices = []

  const BACK = [0.05, 0.09, 0.15]
  const FLANK = [0.70, 0.76, 0.80]
  const BELLY = [0.86, 0.89, 0.91]
  const FIN = [0.45, 0.52, 0.56]

  // stations le long du corps : [x, demi-hauteur, demi-largeur]
  const stations = [
    [0.50, 0.015, 0.010],  // nez
    [0.32, 0.075, 0.045],
    [0.10, 0.095, 0.055],  // maître-bau
    [-0.14, 0.070, 0.042],
    [-0.34, 0.032, 0.018],
    [-0.44, 0.012, 0.008], // pédoncule
  ]
  // 4 sommets par station : haut, flanc droit, ventre, flanc gauche
  for (const [x, h, w] of stations) {
    positions.push(x, h, 0, x, 0, w, x, -h, 0, x, 0, -w)
    colors.push(...BACK, ...FLANK, ...BELLY, ...FLANK)
  }
  for (let s = 0; s < stations.length - 1; s++) {
    const a = s * 4
    const b = a + 4
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4
      indices.push(a + k, b + k, b + k2, a + k, b + k2, a + k2)
    }
  }

  // queue fourchue : deux lames triangulaires depuis le pédoncule
  const ped = positions.length / 3
  positions.push(-0.44, 0, 0, -0.62, 0.10, 0, -0.54, 0.02, 0)
  positions.push(-0.44, 0, 0, -0.62, -0.10, 0, -0.54, -0.02, 0)
  colors.push(...FIN, ...FIN, ...FIN, ...FIN, ...FIN, ...FIN)
  indices.push(ped, ped + 1, ped + 2, ped + 3, ped + 5, ped + 4)

  // dorsale : petit triangle
  const dor = positions.length / 3
  positions.push(0.12, 0.095, 0, -0.02, 0.16, 0, -0.08, 0.075, 0)
  colors.push(...FIN, ...FIN, ...FIN)
  indices.push(dor, dor + 1, dor + 2)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export class Sardines {
  constructor({ count = 320, schools = 2, fishLength = 1.0 } = {}) {
    const rnd = seededRandom(20260919)
    this._fishLength = fishLength
    // créé AVANT le matériau : update() tourne dès la première frame, alors
    // que onBeforeCompile n'est appelé qu'à la première compilation du shader.
    this._time = { value: 0 }

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this._time
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          // Ondulation de nage : l'amplitude croît vers la queue, chaque
          // individu a sa phase — le banc fourmille au lieu de ramer en chœur.
          float tailness = clamp(0.35 - position.x, 0.0, 1.0);
          float phase = float(gl_InstanceID) * 1.71;
          transformed.z += sin(uTime * 7.0 + phase + position.x * 4.0)
                         * tailness * tailness * 0.22;`)
    }

    this.mesh = new THREE.InstancedMesh(buildSardineGeometry(), material, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false

    // Deux bancs CAPTIFS DU CADRE : au lieu d'orbiter tout autour (et de
    // passer l'essentiel du temps hors champ), chaque banc balaie le secteur
    // visible en aller-retour autour de la direction du regard — toujours à
    // l'écran, entrées et sorties par les bords.
    this._schools = []
    for (let s = 0; s < schools; s++) {
      this._schools.push({
        radius: 30 + s * 11,
        height: -9 - s * 6,           // profondeur du cœur du banc
        // Balayage d'ORIGINE restauré (retour Romain : les bancs confinés
        // à gauche disparaissaient derrière le panneau — il les préfère
        // visibles, quitte à croiser les cages à l'écran).
        sweepWidth: 0.55 + s * 0.15,  // amplitude du balayage (rad)
        sweepSpeed: 0.09 - s * 0.025,
        sweepPhase: s * 2.6 + rnd() * 3,
        sideOffset: (s - (schools - 1) / 2) * 0.3,
        bob: rnd() * 6.28,
        prev: new THREE.Vector3(),
        yaw: 0,
        hasPrev: false,
      })
    }

    this._fish = []
    for (let i = 0; i < count; i++) {
      this._fish.push({
        school: i % schools,
        // ancrage dans l'ellipsoïde du banc (cœur dense, bords diffus)
        ox: (rnd() + rnd() - 1) * 6.0,
        oy: (rnd() + rnd() - 1) * 2.0,
        oz: (rnd() + rnd() - 1) * 4.0,
        wobble: rnd() * 6.28,
        wobbleSpeed: 0.6 + rnd() * 0.8,
        scale: fishLength * (0.75 + rnd() * 0.5),
      })
    }

    this._dummy = new THREE.Object3D()
    this._dummy.rotation.order = 'YZX'
    this._prevCenters = this._schools.map(() => new THREE.Vector3())

    // état piloté par l'écosystème
    this._visibleCount = count
    this._spread = 1        // 1 = cohésion saine ; grandit quand l'O₂ chute
    this._pace = 1
  }

  applyEcosystem(state) {
    const { oxygen, biodiversity } = state
    // Dispersion : en dessous de ~60 % d'O₂ le banc perd sa cohésion.
    this._spread = 1 + clamp((0.62 - oxygen) * 4.2, 0, 2.6)
    this._pace = lerp(0.45, 1, clamp(oxygen * 1.3, 0, 1))
    // Raréfaction : la biodiversité emporte le nombre.
    const alive = clamp(biodiversity * 1.25, 0, 1)
    this._visibleCount = Math.round(this._fish.length * clamp(alive, 0.02, 1))
  }

  /**
   * @param viewHeading cap caméra (rad) : sert UNE fois, à placer les bancs
   *                    dans le champ au premier affichage.
   */
  update(dt, elapsed, viewHeading = 0) {
    this._time.value = elapsed

    // direction du regard en angle monde (cap ψ → regard (−sinψ, −cosψ))
    const viewAngle = Math.atan2(-Math.cos(viewHeading), -Math.sin(viewHeading))

    const centers = []
    for (let s = 0; s < this._schools.length; s++) {
      const school = this._schools[s]
      // Balayage du secteur visible : le banc traverse l'écran, fait
      // demi-tour vers le bord, retraverse — jamais longtemps hors champ.
      const sweep = Math.sin(elapsed * school.sweepSpeed * this._pace + school.sweepPhase)
        * school.sweepWidth
      const angle = viewAngle + school.sideOffset + sweep
      const radius = school.radius + Math.sin(elapsed * 0.06 + school.bob) * 5
      const cx = Math.cos(angle) * radius
      const cz = Math.sin(angle) * radius
      const cy = school.height + Math.sin(elapsed * 0.11 + school.bob) * 2.5

      // cap du banc déduit de son mouvement réel (robuste au demi-tour)
      if (school.hasPrev) {
        const dx = cx - school.prev.x
        const dz = cz - school.prev.z
        if (dx * dx + dz * dz > 1e-8) school.yaw = Math.atan2(-dz, dx)
      } else {
        school.hasPrev = true
        school.yaw = Math.atan2(-(Math.cos(angle)), -Math.sin(angle)) // tangent par défaut
      }
      school.prev.set(cx, cy, cz)
      centers.push({ x: cx, y: cy, z: cz, school })
    }

    let drawn = 0
    for (let i = 0; i < this._fish.length && drawn < this._visibleCount; i++) {
      const f = this._fish[i]
      const c = centers[f.school]
      const school = c.school

      // nage propre : petite orbite bruitée autour de l'ancrage
      const w = elapsed * f.wobbleSpeed + f.wobble
      const spread = this._spread
      const x = c.x + f.ox * spread + Math.sin(w) * 0.9
      const y = c.y + f.oy * spread + Math.sin(w * 1.31) * 0.5
      const z = c.z + f.oz * spread + Math.cos(w * 0.83) * 0.9

      // cap : celui du banc + jitter individuel
      const yaw = school.yaw + Math.sin(w * 0.7) * 0.22 * spread

      this._dummy.position.set(x, y, z)
      this._dummy.rotation.set(0, yaw, Math.sin(w * 1.1) * 0.12)
      this._dummy.scale.setScalar(f.scale)
      this._dummy.updateMatrix()
      this.mesh.setMatrixAt(drawn, this._dummy.matrix)
      drawn++
    }
    this.mesh.count = drawn
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
