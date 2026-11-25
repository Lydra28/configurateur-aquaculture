/**
 * Détail des roches, sans texture : la matière reste stylisée (facettes à
 * plat), on lui ajoute ce que la photo de référence montre et qu'une couleur
 * unie par bloc ne peut pas dire — marbrure du grain, strates, vie cantonnée
 * au dessus, assise sombre au contact du sable, facettes légèrement bosselées.
 *
 * Tout est pondéré par `detail` : 0 rend la couleur et la normale d'origine.
 * Requiert NOISE_GLSL (noised) inclus avant.
 */
export const ROCK_DETAIL_GLSL = /* glsl */ `
void rockDetail(
  inout vec3 albedo, inout vec3 viewNormal,
  vec3 p, float height, float seed, mat4 view,
  float detail, float relief, float strata
) {
  // Coupé : ni bruit ni renormalisation, la couleur et la normale sortent intactes.
  if (detail <= 0.0) return;
  vec3 n1 = noised(p.xz * 0.9 + p.y * 0.35);
  vec3 n2 = noised(p.xy * 1.1 + p.z * 0.6 + 31.0);
  float grain = (n1.x + n2.x) * 0.5;
  float speck = noised(p.xz * 5.3 + p.y * 4.1).x;

  vec3 rock = albedo * (1.0 + 0.32 * grain + 0.12 * speck);
  // Strates : fines lignes sombres quasi horizontales, ondulées par le grain.
  float band = abs(sin(p.y * 2.6 + grain * 2.2));
  rock *= 1.0 - strata * 0.2 * smoothstep(0.9, 1.0, band);
  // Chaque bloc tire un peu vers le chaud ou le froid : un chaos, pas un lot.
  rock *= mix(vec3(1.07, 1.0, 0.91), vec3(0.92, 0.99, 1.08), seed);
  // La vie encroûtante tient sur le dessus ; les flancs redeviennent minéraux.
  vec3 worldNormal = normalize((vec4(viewNormal, 0.0) * view).xyz);
  float flank = 1.0 - clamp(worldNormal.y, 0.0, 1.0);
  float luma = dot(rock, vec3(0.299, 0.587, 0.114));
  rock = mix(rock, luma * vec3(1.03, 1.0, 0.95), 0.6 * flank);
  // Assise : la roche s'assombrit là où elle s'enfonce dans le sable.
  rock *= mix(0.58, 1.0, smoothstep(0.0, 0.5, height));

  albedo = mix(albedo, rock, detail);
  vec3 bump = vec3(n1.y + n2.y, n2.z, n1.z);
  viewNormal = normalize(viewNormal - (view * vec4(bump, 0.0)).xyz * relief * detail);
}
`
