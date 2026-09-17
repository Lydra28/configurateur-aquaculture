/**
 * Tests de non-régression du modèle d'écosystème.
 *
 * `derive` est une fonction pure : ces tests verrouillent la FORME des courbes
 * (le propos du configurateur), pas les coefficients exacts — on pourra donc
 * remplacer les valeurs par celles d'un organisme scientifique sans réécrire
 * les tests, tant que le récit reste vrai.
 *
 * Lancement : `npm test` (node:test, aucune dépendance).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { derive, DEFAULT_CONFIG, DEFAULT_TIMELINE, WEEKS_PER_YEAR } from '../src/state/ecosystem.js'

const EXTENSIVE = {
  ...DEFAULT_CONFIG,
  stockDensity: 6, feedConversion: 1.1, treatments: 0,
  waterExchange: 0.9, mitigation: 0.8, offshore: 0.8,
}
const INTENSIVE = {
  ...DEFAULT_CONFIG,
  stockDensity: 38, feedConversion: 2.2, treatments: 0.9,
  waterExchange: 0.15, mitigation: 0, offshore: 0,
}

const at = (config, week) => derive(config, { ...DEFAULT_TIMELINE, week })

test('derive est déterministe (fonction pure, scrubbable dans les deux sens)', () => {
  const a = at(DEFAULT_CONFIG, 312)
  const b = at(DEFAULT_CONFIG, 312)
  assert.deepEqual(a, b)
})

test('les sorties restent bornées [0, 1] sur des configs extrêmes', () => {
  const bounded = ['health', 'biodiversity', 'oxygen', 'turbidity', 'nutrientLevel',
    'sediment', 'chemical', 'bloom', 'surfaceScum', 'algaeHue']
  for (const config of [EXTENSIVE, INTENSIVE, { ...INTENSIVE, areaHa: 80 }]) {
    for (const week of [0, 1, 26, 260, 1040]) {
      const s = at(config, week)
      for (const key of bounded) {
        assert.ok(s[key] >= 0 && s[key] <= 1, `${key}=${s[key]} hors bornes (semaine ${week})`)
      }
    }
  }
})

test('le cœur du propos : l\'intensif en baie fermée s\'effondre, l\'extensif au large tient', () => {
  const year5 = WEEKS_PER_YEAR * 5
  const intensive = at(INTENSIVE, year5)
  const extensive = at(EXTENSIVE, year5)
  assert.ok(intensive.health < 0.35, `santé intensive attendue basse, obtenu ${intensive.health}`)
  assert.ok(extensive.health > 0.65, `santé extensive attendue haute, obtenu ${extensive.health}`)
  assert.ok(extensive.biodiversity > intensive.biodiversity + 0.3)
})

test('le dépôt organique est cumulatif : il ne redescend jamais', () => {
  let previous = -1
  for (let week = 0; week <= WEEKS_PER_YEAR * 8; week += 4) {
    const { sediment } = at(INTENSIVE, week)
    assert.ok(sediment >= previous - 1e-9, `sédiment décroît à la semaine ${week}`)
    previous = sediment
  }
})

test('le bloom attend l\'eau chaude : fin d\'été >> hiver, à charge de nutriments égale', () => {
  // Année 3, même config : seule la saison change.
  const lateSummer = at(INTENSIVE, WEEKS_PER_YEAR * 3 + 23) // phase ~0.44
  const winter = at(INTENSIVE, WEEKS_PER_YEAR * 3 + 44)     // phase ~0.85
  assert.ok(lateSummer.temperature > winter.temperature)
  assert.ok(lateSummer.bloom > winter.bloom * 1.5,
    `bloom été ${lateSummer.bloom} vs hiver ${winter.bloom}`)
})

test('la mitigation et la dispersion réduisent réellement la pression', () => {
  const week = WEEKS_PER_YEAR * 4
  const raw = at(INTENSIVE, week)
  const mitigated = at({ ...INTENSIVE, mitigation: 0.8 }, week)
  const dispersed = at({ ...INTENSIVE, waterExchange: 0.9, offshore: 0.8 }, week)
  assert.ok(mitigated.health > raw.health)
  assert.ok(dispersed.health > raw.health)
})
