# NEMO — scène océan configurable

Scène Three.js pour un site de sensibilisation à l'impact de l'aquaculture
intensive. On entre par une surface d'eau au couchant, on scrolle, on traverse
la surface, on descend jusqu'au fond. L'état du milieu — vivant ou désert — est
piloté par deux choses : **la configuration de l'exploitation** et **le temps
écoulé depuis sa mise en eau**.

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev -- --open
```

Panneau de réglage : ajouter `?debug` à l'URL (`H` pour le masquer).
Il contient trois scénarios prêts à comparer et une lecture automatique de la
timeline.

---

## Ce qui est fini, et ce qui ne l'est pas

| Bloc | État |
|---|---|
| Surface de l'eau (houle, réflexions, spéculaire solaire, écume, film de surface) | **fini** — c'est la scène travaillée à fond |
| Ciel physique + environnement dynamique | **fini** |
| Modèle d'écosystème (configurateur + saisons) | **fini** côté structure, coefficients à valider |
| Plongée au scroll, traversée de la surface | **fini** |
| Monde subaquatique (fond, relief, algues, coraux, neige marine, caustiques) | **ossature** — lit déjà l'état d'écosystème, mais le contenu est générique |
| Côte terrestre | **absent** |
| Ferme-usine flottante (cages, filets, pontons) | **absent** |
| Poissons, bancs, faune mobile | **absent** |

Les trois derniers se branchent sur ce qui existe : ils lisent `NEMO.state` et
n'ont pas besoin de toucher aux shaders.

---

## Architecture

```
src/
  state/ecosystem.js     ← le modèle. Deux entrées, une sortie.
  scene/Sky.js           ← diffusion atmosphérique + cubemap d'environnement
  scene/Ocean.js         ← grille radiale, spectre de houle, matériau
  scene/waves.js         ← génération du spectre de Gerstner
  scene/Underwater.js    ← fond, végétation, coraux, neige marine
  camera/ScrollDive.js   ← trajectoire de plongée + cadrage du soleil
  shaders/               ← GLSL, en modules séparés et commentés
  ui/DebugPanel.js       ← lil-gui, chargé seulement avec ?debug
```

**La règle qui tient l'ensemble :** aucun module graphique ne connaît la notion
de densité d'élevage ou de saison. `ecosystem.js` produit un objet d'état
(`health`, `turbidity`, `biodiversity`, `waveEnergy`, `sunElevation`…) et chaque
module de scène a une méthode `applyEcosystem(state)` qui le traduit en couleurs,
en densités et en paramètres de shader.

Conséquence pratique : remplacer le modèle biologique par un vrai — celui d'un
organisme scientifique, ou une grille validée par un aquaculteur — ne demande de
toucher qu'`ecosystem.js`. Rien dans le GLSL ne bougera.

---

## Piloter la scène

Depuis n'importe où dans la page :

```js
NEMO.configure({ stockDensity: 38, feedConversion: 2.2, mitigation: 0 })
NEMO.seek(312)              // semaine 312 ≈ 6 ans d'exploitation
NEMO.state                  // l'état dérivé, en lecture
NEMO.store.subscribe(fn)    // pour synchroniser une UI de configurateur
NEMO.snap()                 // se placer sans transition (ancre, capture)
```

### Les entrées du configurateur

| Champ | Unité | Effet dominant |
|---|---|---|
| `areaHa` | hectares | emprise, sous-linéaire |
| `stockDensity` | kg/m³ | **le levier principal** — nutriments et dépôt |
| `feedConversion` | kg aliment / kg produit | aliment perdu, donc nutriments |
| `treatments` | 0–1 | charge chimique |
| `waterExchange` | 0–1 | dispersion : divise toutes les charges |
| `mitigation` | 0–1 | IMTA, filtration, jachères |
| `offshore` | 0–1 | dispersion supplémentaire |

### Les trois régimes de dégradation

Ils n'ont pas la même temporalité, et c'est le cœur du propos :

- **Nutriments** — effet en quelques semaines, largement réversible. L'hiver
  rebrasse et évacue.
- **Bloom algal** — nutriments **multipliés par** la température. Un excès
  d'azote en février ne bloome pas ; il attend l'eau à 18°.
- **Dépôt organique** — lent, cumulatif, quasi irréversible. C'est lui qui fait
  basculer un fond vers le désert, sur des années, et il ne revient pas quand
  l'eau se réoxygène.

D'où la forme des courbes : une exploitation raisonnable oscille avec les
saisons sans dériver, une exploitation intensive en baie fermée s'effondre en
une année et ne remonte plus.

---

## Choix techniques qui méritent une ligne

**Grille radiale à pas exponentiel plutôt qu'un plan régulier.** À 8 km, deux
sommets voisins d'un plan régulier tombent sur le même pixel pendant qu'au
premier plan la houle est sous-échantillonnée. Le pas exponentiel donne une
densité à peu près constante *à l'écran*, qui est le seul critère qui compte.

**La rugosité de l'eau augmente avec la distance.** Elle encode ce que le
maillage ne résout pas. C'est ce qui étire la tache solaire en un chemin
jusqu'à l'horizon au lieu d'un point brûlé — un choix physique, pas un réglage
d'artiste.

**Ciel calculé, pas peint.** Un dégradé peint est juste à une seule heure.
La timeline saisonnière déplace le soleil, donc le ciel est intégré (Rayleigh +
Mie) et capturé dans une cubemap qui sert de réflexion à l'eau : l'océan
reflète exactement le ciel qu'on voit.

**La couleur de la descente vient de trois nombres.** `Underwater.ABSORPTION`
donne l'absorption par mètre et par canal. Le virage doré → bleu-vert n'est pas
une palette interpolée, c'est le rouge qui disparaît en dix mètres.

**Le cadrage du soleil est asservi, pas calculé.** `ScrollDive.aimSun` mesure
où le soleil se projette à l'écran et corrige le cap. Une formule fermée se
tromperait dès qu'on touche au FOV, au ratio de la fenêtre ou à une clé de
trajectoire.

---

## Performance

- Cible : 60 fps en 1440p sur GPU dédié, 30 fps sur GPU intégré.
- La cubemap de ciel n'est re-rendue que si le soleil ou la turbidité changent.
- Le monde subaquatique est masqué tant qu'on est en surface.
- Résolution adaptative : après 90 frames lentes, le pixel ratio descend d'un
  cran, une seule fois, sans jamais remonter (pour ne pas osciller).

Les deux postes les plus chers sont l'intégration atmosphérique (16 × 8
échantillons sur le ciel visible) et la grille d'océan (200 × 256). Ce sont les
deux premiers chiffres à baisser sur cible mobile.

---

## Limites connues

- Le modèle d'écosystème est **plausible, pas sourcé**. Les coefficients
  produisent une courbe qui se lit à l'œil. À faire valider avant toute
  communication publique.
- Le disque solaire est volontairement écrêté par le tone mapping : c'est ce
  qui donne le halo, mais on perd le bord net du disque à basse turbidité.
- L'écume est procédurale (jacobien de la houle), sans simulation de
  persistance : elle apparaît et disparaît avec la crête.
- Pas encore de niveau de détail sur la végétation : au-delà de ~3000 instances
  d'algues, le coût devient visible sur GPU intégré.
