import * as THREE from 'three'
import { oceanVertexShader } from '../shaders/ocean.vert.js'
import { oceanFragmentShader } from '../shaders/ocean.frag.js'
import { buildWaveSet, packWaves } from './waves.js'
import { clamp, lerp, smoothstep } from '../core/math.js'

/**
 * Grille radiale centrée sur la caméra, à pas exponentiel.
 *
 * Un PlaneGeometry régulier gaspille : à 8 km, deux sommets voisins tombent sur
 * le même pixel, pendant qu'au premier plan la houle est sous-échantillonnée.
 * Le pas exponentiel donne une densité à peu près constante À L'ÉCRAN, ce qui
 * est le seul critère qui compte. Même budget de sommets, silhouette de vague
 * nette au premier plan et horizon propre.
 */
function buildRadialGrid(rings, sectors, innerRadius, outerRadius) {
  const positions = new Float32Array((rings * sectors + 1) * 3)
  const indices = []

  let p = 3 // le sommet 0 est le centre, déjà à (0,0,0)
  for (let i = 1; i <= rings; i++) {
    const r = innerRadius * Math.pow(outerRadius / innerRadius, i / rings)
    for (let j = 0; j < sectors; j++) {
      const a = (j / sectors) * Math.PI * 2
      positions[p++] = Math.cos(a) * r
      positions[p++] = 0
      positions[p++] = Math.sin(a) * r
    }
  }

  for (let j = 0; j < sectors; j++) {
    indices.push(0, 1 + ((j + 1) % sectors), 1 + j)
  }
  for (let i = 1; i < rings; i++) {
    const inner = 1 + (i - 1) * sectors
    const outer = 1 + i * sectors
    for (let j = 0; j < sectors; j++) {
      const j2 = (j + 1) % sectors
      indices.push(inner + j, outer + j2, inner + j2)
      indices.push(inner + j, outer + j, outer + j2)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  // La grille suit la caméra : rien ne peut sortir du frustum, et la tester
  // coûterait un recalcul de bounding sphere à chaque frame.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), outerRadius)
  return geometry
}

export class Ocean {
  constructor({ sky, rings = 200, sectors = 256, radius = 9000 } = {}) {
    this.sky = sky
    this.waves = buildWaveSet()
    const packed = packWaves(this.waves, THREE.Vector4)

    this.uniforms = {
      uWaveA: { value: packed.a },
      uWaveB: { value: packed.b },
      uTime: { value: 0 },
      uWaveScale: { value: 1 },
      uCameraPos: { value: new THREE.Vector3() },

      uEnvMap: { value: sky.envMap },
      uEnvMaxLod: { value: sky.envMaxLod },
      uSunDirection: { value: sky.sunDirection },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSunIntensity: { value: 24 },

      uDeepColor: { value: new THREE.Color() },
      uScatterColor: { value: new THREE.Color() },
      uFoamColor: { value: new THREE.Color() },
      uTurbidity: { value: 0.1 },
      uScum: { value: 0 },
      uWaveEnergy: { value: 0.5 },
      uSurfaceLevel: { value: 0 },
      uFogColor: { value: new THREE.Color(0.045, 0.165, 0.225) },
      uFogDensity: { value: 0.012 },
    }

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: oceanVertexShader(this.waves.length),
      fragmentShader: oceanFragmentShader(),
      uniforms: this.uniforms,
      side: THREE.DoubleSide, // on la traverse au scroll
      toneMapped: false,      // la passe de post-traitement s'en charge
    })

    this.mesh = new THREE.Mesh(buildRadialGrid(rings, sectors, 0.6, radius), this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 0

    this._deep = new THREE.Color()
    this._scatter = new THREE.Color()
    this._foam = new THREE.Color()
  }

  /**
   * Traduit un état d'écosystème en couleurs et énergie d'eau.
   *
   * Tout passe par ici : le shader ne connaît ni la densité d'élevage, ni les
   * saisons. Changer le modèle biologique ne touche pas une ligne de GLSL.
   */
  applyEcosystem(state) {
    const { turbidity, bloom, health, waveEnergy, surfaceScum } = state

    // Eau claire : bleu-vert profond, absorption forte dans le rouge.
    // Eau chargée : le vert des algues puis le brun des matières en suspension
    // remontent, et le bleu disparaît — c'est l'ordre réel de dégradation.
    const clearDeep = [0.008, 0.052, 0.078]
    const bloomDeep = [0.030, 0.085, 0.048]
    const murkDeep  = [0.060, 0.062, 0.040]

    const b = clamp(bloom, 0, 1)
    const m = clamp(turbidity * turbidity, 0, 1)
    this._deep.setRGB(
      lerp(lerp(clearDeep[0], bloomDeep[0], b), murkDeep[0], m),
      lerp(lerp(clearDeep[1], bloomDeep[1], b), murkDeep[1], m),
      lerp(lerp(clearDeep[2], bloomDeep[2], b), murkDeep[2], m),
    )

    this._scatter.setRGB(
      lerp(0.045, 0.210, b) + m * 0.10,
      lerp(0.430, 0.400, b) - m * 0.08,
      lerp(0.400, 0.150, b) - m * 0.14,
    )

    // L'écume d'une eau saine est blanche. Chargée en matière organique, elle
    // vire au beige et persiste plus longtemps — un marqueur de terrain.
    const dirty = clamp(1 - health, 0, 1)
    this._foam.setRGB(
      lerp(0.94, 0.78, dirty),
      lerp(0.97, 0.73, dirty),
      lerp(1.00, 0.60, dirty),
    )

    this.uniforms.uDeepColor.value.copy(this._deep)
    this.uniforms.uScatterColor.value.copy(this._scatter)
    this.uniforms.uFoamColor.value.copy(this._foam)
    this.uniforms.uTurbidity.value = turbidity
    this.uniforms.uScum.value = surfaceScum
    this.uniforms.uWaveEnergy.value = waveEnergy
    this.uniforms.uWaveScale.value = 0.45 + 0.95 * waveEnergy
  }

  /** Accorde le brouillard de la face immergée sur celui du monde subaquatique. */
  setUnderwaterFog(color, density) {
    this.uniforms.uFogColor.value.copy(color)
    this.uniforms.uFogDensity.value = density
  }

  update(elapsed, camera) {
    this.uniforms.uTime.value = elapsed
    this.uniforms.uCameraPos.value.copy(camera.position)
    this.uniforms.uSunColor.value.copy(this.sky.sunColor)
    this.uniforms.uEnvMap.value = this.sky.envMap
    // La grille reste centrée sous la caméra : océan infini sans pagination.
    this.mesh.position.set(camera.position.x, 0, camera.position.z)
  }

  /**
   * Déplacement de Gerstner au point-source (x, z) — même calcul que le vertex
   * shader, atténuation par distance à la caméra comprise, pour que le CPU et
   * le GPU décrivent la même surface.
   */
  _displacementAt(x, z, time) {
    const scale = this.uniforms.uWaveScale.value
    const cam = this.uniforms.uCameraPos.value
    const dist = Math.hypot(x - cam.x, z - cam.z)
    let dx = 0, dz = 0, y = 0
    for (const w of this.waves) {
      // Même extinction que le shader : chaque longueur d'onde s'éteint à
      // ~90 fois sa propre valeur (voir ocean.vert.js).
      const reach = w.lambda * 90
      const amplitude = w.amplitude * scale * smoothstep(reach * 2.2, reach * 0.55, dist)
      if (amplitude <= 0) continue
      const f = w.k * (w.dirX * x + w.dirZ * z) - w.omega * time + w.phase
      const s = Math.sin(f)
      dx -= w.Q * amplitude * w.dirX * s
      dz -= w.Q * amplitude * w.dirZ * s
      y += amplitude * Math.cos(f)
    }
    return { dx, dz, y }
  }

  /**
   * Hauteur de la surface en (x, z) — pour poser des objets flottants.
   *
   * Une vague de Gerstner déplace la surface HORIZONTALEMENT en plus de la
   * hauteur : le point de surface visible en (x, z) provient d'un point-source
   * décalé. Sommer les cosinus en (x, z) directement donne donc une hauteur
   * fausse près des crêtes — un ponton posé ainsi flotte à côté de l'eau par
   * mer formée (écart mesuré : jusqu'à ~3 m par mer très formée). On inverse le
   * déplacement par point fixe : quatre itérations ramènent le résidu sous
   * ~15 cm tant que la raideur totale reste sous 1 (garantie par waves.js).
   */
  sampleHeight(x, z, time) {
    let sx = x, sz = z
    for (let i = 0; i < 4; i++) {
      const d = this._displacementAt(sx, sz, time)
      sx = x - d.dx
      sz = z - d.dz
    }
    return this._displacementAt(sx, sz, time).y
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
