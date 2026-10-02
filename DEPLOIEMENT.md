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

## 3. Travailler au quotidien : la branche `staging` (depuis le 02/10/2026)

Le travail courant se fait sur la branche `staging`, plus jamais
directement sur `main`.

- URL de préversion FIXE, partagée une fois à l'équipe :
  `https://configurateur-aquaculture-git-staging-devonia.vercel.app`
- Chaque `git push` sur `staging` met à jour cette URL (~1 min).
- `main` reste la prod : `https://configurateur-aquaculture.vercel.app`.

Routine quotidienne (terminal dans `scene V0`) :

    git status                      # doit dire « On branch staging »
    git add .
    git commit -m "Description courte au présent"
    git push

Mise en prod (quand le groupe valide) : Pull Request `staging → main`
sur github.com, puis Merge. Ne PAS supprimer `staging` après le merge.

Notes :

- Deployment Protection (Vercel Authentication) désactivée le
  02/10/2026 : les préversions s'ouvrent sans compte Vercel.
- E-mail git : l'adresse masquée GitHub
  `291065423+Lydra28@users.noreply.github.com` est configurée en global
  (GitHub refuse tout push exposant l'e-mail privé — erreur GH007).
- Domaine personnalisé : Settings → Domains du projet Vercel.

## Alternatives (sans GitHub)

- `npx vercel` en ligne de commande depuis le dossier (compte Vercel
  seulement) ;
- Netlify Drop : `npm run build` puis glisser le dossier `dist/` sur
  app.netlify.com/drop — zéro compte git, mais pas de redéploiement
  automatique.

> Note : le dépôt est public — chaque push sur `main` déclenche automatiquement un déploiement Vercel (~1 min), visible dans l onglet Deployments.
