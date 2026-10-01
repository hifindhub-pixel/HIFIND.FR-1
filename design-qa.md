# HIFIND — contrôle de la refonte de l’accueil

Date : 30 septembre 2026. Branche : codex/refine-current-home.

## Références et captures

- Source visuelle : /workspace/scratch/34d390d5e371/generated_images/exec-62c7cb7d-c0e7-4c8d-a10e-714da52e49e3.png (1386 × 1135).
- Implémentation : docs/qa/home-desktop.jpg (1348 × 926, viewport CSS 1348 × 926, densité 1).
- Comparaison réunie : docs/qa/home-comparison.jpg. Réduction proportionnelle, sans étirement. Hauteurs de capture différentes : ne pas interpréter la coupe de la grille comme une différence de mise en page.
- État : accueil sombre, carrousel en pause. Produits et prix explicitement fictifs pour le contrôle uniquement. Les pages de test ont été retirées ; aucun catalogue fictif ne figure dans le code livré.

## Résultat visuel

Aucun défaut P0/P1/P2 constaté dans les zones remaniées. Comparaison initiale sans correction visuelle nécessaire.

- Typographie : polices du site conservées, titre ample sur deux lignes, hiérarchie lisible. Les titres produit restent limités à trois lignes.
- Espacement : même composition en deux colonnes, encadré produit, bande marchands et mosaïque. Un peu plus de hauteur pour les commandes explicites et les informations de prix.
- Couleurs : bleu nuit et corail conservés. Texte foncé sur boutons corail pour améliorer le contraste ; écart volontaire à la maquette.
- Images : photos des univers existantes conservées. Les produits utilisent les images du catalogue ; la photo de test ne valide pas le proxy en production. Les favicons marchands existants sont conservés au lieu de fabriquer les logos illustratifs de la maquette.
- Contenu : prix réel le plus bas et nombre de vendeurs ajoutés. “À découvrir” ne prétend pas à un classement de ventes absent des données.
- Régions ciblées : titre, recherche, encadré produit et vendeurs inspectés à taille native dans le navigateur ; les libellés restent lisibles. Aucun détail supplémentaire nécessitant une comparaison agrandie.

## Vérifications navigateur

- Ordinateur : thème sombre et clair, navigation des catégories, recherche vers résultats.
- Carrousel avec données de test : navigation par points, pause, favori puis ouverture de la bonne fiche et de ses trois offres.
- Mobile : rendu dans une iframe de 390 px ; recherche, carrousel, commandes et grille visibles. Ce contrôle ne remplace pas un test sur appareil réel. L’interaction du menu dans l’iframe reste non concluante ; la même commande fonctionne dans la page principale.
- Erreur réelle : le catalogue répond HTTP 500. État explicite avec bouton Réessayer à la place d’un chargement permanent.
- Console inspectée : erreurs de l’extension navigateur, aucune erreur applicative observée sur les interactions testées.
- Syntaxe JavaScript vérifiée. npm test ne peut pas charger les suites existantes : imports ../scripts et ../api invalides depuis les fichiers à la racine ; scripts/test-categorize.mjs dépend aussi d’un chemin /mnt/user-data/outputs absent. Aucun fichier de test existant modifié.

## Limites avant mise en production

Rétablir l’API du catalogue puis rejouer un parcours complet avec images, prix, disponibilité et liens marchands réels. Les tests visuels locaux ne valident pas la santé du backend. Aucun déploiement ni fusion dans main effectué.

## Checklist

- [x] Identité et structure de l’accueil préservées.
- [x] Bande défilante et carrousel avec pause et réduction des animations.
- [x] Mise en page responsive et recherche visible.
- [x] Pages temporaires de test retirées.
- [ ] Validation de bout en bout avec le catalogue rétabli.

final result: passed


## Évolution validée — carte immersive (1er octobre 2026)

À la demande de l’utilisateur, l’image occupe désormais toute la surface du carrousel, en conservant ses proportions. Le titre, le prix et le bouton sont superposés sur un dégradé sombre ; le badge, le favori et les commandes restent accessibles. Le fond clair accueille les photos marchands sur fond blanc. Un fond sombre est conservé si une image échoue.

Capture actualisée : docs/qa/home-immersive.jpg. La comparaison précédente documente la première version et non cette évolution demandée.

Contrôles effectués dans Chrome : bureau 1348 × 926, rendu mobile dans une iframe de 390 px, pause, sélection du deuxième produit et ouverture de la fiche correspondante via le bouton superposé. Aucun débordement ni chevauchement bloquant constaté. Console : seules des erreurs d’extension navigateur ont été observées. Syntaxe JavaScript et git diff --check valides.

Les produits et prix de la capture sont des données de démonstration ; les pages temporaires correspondantes ont été retirées. La validation avec le catalogue réel reste à effectuer après résolution de l’erreur API constatée précédemment. Aucun déploiement en production effectué.
