import * as THREE from 'three'
import { ATMOSPHERE_GLSL } from '../shaders/atmosphere.glsl.js'
import { DEG, clamp } from '../core/math.js'

const VERT = /* glsl */ `
uniform mat4 uInverseProjection;
uniform mat4 uCameraWorld;

out vec3 vDirection;

void main() {
  // Triangle plein écran : position.xy arrive déjà en coordonnées NDC.
  // On remonte le rayon de vue par la projection inverse plutôt que de
  // dessiner un dôme géométrique — un dôme doit suivre la caméra, être assez
  // grand, et ne jamais être coupé par le near plane. Trois occasions de se
  // tromper qui disparaissent ici : le ciel couvre exactement l ecran, toujours.
  vec4 viewRay = uInverseProjection * vec4(position.xy, -1.0, 1.0);
  vDirection = mat3(uCameraWorld) * (viewRay.xyz / viewRay.w);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`

const FRAG = (viewSteps, lightSteps) => /* glsl */ `
precision highp float;
#define VIEW_STEPS ${viewSteps}
#define LIGHT_STEPS ${lightSteps}

${ATMOSPHERE_GLSL}

uniform vec3  uSunDirection;
uniform float uTurbidity;
uniform float uSunIntensity;
uniform float uSunDisc;

in vec3 vDirection;
out vec4 fragColor;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

/**
 * Champ d'étoiles : cellules 3D sur la direction de vue, une cellule sur ~60
 * porte une étoile. Pas de texture, pas d'état : la voûte est identique à
 * chaque frame et à chaque face de la cubemap — l'océan reflète donc les mêmes
 * étoiles que celles qu'on voit.
 */
vec3 starField(vec3 d) {
  vec3 p = d * 160.0;
  vec3 id = floor(p);
  float h = hash13(id);
  if (h < 0.984) return vec3(0.0);
  vec3 offs = vec3(hash13(id + 17.0), hash13(id + 29.0), hash13(id + 47.0)) - 0.5;
  float r = length(fract(p) - 0.5 - offs * 0.55);
  float star = smoothstep(0.32, 0.0, r);
  star *= star * star;
  float mag = 0.30 + 0.70 * hash13(id + 71.0);
  // Teintes réelles : du blanc-orangé (froides) au blanc-bleuté (chaudes).
  vec3 tint = mix(vec3(1.0, 0.85, 0.70), vec3(0.76, 0.86, 1.0), hash13(id + 5.0));
  return tint * star * mag;
}

void main() {
  vec3 dir = normalize(vDirection);
  vec3 color = atmosphereRadiance(
    dir, uSunDirection, uTurbidity, uSunIntensity, uSunDisc
  );

  // Nuit : sans elle, la timeline nocturne donnait un écran noir. Les étoiles
  // montent quand le soleil passe sous l'horizon ; le crépuscule les efface
  // naturellement parce qu'elles s'ajoutent à un ciel encore lumineux.
  float night = smoothstep(0.03, -0.12, uSunDirection.y);
  if (night > 0.001 && dir.y > 0.0) {
    float horizon = smoothstep(0.0, 0.10, dir.y);
    color += starField(dir) * night * horizon * 1.4;
    // Lueur résiduelle du ciel nocturne (airglow) : le noir absolu n'existe pas.
    color += vec3(0.0009, 0.0014, 0.0024) * night * horizon;
  }

  fragColor = vec4(color, 1.0);
}
`

/**
 * Ciel physique + cubemap d'environnement.
 *
 * La cubemap est re-rendue seulement quand le soleil ou la turbidité bougent
 * (drapeau dirty). Immobile, elle ne coûte rien ; pendant qu'on scrubbe la
 * timeline, elle coûte une passe basse résolution par frame.
 */
export class Sky {
  constructor(renderer, { envSize = 128 } = {}) {
    this.renderer = renderer
    this.sunDirection = new THREE.Vector3(0, 0.2, -1).normalize()
    this.sunColor = new THREE.Color(1, 1, 1)
    this.sunIntensity = 22
    this.turbidity = 2.6
    this._dirty = true

    const uniforms = () => ({
      uSunDirection: { value: this.sunDirection },
      uTurbidity: { value: this.turbidity },
      uSunIntensity: { value: this.sunIntensity },
      uSunDisc: { value: 1 },
      uInverseProjection: { value: new THREE.Matrix4() },
      uCameraWorld: { value: new THREE.Matrix4() },
    })

    // Dôme visible : intégration fine, le ciel occupe la moitié de l'écran.
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG(16, 8),
      uniforms: uniforms(),
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })

    // Capture d'environnement : moins de pas, et sans disque solaire — l'océan
    // calcule son spéculaire analytiquement (voir atmosphere.glsl.js).
    this.envMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG(10, 5),
      uniforms: { ...uniforms(), uSunDisc: { value: 0 } },
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })

    // Les matrices sont posées dans onBeforeRender, qui reçoit la caméra
    // réellement utilisée. C'est ce qui fait fonctionner le même mesh pour la
    // vue principale ET pour les six faces de la CubeCamera, sans code spécial.
    const bindCamera = (material) => (renderer, scene, cam) => {
      material.uniforms.uInverseProjection.value.copy(cam.projectionMatrixInverse)
      material.uniforms.uCameraWorld.value.copy(cam.matrixWorld)
    }

    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1000
    this.mesh.onBeforeRender = bindCamera(this.material)

    // Scène dédiée à la capture : le cube ne voit que lui-même.
    this.envScene = new THREE.Scene()
    this.envMesh = new THREE.Mesh(geometry, this.envMaterial)
    this.envMesh.frustumCulled = false
    this.envMesh.onBeforeRender = bindCamera(this.envMaterial)
    this.envScene.add(this.envMesh)

    this.cubeTarget = new THREE.WebGLCubeRenderTarget(envSize, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    })
    this.cubeCamera = new THREE.CubeCamera(0.1, 10, this.cubeTarget)

    // log2(envSize) — le nombre de niveaux de mip disponibles pour la rugosité.
    this.envMaxLod = Math.log2(envSize)
  }

  get envMap() { return this.cubeTarget.texture }

  /** Place le soleil. Angles en degrés, azimut 0 = +Z. */
  setSun(elevationDeg, azimuthDeg) {
    const phi = (90 - elevationDeg) * DEG
    const theta = azimuthDeg * DEG
    this.sunDirection.setFromSphericalCoords(1, phi, theta)
    this._dirty = true
    this._updateSunColor(elevationDeg)
  }

  setTurbidity(t) {
    this.turbidity = t
    this.material.uniforms.uTurbidity.value = t
    this.envMaterial.uniforms.uTurbidity.value = t
    this._dirty = true
  }

  /**
   * Couleur du soleil vue du sol : la même extinction que le shader, intégrée
   * une seule fois sur le CPU. Sert à éclairer tout ce qui n'est pas le ciel
   * (écume, particules, fond) avec une teinte cohérente avec l'heure.
   */
  _updateSunColor(elevationDeg) {
    const el = Math.max(elevationDeg, -3) * DEG
    // Approximation de Kasten-Young de la masse d'air, valable jusqu'à l'horizon.
    const zenith = Math.PI / 2 - el
    const cosZ = Math.max(Math.cos(zenith), 0.005)
    const airMass = 1 / (cosZ + 0.15 * Math.pow(93.885 - (zenith / DEG), -1.253))

    const kR = [0.0075, 0.0177, 0.0305]  // épaisseurs optiques Rayleigh par canal
    const kM = 0.012 * (0.35 + 0.65 * this.turbidity / 4)
    const rgb = kR.map((k) => Math.exp(-(k + kM) * airMass * 12))

    const dim = clamp((elevationDeg + 4) / 8, 0, 1)
    this.sunColor.setRGB(rgb[0] * dim, rgb[1] * dim, rgb[2] * dim)
    this.sunLuminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) * dim
  }

  /** Re-rend la cubemap si nécessaire. À appeler avant le rendu principal. */
  update(renderer) {
    if (!this._dirty) return false
    this.cubeCamera.update(renderer, this.envScene)
    this._dirty = false
    return true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.envMaterial.dispose()
    this.cubeTarget.dispose()
  }
}
