// scripts/lib/merchants.js
//
// LOT 2 du cahier des charges : canonicalisation reelle des marchands,
// multi-reseaux. Remplace le mapping code en dur par une lecture de la
// vraie table `merchants`/`merchant_aliases` (sql/merchants-table.sql),
// seule facon de fusionner proprement un marchand present a la fois sur
// Awin et CJ (par exemple) sous deux identifiants differents.
//
// Mise en cache en memoire : la table change rarement (ajout manuel
// d'un marchand), interroger la base a chaque recherche serait un cout
// inutile. Le cache se recharge automatiquement apres 10 minutes, donc
// un nouveau marchand ajoute en base devient actif sans redeploiement.

let cache = null;
let cacheLoadedAt = 0;
let pendingLoad = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Charge (ou recharge si perime) la correspondance raw_program_id ->
 * merchant_id canonique depuis la base. `client` est un client pg deja
 * connecte (reutilise celui de la requete en cours plutot que d'ouvrir
 * une connexion dediee).
 *
 * Protege contre les appels concurrents : countDistinctMerchants est
 * appele une fois PAR PRODUIT affiche (jusqu'a 40 fois par recherche),
 * tous a peu pres simultanement. Sans le verrou pendingLoad, chaque
 * appel verifierait le cache AVANT que le tout premier n'ait fini de le
 * remplir, et lancerait chacun sa propre requete SQL -- verifie par un
 * test avec Promise.all qui revelait 3 requetes pour 3 appels concurrents
 * au lieu d'une seule attendue.
 */
async function loadMerchantAliases(client) {
  const now = Date.now();
  if (cache && (now - cacheLoadedAt) < CACHE_TTL_MS) return cache;
  if (pendingLoad) return pendingLoad;   // une charge est deja en cours : s'y greffer

  pendingLoad = (async () => {
    const { rows } = await client.query(
      `SELECT raw_program_id, merchant_id FROM merchant_aliases`
    );
    cache = new Map(rows.map(r => [r.raw_program_id, r.merchant_id]));
    cacheLoadedAt = Date.now();
    pendingLoad = null;
    return cache;
  })();

  return pendingLoad;
}

/**
 * Identifiant canonique d'un marchand a partir de son program_id brut.
 * Si aucune correspondance connue n'existe en base, retourne le
 * program_id tel quel prefixe -- comportement identique a avant cette
 * table (jamais pire qu'aujourd'hui pour un marchand non encore fusionne).
 */
function canonicalMerchantId(aliasMap, programId) {
  const merchantId = aliasMap.get(programId);
  return merchantId != null ? `merchant:${merchantId}` : programId;
}

/**
 * Compte les marchands DISTINCTS parmi une liste d'offres, en fusionnant
 * celles qui pointent vers le meme marchand reel, meme sur des reseaux
 * d'affiliation differents. A utiliser PARTOUT ou le nombre de marchands
 * est calcule (getEanOffers, filterCompatibleOffers, l'affichage "vendu
 * par X marchands", et le seuil MIN_VENDORS au moment du sync) --
 * jamais directement new Set(offers.map(o => o.program_id)).
 */
async function countDistinctMerchants(client, offers) {
  const aliasMap = await loadMerchantAliases(client);
  return new Set(offers.map(o => canonicalMerchantId(aliasMap, o.program_id))).size;
}

export { loadMerchantAliases, canonicalMerchantId, countDistinctMerchants };
