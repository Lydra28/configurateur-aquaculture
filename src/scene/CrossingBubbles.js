import * as THREE from 'three'

/**
 * Bouffée de bulles à la traversée de la surface.
 *
 * Avant : le passage sous l'eau n'était qu'un fondu de brouillard — doux mais
 * sans événement, alors que c'est LE moment charnière du récit. Un burst de
 * bulles marque physiquement la traversée, dans les deux sens.
 *
 * Zéro allocation par déclenchement : les particules existent en permanence,
 * seuls uBurstTime et uOrigin changent. Hors burst, le vertex shader écrase
 * la taille à 0 et le fragment discard — coût nul à l'écran.
 */

const VERT = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uBurstTime;
uniform vec3  uOrigin;
uniform float uPixelRatio;

// L'attribut position est injecté par ShaderMaterial : direction initiale (sphère unité, biaisée vers le haut)
in vec4 seed;       // x, y, z : aléas divers — w : fraction de vie

out float vAlpha;

void main() {
  float life = 1.1 + seed.w * 0.9;
  float t = uTime - uBurstTime;
  float a = t / life;

  if (a < 0.0 || a > 1.0) {
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0); // hors clip
    return;
  }

  // Expansion rapide puis freinée (traînée de l'eau), et remontée : une bulle
  // décélère horizontalement mais accélère vers la surface.
  float spread = 1.0 + 4.5 * pow(a, 0.55);
  vec3 p = uOrigin + position * spread;
  p.y += (2.2 + seed.x * 2.4) * a * a + 0.7 * a;
  p.x += sin(uTime * 3.0 + seed.y * 40.0) * 0.12 * a;
  p.z += cos(uTime * 2.6 + seed.z * 40.0) * 0.12 * a;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 0.5);
  float fade = 1.0 - a;
  vAlpha = fade * fade * (0.4 + 0.6 * seed.w);
  gl_PointSize = (10.0 + seed.y * 26.0) * (0.6 + 0.4 * fade) * uPixelRatio / dist;
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
precision highp float;

uniform vec3 uColor;
in float vAlpha;
out vec4 fragColor;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  // Une bulle n'est pas un disque plein : bord brillant, cœur presque vide.
  float rim = smoothstep(0.5, 0.38, r) * smoothstep(0.16, 0.34, r);
  float core = smoothstep(0.20, 0.0, r) * 0.25;
  float a = (rim + core) * vAlpha;
  if (a < 0.015) discard;
  fragColor = vec4(uColor, a);
}
`

export class CrossingBubbles {
  constructor({ count = 240 } = {}) {
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      // Directions sur la sphère, biaisées vers le haut : on traverse une
      // nappe, la gerbe part surtout à l'horizontale et au-dessus.
      const u = Math.random() * 2 - 1
      const phi = Math.random() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      positions[i * 3] = Math.cos(phi) * s
      positions[i * 3 + 1] = Math.abs(u) * 0.8 + 0.1
      positions[i * 3 + 2] = Math.sin(phi) * s
      seeds[i * 4] = Math.random()
      seeds[i * 4 + 1] = Math.random()
      seeds[i * 4 + 2] = Math.random()
      seeds[i * 4 + 3] = Math.random()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

    this.uniforms = {
      uTime: { value: 0 },
      uBurstTime: { value: -1e9 },
      uOrigin: { value: new THREE.Vector3() },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color(0.78, 0.92, 0.96) },
    }
    this.points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }))
    this.points.frustumCulled = false
    this.points.renderOrder = 6

    this._forward = new THREE.Vector3()
  }

  /** Déclenche la gerbe devant la caméra, à la ligne d'eau. */
  trigger(camera, elapsed) {
    camera.getWorldDirection(this._forward)
    this.uniforms.uOrigin.value
      .copy(camera.position)
      .addScaledVector(this._forward, 3.5)
    this.uniforms.uOrigin.value.y = Math.min(this.uniforms.uOrigin.value.y, -0.4)
    this.uniforms.uBurstTime.value = elapsed
  }

  update(elapsed, pixelRatio) {
    this.uniforms.uTime.value = elapsed
    this.uniforms.uPixelRatio.value = pixelRatio
  }

  dispose() {
    this.points.geometry.dispose()
    this.points.material.dispose()
  }
}
