export const oceanVertexShader = (WAVE_COUNT) => /* glsl */ `
precision highp float;

#define WAVE_COUNT ${WAVE_COUNT}

// uWaveA = (dirX, dirZ, amplitude, k)      k = 2π/λ
// uWaveB = (ω, phase, Q, λ)                Q = raideur de Gerstner
uniform vec4  uWaveA[WAVE_COUNT];
uniform vec4  uWaveB[WAVE_COUNT];
uniform float uTime;
uniform float uWaveScale;
uniform vec3  uCameraPos;

out vec3  vWorldPos;
out vec3  vNormal;
out float vFold;      // Jacobien du déplacement horizontal : < 1 ⇒ crête qui déferle
out float vDist;
out float vHeight01;  // hauteur relative dans la houle, 0 = creux, 1 = crête
out float vDetail;    // confiance accordée au micro-relief à cette distance

void main() {
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  world.y = 0.0;

  float dist = length(world.xz - uCameraPos.xz);

  vec3 displacement = vec3(0.0);
  // Tangentes accumulées : on dérive la surface au lieu de la reconstruire,
  // ce qui donne une normale exacte même avec le déplacement horizontal.
  vec3 dPdx = vec3(1.0, 0.0, 0.0);
  vec3 dPdz = vec3(0.0, 0.0, 1.0);
  float amplitudeSum = 0.0;
  float heightSum = 0.0;

  for (int i = 0; i < WAVE_COUNT; i++) {
    vec2  dir       = uWaveA[i].xy;
    float amplitude = uWaveA[i].z * uWaveScale;
    float k         = uWaveA[i].w;
    float omega     = uWaveB[i].x;
    float phase     = uWaveB[i].y;
    float Q         = uWaveB[i].z;
    float lambda    = uWaveB[i].w;

    // Atténuation par distance : une vague de 2 m n'a aucun sens à 3 km, et la
    // garder ne produit que du crénelage sur le spéculaire. Chaque longueur
    // d'onde s'éteint à ~90 fois sa propre valeur.
    float reach = lambda * 90.0;
    amplitude *= smoothstep(reach * 2.2, reach * 0.55, dist);
    if (amplitude <= 0.0) continue;

    float f = k * dot(dir, world.xz) - omega * uTime + phase;
    float s = sin(f);
    float c = cos(f);
    float ka = k * amplitude;

    displacement.xz -= Q * amplitude * dir * s;
    displacement.y  += amplitude * c;

    dPdx.x -= Q * ka * dir.x * dir.x * c;
    dPdx.z -= Q * ka * dir.x * dir.y * c;
    dPdx.y -= ka * dir.x * s;

    dPdz.x -= Q * ka * dir.x * dir.y * c;
    dPdz.z -= Q * ka * dir.y * dir.y * c;
    dPdz.y -= ka * dir.y * s;

    amplitudeSum += amplitude;
    heightSum += amplitude * c;
  }

  vec3 displaced = world + displacement;

  vNormal = normalize(cross(dPdz, dPdx));
  // Déterminant du jacobien horizontal. Sous 1, la surface se replie sur
  // elle-même : c'est exactement là que l'écume apparaît dans la réalité.
  vFold = dPdx.x * dPdz.z - dPdx.z * dPdz.x;
  vWorldPos = displaced;
  vDist = length(displaced - uCameraPos);
  vHeight01 = amplitudeSum > 0.0 ? clamp(heightSum / amplitudeSum * 0.5 + 0.5, 0.0, 1.0) : 0.5;
  vDetail = 1.0 - smoothstep(35.0, 900.0, dist);

  gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
}
`
