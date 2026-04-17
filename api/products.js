import pkg from 'pg';
const { Client } = pkg;

const AFFILAE_PROFILE_ID = '69c1bc52b682a8edf3205672';

async function getNeonClient() {
  const client = new Client({ connectionString: process.env.NEON_URL });
  await client.connect();
  return client;
}

function makeTrackingUrl(product) {
  if (!product.url) return '#';
  if (product.program_id && (
    product.program_id.startsWith('effinity_') ||
    product.program_id.startsWith('rakuten_') ||
    product.program_id.startsWith('bcdjeux') ||
    product.program_id.startsWith('awin_')
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
    programs: p.program_title ? { title: p.program_title, countries: p.program_countries||[] } : null,
    tracking_url: makeTrackingUrl(p)
  };
}

// Requête de base : seulement les produits avec 2+ vendeurs différents
const MULTI_VENDOR_WHERE = `
  p.ean IS NOT NULL
  AND p.status = 'enabled'
  AND EXISTS (
    SELECT 1 FROM products p2
    WHERE p2.ean = p.ean
    AND p2.program_id != p.program_id
    AND p2.status = 'enabled'
  )
`;

// Pour un EAN donné, récupère toutes les offres triées par prix
async function getEanOffers(client, ean) {
  const r = await client.query(`
    SELECT p.*, pr.title as program_title
    FROM products p
    LEFT JOIN programs pr ON p.program_id = pr.id
    WHERE p.ean = $1 AND p.status = 'enabled'
    ORDER BY p.price ASC
  `, [ean]);
  return r.rows.map(formatRow).map(p => ({...p, tracking_url: makeTrackingUrl(p)}));
}

// Groupe une liste de produits par EAN → une fiche avec toutes les offres
async function groupWithOffers(client, products) {
  const eanMap = new Map();
  for (const p of products) {
    p.tracking_url = makeTrackingUrl(p);
    if (!eanMap.has(p.ean)) {
      // Charge toutes les offres pour cet EAN
      const offers = await getEanOffers(client, p.ean);
      const best = offers[0];
      eanMap.set(p.ean, {
        ...formatRow(best),
        price: best.price,
        ean_offers: offers,
        offers_count: offers.length
      });
    }
  }
  return Array.from(eanMap.values());
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action='list', q='', limit='30', page='1', id='', cat='' } = req.query;
  const limitN = Math.min(parseInt(limit)||30, 100);
  const offset = (parseInt(page)-1) * limitN;

  const client = await getNeonClient();

  try {
    let rows = [];

    if (action === 'search' && q) {
      const term = '%' + q + '%';
      // Cherche d'abord parmi les multi-vendeurs
      const r = await client.query(`
        SELECT DISTINCT ON (p.ean) p.*, pr.title as program_title
        FROM products p
        LEFT JOIN programs pr ON p.program_id = pr.id
        WHERE ${MULTI_VENDOR_WHERE}
        AND (p.title ILIKE $1 OR p.description ILIKE $1)
        ORDER BY p.ean, p.price ASC
        LIMIT $2
      `, [term, limitN * 3]);

      if (r.rows.length > 0) {
        rows = await groupWithOffers(client, r.rows);
        rows = rows.slice(0, limitN);
      } else {
        // Fallback : tous produits si pas de multi-vendeurs
        const r2 = await client.query(`
          SELECT p.*, pr.title as program_title
          FROM products p LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE p.status = 'enabled' AND (p.title ILIKE $1 OR p.description ILIKE $1)
          ORDER BY p.updated_at DESC LIMIT $2
        `, [term, limitN]);
        rows = r2.rows.map(p => ({...formatRow(p), ean_offers: null, offers_count: 1}));
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
      const r = await client.query(`
        SELECT DISTINCT ON (p.ean) p.*, pr.title as program_title
        FROM products p
        LEFT JOIN programs pr ON p.program_id = pr.id
        WHERE ${MULTI_VENDOR_WHERE}
        AND p.category = $1
        ORDER BY p.ean, p.price ASC
        LIMIT $2 OFFSET $3
      `, [cat, limitN * 3, offset]);

      if (r.rows.length > 0) {
        rows = await groupWithOffers(client, r.rows);
        rows = rows.slice(0, limitN);
      } else {
        // Fallback sans filtre multi-vendeurs
        const r2 = await client.query(`
          SELECT p.*, pr.title as program_title FROM products p
          LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE p.status = 'enabled' AND p.category = $1
          ORDER BY p.updated_at DESC LIMIT $2 OFFSET $3
        `, [cat, limitN, offset]);
        rows = r2.rows.map(p => ({...formatRow(p), ean_offers: null, offers_count: 1}));
      }

    } else {
      // List : priorité aux multi-vendeurs
      const r = await client.query(`
        SELECT DISTINCT ON (p.ean) p.*, pr.title as program_title
        FROM products p
        LEFT JOIN programs pr ON p.program_id = pr.id
        WHERE ${MULTI_VENDOR_WHERE}
        ORDER BY p.ean, p.price ASC
        LIMIT $1 OFFSET $2
      `, [limitN * 3, offset]);

      rows = await groupWithOffers(client, r.rows);
      rows = rows.slice(0, limitN);
    }

    return res.status(200).json({ data: rows, count: rows.length });

  } catch(err) {
    console.error('API error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    await client.end();
  }
}
