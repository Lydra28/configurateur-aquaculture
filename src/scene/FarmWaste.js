import * as THREE from 'three'
import { clamp } from '../core/math.js'
import { FLOOR_Y, floorHeight } from './Underwater.js'

/**
 * Déchets de la ferme — le nouvel asset du configurateur (composantes
 * « alimentation » et « eaux usées » : « ce qui n'est pas mangé finit
 * toujours quelque part »).
 *
 * Deux éléments par cage, pilotés par UNE intensité 0..1 (canal `waste`
 * du scénario) :
 * - une PLUIE DE GRANULÉS : points qui coulent lentement dans le volume
 *   de la jupe (positions calculées en vertex shader — uTime + attributs,
 *   zéro travail CPU par frame, comme les bulles) ; l'intensité règle la
 *   part de granulés visibles et leur opacité ;
 * - un TAPIS DE DÉPÔT : disque sombre posé sur le sable sous la cage,
 *   qui se densifie avec l'intensité — la trace que la pluie laisse.
 *
 * Module autonome : lit les repères de jupes via farm.getSkirtFrames(),
 * ne modifie rien d'autre. À intensité 0 (défaut), rien n'est visible :
 * le décor validé reste exactement lui-même.
 */

function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const GRAINS_PER_CAGE = 130

export class FarmWaste {
  /** @param farm le module FarmCages — source des repères de jupes. */
  constructor(farm) {
    this.group = new THREE.Group()
    this._farm = farm
    this._ready = false
    this._intensity = { value: 0 }
    this._time = { value: 0 }
    this._rnd = seededRandom(20260924)
    this._systems = []
  }

  /** Construction différée : attend les repères de jupes (cap verrouillé). */
  _build(frames) {
    const rnd = this._rnd
    for (const frame of frames) {
      /* ---- pluie de granulés, en vertex shader ---------------------- */
      const positions = new Float32Array(GRAINS_PER_CAGE * 3)
      const seeds = new Float32Array(GRAINS_PER_CAGE)
      const geometry = new THREE.BufferGeometry()
      const fallH = frame.lineY - (frame.topY - frame.skirtH) + 4
      for (let i = 0; i < GRAINS_PER_CAGE; i++) {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd()) * frame.radius * 0.8
        positions[i * 3] = frame.x + Math.cos(a) * r
        positions[i * 3 + 1] = rnd() // fraction de chute, animée en shader
        positions[i * 3 + 2] = frame.z + Math.sin(a) * r
        seeds[i] = rnd()
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: this._time,
          uIntensity: this._intensity,
          uTop: { value: frame.lineY },
          uFall: { value: fallH },
        },
        vertexShader: `
          attribute float aSeed;
          uniform float uTime, uIntensity, uTop, uFall;
          varying float vAlpha;
          void main() {
            // chute lente en boucle : chaque granule a sa phase et sa vitesse
            float speed = 0.55 + aSeed * 0.5; // unités de collage / s
            float f = fract(position.y + uTime * speed / uFall);
            vec3 p = vec3(position.x, uTop + 2.0 - f * uFall, position.z);
            // l'intensité recrute les granulés un par un (seuil par graine)
            float on = step(aSeed, uIntensity);
            // fondu haut/bas de course
            float edge = smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.92, 1.0, f));
            vAlpha = on * edge * (0.35 + 0.45 * uIntensity);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp(180.0 / -mv.z, 1.5, 4.0);
          }
        `,
        fragmentShader: `
          varying float vAlpha;
          void main() {
            if (vAlpha < 0.01) discard;
            // beige « neige marine » : dans une eau chargée, une particule
            // se lit claire à contre-jour, jamais sombre
            gl_FragColor = vec4(0.45, 0.41, 0.32, vAlpha * 0.7);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      })
      const points = new THREE.Points(geometry, material)
      points.frustumCulled = false
      this.group.add(points)

      /* ---- tapis de dépôt sous la cage ------------------------------ */
      const floorY = FLOOR_Y + floorHeight(frame.x, frame.z)
      const mat = new THREE.MeshLambertMaterial({
        color: 0x2e2418,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(frame.radius * 1.35, 28), mat)
      pad.rotation.x = -Math.PI / 2
      pad.position.set(frame.x, floorY + 0.3, frame.z)
      this.group.add(pad)

      this._systems.push({ points, pad, present: frame.present })
    }
    this._ready = true
  }

  /** Intensité 0..1 — canal `waste` du scénario. */
  setIntensity(value) {
    this._intensity.value = clamp(value, 0, 1)
    for (const s of this._systems) {
      s.pad.material.opacity = this._intensity.value * 0.5
    }
  }

  /** Suit la présence des cages (échelle de production). */
  setPresence(flags) {
    this._systems.forEach((s, i) => {
      s.points.visible = !!flags[i]
      s.pad.visible = !!flags[i] && s.pad.material.opacity > 0.01
    })
  }

  update(elapsed) {
    if (!this._ready) {
      const frames = this._farm.getSkirtFrames()
      if (frames) this._build(frames)
      return
    }
    this._time.value = elapsed
  }

  dispose() {
    for (const { points, pad } of this._systems) {
      points.geometry.dispose()
      points.material.dispose()
      pad.geometry.dispose()
      pad.material.dispose()
    }
  }
}
