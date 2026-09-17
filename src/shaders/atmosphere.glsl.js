/**
 * Diffusion atmosphérique à simple rebond (modèle de Nishita).
 *
 * Pourquoi pas un dégradé peint : le coucher de soleil des images de référence
 * — soleil blanc au centre, halo or, ciel qui vire au gris-bleu en altitude —
 * n'est pas une rampe de couleurs, c'est la conséquence du trajet optique qui
 * s'allonge quand le soleil rase l'horizon. Un dégradé peint est juste à une
 * seule heure ; celui-ci reste juste à toutes, ce dont on a besoin puisque la
 * timeline saisonnière déplace le soleil.
 *
 * Le même code sert au dôme visible et à la capture cubemap qui éclaire l'océan,
 * donc l'eau reflète exactement le ciel qu'on voit — pas une approximation.
 */
export const ATMOSPHERE_GLSL = /* glsl */ `
#define PI 3.141592653589793

// Rayon planétaire et sommet de l'atmosphère, en mètres.
const float R_PLANET = 6371000.0;
const float R_ATMOS  = 6471000.0;
// Hauteurs d'échelle : Rayleigh (molécules) et Mie (aérosols).
const float SH_RAYLEIGH = 8000.0;
const float SH_MIE      = 1200.0;
// Coefficients de diffusion Rayleigh — la dépendance en 1/λ⁴ qui fait le bleu.
const vec3  K_RAYLEIGH = vec3(5.5e-6, 13.0e-6, 22.4e-6);
// Anisotropie de Mie : ~0.76 concentre la lumière vers l'avant (le halo solaire).
const float MIE_G = 0.76;

/** Intersection rayon / sphère centrée à l'origine. x > y ⇒ pas d'intersection. */
vec2 raySphere(vec3 ro, vec3 rd, float radius) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius * radius;
  float d = b * b - c;
  if (d < 0.0) return vec2(1.0, -1.0);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}

/**
 * Radiance du ciel dans la direction rd.
 *
 * turbidity  ~1.8 (air lavé après tempête) à ~4.5 (brume d'été)
 * sunDiscOn  1.0 pour le dôme visible, 0.0 pour la cubemap : le spéculaire
 *            solaire de l'océan est calculé analytiquement en GGX, et compter
 *            le disque deux fois donne une tache brûlée à la place d'un chemin.
 */
vec3 atmosphereRadiance(vec3 rd, vec3 sunDir, float turbidity, float sunIntensity, float sunDiscOn) {
  rd = normalize(rd);
  sunDir = normalize(sunDir);

  // Œil à 200 m au-dessus du sol : assez haut pour que l'horizon marin tienne.
  vec3 ro = vec3(0.0, R_PLANET + 200.0, 0.0);

  vec2 atmosHit = raySphere(ro, rd, R_ATMOS);
  if (atmosHit.x > atmosHit.y) return vec3(0.0);

  // Les aérosols montent avec la turbidité ; c'est eux qui blanchissent le ciel.
  float kMie = 21e-6 * (0.35 + 0.65 * turbidity / 4.0);

  vec2 groundHit = raySphere(ro, rd, R_PLANET);
  float far = atmosHit.y;
  bool hitsGround = groundHit.x <= groundHit.y && groundHit.x > 0.0;
  if (hitsGround) far = min(far, groundHit.x);

  float near = max(atmosHit.x, 0.0);
  float stepSize = (far - near) / float(VIEW_STEPS);

  vec3 sumRayleigh = vec3(0.0);
  vec3 sumMie = vec3(0.0);
  float odRayleigh = 0.0;
  float odMie = 0.0;
  float t = near;

  // Fonctions de phase — indépendantes de la position, calculées une fois.
  float mu = dot(rd, sunDir);
  float mumu = mu * mu;
  float gg = MIE_G * MIE_G;
  float phaseRayleigh = 3.0 / (16.0 * PI) * (1.0 + mumu);
  float phaseMie = 3.0 / (8.0 * PI) * ((1.0 - gg) * (mumu + 1.0))
                 / (pow(1.0 + gg - 2.0 * mu * MIE_G, 1.5) * (2.0 + gg));

  for (int i = 0; i < VIEW_STEPS; i++) {
    vec3 pos = ro + rd * (t + stepSize * 0.5);
    float height = length(pos) - R_PLANET;

    float dRayleigh = exp(-height / SH_RAYLEIGH) * stepSize;
    float dMie      = exp(-height / SH_MIE) * stepSize;
    odRayleigh += dRayleigh;
    odMie      += dMie;

    // Trajet secondaire : de ce point jusqu'au soleil.
    float lightFar = raySphere(pos, sunDir, R_ATMOS).y;
    float lightStep = lightFar / float(LIGHT_STEPS);
    float lightOdRayleigh = 0.0;
    float lightOdMie = 0.0;
    float lt = 0.0;

    for (int j = 0; j < LIGHT_STEPS; j++) {
      vec3 lpos = pos + sunDir * (lt + lightStep * 0.5);
      float lheight = length(lpos) - R_PLANET;
      lightOdRayleigh += exp(-lheight / SH_RAYLEIGH) * lightStep;
      lightOdMie      += exp(-lheight / SH_MIE) * lightStep;
      lt += lightStep;
    }

    vec3 transmittance = exp(
      -(K_RAYLEIGH * (odRayleigh + lightOdRayleigh) + kMie * (odMie + lightOdMie))
    );
    sumRayleigh += dRayleigh * transmittance;
    sumMie      += dMie * transmittance;
    t += stepSize;
  }

  vec3 color = sunIntensity * (phaseRayleigh * K_RAYLEIGH * sumRayleigh + phaseMie * kMie * sumMie);

  // Disque solaire, atténué par le trajet optique déjà accumulé sur la vue.
  if (sunDiscOn > 0.0 && !hitsGround) {
    // Rayon angulaire ~0.30°, proche du vrai (0.27°). Un disque plus large
    // se confond avec le halo de Mie et on perd le bord net qui fait lire
    // un coucher de soleil comme un coucher de soleil.
    float disc = smoothstep(0.99996, 0.999985, mu);
    vec3 viewTransmittance = exp(-(K_RAYLEIGH * odRayleigh + kMie * odMie));
    color += disc * sunIntensity * 45.0 * viewTransmittance * sunDiscOn;
  }

  return color;
}
`
