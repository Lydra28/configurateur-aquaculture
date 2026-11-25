/**
 * Tests de la qualité adaptative : on simule des machines (temps d'image en
 * fonction du cran de qualité) et on vérifie où l'échelle se stabilise.
 *
 * Lancement : `npm test` (node:test, aucune dépendance).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

globalThis.devicePixelRatio = 1.5
globalThis.innerWidth = 1707
globalThis.innerHeight = 960
globalThis.document = { hidden: false }

const { AdaptiveResolution } = await import('../src/render/AdaptiveResolution.js')

function makeResolution() {
  const split = {
    samples: 4,
    setSize() {},
    setSamples(n) { this.samples = n },
  }
  const sink = { setPixelRatio() {} }
  return new AdaptiveResolution(sink, sink, split)
}

const levelOf = (r) => `${r.pixelRatio}/${r.samples}`

/** Fait tourner `seconds` de simulation ; `frameTimeOf(resolution, elapsed)` = temps d'image (s). */
function run(resolution, frameTimeOf, seconds, elapsed = 0) {
  const changes = []
  const end = elapsed + seconds
  while (elapsed < end) {
    const dt = frameTimeOf(resolution, elapsed)
    elapsed += dt
    const before = levelOf(resolution)
    resolution.update(Math.min(dt, 1 / 20), elapsed)
    if (levelOf(resolution) !== before) changes.push({ at: elapsed, level: levelOf(resolution) })
  }
  return { changes, elapsed }
}

// Machine de Romain, mesurée le 25/11/2026 en 2560×1440 (ms par image).
const MEASURED = { '1.5/4': 21.8, '1.5/2': 18.7, '1.25/2': 13.6, '1/2': 10.4, '1/0': 6.3 }
const cost = (r, factor = 1) => (MEASURED[levelOf(r)] * factor) / 1000
const romain = (r) => cost(r)

test('machine à 46 images/s : descend au premier cran fluide et s\'y tient', () => {
  const r = makeResolution()
  const first = run(r, romain, 30)
  assert.equal(levelOf(r), '1.25/2')
  assert.ok(first.changes.at(-1).at < 15, 'la descente doit aboutir en moins de 15 s')

  // Sur 10 minutes de plus : deux essais de remontée au plus, puis plus rien.
  const later = run(r, romain, 600, first.elapsed)
  assert.equal(levelOf(r), '1.25/2')
  assert.ok(later.changes.length <= 4, `yo-yo : ${later.changes.length} changements de cran`)
  const last = later.changes.at(-1)
  assert.ok(!last || last.at < first.elapsed + 300, 'plus aucun essai après 5 minutes')
})

test('même machine avec synchro verticale à 60 Hz (temps d\'image par paliers)', () => {
  const r = makeResolution()
  const vsync = (res) => Math.ceil(cost(res) / (1 / 60) - 1e-9) / 60
  run(r, vsync, 30)
  assert.equal(levelOf(r), '1.25/2')
  const later = run(r, vsync, 900, 30)
  assert.equal(levelOf(r), '1.25/2')
  assert.ok(later.changes.length <= 4, `yo-yo : ${later.changes.length} changements de cran`)
})

test('machine rapide : la qualité ne bouge pas', () => {
  const r = makeResolution()
  const { changes } = run(r, () => 1 / 120, 120)
  assert.equal(changes.length, 0)
  assert.equal(levelOf(r), '1.5/4')
})

test('écran bridé à 50 Hz : la descente ne sert à rien, la qualité est rendue et y reste', () => {
  const r = makeResolution()
  run(r, () => 1 / 50, 60)
  assert.equal(levelOf(r), '1.5/4')
  const { changes } = run(r, () => 1 / 50, 300, 60)
  assert.equal(changes.length, 0)
})

test('GPU lent sur écran 50 Hz : s\'arrête au cran le plus haut qui atteint le palier', () => {
  const r = makeResolution()
  const capped = (res) => Math.max(1 / 50, cost(res, 1.4))
  run(r, capped, 60)
  assert.equal(levelOf(r), '1.25/2')
  const { changes } = run(r, capped, 300, 60)
  assert.equal(changes.length, 0)
})

test('machine très faible : reste en bas, sans rendre la qualité', () => {
  const r = makeResolution()
  run(r, (res) => cost(res, 4), 60)
  assert.equal(levelOf(r), '1/0')
  // Mesure saturée (plus de 50 ms à tous les crans) : on reste en bas aussi.
  const s = makeResolution()
  run(s, (res) => cost(res, 12), 150) // à 4 images/s, chaque cran prend ~20 s à juger
  assert.equal(levelOf(s), '1/0')
})

test('démarrage laborieux puis machine à l\'aise : la qualité remonte jusqu\'en haut', () => {
  const r = makeResolution()
  const { elapsed } = run(r, (res) => cost(res, 4), 40)
  assert.equal(levelOf(r), '1/0')
  run(r, () => 1 / 120, 400, elapsed)
  assert.equal(levelOf(r), '1.5/4')
})

test('un essai de remontée raté compte une fois, même suivi de plusieurs descentes', () => {
  const r = makeResolution()
  const { elapsed } = run(r, romain, 30)
  assert.equal(levelOf(r), '1.25/2')
  // La charge monte au moment de la remontée : il faudra descendre deux crans.
  let loaded = false
  const { changes } = run(r, (res) => {
    if (levelOf(res) === '1.5/2') loaded = true
    return cost(res, loaded ? 1.6 : 1)
  }, 60, elapsed)
  assert.deepEqual(changes.map((c) => c.level), ['1.5/2', '1.25/2', '1/2'])
  assert.equal(r._failedClimbs, 1)
  r.rearm()
  assert.equal(r._failedClimbs, 0)
})

test('redimensionnement : réarme si la surface change vraiment, pas sinon', () => {
  const r = makeResolution()
  run(r, () => 1 / 50, 60) // écran 50 Hz : palier accepté en pleine qualité
  assert.ok(r._settled > 0)
  for (let i = 0; i < 20; i++) r.onResize() // rafale sans changement de taille
  innerHeight = 930 // barre d'adresse qui se replie : −3 %
  r.onResize()
  assert.ok(r._settled > 0, 'un petit changement ne relance rien')
  innerHeight = 600
  r.onResize()
  assert.equal(r._settled, 0)
  innerHeight = 960
})

test('échauffement et onglet masqué : ignorés, retour d\'onglet compris', () => {
  const r = makeResolution()
  run(r, () => 1 / 20, 4) // 4 s très lentes, avant la fin de l'échauffement (5 s)
  assert.equal(levelOf(r), '1.5/4')
  const { elapsed } = run(r, () => 1 / 60, 10, 5)
  const average = r.frameTime
  document.hidden = true
  run(r, () => 1 / 20, 60, elapsed)
  document.hidden = false
  r.update(1 / 20, elapsed + 61) // première image au retour : son dt ne mesure rien
  assert.equal(r.frameTime, average)
  assert.equal(levelOf(r), '1.5/4')
})
