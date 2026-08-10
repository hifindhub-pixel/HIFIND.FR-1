// scripts/lib/condition.js
//
// LOT 2 du cahier des charges : separer neuf, occasion et reconditionne
// dans les regroupements par EAN.
//
// Aucun champ structure d'etat n'est disponible dans les flux marchands
// (verifie : aucune mention dans les schemas de colonnes vus tout au
// long de cette session). L'etat est acoutume en TEXTE LIBRE en fin de
// titre -- preuve directe sur des donnees reelles vues aujourd'hui :
//   "Rockstar Games Grand Theft Auto V - Neuf"
//   "PS5 Pro 2 To - Console de jeux PlayStation 5 Pro (Digital) - Excellent état"
//   "Pack PS5 Slim & Fortnite Flowering Chaos - ... (Standard) - Bon état"
//   "Rematch Elite Edition (PS5) - Excellent état"
// Meme mecanisme que la categorisation par mots-cles (categorize.js) :
// extraction par texte, pas par champ structure.

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Etat d'un produit a partir de son titre. Par defaut "neuf" en
 * l'absence de toute mention contraire -- la grande majorite des flux
 * d'affiliation e-commerce sont du neuf par defaut, l'etat n'est
 * mentionne explicitement QUE quand il diverge de neuf (occasion,
 * reconditionne) ou pour le confirmer explicitement ("- Neuf").
 */
function extractCondition(title) {
  const t = norm(title);

  // Reconditionne : verifie AVANT occasion, car un produit reconditionne
  // peut aussi porter une mention d'etat ("Reconditionne - Excellent
  // etat") -- reconditionne est l'information la plus specifique, elle
  // doit gagner.
  if (/\breconditionn/.test(t) || /\brefurbished\b/.test(t) || /\bremis a neuf\b/.test(t)) {
    return 'reconditionne';
  }

  // Occasion : les mentions de grade ("bon etat", "excellent etat") sont
  // le vocabulaire standard des marketplaces de produits d'occasion
  // (Pixmania grading, Rakuten...) -- vu tout au long de cette session
  // sur des jeux et consoles d'occasion. "Etat" seul n'y suffit pas
  // ("etat des lieux" n'a rien a voir), d'ou les phrases completes.
  if (/\boccasion\b|\bseconde main\b|\bused\b|\bbon etat\b|\bexcellent etat\b|\betat correct\b|\btres bon etat\b/.test(t)) {
    return 'occasion';
  }

  if (/\bneuf\b|\bbrand new\b/.test(t)) return 'neuf';

  return 'neuf';   // absence de mention = neuf par defaut, voir commentaire ci-dessus
}

/**
 * Au sein d'un regroupement EAN, ne garde que les offres dont l'etat
 * correspond a l'etat MAJORITAIRE -- meme principe que le filtre de
 * coherence de marque (filterCompatibleOffers dans api/products.js) :
 * ne filtre QUE s'il existe un leader clair, jamais sur une egalite,
 * pour ne pas faire disparaitre un produit legitime par exces de zele.
 * Comparer le prix d'un exemplaire neuf a celui d'un reconditionne
 * comme s'il s'agissait de la meme offre serait trompeur pour
 * l'acheteur -- c'est exactement ce que cette fonction evite.
 */
function filterByCondition(offers) {
  if (offers.length <= 1) return offers;

  const counts = new Map();
  for (const o of offers) {
    const c = extractCondition(o.title);
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  if (counts.size <= 1) return offers;   // tous le meme etat, rien a filtrer

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const hasClearLeader = sorted.length > 1 && sorted[0][1] > sorted[1][1];
  if (!hasClearLeader) return offers;    // egalite : pas assez sur pour trancher, ne rien exclure

  const majorityCondition = sorted[0][0];
  return offers.filter(o => extractCondition(o.title) === majorityCondition);
}

export { extractCondition, filterByCondition };
