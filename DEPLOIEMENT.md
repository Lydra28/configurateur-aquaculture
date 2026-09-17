# Déployer le configurateur (Vercel + GitHub)

Le projet est un site statique Vite : aucun backend, aucune variable
d'environnement. Vercel le détecte automatiquement.

## 1. Créer le dépôt GitHub (une fois)

Depuis le dossier `scene V0` (PowerShell ou Git Bash) :

    git init
    git add .
    git commit -m "Configurateur espace marin — V1 site (écran F)"

Créer un dépôt vide sur github.com (privé ou public), puis :

    git remote add origin https://github.com/<ton-user>/<ton-repo>.git
    git branch -M main
    git push -u origin main

## 2. Brancher Vercel (une fois)

1. vercel.com → Add New → Project → Import le dépôt GitHub.
2. Vercel détecte « Vite » : Build Command `npm run build`,
   Output Directory `dist` — ne rien changer.
3. Deploy. Le site est en ligne sur `https://<projet>.vercel.app`.

## 3. Ensuite

- Chaque `git push` sur `main` redéploie la prod automatiquement.
- Chaque branche/PR reçoit sa propre URL de préversion (pratique pour
  les validations du groupe avant de fusionner).
- Domaine personnalisé : Settings → Domains du projet Vercel.

## Alternatives (sans GitHub)

- `npx vercel` en ligne de commande depuis le dossier (compte Vercel
  seulement) ;
- Netlify Drop : `npm run build` puis glisser le dossier `dist/` sur
  app.netlify.com/drop — zéro compte git, mais pas de redéploiement
  automatique.

> Note : le dépôt est public — chaque push sur `main` déclenche automatiquement un déploiement Vercel (~1 min), visible dans l onglet Deployments.
