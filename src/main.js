import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

import { Sky } from './scene/Sky.js'
import { Ocean } from './scene/Ocean.js'
import { Underwater, FLOOR_Y } from './scene/Underwater.js'
import { Rocks } from './scene/Rocks.js'
import { Flora } from './scene/Flora.js'
import { Sardines } from './scene/Sardines.js'
import { FixedLife } from './scene/FixedLife.js'
import { DemersalFish } from './scene/DemersalFish.js'
import { FarmCages } from './scene/FarmCages.js'
import { CagedFish } from './scene/CagedFish.js'
import { FarmWaste } from './scene/FarmWaste.js'
import { LightShafts } from './scene/LightShafts.js'
import { CrossingBubbles } from './scene/CrossingBubbles.js'
import { StaticShot } from './camera/StaticShot.js'
import { WaterlineSplit } from './render/WaterlineSplit.js'
import { createEcosystemStore } from './state/ecosystem.js'
import { ScenarioDirector, resolveScenario, PRESETS } from './state/scenario.js'
import { createDebugPanel } from './ui/DebugPanel.js'
import { mountConfigurator } from './ui/configurator.js'
import { DEG, clamp, lerp } from './core/math.js'

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('gl')
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
})
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
// ACES : la seule courbe qui tienne un soleil à 400 et une eau à 0.05 dans la
// même image sans écrêter le halo en disque blanc franc.
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.85
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()

/* ------------------------------------------------------------------ */
/* Contenu                                                             */
/* ------------------------------------------------------------------ */

const sky = new Sky(renderer, { envSize: 128 })
scene.add(sky.mesh)

const ocean = new Ocean({ sky })
scene.add(ocean.mesh)

// Les monticules ET les algues génériques (les « triangles noirs ») laissent
// place aux assets reconstruits d'après références — le minéral est en place,
// la flore atlantique (laminaire, fucus, zostère) arrive par le même chemin.
const underwater = new Underwater({ moundCount: 0, kelpCount: 0 })
scene.add(underwater.group)

const rocks = new Rocks()
underwater.group.add(rocks.group) // hérite du masquage par passe

const flora = new Flora()
underwater.group.add(flora.group)

const sardines = new Sardines()
underwater.group.add(sardines.mesh)

const fixedLife = new FixedLife()
underwater.group.add(fixedLife.group)

const demersals = new DemersalFish()
underwater.group.add(demersals.group)

// Cages aquacoles : semi-immergées, une moitié par passe de rendu (la
// visibilité est basculée dans renderAbove/renderBelow, comme underwater).
const farm = new FarmCages()
scene.add(farm.above, farm.below)

// Poissons d'élevage : dans le monde immergé (masquage par passe hérité).
const cagedFish = new CagedFish(farm)
underwater.group.add(cagedFish.group)

// Déchets de la ferme (granulés + dépôt) — invisibles à intensité 0.
const farmWaste = new FarmWaste(farm)
underwater.group.add(farmWaste.group)

const shafts = new LightShafts()
scene.add(shafts.mesh)

// Dormantes en vue statique (plus de traversée), gardées pour un futur usage
// événementiel : NEMO.three.bubbles.trigger(...) reste disponible.
const bubbles = new CrossingBubbles()
scene.add(bubbles.points)

// Éclairage des instances (coraux, algues) : matériaux Lambert, vraies lumières.
const SURFACE_AMBIENT = new THREE.Color(0x89b6c8)
const sunLight = new THREE.DirectionalLight(0xffffff, 1.4)
const ambientLight = new THREE.HemisphereLight(0x89b6c8, 0x1d2a26, 0.9)
scene.add(sunLight, ambientLight)

/* ------------------------------------------------------------------ */
/* Caméras fixes + compositeur de ligne de flottaison                  */
/* ------------------------------------------------------------------ */

// Le décor est UN cadrage : 1/3 de ciel, 2/3 de monde sous-marin.
// L'œil immergé se place au MILIEU de la colonne : toute la profondeur entre
// dans la bande, et c'est FLOOR_Y qui règle l'échelle perçue du monde.
const shot = new StaticShot({ aboveHeight: 11, belowDepth: -FLOOR_Y / 2 })
const split = new WaterlineSplit({ line: 1 / 3 })
split.setSize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2))
// Où le soleil se pose dans le tiers émergé, à l'opposé du texte.
const SUN_FRAMING = 0.45

/* ------------------------------------------------------------------ */
/* Post-traitement : le composer rend le composite, puis bloom + sortie */
/* ------------------------------------------------------------------ */

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(split.scene, split.camera))
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.62, 1.05,
)
composer.addPass(bloom)
composer.addPass(new OutputPass())

/* ------------------------------------------------------------------ */
/* État                                                                */
/* ------------------------------------------------------------------ */

const store = createEcosystemStore()

/**
 * Distribution des grandeurs d'IMPACT au décor — chemin unique, emprunté
 * par le store (temps qui passe) ET par le scénario du configurateur.
 */
function applyImpact(state) {
  ocean.applyEcosystem(state)
  underwater.applyEcosystem(state)
  rocks.applyEcosystem(state)
  flora.applyEcosystem(state)
  sardines.applyEcosystem(state)
  fixedLife.applyEcosystem(state)
  demersals.applyEcosystem(state)
  cagedFish.applyEcosystem(state)
  shafts.applyEcosystem(state)

  // L'écume de la crête raconte l'état du milieu : blanche saine, beige chargée.
  const dirty = clamp(1 - state.health, 0, 1)
  split.uniforms.uFoamColor.value.setRGB(
    lerp(0.94, 0.78, dirty), lerp(0.97, 0.73, dirty), lerp(1.00, 0.60, dirty),
  )
}

/**
 * SCÉNARIO du configurateur : fusionne ses canaux avec l'état du store (le
 * temps, le soleil et la houle restent au store — le scénario ne pilote que
 * l'impact) et recalcule les dérivés directs des shaders.
 */
const scenarioDirector = new ScenarioDirector()
function mergeScenario(scenarioState) {
  const base = store.derived
  const merged = { ...base, ...scenarioState }
  merged.clarity = clamp(1 - merged.turbidity, 0.05, 1)
  merged.surfaceScum = clamp(0.75 * merged.bloom + 0.3 * base.chemical - 0.2 * base.storminess, 0, 1)
  merged.algaeHue = clamp(merged.bloom * (1 - 0.4 * base.chemical), 0, 1)
  return merged
}
function applyScenario(scenarioState) {
  const cages = scenarioState.cages ?? 3
  // la cage de l'ESPÈCE choisie (préréglage) est la première servie
  const speciesCage = { saumon: 0, truite: 1, esturgeon: 2 }[scenarioState.species] ?? 0
  const order = [speciesCage, ...[0, 1, 2].filter((i) => i !== speciesCage)]
  const presence = [false, false, false]
  for (let i = 0; i < cages; i++) presence[order[i]] = true
  farm.setPresence(presence)
  cagedFish.setSpecies(scenarioState.species ?? null)
  cagedFish.setDensity(scenarioState.density ?? 0.55)
  farmWaste.setIntensity(scenarioState.waste ?? 0)
  farmWaste.setPresence(presence)
  applyImpact(mergeScenario(scenarioState))
}

store.subscribe((state) => {
  sky.setSun(state.sunElevation, state.sunAzimuth)
  sky.setTurbidity(state.atmosphereTurbidity)
  sunLight.position.copy(sky.sunDirection).multiplyScalar(500)
  shot.setSunHeading(state.sunAzimuth)
  // scénario actif : ses canaux d'impact priment sur ceux du store
  applyImpact(scenarioDirector.active ? mergeScenario(scenarioDirector._current) : state)
})

const panel = createDebugPanel(store, {})

/* ------------------------------------------------------------------ */
/* Interface                                                           */
/* ------------------------------------------------------------------ */

document.getElementById('c-hero')?.classList.add('is-visible')
const hud = {
  season: document.getElementById('hud-season'),
  health: document.getElementById('hud-health'),
  week: document.getElementById('hud-week'),
}

let hudAccumulator = 0
function updateInterface(dt) {
  hudAccumulator += dt
  if (hudAccumulator < 0.15) return
  hudAccumulator = 0
  const s = store.derived
  hud.season.textContent = `${s.seasonName} · an ${Math.floor(s.years) + 1}`
  hud.health.textContent = `${Math.round(s.health * 100)} %`
  hud.week.textContent = `${Math.round(s.week)}`
}

/* ------------------------------------------------------------------ */
/* Boucle : deux passes par frame, recollées à la ligne d'eau           */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock()
let elapsed = 0
let currentPixelRatio = Math.min(devicePixelRatio, 2)
let slowFrames = 0
let shaftsOn = false // shafts.update décide ; les passes masquent puis restaurent
const underwaterFog = new THREE.FogExp2(0x0a2b33, 0.012)
const _right = new THREE.Vector3()
const _fwd = new THREE.Vector3()

/**
 * La ligne d'eau du composite est le PROFIL RÉEL de la houle vu de côté :
 * on échantillonne la hauteur de surface (Gerstner inversé) le long de la
 * ligne latérale visible à la distance de scène, et on l'écrit en fraction
 * d'écran dans le shader de recollage. La ligne ondule donc exactement comme
 * la mer du moment — mer d'huile ou tempête, c'est le même état qui pilote.
 */
function updateWaterProfile() {
  const cam = shot.below
  _right.set(1, 0, 0).applyQuaternion(cam.quaternion)
  _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion)
  const tanHalf = Math.tan(cam.fov * DEG * 0.5)
  // Distance à laquelle la surface touche le haut du cadre immergé — c'est là
  // que vit la ligne. Dérivée de la caméra : rester juste quel que soit le fov.
  const dist = Math.abs(cam.position.y) / tanHalf
  const halfWidth = dist * tanHalf * cam.aspect
  // 1 m de houle → fraction d'écran, via la projection de la caméra immergée.
  const metersToScreen = split.baseLine / (2 * dist * tanHalf)
  const n = split.profileSize
  for (let i = 0; i < n; i++) {
    const sx = ((i / (n - 1)) * 2 - 1) * halfWidth
    const x = cam.position.x + _right.x * sx + _fwd.x * dist
    const z = cam.position.z + _right.z * sx + _fwd.z * dist
    const h = ocean.sampleHeight(x, z, elapsed)
    split.profile[i] = clamp(h * metersToScreen * 0.85, -0.05, 0.05)
  }
}

function renderAbove() {
  sky.mesh.visible = true
  ocean.mesh.visible = true
  underwater.group.visible = false
  farm.above.visible = true
  farm.below.visible = false
  shafts.mesh.visible = false
  bubbles.points.visible = false
  scene.fog = null
  scene.background = null
  sunLight.color.copy(sky.sunColor)
  sunLight.intensity = 1.4
  ambientLight.color.copy(SURFACE_AMBIENT)
  ambientLight.intensity = 0.9
  ocean.update(elapsed, shot.above)
  renderer.setRenderTarget(split.rtAbove)
  renderer.render(scene, shot.above)
}

function renderBelow() {
  sky.mesh.visible = false
  // Pas de surface vue du dessous : sous la ligne, l'eau est un volume propre
  // (fond + brouillard + rais), comme sur les coupes illustrées de référence —
  // le plafond ondulant brouillait la lecture sans rien raconter.
  ocean.mesh.visible = false
  underwater.group.visible = true
  farm.above.visible = false
  farm.below.visible = true
  shafts.mesh.visible = shaftsOn
  bubbles.points.visible = true
  underwaterFog.color.copy(underwater.waterColor)
  underwaterFog.density = underwater.floorUniforms.uFogDensity.value
  scene.fog = underwaterFog
  scene.background = underwater.waterColor
  // Lumière filtrée par la colonne d'eau (Underwater.update l'a recalculée) ;
  // l'ambiante représente la lumière déjà diffusée, qui porte la visibilité.
  sunLight.color.copy(underwater.lightColor)
  sunLight.intensity = 2.6
  ambientLight.color.copy(underwater.ambientColor)
  ambientLight.intensity = 1.15
  renderer.setRenderTarget(split.rtBelow)
  renderer.render(scene, shot.below)
}

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20)
  elapsed += dt

  panel?.tick(dt)
  shot.update(dt)
  shot.aimSun(sky.sunDirection, SUN_FRAMING, dt, store.derived.sunElevation)

  sky.update(renderer)
  underwater.update(elapsed, shot.below, sky, currentPixelRatio)
  flora.update(elapsed)
  sardines.update(dt, elapsed, shot.heading)
  demersals.update(dt, elapsed, shot.heading)
  farm.update(dt, elapsed, ocean)
  cagedFish.update(dt, elapsed)
  farmWaste.update(elapsed)
  const scenarioState = scenarioDirector.update(dt)
  if (scenarioState) applyScenario(scenarioState)
  shafts.update(elapsed, shot.below, sky, underwater.lightColor)
  shaftsOn = shafts.mesh.visible
  bubbles.update(elapsed, currentPixelRatio)

  renderAbove()
  renderBelow()
  renderer.setRenderTarget(null)

  updateWaterProfile()
  split.update(elapsed)
  // La nuit, le monde immergé s'éteint avec le soleil : sans ça, l'ambiante
  // normalisée (qui porte la visibilité de jour) donne un fond éclairé à minuit.
  const sunUp = clamp((store.derived.sunElevation + 2) / 10, 0, 1)
  split.uniforms.uBelowGain.value = lerp(0.45, 2.0, sunUp)
  updateInterface(dt)
  composer.render()

  // Résolution adaptative : deux passes coûtent plus cher qu'une — on
  // redescend une seule fois, sans jamais remonter, pour ne pas osciller.
  if (dt > 1 / 32) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1)
  if (slowFrames > 90 && currentPixelRatio > 1) {
    currentPixelRatio = Math.max(1, currentPixelRatio - 0.25)
    renderer.setPixelRatio(currentPixelRatio)
    composer.setPixelRatio(currentPixelRatio)
    split.setSize(innerWidth, innerHeight, currentPixelRatio)
    slowFrames = 0
  }

  requestAnimationFrame(frame)
}

addEventListener('resize', () => {
  shot.resize()
  renderer.setSize(innerWidth, innerHeight)
  composer.setSize(innerWidth, innerHeight)
  split.setSize(innerWidth, innerHeight, currentPixelRatio)
})

requestAnimationFrame(() => {
  // Convergence du cadrage solaire AVANT la première image : pas de dérive
  // ni de chasse visibles au chargement.
  shot.settleSun(sky.sunDirection, SUN_FRAMING, store.derived.sunElevation)
  // Présence garantie : un contingent de vie fixe est replacé dans le champ,
  // maintenant que le cap est verrouillé.
  fixedLife.alignToView(shot.heading, shot.below)
  farm.alignToView(shot.heading, shot.below, shot.above)
  frame()
  document.getElementById('loader')?.classList.add('done')
})

// Points d'entrée pour la suite : le configurateur du site appellera ceci.
window.NEMO = {
  store,
  seek: (week) => store.seek(week),
  configure: (patch) => store.setConfig(patch),
  get state() { return store.derived },
  /** Accès direct aux objets de scène — réglage, tests, captures de référence. */
  three: {
    scene, renderer, sky, ocean, underwater, rocks, flora, sardines, fixedLife, demersals, farm, cagedFish, farmWaste, shafts, bubbles,
    shot, split, composer,
    // Compat : « la caméra » par défaut est celle du monde submergé.
    get camera() { return shot.below },
  },
  /**
   * SCÉNARIO du configurateur (écran F) : l'UI appelle ceci.
   * set({ echelle: 'continentale', ... }) — cumulatif, transition ~3 s ;
   * preset('atlanticSapphire') — charge une ferme réelle ;
   * onScore(cb) — score /100 en temps réel.
   */
  scenario: {
    set: (patch) => scenarioDirector.set(patch),
    preset: (key) => scenarioDirector.set(PRESETS[key].choices),
    get score() { return scenarioDirector.score },
    get scoreMax() { return scenarioDirector.scoreMax },
    get choices() { return scenarioDirector.choices },
    onScore: (cb) => { scenarioDirector.onScore = cb },
    reset: () => scenarioDirector.reset(),
    /** saut direct à l'état cible (préréglage à l'arrivée, captures) */
    snap: () => { scenarioDirector.snap(); const s = scenarioDirector.update(1); if (s) applyScenario(s) },
    resolve: resolveScenario,
    presets: PRESETS,
  },
  /** Convergence immédiate du cap et de la parallaxe (ancres, captures). */
  snap() { shot.settleSun(sky.sunDirection, SUN_FRAMING, store.derived.sunElevation) },
  sunScreenPosition() {
    const v = sky.sunDirection.clone().multiplyScalar(1000).add(shot.above.position)
    v.project(shot.above)
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, z: v.z }
  },
}

// ÉCRAN F : le panneau du configurateur, câblé sur NEMO.scenario.
mountConfigurator()
