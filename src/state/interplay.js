/**
 * Les variables du configurateur ne s'additionnent pas simplement : deux
 * d'entre elles règlent ce que les autres pèsent VRAIMENT sur la mer.
 *
 * - L'ÉCHELLE amplifie : plus la ferme est grande, plus ses rejets, son
 *   aliment, ses traitements et son énergie comptent.
 * - L'ÉLEVAGE ET SES REJETS filtrent : à terre, ce que la ferme produit
 *   n'arrive qu'en partie à la mer — sa taille, son aliment et ses
 *   traitements y pèsent moins. L'énergie n'est pas retenue : son effet est
 *   climatique, pas local.
 *
 * Une variable non choisie ne module rien (facteur 1) : on ne suppose ni une
 * petite ferme ni un circuit fermé tant que le visiteur ne l'a pas dit. C'est
 * ce qui fait BAISSER le score quand il choisit ensuite une bonne option.
 *
 * Valeurs choisies par Claude le 26/11/2026 (demande de Romain : « il faut
 * que les variables influent les unes sur les autres ») — à valider.
 */
export const SCALE = { locale: 0.6, nationale: 0.8, continentale: 1 }
export const LEAK = { circuitFerme: 0.4, rejetFiltre: 0.7, cagesOuvertes: 1 }

/** Poids réel (0..1) de chaque variable, compte tenu des autres choix. */
export function interplay(choices = {}) {
  // hasOwn : une clé inconnue (ou héritée, comme « constructor ») ne module rien.
  const scale = Object.hasOwn(SCALE, choices.echelle ?? '') ? SCALE[choices.echelle] : 1
  const leak = Object.hasOwn(LEAK, choices.rejets ?? '') ? LEAK[choices.rejets] : 1
  return {
    echelle: leak,
    rejets: scale,
    alimentation: scale * leak,
    sante: scale * leak,
    energie: scale,
  }
}
