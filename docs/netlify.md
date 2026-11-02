# Déploiement Netlify

Le fichier `netlify.toml` publie uniquement `dist` et déploie une fonction `router` qui réutilise les API existantes. Les réécritures conservent les URL publiques et les paramètres de recherche. Vercel reste compatible.

## Configuration du projet existant

- Dépôt : `hifindhub-pixel/HIFIND.FR-1` ; répertoire de base : racine du dépôt.
- Commande et répertoire de publication : définis par `netlify.toml`.
- Variable obligatoire : `NEON_URL`, URL PostgreSQL Neon existante, dans les variables d’environnement Netlify accessibles aux Functions et au contexte Deploy Previews. Ne jamais la coller dans GitHub, les logs ou une conversation.
- Variable facultative : `TRAVELPAYOUTS_TOKEN` pour les vols.
- Le modèle `index.html` doit être inclus dans le paquet de fonctions : `api/produit.js` le lit au démarrage.

## Vérification avant bascule

1. Ouvrir la Deploy Preview de la PR et vérifier que le déploiement est réussi.
2. Exécuter `SITE_URL=https://URL-DE-PREVIEW node scripts/public-smoke.js`.
3. Tester une recherche via `/api/products?action=search&q=iphone&limit=2`, puis ouvrir une fiche produit renvoyée par le catalogue.
4. Vérifier les fonctions et les crédits restants du compte Netlify. Aucun abonnement payant n’est requis par cette modification, mais les limites du compte restent applicables.
5. Ne basculer `hifind.fr` qu’après validation. Les liens canoniques restent volontairement sur `https://hifind.fr`.

Validation locale : `npm ci --ignore-scripts`, `npm test`, `node scripts/build-netlify.mjs`, `node --check scripts/sync.js`. Le répertoire `dist` ne contient ni code serveur ni secrets. Les 404 des anciennes routes Netlify ne doivent pas être remplacées par un fallback global vers `index.html` : une API doit renvoyer sa réponse propre.
