import pkg from 'pg';
const { Pool } = pkg;
import { classifyProductType, parseQueryIntent } from './product-type.js';
import { countDistinctMerchants } from '../scripts/lib/merchants.js';
import { filterByCondition } from '../scripts/lib/condition.js';

const AFFILAE_PROFILE_ID = '69c1bc52b682a8edf3205672';

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
  return {
    ...p,
    programs: p.program_title ? { title: p.program_title, countries: [] } : null,
    tracking_url: makeTrackingUrl(p)
  };
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

async function groupWithOffers(client, products) {
  const eans = [...new Set(products.map(p => p.ean).filter(Boolean))];
  const offersByEan = await getAllOffersForEans(client, eans);

  const eanMap = new Map();
  for (const p of products) {
    const key = p.ean || p.id;
    if (eanMap.has(key)) continue;
    const offers = offersByEan.get(p.ean) || [];

    const filtered = filterCompatibleOffers(p.category, offers);
    // Compte les marchands DISTINCTS en fusionnant ceux qui pointent vers
    // le meme marchand reel (LOT 2 -- scripts/lib/merchants.js). Avant ce
    // branchement, deux program_id du meme marchand (ex: Foot Store 2 /
    // Footstore avant leur fusion) comptaient a tort comme 2 marchands.
    const distinctVendorCount = await countDistinctMerchants(client, filtered);
    if (distinctVendorCount < 2) continue;

    const best = filtered[0];
    eanMap.set(key, {
      ...best,
      price: best.price,
      ean_offers: filtered,
      offers_count: distinctVendorCount
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

async function countDistinctEans(client, whereSql, params) {
  const r = await client.query(`
    SELECT COUNT(DISTINCT p.ean) AS total
    FROM products p
    WHERE ${whereSql}
  `, params);
  return parseInt(r.rows[0]?.total || '0', 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action='list', q='', limit='30', page='1', id='', cat='' } = req.query;
  const limitN = Math.min(parseInt(limit)||30, 100);
  const pageN = Math.max(parseInt(page)||1, 1);
  const offset = (pageN - 1) * limitN;

  const pool = getPool();
  const client = await pool.connect();

  try {
    let rows = [];
    let total = null;
    let searchMeta = {};

    if (action === 'search' && q) {
      const tsQuery = buildTsQuery(q);
      // Requete a mots-vides uniquement (ex: "de", "le") -> repli simple
      const hasQuery = tsQuery.length > 0;

      let r, totalCount;
      if (hasQuery) {
        const searchWhere = MULTI_VENDOR_WHERE;
        [r, totalCount] = await Promise.all([
          client.query(`
            WITH matched AS (
              SELECT DISTINCT ON (p.ean) p.*, pr.title as program_title,
                ts_rank(p.search_vector, query) AS rank,
                similarity(p.title, $1) AS trgm_sim
              FROM products p
              LEFT JOIN programs pr ON p.program_id = pr.id,
              to_tsquery('french', $2) query
              WHERE ${searchWhere}
              AND (p.search_vector @@ query OR p.title % $1)
              ORDER BY p.ean, ts_rank(p.search_vector, query) DESC, p.price ASC
            )
            SELECT * FROM matched
            ORDER BY rank DESC, trgm_sim DESC
            LIMIT $3 OFFSET $4
          `, [q, tsQuery, limitN * 4, offset]),
          client.query(`
            SELECT COUNT(DISTINCT p.ean) AS total
            FROM products p, to_tsquery('french', $2) query
            WHERE ${MULTI_VENDOR_WHERE}
            AND (p.search_vector @@ query OR p.title % $1)
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

        const scoreOf = row => parseFloat(row.rank) + parseFloat(row.trgm_sim || 0);
        const tierOf = row => {
          if (!queryIntent.primaryType) return 0;   // requete generique : pas de tri par type
          return classifyProductType(row.title) === queryIntent.primaryType ? 1 : 0;
        };

        const ranked = r.rows.map(row => ({ row, score: scoreOf(row), tier: tierOf(row) }))
          .sort((a, b) => (b.tier - a.tier) || (b.score - a.score))
          .map(x => x.row);

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
        rows = rows.slice(0, limitN);

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
        rows = r2.rows.map(p => ({...formatRow(p), ean_offers: null, offers_count: 1}));
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
        ORDER BY pr.title
      `);
      rows = r.rows.map(row => ({ title: row.title }));
      total = rows.length;

    } else if (action === 'product' && id) {
      const r = await client.query(`
        SELECT p.*, pr.title as program_title FROM products p
        LEFT JOIN programs pr ON p.program_id = pr.id
        WHERE p.id = $1 LIMIT 1
      `, [id]);
      if (r.rows.length > 0) {
        const product = formatRow(r.rows[0]);
        if (product.ean) {
          const offers = await getEanOffers(client, product.ean, product.category);
          product.ean_offers = offers;
          product.offers_count = offers.length;
        }
        rows = [product];
      }

    } else if (action === 'category' && cat) {
      const catWhere = MULTI_VENDOR_WHERE + ' AND p.category = $1';

      const [r, totalCount] = await Promise.all([
        client.query(`
          SELECT DISTINCT ON (p.ean) p.*, pr.title as program_title
          FROM products p
          LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE ${catWhere}
          ORDER BY p.ean, p.price ASC
          LIMIT $2 OFFSET $3
        `, [cat, limitN * 3, offset]),
        countDistinctEans(client, catWhere, [cat]),
      ]);
      total = totalCount;

      if (r.rows.length > 0) {
        rows = await groupWithOffers(client, r.rows);
        rows = rows.slice(0, limitN);
      } else {
        const r2 = await client.query(`
          SELECT p.*, pr.title as program_title FROM products p
          LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE p.status = 'enabled'
          AND p.program_id NOT LIKE '%darty%'
          AND p.category = $1
          ORDER BY p.updated_at DESC LIMIT $2 OFFSET $3
        `, [cat, limitN, offset]);
        rows = r2.rows.map(p => ({...formatRow(p), ean_offers: null, offers_count: 1}));
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

      const perCatResults = await Promise.all(CATS.map(({ cat, n }) =>
        client.query(`
          SELECT DISTINCT ON (p.ean) p.*, pr.title as program_title
          FROM products p
          LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE ${MULTI_VENDOR_WHERE}
          AND p.category = $1
          ORDER BY p.ean, p.price ASC
          LIMIT $2
        `, [cat, n * 3])
      ));

      // Une seule requête d'offres pour TOUS les candidats de toutes
      // les catégories, au lieu d'une par catégorie.
      const allCandidates = perCatResults.flatMap(r => r.rows);
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
    console.error('API error:', err.message);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  } finally {
    client.release();   // rend la connexion au pool, ne la ferme pas
  }
}
