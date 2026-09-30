# Découverte et raccordement Awin, Effinity et CJ

La synchronisation quotidienne découvre les catalogues avant l'import. Les
catalogues sélectionnés sont raccordés en mémoire aux variables déjà utilisées
par `sync.js`. Les secrets existants ne sont ni réécrits ni supprimés. Aucune
modification du catalogue public n'est provoquée par la découverte seule.

## Sélection automatique

Le workflow quotidien active maintenant `AUTO_DISCOVER_FEEDS=true`. Une
sélection manuelle n'est plus nécessaire pour les catalogues compatibles.
Chaque candidat est contrôlé en lecture seule sur 50 lignes au maximum :
au moins 80 % doivent présenter un GTIN à clé valide, un prix positif en EUR,
un titre et un lien. Les indications HT et noms B2B explicites sont exclus.
Une absence d'indication HT ne prouve toutefois pas à elle seule un prix TTC.
Les flux XML ou les champs non reconnus sont signalés pour adaptation.

Les tests d'échantillons utilisent au plus quatre workers, chacun limité à
25 secondes et 96 Mo. Un seul catalogue valide est choisi par annonceur ; les
noms équivalents déjà couverts par un autre réseau sont exclus. Cela ne
remplace pas un référentiel exhaustif des enseignes : des noms très différents
pour la même enseigne nécessitent toujours un alias. Les nouveaux programmes
ont un identifiant stable basé sur le réseau et l'annonceur.

Le workflow `Validate Feed Automation` teste la PR. La sonde des comptes est
réservée à son lancement manuel (`workflow_dispatch`) pour ne pas multiplier
les appels aux API à chaque commit. Elle ne se connecte pas à Neon et ne fait
aucun import. Son rapport indique les motifs de rejet.
Les contrôles d'échantillons ne garantissent pas la qualité de chaque ligne ;
le filtrage de l'import reste appliqué. Les 50 lignes sont uniquement un
échantillon de validation, pas une limite de catalogue pour l'import.

## Sélection manuelle facultative / remplacement

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

Sans variable de sélection, le mode automatique sélectionne les flux qui
passent ses contrôles. Pour revenir à l'observation, régler
`AUTO_DISCOVER_FEEDS=false` et retirer les sélections manuelles. Un flux sélectionné absent de la découverte est signalé et la
configuration existante est conservée. Cela ne garantit pas que son ancienne
URL fonctionne encore : le rapport des imports reste à contrôler.

## Limites de cette première version

- La découverte recense les flux accessibles, pas tous les vendeurs du Web.
  Elle ne dépose aucune candidature à un programme d'affiliation.
- Une réponse de métadonnées ne valide pas le contenu d'un catalogue. Les
  contrôles automatiques portent sur un échantillon ; les imports
  continuent d'appliquer leur filtrage EAN existant et le seuil courant.
- Les tests sont exécutés avec des réponses simulées. Les formats réels du
  compte ont aussi été sondés le 30 septembre 2026 : découverte Effinity et CJ
  fonctionnelle au premier essai, 11 sélections sur échantillon. Au second essai,
  Awin renvoie 401 sur le secours Darwin après 500 sur son endpoint classique,
  et Effinity renvoie 429 (limitation de fréquence). Les appels répétés ont
  été arrêtés ; vérifier l'accès Awin avant activation des trois réseaux.
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

Vérification locale : `node --test auto-feeds.test.js feed-discovery.test.js`, puis
`node --check scripts/sync.js`. Aucun test ne contacte les réseaux ni la base.
Pour revenir à l'import précédent, appeler directement `node scripts/sync.js`
dans le workflow. Retirer une sélection arrête son raccordement automatique ;
cela ne supprime pas les offres déjà importées de la base.
