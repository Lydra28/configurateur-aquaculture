import { clamp } from '../core/math.js'

const GRAVITY = 9.81

/** LCG : mêmes vagues à chaque rechargement, donc mêmes captures de référence. */
function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Spectre de houle : un jeu de vagues de Gerstner échelonnées géométriquement.
 *
 * On n'échantillonne pas un spectre de Pierson-Moskowitz par FFT — ce serait
 * plus juste, mais ça demande des textures et une passe de calcul. Dix vagues
 * analytiques suffisent visuellement dès lors que les longueurs d'onde sont
 * étalées sur deux décades et que les directions s'ouvrent quand la longueur
 * d'onde diminue : c'est ce qui casse la répétition qu'on voit sur les eaux
 * « à trois sinusoïdes ».
 */
export function buildWaveSet({
  count = 10,
  longest = 92,
  shortest = 1.9,
  windDirectionDeg = 152,
  steepness = 0.82,
  seed = 20260915,
} = {}) {
  const rand = seededRandom(seed)
  const ratio = Math.pow(shortest / longest, 1 / (count - 1))
  const windRad = (windDirectionDeg * Math.PI) / 180

  const waves = []
  let amplitudeTotal = 0

  for (let i = 0; i < count; i++) {
    const lambda = longest * Math.pow(ratio, i)
    const k = (2 * Math.PI) / lambda

    // Les courtes vagues partent dans tous les sens, les longues tiennent le cap
    // du vent. Sans cet élargissement, la mer a l'air peignée.
    const spread = (14 + 62 * (i / (count - 1))) * (Math.PI / 180)
    const angle = windRad + (rand() * 2 - 1) * spread

    // Cambrure à peu près constante : l'amplitude suit la longueur d'onde.
    const amplitude = lambda * 0.021 * (0.55 + 0.45 * Math.pow(1 - i / count, 0.8))

    waves.push({
      lambda, k, amplitude,
      dirX: Math.cos(angle),
      dirZ: Math.sin(angle),
      omega: Math.sqrt(GRAVITY * k),   // dispersion en eau profonde
      phase: rand() * Math.PI * 2,
    })
    amplitudeTotal += amplitude
  }

  // Raideur de Gerstner répartie : la somme des Q·k·A doit rester sous 1,
  // sinon la surface se retourne sur elle-même et produit des nœuds.
  for (const w of waves) {
    w.Q = clamp(steepness / (w.k * amplitudeTotal), 0, 1 / (w.k * w.amplitude * count))
  }

  return waves
}

/** Aplatit le jeu de vagues dans les deux tableaux vec4 attendus par le shader. */
export function packWaves(waves, Vector4) {
  const a = waves.map((w) => new Vector4(w.dirX, w.dirZ, w.amplitude, w.k))
  const b = waves.map((w) => new Vector4(w.omega, w.phase, w.Q, w.lambda))
  return { a, b }
}
