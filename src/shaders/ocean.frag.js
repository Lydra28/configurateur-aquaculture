import { NOISE_GLSL } from './noise.glsl.js'

export const oceanFragmentShader = () => /* glsl */ `
precision highp float;

${NOISE_GLSL}

uniform samplerCube uEnvMap;
uniform float uEnvMaxLod;
uniform vec3  uSunDirection;
uniform vec3  uSunColor;
uniform float uSunIntensity;
uniform vec3  uCameraPos;
uniform float uTime;

// --- pilotés par le modèle d'écosystème -----------------------------
uniform vec3  uDeepColor;      // couleur du volume d'eau en profondeur
uniform vec3  uScatterColor;   // ce que la crête laisse passer à contre-jour
uniform vec3  uFoamColor;      // blanc franc quand sain, beige sale quand non
uniform float uTurbidity;      // 0 = cristalline, 1 = soupe
uniform float uScum;           // film de surface : bloom + résidus de traitement
uniform float uWaveEnergy;
uniform float uSurfaceLevel;
uniform vec3  uFogColor;
uniform float uFogDensity;

in vec3  vWorldPos;
in vec3  vNormal;
in float vFold;
in float vDist;
in float vHeight01;
in float vDetail;

out vec4 fragColor;

const float IOR_WATER = 1.333;
const float F0_WATER  = 0.02;

float ggxDistribution(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d + 1e-7);
}

float smithVisibility(float NoV, float NoL, float a) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}

float fresnelSchlick(float cosTheta) {
  return F0_WATER + (1.0 - F0_WATER) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

/**
 * Micro-relief : trois octaves de clapot sous la résolution du maillage.
 * On ne déplace rien — on ne perturbe que la pente, ce qui suffit puisque
 * l'œil lit l'eau par son spéculaire, pas par sa silhouette.
 */
vec2 detailSlope(vec2 p, float fade) {
  if (fade <= 0.001) return vec2(0.0);
  vec2 slope = vec2(0.0);
  vec2 drift = vec2(uTime * 0.035, uTime * -0.021);

  slope += noised((p + drift * 7.0) * 0.085).yz * 0.55;
  slope += noised((p - drift * 11.0) * 0.21).yz * 0.30;
  slope += noised((p + drift * 19.0) * 0.52).yz * 0.16;

  return slope * fade * (0.45 + 0.55 * uWaveEnergy);
}

void main() {
  vec3 viewVec = uCameraPos - vWorldPos;
  float dist = length(viewVec);
  vec3 V = viewVec / dist;
  vec3 L = normalize(uSunDirection);

  bool underwater = uCameraPos.y < uSurfaceLevel;

  // --- Normale --------------------------------------------------------
  vec3 Ng = normalize(vNormal);
  // Passage normale → gradient de hauteur, pour additionner proprement le
  // micro-relief au relief de houle avant de reconstruire.
  vec2 gradient = vec2(-Ng.x, -Ng.z) / max(Ng.y, 0.05);
  gradient += detailSlope(vWorldPos.xz, vDetail);
  vec3 N = normalize(vec3(-gradient.x, 1.0, -gradient.y));
  if (underwater) N = -N;

  // Une normale qui passe derrière l'horizon de vue produit un spéculaire noir.
  float NoV = dot(N, V);
  if (NoV < 0.02) {
    N = normalize(N + V * (0.02 - NoV) * 1.2);
    NoV = max(dot(N, V), 0.02);
  }

  // --- Rugosité ------------------------------------------------------
  // La rugosité encode ce que le maillage ne résout PAS. Plus c'est loin,
  // plus il manque de micro-facettes, donc plus c'est rugueux — et c'est
  // précisément ce qui étire la tache solaire en un chemin jusqu'à l'horizon
  // au lieu d'un point brûlé. C'est un choix physique, pas un réglage d'artiste.
  float roughness = mix(0.30, 0.042, vDetail);
  roughness = mix(roughness, 0.22, uScum * 0.7);
  float alpha = max(roughness * roughness, 1e-3);

  vec3 color;

  if (!underwater) {
    // ================= VUE DEPUIS LA SURFACE =========================

    vec3 R = reflect(-V, N);
    // Sous l'horizon, le ciel n'existe pas : on replie le rayon vers le haut.
    // Un abs() laisserait un pli net exactement sur la ligne R.y = 0, bien
    // visible en mer calme. sqrt(y² + ε) est une valeur absolue LISSE : même
    // résultat, dérivée continue, pas d'arête.
    R.y = sqrt(R.y * R.y + 0.006) * 0.94 + 0.015;
    vec3 reflection = textureLod(uEnvMap, normalize(R), roughness * uEnvMaxLod * 0.85).rgb;

    // Spéculaire solaire analytique (le disque est retiré de la cubemap).
    vec3 H = normalize(V + L);
    float NoL = max(dot(N, L), 0.0);
    float NoH = max(dot(N, H), 0.0);
    // Le soleil n'est pas un point : il couvre ~0.53°. Élargir alpha de son
    // rayon angulaire (normalisation sphérique de Frostbite) donne un disque
    // réfléchi de la bonne taille au lieu d'un pic infini qu'il faudrait écrêter,
    // et c'est ce qui fait tenir le chemin de lumière à toutes les distances.
    const float SUN_ANGULAR_RADIUS = 0.0046;
    float alphaPrime = clamp(alpha + SUN_ANGULAR_RADIUS, 0.0, 1.0);
    float sphereNorm = (alpha / alphaPrime) * (alpha / alphaPrime);

    float D = ggxDistribution(NoH, alphaPrime) * sphereNorm;
    float Vis = smithVisibility(NoV, NoL, alpha);
    float Fs = fresnelSchlick(max(dot(H, V), 0.0));
    vec3 sunSpecular = uSunColor * uSunIntensity * D * Vis * Fs * NoL;
    sunSpecular = min(sunSpecular, vec3(400.0)); // garde-fou contre les firefly

    // --- Volume d'eau --------------------------------------------------
    // Beer-Lambert simplifié : sans géométrie de fond en vue hero, la teinte
    // profonde est le plateau vers lequel l'absorption converge.
    vec3 body = uDeepColor;

    // Translucidité de crête : la lumière traverse le sommet de la vague et
    // ressort côté observateur. C'est ce qui rend la mer vivante à contre-jour.
    float backlight = pow(max(dot(V, -normalize(reflect(L, N))), 0.0), 3.5);
    float thickness = pow(vHeight01, 2.0) * uWaveEnergy;
    float clarity = 1.0 - uTurbidity;
    vec3 subsurface = uScatterColor * uSunColor * backlight * thickness
                    * (0.35 + 0.65 * clarity) * 2.4;

    // Un peu de ciel diffus traverse aussi : sans ça l'eau est noire au zénith.
    vec3 ambient = textureLod(uEnvMap, vec3(0.0, 1.0, 0.0), uEnvMaxLod).rgb;
    body += ambient * uScatterColor * 0.22 * (0.4 + 0.6 * uTurbidity);
    body += subsurface;

    float F = fresnelSchlick(NoV) * (1.0 - roughness * 0.35);
    color = mix(body, reflection, F) + sunSpecular;

    // --- Écume ---------------------------------------------------------
    // Là où le jacobien passe sous 1, la surface se replie : c'est le déferlement.
    float fold = smoothstep(0.92, 0.42, vFold);
    float crest = smoothstep(0.78, 0.99, vHeight01) * uWaveEnergy * 0.55;
    float breakup = 0.55 + 0.45 * fbm(vWorldPos.xz * 0.55 + uTime * 0.05, 3);
    float foam = clamp((fold + crest) * breakup, 0.0, 1.0) * vDetail;

    // --- Film de surface : bloom algal et résidus ----------------------
    // Un film n'est pas une teinture : il s'accroche aux zones calmes, il tue
    // la réflexion et il diffuse. D'où le masque par (1 - pente).
    float calm = 1.0 - clamp(length(gradient) * 1.6, 0.0, 1.0);
    float scumMask = smoothstep(0.35, 0.85, fbm(vWorldPos.xz * 0.045 + uTime * 0.008, 3) * 0.5 + 0.5);
    float scum = uScum * scumMask * calm * vDetail;
    vec3 scumColor = mix(vec3(0.18, 0.26, 0.13), vec3(0.34, 0.31, 0.20), uScum) * (ambient * 0.8 + uSunColor * 0.5);
    color = mix(color, scumColor, scum * 0.72);

    color = mix(color, uFoamColor * (ambient * 0.55 + uSunColor * uSunIntensity * 0.045), foam);

    // --- Perspective aérienne + raccord à l'horizon ---------------------
    // Sans ça, la dernière rangée de triangles dessine une arête franche à la
    // jonction ciel/mer. On fond l'eau lointaine dans le ciel de la même direction.
    vec3 horizonDir = normalize(vec3(-V.x, max(-V.y, 0.0015), -V.z));
    vec3 horizonSky = textureLod(uEnvMap, horizonDir, uEnvMaxLod * 0.35).rgb;
    float aerial = smoothstep(700.0, 7000.0, dist);
    color = mix(color, horizonSky, aerial * 0.94);

  } else {
    // ================= VUE DEPUIS LE DESSOUS =========================
    // La fenêtre de Snell : au-delà de ~48.6° de l'aplomb, l'interface devient
    // un miroir parfait. C'est l'image la plus reconnaissable de la plongée,
    // et elle sort gratuitement de refract() qui renvoie 0 en réflexion totale.
    vec3 refracted = refract(-V, N, 1.0 / IOR_WATER);
    float totalInternal = step(length(refracted), 0.001);

    vec3 throughSurface = textureLod(
      uEnvMap, normalize(length(refracted) > 0.001 ? refracted : vec3(0.0, 1.0, 0.0)),
      roughness * uEnvMaxLod * 0.6
    ).rgb;

    vec3 mirrored = uDeepColor * 1.35 + uScatterColor * 0.3;
    color = mix(throughSurface, mirrored, totalInternal);

    // L'eau trouble referme la fenêtre : à 1 de turbidité on ne voit plus le ciel.
    color = mix(color, uDeepColor * 1.2, uTurbidity * 0.75);

    float depth = clamp((uSurfaceLevel - uCameraPos.y) / 55.0, 0.0, 1.0);
    color = mix(color, uDeepColor, depth * (0.35 + 0.5 * uTurbidity));

    // Même brouillard que le reste du monde immergé. Sans lui, la surface
    // lointaine s'arrête sur une arête franche là où le plan d'eau passe
    // sous l'horizon — l'artefact le plus visible de toute la plongée.
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));
  }

  fragColor = vec4(max(color, vec3(0.0)), 1.0);
}
`
