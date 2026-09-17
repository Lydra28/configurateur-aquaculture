/**
 * Bruit de valeur 2D, version JS — la SEULE source de vérité du relief du fond.
 *
 * ATTENTION : noise.glsl.js n'est PAS le même bruit (ici un value noise, là un
 * gradient noise, formules différentes). Ça ne pose aucun problème aujourd'hui
 * parce que le relief est calculé ici puis CUIT dans la géométrie du sol — le
 * GLSL ne sert qu'aux caustiques et au grain, jamais à la hauteur. Le jour où
 * un déplacement de relief côté GPU devient nécessaire, ne pas se fier à une
 * correspondance qui n'existe pas : cuire les hauteurs CPU dans une texture.
 * Pour POSER un objet sur le fond (corail enfoui, roche), utiliser floorHeight()
 * d'Underwater.js, qui passe par ce fichier.
 */
function hash(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return h - Math.floor(h)
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)

export function valueNoise2D(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = fade(fx), uy = fade(fy)

  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)

  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1
}

export function fbm2D(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let sum = 0, amp = 0.5, fx = x, fy = y
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(fx, fy)
    fx *= lacunarity; fy *= lacunarity
    amp *= gain
  }
  return sum
}
