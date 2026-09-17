import * as THREE from 'three'
import { DEG, clamp, lerp } from '../core/math.js'

/**
 * Cages aquacoles semi-immergées — d'après les références « filet 1/3/4/5 » :
 * cage circulaire type norvégien. Collerette flottante à double tube noir,
 * montants et main courante, bouées ; sous l'eau, jupe de filet cylindrique
 * (voile + cordages verticaux + cerclages) fermée par un cône lesté.
 *
 * SEMI-IMMERGÉE = à cheval sur la ligne d'eau du composite. Or les deux
 * bandes de l'écran sont rendues par DEUX caméras aux fov très différents
 * (above 30°, below 66°) : un même objet ne peut pas traverser la ligne.
 * Chaque cage est donc coupée en deux moitiés indépendantes, accordées :
 * - la MOITIÉ ÉMERGÉE (collerette) vit dans le monde de la caméra above,
 *   posée sur la houle réelle (ocean.sampleHeight), sur un cap et une
 *   largeur CORRIGÉS du ratio de perspective entre les deux caméras, pour
 *   tomber exactement au-dessus de sa jupe à l'écran ;
 * - la MOITIÉ IMMERGÉE (jupe) vit dans le monde de la caméra below : son
 *   sommet dépasse légèrement le haut du cadre immergé, la découpe à la
 *   ligne ondulante est donc faite par le compositeur lui-même.
 * Chaque moitié n'est visible que dans sa passe (masquage dans main.js,
 * comme underwater.group).
 *
 * 3 cages (saumons / truites / esturgeons — peuplées dans les passes
 * suivantes), placées PAR RAPPORT AU REGARD comme la vie fixe : angles
 * résolus une fois le cap verrouillé (alignToView). En fonction des futures
 * variables du configurateur, chaque cage peut être absente : setPresence().
 */

function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// { da: angle relatif au regard (rad), d: distance (m), radius: rayon (m) }
// Alignées sur la MOITIÉ DROITE du cadre (retour Romain) : le panneau du
// configurateur occupe la gauche de l'écran, les cages restent dégagées.
// La taille À L'ÉCRAN dépend de la profondeur PERPENDICULAIRE d·cos(da),
// pas de la distance radiale : une cage excentrée à distance égale paraît
// plus grosse (retour Romain : « le filet de droite est trop large »). Les
// distances sont donc choisies pour des profondeurs comparables
// (d·cos(da) ≈ 58/65/62 m) — tailles écran homogènes.
// Angles choisis pour un espacement égal À L'ÉCRAN (x écran ∝ tan(da),
// pas ∝ da : des angles équidistants donnaient des écarts inégaux).
const CAGE_SLOTS = [
  { da: 0.10, d: 58, radius: 9.0, buoy: 0xd8a018 },
  { da: 0.545, d: 76, radius: 10.0, buoy: 0xa03020 },
  { da: 0.836, d: 92, radius: 8.5, buoy: 0xd8a018 },
]

export class FarmCages {
  constructor() {
    /** Moitiés émergées — rendues UNIQUEMENT dans la passe above. */
    this.above = new THREE.Group()
    /** Moitiés immergées — rendues UNIQUEMENT dans la passe below. */
    this.below = new THREE.Group()
    this._rnd = seededRandom(20260922)
    this._cages = []
    this._aligned = false
    this._presence = [true, true, true]

    const structMat = new THREE.MeshLambertMaterial({ color: 0x15181b })
    const railMat = new THREE.MeshLambertMaterial({ color: 0x2a2f33 })
    const netVeilMat = new THREE.MeshLambertMaterial({
      color: 0x0d3038,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const ropeMat = new THREE.MeshLambertMaterial({ color: 0x8fa8b2 })
    this._mats = [structMat, railMat, netVeilMat, ropeMat]

    for (let c = 0; c < CAGE_SLOTS.length; c++) {
      const slot = CAGE_SLOTS[c]
      const R = slot.radius

      /* ---- moitié émergée : collerette double tube + montants + bouées -- */
      const top = new THREE.Group()
      const torusOut = new THREE.Mesh(
        new THREE.TorusGeometry(R, 0.34, 8, 48), structMat)
      torusOut.rotation.x = Math.PI / 2
      const torusIn = new THREE.Mesh(
        new THREE.TorusGeometry(R * 0.86, 0.30, 8, 48), structMat)
      torusIn.rotation.x = Math.PI / 2
      torusIn.position.y = 0.1
      const rail = new THREE.Mesh(
        new THREE.TorusGeometry(R * 0.93, 0.10, 6, 48), railMat)
      rail.rotation.x = Math.PI / 2
      rail.position.y = 1.35
      top.add(torusOut, torusIn, rail)
      const postGeometry = new THREE.BoxGeometry(0.16, 1.35, 0.16)
      for (let p = 0; p < 20; p++) {
        const a = (p / 20) * Math.PI * 2
        const post = new THREE.Mesh(postGeometry, structMat)
        post.position.set(Math.cos(a) * R * 0.93, 0.68, Math.sin(a) * R * 0.93)
        top.add(post)
      }
      const buoyMat = new THREE.MeshLambertMaterial({ color: slot.buoy })
      for (let b = 0; b < 2; b++) {
        const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), buoyMat)
        const a = b * Math.PI + 0.7
        buoy.position.set(Math.cos(a) * (R + 1.1), 0.15, Math.sin(a) * (R + 1.1))
        top.add(buoy)
      }
      this.above.add(top)

      /* ---- moitié immergée : jupe (voile + cordages + cerclages) + cône -- */
      // Les hauteurs sont EN UNITÉS DU COLLAGE : le monde immergé est étiré
      // verticalement par le compositeur, la jupe est dimensionnée à l'écran
      // (fraction de bande) dans alignToView, pas en mètres physiques.
      const skirt = new THREE.Group()
      const veil = new THREE.Mesh(
        new THREE.CylinderGeometry(R * 0.92, R * 0.92, 1, 32, 1, true), netVeilMat)
      veil.position.y = -0.5 // origine du groupe = sommet de jupe
      skirt.add(veil)
      const ropeGeometry = new THREE.CylinderGeometry(0.055, 0.055, 1, 4)
      for (let r = 0; r < 18; r++) {
        const a = (r / 18) * Math.PI * 2
        const rope = new THREE.Mesh(ropeGeometry, ropeMat)
        rope.position.set(Math.cos(a) * R * 0.92, -0.5, Math.sin(a) * R * 0.92)
        skirt.add(rope)
      }
      // Cerclages, cône et lest sont marqués : leur ÉPAISSEUR ne doit pas
      // suivre l'étirement vertical du groupe (scale.y = hauteur de jupe) —
      // alignToView leur redonne une échelle verticale unitaire.
      const unscaled = []
      for (const level of [0.34, 0.67]) {
        const hoop = new THREE.Mesh(
          new THREE.TorusGeometry(R * 0.92, 0.09, 5, 40), ropeMat)
        hoop.rotation.x = Math.PI / 2
        hoop.position.y = -level
        skirt.add(hoop)
        unscaled.push(hoop)
      }
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(R * 0.92, R * 0.18, 0.16, 32, 1, true), netVeilMat)
      cone.position.y = -1.08
      skirt.add(cone)
      const weight = new THREE.Mesh(
        new THREE.TorusGeometry(R * 0.2, 0.14, 5, 20), structMat)
      weight.rotation.x = Math.PI / 2
      weight.position.y = -1.17
      skirt.add(weight)
      unscaled.push(weight)
      this.below.add(skirt)

      this._cages.push({ slot, top, skirt, unscaled, phase: this._rnd() * 6.28 })
    }
  }

  /**
   * Résolution des positions une fois le cap verrouillé (comme FixedLife).
   * C'est ici que se fait l'ACCORD entre les deux caméras : cap corrigé et
   * largeur corrigée pour la moitié émergée, sommet de jupe calé sur le haut
   * du cadre immergé pour la moitié immergée.
   */
  alignToView(viewHeading, belowCam, aboveCam) {
    const va = Math.atan2(-Math.cos(viewHeading), -Math.sin(viewHeading))
    // demi-tangentes horizontales des deux caméras : le ratio dit de combien
    // un même angle « glisse » d'une bande à l'autre
    const kBelow = Math.tan(belowCam.fov * DEG * 0.5) * belowCam.aspect
    const kAbove = Math.tan(aboveCam.fov * DEG * 0.5) * aboveCam.aspect
    const shift = kAbove / kBelow
    const tanHalfV = Math.tan(belowCam.fov * DEG * 0.5)

    this._cages.forEach((cage, i) => {
      const { da, d } = cage.slot
      // moitié immergée : sur le cap vrai
      const ab = va + da
      const bx = Math.cos(ab) * d
      const bz = Math.sin(ab) * d
      // sommet de jupe : dépassement au-dessus du haut du cadre immergé —
      // la ligne du composite ondule de ±5 % d'écran, la marge la couvre,
      // la découpe à la ligne reste donc pleine crête comprise.
      // Hauteur en unités de collage : ~28 % de bande de jupe + cône court.
      // La projection verticale dépend de la profondeur PERPENDICULAIRE à
      // l'axe de visée (d·cos da), pas de la distance radiale — sans ça les
      // cages excentrées avaient une jupe trop courte et un volume décalé.
      // La marge se calcule sur le bord LOIN de l'ouverture (+ rayon) : vu
      // par en dessous, c'est lui qui redescend dans le cadre en perspective.
      const zPerp = d * Math.cos(da)
      const topY = belowCam.position.y + tanHalfV * (zPerp + cage.slot.radius) * 1.08
      const skirtH = 0.28 * 2 * tanHalfV * zPerp
      cage.skirt.position.set(bx, topY, bz)
      cage.skirt.scale.y = skirtH
      // hauteur qui projette SUR la ligne au centre de la cage : le volume
      // utile (visible) de la jupe va de là au bas — les poissons s'y calent
      cage.skirt.userData.lineY = belowCam.position.y + tanHalfV * zPerp
      // cylindre du voile et cordages s'étirent avec le groupe ; cerclages
      // et lest (des tores tournés de 90° : leur axe vertical est le z LOCAL)
      // retrouvent une épaisseur en mètres
      for (const o of cage.unscaled) o.scale.z = 1 / skirtH

      // moitié émergée : cap corrigé (même x écran que la jupe) + largeur
      // corrigée du ratio de perspective
      const tanA = Math.tan(da)
      const daAbove = Math.atan(tanA * shift)
      const aa = va + daAbove
      cage.top.position.set(Math.cos(aa) * d, 0, Math.sin(aa) * d)
      cage.top.scale.set(shift, 1, shift)
      cage.top.userData.baseX = Math.cos(aa) * d
      cage.top.userData.baseZ = Math.sin(aa) * d
    })
    this._aligned = true
  }

  /** Bob de houle réelle pour les collerettes ; la jupe reste stable. */
  update(dt, elapsed, ocean) {
    if (!this._aligned) return
    for (const cage of this._cages) {
      const { baseX, baseZ } = cage.top.userData
      // suit EXACTEMENT la houle rendue : la surface visible au pied de la
      // collerette est ce même sampleHeight
      const h = ocean.sampleHeight(baseX, baseZ, elapsed)
      cage.top.position.y = h
      cage.top.rotation.z = Math.sin(elapsed * 0.5 + cage.phase) * 0.012
      cage.top.rotation.x = Math.cos(elapsed * 0.4 + cage.phase) * 0.012
    }
  }

  /**
   * Présence par cage (futures variables du configurateur) : les 3 ne seront
   * probablement pas là en même temps — mais pour les créneaux de validation,
   * les 3 sont affichées.
   */
  setPresence(flags) {
    this._presence = flags
    this._cages.forEach((cage, i) => {
      cage.top.visible = !!flags[i]
      cage.skirt.visible = !!flags[i]
    })
  }

  /**
   * Repères des jupes pour les modules de peuplement (CagedFish) : centre,
   * sommet, hauteur étirée et rayon — null tant que le cap n'est pas résolu.
   */
  getSkirtFrames() {
    if (!this._aligned) return null
    return this._cages.map((cage) => ({
      x: cage.skirt.position.x,
      z: cage.skirt.position.z,
      topY: cage.skirt.position.y,
      lineY: cage.skirt.userData.lineY,
      skirtH: cage.skirt.scale.y,
      radius: cage.slot.radius,
      present: cage.skirt.visible,
    }))
  }

  /** Même contrat que la famille — inactif pour l'instant (pas de récit). */
  applyEcosystem(state) {}

  dispose() {
    for (const m of this._mats) m.dispose()
    this.above.traverse((o) => o.geometry?.dispose())
    this.below.traverse((o) => o.geometry?.dispose())
  }
}
