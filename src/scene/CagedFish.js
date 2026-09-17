import * as THREE from 'three'
import { clamp, lerp } from '../core/math.js'

/**
 * Poissons d'élevage — le contenu des cages (FarmCages). Une espèce par
 * cage : saumon atlantique (réfs « saumon 1/2 »), truite arc-en-ciel
 * (réfs « truite 1/3 », décision de Romain), esturgeon (réfs « esturgeon
 * 1-3 ») — chaque espèce arrive dans sa propre passe de validation.
 *
 * Comportement : le CARROUSEL, la nage réelle des poissons en cage — tous
 * tournent lentement dans le même sens, en orbites étagées autour de l'axe
 * de la jupe, confinés dans son volume. Les orbites vivent dans les unités
 * du collage (la jupe est étirée verticalement par le compositeur) : les
 * poissons lisent le repère de leur cage via farm.getSkirtFrames().
 *
 * Même fabrique fusiforme que DemersalFish (fonction dupliquée volontaire :
 * module autonome, on ne touche pas à un module validé), même battement de
 * nage en vertex shader. Tailles stylisées assumées, cohérentes du bar.
 */

function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Fabrique fusiforme (tête +X, longueur 1) — stations [x, demi-h, demi-l].
 * Options d'espèce : tail 'heterocercal' (queue asymétrique type requin —
 * l'esturgeon) et scutes (rangée de plaques dorsales claires en dents de
 * scie — l'autre marqueur de l'esturgeon).
 */
function buildFishGeometry({ stations, back, flank, belly, fin, tail, scutes }) {
  const positions = []
  const colors = []
  const indices = []
  for (const [x, h, w] of stations) {
    positions.push(x, h, 0, x, 0, w, x, -h, 0, x, 0, -w)
    colors.push(...back, ...flank, ...belly, ...flank)
  }
  for (let s = 0; s < stations.length - 1; s++) {
    const a = s * 4
    const b = a + 4
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4
      indices.push(a + k, b + k, b + k2, a + k, b + k2, a + k2)
    }
  }
  const last = stations[stations.length - 1]
  const ped = positions.length / 3
  if (tail === 'heterocercal') {
    // lobe supérieur LONG et relevé, petit lobe bas — la queue d'esturgeon
    positions.push(last[0], 0, 0, last[0] - 0.24, 0.17, 0, last[0] - 0.10, 0.02, 0)
    positions.push(last[0], 0, 0, last[0] - 0.11, -0.07, 0, last[0] - 0.05, -0.01, 0)
    colors.push(...fin, ...fin, ...fin, ...fin, ...fin, ...fin)
    indices.push(ped, ped + 1, ped + 2, ped + 3, ped + 5, ped + 4)
  } else {
    positions.push(last[0], 0, 0, last[0] - 0.17, 0.11, 0, last[0] - 0.09, 0.02, 0)
    positions.push(last[0], 0, 0, last[0] - 0.17, -0.11, 0, last[0] - 0.09, -0.02, 0)
    colors.push(...fin, ...fin, ...fin, ...fin, ...fin, ...fin)
    indices.push(ped, ped + 1, ped + 2, ped + 3, ped + 5, ped + 4)
  }
  if (scutes) {
    // plaques dorsales : petits triangles clairs plantés le long du dos,
    // interpolés entre les stations du tronc — la ligne en dents de scie
    const SCUTE = [0.72, 0.72, 0.66]
    const s0 = 1, s1 = stations.length - 2
    for (let k = 0; k < scutes; k++) {
      const t = (k + 0.5) / scutes
      const fi = s0 + t * (s1 - s0)
      const i0 = Math.floor(fi)
      const frac = fi - i0
      const x = lerp(stations[i0][0], stations[i0 + 1][0], frac)
      const h = lerp(stations[i0][1], stations[i0 + 1][1], frac)
      const base = positions.length / 3
      positions.push(x + 0.022, h - 0.005, 0, x - 0.022, h - 0.005, 0, x, h + 0.038, 0)
      colors.push(...SCUTE, ...SCUTE, ...SCUTE)
      indices.push(base, base + 1, base + 2)
    }
  } else {
    const mid = stations[Math.floor(stations.length / 2) - 1]
    const dor = positions.length / 3
    positions.push(mid[0] + 0.18, mid[1], 0, mid[0] - 0.02, mid[1] + 0.10, 0, mid[0] - 0.22, mid[1] - 0.02, 0)
    colors.push(...fin, ...fin, ...fin)
    indices.push(dor, dor + 1, dor + 2)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

const SPECIES = {
  // Salmo salar : fusiforme allongé, dos gris-bleu SOMBRE (la silhouette
  // porte la lecture), flanc argenté, ventre clair — réfs « saumon 1/2 ».
  saumon: {
    cage: 0,
    count: 150,        // capacité max (échelle continentale, 3 cages)
    defaultCount: 62,  // effectif du décor validé (hors scénario)
    length: 1.9,
    stations: [
      [0.50, 0.022, 0.012],
      [0.32, 0.080, 0.046],
      [0.06, 0.095, 0.055],
      [-0.17, 0.078, 0.046],
      [-0.36, 0.034, 0.019],
      [-0.46, 0.013, 0.009],
    ],
    back: [0.09, 0.11, 0.14],
    flank: [0.46, 0.50, 0.55],
    belly: [0.72, 0.75, 0.78],
    fin: [0.16, 0.19, 0.23],
  },
  // Truite arc-en-ciel (décision Romain — réfs « truite 1/3 ») : corps plus
  // trapu et haut que le saumon, dos olive sombre, BANDE ROSE latérale (le
  // marqueur de l'espèce, saturée un cran au-dessus du réel : le voile de
  // distance éteint le rouge — même compromis que l'étoile de mer), ventre
  // clair. La bande vit sur les sommets de flanc de la fabrique.
  truite: {
    cage: 1,
    count: 140,
    defaultCount: 58,
    length: 1.7,
    stations: [
      [0.48, 0.026, 0.014],
      [0.30, 0.092, 0.050],
      [0.04, 0.112, 0.058],
      [-0.18, 0.088, 0.048],
      [-0.36, 0.040, 0.020],
      [-0.45, 0.015, 0.010],
    ],
    back: [0.15, 0.17, 0.11],
    flank: [0.72, 0.42, 0.47],
    belly: [0.74, 0.73, 0.68],
    fin: [0.30, 0.26, 0.20],
    // le voile éteint le rouge à 70 m : pointe d'émissif rosé (contrôlé de
    // nuit — même dose que l'étoile de mer)
    emissive: 0x3a1216,
    emissiveIntensity: 0.4,
  },
  // Esturgeon (réfs « esturgeon 1-3 ») : corps long et bas, rostre pointu,
  // rangée de scutelles dorsales claires, queue hétérocerque — la silhouette
  // la plus reconnaissable des trois. Benthique : pas de carrousel de
  // surface, une croisière LENTE dans le bas de la jupe, gros individus
  // moins nombreux.
  esturgeon: {
    cage: 2,
    count: 45,         // les gros restent moins nombreux
    defaultCount: 14,
    length: 2.7,
    stations: [
      [0.52, 0.010, 0.008],   // pointe du rostre
      [0.38, 0.030, 0.026],   // rostre
      [0.20, 0.062, 0.055],   // tête
      [0.00, 0.070, 0.060],   // tronc bas et large
      [-0.22, 0.058, 0.048],
      [-0.40, 0.030, 0.022],
      [-0.48, 0.014, 0.010],  // pédoncule
    ],
    back: [0.20, 0.22, 0.21],
    flank: [0.42, 0.45, 0.44],
    belly: [0.64, 0.65, 0.61],
    fin: [0.24, 0.27, 0.26],
    tail: 'heterocercal',
    scutes: 7,
    depthRange: [0.55, 0.92],
    speedRange: [0.05, 0.10],
  },
}

export class CagedFish {
  /** @param farm le module FarmCages — source des repères de jupes. */
  constructor(farm) {
    this.group = new THREE.Group()
    this._farm = farm
    this._time = { value: 0 }
    this._pops = []
    this._ready = false
    const rnd = seededRandom(20260923)
    this._rnd = rnd
    this._dummy = new THREE.Object3D()
    this._dummy.rotation.order = 'YZX'

    for (const key of Object.keys(SPECIES)) {
      const species = SPECIES[key]
      const material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        emissive: species.emissive ?? 0x000000,
        emissiveIntensity: species.emissiveIntensity ?? 0,
      })
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = this._time
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>
            uniform float uTime;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float tailness = clamp(0.35 - position.x, 0.0, 1.0);
            float phase = float(gl_InstanceID) * 1.91;
            transformed.z += sin(uTime * 3.8 + phase + position.x * 3.2)
                           * tailness * tailness * 0.15;`)
      }
      const mesh = new THREE.InstancedMesh(
        buildFishGeometry(species), material, species.count)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      const fish = []
      const [dMin, dMax] = species.depthRange ?? [0.10, 0.90]
      const [sMin, sMax] = species.speedRange ?? [0.14, 0.24]
      for (let i = 0; i < species.count; i++) {
        fish.push({
          // carrousel : orbite autour de l'axe de la cage, MÊME SENS pour
          // tous (le comportement d'élevage), rayons et vitesses étagés —
          // profondeurs et rythme par espèce (l'esturgeon croise au fond)
          orbitFrac: 0.30 + Math.sqrt(rnd()) * 0.52,   // fraction du rayon
          depthFrac: dMin + rnd() * (dMax - dMin),      // fraction du volume visible
          speed: sMin + rnd() * (sMax - sMin),
          phase: rnd() * 6.28,
          bob: rnd() * 6.28,
          scale: species.length * (0.85 + rnd() * 0.3),
        })
      }
      this._pops.push({ key, mesh, fish, species, baseCount: species.count })
      this.group.add(mesh)
    }
    this._visibleRatio = 1
    this._pace = 1
    this._activeSpecies = null
  }

  /**
   * Mode CONFIGURATEUR : UNE espèce peuple TOUTES les cages présentes
   * (retour Romain : Atlantic Sapphire = 3 bassins de saumons). null =
   * mode décor validé, chaque espèce garde sa cage et son effectif.
   */
  setSpecies(key) {
    this._activeSpecies = key ?? null
  }

  update(dt, elapsed) {
    this._time.value = elapsed
    const frames = this._farm.getSkirtFrames()
    if (!frames) return
    const presentFrames = frames.filter((frame) => frame && frame.present)
    for (const pop of this._pops) {
      // mode configurateur : l'espèce active peuple TOUTES les cages
      // présentes (répartition round-robin), les autres espèces s'effacent ;
      // mode décor (null) : chaque espèce sa cage, effectif d'origine
      const active = this._activeSpecies
      let visible
      if (active) {
        if (pop.key !== active || presentFrames.length === 0) { pop.mesh.count = 0; continue }
        visible = Math.round(pop.baseCount * this._visibleRatio)
      } else {
        const home = frames[pop.species.cage]
        if (!home || !home.present) { pop.mesh.count = 0; continue }
        visible = Math.round((pop.species.defaultCount ?? pop.baseCount) * this._visibleRatio)
      }
      let drawn = 0
      for (let i = 0; i < pop.fish.length && drawn < visible; i++) {
        const f = pop.fish[i]
        const frame = active ? presentFrames[i % presentFrames.length] : frames[pop.species.cage]
        const a = f.phase + elapsed * f.speed * this._pace
        const orbitR = f.orbitFrac * frame.radius * 0.92
        const x = frame.x + Math.cos(a) * orbitR
        const z = frame.z + Math.sin(a) * orbitR
        // profondeur dans le volume VISIBLE de la jupe : de la ligne d'eau
        // (lineY) au bas — le haut réel de la jupe est hors cadre (marge)
        const visibleH = frame.lineY - (frame.topY - frame.skirtH)
        const y = frame.lineY - f.depthFrac * visibleH
          + Math.sin(elapsed * 0.5 + f.bob) * 0.35
        // cap tangent au carrousel (sens unique) : direction (-sin a, cos a),
        // convention yaw = atan2(-dirZ, dirX) comme DemersalFish
        const yaw = Math.atan2(-Math.cos(a), -Math.sin(a))
        this._dummy.position.set(x, y, z)
        this._dummy.rotation.set(0, yaw, 0)
        this._dummy.scale.setScalar(f.scale)
        this._dummy.updateMatrix()
        pop.mesh.setMatrixAt(drawn, this._dummy.matrix)
        drawn++
      }
      pop.mesh.count = drawn
      pop.mesh.instanceMatrix.needsUpdate = true
    }
  }

  /** Contrat famille — le rythme de nage suit l'oxygène du milieu. */
  applyEcosystem(state) {
    const { oxygen, clarity = 1 } = state
    this._pace = lerp(0.35, 1, clamp(oxygen * 1.3, 0, 1))
    // l'émissif (bande rose de la truite) s'éteint avec la clarté : sans ça,
    // les poissons deviennent des lucioles dans une eau trouble
    for (const pop of this._pops) {
      const base = pop.species.emissiveIntensity ?? 0
      if (base > 0) pop.mesh.material.emissiveIntensity = base * clamp(clarity * 1.2, 0, 1)
    }
  }

  /**
   * Densité d'élevage (0..1) — pilotée par le scénario du configurateur
   * (composante « échelle de production »).
   */
  setDensity(ratio) {
    this._visibleRatio = clamp(ratio, 0.05, 1)
  }

  dispose() {
    for (const { mesh } of this._pops) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  }
}
