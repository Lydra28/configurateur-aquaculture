import * as THREE from 'three'
import { clamp } from '../core/math.js'

/**
 * Le plan fixe en ligne de flottaison.
 *
 * Remplace la plongée au scroll : le décor est désormais UN cadrage, à cheval
 * sur la surface — deux caméras jumelles (émergée / submergée) que le
 * compositeur (render/WaterlineSplit.js) recolle à la ligne d'eau.
 *
 * La caméra ne se DÉPLACE jamais : c'est ce qui permet de valider chaque asset
 * sous un seul angle. Elle s'incline seulement — cap asservi vers le soleil
 * (comme l'ancienne trajectoire), et micro-parallaxe au curseur (±2°, lissée
 * par lerp) pour garder le décor vivant sans casser le point de vue.
 */
export class StaticShot {
  constructor({
    aboveHeight = 7,       // hauteur d'œil au-dessus de l'eau : plus haut =
                           // houle plus petite à l'écran, même échelle perçue
                           // que le monde immergé dézoomé
    belowDepth = 12,       // œil au MILIEU de la colonne d'eau : regard
                           // horizontal, comme à travers la vitre d'un aquarium
    abovePitch = -0.06,    // presque à plat : l'horizon reste dans la bande de ciel
    belowPitch = 0.0,      // PLAN DE COUPE : regard droit, le fond se lit comme
                           // une bande horizontale, pas comme un plan incliné
    aboveBand = 1 / 3,     // part d'écran de chaque monde — chaque caméra rend
    belowBand = 2 / 3,     // exactement sa bande (fov et aspect dédiés)
    parallax = 0.035,      // amplitude du tilt souris, en radians (~2°)
  } = {}) {
    this._aboveBand = aboveBand
    this._belowBand = belowBand
    // FOV verticaux par bande : plus ouverts = plus dézoomé — la colonne
    // d'eau entre dans le cadre depuis plus près, la scène paraît plus vaste.
    this.above = new THREE.PerspectiveCamera(30, 1, 0.1, 30000)
    this.below = new THREE.PerspectiveCamera(66, 1, 0.1, 30000)
    this.above.position.set(0, aboveHeight, 0)
    this.below.position.set(0, -belowDepth, 0)
    this.resize()
    // YXZ : le cap (Y) s'applique avant le piqué (X) — indispensable pour que
    // le tilt reste « écran » quel que soit le cap vers le soleil.
    this.above.rotation.order = 'YXZ'
    this.below.rotation.order = 'YXZ'
    this._abovePitch = abovePitch
    this._belowPitch = belowPitch
    this._parallax = parallax

    this.heading = Math.PI
    this._headingTarget = Math.PI
    // Latch de convergence : en caméra fixe, un asservissement qui corrige à
    // chaque frame « chasse » autour de sa cible et fait trembler tout le
    // décor. On corrige jusqu'à convergence, puis on VERROUILLE — le latch ne
    // se réarme que si le soleil change vraiment d'azimut (timeline).
    this._aimSettled = false
    this._mouse = { x: 0, y: 0 }
    this._mouseTarget = { x: 0, y: 0 }

    this._onMove = (e) => {
      this._mouseTarget.x = (e.clientX / innerWidth) * 2 - 1
      this._mouseTarget.y = -(e.clientY / innerHeight) * 2 + 1
    }
    addEventListener('mousemove', this._onMove, { passive: true })

    // Même geste que la plongée : qui demande moins de mouvement n'a pas de
    // parallaxe du tout — le décor vit déjà par la houle et la lumière.
    if (typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this._parallax = 0
    }
  }

  /** Cap approché depuis l'azimut solaire ; aimSun() affine ensuite. */
  setSunHeading(azimuthDeg) {
    const target = (azimuthDeg + 180) * Math.PI / 180
    // Le store émet à CHAQUE changement de config, azimut inchangé compris :
    // ne réarmer l'asservissement que si le soleil a réellement bougé.
    let delta = target - this._headingTarget
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    if (Math.abs(delta) < 0.002) return
    this._headingTarget = target
    this._aimSettled = false
  }

  /**
   * Asservissement du cadrage solaire, hérité de la plongée : on mesure où le
   * soleil se projette à l'écran et on corrige le cap — juste quel que soit le
   * FOV ou le ratio de fenêtre, là où une formule fermée se tromperait.
   */
  aimSun(sunDirection, targetNdcX, dt, elevationDeg) {
    if (this._aimSettled) return
    if (elevationDeg < -1) { this._aimSettled = true; return }
    // La matrice monde d'une caméra n'est recalculée qu'au rendu : après un
    // changement de cap, la projeter sans cette mise à jour mesure l'erreur
    // d'AVANT — et l'asservissement converge au mauvais endroit.
    this.above.updateMatrixWorld(true)
    const probe = StaticShot._probe.copy(sunDirection).multiplyScalar(1000)
      .add(this.above.position).project(this.above)
    if (probe.z > 1) return
    const error = probe.x - targetNdcX
    if (Math.abs(error) < 0.006) { this._aimSettled = true; return }
    this._headingTarget -= error * 0.22 * Math.min(1, dt * 60)
  }

  /** Convergence complète en un appel (démarrage, ancres, captures). */
  settleSun(sunDirection, targetNdcX, elevationDeg) {
    this._aimSettled = false
    for (let i = 0; i < 80 && !this._aimSettled; i++) {
      this.heading = this._headingTarget
      this.update(1)
      this.aimSun(sunDirection, targetNdcX, 1 / 60, elevationDeg)
    }
    this.snap()
  }

  update(dt) {
    // Cap : différence repliée dans [-π, π] pour ne jamais faire un tour complet.
    let delta = this._headingTarget - this.heading
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    this.heading += delta * (1 - Math.exp(-2.5 * dt))

    // Parallaxe : lerp façon skill threejs-interactive-web — la caméra suit le
    // curseur avec une inertie de masse d'eau, jamais en direct.
    const k = 1 - Math.exp(-6 * dt)
    this._mouse.x += (this._mouseTarget.x - this._mouse.x) * k
    this._mouse.y += (this._mouseTarget.y - this._mouse.y) * k

    const yaw = this.heading + this._mouse.x * this._parallax
    const tilt = clamp(this._mouse.y, -1, 1) * this._parallax * 0.6

    this.above.rotation.set(this._abovePitch + tilt, yaw, 0)
    this.below.rotation.set(this._belowPitch + tilt, yaw, 0)
  }

  /** Convergence immédiate (captures, arrivée sur la page). */
  snap() {
    this.heading = this._headingTarget
    this._mouse.x = this._mouseTarget.x
    this._mouse.y = this._mouseTarget.y
    this.update(1)
  }

  resize() {
    // Chaque caméra rend SA bande d'écran : son aspect est celui de la bande,
    // pas celui de la fenêtre — c'est ce qui évite toute distorsion au recollage.
    const aspect = innerWidth / innerHeight
    this.above.aspect = aspect / this._aboveBand
    this.below.aspect = aspect / this._belowBand
    this.above.updateProjectionMatrix()
    this.below.updateProjectionMatrix()
  }

  dispose() {
    removeEventListener('mousemove', this._onMove)
  }
}

StaticShot._probe = new THREE.Vector3()
