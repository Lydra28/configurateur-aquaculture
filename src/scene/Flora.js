import * as THREE from 'three'
import { clamp, lerp } from '../core/math.js'
import { FLOOR_Y, floorHeight } from './Underwater.js'
import { ROCK_RIDGES } from './Rocks.js'

/**
 * Flore atlantique — famille d'assets reconstruits d'après références.
 *
 * Trois espèces, trois récits :
 * - **Laminaria digitata** (réfs « laminaria digitata 1 & 2 ») : stipe →
 *   éventail de lanières dorées. L'algue des eaux claires : jaunit avec la
 *   turbidité, disparaît avec la biodiversité. Forêts sur les arêtes rocheuses.
 * - **Fucus vésiculeux** (réf « fucus vésiculeux ») : touffes olive à
 *   ramification en fourche, flotteurs jaunes. La coriace de l'estran : elle
 *   brunit mais résiste plus longtemps que les autres. Sur substrat dur.
 * - **Zostère marine** (réf « zostère marine ») : herbier de brins fins sur
 *   SABLE, vert vif à pointes brunes. La sentinelle de la lumière : l'herbier
 *   recule dès que la turbidité monte — le premier signal visible du déclin.
 *
 * Technique commune : chaque plant est UNE géométrie fusionnée (rubans +
 * petits volumes), 3 variantes par espèce, instanciées. La houle est en
 * vertex shader (phase par ruban, amplitude croissant avec la hauteur via
 * l'attribut aH) — la flore bat, aucun coût CPU.
 */

function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// Les arêtes rocheuses (partagées avec Rocks.js) : substrat dur.
const RIDGES = ROCK_RIDGES

// Plaines de sable ENTRE les arêtes, en couronne elles aussi : quel que soit
// le cap caméra, au moins un herbier reste dans le champ.
const MEADOWS = [
  { x: 58, z: 42, radius: 30 },
  { x: -65, z: 29, radius: 28 },
  { x: 7, z: -71, radius: 30 },
]

/** Accumulateur de géométrie : rubans + petits volumes, attributs de houle. */
function createAccumulator() {
  const positions = [], colors = [], sways = [], heights = [], indices = []
  let base = 0
  return {
    /** Ruban vertical extrudé en largeur le long de points successifs. */
    strip(points, halfWidths, color0, color1, swayPhase, swayScale = 1) {
      for (let i = 0; i < points.length; i++) {
        const p = points[i]
        const t = i / (points.length - 1)
        const w = halfWidths[i]
        positions.push(p.x - w, p.y, p.z, p.x + w, p.y, p.z)
        const c = [
          lerp(color0[0], color1[0], t),
          lerp(color0[1], color1[1], t),
          lerp(color0[2], color1[2], t),
        ]
        colors.push(...c, ...c)
        sways.push(swayPhase, swayPhase)
        const h = t * t * swayScale
        heights.push(h, h)
        if (i > 0) {
          const a = base + (i - 1) * 2
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
      }
      base += points.length * 2
    },
    /** Petit octaèdre (flotteur de fucus) : bon marché, lisible en silhouette. */
    blob(center, radius, color, swayPhase, swayH) {
      const verts = [
        [0, radius, 0], [0, -radius, 0],
        [radius, 0, 0], [-radius, 0, 0], [0, 0, radius], [0, 0, -radius],
      ]
      for (const v of verts) {
        positions.push(center.x + v[0], center.y + v[1], center.z + v[2])
        colors.push(...color)
        sways.push(swayPhase)
        heights.push(swayH)
      }
      const o = base
      indices.push(
        o, o + 2, o + 4, o, o + 4, o + 3, o, o + 3, o + 5, o, o + 5, o + 2,
        o + 1, o + 4, o + 2, o + 1, o + 3, o + 4, o + 1, o + 5, o + 3, o + 1, o + 2, o + 5,
      )
      base += 6
    },
    build() {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      geometry.setAttribute('aSway', new THREE.Float32BufferAttribute(sways, 1))
      geometry.setAttribute('aH', new THREE.Float32BufferAttribute(heights, 1))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()
      return geometry
    },
  }
}

/* ------------------------------------------------------------------ */
/* Laminaria digitata                                                  */
/* ------------------------------------------------------------------ */

const STIPE_DARK = [0.16, 0.11, 0.05]
const STRAP_GOLD = [0.52, 0.40, 0.10]
const STRAP_TIP = [0.70, 0.58, 0.20]

function buildLaminariaGeometry(seed) {
  const rnd = seededRandom(seed)
  const acc = createAccumulator()

  const stipeHeight = 0.55 + rnd() * 0.35
  const stipePoints = []
  const stipeWidths = []
  const lean = (rnd() - 0.5) * 0.25
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    stipePoints.push({ x: lean * t * t, y: t * stipeHeight, z: 0 })
    stipeWidths.push(lerp(0.045, 0.03, t))
  }
  acc.strip(stipePoints, stipeWidths, STIPE_DARK, STRAP_GOLD, rnd() * 6.28)

  const strapCount = 5 + Math.floor(rnd() * 4)
  for (let s = 0; s < strapCount; s++) {
    const fan = (s / (strapCount - 1) - 0.5) * (1.5 + rnd() * 0.5)
    const length = 1.1 + rnd() * 1.1
    const droop = 0.25 + rnd() * 0.5
    const points = []
    const widths = []
    for (let i = 0; i <= 6; i++) {
      const t = i / 6
      const r = t * length
      points.push({
        x: lean * stipeHeight + Math.sin(fan) * r * (0.4 + droop * t),
        y: stipeHeight + Math.cos(fan * 0.6) * r * (1 - droop * t * t * Math.abs(fan)),
        z: (rnd() - 0.5) * 0.02 + fan * 0.06 * r,
      })
      widths.push(0.055 * Math.sin(Math.PI * clamp(t * 0.9 + 0.08, 0, 1)) + 0.008)
    }
    acc.strip(points, widths, STRAP_GOLD, STRAP_TIP, rnd() * 6.28)
  }
  return acc.build()
}

/* ------------------------------------------------------------------ */
/* Fucus vésiculeux                                                    */
/* ------------------------------------------------------------------ */

const FUCUS_BASE = [0.15, 0.16, 0.06]
const FUCUS_OLIVE = [0.30, 0.32, 0.11]
const FUCUS_LIGHT = [0.42, 0.44, 0.16]
const VESICLE = [0.58, 0.50, 0.13]

function buildFucusGeometry(seed) {
  const rnd = seededRandom(seed)
  const acc = createAccumulator()

  // Ramification en fourche : chaque branche se dédouble 1 à 2 fois — la
  // signature du fucus, avec les flotteurs posés par paires sur les rubans.
  const grow = (from, dir, length, width, depth, phase) => {
    const points = []
    const widths = []
    const segments = 4
    let p = { ...from }
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      points.push({ ...p })
      widths.push(width * (1 - t * 0.25))
      p = {
        x: p.x + dir.x * (length / segments),
        y: p.y + dir.y * (length / segments),
        z: p.z + dir.z * (length / segments),
      }
    }
    acc.strip(points, widths, depth === 0 ? FUCUS_BASE : FUCUS_OLIVE,
      depth >= 1 ? FUCUS_LIGHT : FUCUS_OLIVE, phase, 0.35)

    // Flotteurs : par paires vers le haut des rubans (comme la référence).
    if (depth >= 1 && rnd() < 0.85) {
      const tip = points[segments]
      acc.blob({ x: tip.x - width * 1.2, y: tip.y - length * 0.18, z: tip.z },
        width * 1.15, VESICLE, phase, 0.28)
      acc.blob({ x: tip.x + width * 1.2, y: tip.y - length * 0.05, z: tip.z },
        width * 1.05, VESICLE, phase, 0.3)
    }

    if (depth < 2) {
      const spread = 0.45 + rnd() * 0.3
      for (const side of [-1, 1]) {
        if (depth > 0 && rnd() < 0.2) continue // fourche parfois avortée
        const a = Math.atan2(dir.x, dir.y) + side * spread * (0.5 + rnd() * 0.5)
        grow(points[segments],
          { x: Math.sin(a), y: Math.cos(a), z: dir.z + (rnd() - 0.5) * 0.25 },
          length * (0.75 + rnd() * 0.2), width * 0.85, depth + 1, phase + rnd())
      }
    }
  }

  const stems = 2 + Math.floor(rnd() * 2)
  for (let s = 0; s < stems; s++) {
    const a = (s / stems) * Math.PI * 2 + rnd()
    grow({ x: Math.cos(a) * 0.04, y: 0, z: Math.sin(a) * 0.04 },
      { x: Math.cos(a) * 0.35, y: 1, z: Math.sin(a) * 0.35 },
      0.28 + rnd() * 0.12, 0.05, 0, rnd() * 6.28)
  }
  return acc.build()
}

/* ------------------------------------------------------------------ */
/* Zostère marine                                                      */
/* ------------------------------------------------------------------ */

const ZOSTERA_BASE = [0.08, 0.24, 0.08]
const ZOSTERA_GREEN = [0.20, 0.46, 0.14]
const ZOSTERA_BROWN = [0.42, 0.36, 0.16]

function buildZosteraGeometry(seed) {
  const rnd = seededRandom(seed)
  const acc = createAccumulator()

  const blades = 6 + Math.floor(rnd() * 4)
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2
    const leanX = Math.cos(a) * (0.15 + rnd() * 0.4)
    const leanZ = Math.sin(a) * (0.15 + rnd() * 0.4)
    const height = 0.5 + rnd() * 0.55
    const points = []
    const widths = []
    for (let i = 0; i <= 5; i++) {
      const t = i / 5
      points.push({
        x: leanX * t * t * height,
        y: t * height,
        z: leanZ * t * t * height + b * 0.004,
      })
      widths.push(lerp(0.011, 0.006, t))
    }
    // certaines pointes brunissent, comme sur la référence
    const tip = rnd() < 0.4 ? ZOSTERA_BROWN : ZOSTERA_GREEN
    acc.strip(points, widths, ZOSTERA_BASE, tip, rnd() * 6.28, 1.3)
  }
  return acc.build()
}

/* ------------------------------------------------------------------ */

export class Flora {
  constructor({ laminariaCount = 1250, fucusCount = 680, zosteraCount = 1850 } = {}) {
    this.group = new THREE.Group()
    this._time = { value: 0 }
    this._species = { laminaria: [], fucus: [], zostera: [] }
    const rnd = seededRandom(20260918)
    const dummy = new THREE.Object3D()

    const plant = (kind, builderSeeds, builder, total, place, scaleRange) => {
      const perVariant = Math.ceil(total / builderSeeds.length)
      for (const seed of builderSeeds) {
        const material = new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
        })
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uTime = this._time
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
              uniform float uTime;
              attribute float aSway;
              attribute float aH;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              float swell = aH * (0.55 + 0.45 * sin(uTime * 0.23 + aSway * 0.7));
              transformed.x += sin(uTime * 0.85 + aSway) * swell * 0.34;
              transformed.z += cos(uTime * 0.63 + aSway * 1.31) * swell * 0.26;
              transformed.z += aH * 0.22;`)
        }
        const mesh = new THREE.InstancedMesh(builder(seed), material, perVariant)
        const vigors = []
        const shades = []
        for (let i = 0; i < perVariant; i++) {
          const p = place()
          const scale = (scaleRange[0] + rnd() * (scaleRange[1] - scaleRange[0]))
            * (p.scaleMul ?? 1)
          dummy.position.set(p.x, FLOOR_Y + floorHeight(p.x, p.z) - 0.04, p.z)
          dummy.scale.setScalar(scale)
          dummy.rotation.y = rnd() * Math.PI * 2
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
          vigors.push(rnd())
          // ombrage de plan : le premier plan est plus sombre (contre-jour),
          // l'arrière-plan légèrement éteint — la profondeur se lit en valeurs
          shades.push(p.shade ?? 1)
        }
        mesh.instanceMatrix.needsUpdate = true
        const colors = new Float32Array(perVariant * 3)
        mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
        this._species[kind].push({ mesh, colors, vigors, shades, baseCount: perVariant })
        this.group.add(mesh)
      }
    }

    // Laminaires : deux plans de profondeur.
    // (Le PREMIER PLAN — grandes lames sombres montant du bas du cadre — a
    // été retiré à la demande de Romain : il masquait la bande de sable et
    // sa faune. Le tirage se redistribue sur les plans restants.)
    // - forêts sur les arêtes (52 %) et pieds épars (15 %) — le plan moyen ;
    // - ARRIÈRE-PLAN (33 %) : masses en silhouette dans le voile, au large.
    plant('laminaria', [7, 31, 73], buildLaminariaGeometry, laminariaCount, () => {
      const roll = rnd()
      const angle = rnd() * Math.PI * 2
      if (roll < 0.33) {
        const radius = 95 + Math.sqrt(rnd()) * 65
        return {
          x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
          scaleMul: 1.6 + rnd() * 0.8, shade: 0.9,
        }
      }
      if (roll < 0.85) {
        const ridge = RIDGES[Math.floor(rnd() * RIDGES.length)]
        const radius = Math.sqrt(rnd()) * 32
        return { x: ridge.x + Math.cos(angle) * radius, z: ridge.z + Math.sin(angle) * radius }
      }
      const radius = 40 + Math.sqrt(rnd()) * 260
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
    }, [1.5, 3.2])

    // Fucus : serré CONTRE les blocs — la touffe de l'estran sur substrat dur.
    plant('fucus', [13, 41, 97], buildFucusGeometry, fucusCount, () => {
      const ridge = RIDGES[Math.floor(rnd() * RIDGES.length)]
      const radius = Math.sqrt(rnd()) * 16
      const angle = rnd() * Math.PI * 2
      return { x: ridge.x + Math.cos(angle) * radius, z: ridge.z + Math.sin(angle) * radius }
    }, [1.2, 2.4])

    // Zostère : herbiers en nappes sur les plaines de sable, loin des roches.
    // Nappes élargies (+35 %) et un liseré d'arrière-plan au large.
    plant('zostera', [19, 53, 101], buildZosteraGeometry, zosteraCount, () => {
      const angle = rnd() * Math.PI * 2
      if (rnd() < 0.15) {
        const radius = 100 + Math.sqrt(rnd()) * 55
        return {
          x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
          scaleMul: 1.4 + rnd() * 0.6, shade: 0.9,
        }
      }
      const m = MEADOWS[Math.floor(rnd() * MEADOWS.length)]
      // double tirage : les nappes ont un cœur dense et des bords diffus
      const radius = Math.sqrt(rnd() * rnd()) * m.radius * 1.35
      return { x: m.x + Math.cos(angle) * radius, z: m.z + Math.sin(angle) * radius }
    }, [1.3, 2.6])
  }

  applyEcosystem(state) {
    const { biodiversity, turbidity, sediment, clarity } = state

    // Laminaire : eaux claires — jaunit (turbidité) puis disparaît (biodiversité).
    const lamAlive = clamp(biodiversity * 1.2, 0, 1)
    const lamStress = clamp(0.65 * (1 - lamAlive) + 0.5 * turbidity, 0, 1)
    this._tint('laminaria', lamAlive * 1.15, lamStress, (s) => [
      lerp(1.0, 0.55, s * s), lerp(1.0, 0.42, s * s), lerp(1.0, 0.22, s),
    ])

    // Fucus : la coriace — brunit avec le sédiment mais résiste plus longtemps.
    const fucusAlive = clamp(biodiversity * 1.45 + 0.08, 0, 1)
    const fucusStress = clamp(0.5 * (1 - fucusAlive) + 0.6 * sediment, 0, 1)
    this._tint('fucus', fucusAlive, fucusStress, (s) => [
      lerp(1.0, 0.62, s), lerp(1.0, 0.48, s), lerp(1.0, 0.30, s),
    ])

    // Zostère : la sentinelle — l'herbier recule dès que la lumière manque.
    const meadow = clamp(clarity * 1.25 - 0.12, 0, 1) * clamp(biodiversity * 1.35, 0, 1)
    const zosteraStress = clamp(1 - meadow, 0, 1)
    this._tint('zostera', meadow, zosteraStress, (s) => [
      lerp(1.0, 0.72, s), lerp(1.0, 0.55, s * s), lerp(1.0, 0.30, s),
    ])
  }

  _tint(kind, aliveRatio, stress, tintOf) {
    for (const { mesh, colors, vigors, shades, baseCount } of this._species[kind]) {
      mesh.count = Math.round(baseCount * clamp(aliveRatio, 0.03, 1))
      for (let i = 0; i < baseCount; i++) {
        const s = clamp(stress * (0.7 + 0.6 * vigors[i]), 0, 1)
        const t = tintOf(s)
        const shade = shades[i]
        colors[i * 3] = t[0] * shade
        colors[i * 3 + 1] = t[1] * shade
        colors[i * 3 + 2] = t[2] * shade
      }
      mesh.instanceColor.needsUpdate = true
    }
  }

  update(elapsed) {
    this._time.value = elapsed
  }

  dispose() {
    for (const kind of Object.values(this._species)) {
      for (const { mesh } of kind) {
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
    }
  }
}
