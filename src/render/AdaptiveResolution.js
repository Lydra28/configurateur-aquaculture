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
 * Trois garde-fous, nés d'un vrai piège (poissons pixelisés pour toute la
 * session après un simple démarrage laborieux) :
 * - l'ÉCHAUFFEMENT est ignoré : les premières secondes compilent les shaders
 *   et crèvent le budget sans rien dire des capacités réelles de la machine ;
 * - l'ONGLET MASQUÉ est ignoré : le navigateur bride lui-même la cadence d'une
 *   page invisible, ce n'est pas de la lenteur ;
 * - la REMONTÉE existe : après une période d'aisance franche, on regagne un
 *   cran. Les seuils sont asymétriques (descente sous 32 fps pendant ~3 s,
 *   remontée au-dessus de 50 fps pendant ~10 s) pour ne pas osciller, et
 *   chaque descente DOUBLE la patience exigée avant le prochain essai : une
 *   machine vraiment limite se stabilise en bas au lieu de faire du yo-yo.
 */
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
    this.slowFrames = 0
    this.fastFrames = 0
    this.climbAfter = 600 // frames d'aisance exigées avant de remonter
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
    if (elapsed < this.warmup || document.hidden) return

    if (dt > 1 / 32) {
      this.slowFrames++
      this.fastFrames = 0
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1)
      this.fastFrames = dt < 1 / 50 ? this.fastFrames + 1 : 0
    }

    if (this.slowFrames > 90 && this.stepDown()) {
      this.slowFrames = 0
      this.fastFrames = 0
      this.climbAfter = Math.min(this.climbAfter * 2, 7200) // ~2 min à 60 fps
    } else if (this.fastFrames > this.climbAfter && this.stepUp()) {
      this.fastFrames = 0
    }
  }
}
