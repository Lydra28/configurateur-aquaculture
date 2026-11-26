import { clamp, lerp } from '../core/math.js'
import { interplay } from './interplay.js'

/**
 * Couche SCÉNARIO du configurateur — traduit les 5 choix de l'utilisateur
 * (d'après « composantes.md » / « wording-parcours.md », variables revues le
 * 26/11/2026 par l'audit `references/2026-11-26-audit-variables.md` du
 * projet : Méthode + Eaux usées fusionnées, « Santé et parasites » ajoutée) :
 * - un SCORE D'IMPACT /100 : 0 = mer sans ferme, 100 = tout va mal. Chaque
 *   variable vaut jusqu'à 20 points, PONDÉRÉS par les autres choix
 *   (interplay.js : l'échelle amplifie, l'élevage à terre filtre) ;
 * - des CIBLES visuelles pour le décor, exprimées dans les grandeurs que
 *   les applyEcosystem de la scène consomment déjà (turbidity, sediment,
 *   bloom, health, biodiversity, oxygen…) + trois commandes propres à la
 *   ferme (nombre de cages, densité par cage, déchets/particules).
 *
 * Le scénario fabrique un état au même contrat que store.derived, main.js
 * le compose et le distribue par le chemin existant. Transition douce
 * (~3 s) : chaque canal glisse vers sa cible, le décor « répond » au choix.
 *
 * CALIBRAGE : tout le barème est dans COMPONENTS ci-dessous (points
 * d'impact et canaux visuels 0..1 par option, sommés puis projetés) — c'est
 * LE fichier que le groupe retouche pour ajuster l'impact de chaque choix.
 *
 * RÈGLES DE COHÉRENCE (verrouillées par tests/scenario.test.js) :
 * - aucune option n'est gratuite : même la meilleure pèse un peu (2 points,
 *   un dixième de l'effet de la pire, qui en vaut 20) — une ferme a toujours
 *   un impact, 0/100 est réservé à la mer sans ferme (aucun choix) ;
 * - une composante non choisie ne compte pas (0 point, aucun effet). Seule
 *   exception : sans choix d'échelle, le décor garde ses 3 cages d'arrivée ;
 * - aggraver un choix ne fait jamais baisser le score ni s'améliorer le
 *   milieu ; choisir une ferme plus petite ou mieux confinée ALLÈGE le
 *   poids des autres variables, en points comme à l'écran ;
 * - à points égaux, dégât visible comparable, quelle que soit la variable ;
 * - même au pire, aucun canal ne bute sur son plafond.
 */

// Turbidité de départ du décor validé, et plafond qui garde les cages
// lisibles même au pire (le barème doit rester dessous, voir les tests).
export const TURBIDITY_BASE = 0.08
export const TURBIDITY_CAP = 0.7

// Canaux d'impact (0..1, sommés puis bornés) :
// turb = eau qui se trouble · sed = vase au fond · bloom = eau et surface
// qui verdissent · stress = pression générale sur le vivant · waste =
// granulés et tapis sous les cages (module FarmWaste) · density/cages = ferme.
// Réglage du 26/11/2026, sur MESURE à l'écran : la turbidité se voit plus
// que les algues, et bien plus que la vase ou le recul du vivant. Chaque
// pire option porte donc une part de turbidité plus SA signature ; les
// autres options gardent ses proportions (indice `damage` des tests).
export const COMPONENTS = {
  echelle: {
    label: 'Échelle de production',
    options: {
      // density = fraction du cheptel MAXIMUM de l'espèce, réparti sur les
      // cages présentes — contraste net voulu : ~15 poissons (1 cage),
      // ~30/cage (2 cages), ~50/cage (3 cages). Plus de biomasse sur un
      // même site = plus de dépôt sous la ferme.
      locale: { impact: 2, cages: 1, density: 0.1, sed: 0.04, waste: 0.025, stress: 0.008, turb: 0.013 },
      nationale: { impact: 10, cages: 2, density: 0.4, sed: 0.2, waste: 0.12, stress: 0.04, turb: 0.065 },
      continentale: { impact: 20, cages: 3, density: 1.0, sed: 0.4, waste: 0.25, stress: 0.08, turb: 0.13 },
    },
  },
  rejets: {
    // fusion de l'ancienne « Méthode » et des « Eaux usées » : en cage
    // ouverte, tout ce que rejette la ferme part à la mer, il n'y a pas
    // d'eaux usées à traiter. Décision Romain maintenue : les cages restent
    // à l'écran quel que soit le mode, la différence se raconte par l'eau.
    label: 'Élevage et rejets',
    options: {
      cagesOuvertes: { impact: 20, turb: 0.11, bloom: 0.09, waste: 0.3 },
      rejetFiltre: { impact: 12, turb: 0.066, bloom: 0.054, waste: 0.18 },
      circuitFerme: { impact: 2, turb: 0.011, bloom: 0.009, waste: 0.03 },
    },
  },
  alimentation: {
    // recadrée sur l'origine des ingrédients : la farine pèse surtout sur
    // les poissons sauvages pêchés pour la fabriquer (stress), le soja sur
    // les rejets de phosphore mal digéré (bloom)
    label: 'Alimentation',
    options: {
      farine: { impact: 20, stress: 0.22, waste: 0.25, sed: 0.28, turb: 0.13 },
      soja: { impact: 11, bloom: 0.08, waste: 0.14, stress: 0.08, sed: 0.05, turb: 0.03 },
      insectes: { impact: 2, stress: 0.022, waste: 0.025, sed: 0.028, turb: 0.013 },
    },
  },
  sante: {
    // nouvelle variable : traitements, parasites et pertes — résidus au
    // fond (sed), vie sauvage affaiblie autour de la ferme (stress)
    label: 'Santé et parasites',
    options: {
      chimique: { impact: 20, stress: 0.3, sed: 0.22, turb: 0.13 },
      soinsMecaniques: { impact: 10, stress: 0.15, sed: 0.11, turb: 0.065 },
      prevention: { impact: 2, stress: 0.03, sed: 0.022, turb: 0.013 },
    },
  },
  energie: {
    // recadrée : l'effet réel est climatique (l'océan entier), le décor le
    // montre de façon symbolique par une vie plus fragile et une eau qui
    // verdit
    label: 'Énergie',
    options: {
      peuMachines: { impact: 2, bloom: 0.017, stress: 0.018, turb: 0.005 },
      continu: { impact: 10, bloom: 0.085, stress: 0.09, turb: 0.025 },
      artificiel: { impact: 20, bloom: 0.17, stress: 0.18, turb: 0.05 },
    },
  },
}

/** Niveau lu sur le score d'impact — miroir des seuils du wording (70+ / 40-69 / <40 en préservation). */
export function impactTier(score) {
  if (score <= 30) return 'Préservé'
  if (score <= 60) return 'Fragile'
  return 'Dégradé'
}

// Fermes réelles (choix sourcés ou hypothèses) : module voisin, ré-exporté ici.
export { PRESETS } from './presets.js'

/**
 * DÉTAIL DE LA NOTATION (Panneau Impact) — projection des 5 composantes
 * (/20 chacune) sur les 6 critères pondérés de la maquette. Chaque LIGNE
 * de la matrice somme à 20 (la composante distribue tout son impact),
 * chaque COLONNE somme au poids du critère (25/20/20/15/12/8 = 100) : le
 * total du détail est donc EXACTEMENT le score global. Matrice réglable
 * par le groupe.
 */
export const CRITERIA = [
  { key: 'fonds', label: 'Fonds marins · dépôt organique', max: 25 },
  { key: 'eau', label: "Qualité de l'eau · nutriments", max: 20 },
  { key: 'biodiv', label: 'Biodiversité locale', max: 20 },
  { key: 'sanitaire', label: 'Pression sanitaire & traitements', max: 15 },
  { key: 'carbone', label: 'Bilan carbone · aliment, énergie', max: 12 },
  { key: 'bienEtre', label: 'Bien-être animal · densité', max: 8 },
]
//                     fonds  eau  biodiv sanit carbone bien-être   (Σ = 20)
const CRITERIA_MATRIX = {
  echelle: [10, 2, 2, 0, 0, 6],
  rejets: [9, 9, 2, 0, 0, 0],
  alimentation: [4, 2, 8, 0, 6, 0],
  sante: [0, 2, 3, 13, 0, 2],
  energie: [2, 5, 5, 2, 6, 0],
}

/**
 * Projette les choix sur les 6 critères → [{ key, label, max, value }].
 * Les valeurs sont ENTIÈRES et leur somme égale EXACTEMENT le score
 * (arrondi aux plus grands restes — sinon les lignes affichées peuvent
 * sommer à côté du total).
 */
export function projectCriteria(choices = {}) {
  const values = CRITERIA.map(() => 0)
  const weights = interplay(choices)
  for (const [key, component] of Object.entries(COMPONENTS)) {
    const option = component.options[choices[key]]
    if (!option) continue
    const weight = (option.impact * weights[key]) / 20
    CRITERIA_MATRIX[key].forEach((points, i) => { values[i] += weight * points })
  }
  const floors = values.map(Math.floor)
  let remainder = Math.round(values.reduce((a, b) => a + b, 0)) - floors.reduce((a, b) => a + b, 0)
  const order = values.map((v, i) => [v - floors[i], i]).sort((a, b) => b[0] - a[0])
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) floors[order[k][1]]++
  return CRITERIA.map((criterion, i) => ({ ...criterion, value: floors[i] }))
}

/**
 * Résout un jeu de choix (partiel accepté : une composante absente ne
 * compte pas et ne module rien) → { score, scoreMax, targets }.
 * `score` est l'impact /100, arrondi ; `scoreMax` vaut toujours 100.
 */
export function resolveScenario(choices = {}) {
  const sums = { turb: 0, sed: 0, bloom: 0, stress: 0, waste: 0 }
  let score = 0
  const scoreMax = 100
  let cages = 3      // défaut décor validé : les 3 cages
  let density = 0.55 // défaut décor validé : densité saine
  const weights = interplay(choices)
  for (const [key, component] of Object.entries(COMPONENTS)) {
    const choice = choices[key]
    if (!choice) continue
    const option = component.options[choice]
    if (!option) continue
    // Points ET effets visibles portent le même poids : le décor suit le score.
    score += option.impact * weights[key]
    for (const canal of Object.keys(sums)) sums[canal] += (option[canal] ?? 0) * weights[key]
    if (option.cages !== undefined) cages = option.cages
    if (option.density !== undefined) density = option.density
  }

  const stress = clamp(sums.stress, 0, 1)
  const bloom = clamp(sums.bloom, 0, 1)
  // plafond : même au pire, les cages et leur contenu restent lisibles
  const turbidity = clamp(TURBIDITY_BASE + sums.turb, 0, TURBIDITY_CAP)
  const sediment = clamp(sums.sed, 0, 1)
  return {
    score: Math.round(score),
    scoreMax,
    targets: {
      // grandeurs au contrat de store.derived (consommées par les modules)
      turbidity,
      sediment,
      bloom,
      health: clamp(1 - 0.8 * stress - 0.15 * bloom, 0, 1),
      biodiversity: clamp(1 - 0.85 * stress - 0.2 * sediment, 0, 1),
      oxygen: clamp(1 - 0.75 * stress - 0.25 * bloom, 0, 1),
      nutrientLevel: clamp(0.5 * bloom + 0.3 * sums.waste, 0, 1),
      // commandes ferme (hors contrat store — consommées par main.js)
      waste: clamp(sums.waste, 0, 1),
      density,
      cages,
    },
  }
}

/**
 * Directeur de transition : glisse l'état courant vers la cible (~3 s) et
 * livre à main.js un état fusionnable, à cadence bornée. Inactif tant que
 * set() n'a pas été appelé : le décor validé reste exactement lui-même.
 */
export class ScenarioDirector {
  constructor({ tau = 1.1, hz = 12 } = {}) {
    this._tau = tau
    this._interval = 1 / hz
    this._accumulator = 0
    this._current = null
    this._target = null
    this._choices = {}
    this.score = 0
    this.scoreMax = 100
    this.onScore = null
  }

  /**
   * Applique un jeu de choix (complet ou partiel) — cumulatif. La clé
   * `species` (hors composantes) porte l'espèce du préréglage : elle
   * traverse jusqu'à applyScenario sans entrer dans le score.
   */
  set(patch) {
    const { species, ...choices } = patch
    this._choices = { ...this._choices, ...choices }
    if (species) this._species = species
    const { score, scoreMax, targets } = resolveScenario(this._choices)
    this.score = score
    this.scoreMax = scoreMax
    this._target = { ...targets, species: this._species ?? 'saumon' }
    if (!this._current) this._current = { ...this._target }
    this.onScore?.(score, scoreMax)
  }

  /**
   * Remet le configurateur à zéro : aucun choix, retour au décor neutre
   * (les 3 cages retrouvent leurs espèces variées d'origine).
   */
  reset() {
    this._choices = {}
    this._species = null
    const { targets } = resolveScenario({})
    this.score = 0
    this.scoreMax = 100
    this._target = { ...targets, species: null }
    if (!this._current) this._current = { ...this._target }
    this.onScore?.(0, 100)
  }

  get choices() { return { ...this._choices } }
  get active() { return this._target !== null }

  /** Saute directement à la cible (préréglage à l'arrivée, tests). */
  snap() {
    if (this._target) this._current = { ...this._target }
    this._still = 0
  }

  /**
   * @returns l'état interpolé quand il faut ré-appliquer, sinon null —
   * lissage exponentiel : ~95 % de la cible en 3·tau secondes.
   */
  update(dt) {
    if (!this._target) return null
    this._accumulator += dt
    if (this._accumulator < this._interval) return null
    const step = this._accumulator
    this._accumulator = 0
    const k = 1 - Math.exp(-step / this._tau)
    let moving = false
    for (const key of Object.keys(this._target)) {
      const target = this._target[key]
      const current = this._current[key]
      if (typeof target !== 'number') { this._current[key] = target; continue }
      const next = lerp(current, target, k)
      if (Math.abs(next - target) > 0.001) moving = true
      this._current[key] = Math.abs(next - target) > 0.0005 ? next : target
    }
    this._still = !moving && this._still ? this._still : moving ? 0 : (this._still ?? 0) + 1
    // livre encore quelques ticks après l'arrivée, puis se tait
    if (this._still > 3) return null
    return { ...this._current }
  }
}
