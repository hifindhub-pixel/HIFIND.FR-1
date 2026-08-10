// scripts/lib/quarantine.js
//
// LOT 2 du cahier des charges : detecte les regroupements EAN
// CONTRADICTOIRES -- ceux ou aucun filtre automatique ne peut trancher
// en confiance -- et les journalise pour revue manuelle au lieu de les
// exclure silencieusement.
//
// "Contradictoire" ici a un sens precis, aligne sur les filtres deja
// construits aujourd'hui (marque, categorie, condition dans
// api/products.js et condition.js) : c'est exactement le cas ou CES
// filtres-la choisissent de NE RIEN exclure par prudence (egalite,
// aucun leader clair) -- prudent pour l'affichage immediat, mais cette
// prudence cache un vrai desaccord dans les donnees qui merite d'etre
// regarde par un humain, pas juste tolere silencieusement a chaque
// requete.

function normalizeBrand(b) {
  return String(b || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Examine un groupe d'offres partageant un EAN et retourne la liste des
 * contradictions detectees (peut en retourner plusieurs a la fois, ou
 * aucune si le groupe est coherent). Ne modifie rien, pure fonction de
 * detection -- la decision d'ecrire en base est separee (voir
 * writeQuarantine ci-dessous), pour rester testable sans connexion DB.
 */
function detectContradictions(ean, offers) {
  const issues = [];

  const brandCounts = new Map();
  offers.forEach(o => {
    const nb = normalizeBrand(o.brand);
    if (nb) brandCounts.set(nb, (brandCounts.get(nb) || 0) + 1);
  });
  const brandsAmbiguous = brandCounts.size > 1 && (() => {
    const counts = [...brandCounts.values()].sort((a, b) => b - a);
    return !(counts.length > 1 && counts[0] > counts[1]);
  })();

  const categoryCounts = new Map();
  offers.forEach(o => {
    if (o.category) categoryCounts.set(o.category, (categoryCounts.get(o.category) || 0) + 1);
  });
  const categoriesAmbiguous = categoryCounts.size > 1 && (() => {
    const counts = [...categoryCounts.values()].sort((a, b) => b - a);
    return !(counts.length > 1 && counts[0] > counts[1]);
  })();

  // La marque seule ne suffit PAS a declencher une quarantaine : verifie
  // sur donnees reelles (PS5 vendue sous "Sony", "Sony Interactive
  // Entertainment", "Playstation" -- 3 libelles sans majorite, mais
  // categorie identique partout, high-tech). Ce n'est pas une
  // contradiction, juste un manque d'harmonisation des libelles entre
  // marchands, deja gere sans probleme par le filtre neutre de
  // api/products.js. Une VRAIE contradiction se voit sur DEUX signaux a
  // la fois : marque ET categorie qui divergent ensemble (Apple/high-tech
  // vs Bissell/maison-jardin) -- la aucune explication benigne ne tient.
  if (brandsAmbiguous && categoriesAmbiguous) {
    issues.push({
      reason: 'brands_and_categories_no_majority',
      detail: {
        brands: Object.fromEntries(brandCounts),
        categories: Object.fromEntries(categoryCounts),
      },
    });
  }

  return issues;
}

/**
 * Ecrit les contradictions detectees en base, une ligne par type de
 * contradiction. Idempotent au sens ou rappeler la fonction pour le
 * meme EAN cree simplement une nouvelle observation horodatee -- utile
 * pour voir si un probleme persiste dans le temps ou etait ponctuel
 * (feed marchand temporairement incoherent, par exemple).
 */
async function writeQuarantine(client, ean, offers) {
  const issues = detectContradictions(ean, offers);
  for (const issue of issues) {
    await client.query(
      `INSERT INTO quarantined_eans (ean, reason, detail, offer_ids)
       VALUES ($1, $2, $3, $4)`,
      [ean, issue.reason, JSON.stringify(issue.detail), offers.map(o => o.id)]
    );
  }
  return issues;
}

export { detectContradictions, writeQuarantine };
