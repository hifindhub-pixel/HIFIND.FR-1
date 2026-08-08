import { getPool, getEanOffers } from './products.js';

const SITE_URL = 'https://hifind.fr';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

function escJsonLd(obj) {
  // JSON.stringify n'echappe pas "<" -- un titre contenant "</script>"
  // sortirait de la balise <script type="application/ld+json">.
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function fmtEur(n) {
  return (parseFloat(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac';
}

function fmtDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  } catch (e) { return null; }
}

function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Extrait un EAN valide (longueur GTIN standard) a la fin d'un slug du
 * type "apple-iphone-15-128-go-noir-0194253404532". Le reste du slug
 * (le libelle) n'est utilise que pour le confort de lecture de l'URL,
 * jamais pour la recherche elle-meme -- seul l'EAN fait foi.
 */
function extractEanFromSlug(slug) {
  const m = String(slug || '').match(/(\d{14}|\d{13}|\d{12}|\d{8})$/);
  return m ? m[1] : null;
}

async function getProductByEan(client, ean) {
  const ref = await client.query(`
    SELECT category FROM products WHERE ean = $1 AND status = 'enabled' LIMIT 1
  `, [ean]);
  if (!ref.rows.length) return null;
  const mainCategory = ref.rows[0].category;
  const offers = await getEanOffers(client, ean, mainCategory);
  if (offers.length < 2) return null;   // pas de comparaison possible -> pas de page
  return { ean, category: mainCategory, offers };
}

function offerRowHtml(o, isBest) {
  const dateTxt = fmtDate(o.updated_at);
  return `
    <tr${isBest ? ' class="best"' : ''}>
      <td>${esc(o.programs?.title || o.program_id || 'Marchand')}</td>
      <td class="price">${fmtEur(o.price)}</td>
      <td class="date">${dateTxt ? 'relev\u00e9 le ' + dateTxt : ''}</td>
      <td><a href="${esc(o.tracking_url)}" target="_blank" rel="noopener sponsored">Voir l'offre</a></td>
    </tr>`;
}

function structuredData(ref, offers, canonical) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: ref.title,
    brand: ref.brand ? { '@type': 'Brand', name: ref.brand } : undefined,
    image: ref.image_url || undefined,
    gtin: ref.ean,
    url: canonical,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'EUR',
      lowPrice: parseFloat(offers[0].price) || 0,
      highPrice: parseFloat(offers[offers.length - 1].price) || 0,
      offerCount: offers.length,
      offers: offers.map(o => ({
        '@type': 'Offer',
        price: parseFloat(o.price) || 0,
        priceCurrency: 'EUR',
        url: o.tracking_url,
        seller: { '@type': 'Organization', name: o.programs?.title || o.program_id },
      })),
    },
  };
  return escJsonLd(data);
}

function pageHtml({ ref, offers, canonical }) {
  const title = `${ref.title} : comparer les prix | HiFind`;
  const description = `Comparez le prix de ${ref.title} chez ${offers.length} marchands. ` +
    `\u00c0 partir de ${fmtEur(offers[0].price)}. Mis \u00e0 jour quotidiennement.`;
  const lo = offers[0].price, hi = offers[offers.length - 1].price;

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
<meta property="og:type" content="product">
<meta property="og:url" content="${canonical}">
${ref.image_url ? `<meta property="og:image" content="${esc(ref.image_url)}">` : ''}
<script type="application/ld+json">${structuredData(ref, offers, canonical)}</script>
<style>
  :root{ --bg:#0f172a; --bg2:#1e293b; --text:#fff; --sub:#9999aa; --coral:#FF6B6B; --jade:#10B981; --border:rgba(255,255,255,.08); }
  *{box-sizing:border-box;}
  body{ background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,sans-serif; margin:0; }
  header{ padding:1.2rem 1.5rem; border-bottom:1px solid var(--border); }
  header a{ color:var(--coral); font-weight:800; font-size:1.3rem; text-decoration:none; }
  main{ max-width:900px; margin:0 auto; padding:2rem 1.5rem; }
  .layout{ display:flex; gap:2rem; flex-wrap:wrap; margin-bottom:2rem; }
  .img-box{ background:#fff; border-radius:12px; padding:1.5rem; width:260px; height:260px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .img-box img{ max-width:100%; max-height:100%; object-fit:contain; }
  .brand{ color:var(--coral); font-weight:700; font-size:.8rem; text-transform:uppercase; margin-bottom:.3rem; }
  h1{ font-size:1.4rem; margin:0 0 1rem; line-height:1.35; }
  .hero-price{ font-size:2rem; font-weight:900; color:var(--jade); }
  .hero-sub{ color:var(--sub); font-size:.85rem; margin-top:.3rem; }
  table{ width:100%; border-collapse:collapse; margin-top:1rem; }
  th{ text-align:left; font-size:.75rem; color:var(--sub); text-transform:uppercase; padding:.5rem .8rem; border-bottom:1px solid var(--border); }
  td{ padding:.8rem; border-bottom:1px solid var(--border); font-size:.9rem; }
  tr.best{ background:rgba(16,185,129,.08); }
  tr.best td.price{ color:var(--jade); font-weight:800; }
  td.price{ font-weight:700; }
  td.date{ color:var(--sub); font-size:.78rem; }
  td a{ color:var(--coral); text-decoration:none; font-weight:700; }
  .cta{ display:inline-block; margin-top:2rem; padding:.8rem 1.4rem; background:var(--coral); color:#fff; border-radius:10px; text-decoration:none; font-weight:700; }
  footer{ text-align:center; padding:2rem; color:var(--sub); font-size:.8rem; }
</style>
</head>
<body>
<header><a href="/">HiFind</a></header>
<main>
  <div class="layout">
    <div class="img-box">
      ${ref.image_url ? `<img src="${esc(ref.image_url)}" alt="${esc(ref.title)}">` : ''}
    </div>
    <div>
      ${ref.brand ? `<div class="brand">${esc(ref.brand)}</div>` : ''}
      <h1>${esc(ref.title)}</h1>
      <div class="hero-price">${fmtEur(lo)}</div>
      <div class="hero-sub">${hi > lo ? `jusqu'\u00e0 ${fmtEur(hi)} ailleurs \u2014 ` : ''}${offers.length} marchands compar\u00e9s</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Marchand</th><th>Prix</th><th>Fra\u00eecheur</th><th></th></tr></thead>
    <tbody>
      ${offers.map((o, i) => offerRowHtml(o, i === 0)).join('')}
    </tbody>
  </table>
  <a class="cta" href="${SITE_URL}/?openProduct=${encodeURIComponent(offers[0].id || '')}">Ouvrir la fiche interactive \u2192</a>
</main>
<footer>&copy; ${new Date().getFullYear()} HiFind \u00b7 Prix relev\u00e9s quotidiennement, sous r\u00e9serve de disponibilit\u00e9 chez le marchand.</footer>
</body>
</html>`;
}

export default async function handler(req, res) {
  const { slug } = req.query;
  const ean = extractEanFromSlug(slug);
  if (!ean) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send('<h1>Produit introuvable</h1>');
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const product = await getProductByEan(client, ean);
    if (!product) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send('<h1>Produit introuvable ou plus disponible chez assez de marchands</h1>');
    }

    const ref = product.offers[0];   // le moins cher sert de reference (titre/image/marque)
    const canonical = `${SITE_URL}/produit/${slugify(ref.title)}-${ean}/`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).send(pageHtml({ ref, offers: product.offers, canonical }));

  } catch (err) {
    console.error('produit.js error:', err.message);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send('<h1>Erreur</h1>');
  } finally {
    client.release();
  }
}
