# Changelog — scène NEMO

## 15/09/2026 — passe d'amélioration (Claude, validée par Romain)

Corrections :
- **`Ocean.sampleHeight()` corrigée** : les vagues de Gerstner déplacent la surface
  horizontalement ; l'ancienne somme de cosinus donnait jusqu'à ~3 m d'erreur par
  mer formée. Inversion du déplacement par point fixe (4 itérations, résidu
  ~15 cm), atténuation par distance alignée sur le vertex shader. Prérequis pour
  poser cages et pontons flottants.
- **`valueNoise.js` re-documenté** : le bruit CPU (value noise) et le bruit GPU
  (gradient noise) ne sont PAS les mêmes — l'ancien commentaire promettait une
  correspondance inexistante. Sans conséquence tant que le relief reste cuit en
  géométrie côté CPU.

Ajouts visuels (tous branchés sur applyEcosystem / l'état du milieu) :
- **`scene/LightShafts.js`** : rais de lumière sous-marins fausse-volumétrique,
  inclinés selon la direction réfractée du soleil (Snell), teintés par la lumière
  filtrée par la colonne d'eau. Ils s'éteignent avec la turbidité et la
  profondeur — ils racontent l'état du milieu, pas juste un effet.
- **`scene/CrossingBubbles.js`** : bouffée de bulles à la traversée de la surface,
  dans les deux sens. Zéro allocation par burst.
- **`scene/Sky.js`** : nuit étoilée (champ d'étoiles procédural + airglow) quand
  le soleil passe sous l'horizon — la timeline nocturne ne donne plus un écran
  noir. Les étoiles sont aussi dans la cubemap : l'océan les reflète.

Robustesse :
- Algues : opaques tant qu'elles sont vigoureuses (plus d'artefacts de tri des
  instances transparentes), transparence réservée à la végétation mourante.
- `ScrollDive` respecte `prefers-reduced-motion` : la caméra colle au scroll au
  lieu de flotter (même trajectoire, moins de mal des transports).
- **`tests/ecosystem.test.js`** (`npm test`, node:test, zéro dépendance) :
  6 tests qui verrouillent la forme des courbes — déterminisme, bornes,
  effondrement intensif vs tenue extensif, sédiment cumulatif, bloom saisonnier,
  effet des mesures correctives.

Vérifié : build Vite OK, 6/6 tests, captures headless (surface, nuit, rais,
bulles, fond dégradé an 7).

## 16/09/2026 — décor statique en ligne de flottaison (Claude, décision du groupe)

Changement de parti pris : plus de plongée au scroll — le décor est UN cadrage
fixe montrant ciel + surface + fond marin ensemble, toujours 3D temps réel.

- **`camera/StaticShot.js`** (nouveau) : deux caméras jumelles fixes (émergée /
  submergée), cap asservi au soleil (aimSun hérité), micro-parallaxe souris
  ±2° lissée au lerp (désactivée si prefers-reduced-motion).
- **`render/WaterlineSplit.js`** (nouveau) : compositeur de coupe — deux rendus
  HDR recollés à la ligne d'eau (1/3 ciel, 2/3 immergé), ménisque lumineux,
  réfraction légère sous la ligne, respiration de la ligne. Le monde immergé
  s'éteint la nuit (gain piloté par l'élévation solaire).
- **Profondeur compressée** : `FLOOR_Y` -62 → -24 m (choix de mise en scène
  documenté — un fond réaliste est invisible depuis la surface).
- `main.js` : boucle en 2 passes/frame (états lumière/fog par passe),
  page plein écran sans scroll, HUD Profondeur → Semaine.
- `ScrollDive.js` conservé dans le repo (inutilisé) : la narration scroll
  reste ouverte — le scroll pourra piloter la timeline (semaines) plus tard.

Vérifié : build OK, 6/6 tests, captures headless jour / intensif an 7 / nuit.

### Ajustement (même jour) — plan de coupe droit
Retour de Romain : le fond ne doit pas se lire comme un plan incliné. La caméra
immergée passe au regard horizontal au milieu de la colonne (aquarium), le fond
devient une bande droite en bas d'image ; chaque caméra rend désormais SA bande
d'écran (fov + aspect dédiés, remappage dans le compositeur) — zéro distorsion.

### Ajustement 2 (même jour) — ligne d'eau en profil de houle
Retour de Romain (référence illustrée à l'appui) : la coupe droite faisait
« angle ». La ligne de flottaison du composite est désormais le PROFIL RÉEL de
la houle vu de côté — hauteur de surface échantillonnée chaque frame (Gerstner
inversé) le long de la ligne visible, écrite dans le shader de recollage — avec
une crête d'écume qui suit l'état du milieu (blanche saine → beige chargée).
Mer d'huile ou tempête : la ligne ondule comme la mer du moment.

### Ajustement 3 (même jour) — plus de vagues vues du dessous
Retour de Romain : le plafond de vagues sous la ligne brouillait la lecture.
La surface n'est plus rendue dans la passe immergée — sous la ligne : volume
d'eau propre (dégradé lumineux sous la surface dans le compositeur, rais,
neige marine, fond). La coupe se lit désormais comme l'illustration de référence.

### Ajustement 4 (même jour) — dézoom
FOV élargis (émergé 22°, immergé 52°) : la scène paraît plus vaste, le fond
s'étend, la flore respire. La ligne d'eau reste juste à tout fov : la distance
d'échantillonnage du profil est désormais dérivée de la caméra.

### Ajustement 5 (même jour) — dézoom renforcé, échelles accordées
Œil émergé rehaussé (7 m) + fov 30° : la houle rapetisse et l'horizon entre
dans le cadre, à la même échelle perçue que le monde immergé (fov 66°).

### Correctif (même jour) — tremblement du décor au repos
Deux causes : l'asservissement du cadrage solaire corrigeait à CHAQUE frame
(chasse perpétuelle autour de la cible — invisible en caméra mobile, visible en
plan fixe) et mesurait son erreur sur des matrices caméra périmées (mises à
jour seulement au rendu), d'où une convergence au mauvais cap. Désormais :
convergence complète avant la première image (settleSun), matrices rafraîchies
avant projection, puis VERROU — l'asservissement ne se réarme que si l'azimut
solaire change réellement. Dérive mesurée au repos : 0 rad sur 3 s.

### Ajustement 6 (même jour) — décor vu de loin (référence coupe illustrée)
La profondeur de mise en scène EST le zoom du monde immergé : FLOOR_Y -24 →
-50 m (colonne 2× plus haute dans la même bande → flore et relief 2× plus
petits, volume d'eau vaste), œil immergé asservi au milieu de la colonne
(-FLOOR_Y/2), œil émergé rehaussé à 11 m. Un seul chiffre à bouger pour
ajuster encore : FLOOR_Y.

## 17/09/2026 — asset minéral (pilote famille environnement)
`scene/Rocks.js` : blocs granitiques fracturés (4 variantes de géométrie
instanciées, implantés en arêtes comme la référence « granite marin ») + champ
de galets (palette de la référence « galets »). Posés sur le relief réel du
fond, remplacent les monticules génériques. applyEcosystem : biofilm olive +
coralline rosée suivant la biodiversité, voile de vase uniforme avec le
sédiment. Budget : 5 InstancedMesh, ~390 instances, matériaux Lambert
(brouillard et lumières de scène automatiques).

### Ajustement (17/09) — retrait des algues génériques
Les lanières sombres du proto (les « triangles noirs ») sont retirées
(kelpCount: 0) : la flore atlantique reconstruite d'après références
(laminaire, fucus, zostère) les remplacera. Le fond est temporairement
minéral-seul, c'est voulu.

## 17/09/2026 — flore : laminaires (pilote de la famille)
`scene/Flora.js` : pieds de Laminaria digitata reconstruits d'après références
(stipe sombre → éventail de 5-8 lanières dorées effilées, gradient de couleur
au sommet), 3 variantes instanciées (~660 pieds), houle en vertex shader
(phase par lanière, battement croissant avec la hauteur). Implantation
écologique : 75 % en forêts sur les arêtes rocheuses de Rocks.js.
applyEcosystem : jaunissement piloté par turbidité + stress, raréfaction avec
la biodiversité. Les algues génériques sont définitivement remplacées.

## 17/09/2026 — flore complète : fucus + zostère (GO laminaires acquis)
`Flora.js` étendu aux trois espèces : fucus vésiculeux (touffes en fourche à
flotteurs jaunes, serrées contre les blocs — la coriace qui brunit avec le
sédiment mais résiste), zostère marine (herbiers de brins fins en nappes sur
les plaines de sable — la sentinelle dont le tapis recule dès que la turbidité
monte). Implantation refondue en COURONNE autour du point de vue (arêtes
rocheuses partagées Rocks↔Flora via ROCK_RIDGES, herbiers intercalés, rayon
~50-75 m) : quel que soit le cap solaire, arêtes et herbiers restent en zone
de bonne visibilité. ~2000 plants instancés au total, houle en vertex shader.

## 17/09/2026 — faune : banc de sardines
`scene/Sardines.js` : sardine low-poly d'après référence (contre-ombrage dos
bleu-nuit / flanc argenté / ventre clair, queue fourchue, ~40 sommets),
ondulation de nage en vertex shader (phase par individu). Comportement :
pseudo-boids sans coût quadratique — 2 bancs déphasés en orbite lente autour
du point de vue (initialisés face caméra), ancrage ellipsoïdal + nage propre
bruitée. applyEcosystem : sous ~60 % d'O₂ le banc SE DISPERSE (cohésion
perdue) et ralentit, puis se raréfie avec la biodiversité (240 → 6 poissons
au scénario intensif an 4). 1 InstancedMesh, 240 instances.

### Ajustement (17/09) — bancs plus lisibles et captifs du cadre
Retour de Romain : bancs trop petits, souvent hors champ. Poissons agrandis
(longueur ×2), bancs rapprochés (30/41 m) et resserrés, 320 individus, et
surtout : plus d'orbite complète — chaque banc BALAIE le secteur visible en
aller-retour autour de la direction du regard (cap déduit du mouvement réel,
demi-tours compris). Seul Sardines.js est modifié.

## 17/09/2026 — vie fixe : la famille environnement est complète
`scene/FixedLife.js` (module autonome, main.js en ajouts purs) : étoiles de
mer Asterias (5 bras orange, ~52 sommets), oursins violets Paracentrotus
(dôme pourpre + 22 piquants lisibles en silhouette), crabes verts Carcinus
(carapace pentagonale + 8 pattes anguleuses) — d'après les références
validées. Implantation par substrat : oursins au pied des blocs, crabes près
des galets, étoiles partout. 3 InstancedMesh, ~137 instances, statique.
Contrat applyEcosystem présent mais inactif en milieu sain (le récit attendra
la validation complète de l'environnement, décision du groupe).

## 17/09/2026 — décor étoffé (validation d'ensemble acquise)
Demande du groupe : plus dense, premier ET arrière-plan, poissons près du
fond, pierres plus nombreuses et plus grosses — réalisme conservé.
- **`scene/DemersalFish.js`** (nouveau) : bar européen (fuselé, dorsale
  épineuse) et daurade royale (corps haut, front bombé) d'après les
  références « bar 1 » / « daurade 1 » — rôdeurs en solitaires et petits
  groupes (3-5) patrouillant à 1-4 m au-dessus du fond autour des arêtes.
- **Flora ×2** (~3800 plants) en TROIS PLANS : grands pieds de laminaires en
  premier plan dont la canopée monte du bas du cadre (assombris,
  contre-jour), forêts au plan moyen, masses en silhouette dans le voile au
  large ; herbiers élargis + liseré lointain.
- **Rocks ×2** (150 blocs, 650 galets) : sommets de blocs proches en bas de
  cadre, 8 blocs XXL au plan moyen (6-9 m), 14 silhouettes d'arrière-plan.
- Ombrage de plan par instance (premier plan 0.55, lointain 0.9) : la
  profondeur se lit en valeurs, pas seulement en tailles.
main.js : ajouts purs (câblage DemersalFish). ~6800 instances au total.

### Ajustement (17/09) — faune de fond enfin distinguable
Retour de Romain : bars/daurades et vie fixe invisibles à la distance du
décor. DemersalFish : tailles majorées (bar 2,2 m, daurade 1,8 m — stylisé
assumé, cohérent avec la sardine), moitié des ancrages sur un anneau proche
(26-44 m), nage plus haut dans la colonne (2,5-7 m — la silhouette se
détache sur l'eau, pas sur le fond), 26 individus. FixedLife : échelles
~×1,8, un tiers des individus sur la bande de fond proche (36-58 m),
effectifs 85/90/40. Seuls ces deux modules sont modifiés.

### Correctif (17/09) — présence garantie dans le cadre
Le 1er ajustement ne suffisait pas (20 s d'attente sans rien voir). Le debug
par projection écran a montré que tout passait SOUS le bord bas du cadre :
le sol n'est visible qu'au-delà de ~38 m, et le relief (±13 m) rendait
toute hauteur relative au sol imprévisible. Trois fixes, trois modules :
- **DemersalFish** : 2 ancrages par espèce définis PAR RAPPORT AU REGARD
  (angle relatif au cap caméra, résolu une fois le cap verrouillé) sur la
  bande 41-55 m — des groupes entiers, toujours dans le cadre. Ces garantis
  nagent à hauteur d'eau ABSOLUE (-35 à -43 m), indépendante du relief.
  Palettes assombries : sur sable pâle, c'est la silhouette qui fait lire
  un poisson.
- **FixedLife** : `alignToView(heading, camera)` place les garantis
  (10 étoiles, 10 oursins, 6 crabes) par LANCER DE RAYON caméra → relief :
  on vise un point du cadre dans la bande de sable, on prend l'impact au
  sol — visibilité par construction, quel que soit le relief. La bande
  visible étant loin (55-100 m), échelle proportionnée à la distance.
  Émissif de l'étoile renforcé (l'orange diffus s'éteint dans le voile) —
  contrôlé de nuit, pas de lueur parasite.
- **main.js** : passe la caméra sous-marine à `alignToView` (1 ligne).
Vérifié par projection NDC (26 garantis à y écran -0,44…-0,82, tous dans
le cadre) + captures jour/nuit. Aucun autre module touché.

### Ajustement (17/09) — répartition sur toute la largeur
Retour de Romain : les zones latérales (gauche/droite du cadre) restaient
vides, la vie garantie se concentrait au milieu. Cause : le champ HORIZONTAL
de la caméra sous-marine est très large (~120°) — des angles de ±0,3 rad ne
couvrent que le tiers central. DemersalFish : 3 ancrages garantis par espèce
(au lieu de 2), étalés jusqu'à ±0,85 rad, groupes de 2-4. FixedLife :
contingents garantis 12/12/8 (au lieu de 10/10/6), cibles écran élargies à
±0,92 de la largeur. Vérifié par projection (couverture x écran -0,86…+0,9)
et crops des deux zones signalées. Seuls ces deux modules sont modifiés.

### Ajustement (17/09) — premier plan d'algues retiré
Demande de Romain : les grandes lames de laminaires du premier plan
(canopée montant du bas du cadre) masquaient la bande de sable et sa
faune. Le plan « premier plan » (8 %, r 15-26 m) est supprimé, son tirage
se redistribue sur les plans restants (forêts d'arêtes / arrière-plan,
qui passe à 33 %). Effectif total inchangé. Seul Flora.js est modifié.

## 17/09/2026 — ✅ DÉCOR FINAL — VALIDÉ PAR ROMAIN
Cette version est la RÉFÉRENCE du décor (artifact v21, bundle
`index-smkpbO5x.js`). Environnement complet : ciel/surface/fond en plan de
coupe statique, ~6800 instances (roches, galets, laminaires, fucus,
zostère, 2 bancs de sardines, bars, daurades, étoiles, oursins, crabes),
présence garantie répartie sur toute la largeur, premier plan dégagé.
La capture de référence est `decor-final.png` à la racine.
Toute évolution future (ferme aquacole, UI du configurateur, récit
applyEcosystem) doit s'AJOUTER à ce décor sans le modifier — un changement
du décor lui-même repasse par une validation explicite du groupe.

## 17/09/2026 — ferme aquacole, asset 1 : les 3 cages (structure vide)
Phase ferme lancée sur références « filet 1-5 » (cage circulaire type
norvégien retenue — filet 2, cage carrée de ponton, écartée). Nouveau
module `scene/FarmCages.js`, AJOUT pur au décor final validé :
- Collerette flottante : double tore noir + montants + main courante +
  2 bouées (jaune/rouge), posée sur la houle réelle (ocean.sampleHeight),
  léger roulis.
- Jupe immergée : voile de filet semi-transparent, 18 cordages verticaux,
  2 cerclages, cône de fond + anneau de lest.
- SEMI-IMMERGÉE à cheval sur la ligne du composite : les deux bandes ayant
  des caméras aux fov très différents (30°/66°), chaque cage est COUPÉE EN
  DEUX moitiés accordées — collerette dans le monde above (cap et largeur
  corrigés du ratio de perspective kAbove/kBelow pour tomber au-dessus de
  sa jupe à l'écran), jupe dans le monde below (sommet au-delà du haut de
  cadre, marge calculée sur le bord loin de l'ouverture : la découpe à la
  ligne ondulante est faite par le compositeur). Masquage par passe dans
  main.js comme underwater.group.
- 3 cages placées par rapport au regard (alignToView, comme la vie fixe) :
  saumons g., truites c., esturgeons d. — plan moyen 58-70 m, réparties.
- `setPresence([b,b,b])` prêt pour les futures variables (cages absentes) ;
  pour la validation, les 3 sont affichées. applyEcosystem : inactif.
main.js : ajouts purs (import, création, update, alignToView, 4 lignes de
visibilité dans renderAbove/renderBelow, expose NEMO.three.farm).
Espèces (saumons, truites arc-en-ciel, esturgeons) : passes suivantes.

### Ferme, asset 2 (17/09) — les saumons peuplent la cage 1
Nouveau module `scene/CagedFish.js` : poissons d'élevage, générique 3
espèces (saumon livré, truite arc-en-ciel et esturgeon suivront chacun sa
passe). Salmo salar d'après réfs « saumon 1/2 » : fusiforme allongé, dos
gris-bleu sombre, flanc argenté, ventre clair — 62 individus, longueur
stylisée 1,9 m (cohérente du bar). Comportement : le CARROUSEL d'élevage —
tous tournent dans le même sens, orbites et profondeurs étagées, confinés
au volume VISIBLE de la jupe (de la ligne d'eau au cône), battement de
nage en vertex shader. applyEcosystem : le rythme suit déjà l'oxygène ;
densité/mortalité viendront avec le récit.
FarmCages.js : ajout du getter `getSkirtFrames()` (+ hauteur-ligne par
cage) — expose les repères des jupes aux modules de peuplement, aucune
géométrie ni comportement modifiés. main.js : ajouts purs.

### Ferme, asset 3 (17/09) — les truites arc-en-ciel peuplent la cage 2
CagedFish.js : espèce « truite » ajoutée (cage centrale, 58 individus,
1,7 m stylisé). Arc-en-ciel d'après réfs « truite 1/3 » (décision Romain) :
corps plus trapu et haut que le saumon, dos olive sombre, BANDE ROSE
latérale portée par les sommets de flanc, ventre clair. Le voile éteint le
rouge à 70 m : rose saturé un cran au-dessus du réel + pointe d'émissif
rosé par matériau d'espèce (contrôlé de nuit, pas de lueur). Même
carrousel confiné à la jupe. Seul CagedFish.js est modifié.

### Ferme, asset 4 (17/09) — les esturgeons peuplent la cage 3
CagedFish.js : espèce « esturgeon » (cage droite, 14 gros individus,
2,7 m stylisé — l'élevage d'esturgeons est moins dense). Réfs
« esturgeon 1-3 » : corps long et bas, rostre pointu, rangée de 7
scutelles dorsales claires en dents de scie, queue HÉTÉROCERQUE (lobe
supérieur long) — deux options ajoutées à la fabrique fusiforme (tail,
scutes). Benthique : pas de carrousel de surface — croisière LENTE dans
la moitié basse de la jupe (depthRange/speedRange par espèce).
CORRECTIF FarmCages (signalé) : le calage vertical des jupes utilisait la
distance radiale au lieu de la profondeur perpendiculaire à l'axe de visée
(d·cos da) — les cages excentrées avaient une jupe trop courte et un
volume utile décalé vers le haut. Géométrie et structure inchangées, seul
le calage : les trois jupes sont maintenant cohérentes à l'écran.
POINT OUVERT pour le groupe : le banc de sardines libre balaie parfois
DEVANT les cages (il traverse visuellement la cage droite) — le corriger
touche Sardines.js, module validé → à valider avant toute retouche.

## 17/09/2026 — ✅ V1 — DÉCOR + FERME AQUACOLE (VALIDÉE PAR ROMAIN)
Version de référence V1 : décor final + les 3 cages peuplées (saumons,
truites arc-en-ciel, esturgeons). Artifact v25, bundle
`index-D9YBwPrv.js`, capture `v1-reference.png`. Un snapshot complet du
code est figé dans `../scene V1/` — il ne se modifie plus. Le travail de
la V2 (améliorations à venir, brief de Romain) continue ici, dans
scene V0.

## 18/09/2026 — V2, passe 1 : parcelles PLANTÉES dans le sol (réf « filet 4 »)
Brief V2 de Romain : les parcelles ne sont plus suspendues, elles sont
plantées — le filet descend de la collerette jusqu'au FOND, comme sur la
référence « filet 4 ». FarmCages.js (modification demandée du module) :
- La jupe s'étire de la ligne d'eau au sol : son pied épouse le point le
  plus bas du relief sur le cercle (léger enfoncement, pas de jour
  lumineux sous le filet). Plus de cône ni de lest suspendus.
- Pied ancré : cerclage de lest au ras du sable + 10 blocs de béton posés
  au fond autour de chaque cage, chacun sur le relief LOCAL du sol.
- Voile allégé (0,22 → 0,14) : la jupe couvre trois fois plus de hauteur,
  sans ça les colonnes écrasaient le décor.
CagedFish suit automatiquement (le volume visible va maintenant de la
ligne au sol — les saumons occupent la colonne, les esturgeons le bas).
La V1 suspendue reste intacte dans ../scene V1/.

## 18/09/2026 — arbitrage : la V1 (cages suspendues) est RETENUE
La variante V2 « plantée » a été essayée et comparée (deux artifacts côte
à côte) ; le groupe retient la V1. scene V0 est restaurée sur le
FarmCages.js de la V1 (snapshot ../scene V1/) — la variante plantée reste
documentée ci-dessus si besoin d'y revenir.
PROCHAINE PHASE (brief Romain) : le décor devient le FOND DU SITE du
configurateur, développé ensemble — Hero au-dessus de la surface, CTA →
vue plan de coupe avec le panneau du configurateur, variables branchées
sur l'API NEMO (window.NEMO.configure/seek) qui pilotent le décor.
Composants visuels à récupérer depuis la maquette Figma (fidélité
maquette). Variables du configurateur : à venir.

## 18/09/2026 — configurateur, lot 1 : couche scénario + particules
Préparation du site V1 (écran F). Cadre acté avec Romain : vanilla JS +
Vite, transition douce ~3 s, cages toujours visibles (la méthode
d'élevage se raconte par la turbidité), saumons par défaut.
- **`state/scenario.js`** (nouveau) : les 5 composantes × 3 options du
  fichier « composantes.md » — score /100 conforme (Esturgeonnière 59,
  FREA 61, Atlantic Sapphire 51, borne basse 23 ; NB : le meilleur cas
  réel plafonne à 98, barème C2 max 18), canaux d'impact 0..1 par option
  (turb/sed/bloom/stress/waste + cages/density) projetés sur les
  grandeurs que les applyEcosystem consomment déjà. TOUT le calibrage
  visuel est dans ce fichier. ScenarioDirector : transition exponentielle
  (~3 s), cadence bornée, inactif par défaut (décor validé intact).
  Turbidité plafonnée à 0,7 : les cages restent lisibles au pire.
- **`scene/FarmWaste.js`** (nouveau asset) : pluie de granulés en vertex
  shader dans chaque jupe (beige « neige marine » : une particule se lit
  claire à contre-jour, jamais sombre) + tapis de dépôt sombre sur le
  sable sous chaque cage. Une intensité 0..1 (canal waste). Invisible à
  intensité 0.
- **CagedFish** : setDensity(0..1) (échelle de production) ; l'émissif de
  la truite s'éteint avec la clarté (sinon lucioles roses en eau trouble).
- **main.js** (refactor signalé) : le subscribe est scindé — applyImpact()
  devient le chemin UNIQUE de distribution des grandeurs d'impact,
  emprunté par le store (temps) et par le scénario (fusion : le scénario
  prime sur l'impact, le store garde temps/soleil/houle). API publique :
  NEMO.scenario { set, preset, snap, score, onScore, resolve, presets }.
NB : le HUD « santé » lit encore le store — il sera remplacé par le score
dans l'UI de l'écran F.

## 18/09/2026 — configurateur, lot 2 : l'UI de l'écran F (fidèle Figma)
Maquette « à valider — dev-ready » implémentée en vanilla JS/CSS
(`ui/configurator.js` + `ui/configurator.css`), par-dessus le décor :
- Panneau de configuration (gauche, verre fumé, tokens et typo exacts de
  la maquette — Inter + Playfair Display) : entête, 3 cartes de fermes
  réelles avec leurs vrais scores (59/61/51) et jauges, 5 sections
  d'options radio (libellés = wording-parcours.md qui fait foi, aides =
  effets visuels de composantes.md, pills = maquette), actions.
- Panneau Impact (bas droite, replié par défaut) : score Playfair
  76 px, niveau en italique, jauge 5 paliers (palier courant contouré),
  détail 6 critères pondérés. Décisions Romain appliquées : sens
  PRÉSERVATION (« État estimé de l'écosystème », Préservé/Fragile/Dégradé,
  seuils 70+/40-69/<40 du wording) ; pas de champ recherche ;
  « Consulter le score final » déplie le panneau.
- scenario.js : projection des 5 composantes sur les 6 critères de la
  maquette (matrice réglable, lignes Σ20, colonnes Σ25/20/20/15/12/8 —
  le détail somme EXACTEMENT au score, arrondi aux plus grands restes) ;
  reset() ; l'espèce du préréglage voyage jusqu'à la scène (la cage
  affichée est celle de l'espèce : Esturgeonnière → esturgeons…).
- Icônes = assets SVG exportés de Figma, inlinés ; états focus clavier
  ajoutés (manquants dans la maquette, note Figma).
- L'écran F remplace le titre démo et le HUD (masqués). Interactions :
  option → choix + transition du décor ~3 s + score en direct ; carte →
  préréglage complet ; réinitialiser → retour à l'état neutre.
main.js : câblage additif (mount, reset, espèce→présence des cages).
ÉCARTS maquette assumés (à faire valider) : libellés de question repris
du wording (la maquette reformulait), cartes = 3 fermes réelles (la
maquette montrait 6 placeholders), libellé du panneau impact renommé
(sens préservation).

### Corrections (18/09) — retour Romain sur l'écran F
- **Préréglages** : re-clic sur la carte active = désélection (remise à
  zéro complète, retour au décor neutre). configurator.js.
- **Une espèce par exploitation** : quand le configurateur est actif,
  l'espèce (du préréglage, saumon par défaut) peuple TOUTES les cages
  présentes — Atlantic Sapphire = 3 bassins de saumons. Capacités
  augmentées (saumon 150, truite 140, esturgeon 45), répartition
  round-robin sur les cages ; hors scénario, chaque espèce garde sa cage
  et son effectif d'origine (décor validé intact). CagedFish.setSpecies.
- **Densité par échelle bien contrastée** : ~15 poissons (locale, 1
  cage), ~30/cage (nationale, 2 cages), ~50/cage (continentale, 3 cages)
  — density 0,1/0,4/1,0 dans scenario.js.
- **Cages alignées à droite** (da 0,10/0,45/0,80) : dégagées du panneau
  du configurateur qui occupe la gauche. FarmCages (slots seuls).
- **Bancs de sardines confinés au secteur centre-gauche** (sweep -0,67…
  -0,23 rad) : ils ne passent plus devant/dans les filets (le
  « clipping » du retour). Sardines.js (constantes de balayage seules —
  modification du module validé demandée par Romain).
- **Sens du score reconfirmé par Romain : préservation** (il baisse
  quand les choix dégradent — continental 4/20). Aucun changement.

### Corrections (18/09) — retour 2 de Romain
- **Taille des cages homogène** : la taille à l'écran dépend de la
  profondeur perpendiculaire (d·cos da), pas de la distance radiale — la
  cage droite excentrée paraissait énorme. Distances recalées
  (58/72/89 m → profondeurs ≈ 58/65/62 m). FarmCages (slots seuls).
- **Sardines restaurées à l'identique** (balayage d'origine) : confinées
  à gauche elles disparaissaient derrière le panneau — Romain les
  préfère visibles, quitte à croiser les cages à l'écran.
- **Score en ODOMÈTRE** (grand + bandeau) : chiffres qui roulent façon
  réveil (rouleaux 0-9, crans 1,3 em pour contenir les débords de
  glyphes Playfair).
- **Barres animées** : DOM du détail STABLE (construit une fois, mis à
  jour en place) — les remplissages GLISSENT vers leur nouvelle valeur ;
  la jauge à paliers transitionne aussi.
- **Highlight des critères modifiés** : une ligne dont la note change
  s'épaissit et s'éclaircit ~1,5 s (classe is-hot), puis revient.
- **Couleurs Figma exactes des jauges** : grande jauge = dégradé de fond
  du plus sombre au plus clair (8/14/22/31/45 %), palier courant boosté
  72 % + contour blanc ; cartes profils = paliers atteints en dégradé
  (18→72 %), non-atteints éteints (12 %). (J'avais uniformisé à tort.)

### Ajustements (18/09) — retour 3 de Romain
- Odomètre du score ralenti (0,7 s → 1,6 s).
- Palier courant de la jauge : cadre plus large (2 px) qui déborde de la
  bande, comme le mock Figma.
- Espacement des cages égalisé À L'ÉCRAN : x écran ∝ tan(angle), pas à
  l'angle — angles recalés (0,10/0,545/0,836 rad, profondeurs 58/76/92 m).
