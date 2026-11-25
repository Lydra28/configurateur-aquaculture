import { Color, LinearSRGBColorSpace } from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { gradingFragmentShader } from '../shaders/grading.frag.js'

// Ces teintes vivent en espace ÉCRAN, comme l'image qu'elles corrigent :
// on contourne la gestion couleur de three (qui convertirait l'hex vers le
// linéaire) pour que la couleur du sélecteur soit celle du shader.
const screenColor = (hex) => new Color().setHex(hex, LinearSRGBColorSpace)

/**
 * Passe d'étalonnage couleur — le dernier mot sur l'image, APRÈS le tone
 * mapping (OutputPass) : on règle donc ce que l'œil voit, comme dans un
 * logiciel photo, sans toucher à l'équilibre HDR de la scène.
 *
 * Additive et débrayable (`pass.enabled = false` → image strictement
 * identique à avant son ajout) : le décor validé n'est pas retouché.
 * Réglages en direct : URL ?debug, dossier « Étalonnage ».
 */

// Ambiance « carte postale », choisie par Romain le 25/11/2026 sur planche
// comparative : couleurs franches, ombres tirées vers le bleu (la colonne
// d'eau), hautes lumières dorées (soleil, écume). Réglage précédent, plus
// discret : 1 / 1,05 / 1,08 / 0,35 / 0x3d6a78 / 0x96806a / 0,22.
export const GRADING_DEFAULTS = {
  exposure: 1.04,
  contrast: 1.1,
  saturation: 1.28,
  splitStrength: 0.55,
  shadowTint: 0x30709c,
  highlightTint: 0xb8905a,
  vignette: 0.26,
}

export class GradingPass extends ShaderPass {
  constructor() {
    super({
      uniforms: {
        tDiffuse: { value: null },
        uExposure: { value: GRADING_DEFAULTS.exposure },
        uContrast: { value: GRADING_DEFAULTS.contrast },
        uSaturation: { value: GRADING_DEFAULTS.saturation },
        uSplitStrength: { value: GRADING_DEFAULTS.splitStrength },
        uShadowTint: { value: screenColor(GRADING_DEFAULTS.shadowTint) },
        uHighlightTint: { value: screenColor(GRADING_DEFAULTS.highlightTint) },
        uVignette: { value: GRADING_DEFAULTS.vignette },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: gradingFragmentShader,
    })
  }
}
