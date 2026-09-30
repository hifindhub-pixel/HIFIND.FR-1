# Découverte et raccordement Awin, Effinity et CJ

La synchronisation quotidienne découvre les catalogues avant l'import. Les
catalogues sélectionnés sont raccordés en mémoire aux variables déjà utilisées
par `sync.js`. Les secrets existants ne sont ni réécrits ni supprimés. Aucune
modification du catalogue public n'est provoquée par la découverte seule.

## Activation progressive

1. Lancer `Discover Feeds` avec les secrets du dépôt : `AWIN_API_KEY` (clé des
   flux, distincte de la clé Publisher), `EFFINITY_API_KEY`, `CJ_TOKEN` et
   `CJ_PUBLISHER_ID`.
2. Consulter l'artefact `feed-discovery-report.json`. Il ne contient pas les URL
   authentifiées. Un connecteur indisponible fait échouer la découverte seule,
   mais ne bloque pas les imports existants dans `Sync Products`.
3. Vérifier le marchand, son autorisation, le format du catalogue, les prix TTC,
   les EAN, les variantes et les liens affiliés. Pour CJ, vérifier aussi le lien
   de tracking : la configuration existante dans `sync.js` reste applicable.
4. Renseigner la variable GitHub **FEED_DISCOVERY_APPROVALS** avec les identités
   choisies. Ne jamais y placer d'URL de flux ni de clé. Exemple fictif :

```json
{
  "awin": [{"key": "11", "name": "Nom exact dans AWIN_FEEDS"}],
  "effinity": [{"key": "12", "name": "Nom exact dans EFFINITY_FEEDS"}],
  "cj": [{"key": "23", "name": "Nom exact dans CJ_FEEDS"}]
}
```

`key` est le Feed ID Awin, l'id_lien Effinity ou l'advertiserId CJ. `name` est
une identité stable utilisée par l'import existant. Un nom déjà présent met à
jour le flux en place en conservant ses réglages ; un nouveau nom ajoute une
source. Ne pas créer deux noms pour un même vendeur, même sur deux réseaux.
Vérifier les alias marchands existants avant toute nouvelle sélection.

Sans cette variable, le raccordement est en observation : aucun nouveau flux
n'est ajouté. Un flux sélectionné absent de la découverte est signalé et la
configuration existante est conservée. Cela ne garantit pas que son ancienne
URL fonctionne encore : le rapport des imports reste à contrôler.

## Limites de cette première version

- La découverte recense les flux accessibles, pas tous les vendeurs du Web.
  Elle ne dépose aucune candidature à un programme d'affiliation.
- Une réponse de métadonnées ne valide pas le contenu d'un catalogue. La
  sélection initiale requiert les vérifications ci-dessus ; les imports
  continuent d'appliquer leur filtrage EAN existant et le seuil courant.
- Les tests sont exécutés avec des réponses simulées. Les formats réels du
  compte, notamment la requête GraphQL CJ héritée du projet, restent à valider.
  Une réponse inattendue est signalée, jamais présentée comme un succès.
- Pas de remplacement automatique approximatif d'un flux par un autre, pas
  d'inférence d'URL manquante ni de suppression sur échec de découverte.
- L'API Effinity v2 existante annonce sa fermeture au 11/01/2027. Sa migration
  vers la nouvelle API doit être validée avant cette échéance.
- Cette modification ne corrige pas à elle seule les offres périmées, les
  imports partiels, les règles de dédoublonnage ou les limites mémoire de CJ.

## Sources et vérification

- Awin : https://success.awin.com/articles/fr/Knowledge/How-can-I-access-a-Product-Feed
- Effinity : https://apiv2.effiliation.com/apiv2/doc/productfeeds.htm
- CJ : https://developers.cj.com/graphql/reference/Product%20Feed

Vérification locale : `node --test feed-discovery.test.js`, puis
`node --check scripts/sync.js`. Aucun test ne contacte les réseaux ni la base.
Pour revenir à l'import précédent, appeler directement `node scripts/sync.js`
dans le workflow. Retirer une sélection arrête son raccordement automatique ;
cela ne supprime pas les offres déjà importées de la base.
