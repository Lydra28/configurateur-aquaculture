/**
 * Le modèle d'écosystème.
 *
 * Deux entrées pilotent tout le rendu :
 *   1. `config`   — les choix d'exploitation de l'utilisateur (le configurateur)
 *   2. `timeline` — où l'on se trouve dans le temps (semaine depuis la mise en eau)
 *
 * Et une sortie unique, `derived`, que la scène lit. Aucun module graphique ne
 * connaît la notion de « densité d'élevage » : il ne voit que turbidité, bloom,
 * biodiversité. C'est ce qui permet de rebrancher un autre modèle plus tard sans
 * toucher aux shaders.
 *
 * Le modèle est ANALYTIQUE, pas incrémental : `derived` est une fonction pure de
 * (config, week). On peut donc scrubber la timeline dans les deux sens, sauter à
 * la semaine 300 puis revenir, sans dérive ni état caché.
 *
 * Les coefficients sont plausibles, pas sourcés. Ils servent à obtenir une courbe
 * qui se lit à l'œil — pas à publier un chiffre. À remplacer par un vrai modèle
 * (ou par les abaques d'un organisme) avant toute communication publique.
 */

import { clamp, lerp, smoothstep } from '../core/math.js'

export const WEEKS_PER_YEAR = 52
export const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver']

/** Valeurs de départ : l'exploitation de 14 ha évoquée en atelier. */
export const DEFAULT_CONFIG = {
  areaHa: 14,           // superficie de l'exploitation (ha)
  stockDensity: 22,     // kg de poisson par m³ de cage
  feedConversion: 1.6,  // indice de conversion alimentaire (kg d'aliment / kg produit)
  treatments: 0.35,     // antibiotiques + antifoulings, 0 = aucun, 1 = usage intensif
  waterExchange: 0.55,  // renouvellement du site (courant, profondeur), 0 = baie fermée
  mitigation: 0.15,     // filtration, cultures extractives, IMTA, jachères
  offshore: 0.2,        // 0 = front de mer, 1 = plein large
}

/** Où l'on se trouve dans le temps, et à quelle heure on regarde. */
export const DEFAULT_TIMELINE = {
  week: 10,          // semaines écoulées depuis la mise en eau (fin de printemps)
  timeOfDay: 0.715,  // 0 = minuit, 0.5 = midi. 0.715 place le soleil à ~7°,
                     // la hauteur du coucher des images de référence
}

/* ------------------------------------------------------------------ */
/* Saisons                                                             */
/* ------------------------------------------------------------------ */

/** Phase dans l'année, 0 au 1er jour du printemps. */
export function yearPhase(week) {
  return (((week % WEEKS_PER_YEAR) + WEEKS_PER_YEAR) % WEEKS_PER_YEAR) / WEEKS_PER_YEAR
}

export function seasonIndex(week) {
  return Math.floor(yearPhase(week) * 4) % 4
}

/**
 * Température de surface, °C — plage plausible d'une côte atlantique française.
 * Le maximum tombe en FIN d'été, pas au solstice : la mer a deux mois d'inertie
 * sur l'air, et c'est ce décalage qui place le pic de bloom en septembre.
 */
function seaTemperature(phase) {
  return 15.5 + 6.5 * Math.sin(2 * Math.PI * (phase - 0.28))
}

/** Énergie météo : tempêtes d'hiver, calme estival. */
function storminess(phase) {
  return 0.5 + 0.5 * Math.sin(2 * Math.PI * (phase - 0.60))
}

/** Hauteur du soleil à midi : haute en été, rasante en hiver. */
function solarSeasonBias(phase) {
  return Math.sin(2 * Math.PI * (phase - 0.25))
}

/* ------------------------------------------------------------------ */
/* Pression exercée par l'exploitation                                 */
/* ------------------------------------------------------------------ */

/**
 * Charge hebdomadaire rejetée dans le milieu, normalisée ~[0..1].
 * Trois postes : nutriments (azote/phosphore des fèces et de l'aliment perdu),
 * dépôt organique sous les cages, et charge chimique des traitements.
 */
function weeklyLoad(config) {
  const {
    areaHa, stockDensity, feedConversion,
    treatments, waterExchange, mitigation, offshore,
  } = config

  // Biomasse à l'hectare : c'est l'intensité qui compte, pas la taille du site.
  const intensity = clamp(stockDensity / 40, 0, 1.6)
  const feedWaste = clamp((feedConversion - 1.0) / 1.4, 0, 1.4)

  const nutrients = intensity * (0.55 + 0.45 * feedWaste)
  const deposition = intensity * intensity * (0.4 + 0.6 * feedWaste)
  const chemical = treatments * (0.35 + 0.65 * intensity)

  // La dispersion évacue : courant du site + éloignement de la côte.
  const dispersal = clamp(0.25 + 0.55 * waterExchange + 0.35 * offshore, 0.25, 1)
  // Les mesures correctives retirent une part de la charge avant qu'elle ne porte.
  const abated = clamp(1 - 0.75 * mitigation, 0.25, 1)

  // Un grand site dilue un peu moins bien qu'il n'y paraît : l'emprise au sol
  // compte sous-linéairement.
  const footprint = Math.pow(clamp(areaHa / 14, 0.2, 6), 0.35)

  return {
    nutrients: (nutrients / dispersal) * abated * footprint * 0.06,
    deposition: (deposition / Math.pow(dispersal, 0.6)) * abated * footprint * 0.05,
    chemical: (chemical / dispersal) * abated * footprint * 0.04,
  }
}

/* ------------------------------------------------------------------ */
/* État dérivé — la seule chose que la scène lit                        */
/* ------------------------------------------------------------------ */

export function derive(config, timeline) {
  const week = Math.max(0, timeline.week)
  const phase = yearPhase(week)
  const season = seasonIndex(week)
  const years = week / WEEKS_PER_YEAR

  const temp = seaTemperature(phase)
  const storm = storminess(phase)
  const load = weeklyLoad(config)

  // --- Nutriments : effet rapide, largement réversible ---------------
  // Saturation exponentielle vers un plateau ; l'hiver rebrasse et évacue.
  const nutrientPlateau = clamp(load.nutrients * 14, 0, 1)
  const nutrientRamp = 1 - Math.exp(-week / 26)
  const winterFlush = 1 - 0.3 * storm
  const nutrientLevel = clamp(nutrientPlateau * nutrientRamp * winterFlush, 0, 1)

  // --- Dépôt organique : lent, cumulatif, quasi irréversible ---------
  // C'est lui qui fait basculer le fond vers le désert, sur des années.
  const sediment = clamp(1 - Math.exp(-load.deposition * week * 0.55), 0, 1)

  // --- Charge chimique : décroît entre deux traitements --------------
  const treatmentPulse = 0.65 + 0.35 * Math.sin(2 * Math.PI * week / 9)
  const chemical = clamp(load.chemical * 11 * treatmentPulse * (1 - Math.exp(-week / 8)), 0, 1)

  // --- Bloom algal : nutriments × chaleur ----------------------------
  // Un excès d'azote ne bloome pas en février. Il attend l'eau à 18°.
  const thermalWindow = smoothstep(13, 19.5, temp)
  const bloom = clamp(nutrientLevel * (0.25 + 0.75 * thermalWindow) * (1 - 0.35 * storm), 0, 1)

  // --- Oxygène dissous ------------------------------------------------
  // L'eau chaude en dissout moins ; le bloom et la matière en décomposition
  // en consomment. C'est le facteur limitant de la faune.
  const oxygenSaturation = clamp(1 - (temp - 8) / 26, 0.35, 1)
  const oxygenDemand = 0.55 * bloom + 0.45 * sediment
  const oxygen = clamp(oxygenSaturation * (1 - 0.85 * oxygenDemand), 0, 1)

  // --- Turbidité -------------------------------------------------------
  const resuspension = 0.35 * storm * sediment
  const turbidity = clamp(0.08 + 0.55 * bloom + 0.4 * sediment + resuspension, 0, 1)

  // --- Santé globale ----------------------------------------------------
  // Le minimum pondéré compte plus que la moyenne : un seul facteur à zéro
  // suffit à vider un fond, même si les autres vont bien.
  const stress = clamp(
    0.30 * (1 - oxygen) + 0.34 * sediment + 0.20 * chemical + 0.16 * bloom, 0, 1,
  )
  const worst = Math.max(1 - oxygen, sediment, chemical)
  const health = clamp(1 - Math.max(stress, 0.72 * worst), 0, 1)

  // --- Biodiversité : suit la santé, mais avec de l'hystérésis ---------
  // Un fond ne se repeuple pas au rythme où il se vide : la part déjà envasée
  // ne revient pas quand l'eau se réoxygène. D'où la pénalité sur `sediment`
  // seul, et non sur la santé instantanée.
  const recolonisationLag = clamp(1 - 0.45 * sediment, 0, 1)
  const biodiversity = clamp(Math.pow(health, 1.35) * recolonisationLag, 0, 1)

  // --- Conditions d'observation ----------------------------------------
  const waveEnergy = clamp(
    0.18 + 0.55 * storm + 0.35 * config.offshore, 0.12, 1.15,
  )

  // Élévation solaire : heure du jour × biais saisonnier.
  const dayAngle = (timeline.timeOfDay - 0.5) * Math.PI * 2
  const noonHeight = 42 + 21 * solarSeasonBias(phase)
  const sunElevation = Math.asin(
    clamp(Math.cos(dayAngle) * Math.sin(noonHeight * Math.PI / 180), -1, 1),
  ) * 180 / Math.PI
  const sunAzimuth = 150 + 60 * Math.sin(dayAngle)

  // Trouble atmosphérique : plus d'aérosols en été, air lavé après tempête.
  const atmosphereTurbidity = lerp(1.5, 3.3, clamp(0.35 + 0.5 * thermalWindow - 0.25 * storm, 0, 1))

  return {
    // temps
    week, years, phase, season, seasonName: SEASONS[season],
    temperature: temp, storminess: storm,

    // pressions
    nutrientLevel, sediment, chemical, bloom,

    // état du milieu
    health, biodiversity, oxygen, turbidity,

    // conditions de rendu
    waveEnergy, sunElevation, sunAzimuth, atmosphereTurbidity,

    // dérivés directs pour les shaders, bornés [0..1]
    surfaceScum: clamp(0.75 * bloom + 0.3 * chemical - 0.2 * storm, 0, 1),
    clarity: clamp(1 - turbidity, 0.05, 1),
    algaeHue: clamp(bloom * (1 - 0.4 * chemical), 0, 1),
  }
}

/* ------------------------------------------------------------------ */
/* Store minimal, sans dépendance                                      */
/* ------------------------------------------------------------------ */

export function createEcosystemStore(
  config = { ...DEFAULT_CONFIG },
  timeline = { ...DEFAULT_TIMELINE },
) {
  const listeners = new Set()
  let derived = derive(config, timeline)

  const emit = () => {
    derived = derive(config, timeline)
    for (const fn of listeners) fn(derived, { config, timeline })
  }

  return {
    config,
    timeline,
    get derived() { return derived },
    /** Fusionne des champs de configurateur et recalcule. */
    setConfig(patch) { Object.assign(config, patch); emit() },
    /** Déplace le curseur temporel. */
    setTimeline(patch) { Object.assign(timeline, patch); emit() },
    /** Raccourci : va directement à une semaine donnée. */
    seek(week) { timeline.week = Math.max(0, week); emit() },
    subscribe(fn) { listeners.add(fn); fn(derived, { config, timeline }); return () => listeners.delete(fn) },
    /** À appeler après une mutation directe de `config` (ex. lil-gui). */
    refresh: emit,
  }
}
