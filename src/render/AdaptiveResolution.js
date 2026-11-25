/**
 * Qualité adaptative : le rendu coûte deux passes par frame — sur une machine
 * à la peine, on descend la qualité cran par cran plutôt que de saccader.
 *
 * L'échelle des crans vient d'une mesure sur GPU intégré (AMD Radeon, 1080p) :
 * l'anticrénelage 4× ajoute ~6 ms par image, un cran de définition (0,25 de
 * ratio) en rend ~30 %. On sacrifie donc d'abord l'anticrénelage (4× → 2×),
 * puis la définition cran par cran, et en dernier recours l'anticrénelage à 0 ;
 * la remontée suit le chemin inverse.
 *
 * La cible est la FLUIDITÉ (~60 images/s) : sous ~54 images/s en moyenne on
 * descend. L'ancien seuil (32) laissait une machine à 46 images/s en pleine
 * qualité, saccadée — mesuré chez Romain en 2560×1440.
 *
 * Garde-fous, chacun né d'un vrai piège :
 * - l'ÉCHAUFFEMENT est ignoré : les premières secondes compilent les shaders
 *   et crèvent le budget sans rien dire des capacités réelles de la machine ;
 * - l'ONGLET MASQUÉ est ignoré, ainsi que la première image à son retour : le
 *   navigateur bride lui-même une page invisible, ce n'est pas de la lenteur ;
 * - la REMONTÉE existe (poissons pixelisés pour toute la session après un
 *   simple démarrage laborieux) : après une aisance franche on regagne un
 *   cran, chaque descente DOUBLE la patience exigée, un essai raté est annulé
 *   vite (probation), et deux essais ratés figent le plafond — pas de yo-yo ;
 * - arrivé EN BAS encore lent, on garde le cran le plus haut qui faisait
 *   aussi bien : si descendre n'a rien rapporté, ce n'est pas le GPU qui
 *   limite (écran à 50 Hz, navigateur bridé) et la qualité est rendue. On ne
 *   juge qu'en bas, pas cran par cran : avec la synchro verticale, un cran
 *   peut ne rien montrer tant qu'on n'a pas franchi un palier d'affichage.
 */

const SLOW = 1 / 54        // au-delà (en moyenne), on perd la fluidité
const FAST = 1 / 58        // en deçà, il y a de la marge
const PROBATION = 6        // secondes d'observation après une remontée
const FAILED_CLIMB = 20    // redescendre avant ce délai = essai raté
const WORTHWHILE = 0.93    // un cran doit rendre au moins 7 % du temps d'image
const SATURATED = 1 / 21   // le dt reçu est borné à 1/20 s : au-delà, on ne mesure plus

export class AdaptiveResolution {
  constructor(renderer, composer, split, { warmup = 5, maxSamples = 4 } = {}) {
    this.renderer = renderer
    this.composer = composer
    this.split = split
    this.max = Math.min(devicePixelRatio, 2)
    this.maxSamples = maxSamples
    this.warmup = warmup
    this.pixelRatio = this.max
    this.samples = split.samples
    this.frameTime = 1 / 60 // moyenne glissante du temps d'image
    this._paused = false
    this.rearm()
  }

  /**
   * Oublie ce que l'adaptation a conclu (plafond figé, palier accepté) : à
   * appeler quand les conditions changent — fenêtre redimensionnée ou passée
   * sur un autre écran, plafond d'anticrénelage modifié.
   */
  rearm() {
    this._pixels = innerWidth * innerHeight * devicePixelRatio ** 2
    this.max = Math.min(devicePixelRatio, 2)
    if (this.pixelRatio > this.max) this.apply(this.max)
    this.slowFrames = 0
    this.fastFrames = 0
    this.climbAfter = 600 // frames d'aisance exigées avant de remonter
    this._climbedAt = -Infinity
    this._failedClimbs = 0
    this._settled = 0 // temps d'image accepté faute de mieux (0 = aucun)
    this._trail = []  // crans quittés pendant la descente en cours, du plus haut au plus bas
  }

  /**
   * À appeler sur l'évènement resize : ne réarme que si la surface à rendre a
   * vraiment changé (plus de 10 %, ou autre densité d'écran) — une barre
   * d'adresse mobile qui se replie ne doit pas relancer toute l'adaptation.
   */
  onResize() {
    const pixels = innerWidth * innerHeight * devicePixelRatio ** 2
    if (Math.abs(pixels / this._pixels - 1) > 0.1) this.rearm()
  }

  /** Applique un cran partout où la qualité se décide (rendu + composite). */
  apply(pr, samples = this.samples) {
    this.pixelRatio = pr
    this.samples = samples
    this.renderer.setPixelRatio(pr)
    this.composer.setPixelRatio(pr)
    this.split.setSize(innerWidth, innerHeight, pr)
    this.split.setSamples(samples)
    return true
  }

  /** Plafond d'anticrénelage (panneau debug) : immédiat, et la remontée ne le dépasse pas. */
  setMaxSamples(n) {
    this.maxSamples = n
    this.apply(this.pixelRatio, n)
    this.rearm()
  }

  /** Un cran de moins : anticrénelage 4× → 2×, puis la définition, puis l'anticrénelage à 0. */
  stepDown() {
    if (this.samples > 2) return this.apply(this.pixelRatio, 2)
    if (this.pixelRatio > 1) return this.apply(Math.max(1, this.pixelRatio - 0.25))
    if (this.samples > 0) return this.apply(1, 0)
    return false
  }

  /** Un cran de plus, chemin inverse de stepDown, sans dépasser les plafonds. */
  stepUp() {
    if (this.samples === 0 && this.maxSamples > 0) return this.apply(this.pixelRatio, Math.min(2, this.maxSamples))
    if (this.pixelRatio < this.max) return this.apply(Math.min(this.max, this.pixelRatio + 0.25))
    if (this.samples < this.maxSamples) return this.apply(this.pixelRatio, this.maxSamples)
    return false
  }

  /** À appeler chaque frame avec le dt (borné) et le temps écoulé. */
  update(dt, elapsed) {
    if (elapsed < this.warmup) return
    if (document.hidden) { this._paused = true; return }
    if (this._paused) {
      this._paused = false
      this.slowFrames = 0
      this.fastFrames = 0
      return
    }

    // Moyenne glissante : une image isolée (ramasse-miettes) ne décide de
    // rien, une tendance de ~1 s oui.
    this.frameTime += (dt - this.frameTime) * 0.05
    // Un palier accepté faute de mieux ne relance pas la descente, sauf s'il
    // se dégrade nettement.
    if (this.frameTime > SLOW && this.frameTime > this._settled * 1.15) {
      this.slowFrames++
      this.fastFrames = 0
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1)
      this.fastFrames = this.frameTime < FAST ? this.fastFrames + 1 : 0
      if (this.slowFrames === 0) {
        this._trail.length = 0 // la descente a suffi
        if (this.frameTime <= SLOW) this._settled = 0 // redevenu fluide : le palier accepté ne vaut plus
      }
    }

    const onProbation = elapsed - this._climbedAt < PROBATION
    if (this.slowFrames > (onProbation ? 30 : 90)) {
      this._descend(elapsed)
    } else if (this.fastFrames > this.climbAfter && this._failedClimbs < 2 && this.stepUp()) {
      this.fastFrames = 0
      this._climbedAt = elapsed
      this._settled = 0
    }
  }

  _descend(elapsed) {
    this.slowFrames = 0
    this.fastFrames = 0
    const here = { pixelRatio: this.pixelRatio, samples: this.samples, frameTime: this.frameTime }
    if (this.stepDown()) {
      this._trail.push(here)
      if (elapsed - this._climbedAt < FAILED_CLIMB) {
        this._failedClimbs++
        this._climbedAt = -Infinity // un essai raté compte une fois, quelle que soit la suite
      }
      this.climbAfter = Math.min(this.climbAfter * 2, 7200) // ~2 min à 60 fps
      return
    }
    // Plus aucun cran à rendre, et c'est encore lent : on remonte au cran le
    // plus haut qui n'était pas plus lent (mesure saturée : on reste en bas).
    let keep = here
    if (here.frameTime < SATURATED) {
      keep = this._trail.find((level) => level.frameTime <= here.frameTime / WORTHWHILE) ?? here
    }
    if (keep !== here) this.apply(keep.pixelRatio, keep.samples)
    this._settled = here.frameTime
    this._trail.length = 0
  }
}
