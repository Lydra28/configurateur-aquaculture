/**
 * Tests de la composition « état du milieu + impact du configurateur ».
 *
 * Lancement : `npm test` (node:test, aucune dépendance).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMPONENTS, TURBIDITY_CAP, resolveScenario } from '../src/state/scenario.js'
import { composeImpact } from '../src/state/impact.js'
import { derive, DEFAULT_CONFIG, DEFAULT_TIMELINE } from '../src/state/ecosystem.js'

// État d'arrivée du décor validé : celui du store par défaut, calculé, pas recopié.
const ARRIVAL = derive(DEFAULT_CONFIG, DEFAULT_TIMELINE)
const CHANNELS = ['turbidity', 'sediment', 'bloom', 'nutrientLevel', 'health', 'biodiversity', 'oxygen']
const keys = Object.keys(COMPONENTS)
const sorted = (key) => Object.entries(COMPONENTS[key].options).sort((a, b) => a[1].impact - b[1].impact)
const worst = Object.fromEntries(keys.map((k) => [k, sorted(k).at(-1)[0]]))

test('aucun impact = le décor d’arrivée, exactement', () => {
  const merged = composeImpact(ARRIVAL, resolveScenario({}).targets)
  for (const channel of CHANNELS) assert.ok(Math.abs(merged[channel] - ARRIVAL[channel]) < 1e-12, channel)
  assert.equal(merged.sunElevation, ARRIVAL.sunElevation) // le reste de l'état passe tel quel
  // Même avec un état de base plus trouble que le plafond du configurateur.
  const murky = { ...ARRIVAL, turbidity: 0.9 }
  assert.equal(composeImpact(murky, resolveScenario({}).targets).turbidity, 0.9)
})

test('chaque pire option, seule, dégrade le décor d’arrivée sans rien améliorer', () => {
  for (const key of keys) {
    const merged = composeImpact(ARRIVAL, resolveScenario({ [key]: worst[key] }).targets)
    for (const channel of ['turbidity', 'sediment', 'bloom']) assert.ok(merged[channel] >= ARRIVAL[channel], `${key} / ${channel}`)
    for (const channel of ['health', 'biodiversity', 'oxygen']) assert.ok(merged[channel] <= ARRIVAL[channel], `${key} / ${channel}`)
    // Chaque variable doit se VOIR seule (poids mesurés : turbidité 108, algues 75 ; seuil 10 ≈ dix fois le bruit).
    const visible = 108 * (merged.turbidity - ARRIVAL.turbidity) + 75 * (merged.bloom - ARRIVAL.bloom)
    assert.ok(visible >= 10, `${key} : ${visible.toFixed(1)}`)
  }
})

test('seuils du décor : rien ne change à l’arrivée', () => {
  // Underwater.js : l'eau ne verdit qu'au-delà de ALGAE_FLOOR (0,05), la vase ne s'épaissit qu'au-delà de 0,1.
  assert.ok(ARRIVAL.bloom < 0.05, `bloom à l'arrivée : ${ARRIVAL.bloom.toFixed(3)}`)
  assert.ok(ARRIVAL.sediment < 0.1, `sediment à l'arrivée : ${ARRIVAL.sediment.toFixed(3)}`)
  // KelpForest.js : forêt pleine à l'arrivée (alive × 1,05 ≥ 1), avec la formule du module.
  const clarity = Math.min(1, Math.max(0.05, 1 - ARRIVAL.turbidity))
  const alive = Math.pow(Math.min(1, Math.max(0, clarity * 1.2 - 0.1)) * Math.min(1, ARRIVAL.biodiversity * 1.3), 0.6)
  assert.equal(Math.round(9 * Math.min(1, alive * 1.05)), 9, `kelp à l'arrivée : alive ${alive.toFixed(3)}`)
})

test('tout au pire : valeurs bornées, eau sous le plafond de turbidité', () => {
  const merged = composeImpact(ARRIVAL, resolveScenario(worst).targets)
  for (const channel of CHANNELS) assert.ok(merged[channel] >= 0 && merged[channel] <= 1, `${channel} = ${merged[channel]}`)
  assert.ok(merged.turbidity < TURBIDITY_CAP, `turbidité au pire sur le décor d'arrivée : ${merged.turbidity.toFixed(3)}`)
})
