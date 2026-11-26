/**
 * Préréglages des fermes réelles (écran D) — espèce comprise. Ce sont des
 * entreprises réelles, notées publiquement : chaque choix est soit SOURCÉ,
 * soit une HYPOTHÈSE assumée. Le détail (sources avec URL) est dans
 * `references/2026-11-26-audit-variables.md` du projet, section
 * « Appliqué le 2026-11-26 ». L'interface affiche « estimation ».
 */
export const PRESETS = {
  esturgeonniere: {
    label: "L'Esturgeonnière", species: 'esturgeon',
    choices: {
      echelle: 'locale',          // sourcé : 260 à 280 t d'esturgeons par an
      rejets: 'rejetFiltre',      // sourcé : 50 % recirculé, filtres, bassins à boues, roseaux
      alimentation: 'farine',     // hypothèse : composition non publiée
      sante: 'prevention',        // hypothèse : à terre, aucun incident trouvé
      energie: 'continu',         // sourcé : filtres et recirculation en continu
    },
  },
  frea: {
    label: 'FREA', species: 'truite',
    choices: {
      echelle: 'nationale',       // sourcé : plus de 2 000 t par an (déclaré)
      rejets: 'circuitFerme',     // sourcé : « fully recirculated »
      alimentation: 'farine',     // hypothèse : composition non publiée
      sante: 'prevention',        // hypothèse : à terre, aucun incident trouvé
      energie: 'continu',         // sourcé : circuit recirculé
    },
  },
  atlanticSapphire: {
    label: 'Atlantic Sapphire', species: 'saumon',
    choices: {
      echelle: 'nationale',       // sourcé : 5 096 t récoltées en 2025
      rejets: 'circuitFerme',     // sourcé : RAS, eaux injectées en puits profond
      alimentation: 'soja',       // hypothèse : aliment mixte marin et végétal, huile d'algue
      sante: 'soinsMecaniques',   // hypothèse : mortalités massives en 2021
      energie: 'artificiel',      // sourcé : bâtiment, eau refroidie en permanence
    },
  },
}
