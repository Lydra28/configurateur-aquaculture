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
import { COMPONENTS, PRESETS, CRITERIA, TURBIDITY_BASE, TURBIDITY_CAP, resolveScenario, projectCriteria, impactTier } from '../src/state/scenario.js'
import { SCALE, LEAK, interplay } from '../src/state/interplay.js'

const keys = Object.keys(COMPONENTS)
const sorted = (key) => Object.entries(COMPONENTS[key].options).sort((a, b) => a[1].impact - b[1].impact)
const best = Object.fromEntries(keys.map((k) => [k, sorted(k)[0][0]]))
const worst = Object.fromEntries(keys.map((k) => [k, sorted(k).at(-1)[0]]))

/**
 * Dégradation du milieu telle qu'elle se VOIT : 0 = intact, plus grand = pire.
 * Poids mesurés à l'écran le 26/11/2026 (écart de couleur et de contraste de
 * la vue immergée avec le décor d'arrivée) et ajustés sur les cinq pires
 * options : la turbidité ~108 par unité, les algues ~75 ; la vase, que le
 * voile de l'eau cache, ~3. Le recul du vivant (méduses, kelp, bancs) et les
 * granulés se mesurent mal par la couleur : leurs poids sont une estimation.
 * Un indice à poids égaux passait les tests alors qu'une seule variable sur
 * cinq se voyait.
 */
const damage = ({ targets: t }) =>
  108 * t.turbidity + 75 * t.bloom + 3 * t.sediment + 10 * (1 - t.health) + 2 * t.waste

const everyFarm = []
const build = (i, choices) => {
  if (i === keys.length) { everyFarm.push(choices); return }
  for (const option of Object.keys(COMPONENTS[keys[i]].options)) build(i + 1, { ...choices, [keys[i]]: option })
}
build(0, {})

test('chaque composante va de peu (au mieux) à 20 (au pire) : aucune option gratuite', () => {
  for (const key of keys) {
    const least = sorted(key)[0][1].impact
    assert.ok(least >= 1 && least <= 4, `${key} : la meilleure option vaut ${least}`)
    assert.equal(sorted(key).at(-1)[1].impact, 20, `${key} : la pire option vaut 20`)
  }
})

test('la meilleure option vaut 2 points et un dixième de l\u2019effet de la pire', () => {
  for (const key of keys) {
    const least = sorted(key)[0][1]
    const most = sorted(key).at(-1)[1]
    assert.equal(least.impact, 2, key)
    for (const canal of ['turb', 'sed', 'bloom', 'stress', 'waste']) {
      assert.ok(Math.abs((least[canal] ?? 0) - (most[canal] ?? 0) / 10) < 1e-9, `${key} : ${canal}`)
    }
  }
})

test('aucun choix = 0/100 ; la meilleure ferme pèse peu, mais pas rien ; tout au pire = 100/100', () => {
  const pristine = resolveScenario({})
  const allBest = resolveScenario(best)
  assert.equal(pristine.score, 0)
  assert.ok(allBest.score > 0 && allBest.score <= 15, `meilleure ferme : ${allBest.score}/100`)
  assert.equal(impactTier(allBest.score), 'Préservé')
  assert.ok(damage(allBest) > damage(pristine), 'la meilleure ferme laisse une trace')
  assert.equal(resolveScenario(worst).score, 100)
  assert.equal(resolveScenario(worst).scoreMax, 100)
})

test('aucune option sans effet : chacune, seule, dégrade un peu le milieu', () => {
  const pristine = damage(resolveScenario({}))
  for (const key of keys) {
    for (const [name, option] of Object.entries(COMPONENTS[key].options)) {
      assert.ok(option.impact > 0, `${key} = ${name} : ${option.impact} point`)
      assert.ok(damage(resolveScenario({ [key]: name })) > pristine, `${key} = ${name}`)
    }
  }
})

test('niveaux : 0-30 Préservé, 31-60 Fragile, 61+ Dégradé', () => {
  assert.deepEqual([0, 30, 31, 60, 61, 100].map(impactTier),
    ['Préservé', 'Préservé', 'Fragile', 'Fragile', 'Dégradé', 'Dégradé'])
})

// La taille de la ferme (cages, densité) est hors de `damage` : sans choix
// d'échelle, le décor d'arrivée garde ses 3 cages — exception assumée.
test('une composante non choisie ne compte pas et ne module rien', () => {
  for (const key of keys) {
    for (const [name, option] of Object.entries(COMPONENTS[key].options)) {
      const alone = resolveScenario({ [key]: name })
      assert.equal(alone.score, option.impact, `${key} = ${name}`)
      // Les variables absentes n'ajoutent rien au décor : seule l'option choisie agit.
      const own = (canal) => option[canal] ?? 0
      assert.ok(Math.abs(alone.targets.turbidity - TURBIDITY_BASE - own('turb')) < 1e-9, `${key} = ${name} : turbidité`)
      assert.ok(Math.abs(alone.targets.sediment - own('sed')) < 1e-9, `${key} = ${name} : vase`)
      assert.ok(Math.abs(alone.targets.bloom - own('bloom')) < 1e-9, `${key} = ${name} : algues`)
      assert.ok(Math.abs(alone.targets.waste - own('waste')) < 1e-9, `${key} = ${name} : granulés`)
    }
  }
})

test('les variables s\u2019influencent : petite échelle et élevage à terre allègent les autres', () => {
  // Facteurs : jamais d'aggravation (≤ 1), le pire choix ne module rien (= 1).
  for (const table of [SCALE, LEAK]) for (const v of Object.values(table)) assert.ok(v > 0 && v <= 1)
  assert.equal(SCALE[worst.echelle], 1)
  assert.equal(LEAK[worst.rejets], 1)
  assert.deepEqual(interplay({}), { echelle: 1, rejets: 1, alimentation: 1, sante: 1, energie: 1 })
  // Qui module qui, pour toutes les combinaisons d'échelle et d'élevage :
  // l'énergie pèse sur le climat, l'élevage à terre ne la retient pas.
  for (const [e, s] of Object.entries(SCALE)) {
    for (const [r, l] of Object.entries(LEAK)) {
      assert.deepEqual(interplay({ echelle: e, rejets: r }),
        { echelle: l, rejets: s, alimentation: s * l, sante: s * l, energie: s }, `${e} / ${r}`)
    }
  }
  assert.equal(interplay({ echelle: 'constructor', rejets: 'inconnu' }).alimentation, 1)

  for (const key of ['alimentation', 'sante']) {
    const alone = resolveScenario({ [key]: worst[key] })
    for (const [mitigator, table] of [['echelle', SCALE], ['rejets', LEAK]]) {
      const mitigated = resolveScenario({ [key]: worst[key], [mitigator]: best[mitigator] })
      // Le bon choix ajoute ses 2 points mais retire bien plus aux 20 de l'autre.
      assert.ok(mitigated.score < alone.score, `${key} + ${mitigator} : ${alone.score} → ${mitigated.score}`)
      assert.ok(damage(mitigated) < damage(alone), `${key} + ${mitigator} : le décor s'allège aussi`)
      assert.equal(mitigated.score, Math.round(20 * table[best[mitigator]] + 2), `${key} + ${mitigator}`)
    }
  }
  // Grande ferme en mer ouverte : rien n'est allégé, le score est la somme simple.
  for (const farm of everyFarm.filter((f) => f.echelle === worst.echelle && f.rejets === worst.rejets)) {
    const sum = keys.reduce((s, k) => s + COMPONENTS[k].options[farm[k]].impact, 0)
    assert.equal(resolveScenario(farm).score, sum)
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

// resolveScenario ignore une option inconnue (0 point, aucun effet) : une
// faute de frappe dans un préréglage fausserait la note d'une vraie ferme
// sans aucune erreur visible.
test('chaque ferme réelle choisit une option existante pour chaque composante', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    assert.deepEqual(Object.keys(preset.choices).sort(), [...keys].sort(), name)
    for (const [key, option] of Object.entries(preset.choices)) {
      assert.ok(COMPONENTS[key].options[option], `${name} / ${key} = ${option}`)
    }
  }
})

// Tolérance ±15 % autour de la moyenne : l'écart mesuré au réglage du
// 26/11/2026 était d'environ 2 % ; avant, il allait du simple au double (0,70 à 1,59 pour
// 20 points), ce que l'œil voit. 15 % laisse au groupe de quoi retoucher
// une option sans rouvrir ce déséquilibre.
test('à points égaux, dégât visible comparable (±15 %)', () => {
  const pristine = damage(resolveScenario({}))
  const perPoint = []
  for (const key of keys) {
    for (const [name, option] of Object.entries(COMPONENTS[key].options)) {
      if (option.impact === 0) continue
      perPoint.push([`${key} = ${name}`, (damage(resolveScenario({ [key]: name })) - pristine) / option.impact])
    }
  }
  const mean = perPoint.reduce((s, [, v]) => s + v, 0) / perPoint.length
  for (const [label, value] of perPoint) {
    assert.ok(Math.abs(value / mean - 1) <= 0.15, `${label} : ${(value / mean).toFixed(2)} × la moyenne`)
  }
})

// Un canal qui sature rend deux fermes de scores différents identiques à
// l'écran (avant le 26/11/2026 : 49 fermes sur 243 avaient la même eau).
test('même au pire, aucun canal ne bute sur son plafond (turbidité comprise)', () => {
  const sums = { turb: 0, sed: 0, bloom: 0, stress: 0, waste: 0 }
  for (const key of keys) {
    for (const canal of Object.keys(sums)) sums[canal] += COMPONENTS[key].options[worst[key]][canal] ?? 0
  }
  assert.ok(TURBIDITY_BASE + sums.turb < TURBIDITY_CAP, `turbidité au pire : ${(TURBIDITY_BASE + sums.turb).toFixed(2)}`)
  for (const canal of ['sed', 'bloom', 'stress', 'waste']) {
    assert.ok(sums[canal] < 1, `${canal} au pire : ${sums[canal].toFixed(2)}`)
  }
})

// Seules l'échelle et l'élevage allègent. Aliment, soins et énergie ne
// compensent rien : les ajouter ne peut que dégrader le milieu (le score
// arrondi peut rester égal quand la ferme est déjà très allégée).
test('ajouter un aliment, des soins ou une source d\u2019énergie pèse toujours', () => {
  for (const farm of everyFarm) {
    const withAll = resolveScenario(farm)
    for (const key of ['alimentation', 'sante', 'energie']) {
      const { [key]: removed, ...rest } = farm
      const without = resolveScenario(rest)
      assert.ok(withAll.score >= without.score, `${JSON.stringify(farm)} sans ${key}`)
      assert.ok(damage(withAll) > damage(without), `${JSON.stringify(farm)} sans ${key}`)
    }
  }
})

test('une ferme ne dépasse jamais la somme simple de ses points, et n\u2019est jamais à zéro', () => {
  for (const farm of everyFarm) {
    const sum = keys.reduce((s, k) => s + COMPONENTS[k].options[farm[k]].impact, 0)
    const { score } = resolveScenario(farm)
    assert.ok(score <= sum && score >= 1, `${JSON.stringify(farm)} : ${score} / somme ${sum}`)
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
