import * as THREE from 'three'
import { clamp, damp, smoothstep } from '../core/math.js'
import { FLOOR_Y } from '../scene/Underwater.js'

/**
 * Trajectoire de plongée pilotée par le scroll.
 *
 * Les positions sont des clés interpolées, pas une formule : la traversée de
 * la surface doit se produire à un instant précis du scroll, et une courbe
 * paramétrique rend ce calage impossible à régler. Le `t` de chaque clé est le
 * seul chiffre à toucher pour déplacer un moment du récit.
 */
const KEYS = [
  { t: 0.00, pos: [0,   7.0, 46], look: [0,   3.5, -90], fov: 46 },
  { t: 0.16, pos: [0,   4.2, 30], look: [0,   1.8, -70], fov: 44 },
  { t: 0.30, pos: [0,   1.2, 16], look: [0,  -1.5, -26], fov: 44 },
  { t: 0.40, pos: [0,  -3.0,  7], look: [0,  -9.0, -14], fov: 50 },
  { t: 0.58, pos: [0, -18.0, -2], look: [0, -30.0,  -16], fov: 55 },
  { t: 0.78, pos: [0, -38.0, -14], look: [0, -50.0, -32], fov: 58 },
  { t: 1.00, pos: [0, FLOOR_Y + 11, -34], look: [0, FLOOR_Y + 3.0, -74], fov: 55 },
]

const UP = new THREE.Vector3(0, 1, 0)
const SUN_PROBE = new THREE.Vector3()
const vecA = new THREE.Vector3()
const vecB = new THREE.Vector3()

function sampleKeys(t) {
  const p = clamp(t, 0, 1)
  let i = 0
  while (i < KEYS.length - 2 && p > KEYS[i + 1].t) i++
  const a = KEYS[i], b = KEYS[i + 1]
  const k = smoothstep(a.t, b.t, p)
  return {
    pos: vecA.fromArray(a.pos).lerp(vecB.fromArray(b.pos), k).clone(),
    look: vecA.fromArray(a.look).lerp(vecB.fromArray(b.look), k).clone(),
    fov: a.fov + (b.fov - a.fov) * k,
  }
}

export class ScrollDive {
  constructor(camera, { track } = {}) {
    this.camera = camera
    this.track = track ?? document.documentElement
    this.progress = 0
    this.smoothed = 0
    // Cap de la trajectoire. La hero doit faire face au soleil quelle que soit
    // l'heure choisie sur la timeline : on tourne donc tout le chemin autour de
    // Y plutôt que de figer une orientation qui ne marcherait qu'à 18 h.
    this.heading = 0
    this._headingTarget = 0
    this._target = new THREE.Vector3(0, 3.5, -90)
    // Mal des transports : pour qui demande moins d'animation, la caméra colle
    // au scroll (lambda élevé = quasi direct) au lieu de « nager » derrière.
    // La trajectoire reste la même — c'est le flottement qu'on retire, pas le récit.
    const reduced = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches
    this._damping = reduced ? 14 : 3.2
    this._lookDamping = reduced ? 18 : 6
    this._onScroll = this._onScroll.bind(this)
    window.addEventListener('scroll', this._onScroll, { passive: true })
    window.addEventListener('resize', this._onScroll, { passive: true })
    this._onScroll()
  }

  _onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight
    this.progress = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0
  }

  /**
   * Cap approché à partir de l'azimut solaire. Met la caméra à peu près face
   * au soleil ; le cadrage exact est ensuite corrigé par aimSun(), parce qu'il
   * dépend du FOV et du ratio de la fenêtre, pas seulement de l'azimut.
   */
  setSunHeading(azimuthDeg) {
    this._headingTarget = (azimuthDeg + 180) * Math.PI / 180
  }

  /**
   * Asservissement du cadrage : corrige le cap pour que le soleil se pose à
   * `targetNdcX` (-1 bord gauche, +1 bord droit).
   *
   * Une formule fermée demanderait de connaître le FOV horizontal effectif et
   * de refaire le calcul à chaque redimensionnement — et se trompe dès qu'on
   * touche à une clé de trajectoire. Mesurer la position réelle et corriger
   * l'erreur reste juste quoi qu'on change en amont, y compris sur un écran
   * de téléphone où le soleil sortirait du cadre.
   */
  aimSun(sunDirection, targetNdcX, dt, elevationDeg) {
    if (elevationDeg < -1) return   // soleil couché : plus rien à cadrer
    SUN_PROBE.copy(sunDirection).multiplyScalar(1000).add(this.camera.position)
      .project(this.camera)
    if (SUN_PROBE.z > 1) return     // derrière la caméra : l'estimation analytique suffit
    const error = SUN_PROBE.x - targetNdcX
    if (Math.abs(error) < 0.004) return
    // Le cap et la position écran varient dans le même sens : pour ramener le
    // soleil vers la gauche, il faut diminuer le cap. D'où le signe négatif.
    this._headingTarget -= error * 0.22 * Math.min(1, dt * 60)
  }

  update(dt) {
    // Amortissement : le scroll d'un trackpad arrive par à-coups, la caméra ne
    // doit pas les reproduire. Lambda faible = plongée lourde, comme une masse
    // d'eau. C'est aussi ce qui laisse le temps aux transitions de shader.
    this.smoothed = damp(this.smoothed, this.progress, this._damping, dt)
    const key = sampleKeys(this.smoothed)

    // Différence d'angle repliée dans [-π, π] : sans ça, passer de 359° à 1°
    // fait faire un tour complet à la caméra.
    let delta = this._headingTarget - this.heading
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    this.heading += delta * (1 - Math.exp(-2.5 * dt))

    key.pos.applyAxisAngle(UP, this.heading)
    key.look.applyAxisAngle(UP, this.heading)

    this.camera.position.copy(key.pos)
    this._target.lerp(key.look, 1 - Math.exp(-this._lookDamping * dt))
    this.camera.lookAt(this._target)

    if (Math.abs(this.camera.fov - key.fov) > 0.01) {
      this.camera.fov = key.fov
      this.camera.updateProjectionMatrix()
    }
    return this.smoothed
  }

  /**
   * Place la caméra sans transition.
   * Nécessaire à l'arrivée sur une ancre : recharger la page au milieu du
   * scroll ne doit pas rejouer la descente depuis la surface. Sert aussi aux
   * captures de référence, qui ne peuvent pas attendre un amortissement.
   */
  snap({ sunDirection, targetNdcX, elevationDeg = 90 } = {}) {
    this.smoothed = this.progress
    const place = () => {
      this.heading = this._headingTarget
      const key = sampleKeys(this.smoothed)
      key.pos.applyAxisAngle(UP, this.heading)
      key.look.applyAxisAngle(UP, this.heading)
      this.camera.position.copy(key.pos)
      this._target.copy(key.look)
      this.camera.lookAt(this._target)
      this.camera.fov = key.fov
      this.camera.updateProjectionMatrix()
      this.camera.updateMatrixWorld(true)
    }
    place()
    // Fait converger l'asservissement du cadrage d'un coup, sans attendre
    // soixante frames : c'est tout l'intérêt d'un snap.
    if (sunDirection) {
      for (let i = 0; i < 80; i++) {
        this.aimSun(sunDirection, targetNdcX ?? 0.45, 1 / 60, elevationDeg)
        place()
      }
    }
  }

  get depth() { return Math.max(0, -this.camera.position.y) }
  get isUnderwater() { return this.camera.position.y < 0 }

  dispose() {
    window.removeEventListener('scroll', this._onScroll)
    window.removeEventListener('resize', this._onScroll)
  }
}
