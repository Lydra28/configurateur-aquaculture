# Chantier (en attente) — Hero video au scroll

Statut : PARQUE le 05/10/2026. A proposer au groupe avec le chantier
« Hero au-dessus de la surface + CTA de plongee » (V2). Rien a coder
avant validation.

## Concept

Sequence d'entree hybride : une video pre-generee par IA porte la partie
aerienne (ciel, approche de la surface), puis la 3D temps reel prend le
relais pour la traversee de la ligne d'eau et toute la partie immergee.

```text
Video IA (scroll-scrub)   →  ciel, descente vers la surface  [lineaire, identique pour tous]
   ↓ raccord masque par le splash/les bulles existantes
Three.js temps reel       →  traversee + vue immergee + configurateur  [depend des choix]
```

Regle de partage : ce qui est identique pour tous les visiteurs peut etre
une video ; tout ce qui reagit aux choix du visiteur reste temps reel.

## Argument narratif (pour la soutenance)

Le site s'appelle « Ce que la surface ne montre pas » : la surface en
video lechee = l'image publicitaire que l'aquaculture vend ; la plongee
bascule dans le calcule, le mesurable, le reel. La difference de rendu
entre video et 3D devient un parti pris de sens, pas un defaut.

## Technique : le scroll-scrub (« flipbook video »)

- La video est en pause ; le scroll deplace sa tete de lecture :
  `video.currentTime = progressionScroll * video.duration`.
- Chainer les seeks via l'evenement `seeked` pour ne pas perdre d'images.
- Un seul axe de liberte : un mouvement de camera unique, lent, continu,
  sans coupe (les artefacts IA se voient au ralenti/en arriere).

## Generation de la video

- Outil pressenti : Higgsfield (controle camera = leur specialite ;
  agrege Kling 3.0 / Veo / Sora). Acces deja branche a la session Claude.
- Astuce raccord : Kling 3.0 accepte une image de debut ET de fin.
  Donner comme IMAGE FINALE une capture Playwright du rendu Three.js vu
  de la surface → la video se termine exactement sur une image du moteur.
- Style : prompter la video dans la DA de NEMO (palette, lumiere, mer),
  PAS en photorealiste. Coherence > realisme.
- 1080p minimum, 2-3 variantes a comparer.

## Encodage pour le scrub

Re-encoder le fichier final en « toutes images-cles », sinon le scrub
saccade. Exemple :

    ffmpeg -i brute.mp4 -c:v libx264 -g 1 -crf 18 -an hero-scrub.mp4

(Si saccades persistantes : passer a une sequence d'images sur canvas,
facon Apple AirPods.)

## Heberger nous-memes

Ne jamais pointer vers le CDN d'un tiers (lecon motionsites) : l'asset
final vit dans le repo (ou sur notre Vercel).

## Reste a faire quand le groupe valide

1. Generer 2-3 videos d'essai (end-frame = capture du rendu).
2. Choisir + re-encoder pour le scrub.
3. Brancher le scroll-scrub + bascule video → 3D au moment du splash.
4. Spec detaillee « facon motionsites » avant le dev (valeurs exactes +
   checklist de non-negociables).

Reference veille : `EGX_ia_station/04_veille_ia/catalogue/motionsites.md`.
