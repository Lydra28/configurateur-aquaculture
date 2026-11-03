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

// Valeurs proposées, volontairement discrètes : ombres tirées vers le bleu
// canard (cohérent avec la colonne d'eau), hautes lumières réchauffées
// (soleil, écume), le tout sous le seuil où l'image « sent » le filtre.
export const GRADING_DEFAULTS = {
  contrast: 1.05,
  saturation: 1.08,
  splitStrength: 0.35,
  shadowTint: 0x3d6a78,
  highlightTint: 0x96806a,
  vignette: 0.22,
}

export class GradingPass extends ShaderPass {
  constructor() {
    super({
      uniforms: {
        tDiffuse: { value: null },
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
