import { clamp } from '../core/math.js'
import { TURBIDITY_BASE, TURBIDITY_CAP } from './scenario.js'

/**
 * Pose l'impact du configurateur SUR l'état du milieu fourni par le store, au
 * lieu de le remplacer.
 *
 * Avant, le premier choix faisait sauter le décor de l'état d'arrivée validé
 * (biodiversité ≈ 0,8, eau un peu chargée) à un état idéal (1,0, eau claire) :
 * choisir la meilleure option éclaircissait la mer, et le vivant — réglé pour
 * paraître plein à 0,8 — ne réagissait à aucune variable seule.
 *
 * Désormais « aucun impact » = le décor d'arrivée, exactement. Les pressions
 * s'ajoutent (turbidité, dépôt, algues) et le vivant se multiplie (santé,
 * biodiversité, oxygène) : chaque point d'impact se voit dès le premier.
 */
export function composeImpact(base, scenario) {
  const merged = { ...base, ...scenario }
  // Le plafond ne s'applique qu'à ce que le configurateur ajoute : un état
  // de base déjà plus trouble (autre saison, panneau debug) passe tel quel.
  merged.turbidity = clamp(base.turbidity + scenario.turbidity - TURBIDITY_BASE, 0, Math.max(TURBIDITY_CAP, base.turbidity))
  merged.sediment = clamp(base.sediment + scenario.sediment, 0, 1)
  merged.bloom = clamp(base.bloom + scenario.bloom, 0, 1)
  merged.nutrientLevel = clamp(base.nutrientLevel + scenario.nutrientLevel, 0, 1)
  merged.health = base.health * scenario.health
  merged.biodiversity = base.biodiversity * scenario.biodiversity
  merged.oxygen = base.oxygen * scenario.oxygen
  return merged
}
