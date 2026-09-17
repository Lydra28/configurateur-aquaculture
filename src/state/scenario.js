import { clamp, lerp } from '../core/math.js'

/**
 * Couche SCÉNARIO du configurateur — traduit les 5 choix de l'utilisateur
 * (fichiers « composantes.md » / « wording-parcours.md ») en :
 * - un SCORE /100 (somme des 5 barèmes /20 — bornes réelles 23..100) ;
 * - des CIBLES visuelles pour le décor, exprimées dans les grandeurs que
 *   les applyEcosystem de la scène consomment déjà (turbidity, sediment,
 *   bloom, health, biodiversity, oxygen…) + trois commandes propres à la
 *   ferme (nombre de cages, densité par cage, déchets/particules).
 *
 * AUCUN module du décor n'est modifié : le scénario fabrique un état au
 * même contrat que store.derived, main.js le fusionne et le distribue par
 * le chemin existant. Transition douce (~3 s) : chaque canal glisse vers
 * sa cible par lissage exponentiel — le décor « répond » au choix au lieu
 * de sauter.
 *
 * CALIBRAGE : tout le barème visuel est dans OPTIONS ci-dessous (canaux
 * 0..1 par option, sommés par canal puis projetés) — c'est LE fichier que
 * le groupe retouche pour ajuster l'impact perçu de chaque choix.
 */

// Canaux d'impact (0..1, sommés puis bornés) :
// turb = eau qui se trouble · sed = dépôt au fond · bloom = prolifération
// d'algues · stress = pression générale sur le vivant · waste = particules
// (nourriture/déchets, module FarmWaste) · density/cages = ferme.
export const COMPONENTS = {
  echelle: {
    label: 'Échelle de production',
    options: {
      // density = fraction du cheptel MAXIMUM de l'espèce, réparti sur les
      // cages présentes — contraste net voulu : ~15 poissons (1 cage),
      // ~30/cage (2 cages), ~50/cage (3 cages)
      locale: { score: 20, cages: 1, density: 0.1, sed: 0.05 },
      nationale: { score: 12, cages: 2, density: 0.4, sed: 0.15, turb: 0.05, stress: 0.05 },
      continentale: { score: 4, cages: 3, density: 1.0, sed: 0.3, turb: 0.12, stress: 0.12 },
    },
  },
  methode: {
    label: "Méthode d'élevage",
    options: {
      // décision Romain : la différence se raconte par la turbidité seule,
      // les cages restent à l'écran quel que soit le mode
      cagesOuvertes: { score: 6, turb: 0.3, waste: 0.25, stress: 0.1 },
      eauRejetee: { score: 10, turb: 0.12, stress: 0.05 },
      eauBoucle: { score: 18, turb: 0.02 },
    },
  },
  alimentation: {
    label: 'Alimentation',
    options: {
      farine: { score: 5, waste: 0.5, sed: 0.25, turb: 0.1, stress: 0.1 },
      soja: { score: 12, waste: 0.25, sed: 0.12, bloom: 0.25, stress: 0.05 },
      insectes: { score: 20, waste: 0.05 },
    },
  },
  eauxUsees: {
    label: 'Eaux usées',
    options: {
      rejetDirect: { score: 4, turb: 0.3, bloom: 0.3, sed: 0.15, waste: 0.2, stress: 0.2 },
      traitee: { score: 14, turb: 0.08, bloom: 0.15, stress: 0.05 },
      enfouie: { score: 20, turb: 0.02 },
    },
  },
  energie: {
    label: 'Énergie',
    options: {
      peuMachines: { score: 20 },
      continu: { score: 12, bloom: 0.12, stress: 0.06 },
      artificiel: { score: 4, bloom: 0.4, turb: 0.08, stress: 0.2 },
    },
  },
}

/** Préréglages des fermes réelles (écran D) — espèce comprise. */
export const PRESETS = {
  esturgeonniere: {
    label: "L'Esturgeonnière", species: 'esturgeon',
    choices: { echelle: 'locale', methode: 'eauRejetee', alimentation: 'farine', eauxUsees: 'rejetDirect', energie: 'peuMachines' },
  },
  frea: {
    label: 'FREA', species: 'truite',
    choices: { echelle: 'nationale', methode: 'eauBoucle', alimentation: 'farine', eauxUsees: 'traitee', energie: 'continu' },
  },
  atlanticSapphire: {
    label: 'Atlantic Sapphire', species: 'saumon',
    choices: { echelle: 'continentale', methode: 'eauBoucle', alimentation: 'farine', eauxUsees: 'enfouie', energie: 'artificiel' },
  },
}

/**
 * DÉTAIL DE LA NOTATION (Panneau Impact) — projection des 5 composantes
 * (/20 chacune) sur les 6 critères pondérés de la maquette. Chaque LIGNE
 * de la matrice somme à 20 (la composante distribue tout son score),
 * chaque COLONNE somme au poids du critère (25/20/20/15/12/8 = 100) : le
 * total du détail est donc EXACTEMENT le score global. Matrice réglable
 * par le groupe.
 */
export const CRITERIA = [
  { key: 'fonds', label: 'Fonds marins · dépôt organique', max: 25 },
  { key: 'eau', label: "Qualité de l'eau · nutriments", max: 20 },
  { key: 'biodiv', label: 'Biodiversité locale', max: 20 },
  { key: 'sanitaire', label: 'Pression sanitaire & traitements', max: 15 },
  { key: 'carbone', label: 'Bilan carbone · aliment, transport', max: 12 },
  { key: 'bienEtre', label: 'Bien-être animal · densité', max: 8 },
]
//                     fonds  eau  biodiv sanit carbone bien-être   (Σ = 20)
const CRITERIA_MATRIX = {
  echelle: [6, 2, 2, 2, 0, 8],
  methode: [2, 6, 6, 6, 0, 0],
  alimentation: [6, 2, 2, 0, 10, 0],
  eauxUsees: [8, 8, 2, 2, 0, 0],
  energie: [3, 2, 8, 5, 2, 0],
}

/**
 * Projette les choix sur les 6 critères → [{ key, label, max, value }].
 * Les valeurs sont ENTIÈRES et leur somme égale EXACTEMENT le score
 * (arrondi aux plus grands restes — sinon les lignes affichées peuvent
 * sommer à côté du total).
 */
export function projectCriteria(choices = {}) {
  const values = CRITERIA.map(() => 0)
  let score = 0
  for (const [key, component] of Object.entries(COMPONENTS)) {
    const option = component.options[choices[key]]
    if (!option) continue
    score += option.score
    const weight = option.score / 20
    CRITERIA_MATRIX[key].forEach((points, i) => { values[i] += weight * points })
  }
  const floors = values.map(Math.floor)
  let remainder = score - floors.reduce((a, b) => a + b, 0)
  const order = values.map((v, i) => [v - floors[i], i]).sort((a, b) => b[0] - a[0])
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) floors[order[k][1]]++
  return CRITERIA.map((criterion, i) => ({ ...criterion, value: floors[i] }))
}

/**
 * Résout un jeu de choix (partiel accepté : les composantes absentes sont
 * neutres) → { score, scoreMax, targets }.
 */
export function resolveScenario(choices = {}) {
  const sums = { turb: 0, sed: 0, bloom: 0, stress: 0, waste: 0 }
  let score = 0
  let scoreMax = 0
  let cages = 3      // défaut décor validé : les 3 cages
  let density = 0.55 // défaut décor validé : densité saine
  for (const [key, component] of Object.entries(COMPONENTS)) {
    const choice = choices[key]
    if (!choice) continue
    const option = component.options[choice]
    if (!option) continue
    score += option.score
    scoreMax += 20
    for (const canal of Object.keys(sums)) sums[canal] += option[canal] ?? 0
    if (option.cages !== undefined) cages = option.cages
    if (option.density !== undefined) density = option.density
  }

  const stress = clamp(sums.stress, 0, 1)
  const bloom = clamp(sums.bloom, 0, 1)
  // plafond 0.7 : même au pire, les cages et leur contenu restent lisibles
  const turbidity = clamp(0.08 + sums.turb, 0, 0.7)
  const sediment = clamp(sums.sed, 0, 1)
  return {
    score,
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
    this.scoreMax = 0
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
    this.scoreMax = 0
    this._target = { ...targets, species: null }
    if (!this._current) this._current = { ...this._target }
    this.onScore?.(0, 0)
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
