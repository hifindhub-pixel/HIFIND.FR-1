import pkg from 'pg';
const { Pool } = pkg;

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
function getPool() {
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

function makeTrackingUrl(product) {
  if (!product.url) return '#';
  if (product.program_id && (
    product.program_id.startsWith('effinity_') ||
    product.program_id.startsWith('rakuten_') ||
    product.program_id.startsWith('bcdjeux') ||
    product.program_id.startsWith('awin_') ||
    product.program_id.startsWith('affilae_feed_')
  )) return product.url;
  if (product.program_id) {
    return 'https://track.affilae.com/' + product.program_id +
           '?ae=' + AFFILAE_PROFILE_ID + '&url=' + encodeURIComponent(product.url);
  }
  return product.url;
}

function formatRow(p) {
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

async function getEanOffers(client, ean) {
  const r = await client.query(`
    SELECT DISTINCT ON (p.program_id) p.*, pr.title as program_title
    FROM products p
    LEFT JOIN programs pr ON p.program_id = pr.id
    WHERE p.ean = $1 AND p.status = 'enabled'
    AND p.program_id NOT LIKE '%darty%'
    ORDER BY p.program_id, p.price ASC
  `, [ean]);
  const rows = r.rows.map(formatRow);
  rows.sort((a,b) => (parseFloat(a.price)||0) - (parseFloat(b.price)||0));
  return rows;
}

const INCOMPATIBLE = {
  'auto-moto': ['beaute-bienetre','mode-vetements','enfants-bebes','alimentation-bio'],
  'beaute-bienetre': ['auto-moto','sport-outdoor'],
  'high-tech': ['auto-moto','beaute-bienetre','alimentation-bio'],
};

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

    const mainCat = p.category || '';
    const excluded = INCOMPATIBLE[mainCat] || [];
    const filtered = offers.filter(o => !excluded.includes(o.category));
    const distinctVendors = [...new Set(filtered.map(o => o.program_id))];
    if (distinctVendors.length < 2) continue;

    const best = filtered[0];
    eanMap.set(key, {
      ...best,
      price: best.price,
      ean_offers: filtered,
      offers_count: distinctVendors.length
    });
  }
  return Array.from(eanMap.values());
}

/**
 * Compte le nombre total d'EAN distincts correspondant au filtre, pour
 * construire une vraie pagination ("page 3 sur 47"). Requête légère :
 * juste un COUNT sur des EAN déjà indexés, pas de récupération de lignes.
 */
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

    if (action === 'search' && q) {
      const term = '%' + q + '%';
      const searchWhere = MULTI_VENDOR_WHERE + ' AND (p.title ILIKE $1 OR p.brand ILIKE $1 OR p.description ILIKE $1)';

      const [r, totalCount] = await Promise.all([
        client.query(`
          SELECT DISTINCT ON (p.ean) p.*, pr.title as program_title
          FROM products p
          LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE ${searchWhere}
          ORDER BY p.ean, p.price ASC
          LIMIT $2 OFFSET $3
        `, [term, limitN * 3, offset]),
        countDistinctEans(client, searchWhere, [term]),
      ]);
      total = totalCount;

      if (r.rows.length > 0) {
        rows = await groupWithOffers(client, r.rows);
        rows = rows.slice(0, limitN);
      } else {
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

    } else if (action === 'product' && id) {
      const r = await client.query(`
        SELECT p.*, pr.title as program_title FROM products p
        LEFT JOIN programs pr ON p.program_id = pr.id
        WHERE p.id = $1 LIMIT 1
      `, [id]);
      if (r.rows.length > 0) {
        const product = formatRow(r.rows[0]);
        if (product.ean) {
          const offers = await getEanOffers(client, product.ean);
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
    return res.status(200).json({
      data: rows,
      count: rows.length,
      total,
      page: pageN,
      pages,
      limit: limitN,
    });

  } catch(err) {
    console.error('API error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();   // rend la connexion au pool, ne la ferme pas
  }
}
