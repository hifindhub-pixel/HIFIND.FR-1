// scripts/lib/ean-prefix.js
//
// L'EAN ne code pas la categorie du produit — les chiffres n'indiquent que
// l'organisation GS1 emettrice, puis le fabricant, puis la reference article.
//
// En revanche le prefixe entreprise (7 a 9 premiers chiffres) identifie le
// fabricant. On peut donc APPRENDRE la categorie d'un fabricant depuis les
// produits qu'on a deja su classer par le texte, puis l'appliquer a ceux
// restes en "autres".
//
// Exemple concret : 380 produits du prefixe 3286340 sont classes "auto-moto"
// par les regles texte, 20 sont en "autres" faute de mot-cle dans leur titre.
// Ces 20-la sont, selon toute vraisemblance, des produits auto egalement.

/** Longueur retenue pour le prefixe entreprise. */
const PREFIX_LEN = 7;

/** Seuils : combien de produits connus, et quelle proportion d'accord. */
const MIN_KNOWN = 4;      // en dessous, l'echantillon ne prouve rien
const MIN_RATIO = 0.75;   // il faut une majorite nette

export function prefixOf(ean) {
  const s = String(ean || '').replace(/\D/g, '');
  return s.length >= PREFIX_LEN + 2 ? s.slice(0, PREFIX_LEN) : null;
}

/**
 * Apprend une categorie par prefixe entreprise a partir des produits deja classes.
 * @param {Array<{ean:string, category:string}>} products
 * @returns {Map<string,{category:string, ratio:number, n:number}>}
 */
export function learnPrefixes(products) {
  const tally = new Map();   // prefixe -> { total, byCat: {cat: n} }

  for (const p of products) {
    if (!p.category || p.category === 'autres') continue;
    const pref = prefixOf(p.ean);
    if (!pref) continue;
    let t = tally.get(pref);
    if (!t) { t = { total: 0, byCat: Object.create(null) }; tally.set(pref, t); }
    t.total++;
    t.byCat[p.category] = (t.byCat[p.category] || 0) + 1;
  }

  const learned = new Map();
  for (const [pref, t] of tally) {
    if (t.total < MIN_KNOWN) continue;
    let best = null, bestN = 0;
    for (const cat in t.byCat) if (t.byCat[cat] > bestN) { bestN = t.byCat[cat]; best = cat; }
    const ratio = bestN / t.total;
    if (ratio >= MIN_RATIO) learned.set(pref, { category: best, ratio: ratio, n: t.total });
  }
  return learned;
}

/**
 * Applique les categories apprises aux produits restes en "autres".
 * Ne touche jamais un produit deja classe : le texte prime toujours.
 * @returns {{reclasses:number, prefixes:number, parCategorie:object}}
 */
export function applyPrefixes(products, learned) {
  let reclasses = 0;
  const parCategorie = Object.create(null);

  for (const p of products) {
    if (p.category && p.category !== 'autres') continue;
    const pref = prefixOf(p.ean);
    if (!pref) continue;
    const hit = learned.get(pref);
    if (!hit) continue;
    p.category = hit.category;
    p._categorySource = 'prefixe-ean';
    reclasses++;
    parCategorie[hit.category] = (parCategorie[hit.category] || 0) + 1;
  }
  return { reclasses, prefixes: learned.size, parCategorie };
}
