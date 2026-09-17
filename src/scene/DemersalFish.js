import * as THREE from 'three'
import { clamp, lerp } from '../core/math.js'
import { FLOOR_Y, floorHeight } from './Underwater.js'
import { ROCK_RIDGES } from './Rocks.js'

/**
 * Poissons de fond — bar européen et daurade royale (références « bar 1 » et
 * « daurade 1 » : profils entiers, silhouettes et contre-ombrage).
 *
 * Contrairement au banc pélagique (Sardines.js), ce sont des rôdeurs : des
 * individus et de petits groupes (3-5) qui patrouillent lentement à 1-4 m
 * au-dessus du fond, autour des arêtes rocheuses — leur habitat réel. Chaque
 * poisson suit un petit circuit propre (orbite locale lente + battement de
 * nage en vertex shader) : aucune trajectoire mutualisée, le fond « vit ».
 *
 * Deux géométries dérivées de la même fabrique fusiforme paramétrée :
 * - **bar** : allongé, dos gris-ardoise, flanc argenté, dorsale épineuse ;
 * - **daurade** : corps HAUT et ovale, front bombé, gris argenté chaud.
 * Module autonome : mêmes contrats que le reste (applyEcosystem, update).
 */

function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Fabrique fusiforme paramétrée (tête +X, longueur 1) : stations
 * [x, demi-hauteur, demi-largeur], couleurs dos/flanc/ventre, nageoires.
 */
function buildFishGeometry({ stations, back, flank, belly, fin, dorsalSpiny }) {
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
  positions.push(last[0], 0, 0, last[0] - 0.17, 0.11, 0, last[0] - 0.09, 0.02, 0)
  positions.push(last[0], 0, 0, last[0] - 0.17, -0.11, 0, last[0] - 0.09, -0.02, 0)
  colors.push(...fin, ...fin, ...fin, ...fin, ...fin, ...fin)
  indices.push(ped, ped + 1, ped + 2, ped + 3, ped + 5, ped + 4)

  // dorsale : épineuse (créneaux) pour le bar, arquée pour la daurade
  const mid = stations[Math.floor(stations.length / 2) - 1]
  const dor = positions.length / 3
  if (dorsalSpiny) {
    positions.push(mid[0] + 0.16, mid[1], 0, mid[0] + 0.06, mid[1] + 0.09, 0, mid[0] - 0.04, mid[1], 0)
    positions.push(mid[0] - 0.06, mid[1], 0, mid[0] - 0.14, mid[1] + 0.07, 0, mid[0] - 0.22, mid[1], 0)
    colors.push(...fin, ...fin, ...fin, ...fin, ...fin, ...fin)
    indices.push(dor, dor + 1, dor + 2, dor + 3, dor + 4, dor + 5)
  } else {
    positions.push(mid[0] + 0.18, mid[1], 0, mid[0] - 0.02, mid[1] + 0.11, 0, mid[0] - 0.24, mid[1] - 0.02, 0)
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
  bar: {
    stations: [
      [0.50, 0.020, 0.012],
      [0.30, 0.085, 0.050],
      [0.05, 0.100, 0.058],
      [-0.18, 0.075, 0.045],
      [-0.36, 0.035, 0.020],
      [-0.45, 0.014, 0.009],
    ],
    // Palette volontairement SOMBRE : sur le sable pâle et l'eau claire,
    // c'est la silhouette qui fait lire un poisson — un flanc clair se
    // camoufle (c'est d'ailleurs son rôle dans la nature).
    back: [0.08, 0.10, 0.13],
    flank: [0.30, 0.34, 0.38],
    belly: [0.55, 0.58, 0.60],
    fin: [0.22, 0.26, 0.30],
    dorsalSpiny: true,
    length: 2.2,
  },
  daurade: {
    stations: [
      [0.48, 0.030, 0.014],
      [0.30, 0.130, 0.052],   // front bombé : la hauteur monte vite
      [0.05, 0.165, 0.062],   // corps haut et ovale
      [-0.16, 0.120, 0.048],
      [-0.34, 0.050, 0.022],
      [-0.44, 0.016, 0.010],
    ],
    back: [0.12, 0.12, 0.11],
    flank: [0.36, 0.37, 0.36],
    belly: [0.58, 0.59, 0.57],
    fin: [0.26, 0.28, 0.26],
    dorsalSpiny: false,
    length: 1.8,
  },
}

export class DemersalFish {
  constructor({ barCount = 14, dauradeCount = 12 } = {}) {
    this.group = new THREE.Group()
    this._time = { value: 0 }
    const rnd = seededRandom(20260921)
    this._dummy = new THREE.Object3D()
    this._dummy.rotation.order = 'YZX'
    this._pops = []

    const makeMaterial = () => {
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
            float tailness = clamp(0.35 - position.x, 0.0, 1.0);
            float phase = float(gl_InstanceID) * 2.13;
            transformed.z += sin(uTime * 4.2 + phase + position.x * 3.5)
                           * tailness * tailness * 0.16;`)
      }
      return material
    }

    const populate = (speciesKey, count, viewSlotDefs) => {
      const species = SPECIES[speciesKey]
      const mesh = new THREE.InstancedMesh(buildFishGeometry(species), makeMaterial(), count)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      const viewSlots = [...viewSlotDefs]
      const fish = []
      // individus et petits groupes : on tire des ANCRAGES près des arêtes,
      // certains partagés (groupe), d'autres uniques (solitaire)
      let anchor = null
      let anchorLeft = 0
      for (let i = 0; i < count; i++) {
        if (anchorLeft <= 0) {
          // PRÉSENCE GARANTIE : les 2 premiers ancrages de chaque espèce sont
          // définis PAR RAPPORT AU REGARD (angle relatif au cap caméra,
          // résolu au premier update) — toujours dans le cadre, posés sur la
          // bande de sable visible. Les suivants restent aux arêtes (ambiance).
          if (viewSlots.length > 0) {
            anchor = viewSlots.shift() // { da, r } relatif au regard
          } else {
            const ridge = ROCK_RIDGES[Math.floor(rnd() * ROCK_RIDGES.length)]
            anchor = {
              x: ridge.x + (rnd() - 0.5) * 22,
              z: ridge.z + (rnd() - 0.5) * 22,
            }
          }
          anchorLeft = anchor.da !== undefined
            ? 2 + Math.floor(rnd() * 3)              // les garantis sont des groupes
            : (rnd() < 0.45 ? 1 : 3 + Math.floor(rnd() * 3))
        }
        anchorLeft--
        fish.push({
          ax: anchor.x, az: anchor.z,       // absolus (arêtes)…
          da: anchor.da, ar: anchor.r,      // …ou relatifs au regard (garantis)
          orbit: 2.5 + rnd() * 5.5,
          speed: (0.10 + rnd() * 0.10) * (rnd() > 0.5 ? 1 : -1),
          phase: rnd() * 6.28,
          // Les GARANTIS nagent à hauteur d'eau ABSOLUE : le relief du fond
          // (±13 m) rendait la hauteur relative imprévisible — dans une
          // cuvette, le poisson passait sous le bord bas du cadre.
          absY: anchor.da !== undefined ? -35 - rnd() * 8 : undefined,
          height: 2.0 + rnd() * 2.5,
          bob: rnd() * 6.28,
          scale: species.length * (0.8 + rnd() * 0.4),
        })
      }
      this._pops.push({ mesh, fish, baseCount: count })
      this.group.add(mesh)
    }

    // Emplacements garantis, répartis dans la largeur du cadre (angle relatif
    // au regard en radians, rayon en mètres — la bande de sable lisible).
    // Rayons calés sur la fenêtre du cadre : le sol n'est visible qu'au-delà
    // de ~38 m (coupé par le bord bas avant) — la bande lisible est 40-55 m.
    // Le champ HORIZONTAL est très large (~120°) : couvrir les flancs demande
    // des angles jusqu'à ±0,85 rad, pas ±0,3 (qui reste au tiers central).
    populate('bar', barCount, [
      { da: -0.75, r: 46 }, { da: -0.05, r: 41 }, { da: 0.55, r: 52 },
    ])
    populate('daurade', dauradeCount, [
      { da: -0.45, r: 50 }, { da: 0.28, r: 44 }, { da: 0.85, r: 58 },
    ])

    this._visibleRatio = 1
    this._pace = 1
    this._viewAngle = null
  }

  /** Même contrat que la famille (inactif tant que le milieu est sain). */
  applyEcosystem(state) {
    const { oxygen, biodiversity } = state
    this._pace = lerp(0.4, 1, clamp(oxygen * 1.3, 0, 1))
    this._visibleRatio = clamp(biodiversity * 1.3, 0.05, 1)
  }

  /** @param viewHeading cap caméra (rad) — résout les ancrages garantis. */
  update(dt, elapsed, viewHeading = 0) {
    this._time.value = elapsed
    // Résolution UNE FOIS des ancrages relatifs au regard : le cap est
    // verrouillé après convergence, ces points restent donc dans le cadre.
    if (this._viewAngle === null) {
      this._viewAngle = Math.atan2(-Math.cos(viewHeading), -Math.sin(viewHeading))
      for (const pop of this._pops) {
        for (const f of pop.fish) {
          if (f.da !== undefined && f.ax === undefined) {
            const a = this._viewAngle + f.da
            f.ax = Math.cos(a) * f.ar
            f.az = Math.sin(a) * f.ar
          }
        }
      }
    }
    for (const pop of this._pops) {
      const visible = Math.round(pop.baseCount * this._visibleRatio)
      let drawn = 0
      for (let i = 0; i < pop.fish.length && drawn < visible; i++) {
        const f = pop.fish[i]
        const a = f.phase + elapsed * f.speed * this._pace
        const x = f.ax + Math.cos(a) * f.orbit
        const z = f.az + Math.sin(a) * f.orbit
        // Garantis : hauteur ABSOLUE (indépendante du relief ±13 m du fond),
        // les autres suivent le sol local comme avant.
        const bobY = Math.sin(elapsed * 0.4 + f.bob) * 0.5
        const y = f.absY !== undefined
          ? f.absY + bobY
          : FLOOR_Y + floorHeight(x, z) + f.height + bobY

        // cap tangent au circuit (sens de rotation compris)
        const dirX = -Math.sin(a) * Math.sign(f.speed)
        const dirZ = Math.cos(a) * Math.sign(f.speed)
        const yaw = Math.atan2(-dirZ, dirX)

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

  dispose() {
    for (const { mesh } of this._pops) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  }
}
