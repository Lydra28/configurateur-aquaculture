/**
 * Caustiques : le réseau lumineux que la houle projette sur le fond.
 *
 * Deux couches de |bruit| en opposition (lignes claires là où le bruit passe
 * par zéro) dessinent les cellules. Une grande couche lente porte la lecture
 * de loin — à 50 m de fond, la lumière arrive large et floue — et une couche
 * serrée et plus rapide ajoute le scintillement. Le carré (et non la
 * puissance 4 d'origine) garde des cellules douces plutôt que des fils.
 *
 * Requiert NOISE_GLSL (noised) inclus avant.
 */
export const CAUSTICS_GLSL = /* glsl */ `
float causticNet(vec2 p, float t) {
  float a = abs(noised(p + vec2(t * 0.035, -t * 0.022)).x);
  float b = abs(noised(p * 1.37 - vec2(t * 0.025, t * 0.04)).x);
  float net = 1.0 - clamp((a + b) * 2.2, 0.0, 1.0);
  return net * net;
}

float caustics(vec2 worldXZ, float t, float scale) {
  float big = causticNet(worldXZ * scale, t);
  float fine = causticNet(worldXZ * scale * 2.7 + 17.0, t * 1.6);
  return big * (0.7 + 0.6 * fine);
}
`
