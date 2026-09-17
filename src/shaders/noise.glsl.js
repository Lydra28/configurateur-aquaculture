/**
 * Bruit de gradient 2D avec dérivées analytiques (méthode d'Inigo Quilez).
 *
 * Les dérivées comptent plus que la valeur : c'est la PENTE qui perturbe la
 * normale de l'eau, pas la hauteur. La calculer analytiquement plutôt que par
 * différences finies évite trois évaluations supplémentaires par octave et
 * donne une normale exacte au lieu d'approchée — visible sur le spéculaire.
 *
 * Retourne vec3(valeur, d/dx, d/dy).
 */
export const NOISE_GLSL = /* glsl */ `
vec2 hashGrad(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

vec3 noised(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  // Quintique : dérivée seconde continue, donc pas de discontinuité visible
  // sur le spéculaire aux frontières de cellules.
  vec2 u  = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

  vec2 ga = hashGrad(i + vec2(0.0, 0.0));
  vec2 gb = hashGrad(i + vec2(1.0, 0.0));
  vec2 gc = hashGrad(i + vec2(0.0, 1.0));
  vec2 gd = hashGrad(i + vec2(1.0, 1.0));

  float va = dot(ga, f - vec2(0.0, 0.0));
  float vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0));
  float vd = dot(gd, f - vec2(1.0, 1.0));

  float value = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * (va - vb - vc + vd);
  vec2 deriv = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
             + du * (u.yx * (va - vb - vc + vd) + vec2(vb, vc) - va);

  return vec3(value, deriv);
}

/** Bruit scalaire simple, pour les masques (taches de scum, rupture d'écume). */
float fbm(vec2 p, int octaves) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < octaves; i++) {
    sum += amp * noised(p).x;
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
`
