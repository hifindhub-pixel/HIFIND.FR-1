// scripts/lib/ean-prefix.js
import { textSignal } from './categorize.js';
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
const MIN_KNOWN = 12;      // en dessous, l'echantillon ne prouve rien
const MIN_RATIO = 0.90;   // il faut une majorite tres nette : un fabricant
                           // generaliste (accessoires + high-tech + auto...)
                           // ne doit jamais franchir ce seuil par accident

// Plafond dur : meme un prefixe qui passe les deux seuils ci-dessus ne peut
// reclasser plus de N produits. Un GRAND fabricant (Bosch, Samsung, Philips...)
// enregistre UN SEUL prefixe GS1 pour des gammes totalement differentes
// (plaquettes de frein ET perceuses ET lave-vaisselle). Sans ce plafond, une
// poignee de references correctement identifiees suffit a "prouver" que le
// prefixe entier est auto-moto, et a embarquer des milliers de produits sans
// rapport. Un fabricant NICHE (Michelin = uniquement des pneus) ne rencontre
// jamais ce plafond en pratique — c'est precisement les gros generalistes
// qu'on veut brider.

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
const MAX_PER_PREFIX = 150;   // plafond dur, voir commentaire ci-dessus

export function applyPrefixes(products, learned) {
  let reclasses = 0, blocked = 0, capped = 0;
  const parCategorie = Object.create(null);
  const perPrefixCount = new Map();

  for (const p of products) {
    if (p.category && p.category !== 'autres') continue;
    const pref = prefixOf(p.ean);
    if (!pref) continue;
    const hit = learned.get(pref);
    if (!hit) continue;

    // Garde-fou texte : si le produit se decrit lui-meme differemment,
    // on refuse la propagation plutot que de trancher a l'aveugle.
    const sig = textSignal(p);
    if (sig && sig.category !== hit.category) { blocked++; continue; }

    // Garde-fou volume : un seul prefixe ne peut pas "avaler" un nombre
    // demesure de produits, meme s'il passe les seuils statistiques.
    const already = perPrefixCount.get(pref) || 0;
    if (already >= MAX_PER_PREFIX) { capped++; continue; }
    perPrefixCount.set(pref, already + 1);

    p.category = hit.category;
    p._categorySource = 'prefixe-ean';
    reclasses++;
    parCategorie[hit.category] = (parCategorie[hit.category] || 0) + 1;
  }
  return { reclasses, blocked, capped, prefixes: learned.size, parCategorie };
}
