// api/sitemap.js
//
// LOT 6 du cahier des charges : sitemap DYNAMIQUE, pas un fichier statique
// regenere seulement quand quelqu'un pense a relancer un script. Chaque
// requete interroge la base en direct -- un produit qui tombe sous 2
// marchands ou qui passe en quarantaine disparait automatiquement du
// prochain crawl, sans intervention manuelle.
//
// Regles de qualite, alignees sur LOT 2 (aucune duplication de logique
// metier -- la meme regle "2 marchands canoniques minimum" que
// groupWithOffers dans products.js, exprimee ici directement en SQL pour
// eviter de charger des dizaines de milliers de lignes en memoire) :
//   - uniquement les produits actives (status = 'enabled')
//   - au moins 2 marchands CANONIQUES distincts (pas 2 program_id bruts
//     -- reutilise la meme table merchant_aliases que scripts/lib/merchants.js)
//   - aucun produit dont l'EAN est en quarantaine non resolue

import pkg from 'pg';
const { Pool } = pkg;

const SITE_URL = 'https://hifind.fr';
const CATEGORIES = [
  'high-tech', 'auto-moto', 'maison-jardin', 'mode-vetements', 'beaute-bienetre',
  'sante-nutrition', 'enfants-bebes', 'sport-outdoor', 'animaux', 'alimentation-bio',
  'livres-bd',
];

// Limite du protocole sitemap.xml lui-meme (50 000 URL max par fichier).
// Avec ~140k produits comparables actuellement, ce plafond sera atteint --
// au-dela, un vrai sitemap-index (plusieurs fichiers) serait necessaire.
// Note assumee ici plutot que de le construire a l'aveugle sans savoir si
// le volume actuel le justifie deja.
const MAX_URLS = 50000;

let pool;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.NEON_URL, ssl: { rejectUnauthorized: false } });
  return pool;
}

function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function xmlEscape(s) {
  return String(s || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

export default async function handler(req, res) {
  try {
    const client = await getPool().connect();
    let rows;
    try {
      const result = await client.query(`
        SELECT p.ean, MAX(p.title) AS title, MAX(p.updated_at) AS updated_at
        FROM products p
        LEFT JOIN merchant_aliases ma ON ma.raw_program_id = p.program_id
        WHERE p.status = 'enabled' AND p.ean IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM quarantined_eans q
            WHERE q.ean = p.ean AND q.resolved_at IS NULL
          )
        GROUP BY p.ean
        HAVING COUNT(DISTINCT COALESCE(ma.merchant_id::text, p.program_id)) >= 2
        ORDER BY MAX(p.updated_at) DESC
        LIMIT $1
      `, [MAX_URLS]);
      rows = result.rows;
    } finally {
      client.release();
    }

    const urls = [];

    urls.push({ loc: `${SITE_URL}/`, changefreq: 'daily', priority: '1.0' });
    for (const cat of CATEGORIES) {
      urls.push({ loc: `${SITE_URL}/categorie/${cat}`, changefreq: 'daily', priority: '0.8' });
    }
    for (const row of rows) {
      const slug = slugify(row.title);
      const lastmod = row.updated_at ? new Date(row.updated_at).toISOString().slice(0, 10) : undefined;
      urls.push({
        loc: `${SITE_URL}/produit/${slug}-${row.ean}`,
        lastmod,
        changefreq: 'daily',
        priority: '0.6',
      });
    }

    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + urls.map(u => (
          '  <url>\n'
          + `    <loc>${xmlEscape(u.loc)}</loc>\n`
          + (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : '')
          + `    <changefreq>${u.changefreq}</changefreq>\n`
          + `    <priority>${u.priority}</priority>\n`
          + '  </url>'
        )).join('\n')
      + '\n</urlset>\n';

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    // Cache modere : le sitemap n'a pas besoin d'etre a la seconde pres
    // (contrairement a la recherche), et regenerer a chaque crawl de
    // Google serait un cout inutile pour la base.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(xml);

  } catch (err) {
    console.error('Sitemap error:', err.message);
    return res.status(500).send('Erreur interne du serveur');
  }
}
