// scripts/generate-category-pages.js
//
// Genere des pages HTML statiques reelles pour chaque categorie -- avec
// contenu visible sans JavaScript, balises meta uniques, donnees
// structurees -- pour donner a Google de vraies pages a indexer. Le site
// actuel est une SPA en ancres (#detail, #search) : pour Google, il
// n'existe qu'UNE SEULE page avec le meme titre partout. Ce script est la
// premiere tranche du chantier SEO identifie par l'audit externe.
//
// A executer apres l'ingestion, dans le meme run que sync.js (nightly).
// Les fichiers generes doivent etre commit+push pour que Netlify les
// serve -- voir le commentaire de workflow en fin de fichier.

import pkg from 'pg';
const { Client } = pkg;
import fs from 'node:fs';
import path from 'node:path';

const NEON_URL = process.env.NEON_URL;
const SITE_URL = 'https://hifind.fr';
const OUT_DIR = path.resolve('categorie');

const CATEGORIES = [
  { slug: 'high-tech',        title: 'High-Tech',           lede: 'smartphones, ordinateurs, audio, image et accessoires tech' },
  { slug: 'auto-moto',        title: 'Auto & Moto',         lede: 'pneus, pieces detachees, equipement et accessoires auto-moto' },
  { slug: 'maison-jardin',    title: 'Maison & Jardin',     lede: 'electromenager, bricolage, deco et amenagement exterieur' },
  { slug: 'mode-vetements',   title: 'Mode',                lede: 'vetements, chaussures et accessoires pour toute la famille' },
  { slug: 'beaute-bienetre',  title: 'Beaute & Sante',       lede: 'parfums, soins, cosmetiques et bien-etre' },
  { slug: 'sante-nutrition',  title: 'Sante & Nutrition',    lede: 'complements alimentaires et produits de nutrition' },
  { slug: 'enfants-bebes',    title: 'Enfants & Bebes',      lede: 'jouets, puericulture et articles pour enfants' },
  { slug: 'sport-outdoor',    title: 'Sport & Outdoor',      lede: 'materiel de sport, camping et activites de plein air' },
  { slug: 'animaux',          title: 'Animalerie',           lede: 'alimentation et accessoires pour animaux de compagnie' },
  { slug: 'alimentation-bio', title: 'Alimentation Bio',     lede: 'produits alimentaires bio et naturels' },
  { slug: 'livres-bd',        title: 'Livres & BD',          lede: 'bandes dessinees, mangas et litterature' },
];

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

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

function fmtEur(n) {
  return (parseFloat(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac';
}

async function fetchCategoryProducts(client, slug, limit) {
  const r = await client.query(`
    SELECT DISTINCT ON (p.ean) p.id, p.ean, p.title, p.brand, p.price, p.image_url, p.category,
      (SELECT COUNT(DISTINCT p2.program_id) FROM products p2
       WHERE p2.ean = p.ean AND p2.status = 'enabled') AS vendor_count
    FROM products p
    WHERE ${MULTI_VENDOR_WHERE}
    AND p.category = $1
    ORDER BY p.ean, p.price ASC
    LIMIT $2
  `, [slug, limit]);
  return r.rows;
}

async function countCategory(client, slug) {
  const r = await client.query(`
    SELECT COUNT(DISTINCT p.ean) AS total
    FROM products p
    WHERE ${MULTI_VENDOR_WHERE}
    AND p.category = $1
  `, [slug]);
  return parseInt(r.rows[0]?.total || '0', 10);
}

function productCardHtml(p) {
  const url = SITE_URL + '/?openProduct=' + encodeURIComponent(p.id);
  const img = p.image_url
    ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}" loading="lazy" width="200" height="200">`
    : `<div class="ph-img"></div>`;
  return `
  <a class="pcard" href="${url}">
    ${img}
    <div class="pcard-body">
      ${p.brand ? `<div class="pcard-brand">${esc(p.brand)}</div>` : ''}
      <h2 class="pcard-title">${esc(p.title)}</h2>
      <div class="pcard-price">d\u00e8s ${fmtEur(p.price)}</div>
      <div class="pcard-vendors">${p.vendor_count} marchands compar\u00e9s</div>
    </div>
  </a>`;
}

function structuredData(cat, products) {
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: cat.title + ' - HiFind',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.title,
        brand: p.brand || undefined,
        image: p.image_url || undefined,
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'EUR',
          lowPrice: parseFloat(p.price) || 0,
          offerCount: p.vendor_count,
        },
      },
    })),
  };
  // JSON.stringify n'echappe pas "<" -- un titre contenant "</script>"
  // sortirait de la balise <script type="application/ld+json"> et
  // injecterait du HTML/JS arbitraire. \u003c est le seul echappement
  // sur en JSON, et reste un JSON valide (differe juste dans son
  // encodage textuel, pas dans sa valeur).
  return JSON.stringify(itemList).replace(/</g, '\\u003c');
}

function pageHtml(cat, products, total) {
  const canonical = SITE_URL + '/categorie/' + cat.slug + '/';
  const title = cat.title + ' : comparateur de prix | HiFind';
  const description = `Comparez les prix ${cat.lede} sur ${total.toLocaleString('fr-FR')} produits ` +
    `chez plusieurs marchands. Trouvez le meilleur prix pour vos achats ${cat.title.toLowerCase()} avec HiFind.`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<script type="application/ld+json">${structuredData(cat, products)}</script>
<style>
  :root{ --bg:#0f172a; --bg2:#1e293b; --text:#fff; --sub:#9999aa; --coral:#FF6B6B; --border:rgba(255,255,255,.08); }
  *{box-sizing:border-box;}
  body{ background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,sans-serif; margin:0; }
  header{ padding:1.2rem 1.5rem; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:1rem; }
  header a{ color:var(--coral); font-weight:800; font-size:1.3rem; text-decoration:none; }
  main{ max-width:1200px; margin:0 auto; padding:2rem 1.5rem; }
  h1{ font-size:1.7rem; margin-bottom:.3rem; }
  .lede{ color:var(--sub); margin-bottom:2rem; }
  .grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:1.2rem; }
  .pcard{ background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:1rem; text-decoration:none; color:inherit; display:block; }
  .pcard img, .ph-img{ width:100%; height:160px; object-fit:contain; background:#fff; border-radius:8px; margin-bottom:.7rem; }
  .ph-img{ background:var(--border); }
  .pcard-brand{ font-size:.7rem; font-weight:700; text-transform:uppercase; color:var(--coral); margin-bottom:.2rem; }
  .pcard-title{ font-size:.88rem; font-weight:600; margin:0 0 .5rem; line-height:1.35; }
  .pcard-price{ font-weight:800; font-size:1.05rem; }
  .pcard-vendors{ font-size:.72rem; color:var(--sub); margin-top:.2rem; }
  .cta{ display:inline-block; margin-top:2.5rem; padding:.8rem 1.4rem; background:var(--coral); color:#fff; border-radius:10px; text-decoration:none; font-weight:700; }
  footer{ text-align:center; padding:2rem; color:var(--sub); font-size:.8rem; }
</style>
</head>
<body>
<header><a href="/">HiFind</a></header>
<main>
  <h1>${esc(cat.title)}</h1>
  <p class="lede">${total.toLocaleString('fr-FR')} produits compar\u00e9s chez plusieurs marchands \u2014 ${esc(cat.lede)}.</p>
  <div class="grid">
    ${products.map(productCardHtml).join('\n')}
  </div>
  <a class="cta" href="${SITE_URL}/?cat=${cat.slug}">Ouvrir le comparateur complet avec filtres \u2192</a>
</main>
<footer>&copy; ${new Date().getFullYear()} HiFind</footer>
</body>
</html>`;
}

async function main() {
  if (!NEON_URL) { console.log('NEON_URL manquant'); process.exit(1); }
  const client = new Client({ connectionString: NEON_URL });
  await client.connect();

  console.log('\ud83d\udcc4 G\u00e9n\u00e9ration des pages cat\u00e9gorie...');
  const sitemapUrls = [];
  let generated = 0;

  for (const cat of CATEGORIES) {
    const total = await countCategory(client, cat.slug);
    if (total < 3) {
      console.log('  \u2013', cat.title, ': trop peu de produits (' + total + '), page ignor\u00e9e');
      continue;
    }
    const products = await fetchCategoryProducts(client, cat.slug, 60);
    const html = pageHtml(cat, products, total);

    const dir = path.join(OUT_DIR, cat.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');

    sitemapUrls.push({ loc: `${SITE_URL}/categorie/${cat.slug}/`, priority: '0.8' });
    generated++;
    console.log('  \u2705', cat.title, ':', total.toLocaleString('fr-FR'), 'produits,', products.length, 'affich\u00e9s');
  }

  // Met a jour sitemap.xml avec les pages categorie en plus des pages fixes
  const fixedUrls = [
    { loc: SITE_URL + '/', priority: '1.0' },
    { loc: SITE_URL + '/mentions-legales.html', priority: '0.2' },
    { loc: SITE_URL + '/cgu.html', priority: '0.2' },
    { loc: SITE_URL + '/confidentialite.html', priority: '0.2' },
  ];
  const allUrls = [...fixedUrls, ...sitemapUrls];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    allUrls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n') +
    `\n</urlset>\n`;
  fs.writeFileSync('sitemap.xml', sitemap, 'utf8');

  console.log('\ud83c\udf89', generated, 'pages cat\u00e9gorie g\u00e9n\u00e9r\u00e9es, sitemap.xml mis \u00e0 jour (' + allUrls.length + ' URL)');
  await client.end();
}

main().catch(e => { console.error('Erreur:', e.message); process.exit(1); });
