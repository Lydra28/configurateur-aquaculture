import GUI from 'lil-gui'
import { WEEKS_PER_YEAR, DEFAULT_CONFIG, DEFAULT_TIMELINE } from '../state/ecosystem.js'

/**
 * Panneau de réglage. Deux blocs seulement, parce qu'il n'y a que deux
 * entrées dans le modèle : ce qu'on exploite, et depuis quand.
 * Se masque avec la touche H, et ne s'ouvre pas du tout si l'URL ne porte
 * pas `?debug` — la prod n'a pas à embarquer un panneau replié.
 */
export function createDebugPanel(store, { onReset } = {}) {
  if (!new URLSearchParams(location.search).has('debug')) return null

  const gui = new GUI({ title: 'NEMO — écosystème' })
  gui.domElement.style.zIndex = '20'

  const exploitation = gui.addFolder("Configurateur d'exploitation")
  const refresh = () => store.refresh()

  exploitation.add(store.config, 'areaHa', 1, 80, 1).name('Superficie (ha)').onChange(refresh)
  exploitation.add(store.config, 'stockDensity', 2, 45, 0.5).name('Densité (kg/m³)').onChange(refresh)
  exploitation.add(store.config, 'feedConversion', 1, 2.6, 0.05).name('Indice de conversion').onChange(refresh)
  exploitation.add(store.config, 'treatments', 0, 1, 0.01).name('Traitements').onChange(refresh)
  exploitation.add(store.config, 'waterExchange', 0, 1, 0.01).name('Renouvellement').onChange(refresh)
  exploitation.add(store.config, 'mitigation', 0, 1, 0.01).name('Mesures correctives').onChange(refresh)
  exploitation.add(store.config, 'offshore', 0, 1, 0.01).name('Éloignement côte').onChange(refresh)

  const time = gui.addFolder('Timeline')
  const weekCtl = time.add(store.timeline, 'week', 0, WEEKS_PER_YEAR * 10, 1)
    .name('Semaine').onChange(refresh)
  time.add(store.timeline, 'timeOfDay', 0, 1, 0.005).name('Heure du jour').onChange(refresh)

  // Lecture automatique : c'est le mode de démonstration — on laisse tourner
  // et la dégradation se déroule toute seule sous les yeux.
  const playback = { playing: false, weeksPerSecond: 12 }
  time.add(playback, 'playing').name('Lecture')
  time.add(playback, 'weeksPerSecond', 1, 60, 1).name('Semaines / s')

  const scenarios = gui.addFolder('Scénarios')
  const presets = {
    'Extensif au large (IMTA)': { stockDensity: 6, feedConversion: 1.1, treatments: 0, waterExchange: 0.9, mitigation: 0.8, offshore: 0.8 },
    'Exploitation de référence': { ...DEFAULT_CONFIG },
    'Intensif en baie fermée': { stockDensity: 38, feedConversion: 2.2, treatments: 0.9, waterExchange: 0.15, mitigation: 0, offshore: 0 },
  }
  for (const [label, patch] of Object.entries(presets)) {
    scenarios.add({ go: () => { store.setConfig(patch); gui.controllersRecursive().forEach((c) => c.updateDisplay()) } }, 'go').name(label)
  }
  scenarios.add({
    reset: () => {
      store.setConfig({ ...DEFAULT_CONFIG })
      store.setTimeline({ ...DEFAULT_TIMELINE })
      gui.controllersRecursive().forEach((c) => c.updateDisplay())
      onReset?.()
    },
  }, 'reset').name('Réinitialiser')

  const readout = gui.addFolder('État du milieu').close()
  const view = { santé: 0, biodiversité: 0, turbidité: 0, oxygène: 0, sédiment: 0, bloom: 0 }
  const monitors = Object.keys(view).map((k) => readout.add(view, k).listen().disable())

  store.subscribe((d) => {
    view.santé = +d.health.toFixed(2)
    view.biodiversité = +d.biodiversity.toFixed(2)
    view.turbidité = +d.turbidity.toFixed(2)
    view.oxygène = +d.oxygen.toFixed(2)
    view.sédiment = +d.sediment.toFixed(2)
    view.bloom = +d.bloom.toFixed(2)
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') gui.show(gui._hidden)
  })

  return {
    gui,
    /** À appeler chaque frame pour la lecture automatique de la timeline. */
    tick(dt) {
      if (!playback.playing) return
      store.seek(store.timeline.week + playback.weeksPerSecond * dt)
      weekCtl.updateDisplay()
    },
    dispose() { gui.destroy(); monitors.length = 0 },
  }
}
