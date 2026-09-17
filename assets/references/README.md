# Références assets — environnement Atlantique

Dépose ici les images de référence (une par sujet, nommée `espece.jpg/png`).
Consignes valables pour TOUTES les images :
- sujet **entier**, non coupé, non masqué
- fond aussi simple que possible (détouré, sable uni, eau claire)
- lumière diffuse, sans gros reflets ni contre-jour
- ≥ 1000 px de large, sans watermark ni montage
- si tu hésites entre deux photos, mets les deux — je tranche à l'intake

Le pipeline assume un rendu **stylisé-réaliste depuis une seule image** :
inutile de chercher la photo parfaite, la silhouette et les couleurs justes
comptent plus que le détail (le décor est vu de loin).

## Liste à chercher, dans l'ordre de production

### 1. Minéral (pilote de style — je démarre dès la 1re image)
- [ ] `roche-granitique.jpg` — bloc granitique côtier immergé, arrondi,
      patine sombre avec balanes/algue encroûtante rose (coralline), vue 3/4
- [ ] `galets.jpg` *(optionnel)* — champ de galets, juste pour les proportions

### 2. Flore
- [ ] `laminaire.jpg` — Laminaria digitata ou hyperborea, frond ENTIER avec
      stipe et crampon, à plat ou en eau claire, profil
- [ ] `fucus.jpg` — fucus vésiculeux, touffe entière
- [ ] `zostere.jpg` — zostère marine, touffe/brins (pour le tapis d'herbier)

### 3. Faune mobile
- [ ] `sardine.jpg` — Sardina pilchardus, profil net, entière
- [ ] `banc-sardines.jpg` — une photo de banc (sert au COMPORTEMENT/densité,
      pas à la modélisation)

### 4. Vie fixe du fond
- [ ] `etoile-de-mer.jpg` — Asterias rubens, vue de dessus, entière
- [ ] `oursin.jpg` — oursin globuleux/violet, 3/4
- [ ] `crabe.jpg` — crabe vert ou étrille, vue de dessus 3/4

## Rôles narratifs proposés (à amender par le groupe)

Chaque asset réagit au modèle d'écosystème (`applyEcosystem`) :
- **Roches** : se couvrent de vase avec le sédiment, la coralline rose blanchit
- **Laminaires/fucus** : jaunissent puis disparaissent (comportement kelp actuel)
- **Zostère** : l'herbier recule quand la turbidité monte (manque de lumière)
- **Banc de sardines** : se disperse et se raréfie quand l'oxygène chute
- **Vie fixe** : disparaît avec le dépôt organique — le marqueur du fond mort

Si un rôle ne vous va pas, corrigez-le ici même avant que je code l'asset.

## Suivi

| Asset | Référence reçue | Modélisé | Intégré | GO groupe |
|---|---|---|---|---|
| Roche granitique | ✅ 17/09 | ✅ | ✅ (remplace les monticules) | ✅ validé |
| Galets | ✅ 17/09 | ✅ | ✅ | ✅ validé |
| Laminaire | ✅ 17/09 (×2) | ✅ | ✅ (forêts sur les arêtes) | ✅ validé |
| Fucus | ✅ 17/09 | ✅ | ✅ (touffes contre les blocs) | ✅ validé |
| Zostère | ✅ 17/09 | ✅ | ✅ (herbiers sur sable) | ✅ validé |
| Sardine + banc | ✅ 17/09 (banc = fusiliers : comportement seul) | ✅ | ✅ (2 bancs, dispersion par O₂) | ✅ validé |
| Étoile de mer | ✅ 17/09 | ✅ | ✅ | ✅ validé |
| Oursin | ✅ 17/09 (Paracentrotus lividus, v2) | ✅ | ✅ (au pied des blocs) | ✅ validé |
| Crabe | ✅ 17/09 (×2) | ✅ | ✅ (près des galets) | ✅ validé |
| Bar | ✅ 17/09 (×3) | ✅ | ✅ (rôdeurs près du fond) | ✅ validé |
| Daurade | ✅ 17/09 (×3) | ✅ | ✅ (petits groupes près du fond) | ✅ validé |

## Famille ferme aquacole (phase 2)

| Asset | Référence reçue | Modélisé | Intégré | GO groupe |
|---|---|---|---|---|
| Cage/filet | ✅ 17/09 (×5 — retenu : circulaire norvégien ; filet 2 écarté) | ✅ | ✅ (3 cages semi-immergées, plan moyen) | à valider |
| Saumon | ✅ 17/09 (×2) | ✅ | ✅ (62, carrousel cage 1) | à valider |
| Truite | ✅ 17/09 (×3 — retenu : arc-en-ciel, décision Romain) | ✅ | ✅ (58, carrousel cage 2) | à valider |
| Esturgeon | ✅ 17/09 (×3) | ✅ | ✅ (14, croisière basse cage 3) | à valider |
