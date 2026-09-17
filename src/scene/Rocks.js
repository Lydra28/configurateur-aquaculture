import * as THREE from 'three'
import { fbm2D } from '../core/valueNoise.js'
import { clamp, lerp } from '../core/math.js'
import { FLOOR_Y, floorHeight } from './Underwater.js'

/**
 * Minéral — asset pilote de la famille (référence : « granite marin.webp »).
 *
 * Deux populations, reconstruites en code d'après la photo :
 * - des BLOCS granitiques anguleux, stratifiés et fracturés, alignés en arêtes
 *   comme sur la référence (chaînons de 3-5 blocs) plus quelques solitaires ;
 * - un champ de GALETS ovoïdes lisses (référence « galets.jpg » : palette
 *   beige/gris/crème, quelques sombres).
 *
 * Ce que raconte l'asset (applyEcosystem) : en milieu sain, le dessus des
 * blocs porte un biofilm olive et des encroûtements roses (coralline) ; quand
 * le sédiment monte, la vase recouvre tout d'un voile uniforme et la coralline
 * blanchit — la roche « meurt » visuellement sans bouger d'un centimètre.
 *
 * Budget : 4 géométries de bloc partagées (fracture par déplacement de bruit,
 * flat shading) × ~18 instances + 1 géométrie de galet × ~320 instances.
 * Matériaux Lambert : brouillard de scène et lumières globales s'appliquent
 * tout seuls — aucune plomberie shader.
 */

/**
 * Les arêtes rocheuses : positions PARTAGÉES avec la flore (les laminaires et
 * fucus poussent sur substrat dur — Flora.js importe cette constante).
 * Réparties en couronne autour du point de vue : quel que soit le cap de la
 * caméra (asservi au soleil), 2-3 arêtes restent dans le champ.
 */
export const ROCK_RIDGES = [
  { x: 60, z: 0, angle: 0.4, count: 5, gap: 7.5 },
  { x: 18, z: 57, angle: -0.25, count: 4, gap: 8.5 },
  { x: -79, z: 57, angle: 0.9, count: 4, gap: 7 },
  { x: -63, z: -46, angle: 2.1, count: 5, gap: 8 },
  { x: 24, z: -74, angle: -1.2, count: 4, gap: 7.5 },
]

/** LCG déterministe : mêmes roches à chaque chargement, mêmes captures. */
function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Un bloc granitique : boîte subdivisée, sommets déplacés par bruit —
 * arêtes cassées, faces bombées, silhouette de dalle fracturée. Le flat
 * shading fait le reste : chaque facette attrape la lumière différemment.
 */
function buildBlockGeometry(seed) {
  const rnd = seededRandom(seed)
  const geometry = new THREE.BoxGeometry(1, 1, 1, 4, 3, 4)
  const pos = geometry.attributes.position
  const ox = rnd() * 100, oz = rnd() * 100
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    // Déplacement plus fort sur les arêtes hautes : le sommet s'érode, la
    // base reste assise — une dalle, pas une patate.
    const n = fbm2D(ox + x * 2.1 + y * 0.8, oz + z * 2.1 - y * 0.6, 3)
    const wear = 0.06 + 0.16 * (y * 0.5 + 0.5)
    pos.setXYZ(
      i,
      x + n * wear * Math.sign(x || 1) * 0.9,
      y + fbm2D(ox + x * 3.3, oz + z * 3.3, 2) * 0.08,
      z + n * wear * Math.sign(z || 1) * 0.9,
    )
  }
  geometry.computeVertexNormals()
  // La strate : légère compression verticale, comme les dalles de la référence.
  geometry.scale(1, 0.72, 1)
  return geometry.toNonIndexed() // flat shading net, facette par facette
}

/** Un galet : icosaèdre lissé puis aplati — l'ovoïde de plage classique. */
function buildPebbleGeometry() {
  const geometry = new THREE.IcosahedronGeometry(0.5, 2)
  geometry.scale(1, 0.55, 1.25)
  return geometry
}

export class Rocks {
  constructor({ blockCount = 150, pebbleCount = 650 } = {}) {
    this.group = new THREE.Group()
    const rnd = seededRandom(20260917)

    // --- Blocs : 4 variantes de géométrie, instanciées ------------------
    const variants = [11, 23, 47, 89].map((s) => buildBlockGeometry(s))
    const perVariant = Math.ceil(blockCount / variants.length)
    this._blocks = []
    this._blockSeeds = []

    // Implantation en ARÊTES comme la référence : chaînons + solitaires.
    const placements = []
    const ridges = ROCK_RIDGES
    for (const r of ridges) {
      for (let i = 0; i < r.count; i++) {
        placements.push({
          x: r.x + Math.cos(r.angle) * r.gap * i + (rnd() - 0.5) * 2.5,
          z: r.z + Math.sin(r.angle) * r.gap * i + (rnd() - 0.5) * 2.5,
          scale: 3.2 + rnd() * 3.4,
          ridge: true,
        })
      }
    }
    // PREMIER PLAN : quelques sommets de blocs proches, dont la crête monte
    // du bas du cadre, assombris (contre-jour).
    for (let i = 0; i < 6; i++) {
      const angle = rnd() * Math.PI * 2
      const radius = 16 + rnd() * 9
      placements.push({
        x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
        scale: 6.5 + rnd() * 3.0, shade: 0.55,
      })
    }
    // Blocs XXL du plan moyen : les « pierres plus grosses » demandées.
    for (let i = 0; i < 8; i++) {
      const angle = rnd() * Math.PI * 2
      const radius = 45 + Math.sqrt(rnd()) * 45
      placements.push({
        x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
        scale: 6.0 + rnd() * 3.5,
      })
    }
    // ARRIÈRE-PLAN : gros blocs en silhouette dans le voile.
    for (let i = 0; i < 14; i++) {
      const angle = rnd() * Math.PI * 2
      const radius = 105 + Math.sqrt(rnd()) * 55
      placements.push({
        x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
        scale: 5.5 + rnd() * 4.0, shade: 0.9,
      })
    }
    while (placements.length < blockCount) {
      const radius = 40 + Math.sqrt(rnd()) * 260
      const angle = rnd() * Math.PI * 2
      placements.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        scale: 1.6 + rnd() * 3.6,
        ridge: false,
      })
    }

    const dummy = new THREE.Object3D()
    variants.forEach((geometry, v) => {
      // flatShading : chaque facette attrape la lumière — sans lui, la dalle
      // fracturée redevient une masse lisse et sombre.
      const material = new THREE.MeshLambertMaterial({ flatShading: true })
      const mesh = new THREE.InstancedMesh(geometry, material, perVariant)
      const seeds = []
      for (let i = 0; i < perVariant; i++) {
        const p = placements[v * perVariant + i]
        if (!p) { mesh.count = i; break }
        const y = FLOOR_Y + floorHeight(p.x, p.z) - 0.25 * p.scale // assise enterrée
        dummy.position.set(p.x, y + p.scale * 0.36, p.z)
        dummy.scale.set(
          p.scale * (0.85 + rnd() * 0.5),
          p.scale * (0.55 + rnd() * 0.35),
          p.scale * (0.8 + rnd() * 0.5),
        )
        dummy.rotation.set((rnd() - 0.5) * 0.12, rnd() * Math.PI, (rnd() - 0.5) * 0.12)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        seeds.push({ r1: rnd(), r2: rnd(), shade: p.shade ?? 1 })
      }
      mesh.instanceMatrix.needsUpdate = true
      const colors = new Float32Array(perVariant * 3)
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
      this._blocks.push({ mesh, colors, seeds })
      this.group.add(mesh)
    })

    // --- Galets : un semis près des arêtes et en nappes -----------------
    const pebbleGeometry = buildPebbleGeometry()
    const pebbleMaterial = new THREE.MeshLambertMaterial({})
    this.pebbles = new THREE.InstancedMesh(pebbleGeometry, pebbleMaterial, pebbleCount)
    this._pebbleColors = new Float32Array(pebbleCount * 3)
    this._pebbleSeeds = []
    for (let i = 0; i < pebbleCount; i++) {
      // 60 % en nappes autour des arêtes (les blocs s'éboulent), 40 % épars.
      let x, z
      if (rnd() < 0.6) {
        const r = ridges[Math.floor(rnd() * ridges.length)]
        x = r.x + (rnd() - 0.5) * 46
        z = r.z + (rnd() - 0.5) * 46
      } else {
        const radius = 30 + Math.sqrt(rnd()) * 280
        const angle = rnd() * Math.PI * 2
        x = Math.cos(angle) * radius
        z = Math.sin(angle) * radius
      }
      const s = 0.35 + rnd() * 0.85
      dummy.position.set(x, FLOOR_Y + floorHeight(x, z) + s * 0.18, z)
      dummy.scale.setScalar(s)
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0)
      dummy.updateMatrix()
      this.pebbles.setMatrixAt(i, dummy.matrix)
      this._pebbleSeeds.push(rnd())
    }
    this.pebbles.instanceMatrix.needsUpdate = true
    this.pebbles.instanceColor = new THREE.InstancedBufferAttribute(this._pebbleColors, 3)
    this.pebbles.instanceColor.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.pebbles)
  }

  applyEcosystem(state) {
    const { sediment, biodiversity } = state
    const dust = clamp(sediment * 0.85, 0, 1)

    for (const { mesh, colors, seeds } of this._blocks) {
      for (let i = 0; i < mesh.count; i++) {
        const { r1, r2, shade } = seeds[i]
        // Pierre nue granitique : beige-gris CLAIR — à 25-50 m la lumière
        // résiduelle est bleue, une palette trop basse rend la roche noire.
        const stone = [0.60 + r1 * 0.12, 0.57 + r1 * 0.10, 0.50 + r1 * 0.08]
        // Vie encroûtante : biofilm olive dominant, coralline rosée sur ~1/4
        // des blocs — les teintes de la référence. Elle suit la biodiversité.
        const life = clamp(biodiversity * (0.5 + 0.7 * r2), 0, 1)
        const olive = r2 > 0.25
        const lifeTint = olive ? [0.52, 0.56, 0.28] : [0.68, 0.48, 0.46]
        let c = [
          lerp(stone[0], lifeTint[0], life * 0.75),
          lerp(stone[1], lifeTint[1], life * 0.75),
          lerp(stone[2], lifeTint[2], life * 0.75),
        ]
        // Le voile de vase recouvre tout, uniformément — même signature que le
        // sol. L'ombrage de plan (premier plan sombre, lointain éteint) reste.
        colors[i * 3] = lerp(c[0], 0.30, dust) * shade
        colors[i * 3 + 1] = lerp(c[1], 0.28, dust) * shade
        colors[i * 3 + 2] = lerp(c[2], 0.24, dust) * shade
      }
      mesh.instanceColor.needsUpdate = true
    }

    for (let i = 0; i < this._pebbleSeeds.length; i++) {
      const r = this._pebbleSeeds[i]
      // Palette galets : crème → gris, ~8 % de sombres (basalte).
      const dark = r > 0.92
      const base = dark
        ? [0.22, 0.22, 0.24]
        : [0.74 - r * 0.18, 0.70 - r * 0.16, 0.60 - r * 0.12]
      this._pebbleColors[i * 3] = lerp(base[0], 0.30, dust)
      this._pebbleColors[i * 3 + 1] = lerp(base[1], 0.28, dust)
      this._pebbleColors[i * 3 + 2] = lerp(base[2], 0.24, dust)
    }
    this.pebbles.instanceColor.needsUpdate = true
  }

  dispose() {
    for (const { mesh } of this._blocks) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
    this.pebbles.geometry.dispose()
    this.pebbles.material.dispose()
  }
}
