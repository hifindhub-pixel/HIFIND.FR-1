// api/merchants.js
//
// LOT 2 du cahier des charges : canonicalisation reelle des marchands.
//
// Le probleme concret que ce module resout : un meme marchand peut
// apparaitre sous plusieurs program_id different selon le flux ou le
// morceau de catalogue (Footstore/Foot Store 2, Rakuten FR1/FR2/FR3,
// Rue du Commerce A/C...). Sans canonicalisation, "nombre de marchands"
// et "distinctVendors" comptent ces doublons comme des marchands
// differents -- un produit vendu par 3 flux du MEME marchand semble
// "compare a 3 marchands" alors qu'il n'y a qu'un seul vendeur reel.
//
// MAPPING CONSTRUIT A PARTIR DE DONNEES REELLES UNIQUEMENT. Pas de
// correspondance devinee : chaque entree ci-dessous est confirmee soit
// par un diagnostic SQL direct, soit par la documentation du fichier de
// sync existant. Une entree manquante fait retomber sur le program_id
// brut (comportement actuel, jamais pire qu'avant ce module).

/**
 * program_id brut (tel que stocke en base) -> identifiant canonique du
 * marchand reel. Plusieurs program_id peuvent pointer vers le meme
 * canonical_merchant_id.
 *
 * Confirme le 09/08 (session HiFind) : fusion Foot Store 2 -> Footstore,
 * deja appliquee cote sync (feedDisplayName normalization) + migration
 * SQL merge-footstore.sql pour les lignes deja en base avant le fix.
 */
const CANONICAL_MERCHANT_MAP = {
  'awin_foot_store_2': 'awin_footstore',
  'awin_footstore': 'awin_footstore',

  // Verifie le 09/08 par diagnostic SQL direct (GROUP BY program_id),
  // en deux temps :
  //   1) Rakuten FR1/FR2/FR3 et Rue du Commerce A/C -> un seul program_id
  //      chacun ('awin_rakuten', 'awin_rue_du_commerce')
  //   2) ManoMano A-E, Whirlpool A-C, AliExpress A-C, Velostore A-B ->
  //      idem, un seul program_id chacun
  // Conclusion sur les donnees reelles : le decoupage en plusieurs flux
  // n'existe qu'au moment de la collecte (sync), jamais au stockage.
  // Footstore/Foot Store 2 est le SEUL cas reel de fragmentation trouve
  // aujourd'hui -- deja corrige ci-dessus. Ne pas ajouter d'autres
  // entrees sans nouveau diagnostic qui les justifie : une fusion
  // devinee a tort est pire qu'une absence de fusion.
};

/**
 * Retourne l'identifiant canonique d'un marchand a partir de son
 * program_id brut. Si aucune correspondance n'est connue, retourne le
 * program_id tel quel (comportement identique a avant ce module -- une
 * entree manquante ne peut jamais degrader le comptage actuel).
 */
function canonicalMerchantId(programId) {
  return CANONICAL_MERCHANT_MAP[programId] || programId;
}

/**
 * Compte les marchands DISTINCTS parmi une liste d'offres, en fusionnant
 * les program_id qui pointent vers le meme marchand reel. A utiliser
 * PARTOUT ou le nombre de marchands est calcule (getEanOffers,
 * filterCompatibleOffers, l'affichage "vendu par X marchands") --
 * jamais directement new Set(offers.map(o => o.program_id)).
 */
function countDistinctMerchants(offers) {
  return new Set(offers.map(o => canonicalMerchantId(o.program_id))).size;
}

export { canonicalMerchantId, countDistinctMerchants, CANONICAL_MERCHANT_MAP };
