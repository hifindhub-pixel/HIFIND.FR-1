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
  if (product.program_id && product.program_id.startsWith('effinity_')) return product.url;
  if (product.program_id && product.program_id.startsWith('rakuten_')) return product.url;
  if (product.program_id && product.program_id.startsWith('bcdjeux')) return product.url;
  if (product.program_id) {
    return 'https://track.affilae.com/' + product.program_id +
           '?ae=' + AFFILAE_PROFILE_ID + '&url=' + encodeURIComponent(product.url);
  }
  return product.url;
}

function groupByEAN(products) {
  const eanMap = {};
  const noEAN = [];
  for (const p of products) {
    p.tracking_url = makeTrackingUrl(p);
    if (p.ean && p.ean.length >= 8) {
      if (!eanMap[p.ean]) {
        eanMap[p.ean] = { ...p, offers: [p] };
      } else {
        eanMap[p.ean].offers.push(p);
        if (p.price && p.price < eanMap[p.ean].price) {
          eanMap[p.ean].price = p.price;
        }
      }
    } else {
      noEAN.push({ ...p, offers: [p] });
    }
  }
  return [...Object.values(eanMap), ...noEAN];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action='list', q='', limit='30', page='1', id='', cat='', ean='' } = req.query;
  const limitN = Math.min(parseInt(limit)||30, 100);
  const offset = (parseInt(page)-1) * limitN;

  const client = await getNeonClient();

  try {
    let rows = [];

    if (action === 'search' && q) {
      const term = '%' + q + '%';
      const r = await client.query(`
        SELECT p.*, pr.title as program_title, pr.countries as program_countries
        FROM products p LEFT JOIN programs pr ON p.program_id = pr.id
        WHERE p.status = 'enabled' AND (p.title ILIKE $1 OR p.description ILIKE $1)
        ORDER BY p.updated_at DESC LIMIT 200
      `, [term]);
      rows = groupByEAN(r.rows.map(formatRow)).slice(0, limitN);

    } else if (action === 'product' && id) {
      const r = await client.query(`
        SELECT p.*, pr.title as program_title FROM products p
        LEFT JOIN programs pr ON p.program_id = pr.id
        WHERE p.id = $1 LIMIT 1
      `, [id]);
      if (r.rows.length > 0) {
        const product = formatRow(r.rows[0]);
        if (product.ean) {
          const eanR = await client.query(`
            SELECT p.*, pr.title as program_title FROM products p
            LEFT JOIN programs pr ON p.program_id = pr.id
            WHERE p.ean = $1 AND p.status = 'enabled'
            ORDER BY p.price ASC LIMIT 20
          `, [product.ean]);
          if (eanR.rows.length > 1) {
            product.ean_offers = eanR.rows.map(formatRow).map(p => ({...p, tracking_url: makeTrackingUrl(p)}));
          }
        }
        rows = [product];
      }

    } else if (action === 'category' && cat) {
      const r = await client.query(`
        SELECT p.*, pr.title as program_title FROM products p
        LEFT JOIN programs pr ON p.program_id = pr.id
        WHERE p.status = 'enabled' AND p.category = $1
        ORDER BY p.updated_at DESC LIMIT 200
      `, [cat]);
      rows = groupByEAN(r.rows.map(formatRow)).slice(0, limitN);

    } else if (action === 'programs') {
      const r = await client.query('SELECT * FROM programs ORDER BY title');
      rows = r.rows;

    } else {
      const r = await client.query(`
        SELECT p.*, pr.title as program_title FROM products p
        LEFT JOIN programs pr ON p.program_id = pr.id
        WHERE p.status = 'enabled'
        ORDER BY p.updated_at DESC LIMIT 200 OFFSET $1
      `, [offset]);
      rows = groupByEAN(r.rows.map(formatRow)).slice(0, limitN);
    }

    return res.status(200).json({ data: rows, count: rows.length });

  } catch(err) {
    console.error('API error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    await client.end();
  }
}

function formatRow(p) {
  return {
    ...p,
    programs: p.program_title ? { title: p.program_title, countries: p.program_countries||[] } : null,
    tracking_url: makeTrackingUrl(p)
  };
}
