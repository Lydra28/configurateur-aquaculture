import * as THREE from 'three'
import { clamp, lerp } from '../core/math.js'
import { FLOOR_Y, floorHeight } from './Underwater.js'
import { ROCK_RIDGES } from './Rocks.js'

/**
 * Vie fixe du fond — dernier volet de la famille environnement.
 *
 * Trois espèces d'après références :
 * - **Étoile de mer** (Asterias rubens, réf « étoile de mer ») : étoile à
 *   5 bras orange, posée à plat, bras légèrement asymétriques.
 * - **Oursin violet** (Paracentrotus lividus, réf « oursin » v2) : dôme
 *   pourpre sombre hérissé de piquants, en petits groupes au pied des blocs.
 * - **Crabe vert** (Carcinus maenas, réfs « crabe 1 & 2 ») : carapace
 *   pentagonale aplatie, pattes anguleuses, posé près des galets.
 *
 * Tout est statique et instancié (3 InstancedMesh, ~130 instances, Lambert :
 * lumière et brouillard de scène automatiques). Échelle légèrement majorée
 * (~×2 nature) : à la distance du décor, ce sont des accents de vivant posés
 * sur le fond, pas des héros. Module autonome : n'importe rien d'autre que
 * les constantes partagées (relief du fond, arêtes rocheuses).
 */

function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Étoile à 5 bras : disque central + bras coniques aplatis, ~52 sommets. */
function buildStarfishGeometry(seed) {
  const rnd = seededRandom(seed)
  const positions = []
  const colors = []
  const indices = []
  const CORE = [0.95, 0.50, 0.22]
  const ARM = [1.00, 0.62, 0.28]
  const TIP = [1.00, 0.78, 0.45]

  // centre bombé
  positions.push(0, 0.05, 0)
  colors.push(...CORE)
  const ring = []
  for (let a = 0; a < 10; a++) {
    const angle = (a / 10) * Math.PI * 2
    const r = 0.16
    positions.push(Math.cos(angle) * r, 0.02, Math.sin(angle) * r)
    colors.push(...CORE)
    ring.push(a + 1)
  }
  for (let a = 0; a < 10; a++) {
    indices.push(0, ring[a], ring[(a + 1) % 10])
  }
  // 5 bras : chaque bras part de deux points du ring vers une pointe
  for (let b = 0; b < 5; b++) {
    const angle = (b / 5) * Math.PI * 2 + rnd() * 0.25
    const len = 0.42 + rnd() * 0.18
    const tipIndex = positions.length / 3
    positions.push(
      Math.cos(angle) * len,
      0.012 + rnd() * 0.02,
      Math.sin(angle) * len,
    )
    colors.push(...TIP)
    const midIndex = positions.length / 3
    positions.push(Math.cos(angle) * len * 0.5, 0.045, Math.sin(angle) * len * 0.5)
    colors.push(...ARM)
    const a0 = ring[(b * 2) % 10]
    const a1 = ring[(b * 2 + 1) % 10]
    indices.push(a0, tipIndex, midIndex, a1, midIndex, tipIndex, a0, midIndex, a1)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Oursin : dôme icosaédrique pourpre + couronne de piquants triangulaires. */
function buildUrchinGeometry(seed) {
  const rnd = seededRandom(seed)
  const dome = new THREE.IcosahedronGeometry(0.2, 1)
  dome.scale(1, 0.8, 1)
  const positions = Array.from(dome.attributes.position.array)
  const colors = []
  const BODY = [0.17, 0.07, 0.15]
  for (let i = 0; i < positions.length / 3; i++) colors.push(...BODY)
  // PolyhedronGeometry est non-indexée dans les three récents : dans ce cas
  // les sommets sont déjà dépliés triangle par triangle — index séquentiel.
  const indices = dome.index
    ? Array.from(dome.index.array)
    : Array.from({ length: positions.length / 3 }, (_, i) => i)
  dome.dispose()

  const SPINE = [0.36, 0.16, 0.30]
  const spineCount = 22
  for (let s = 0; s < spineCount; s++) {
    // direction sur l'hémisphère supérieur (et un peu latérale)
    const u = rnd()
    const phi = rnd() * Math.PI * 2
    const dy = 0.15 + u * 0.85
    const rxz = Math.sqrt(Math.max(0, 1 - dy * dy))
    const dir = { x: Math.cos(phi) * rxz, y: dy, z: Math.sin(phi) * rxz }
    const baseR = 0.19
    const len = 0.16 + rnd() * 0.10
    const base = positions.length / 3
    // piquant = triangle fin dressé le long de dir (lisible en silhouette)
    const side = 0.014
    const sx = -dir.z, sz = dir.x // vecteur latéral
    positions.push(
      dir.x * baseR - sx * side, dir.y * baseR * 0.8, dir.z * baseR - sz * side,
      dir.x * baseR + sx * side, dir.y * baseR * 0.8, dir.z * baseR + sz * side,
      dir.x * (baseR + len), dir.y * (baseR + len) * 0.8, dir.z * (baseR + len),
    )
    colors.push(...BODY, ...BODY, ...SPINE)
    indices.push(base, base + 1, base + 2)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Crabe : carapace pentagonale aplatie + 4 paires de pattes anguleuses. */
function buildCrabGeometry(seed) {
  const rnd = seededRandom(seed)
  const positions = []
  const colors = []
  const indices = []
  const SHELL = [0.24, 0.27, 0.13]
  const SHELL_DARK = [0.16, 0.18, 0.09]
  const LEG = [0.28, 0.26, 0.12]

  // carapace : éventail pentagonal bombé (plus large devant, réf « crabe 2 »)
  positions.push(0, 0.10, 0)
  colors.push(...SHELL)
  const rim = []
  const shape = [
    [0.28, 0.02, 0.16], [0.20, 0.02, -0.20], [0, 0.02, -0.26],
    [-0.20, 0.02, -0.20], [-0.28, 0.02, 0.16], [0, 0.02, 0.24],
  ]
  for (const [x, y, z] of shape) {
    rim.push(positions.length / 3)
    positions.push(x, y, z)
    colors.push(...SHELL_DARK)
  }
  for (let i = 0; i < rim.length; i++) {
    indices.push(0, rim[i], rim[(i + 1) % rim.length])
  }
  // pattes : 4 paires de quads coudés vers le sol
  for (const side of [-1, 1]) {
    for (let l = 0; l < 4; l++) {
      const ax = side * 0.24
      const az = -0.14 + l * 0.10
      const kx = side * (0.42 + rnd() * 0.06)
      const kz = az + (rnd() - 0.5) * 0.06
      const base = positions.length / 3
      positions.push(
        ax, 0.05, az - 0.015, ax, 0.05, az + 0.015,
        kx, 0.0, kz + 0.015, kx, 0.0, kz - 0.015,
      )
      colors.push(...LEG, ...LEG, ...LEG, ...LEG)
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export class FixedLife {
  constructor({ starfishCount = 85, urchinCount = 90, crabCount = 40 } = {}) {
    this.group = new THREE.Group()
    const rnd = seededRandom(20260920)
    const dummy = new THREE.Object3D()
    this._pops = []

    const scatter = (nearRidgeRatio, ridgeRadius, farRange) => {
      const angle = rnd() * Math.PI * 2
      // Un tiers sur l'anneau PROCHE (36-58 m) : la bande de fond la plus
      // grande à l'écran — c'est là que la vie fixe devient distinguable.
      if (rnd() < 0.34) {
        const radius = 36 + rnd() * 22
        return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
      }
      if (rnd() < nearRidgeRatio) {
        const ridge = ROCK_RIDGES[Math.floor(rnd() * ROCK_RIDGES.length)]
        const radius = 3 + Math.sqrt(rnd()) * ridgeRadius
        return { x: ridge.x + Math.cos(angle) * radius, z: ridge.z + Math.sin(angle) * radius }
      }
      const radius = 30 + Math.sqrt(rnd()) * farRange
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
    }

    const populate = (builder, seed, count, scaleRange, nearRidgeRatio, ridgeRadius, emissive = 0x000000, emissiveIntensity = 0.55) => {
      // Une pointe d'émissif pour l'étoile de mer : à cette profondeur
      // l'absorption tue le rouge, un orange purement diffus devient gris —
      // c'est le petit mensonge qui rend l'espèce identifiable de loin.
      const material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        emissive,
        emissiveIntensity,
      })
      const mesh = new THREE.InstancedMesh(builder(seed), material, count)
      const scales = []
      for (let i = 0; i < count; i++) {
        const p = scatter(nearRidgeRatio, ridgeRadius, 220)
        const scale = scaleRange[0] + rnd() * (scaleRange[1] - scaleRange[0])
        scales.push({ scale, rotY: rnd() * Math.PI * 2 })
        dummy.position.set(p.x, FLOOR_Y + floorHeight(p.x, p.z) + 0.02, p.z)
        dummy.scale.setScalar(scale)
        dummy.rotation.set(0, scales[i].rotY, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      const colors = new Float32Array(count * 3).fill(1)
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
      this._pops.push({ mesh, colors, baseCount: count, scales, seeds: Array.from({ length: count }, rnd) })
      this.group.add(mesh)
    }

    // Étoiles : partout, un peu plus près des arêtes. Oursins : au pied des
    // blocs (substrat dur). Crabes : autour des nappes de galets/arêtes.
    // Échelles majorées (~×1.8) : lisibles à la distance du décor — des
    // accents qu'on DISTINGUE, assumés plus grands que nature.
    // Émissif renforcé pour l'étoile : la bande de sable visible est à
    // 55-100 m, le brouillard y éteint un orange purement diffus.
    populate(buildStarfishGeometry, 3, starfishCount, [1.6, 2.6], 0.5, 26, 0x5c2007, 0.9)
    populate(buildUrchinGeometry, 17, urchinCount, [1.5, 2.5], 0.85, 18, 0x14040f)
    populate(buildCrabGeometry, 29, crabCount, [1.5, 2.3], 0.7, 24)
  }

  /**
   * PRÉSENCE GARANTIE : replace un contingent de chaque espèce dans le champ
   * une fois le cap caméra connu (appel unique au démarrage, depuis main.js).
   * Étoiles/oursins/crabes sont statiques : on réécrit simplement leurs
   * matrices sur la bande de sable visible (36-58 m), répartis en largeur.
   */
  alignToView(viewHeading, camera = null) {
    const dummy = new THREE.Object3D()
    const guaranteed = [12, 12, 8] // étoiles, oursins, crabes

    // Le placement fiable se fait en ESPACE ÉCRAN : on vise un point du cadre
    // (dans la bande de sable lisible) et on lance un rayon caméra → relief du
    // fond. Quel que soit le relief (±13 m), le point d'impact est visible par
    // construction — c'est la seule garantie qui tienne pour du benthique,
    // qu'on ne peut pas remonter en pleine eau comme les poissons.
    const floorHit = (ndcX, ndcY) => {
      const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
      const dir = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(origin).normalize()
      if (dir.y >= -0.02) return null // rayon quasi horizontal : jamais de sol
      let t = 5
      for (; t < 260; t += 2) {
        const y = origin.y + dir.y * t
        const x = origin.x + dir.x * t
        const z = origin.z + dir.z * t
        if (y <= FLOOR_Y + floorHeight(x, z)) break
      }
      if (t >= 260) return null
      // raffinement par bissection (le pas de 2 m suffit ensuite largement)
      let lo = t - 2, hi = t
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) / 2
        const y = origin.y + dir.y * mid
        const x = origin.x + dir.x * mid
        const z = origin.z + dir.z * mid
        if (y <= FLOOR_Y + floorHeight(x, z)) hi = mid
        else lo = mid
      }
      return {
        x: origin.x + dir.x * hi,
        z: origin.z + dir.z * hi,
        dist: hi,
      }
    }

    if (camera) camera.updateMatrixWorld(true)
    this._pops.forEach((pop, p) => {
      const n = Math.min(guaranteed[p] ?? 0, pop.baseCount)
      for (let i = 0; i < n; i++) {
        // cible écran : répartie en largeur, hauteur variée dans la bande de
        // sable (au-dessus du bord bas, sous le milieu du cadre)
        // ±0,92 : toute la largeur du cadre, flancs compris — pas seulement
        // le tiers central (retour de Romain : zones latérales vides)
        const ndcX = ((i + 0.5) / n - 0.5) * 1.84 + (pop.seeds[i] - 0.5) * 0.14
        const ndcY = -0.82 + pop.seeds[(i + 7) % pop.baseCount] * 0.38
        const hit = camera ? floorHit(ndcX, ndcY) : null
        if (!hit) continue // pas de sol sur ce rayon : on laisse l'instance où elle est
        const { scale, rotY } = pop.scales[i]
        // La bande visible est LOIN (55-100 m) : les garantis prennent un
        // facteur d'échelle proportionné à la distance pour rester lisibles —
        // même parti pris « plus grands que nature » que le reste du module.
        const boost = 1.4 + hit.dist / 55
        dummy.position.set(hit.x, FLOOR_Y + floorHeight(hit.x, hit.z) + 0.02, hit.z)
        dummy.scale.setScalar(scale * boost)
        dummy.rotation.set(0, rotY, 0)
        dummy.updateMatrix()
        pop.mesh.setMatrixAt(i, dummy.matrix)
      }
      pop.mesh.instanceMatrix.needsUpdate = true
    })
  }

  /** Même contrat que le reste de la famille (inactif tant que milieu sain). */
  applyEcosystem(state) {
    const { biodiversity, sediment } = state
    const alive = clamp(biodiversity * 1.3, 0, 1)
    const dust = clamp(sediment * 0.8, 0, 1)
    for (const pop of this._pops) {
      pop.mesh.count = Math.round(pop.baseCount * clamp(alive, 0.02, 1))
      for (let i = 0; i < pop.baseCount; i++) {
        pop.colors[i * 3] = lerp(1, 0.42, dust)
        pop.colors[i * 3 + 1] = lerp(1, 0.40, dust)
        pop.colors[i * 3 + 2] = lerp(1, 0.34, dust)
      }
      pop.mesh.instanceColor.needsUpdate = true
    }
  }

  dispose() {
    for (const { mesh } of this._pops) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  }
}
