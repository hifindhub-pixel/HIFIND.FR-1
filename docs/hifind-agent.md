# HiFind Agent — superviseur V1

Agent autonome de surveillance par règles, sans modèle IA ni clé payante. Il observe les workflows existants et un échantillon public de 12 produits, puis classe les anomalies et propose des actions. Il ne modifie pas les produits et ne relance pas les imports.

## Utilisation

Après fusion sur main, **Actions → HiFind Agent** affiche le bilan dans le résumé de chaque exécution. Le rapport Markdown et JSON est téléchargeable dans les artefacts (30 jours). Le premier contrôle est déclenché par la fusion ; les suivants sont planifiés chaque jour à 09:30 UTC (10:30 Paris en hiver, 11:30 en été). GitHub peut retarder les horaires ou désactiver les planifications d’un dépôt public inactif.

Le bouton **Run workflow** permet une vérification manuelle. Un état critique fait échouer le job ; les notifications dépendent des préférences GitHub du propriétaire. Aucun email ou ticket n’est envoyé par le script.

En local : `node scripts/hifind-agent.js`. Node 20 ou supérieur suffit, sans npm install. Le jeton facultatif `GITHUB_TOKEN` reste réservé aux requêtes GitHub ; sans jeton, la lecture publique est soumise aux limites de GitHub. Résultats dans `agent-report/`.

## Contrôles et limites

- Dernier résultat terminé, succès trop ancien et exécution bloquée : imports, qualité catalogue, parcours public et découverte hebdomadaire de flux.
- Prix positifs, liens HTTP(S), images présentes, dates de rafraîchissement, EAN répétés et au moins deux marchands selon le compteur canonique de l’API.
- Écart de prix ×5 : invitation à vérifier, jamais preuve de mauvais rapprochement.
- Toute source inaccessible reste signalée ; elle n’est jamais considérée saine.

Le contrôle porte sur les 20 dernières exécutions de chaque workflow et 12 produits tendances au maximum. Il ne remplace pas l’audit complet du catalogue existant, ne télécharge pas les rapports de flux, ne vérifie pas la disponibilité finale des liens affiliés, la TVA ou le prix réel chez le marchand. Aucun lien affilié ou contenu brut des erreurs réseau n’est stocké dans le rapport. Les propositions sont des recommandations, pas des correctifs de code générés.

L’agent utilise uniquement des GET avec délais de 20 secondes et sans redirections ; aucun accès aux secrets Neon ou aux plateformes d’affiliation. Il n’installe pas Conway Automaton, ne crée pas d’agents enfants et n’engage aucune dépense externe. Le temps GitHub Actions reste soumis au forfait du dépôt.

Validation : `node --test tests/hifind-agent.test.js`.

## Développeur local Ollama

`scripts/hifind-developer.js` est la deuxième brique : une tâche ciblée → lecture du code versionné → proposition du modèle local → validation des remplacements et de la syntaxe → proposition enregistrée → PR en brouillon si `--publish` est demandé.

Prérequis sur le PC : Node 20+, Git, Ollama lancé avec un modèle de code **local** déjà téléchargé. Choisir sa taille selon la mémoire RAM/VRAM disponible. Le script n’installe aucun modèle, n’utilise aucune API IA payante et n’effectue aucun téléchargement automatique. Le PC doit rester allumé pendant la génération ; le travail n’est pas exécuté dans ChatGPT.

Créer une tâche JSON locale, par exemple `.hifind-agent/task.json`, avec une vraie demande et les fichiers concernés :

```json
{
  "goal": "Examiner le classement des recherches et corriger un bug démontrable si présent, avec un test de non-régression. Ne pas inventer de défaut.",
  "files": ["scripts/lib/search-ranking.js", "tests/search-ranking.test.js"]
}
```

Puis lancer (remplacer NOM_DU_MODELE par le nom exact affiché par `ollama list`) :

```text
node scripts/hifind-developer.js --task .hifind-agent/task.json --model NOM_DU_MODELE
```

Le résultat est enregistré sous `.hifind-agent/<identifiant>/proposal.json`, avec les fichiers proposés séparément. L’arbre de travail et main ne sont pas modifiés. Une réponse vide, incomplète, ambiguë ou hors périmètre est rejetée.

Pour ouvrir directement une PR en brouillon, ajouter `--publish` et fournir `GITHUB_TOKEN` via l’environnement local (jamais dans une tâche, le dépôt ou une conversation). Le jeton doit être restreint à ce dépôt avec Contents et Pull requests en écriture. Une authentification GitHub de l’application ChatGPT ne fournit pas ce jeton au PC. Publication uniquement si HEAD correspond encore à main distant ; une branche `agent/local-…` est créée, sans fusion ni modification de main. En cas de problème réseau pendant la publication, consulter les branches/PR avant de recommencer.

Périmètre V1 : au plus 4 fichiers existants dans `scripts/lib/*.js` et `tests/*.test.js`, 60 000 caractères de contexte. Les imports de production, API, design, workflows, secrets et configuration sont exclus. La syntaxe est contrôlée sans exécuter le code généré sur le PC. Les tests du dépôt tournent dans GitHub Actions sur la PR ; les résultats et le diff doivent être revus avant fusion. Le modèle peut se tromper et un passage des tests ne remplace pas la revue.

Ce module se lance à la demande : il ne lit pas encore les logs Vercel/Neon, ne choisit pas seul un ticket, et ne travaille pas en boucle 24 h/24. Le superviseur quotidien fournit les constats ; la tâche locale définit le correctif à proposer. SEO, affiliation et orchestration multi-agents restent des extensions futures.
