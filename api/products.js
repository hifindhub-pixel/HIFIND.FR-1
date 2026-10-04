import pkg from 'pg';
const { Pool } = pkg;
import { classifyProduct } from '../scripts/lib/product-type.js';
import { classifyProductType, parseQueryIntent } from './product-type.js';
import { countDistinctMerchants, loadMerchantAliases, canonicalMerchantId } from '../scripts/lib/merchants.js';
import { filterByCondition } from '../scripts/lib/condition.js';
import { detectContradictions } from '../scripts/lib/quarantine.js';
import { computePriceInsights } from '../scripts/lib/price-insights.js';
import { rankSearchResults } from '../scripts/lib/search-ranking.js';

const AFFILAE_PROFILE_ID = '69c1bc52b682a8edf3205672';

export function slugifyMerchant(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// ═══════════════════════════════════════════════════════════════
// Pool de connexion créé UNE SEULE FOIS au chargement du module,
// pas à chaque requête. Sur Vercel, une instance serverless "chaude"
// réutilise ce pool entre deux invocations successives — ça évite de
// refaire une poignée de main TCP+TLS complète avec Neon à chaque
// visite, qui était la première cause de lenteur.
//
// max:3 reste prudent sur le plan gratuit Neon (limite de connexions
// simultanées basse) tout en permettant un peu de parallélisme réel.
// ═══════════════════════════════════════════════════════════════
let _pool = null;
export function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.NEON_URL,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return _pool;
}

export function makeTrackingUrl(product) {
  if (!product.url) return '#';
  if (product.program_id && (
    product.program_id.startsWith('effinity_') ||
    product.program_id.startsWith('rakuten_') ||
    product.program_id.startsWith('bcdjeux') ||
    product.program_id.startsWith('awin_') ||
    product.program_id.startsWith('affilae_feed_') ||
    product.program_id.startsWith('cj_')
  )) return product.url;
  if (product.program_id) {
    return 'https://track.affilae.com/' + product.program_id +
           '?ae=' + AFFILAE_PROFILE_ID + '&url=' + encodeURIComponent(product.url);
  }
  return product.url;
}

export function formatRow(p) {
  const classification = classifyProduct(p);
  return {
    ...p,
    category: classification.category === 'autres' ? p.category : classification.category,
    programs: p.program_title ? { title: p.program_title, countries: [] } : null,
    tracking_url: makeTrackingUrl(p),
    // LOT 4 : calcule une seule fois ici, au point le plus central --
    // formatRow() est appele par tous les chemins de reponse (recherche,
    // categorie, fiche produit), garantit que product_type est toujours
    // present sans avoir a l'ajouter endpoint par endpoint.
    product_type: classification.product_type,
    product_type_label: classification.product_type_label,
    category_family: classification.category_family,
    category_path: classification.category === 'autres' && p.category ? [p.category] : classification.category_path,
    category_source: classification.source,
    classification_version: classification.classification_version,
  };
}

// Pick the reference supported by the largest number of independent feeds
// before looking at price. This prevents a cheap accessory carrying a reused
// EAN from becoming the title/image of the actual product page.
export function prioritizeProductReferences(rows) {
  const support = new Map();
  const typed = rows.map(row => ({ row, type: formatRow(row).product_type }));
  typed.forEach(({ row, type }) => {
    if (!support.has(type)) support.set(type, new Set());
    support.get(type).add(row.program_id);
  });
  return typed.sort((a,b) =>
    (support.get(b.type)?.size || 0) - (support.get(a.type)?.size || 0)
      || Number(a.row.price || Infinity) - Number(b.row.price || Infinity)
  ).map(item => item.row);
}

const MULTI_VENDOR_WHERE = `
  p.ean IS NOT NULL
  AND p.status = 'enabled'
  AND p.program_id NOT LIKE '%darty%'
  AND EXISTS (
    SELECT 1 FROM products p2
    WHERE p2.ean = p.ean
    AND p2.program_id != p.program_id
    AND p2.status = 'enabled'
  )
`;

// "Innovations" is a cross-category collection, not a primary taxonomy.
// It therefore never steals a product from High-Tech, Maison or Sport. The
// list is deliberately based on concrete product wording present in feeds.
export const INNOVATION_WHERE = `(
  p.category IN ('high-tech','maison-jardin','sport-outdoor','sante-nutrition')
  AND lower(COALESCE(p.title,'') || ' ' || COALESCE(p.description,'')) ~
    '(intelligence artificielle|(^|[^a-z])ai([^a-z]|$)|copilot[ +]?pc|smart ring|bague connect[eé]e|lunettes connect[eé]es|r[eé]alit[eé] (virtuelle|mixte)|casque vr|pliable|foldable|imprimante 3d|scanner 3d|drone|robot|domotique|maison connect[eé]e|matter|wifi 7|wi-fi 7|oled|mini[- ]led|[eé]lectrique|solaire portable)'
)`;

const MARKET_INTEREST_SQL = `CASE
  WHEN EXISTS (
    SELECT 1 FROM products trend_offer
    WHERE trend_offer.ean = p.ean
    AND lower(COALESCE(trend_offer.title, '')) LIKE ANY (ARRAY[
      '%coque%', '% case %', '% cover%', '%housse%', '%etui%', '%étui%',
      '%flip wallet%', '%folio%', '%panzer%glass%', '%verre%iphone%',
      '%verre%galaxy%', '%protecteur%iphone%', '%protecteur%galaxy%',
      '%protection%iphone%', '%protection%galaxy%', '%protection d''écran%',
      '%film protecteur%', '%anti-rayures%', '%antichocs%', '%cartouche%',
      '%toner%', '%cable%', '%câble%', '%adaptateur%', '%chargeur%',
      '%support pour%', '%manette%', '%volant%', '%sacoche%'
    ])
  ) THEN -100
  WHEN lower(p.title) ~ '(iphone [0-9]|galaxy [asz][0-9]|google pixel [0-9]|pixel [0-9]|redmi note [0-9]|smartphone .{0,20}(go|5g|4g))' THEN 40
  WHEN lower(p.title) ~ '(playstation 5|ps5 slim|xbox series [xs]|nintendo switch (2|oled))' THEN 34
  WHEN lower(p.title) ~ '(airpods|ecouteurs|casque audio|montre connectee|smartwatch|aspirateur robot|air ?fryer)' THEN 24
  WHEN lower(p.title) ~ '(ordinateur portable|pc gamer|tablette tactile|television|tv oled|drone|robot aspirateur)' THEN 18
  WHEN lower(p.title) ~ '(sneaker|basket|parfum|lego|poussette|velo electrique)' THEN 10
  ELSE 0 END`;

export async function rankedCandidates(client, { category = '', limit = 90, offset = 0 } = {}) {
  const innovation = category === 'innovations';
  const filter = innovation ? INNOVATION_WHERE : (category ? 'p.category = $1' : 'TRUE');
  const args = category && !innovation ? [category, limit, offset] : [limit, offset];
  const limitIndex = category && !innovation ? 2 : 1;
  const offsetIndex = limitIndex + 1;
  const baseCte = `WITH candidates AS (
      SELECT DISTINCT ON (p.ean) p.*, pr.title AS program_title,
        ${MARKET_INTEREST_SQL} AS market_interest
      FROM products p LEFT JOIN programs pr ON p.program_id = pr.id
      WHERE ${MULTI_VENDOR_WHERE} AND ${filter}
      ORDER BY p.ean, p.price ASC
    )`;

  try {
    return await client.query(`${baseCte}, engagement AS (
        SELECT ean, SUM(detail_views)::int AS detail_views, SUM(offer_clicks)::int AS offer_clicks
        FROM product_engagement_daily WHERE day >= CURRENT_DATE - INTERVAL '30 days' GROUP BY ean
      )
      SELECT candidates.*,
        COALESCE(engagement.detail_views,0) AS trend_views,
        COALESCE(engagement.offer_clicks,0) AS trend_clicks,
        (candidates.market_interest + COALESCE(engagement.detail_views,0) * 2
          + COALESCE(engagement.offer_clicks,0) * 6) AS trend_score,
        COUNT(*) OVER() AS total_count
      FROM candidates LEFT JOIN engagement USING (ean)
      ORDER BY trend_score DESC, candidates.updated_at DESC NULLS LAST, candidates.ean
      LIMIT $${limitIndex} OFFSET $${offsetIndex}`, args);
  } catch (error) {
    if (error.code !== '42P01') throw error;
    return client.query(`${baseCte}
      SELECT candidates.*, 0 AS trend_views, 0 AS trend_clicks,
        candidates.market_interest AS trend_score, COUNT(*) OVER() AS total_count
      FROM candidates
      ORDER BY trend_score DESC, candidates.updated_at DESC NULLS LAST, candidates.ean
      LIMIT $${limitIndex} OFFSET $${offsetIndex}`, args);
  }
}

const INCOMPATIBLE = {
  'auto-moto': ['beaute-bienetre','mode-vetements','enfants-bebes','alimentation-bio'],
  'beaute-bienetre': ['auto-moto','sport-outdoor'],
  'high-tech': ['auto-moto','beaute-bienetre','alimentation-bio'],
};

function normalizeBrand(b) {
  return String(b || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Filtre les offres d'un meme EAN pour ne garder que celles compatibles
 * avec le produit de reference : categorie non contradictoire (deja en
 * place), et surtout marque non contradictoire. Un EAN mal saisi ou
 * reutilise cote marchand peut faire "matcher" deux produits sans rapport
 * (voir l'audit : une batterie de cuisine remontee en tete de High-Tech).
 * Sans marque renseignee des deux cotes, aucun conflit n'est detectable —
 * on ne filtre alors que sur la categorie.
 */
function filterCompatibleOffers(mainCategory, offers) {
  const excluded = INCOMPATIBLE[mainCategory || ''] || [];
  let filtered = offers.filter(o => !excluded.includes(o.category));

  const brandCounts = new Map();
  filtered.forEach(o => {
    const nb = normalizeBrand(o.brand);
    if (nb) brandCounts.set(nb, (brandCounts.get(nb) || 0) + 1);
  });
  if (brandCounts.size > 1) {
    // Ne filtre que s'il existe un LEADER CLAIR (strictement plus
    // frequent que toute autre marque) -- sinon on risque d'exclure au
    // hasard un marchand legitime. Cas reel qui a expose ce bug : une
    // PS5 vendue par trois marchands sous trois libelles differents du
    // MEME fabricant ("Sony", "Sony Interactive Entertainment",
    // "Playstation") -- aucune majorite, le filtre en excluait deux sur
    // trois au hasard et faisait tomber le produit sous le seuil de 2
    // marchands necessaires a l'affichage. L'absence de majorite doit
    // rendre le filtre neutre, pas trancher arbitrairement.
    const counts = [...brandCounts.values()].sort((a, b) => b - a);
    const hasClearLeader = counts.length > 1 && counts[0] > counts[1];
    if (hasClearLeader) {
      let refBrand = null, refCount = 0;
      for (const [b, n] of brandCounts) if (n > refCount) { refBrand = b; refCount = n; }
      filtered = filtered.filter(o => {
        const nb = normalizeBrand(o.brand);
        return !nb || nb === refBrand;
      });
    }
  }

  // LOT 2 : separe neuf, occasion et reconditionne au sein d'un meme
  // regroupement EAN -- comparer le prix d'un exemplaire neuf a celui
  // d'un reconditionne comme s'il s'agissait de la meme offre serait
  // trompeur. Meme principe de leader clair que le filtre de marque
  // ci-dessus : n'exclut jamais sur une simple egalite.
  filtered = filterByCondition(filtered);

  return filtered;
}

function filterOffersByProductType(reference, offers, merchantAliases) {
  const referenceType = formatRow(reference).product_type;
  if (!referenceType || referenceType === 'other') return offers;
  // Un EAN reutilise a tort sur une coque et un telephone ne doit jamais
  // faire de la coque la "meilleure offre" du telephone. On conserve les
  // offres du type de la fiche et les titres ambigus, uniquement si cela
  // laisse bien au moins deux marchands reels comparables.
  const compatible = offers.filter(offer =>
    offer.product_type === referenceType || offer.product_type === 'other'
  );
  const vendors = new Set(compatible.map(offer => canonicalMerchantId(merchantAliases, offer.program_id)));
  return vendors.size >= 2 ? compatible : [];
}

export async function getEanOffers(client, ean, mainCategory) {
  const r = await client.query(`
    SELECT DISTINCT ON (p.program_id) p.*, pr.title as program_title
    FROM products p
    LEFT JOIN programs pr ON p.program_id = pr.id
    WHERE p.ean = $1 AND p.status = 'enabled'
    AND p.program_id NOT LIKE '%darty%'
    ORDER BY p.program_id, p.price ASC
  `, [ean]);
  const rows = filterCompatibleOffers(mainCategory, r.rows.map(formatRow));
  rows.sort((a,b) => (parseFloat(a.price)||0) - (parseFloat(b.price)||0));
  return rows;
}

// Récupère toutes les offres pour une liste d'EANs en UNE SEULE requête
async function getAllOffersForEans(client, eans) {
  if (!eans.length) return new Map();
  const r = await client.query(`
    SELECT DISTINCT ON (p.ean, p.program_id) p.*, pr.title as program_title
    FROM products p
    LEFT JOIN programs pr ON p.program_id = pr.id
    WHERE p.ean = ANY($1) AND p.status = 'enabled'
    AND p.program_id NOT LIKE '%darty%'
    ORDER BY p.ean, p.program_id, p.price ASC
  `, [eans]);

  const byEan = new Map();
  for (const row of r.rows) {
    const formatted = formatRow(row);
    if (!byEan.has(row.ean)) byEan.set(row.ean, []);
    byEan.get(row.ean).push(formatted);
  }
  for (const offers of byEan.values()) {
    offers.sort((a,b) => (parseFloat(a.price)||0) - (parseFloat(b.price)||0));
  }
  return byEan;
}

export async function groupWithOffers(client, products) {
  const eans = [...new Set(products.map(p => p.ean).filter(Boolean))];
  if (!eans.length) return [];
  const offersByEan = await getAllOffersForEans(client, eans);
  const merchantAliases = await loadMerchantAliases(client);

  const eanMap = new Map();
  for (const p of products) {
    const key = p.ean || p.id;
    if (eanMap.has(key)) continue;
    const offers = offersByEan.get(p.ean) || [];

    let filtered = filterCompatibleOffers(formatRow(p).category, offers);
    filtered = filterOffersByProductType(p, filtered, merchantAliases);
    if (!filtered.length) continue;

    // A public read must not depend on a database write: Neon can keep
    // serving SELECTs after reaching its storage quota. Keep excluding
    // contradictory groups, without appending observations on every visit.
    if (offers.length >= 2 && detectContradictions(p.ean, offers).length > 0) continue;

    // Compte les marchands DISTINCTS en fusionnant ceux qui pointent vers
    // le meme marchand reel (LOT 2 -- scripts/lib/merchants.js). Avant ce
    // branchement, deux program_id du meme marchand (ex: Foot Store 2 /
    // Footstore avant leur fusion) comptaient a tort comme 2 marchands.
    const distinctVendorCount = new Set(filtered.map(offer => canonicalMerchantId(merchantAliases, offer.program_id))).size;
    if (distinctVendorCount < 2) continue;

    const best = filtered[0];
    eanMap.set(key, {
      ...best,
      price: best.price,
      ean_offers: filtered,
      offers_count: distinctVendorCount
      // product_type deja present sur "best" : filtered vient d'offres
      // deja passees par formatRow() (getAllOffersForEans), qui le
      // calcule desormais de facon centrale -- inutile de le recalculer ici.
    });
  }
  return Array.from(eanMap.values());
}

/**
 * Compte le nombre total d'EAN distincts correspondant au filtre, pour
 * construire une vraie pagination ("page 3 sur 47"). Requête légère :
 * juste un COUNT sur des EAN déjà indexés, pas de récupération de lignes.
 */
/**
 * Construit une requete tsquery a partir de la saisie utilisateur : chaque
 * mot devient un prefixe (ex. "iphon:*") pour matcher une saisie partielle,
 * les mots sont combines en ET logique.
 */
function buildTsQuery(q) {
  return q.trim().split(/\s+/).filter(Boolean)
    .map(w => w.replace(/[^\p{L}\p{N}]/gu, '') + ':*')
    .filter(w => w !== ':*')
    .join(' & ');
}

async function loadSearchEngagement(client, eans) {
  if (!eans.length) return new Map();
  try {
    const result = await client.query(`
      SELECT ean,
        SUM(detail_views) FILTER (WHERE day >= CURRENT_DATE - INTERVAL '30 days')::int AS detail_views,
        SUM(offer_clicks) FILTER (WHERE day >= CURRENT_DATE - INTERVAL '30 days')::int AS offer_clicks
      FROM product_engagement_daily
      WHERE ean = ANY($1) AND day >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY ean
    `, [eans]);
    return new Map(result.rows.map(row => [String(row.ean), row]));
  } catch (error) {
    if (error.code === '42P01') return new Map();
    throw error;
  }
}

export async function getPriceHistory(client, ean, days = 180) {
  try {
    const result = await client.query(`
      SELECT observed_at, min_price, avg_price, max_price, merchant_count
      FROM price_history
      WHERE ean = $1 AND observed_at >= NOW() - make_interval(days => $2::int)
      ORDER BY observed_at ASC
    `, [ean, days]);
    return result.rows.map(row => ({
      observed_at: row.observed_at,
      min_price: Number(row.min_price),
      avg_price: Number(row.avg_price),
      max_price: Number(row.max_price),
      merchant_count: Number(row.merchant_count),
    }));
  } catch (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
}

/**
 * Canonical product-detail loader shared by the JSON API and the indexable
 * HTML route. Keeping this in one place guarantees the same reference,
 * offers, merchant count and price intelligence in both renderers.
 */
export async function getComparableProductDetail(client, { id = '', ean = '', includeHistory = true } = {}) {
  if (!id && !ean) return null;
  const result = await client.query(`
    SELECT p.*, pr.title AS program_title
    FROM products p LEFT JOIN programs pr ON pr.id=p.program_id
    WHERE ${id ? 'p.id=$1' : 'p.ean=$1'}
      AND p.status='enabled' AND p.price>0
      AND p.program_id NOT LIKE '%darty%'
    ORDER BY p.price ASC
  `, [id || ean]);
  if (!result.rows.length) return null;

  const references = id ? result.rows : prioritizeProductReferences(result.rows);
  const product = formatRow(references[0]);
  if (!product.ean) return null;

  const rawOffers = await getEanOffers(client, product.ean, product.category);
  const merchantAliases = await loadMerchantAliases(client);
  const offers = filterOffersByProductType(product, rawOffers, merchantAliases);
  if (!offers.length) return null;
  const merchantCount = await countDistinctMerchants(client, offers);
  if (merchantCount < 2) return null;

  product.ean_offers = offers;
  product.offers_count = merchantCount;
  if (includeHistory) {
    product.price_history = await getPriceHistory(client, product.ean);
    product.price_insight = computePriceInsights(offers, product.price_history, new Date(), { merchantCount });
  }
  return product;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action='list', q='', limit='30', page='1', id='', ean='', cat='' } = req.query;
  const limitN = Math.max(1, Math.min(parseInt(limit)||30, 100));
  const pageN = Math.max(parseInt(page)||1, 1);
  const offset = (pageN - 1) * limitN;

  const pool = getPool();
  let client;

  try {
    client = await pool.connect();
    let rows = [];
    let total = null;
    let searchMeta = {};

    if ((action === 'search' || action === 'suggest') && q) {
      const tsQuery = buildTsQuery(q);
      // Requete a mots-vides uniquement (ex: "de", "le") -> repli simple
      const hasQuery = tsQuery.length > 0;

      let r, totalCount;
      if (hasQuery) {
        const searchWhere = MULTI_VENDOR_WHERE;
        [r, totalCount] = await Promise.all([
          client.query(`
            WITH matched AS (
              SELECT p.*, pr.title as program_title,
                ts_rank(p.search_vector, query) AS rank,
                GREATEST(similarity(p.title, $1), similarity(COALESCE(p.brand,''), $1)) AS trgm_sim,
                (lower(p.title) = lower($1) OR lower(p.brand) = lower($1)) AS exact_match,
                (p.ean = regexp_replace($1, '[^0-9]', '', 'g')) AS ean_match,
                (strpos(lower(p.title), lower($1)) > 0) AS phrase_match
              FROM products p
              LEFT JOIN programs pr ON p.program_id = pr.id,
              to_tsquery('french', $2) query
              WHERE ${searchWhere}
              AND (p.search_vector @@ query
                OR lower(p.brand) = lower($1) OR p.ean = regexp_replace($1, '[^0-9]', '', 'g'))
            )
            SELECT * FROM matched
            ORDER BY ean_match DESC, exact_match DESC NULLS LAST, phrase_match DESC, rank DESC, trgm_sim DESC
            LIMIT $3 OFFSET $4
          `, [q, tsQuery, limitN * 8, offset]),
          client.query(`
            SELECT COUNT(DISTINCT p.ean) AS total
            FROM products p, to_tsquery('french', $2) query
            WHERE ${MULTI_VENDOR_WHERE}
            AND (p.search_vector @@ query
              OR lower(p.brand) = lower($1) OR p.ean = regexp_replace($1, '[^0-9]', '', 'g'))
          `, [q, tsQuery]).then(res => parseInt(res.rows[0]?.total || '0', 10)),
        ]);
      } else {
        r = { rows: [] };
        totalCount = 0;
      }
      total = totalCount;

      if (r.rows.length > 0) {
        // LOT 1 : classification generique par product_type, en
        // remplacement du systeme construit specifiquement pour PS5.
        // Le principe reste identique (palier avant score, jamais
        // l'inverse -- verifie a de multiples reprises sur des donnees
        // reelles le 09/08 : un score textuel plus eleve pour un jeu
        // court comme "GTA V PS5" ne doit jamais faire perdre une vraie
        // console), mais s'applique desormais a n'importe quelle
        // famille de produits (smartphone, casque, electromenager...)
        // au lieu d'etre code en dur pour une seule.
        const queryIntent = parseQueryIntent(q);

        const scoreOf = row => (row.exact_match ? 10 : 0) + parseFloat(row.rank) + parseFloat(row.trgm_sim || 0);
        const tierOf = row => {
          if (!queryIntent.primaryType) return 0;   // requete generique : pas de tri par type
          return classifyProductType(row.title) === queryIntent.primaryType ? 1 : 0;
        };

        const rankedOffers = r.rows.map(row => ({ row, score: scoreOf(row), tier: tierOf(row) }))
          .sort((a, b) => (b.tier - a.tier) || (b.score - a.score))
          .map(x => x.row);
        // Plusieurs marchands peuvent fournir le meme EAN. Le choix de la
        // fiche de reference se fait APRES le classement par type, afin
        // qu'une coque moins chere partageant un EAN errone ne remplace pas
        // un smartphone dans les resultats.
        const seenEans = new Set();
        const ranked = rankedOffers.filter(row => {
          const key = row.ean || row.id;
          if (seenEans.has(key)) return false;
          seenEans.add(key);
          return true;
        });

        // Diagnostic temporaire : &debug=1 dans l'URL renvoie le classement
        // FINAL (palier + score) des 15 premiers candidats, apres tri.
        if (req.query.debug === '1') {
          searchMeta.debug = ranked.slice(0, 15).map(row => ({
            title: row.title,
            ean: row.ean,
            program_id: row.program_id,
            rank: parseFloat(row.rank),
            trgm_sim: parseFloat(row.trgm_sim || 0),
            productType: classifyProductType(row.title),
            tier: tierOf(row),
            score: scoreOf(row),
          }));
          searchMeta.queryIntent = queryIntent;
          searchMeta.totalCandidatesFetched = r.rows.length;
        }

        rows = await groupWithOffers(client, ranked);
        const engagement = await loadSearchEngagement(client, rows.map(product => product.ean).filter(Boolean));
        rows = rankSearchResults(rows, q, queryIntent, engagement).slice(0, limitN);

        // La recherche demande un type precis (ex: "console" pour "PS5")
        // mais AUCUN resultat de ce type n'existe : le dire explicitement
        // plutot que de laisser croire qu'un accessoire ou un jeu EST la
        // reponse a la recherche. Correspond au critere d'acceptation
        // "afficher Aucun iPhone 15 comparable actuellement".
        searchMeta.noPrimaryTypeMatch = !!queryIntent.primaryType
          && rows.length > 0
          && !rows.some(p => classifyProductType(p.title) === queryIntent.primaryType);
        searchMeta.requestedType = queryIntent.primaryType;
      } else {
        const term = '%' + q + '%';
        const r2 = await client.query(`
          SELECT p.*, pr.title as program_title
          FROM products p LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE p.status = 'enabled'
          AND p.program_id NOT LIKE '%darty%'
          AND (p.title ILIKE $1 OR p.brand ILIKE $1)
          ORDER BY p.updated_at DESC LIMIT $2
        `, [term, limitN]);
        rows = await groupWithOffers(client, r2.rows);
        if (cat) rows = rows.filter(p => p.category === cat);
        total = rows.length;
      }

    } else if (action === 'merchants') {
      // Liste complete des marchands actifs, independante de l'echantillon
      // affiche en page d'accueil — pour la bande defilante notamment.
      const r = await client.query(`
        SELECT DISTINCT pr.title
        FROM products p
        JOIN programs pr ON p.program_id = pr.id
        WHERE p.status = 'enabled'
        AND p.program_id NOT LIKE '%darty%'
        AND pr.title IS NOT NULL
        AND p.ean IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM products p2
          WHERE p2.ean = p.ean AND p2.status = 'enabled'
          AND p2.program_id != p.program_id
        )
        ORDER BY pr.title
      `);
      rows = r.rows.map(row => ({ title: row.title, slug: slugifyMerchant(row.title) }));
      total = rows.length;

    } else if (action === 'product' && (id || ean)) {
      const product = await getComparableProductDetail(client, { id, ean, includeHistory:true });
      if (product) rows = [product];

    } else if (action === 'stats') {
      // LOT design : compteurs reels par categorie pour la grille de la
      // page d'accueil -- une seule requete groupee plutot que 11 appels
      // separes, meme WHERE que les autres endpoints (2+ marchands,
      // hors darty, EAN present) pour rester coherent avec ce que
      // l'utilisateur verra reellement en cliquant sur la categorie.
      const r = await client.query(`
        SELECT p.category, COUNT(DISTINCT p.ean) AS total
        FROM products p
        WHERE ${MULTI_VENDOR_WHERE}
        GROUP BY p.category
      `);
      const byCategory = {};
      r.rows.forEach(row => { byCategory[row.category] = parseInt(row.total, 10); });
      try {
        const innovationCount = await client.query(`SELECT COUNT(DISTINCT p.ean) AS total
          FROM products p WHERE ${MULTI_VENDOR_WHERE} AND ${INNOVATION_WHERE}`);
        byCategory.innovations = parseInt(innovationCount.rows[0]?.total || '0', 10);
      } catch (error) {
        console.warn('Innovation stats unavailable:', error.message);
      }
      return res.status(200).json({ data: byCategory });

    } else if ((action === 'category' || action === 'trending') && (cat || action === 'trending')) {
      const selectedCategory = action === 'trending' ? cat : cat;
      const r = await rankedCandidates(client, {
        category: selectedCategory,
        limit: limitN * 3,
        offset,
      });
      total = parseInt(r.rows[0]?.total_count || '0', 10);

      if (r.rows.length > 0) {
        rows = await groupWithOffers(client, r.rows);
        const scoreByEan = new Map(r.rows.map(row => [row.ean, {
          trend_score: Number(row.trend_score) || 0,
          trend_views: Number(row.trend_views) || 0,
          trend_clicks: Number(row.trend_clicks) || 0,
        }]));
        rows = rows.map(product => ({ ...product, ...(scoreByEan.get(product.ean) || {}) }));
        if (selectedCategory && selectedCategory !== 'innovations') {
          rows = rows.filter(p => p.category === selectedCategory);
        }
        rows = rows.sort((a,b) => (b.trend_score || 0) - (a.trend_score || 0)).slice(0, limitN);
      } else if (selectedCategory && selectedCategory !== 'innovations') {
        const r2 = await client.query(`
          SELECT p.*, pr.title as program_title FROM products p
          LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE p.status = 'enabled'
          AND p.program_id NOT LIKE '%darty%'
          AND p.category = $1
          ORDER BY p.updated_at DESC LIMIT $2 OFFSET $3
        `, [selectedCategory, limitN, offset]);
        rows = await groupWithOffers(client, r2.rows);
        rows = rows.filter(p => p.category === selectedCategory);
        total = rows.length;
      }

    } else {
      // HOME : sélection équilibrée par catégorie, TOUT en parallèle.
      // Avant : 7 categories x 2 requêtes chacune, l'une après l'autre
      // (jusqu'à 14 allers-retours séquentiels). Maintenant : les 7
      // premières requêtes partent en même temps, puis UNE SEULE requête
      // d'offres pour l'ensemble des produits collectés.
      const CATS = [
        { cat: 'beaute-bienetre', n: 8 },
        { cat: 'auto-moto',       n: 6 },
        { cat: 'high-tech',       n: 5 },
        { cat: 'sport-outdoor',   n: 4 },
        { cat: 'mode-vetements',  n: 3 },
        { cat: 'enfants-bebes',   n: 2 },
        { cat: 'maison-jardin',   n: 2 },
      ];

      const categoryLimits = CATS.map(item => `('${item.cat.replace(/'/g, "''")}',${item.n * 3})`).join(',');
      const candidates = await client.query(`
        WITH category_limits(category, max_rows) AS (VALUES ${categoryLimits})
        SELECT selected.*, pr.title AS program_title
        FROM category_limits limits
        CROSS JOIN LATERAL (
          SELECT DISTINCT ON (p.ean) p.*
          FROM products p
          WHERE ${MULTI_VENDOR_WHERE} AND p.category = limits.category
          ORDER BY p.ean, p.price ASC
          LIMIT limits.max_rows
        ) selected
        LEFT JOIN programs pr ON selected.program_id = pr.id
      `);

      // Une seule requête de candidats puis une seule requête d'offres
      // pour toutes les catégories de la home.
      const allCandidates = candidates.rows;
      const grouped = await groupWithOffers(client, allCandidates);

      // Re-répartit par catégorie pour respecter le nombre voulu par
      // section (n), puis mélange chaque section indépendamment.
      const byCat = new Map();
      for (const p of grouped) {
        if (!byCat.has(p.category)) byCat.set(p.category, []);
        byCat.get(p.category).push(p);
      }
      const allRows = [];
      for (const { cat, n } of CATS) {
        const list = (byCat.get(cat) || []).sort(() => Math.random() - 0.5);
        allRows.push(...list.slice(0, n));
      }

      rows = allRows.sort(() => Math.random() - 0.5).slice(0, limitN);
      total = rows.length;
    }

    if (action === 'suggest') {
      return res.status(200).json({ data: rows.slice(0, 6).map(p => ({
        id: p.id, ean: p.ean, title: p.title, price: p.price, offers_count: p.offers_count,
        image_url: p.image_url, brand: p.brand, category: p.category,
        product_type: p.product_type, product_type_label: p.product_type_label
      })) });
    }

    const pages = total != null ? Math.max(1, Math.ceil(total / limitN)) : null;

    // Le cache statique de vercel.json (5 min, par URL exacte) sert la
    // MEME reponse en cache tant que l'URL exacte a deja ete appelee une
    // fois -- ce qui inclut potentiellement des requetes anterieures a
    // ce correctif de classement. Desactivation explicite pour la
    // recherche pendant que le tri est encore en cours d'ajustement :
    // mieux vaut recalculer a chaque fois que servir une reponse perimee
    // sans aucun moyen de le detecter depuis le site lui-meme.
    if (action === 'search') {
      res.setHeader('Cache-Control', 'no-store');
    }

    return res.status(200).json({
      data: rows,
      count: rows.length,
      total,
      page: pageN,
      pages,
      limit: limitN,
      meta: searchMeta,
    });

  } catch(err) {
    res.setHeader('Cache-Control', 'no-store');
    console.error('API error:', err.message);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  } finally {
    if (client) client.release();   // rend la connexion au pool, ne la ferme pas
  }
}
