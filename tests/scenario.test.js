/**
 * Tests de cohérence du barème du configurateur (score d'impact /100).
 *
 * Ils verrouillent les RÈGLES, pas les valeurs : le groupe peut retoucher les
 * points et les canaux visuels de `scenario.js` tant que le récit reste vrai —
 * plus on choisit mal, plus le score monte et plus le milieu se dégrade.
 *
 * Lancement : `npm test` (node:test, aucune dépendance).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMPONENTS, PRESETS, CRITERIA, resolveScenario, projectCriteria, impactTier } from '../src/state/scenario.js'

const keys = Object.keys(COMPONENTS)
const sorted = (key) => Object.entries(COMPONENTS[key].options).sort((a, b) => a[1].impact - b[1].impact)
const best = Object.fromEntries(keys.map((k) => [k, sorted(k)[0][0]]))
const worst = Object.fromEntries(keys.map((k) => [k, sorted(k).at(-1)[0]]))

/** Dégradation du milieu vue par le décor : 0 = intact, plus grand = pire. */
const damage = ({ targets: t }) =>
  (1 - t.health) + (1 - t.biodiversity) + (1 - t.oxygen) + t.turbidity + t.sediment + t.bloom + t.waste

const everyFarm = []
const build = (i, choices) => {
  if (i === keys.length) { everyFarm.push(choices); return }
  for (const option of Object.keys(COMPONENTS[keys[i]].options)) build(i + 1, { ...choices, [keys[i]]: option })
}
build(0, {})

test('chaque composante va de 0 (au mieux) à 20 (au pire)', () => {
  for (const key of keys) {
    assert.equal(sorted(key)[0][1].impact, 0, `${key} : la meilleure option vaut 0`)
    assert.equal(sorted(key).at(-1)[1].impact, 20, `${key} : la pire option vaut 20`)
  }
})

test('tout au mieux = 0/100 et milieu intact ; tout au pire = 100/100', () => {
  const pristine = resolveScenario({})
  const allBest = resolveScenario(best)
  assert.equal(allBest.score, 0)
  // Hors taille de la ferme (cages, densité), la meilleure ferme ne change rien au décor.
  for (const canal of ['turbidity', 'sediment', 'bloom', 'health', 'biodiversity', 'oxygen', 'waste']) {
    assert.equal(allBest.targets[canal], pristine.targets[canal], canal)
  }
  assert.equal(resolveScenario(worst).score, 100)
  assert.equal(resolveScenario(worst).scoreMax, 100)
})

test('aucune option à 0 point n’a d’effet visuel', () => {
  for (const key of keys) {
    for (const [name, option] of Object.entries(COMPONENTS[key].options)) {
      if (option.impact !== 0) continue
      for (const canal of ['turb', 'sed', 'bloom', 'stress', 'waste']) {
        assert.equal(option[canal] ?? 0, 0, `${key} = ${name} : ${canal}`)
      }
    }
  }
})

test('niveaux : 0-30 Préservé, 31-60 Fragile, 61+ Dégradé', () => {
  assert.deepEqual([0, 30, 31, 60, 61, 100].map(impactTier),
    ['Préservé', 'Préservé', 'Fragile', 'Fragile', 'Dégradé', 'Dégradé'])
})

// La taille de la ferme (cages, densité) est hors de `damage` : sans choix
// d'échelle, le décor d'arrivée garde ses 3 cages — exception assumée.
test('une composante non choisie vaut sa meilleure option', () => {
  for (const key of keys) {
    for (const option of Object.keys(COMPONENTS[key].options)) {
      const alone = resolveScenario({ [key]: option })
      const completed = resolveScenario({ ...best, [key]: option })
      assert.equal(alone.score, completed.score, `${key} = ${option}`)
      assert.ok(Math.abs(damage(alone) - damage(completed)) < 1e-9, `${key} = ${option}`)
    }
  }
})

test('aggraver un choix ne fait jamais baisser le score ni s\'améliorer le milieu', () => {
  for (const farm of everyFarm) {
    const before = resolveScenario(farm)
    for (const key of keys) {
      const ladder = sorted(key).map(([option]) => option)
      const next = ladder[ladder.indexOf(farm[key]) + 1]
      if (!next) continue
      const after = resolveScenario({ ...farm, [key]: next })
      assert.ok(after.score > before.score, `${JSON.stringify(farm)} → ${key} = ${next}`)
      assert.ok(damage(after) >= damage(before) - 1e-9, `${JSON.stringify(farm)} → ${key} = ${next}`)
    }
  }
})

test('une ferme réelle pèse au moins autant que chacune de ses variables seule', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    const farm = resolveScenario(preset.choices)
    for (const [key, option] of Object.entries(preset.choices)) {
      const alone = resolveScenario({ [key]: option })
      assert.ok(farm.score >= alone.score, `${name} / ${key}`)
      assert.ok(damage(farm) >= damage(alone) - 1e-9, `${name} / ${key}`)
    }
  }
})

test('le score suit ce que montre le décor, sur les 243 fermes possibles', () => {
  const xs = everyFarm.map((farm) => resolveScenario(farm).score)
  const ys = everyFarm.map((farm) => damage(resolveScenario(farm)))
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length
  const mx = mean(xs), my = mean(ys)
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  const correlation = cov / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0))
  assert.ok(correlation > 0.9, `corrélation score / décor : ${correlation.toFixed(2)}`)
})

test('le détail par critère somme exactement au score, sans dépasser les plafonds', () => {
  for (const farm of everyFarm) {
    const detail = projectCriteria(farm)
    assert.equal(detail.reduce((sum, c) => sum + c.value, 0), resolveScenario(farm).score)
    for (const c of detail) assert.ok(c.value >= 0 && c.value <= c.max, `${c.key} = ${c.value}/${c.max}`)
  }
  assert.deepEqual(projectCriteria(worst).map((c) => c.value), CRITERIA.map((c) => c.max))
})
