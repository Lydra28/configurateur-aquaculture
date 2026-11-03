export const gradingFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;

// --- étalonnage global (opère APRÈS tone mapping, en espace écran) ----
uniform float uContrast;      // 1 = neutre ; pivot au gris moyen
uniform float uSaturation;    // 1 = neutre ; via luminance perçue
uniform float uSplitStrength; // force du virage ombres/hautes lumières
uniform vec3  uShadowTint;    // teinte poussée dans les ombres
uniform vec3  uHighlightTint; // teinte poussée dans les hautes lumières
uniform float uVignette;      // 0 = aucun assombrissement des bords

varying vec2 vUv;

void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  vec3 c = texel.rgb;

  // Contraste autour du gris moyen : après ACES l'image vit déjà en 0-1,
  // le pivot 0.5 garde l'exposition générale intacte.
  c = (c - 0.5) * uContrast + 0.5;

  // Saturation par rapport à la luminance perçue (Rec. 709).
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, uSaturation);

  // Virage partagé (split-toning) : les teintes sont stockées en couleur
  // écran mais appliquées en écart signé autour du gris — une teinte à 0.5
  // est donc neutre, et le réglage reste lisible dans un sélecteur couleur.
  vec3 shadowShift = uShadowTint - 0.5;
  vec3 highlightShift = uHighlightTint - 0.5;
  float zone = smoothstep(0.15, 0.85, luma);
  c += mix(shadowShift, highlightShift, zone) * uSplitStrength * 0.2;

  // Vignettage doux : recentre le regard sans bord noir franc.
  float dist = distance(vUv, vec2(0.5));
  c *= 1.0 - uVignette * smoothstep(0.38, 0.78, dist);

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
}
`
