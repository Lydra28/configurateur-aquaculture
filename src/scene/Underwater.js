import * as THREE from 'three'
import { fbm2D } from '../core/valueNoise.js'
import { NOISE_GLSL } from '../shaders/noise.glsl.js'
import { clamp, lerp } from '../core/math.js'

const FLOOR_SIZE = 900
const FLOOR_SEGMENTS = 180
// Profondeur de mise en scène : la coupe montre toute la colonne d'eau dans
// les 2/3 bas de l'écran, donc cette valeur EST le niveau de zoom du monde
// immergé — plus elle est profonde, plus la flore et le relief paraissent
// petits et lointains (demande du groupe : décor vu de loin, façon coupe
// illustrée). -50 m garde le fond lisible sous le voile en eau claire.
export const FLOOR_Y = -50

/** Relief du fond. Une seule source de vérité, CPU et GPU la partagent. */
export function floorHeight(x, z) {
  return (
    fbm2D(x * 0.0055, z * 0.0055, 4) * 13 +
    fbm2D(x * 0.021, z * 0.021, 3) * 3.4 +
    fbm2D(x * 0.08, z * 0.08, 2) * 0.7
  )
}

/* ------------------------------------------------------------------ */
/* Sol : sédiment + caustiques                                         */
/* ------------------------------------------------------------------ */

const FLOOR_VERT = /* glsl */ `
precision highp float;
out vec3 vWorldPos;
out vec3 vNormal;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
}
`

const FLOOR_FRAG = /* glsl */ `
precision highp float;
${NOISE_GLSL}

uniform vec3  uLivingColor;
uniform vec3  uDeadColor;
uniform vec3  uWaterColor;
uniform vec3  uSunColor;
uniform vec3  uSunDirection;
uniform float uTime;
uniform float uBiodiversity;
uniform float uSediment;
uniform float uFogDensity;
uniform float uCausticStrength;
uniform vec3  uCameraPos;

in vec3 vWorldPos;
in vec3 vNormal;
out vec4 fragColor;

/**
 * Caustiques : le réseau lumineux projeté par les vagues.
 * Deux couches de |bruit| en opposition donnent les lignes fines et les
 * cellules mouvantes, sans avoir à tracer le moindre rayon depuis la surface.
 */
float caustics(vec2 p, float t) {
  float a = abs(noised(p * 0.42 + vec2(t * 0.09, -t * 0.06)).x);
  float b = abs(noised(p * 0.58 - vec2(t * 0.07, t * 0.11)).x);
  float net = 1.0 - clamp((a + b) * 2.6, 0.0, 1.0);
  return pow(net, 4.0);
}

void main() {
  vec3 N = normalize(vNormal);

  // Tapis vivant contre vase nue. La texture change autant que la couleur :
  // un fond vivant est irrégulier, un fond envasé est lisse et uniforme —
  // c'est ce contraste de GRAIN qui se lit, plus que la teinte.
  float grain = fbm(vWorldPos.xz * 0.9, 3) * 0.5 + 0.5;
  float colony = smoothstep(0.35, 0.72, fbm(vWorldPos.xz * 0.08, 3) * 0.5 + 0.5);
  float life = clamp(uBiodiversity * colony * 1.4, 0.0, 1.0);

  vec3 albedo = mix(uDeadColor, uLivingColor, life);
  albedo *= 0.75 + 0.5 * mix(0.5, grain, life);
  // Le voile de sédiment recouvre tout, uniformément — c'est sa signature.
  albedo = mix(albedo, vec3(0.28, 0.26, 0.22), uSediment * 0.55);

  float diffuse = max(dot(N, normalize(uSunDirection)), 0.0) * 0.55 + 0.45;
  float caustic = caustics(vWorldPos.xz, uTime) * uCausticStrength;

  // L'ambiante porte la visibilité (lumière déjà diffusée par le milieu), le
  // soleil ne fait plus que sculpter le relief.
  vec3 ambient = normalize(max(uWaterColor, vec3(0.001))) * 0.62;
  vec3 color = albedo * (ambient + uSunColor * diffuse * 1.6);
  color += mix(uSunColor, ambient, 0.55) * caustic * albedo * 3.2;

  // Brouillard sous-marin : c'est lui qui donne la profondeur et qui se
  // referme quand l'eau se charge.
  float d = length(vWorldPos - uCameraPos);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
  color = mix(color, uWaterColor, clamp(fog, 0.0, 1.0));

  fragColor = vec4(color, 1.0);
}
`

/* ------------------------------------------------------------------ */
/* Neige marine                                                        */
/* ------------------------------------------------------------------ */

const SNOW_VERT = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3  uCameraPos;
uniform float uBoxSize;
uniform float uPixelRatio;
in vec3 seed;
out float vFade;
void main() {
  // Chaque particule chute et dérive dans une boîte qui suit la caméra ; le
  // modulo la fait réapparaître en haut. Aucune simulation, aucun état.
  vec3 p = position;
  p.y -= uTime * (0.25 + seed.x * 0.5);
  p.x += sin(uTime * 0.25 + seed.y * 6.28) * 1.4;
  p.z += cos(uTime * 0.19 + seed.z * 6.28) * 1.4;

  vec3 origin = uCameraPos;
  p = mod(p - origin + uBoxSize * 0.5, uBoxSize) - uBoxSize * 0.5 + origin;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  vFade = (1.0 - smoothstep(uBoxSize * 0.2, uBoxSize * 0.5, dist)) * (0.35 + 0.65 * seed.x);
  gl_PointSize = (14.0 + seed.y * 26.0) * uPixelRatio / max(dist, 1.0);
  gl_Position = projectionMatrix * mv;
}
`

const SNOW_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
in float vFade;
out vec4 fragColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.05, length(d)) * vFade * uOpacity;
  if (a < 0.01) discard;
  fragColor = vec4(uColor, a);
}
`

/* ------------------------------------------------------------------ */

function buildFloorGeometry() {
  const geometry = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE, FLOOR_SEGMENTS, FLOOR_SEGMENTS)
  geometry.rotateX(-Math.PI / 2)
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, floorHeight(pos.getX(i), pos.getZ(i)))
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Le monde subaquatique.
 *
 * Volontairement plus sobre que la surface : c'est l'ossature sur laquelle
 * viendront se brancher les vraies espèces et la ferme-usine. Tout ce qui est
 * ici lit déjà l'état d'écosystème, donc l'ajout d'un modèle ne demandera pas
 * de recâblage — juste du contenu.
 */
export class Underwater {
  constructor({ snowCount = 4000, kelpCount = 2600, moundCount = 620 } = {}) {
    this.group = new THREE.Group()
    this.waterColor = new THREE.Color(0.055, 0.17, 0.22)
    // Lumière du soleil après traversée de la colonne d'eau, recalculée à
    // chaque frame selon la profondeur. C'est elle qui bleuit la scène.
    this.lightColor = new THREE.Color(1, 1, 1)
    // Teinte de l'eau ramenée à une luminance utilisable comme couleur de
    // lumière ambiante : représente la lumière déjà diffusée par le milieu,
    // qui est ce qui rend quoi que ce soit visible à 50 m.
    this.ambientColor = new THREE.Color(1, 1, 1)
    this._turbidity = 0.1
    this._causticBase = 1

    // --- Sol ----------------------------------------------------------
    this.floorUniforms = {
      uLivingColor: { value: new THREE.Color(0.30, 0.42, 0.26) },
      uDeadColor: { value: new THREE.Color(0.30, 0.29, 0.26) },
      uWaterColor: { value: this.waterColor },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uTime: { value: 0 },
      uBiodiversity: { value: 1 },
      uSediment: { value: 0 },
      uFogDensity: { value: 0.012 },
      uCausticStrength: { value: 1 },
      uCameraPos: { value: new THREE.Vector3() },
    }
    this.floor = new THREE.Mesh(
      buildFloorGeometry(),
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: FLOOR_VERT,
        fragmentShader: FLOOR_FRAG,
        uniforms: this.floorUniforms,
        toneMapped: false,
      }),
    )
    this.floor.position.y = FLOOR_Y
    this.group.add(this.floor)

    // --- Reliefs et coraux --------------------------------------------
    this.mounds = this._buildMounds(moundCount)
    this.group.add(this.mounds)

    // --- Végétation ----------------------------------------------------
    this.kelp = this._buildKelp(kelpCount)
    this.group.add(this.kelp)

    // --- Neige marine ---------------------------------------------------
    this.snow = this._buildSnow(snowCount)
    this.group.add(this.snow)

    this._kelpBaseCount = kelpCount
    this._moundBaseCount = moundCount
  }

  _scatter(count, seedOffset) {
    // Répartition en disque, densité plus forte près du centre de la plongée.
    const out = []
    let s = seedOffset
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(rnd()) * FLOOR_SIZE * 0.42
      const a = rnd() * Math.PI * 2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      out.push({ x, z, y: FLOOR_Y + floorHeight(x, z), r1: rnd(), r2: rnd(), r3: rnd() })
    }
    return out
  }

  _buildMounds(count) {
    const geometry = new THREE.IcosahedronGeometry(1, 1)
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    const dummy = new THREE.Object3D()
    this._moundPlacements = this._scatter(count, 991)

    this._moundPlacements.forEach((p, i) => {
      dummy.position.set(p.x, p.y - 0.4, p.z)
      const s = 0.8 + p.r1 * 3.4
      dummy.scale.set(s * (0.7 + p.r2 * 0.6), s * (0.45 + p.r3 * 0.5), s * (0.7 + p.r3 * 0.6))
      dummy.rotation.set(p.r1 * 3, p.r2 * 6, p.r3 * 3)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(0.5), 3),
    )
    this._moundColors = new Float32Array(count * 3)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(this._moundColors, 3)
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
    return mesh
  }

  _buildKelp(count) {
    // Une lanière : deux triangles par segment, ondulée dans le vertex shader.
    const geometry = new THREE.PlaneGeometry(1.15, 1, 1, 10)
    geometry.translate(0, 0.5, 0)

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true,
    })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this._kelpTime = { value: 0 }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float seed = float(gl_InstanceID) * 0.37;
          // Fuseau : large au tiers inférieur, effilé en pointe. Une lanière
          // à largeur constante se lit comme un piquet, pas comme une algue —
          // c'est la silhouette qui porte l'information, pas la couleur.
          float taper = smoothstep(0.0, 0.14, position.y) * (1.0 - pow(position.y, 2.2) * 0.92);
          transformed.x *= 0.35 + 1.45 * taper;
          // L'ondulation croît avec la hauteur : le pied reste ancré.
          float sway = pow(position.y, 1.6);
          transformed.x += sin(uTime * 0.7 + seed) * sway * 0.42;
          transformed.z += cos(uTime * 0.53 + seed * 1.7) * sway * 0.32;
          // Courbure permanente sous le courant dominant : une algue verticale
          // et raide n'existe pas dans l'eau.
          transformed.z += sway * 0.55;`)
    }

    const mesh = new THREE.InstancedMesh(geometry, material, count)
    const dummy = new THREE.Object3D()
    this._kelpPlacements = this._scatter(count, 4242)

    this._kelpPlacements.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z)
      dummy.scale.set(0.55 + p.r1 * 1.1, 1.8 + p.r2 * 6.0, 1)
      dummy.rotation.y = p.r3 * Math.PI * 2
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    this._kelpColors = new Float32Array(count * 3)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(this._kelpColors, 3)
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
    mesh.count = count
    return mesh
  }

  _buildSnow(count) {
    const box = 90
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * box
      positions[i * 3 + 1] = (Math.random() - 0.5) * box
      positions[i * 3 + 2] = (Math.random() - 0.5) * box
      seeds[i * 3] = Math.random()
      seeds[i * 3 + 1] = Math.random()
      seeds[i * 3 + 2] = Math.random()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 3))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

    this.snowUniforms = {
      uTime: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
      uBoxSize: { value: box },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color(0.8, 0.84, 0.78) },
      uOpacity: { value: 0.25 },
    }
    const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SNOW_VERT,
      fragmentShader: SNOW_FRAG,
      uniforms: this.snowUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    }))
    points.frustumCulled = false
    this._snowCount = count
    return points
  }

  applyEcosystem(state) {
    const { biodiversity, sediment, turbidity, health } = state
    this._turbidity = turbidity

    // Couleur de l'eau : le brouillard EST la couleur de l'eau. Une eau chargée
    // vire au vert-jaune et se referme en quelques mètres.
    this.waterColor.setRGB(
      lerp(0.045, 0.115, turbidity),
      lerp(0.165, 0.150, turbidity),
      lerp(0.225, 0.085, turbidity),
    )
    this.floorUniforms.uFogDensity.value = lerp(0.009, 0.033, turbidity)
    this.floorUniforms.uBiodiversity.value = biodiversity
    this.floorUniforms.uSediment.value = sediment
    // Moins de lumière traverse une eau chargée : les caustiques s'éteignent.
    this._causticBase = clamp(1 - turbidity * 1.15, 0, 1)

    // Végétation : d'abord elle jaunit, ensuite elle disparaît. L'ordre compte —
    // un fond où il reste des tiges brunes se lit autrement qu'un fond nu.
    const kelpAlive = clamp(biodiversity * 1.25, 0, 1)
    this.kelp.count = Math.round(this._kelpBaseCount * kelpAlive)
    this.kelp.material.opacity = lerp(0.55, 1, kelpAlive)
    // Les instances transparentes ne sont pas triées entre elles : tant que la
    // végétation est vigoureuse (opacité ≈ 1), autant la rendre opaque — plus
    // de blending, plus d'artefacts de superposition, et c'est moins cher.
    // La transparence ne s'active que quand elle se voit : végétation mourante.
    this.kelp.material.transparent = kelpAlive < 0.97
    for (let i = 0; i < this._kelpBaseCount; i++) {
      const v = this._kelpPlacements[i].r1
      const vigor = clamp(kelpAlive * (0.6 + 0.8 * v), 0, 1)
      this._kelpColors[i * 3]     = lerp(0.46, 0.20, vigor)
      this._kelpColors[i * 3 + 1] = lerp(0.38, 0.78, vigor)
      this._kelpColors[i * 3 + 2] = lerp(0.24, 0.34, vigor)
    }
    this.kelp.instanceColor.needsUpdate = true

    // Coraux : les couleurs de pigment partent les premières (blanchissement),
    // le squelette calcaire reste. D'où gris, jamais transparent.
    for (let i = 0; i < this._moundBaseCount; i++) {
      const p = this._moundPlacements[i]
      const coral = clamp(biodiversity * (0.4 + 1.0 * p.r2), 0, 1)
      const hue = p.r1
      const live = [
        lerp(0.22, 0.85, hue) * coral + 0.30 * (1 - coral),
        lerp(0.45, 0.30, hue) * coral + 0.29 * (1 - coral),
        lerp(0.52, 0.55, hue) * coral + 0.26 * (1 - coral),
      ]
      const dust = sediment * 0.5
      this._moundColors[i * 3]     = lerp(live[0], 0.26, dust)
      this._moundColors[i * 3 + 1] = lerp(live[1], 0.25, dust)
      this._moundColors[i * 3 + 2] = lerp(live[2], 0.21, dust)
    }
    this.mounds.instanceColor.needsUpdate = true

    // Neige marine : ce qui tombe des cages. Elle augmente quand la santé baisse.
    const snowLoad = clamp(0.12 + (1 - health) * 1.05, 0, 1)
    this.snow.geometry.setDrawRange(0, Math.round(this._snowCount * snowLoad))
    this.snowUniforms.uOpacity.value = lerp(0.12, 0.42, snowLoad)
    this.snowUniforms.uColor.value.setRGB(
      lerp(0.80, 0.62, sediment), lerp(0.84, 0.58, sediment), lerp(0.78, 0.46, sediment),
    )
  }

  /**
   * Absorption de l'eau de mer, par mètre et par canal.
   * Le rouge disparaît en une dizaine de mètres, le bleu traverse. C'est ce
   * seul jeu de trois nombres qui produit tout le virage doré → bleu de la
   * descente : aucune palette n'est interpolée à la main.
   */
  static ABSORPTION = [0.33, 0.047, 0.019]

  update(elapsed, camera, sky, pixelRatio) {
    const depth = Math.max(0, -camera.position.y)
    const extra = this._turbidity * 0.055
    const k = Underwater.ABSORPTION
    this.lightColor.setRGB(
      sky.sunColor.r * Math.exp(-(k[0] + extra) * depth),
      sky.sunColor.g * Math.exp(-(k[1] + extra) * depth),
      sky.sunColor.b * Math.exp(-(k[2] + extra) * depth),
    )
    // Teinte de l'eau normalisée sur son canal dominant : on garde la couleur,
    // on jette la luminance (qui appartient au brouillard, pas à la lumière).
    const peak = Math.max(this.waterColor.r, this.waterColor.g, this.waterColor.b, 1e-4)
    this.ambientColor.copy(this.waterColor).multiplyScalar(1 / peak)

    this.floorUniforms.uTime.value = elapsed
    this.floorUniforms.uCameraPos.value.copy(camera.position)
    this.floorUniforms.uSunColor.value.copy(this.lightColor)
    this.floorUniforms.uSunDirection.value.copy(sky.sunDirection)
    // Les caustiques sont dessinées par la surface : elles s'effacent avec la
    // profondeur, indépendamment de la turbidité.
    this.floorUniforms.uCausticStrength.value =
      this._causticBase * Math.exp(-depth / 42)
    this.snowUniforms.uTime.value = elapsed
    this.snowUniforms.uCameraPos.value.copy(camera.position)
    this.snowUniforms.uPixelRatio.value = pixelRatio
    if (this._kelpTime) this._kelpTime.value = elapsed
  }

  /** Le sous-marin ne coûte rien tant qu'on est en surface. */
  setVisible(visible) {
    this.group.visible = visible
  }
}
