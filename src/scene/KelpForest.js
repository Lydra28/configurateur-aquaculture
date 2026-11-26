import * as THREE from 'three'
import { clamp, lerp } from '../core/math.js'
import { FLOOR_Y, floorHeight } from './Underwater.js'

/**
 * Forêt de kelp géant (références fournies par Romain le 25/11/2026 : forêts
 * de Macrocystis vues en plongée — colonnes montant du fond à la surface,
 * lames dorées en rétro-éclairage, panache au sommet).
 *
 * Un plant = UNE géométrie fusionnée : trois stipes fins qui s'enroulent, des
 * lames attachées en spirale tout du long (rubans vrillés, plus longs et
 * plus denses vers le haut), un panache sommital. Trois variantes, instanciées.
 *
 * Mouvement (vertex shader, aucun coût CPU) : la colonne entière penche et
 * ondule avec la houle — l'onde remonte le stipe, l'amplitude croît avec la
 * hauteur — et chaque lame flotte au bout de son attache, à sa propre phase.
 *
 * Cadrage : les colonnes sont plantées PAR RAPPORT AU REGARD (comme les
 * poissons garantis), surtout dans la moitié gauche et au lointain — la
 * moitié droite est réservée aux cages. Fines, elles ne masquent pas la
 * bande de sable (le premier plan de laminaires avait été retiré pour ça).
 *
 * Récit (applyEcosystem) : le kelp vit de lumière. Eau chargée ou vivant en
 * recul : les colonnes brunissent, perdent leur lueur, puis se raréfient
 * (il en reste toujours quelques-unes, ternes — un milieu mort n'est pas vide).
 */

const HEIGHT = 40 // hauteur de la géométrie, en mètres ; l'instance la remet à l'échelle

// { da: angle relatif au regard (rad, négatif = gauche), r: distance (m) }
// Champ horizontal ≈ ±1,05 rad ; cages à 0,10 / 0,55 / 0,84 rad, 58 à 92 m.
const SLOTS = [
  // plan moyen, moitié gauche
  { da: -0.98, r: 44 }, { da: -0.86, r: 62 }, { da: -0.78, r: 38 }, { da: -0.66, r: 74 },
  { da: -0.58, r: 52 }, { da: -0.47, r: 84 }, { da: -0.40, r: 60 }, { da: -0.29, r: 92 },
  { da: -0.20, r: 70 }, { da: -0.90, r: 82 }, { da: -0.70, r: 96 }, { da: -0.52, r: 34 },
  // bord droit du cadre, au-delà de la dernière cage
  { da: 1.00, r: 48 }, { da: 1.04, r: 66 }, { da: 0.97, r: 80 },
  // lointain, sur toute la largeur : silhouettes dans le voile
  { da: -1.02, r: 118, far: true }, { da: -0.84, r: 132, far: true }, { da: -0.62, r: 112, far: true },
  { da: -0.44, r: 140, far: true }, { da: -0.26, r: 120, far: true }, { da: -0.08, r: 134, far: true },
  { da: 0.12, r: 126, far: true }, { da: 0.30, r: 144, far: true }, { da: 0.48, r: 122, far: true },
  { da: 0.68, r: 138, far: true }, { da: 0.88, r: 116, far: true }, { da: 1.03, r: 128, far: true },
]

function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Un plant entier, pied à l'origine, sommet vers +Y. */
function buildKelpGeometry(seed) {
  const rnd = seededRandom(seed)
  const positions = [], colors = [], kelp = [], indices = []
  // Un pied porte plusieurs stipes qui s'enroulent : la colonne est une
  // gerbe hirsute, pas une tige à barreaux. Chacun serpente à sa façon.
  const makeStipe = () => {
    const px = rnd() * 6.28, pz = rnd() * 6.28
    const ox = (rnd() - 0.5) * 0.5, oz = (rnd() - 0.5) * 0.5
    const wander = 0.8 + rnd() * 0.7
    return (t) => new THREE.Vector3(
      ox + Math.sin(t * 5.2 + px) * wander * t, t * HEIGHT, oz + Math.cos(t * 4.1 + pz) * wander * t)
  }
  const stipes = [makeStipe(), makeStipe(), makeStipe()]

  // Ruban : `points` + vecteur de largeur par point ; attributs de mouvement.
  const ribbon = (points, widths, colorAt, heightAt, phase, alongAt) => {
    const base = positions.length / 3
    points.forEach((p, i) => {
      const w = widths[i]
      positions.push(p.x - w.x, p.y - w.y, p.z - w.z, p.x + w.x, p.y + w.y, p.z + w.z)
      const c = colorAt(i / (points.length - 1))
      colors.push(...c, ...c)
      const h = heightAt(i), b = alongAt(i)
      kelp.push(h, b, phase, h, b, phase)
      if (i > 0) {
        const a = base + (i - 1) * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    })
  }

  // --- Stipes : deux rubans croisés chacun, lisibles sous tous les angles --
  const STIPE = [0.13, 0.13, 0.06]
  for (const stipeAt of stipes) {
    for (const axis of [new THREE.Vector3(0.06, 0, 0), new THREE.Vector3(0, 0, 0.06)]) {
      const points = [], widths = []
      for (let i = 0; i <= 40; i++) { points.push(stipeAt(i / 40)); widths.push(axis) }
      ribbon(points, widths, () => STIPE, (i) => i / 40, 0, () => 0)
    }
  }

  // --- Lames : en spirale le long des stipes, panache au sommet -----------
  const up = new THREE.Vector3(0, 1, 0)
  const blade = (stipeAt, t, azimuth, length, lift) => {
    const root = stipeAt(t)
    const out = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth))
    const side = new THREE.Vector3(-out.z, 0, out.x)
    const phase = rnd()
    const twist = (rnd() - 0.5) * 3.4
    const droop = 0.45 + rnd() * 0.75  // poids de la lame : aucune ne retombe pareil
    const curl = (rnd() - 0.5) * 0.9   // elle part aussi de travers
    const ruffle = rnd() * 6.28
    const points = [], widths = []
    const N = 6
    for (let i = 0; i <= N; i++) {
      const s = i / N
      // La lame part de son attache, puis retombe et s'incurve.
      points.push(root.clone()
        .addScaledVector(out, length * s * (0.55 + 0.45 * Math.cos(lift)))
        .addScaledVector(side, length * curl * s * s)
        .addScaledVector(up, length * (Math.sin(lift) * s - droop * s * s
          + Math.sin(s * 8.0 + ruffle) * 0.035)))
      // Profil lancéolé, face plutôt verticale (visible de côté), vrillée.
      const half = length * 0.105 * Math.sin(Math.PI * Math.pow(0.06 + 0.94 * s, 0.75))
      const angle = 1.15 + twist * s
      widths.push(up.clone().multiplyScalar(Math.sin(angle) * half)
        .addScaledVector(side, Math.cos(angle) * half))
    }
    // Brun olive à l'attache, doré au bout (références) ; quelques lames
    // vieillies, plus jaunes. Le haut de la colonne reçoit plus de lumière.
    const tone = 0.7 + rnd() * 0.6
    const aged = rnd() < 0.18
    // Rouge poussé : la lumière ambiante est cyan, un albédo « doré » neutre
    // ressortirait vert vif.
    const root0 = [0.13 * tone, 0.10 * tone, 0.04 * tone]
    const tip = aged
      ? [0.68 * tone, 0.40 * tone, 0.08 * tone]
      : [lerp(0.36, 0.60, t) * tone, lerp(0.27, 0.38, t) * tone, 0.07 * tone]
    ribbon(points, widths,
      (s) => [lerp(root0[0], tip[0], s), lerp(root0[1], tip[1], s), lerp(root0[2], tip[2], s)],
      () => t, phase, (i) => i / N)
  }
  const perStipe = 52
  for (const stipeAt of stipes) {
    for (let k = 0; k < perStipe; k++) {
      const t = 0.04 + 0.94 * Math.pow((k + rnd()) / perStipe, 0.8)
      blade(stipeAt, t, k * 2.4 + rnd() * 1.6,
        lerp(1.3, 3.0, t) * (0.55 + rnd() * 0.9), -0.35 + rnd() * 1.4)
    }
    for (let k = 0; k < 7; k++) {
      blade(stipeAt, 0.94 + rnd() * 0.06, rnd() * 6.28, 2.6 + rnd() * 2.2, 0.5 + rnd() * 0.9)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aKelp', new THREE.Float32BufferAttribute(kelp, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export class KelpForest {
  constructor() {
    this.group = new THREE.Group()
    this.uniforms = {
      uTime: { value: 0 },
      uKelpSway: { value: 1 }, // réglage debug ; 0 = colonnes figées
      uKelpLight: { value: new THREE.Color() },
    }
    this.glow = 0.55 // réglage debug : lueur des lames en rétro-éclairage
    this._vigor = 1
    this._alive = 1
    this._placed = false
    this._rnd = seededRandom(20261125)

    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          uniform float uKelpSway;
          attribute vec3 aKelp; // (hauteur 0-1, abscisse sur la lame 0-1, phase)
          varying float vKelpGlow;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float kSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
          float kBend = aKelp.x * aKelp.x * uKelpSway;
          // Houle : la colonne penche, et une onde lente remonte le stipe.
          transformed.x += (sin(uTime * 0.42 + kSeed + aKelp.x * 3.2) * 2.2
                          + sin(uTime * 0.19 + kSeed * 1.7) * 1.6) * kBend;
          transformed.z += (cos(uTime * 0.35 + kSeed * 1.3 + aKelp.x * 2.6) * 1.8
                          + cos(uTime * 0.15 + kSeed * 0.6) * 1.2) * kBend;
          // Chaque lame flotte au bout de son attache, à sa propre phase.
          float kPhase = aKelp.z * 6.2832 + aKelp.x * 9.0;
          transformed.y += sin(uTime * 1.25 + kPhase + aKelp.y * 4.5) * aKelp.y * 0.22 * uKelpSway;
          transformed.x += cos(uTime * 0.9 + kPhase + aKelp.y * 3.0) * aKelp.y * aKelp.y * 0.3 * uKelpSway;
          vKelpGlow = (0.35 + 0.65 * aKelp.x) * (0.4 + 0.6 * aKelp.y);`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uKelpLight;
          varying float vKelpGlow;`)
        .replace('#include <opaque_fragment>', `
          // Rétro-éclairage : la lumière traverse les lames, surtout vers la surface.
          outgoingLight += diffuseColor.rgb * uKelpLight * vKelpGlow;
          #include <opaque_fragment>`)
    }

    this._pops = [101, 211, 307].map((seed, v) => {
      const slots = SLOTS.filter((_, i) => i % 3 === v)
      const mesh = new THREE.InstancedMesh(buildKelpGeometry(seed), material, slots.length)
      mesh.frustumCulled = false
      mesh.count = 0 // rien avant le placement par rapport au regard
      const colors = new Float32Array(slots.length * 3)
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
      this.group.add(mesh)
      return { mesh, slots, colors }
    })
  }

  applyEcosystem(state) {
    const { biodiversity, clarity } = state
    // Lumière ET vivant comptent, mais leur produit brut était trop sévère :
    // une seule variable (20 points) rasait 44 % de la forêt. L'exposant
    // ramène ce recul à ~20 %, et laisse le pire scénario presque nu.
    this._alive = Math.pow(clamp(clarity * 1.2 - 0.1, 0, 1) * clamp(biodiversity * 1.3, 0, 1), 0.6)
    this._vigor = clamp(0.25 + 0.75 * this._alive, 0, 1)
    this._tint()
  }

  _tint() {
    const stress = 1 - this._vigor
    for (const { mesh, slots, colors } of this._pops) {
      // Marge de 5 % seulement : la forêt est pleine à l'état d'arrivée du
      // décor (alive ≈ 0,95) et recule dès la première variable choisie.
      if (this._placed) mesh.count = Math.round(slots.length * clamp(this._alive * 1.05, 0.12, 1))
      slots.forEach((slot, i) => {
        const shade = slot.far ? 0.85 : 1
        colors[i * 3] = lerp(1.0, 0.62, stress) * shade
        colors[i * 3 + 1] = lerp(1.0, 0.46, stress) * shade
        colors[i * 3 + 2] = lerp(1.0, 0.30, stress) * shade
      })
      mesh.instanceColor.needsUpdate = true
    }
  }

  /** Plante les colonnes une fois le cap verrouillé (même repère que les cages). */
  alignToView(viewHeading) {
    const viewAngle = Math.atan2(-Math.cos(viewHeading), -Math.sin(viewHeading))
    const dummy = new THREE.Object3D()
    for (const { mesh, slots } of this._pops) {
      slots.forEach((slot, i) => {
        const a = viewAngle + slot.da
        const x = Math.cos(a) * slot.r, z = Math.sin(a) * slot.r
        const foot = FLOOR_Y + floorHeight(x, z) - 0.3
        // Marge sous la surface : le panache et l'ondulation montent encore de ~3 m.
        const top = -5 - this._rnd() * 7
        dummy.position.set(x, foot, z)
        dummy.scale.setScalar((top - foot) / HEIGHT)
        dummy.rotation.y = this._rnd() * Math.PI * 2
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
    this._placed = true
    this._tint()
  }

  /** @param lightColor, ambientColor lumière filtrée par la colonne d'eau (Underwater) */
  update(elapsed, lightColor, ambientColor) {
    this.uniforms.uTime.value = elapsed
    this.uniforms.uKelpLight.value.copy(ambientColor).lerp(lightColor, 0.5)
      .multiplyScalar(this.glow * this._vigor)
  }

  dispose() {
    for (const { mesh } of this._pops) { mesh.geometry.dispose(); mesh.dispose() }
    this._pops[0].mesh.material.dispose()
  }
}
