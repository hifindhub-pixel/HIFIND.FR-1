import pkg from 'pg';
const { Pool } = pkg;

export const SITE_URL = 'https://hifind.fr';
export const PRODUCTS_PER_SITEMAP = 40000;
export const CATEGORIES = [
  'innovations',
  'high-tech', 'auto-moto', 'maison-jardin', 'mode-vetements', 'beaute-bienetre',
  'sante-nutrition', 'enfants-bebes', 'sport-outdoor', 'animaux', 'alimentation-bio',
  'livres-bd',
];

const VALID_PRODUCT_WHERE = `
  p.status = 'enabled' AND p.ean IS NOT NULL AND p.price > 0
  AND p.program_id NOT LIKE '%darty%'
  AND NOT EXISTS (
    SELECT 1 FROM quarantined_eans q
    WHERE q.ean = p.ean AND q.resolved_at IS NULL
  )
`;

let pool;
function getPool() {
  if (!pool) pool = new Pool({
    connectionString: process.env.NEON_URL,
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  return pool;
}

export function slugify(title) {
  return String(title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function xmlEscape(value) {
  return String(value || '').replace(/[&<>"']/g, character => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[character]
  ));
}

export function renderSitemapIndex(partCount, lastmod = new Date().toISOString().slice(0, 10)) {
  const entries = Array.from({ length: partCount }, (_, index) => (
    `  <sitemap>\n    <loc>${SITE_URL}/sitemap-${index + 1}.xml</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`
  ));
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + entries.join('\n') + '\n</sitemapindex>\n';
}

export function renderUrlSet(urls) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(url => (
      '  <url>\n'
      + `    <loc>${xmlEscape(url.loc)}</loc>\n`
      + (url.lastmod ? `    <lastmod>${url.lastmod}</lastmod>\n` : '')
      + (url.changefreq ? `    <changefreq>${url.changefreq}</changefreq>\n` : '')
      + (url.priority ? `    <priority>${url.priority}</priority>\n` : '')
      + '  </url>'
    )).join('\n')
    + '\n</urlset>\n';
}

async function countComparableProducts(client) {
  const result = await client.query(`
    SELECT COUNT(*)::int AS total FROM (
      SELECT p.ean
      FROM products p LEFT JOIN merchant_aliases ma ON ma.raw_program_id = p.program_id
      WHERE ${VALID_PRODUCT_WHERE}
      GROUP BY p.ean
      HAVING COUNT(DISTINCT COALESCE(ma.merchant_id::text, p.program_id)) >= 2
    ) comparable
  `);
  return Number(result.rows[0]?.total) || 0;
}

async function fetchProducts(client, part) {
  const offset = (part - 1) * PRODUCTS_PER_SITEMAP;
  const result = await client.query(`
    SELECT p.ean, MAX(p.title) AS title, MAX(p.updated_at) AS updated_at
    FROM products p LEFT JOIN merchant_aliases ma ON ma.raw_program_id = p.program_id
    WHERE ${VALID_PRODUCT_WHERE}
    GROUP BY p.ean
    HAVING COUNT(DISTINCT COALESCE(ma.merchant_id::text, p.program_id)) >= 2
    ORDER BY p.ean ASC
    LIMIT $1 OFFSET $2
  `, [PRODUCTS_PER_SITEMAP, offset]);
  return result.rows;
}

async function fetchMerchants(client) {
  const result = await client.query(`
    SELECT DISTINCT pr.title
    FROM products p JOIN programs pr ON p.program_id = pr.id
    WHERE p.status = 'enabled' AND p.ean IS NOT NULL AND p.price > 0
      AND p.program_id NOT LIKE '%darty%' AND pr.title IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM products p2 WHERE p2.ean = p.ean
          AND p2.status = 'enabled' AND p2.program_id != p.program_id
      )
    ORDER BY pr.title
  `);
  return result.rows;
}

export default async function handler(req, res) {
  const requestedPart = req.query.part == null ? null : Number.parseInt(req.query.part, 10);
  if (requestedPart != null && (!Number.isInteger(requestedPart) || requestedPart < 1)) {
    return res.status(404).send('Sitemap introuvable');
  }

  const client = await getPool().connect();
  try {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    if (requestedPart == null) {
      const total = await countComparableProducts(client);
      const partCount = Math.max(1, Math.ceil(total / PRODUCTS_PER_SITEMAP));
      return res.status(200).send(renderSitemapIndex(partCount));
    }

    const [products, merchants] = await Promise.all([
      fetchProducts(client, requestedPart),
      requestedPart === 1 ? fetchMerchants(client) : Promise.resolve([]),
    ]);
    if (requestedPart > 1 && products.length === 0) return res.status(404).send('Sitemap introuvable');

    const urls = [];
    if (requestedPart === 1) {
      urls.push({ loc:`${SITE_URL}/`, changefreq:'daily', priority:'1.0' });
      urls.push({ loc:`${SITE_URL}/marchands`, changefreq:'daily', priority:'0.8' });
      CATEGORIES.forEach(category => urls.push({ loc:`${SITE_URL}/categorie/${category}`, changefreq:'daily', priority:'0.8' }));
      const seen = new Set();
      merchants.forEach(merchant => {
        const slug = slugify(merchant.title);
        if (!slug || seen.has(slug)) return;
        seen.add(slug);
        urls.push({ loc:`${SITE_URL}/marchand/${slug}`, changefreq:'daily', priority:'0.7' });
      });
    }
    products.forEach(product => urls.push({
      loc:`${SITE_URL}/produit/${slugify(product.title)}-${product.ean}`,
      lastmod:product.updated_at ? new Date(product.updated_at).toISOString().slice(0, 10) : undefined,
      changefreq:'daily', priority:'0.6',
    }));

    if (urls.length > 50000) throw new Error(`Sitemap ${requestedPart} dépasse la limite protocolaire`);
    return res.status(200).send(renderUrlSet(urls));
  } catch (error) {
    console.error('Sitemap error:', error.message);
    return res.status(500).send('Erreur interne du serveur');
  } finally {
    client.release();
  }
}
