import './configurator.css'
import { PRESETS, projectCriteria } from '../state/scenario.js'

/**
 * UI de l'ÉCRAN F — le panneau de configuration et le panneau impact,
 * fidèles à la maquette Figma « à valider — dev-ready », câblés sur
 * NEMO.scenario. Vanilla JS : le DOM est construit une fois, seuls le
 * score, les jauges et les états sélectionnés changent ensuite.
 *
 * Textes : wording-parcours.md fait foi pour les libellés (titres de
 * question), composantes.md pour les textes d'aide (effets visuels),
 * la maquette pour les pills de rubrique. Décisions Romain : pas de
 * champ recherche en V1 ; « Consulter le score final » déplie le panneau
 * impact ; sens du score = PRÉSERVATION (libellé du panneau adapté :
 * niveaux Préservé / Fragile / Dégradé, seuils 70+ / 40-69 / <40).
 */

/* Icônes exportées de la maquette (assets Figma, inlinés au build) */
const ICONS = {
  radio: `<svg viewBox="0 0 19 19" fill="none"><path d="M14.5 0.5H4.5C2.29086 0.5 0.5 2.29086 0.5 4.5V14.5C0.5 16.7091 2.29086 18.5 4.5 18.5H14.5C16.7091 18.5 18.5 16.7091 18.5 14.5V4.5C18.5 2.29086 16.7091 0.5 14.5 0.5Z" stroke="white"/><path class="dot" d="M11.5 5.5H7.5C6.39543 5.5 5.5 6.39543 5.5 7.5V11.5C5.5 12.6046 6.39543 13.5 7.5 13.5H11.5C12.6046 13.5 13.5 12.6046 13.5 11.5V7.5C13.5 6.39543 12.6046 5.5 11.5 5.5Z" fill="white"/></svg>`,
  position: `<svg width="12" height="12" viewBox="0 0 12.9 12.9" fill="none"><g stroke="white" stroke-opacity="0.7" stroke-width="0.94"><circle cx="6.45" cy="5.2" r="2.1"/><path d="M6.45 12.2C6.45 12.2 11.2 8.6 11.2 5.2C11.2 2.6 9.1 0.5 6.45 0.5C3.8 0.5 1.7 2.6 1.7 5.2C1.7 8.6 6.45 12.2 6.45 12.2Z"/></g></svg>`,
  aliment: `<svg width="12" height="11" viewBox="0 0 12.94 11.29" fill="none"><g stroke="white" stroke-opacity="0.7" stroke-width="0.9375" stroke-linecap="square"><path d="M2.12 0.77H4.22V2.87H2.12V0.77ZM5.72 3.32H7.82V5.42H5.72V3.32ZM9.02 0.47H11.12V2.57H9.02V0.47Z"/><path d="M0.47 10.82H12.47M3.17 8.12H6.02M7.97 8.12H10.82"/></g></svg>`,
  chevron: `<svg width="13" height="8" viewBox="0 0 12.7 7.06" fill="none"><path d="M0.35 0.35L6.35 6.35L12.35 0.35" stroke="white" stroke-opacity="0.45"/></svg>`,
}

/* Contenu — wording-parcours.md (libellés) + composantes.md (aides) */
const SECTIONS = [
  {
    key: 'echelle', pill: 'Échelle de production', icon: 'aliment',
    question: 'Combien de poissons produisez-vous ?',
    options: [
      { id: 'locale', label: 'Échelle régionale ou locale : quelques tonnes par an', help: 'Un seul petit bassin/filet, faible densité de poissons.' },
      { id: 'nationale', label: 'Échelle nationale : quelques milliers de tonnes par an', help: 'Plusieurs bassins/filets, densité modérée.' },
      { id: 'continentale', label: 'Échelle continentale : plusieurs milliers de tonnes par an', help: 'Filets/bassins multiples occupant une large zone, très forte densité de poissons.' },
    ],
  },
  {
    key: 'methode', pill: "Méthode d'élevage", icon: 'aliment',
    question: 'Où et comment vivent vos poissons ?',
    options: [
      { id: 'cagesOuvertes', label: 'En pleine mer, dans des cages ouvertes', help: "Filets visibles en pleine eau, eau trouble autour des cages (particules de nourriture/déchets)." },
      { id: 'eauRejetee', label: "Sur terre, avec de l'eau puisée puis rejetée en continu", help: "Rejet visible en continu, légère baisse d'opacité près du point de rejet." },
      { id: 'eauBoucle', label: "Sur terre, avec de l'eau filtrée et réutilisée en boucle", help: "Peu d'effet visible dans le milieu ouvert, eau alentour presque inchangée." },
    ],
  },
  {
    key: 'alimentation', pill: 'Alimentation', icon: 'aliment',
    question: 'Que mangent vos poissons ?',
    options: [
      { id: 'farine', label: 'Farine de poisson sauvage', help: 'Nourriture non consommée qui se dépose au fond, particules organiques visibles.' },
      { id: 'soja', label: 'Alimentation végétale (soja)', help: "Résidus qui enrichissent l'eau en nutriments, léger début de prolifération d'algues." },
      { id: 'insectes', label: "Alimentation à base d'insectes ou d'algues", help: 'Peu de résidus, eau et algues presque inchangées.' },
    ],
  },
  {
    key: 'eauxUsees', pill: 'État des eaux', icon: 'aliment',
    question: 'Où vont les eaux usées de votre exploitation ?',
    options: [
      { id: 'rejetDirect', label: 'Rejetée directement dans la nature', help: 'Eau qui se trouble et change de couleur, particules visibles.' },
      { id: 'traitee', label: 'Traitée, puis rejetée localement', help: "Légère baisse d'opacité, teinte presque inchangée." },
      { id: 'enfouie', label: 'Enfouie très profondément dans le sol', help: 'Eau de surface quasi inchangée localement.' },
    ],
  },
  {
    key: 'energie', pill: 'Fonctionnement du site', icon: 'aliment',
    question: 'De quoi votre site a-t-il besoin pour fonctionner ?',
    options: [
      { id: 'peuMachines', label: 'Peu de machines', help: 'Algues en bon état, pas de changement thermique visible.' },
      { id: 'continu', label: 'Des machines en fonctionnement continu', help: 'Algues légèrement affectées, début de prolifération.' },
      { id: 'artificiel', label: 'Un fonctionnement presque entièrement artificiel', help: "Prolifération ou dépérissement visible des algues, changement net de couleur de l'eau." },
    ],
  },
]

/* Cartes des fermes réelles — scores du barème composantes.md */
const PROFILE_CARDS = [
  { key: 'esturgeonniere', title: "L'Esturgeonnière", subtitle: 'Esturgeons · bassins à terre' },
  { key: 'frea', title: 'FREA', subtitle: 'Truites · circuit fermé' },
  { key: 'atlanticSapphire', title: 'Atlantic Sapphire', subtitle: 'Saumons · circuit fermé' },
]

/** Niveau (sens préservation) — seuils du wording : 70+ / 40-69 / <40. */
function tierLabel(score) {
  if (score >= 70) return 'Préservé'
  if (score >= 40) return 'Fragile'
  return 'Dégradé'
}

function presetScore(key) {
  return Object.entries(PRESETS[key].choices).reduce((sum, [componentKey, optionId]) =>
    sum + (window.NEMO.scenario.resolve({ [componentKey]: optionId }).score), 0)
}

export function mountConfigurator() {
  const scenario = window.NEMO.scenario
  document.body.classList.add('configurator-active')

  /* ---- panneau de configuration ---------------------------------- */
  const panel = document.createElement('aside')
  panel.id = 'cfg-panel'
  panel.className = 'cfg-surface'
  panel.setAttribute('aria-label', 'Configurateur d’exploitation aquacole')

  const sectionsHtml = SECTIONS.map((section) => `
    <hr class="cfg-separator">
    <section data-component="${section.key}">
      <span class="cfg-pill">${ICONS[section.icon]}${section.pill}</span>
      <h2 class="cfg-question">${section.question}</h2>
      <div class="cfg-options" role="radiogroup" aria-label="${section.question}">
        ${section.options.map((option) => `
          <button type="button" class="cfg-option" role="radio" aria-checked="false"
                  data-component="${section.key}" data-option="${option.id}">
            <span class="cfg-option-indicator">${ICONS.radio}</span>
            <span>
              <p class="cfg-option-label">${option.label}</p>
              <p class="cfg-option-help">${option.help}</p>
            </span>
          </button>`).join('')}
      </div>
    </section>`).join('')

  panel.innerHTML = `
    <p class="cfg-overline">Configurateur</p>
    <h1 class="cfg-title">Composez votre exploitation</h1>
    <p class="cfg-subtitle">Chaque choix laisse une trace sous la surface. Composez la ferme, puis descendez voir ce qu'elle produit.</p>
    <hr class="cfg-separator">
    <section>
      <span class="cfg-pill">${ICONS.position}Profils existants</span>
      <h2 class="cfg-question">Ou partez d'une ferme réelle</h2>
      <div class="cfg-profiles">
        ${PROFILE_CARDS.map((card) => `
          <button type="button" class="cfg-card" data-preset="${card.key}">
            <span>
              <p class="cfg-card-title">${card.title}</p>
              <p class="cfg-card-subtitle">${card.subtitle}</p>
            </span>
            <span>
              <span class="cfg-card-score" data-card-score></span>
              <span class="cfg-card-gauge" data-card-gauge>${'<span></span>'.repeat(5)}</span>
            </span>
          </button>`).join('')}
      </div>
    </section>
    ${sectionsHtml}
    <div class="cfg-actions">
      <button type="button" class="cfg-button secondary" data-action="reset">Réinitialiser mes choix</button>
      <button type="button" class="cfg-button primary" data-action="score">Consulter le score final</button>
    </div>`
  document.body.appendChild(panel)

  // scores réels des cartes profils — jauge Figma : paliers ATTEINTS en
  // dégradé croissant (18/32/50/72 %), non-atteints éteints (12 %)
  const CARD_STEPS = [0.18, 0.32, 0.5, 0.72]
  panel.querySelectorAll('.cfg-card').forEach((card) => {
    const score = presetScore(card.dataset.preset)
    card.querySelector('[data-card-score]').innerHTML =
      `${score}<small>/100 · ${tierLabel(score)}</small>`
    const reached = Math.max(1, Math.ceil(score / 20))
    card.querySelectorAll('[data-card-gauge] span').forEach((segment, i) => {
      // dégradé réparti sur les paliers atteints, culminant à 72 %
      const t = reached > 1 ? i / (reached - 1) : 1
      segment.style.backgroundColor = i < reached
        ? `rgba(255,255,255,${(CARD_STEPS[0] + t * (0.72 - CARD_STEPS[0])).toFixed(2)})`
        : 'rgba(255,255,255,0.12)'
    })
  })

  /* ---- panneau impact --------------------------------------------- */
  const impact = document.createElement('aside')
  impact.id = 'impact-panel'
  impact.className = 'cfg-surface is-collapsed'
  impact.innerHTML = `
    <button type="button" class="impact-header" aria-expanded="false">
      <span class="impact-header-left">
        <span class="impact-chevron">${ICONS.chevron}</span>
        <span class="cfg-overline">État estimé de l'écosystème</span>
      </span>
      <span class="impact-mini-score"><span class="odo" data-mini-score>—</span><small>/100</small></span>
    </button>
    <div class="impact-body">
      <div class="impact-score-row">
        <span class="impact-score"><span class="odo" data-score>—</span><small>/100</small></span>
        <span class="impact-tier" data-tier></span>
      </div>
      <div class="impact-gauge">${'<span></span>'.repeat(5)}</div>
      <div class="impact-scale"><span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span></div>
      <div class="impact-detail-header">
        <span class="cfg-overline">Détail de la notation</span>
        <span class="right">pondéré sur 100</span>
      </div>
      <div data-criteria>
        ${projectCriteria({}).map((criterion) => `
          <div class="impact-line" data-criterion="${criterion.key}">
            <div class="impact-line-row">
              <span>${criterion.label}</span>
              <span class="value">0/${criterion.max}</span>
            </div>
            <div class="impact-line-track">
              <div class="impact-line-fill" style="width:0%"></div>
            </div>
          </div>`).join('')}
      </div>
    </div>`
  document.body.appendChild(impact)

  /** Odomètre façon réveil : une colonne 0-9 par chiffre, qui roule. */
  function odometer(container, value) {
    if (value === null) { container.textContent = '—'; container._odo = null; return }
    const digits = String(value).split('')
    if (!container._odo || container._odo.length !== digits.length) {
      container.innerHTML = digits.map(() =>
        `<span class="odo-digit"><span class="odo-reel">0123456789</span></span>`).join('')
      container._odo = [...container.querySelectorAll('.odo-reel')]
      // colonne par chiffre : "0123456789" empilé par le CSS (letter par ligne)
      container._odo.forEach((reel) => { reel.innerHTML = '0123456789'.split('').map((d) => `<i>${d}</i>`).join('') })
    }
    container._odo.forEach((reel, i) => {
      // crans de 1.3em (voir CSS), recentrage du chiffre dans la fenêtre 1em
      reel.style.transform = `translateY(${(-Number(digits[i]) * 1.3 - 0.15).toFixed(2)}em)`
    })
  }

  const header = impact.querySelector('.impact-header')
  const setCollapsed = (collapsed) => {
    impact.classList.toggle('is-collapsed', collapsed)
    header.setAttribute('aria-expanded', String(!collapsed))
  }
  header.addEventListener('click', () => setCollapsed(!impact.classList.contains('is-collapsed')))

  /* ---- état + rendu (DOM stable : les barres GLISSENT, rien n'est
     reconstruit — condition des animations demandées) ----------------- */
  const scoreBox = impact.querySelector('[data-score]')
  const miniBox = impact.querySelector('[data-mini-score]')
  const gaugeSegments = [...impact.querySelectorAll('.impact-gauge span')]
  const criteriaLines = new Map([...impact.querySelectorAll('[data-criterion]')]
    .map((line) => [line.dataset.criterion, line]))
  // dégradé de FOND de la jauge, du plus sombre au plus clair (Figma) ;
  // le palier courant est boosté à 72 % + contour blanc
  const GAUGE_BASE = [0.08, 0.14, 0.22, 0.31, 0.45]
  let previousCriteria = new Map(projectCriteria({}).map((c) => [c.key, c.value]))
  const hotTimers = new Map()

  function render() {
    const choices = scenario.choices
    const done = Object.keys(choices).length
    const score = scenario.score

    // options + cartes
    panel.querySelectorAll('.cfg-option').forEach((option) => {
      const selected = choices[option.dataset.component] === option.dataset.option
      option.classList.toggle('is-selected', selected)
      option.setAttribute('aria-checked', String(selected))
    })
    const activePreset = Object.entries(PRESETS).find(([, preset]) =>
      Object.entries(preset.choices).every(([k, v]) => choices[k] === v))?.[0]
    panel.querySelectorAll('.cfg-card').forEach((card) =>
      card.classList.toggle('is-selected', card.dataset.preset === activePreset))

    // score en odomètre (— tant qu'aucun choix)
    odometer(scoreBox, done ? score : null)
    odometer(miniBox, done ? score : null)
    impact.querySelector('[data-tier]').textContent = done === 5 ? tierLabel(score) : done ? '…' : ''

    // jauge : dégradé de fond, palier courant contouré et boosté
    const currentStep = done ? Math.min(4, Math.floor(score / 20)) : -1
    gaugeSegments.forEach((segment, i) => {
      const isCurrent = i === currentStep
      segment.classList.toggle('active', isCurrent)
      segment.style.backgroundColor = `rgba(255,255,255,${isCurrent ? 0.72 : GAUGE_BASE[i]})`
    })

    // détail : mise à jour EN PLACE — la barre glisse, la ligne modifiée
    // s'illumine brièvement (highlight demandé)
    for (const criterion of projectCriteria(choices)) {
      const line = criteriaLines.get(criterion.key)
      line.querySelector('.value').textContent = `${criterion.value}/${criterion.max}`
      line.querySelector('.impact-line-fill').style.width =
        `${(criterion.value / criterion.max) * 100}%`
      if (previousCriteria.get(criterion.key) !== criterion.value) {
        line.classList.add('is-hot')
        clearTimeout(hotTimers.get(criterion.key))
        hotTimers.set(criterion.key, setTimeout(() => line.classList.remove('is-hot'), 1500))
      }
      previousCriteria.set(criterion.key, criterion.value)
    }
  }

  /* ---- interactions ------------------------------------------------ */
  panel.addEventListener('click', (event) => {
    const option = event.target.closest('.cfg-option')
    if (option) {
      scenario.set({ [option.dataset.component]: option.dataset.option })
      render()
      return
    }
    const card = event.target.closest('.cfg-card')
    if (card) {
      // re-clic sur le préréglage actif : désélection = remise à zéro
      if (card.classList.contains('is-selected')) {
        scenario.reset()
      } else {
        scenario.preset(card.dataset.preset)
        scenario.set({ species: PRESETS[card.dataset.preset].species })
      }
      render()
      return
    }
    const action = event.target.closest('[data-action]')
    if (action?.dataset.action === 'reset') {
      scenario.reset()
      render()
    }
    if (action?.dataset.action === 'score') setCollapsed(false)
  })

  render()
  return { render }
}
