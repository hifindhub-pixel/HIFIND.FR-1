import { getPool, groupWithOffers, rankedCandidates } from './products.js';

export const SITE_URL = 'https://hifind.fr';
export const CATEGORY_META = {
  'innovations': { title:'Innovations', description:'Nouveautés technologiques, produits connectés, robotique et technologies émergentes' },
  'high-tech': { title:'High-Tech', description:'Smartphones, ordinateurs, audio, TV, gaming et accessoires tech' },
  'auto-moto': { title:'Auto & Moto', description:'Pneus, pièces, équipement et accessoires auto-moto' },
  'maison-jardin': { title:'Maison & Jardin', description:'Électroménager, bricolage, mobilier, décoration et jardin' },
  'mode-vetements': { title:'Mode & Vêtements', description:'Vêtements, chaussures, bagages et accessoires' },
  'beaute-bienetre': { title:'Beauté & Bien-être', description:'Parfums, soins, cosmétiques et hygiène' },
  'sante-nutrition': { title:'Santé & Nutrition', description:'Compléments alimentaires, matériel de santé et nutrition' },
  'enfants-bebes': { title:'Enfants & Bébés', description:'Jeux, jouets, puériculture et équipement pour enfants' },
  'sport-outdoor': { title:'Sport & Outdoor', description:'Équipement sportif, fitness et activités de plein air' },
  'animaux': { title:'Animalerie', description:'Alimentation, hygiène et accessoires pour animaux' },
  'alimentation-bio': { title:'Alimentation', description:'Épicerie, boissons et produits alimentaires' },
  'livres-bd': { title:'Livres & BD', description:'Livres, bandes dessinées, mangas et comics' },
  'autres': { title:'Autres produits', description:'Produits à découvrir dans le catalogue HiFind' },
};

const MULTI_VENDOR_WHERE = `
  p.ean IS NOT NULL AND p.status = 'enabled'
  AND p.program_id NOT LIKE '%darty%'
  AND EXISTS (
    SELECT 1 FROM products p2 WHERE p2.ean = p.ean
    AND p2.program_id != p.program_id AND p2.status = 'enabled'
  )
`;

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));
export const jsonLd = value => JSON.stringify(value).replace(/</g, '\\u003c');
const fmt = value => (Number(value) || 0).toLocaleString('fr-FR', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';
export const slugify = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

function productUrl(product) {
  return `/?openEan=${encodeURIComponent(product.ean)}`;
}

export function productCard(product) {
  const offers = product.ean_offers || [];
  const prices = offers.map(o => Number(o.price)).filter(p => p > 0).sort((a,b) => a-b);
  const low = prices[0] || Number(product.price) || 0;
  const high = prices.at(-1) || low;
  const count = Number(product.offers_count) || offers.length;
  const image = product.image_url
    ? `<img src="/api/img?url=${encodeURIComponent(product.image_url)}" alt="${esc(product.title)}" loading="lazy" width="280" height="210">`
    : '<div class="no-image" aria-hidden="true"></div>';
  return `<a class="product" href="${esc(productUrl(product))}">
    <div class="product-image">${image}${count >= 3 ? `<span>${count} marchands</span>` : ''}</div>
    <div class="product-body">
      ${product.brand ? `<div class="brand">${esc(product.brand)}</div>` : ''}
      <h2>${esc(product.title)}</h2>
      <div class="price-row"><div><small>Dès</small><strong>${fmt(low)}</strong></div>${high > low ? `<div class="high">jusqu’à ${fmt(high)}</div>` : ''}</div>
      <div class="offer-meta">${count} marchand${count > 1 ? 's' : ''} comparé${count > 1 ? 's' : ''}${product.product_type_label ? ` · ${esc(product.product_type_label)}` : ''}</div>
    </div>
  </a>`;
}

export function pageHtml({ category, products, total, page = 1, pages = 1 }) {
  const meta = CATEGORY_META[category];
  if (!meta) return null;
  const canonical = `${SITE_URL}/categorie/${category}${page > 1 ? `?page=${page}` : ''}`;
  const previous = page > 1 ? `${SITE_URL}/categorie/${category}${page > 2 ? `?page=${page - 1}` : ''}` : '';
  const next = page < pages ? `${SITE_URL}/categorie/${category}?page=${page + 1}` : '';
  const title = `${meta.title} : comparez les prix de ${total.toLocaleString('fr-FR')} produits | HiFind`;
  const description = `Comparez les prix de ${total.toLocaleString('fr-FR')} produits ${meta.description.toLowerCase()} chez plusieurs marchands sur HiFind.`;
  const types = new Map();
  products.forEach(p => {
    const key = p.product_type_label || 'Autres produits';
    types.set(key, (types.get(key) || 0) + 1);
  });
  const structured = {
    '@context':'https://schema.org', '@type':'CollectionPage', name:title, url:canonical, description,
    mainEntity:{ '@type':'ItemList', numberOfItems:products.length, itemListElement:products.map((p,i) => ({
      '@type':'ListItem', position:(page - 1) * 30 + i + 1, url:SITE_URL + productUrl(p), name:p.title
    }))}
  };
  const pagination = pages > 1 ? `<nav class="pagination" aria-label="Pagination">
    ${page > 1 ? `<a href="/categorie/${category}?page=${page-1}" rel="prev">← Précédent</a>` : '<span></span>'}
    <span>Page ${page.toLocaleString('fr-FR')} sur ${pages.toLocaleString('fr-FR')}</span>
    ${page < pages ? `<a href="/categorie/${category}?page=${page+1}" rel="next">Suivant →</a>` : '<span></span>'}
  </nav>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}">${previous ? `<link rel="prev" href="${previous}">` : ''}${next ? `<link rel="next" href="${next}">` : ''}
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}">
<link rel="icon" href="/favicon.png"><script type="application/ld+json">${jsonLd(structured)}</script>
<style>
:root{--ink:#0f172a;--coral:#ff6b6b;--paper:#f7f8fb;--line:#e5e7eb;--muted:#64748b;--green:#059669}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}a{color:inherit}header{height:72px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;position:sticky;top:0;z-index:5}header>div{width:min(1400px,calc(100% - 32px));margin:auto;display:flex;align-items:center;gap:24px}.logo{font-size:26px;font-weight:900;text-decoration:none;letter-spacing:-1px}.logo i{font-style:normal;color:var(--coral)}.search{margin-left:auto;width:min(520px,60%);display:flex;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;background:#fff}.search input{width:100%;border:0;padding:12px 14px;font:inherit;outline:0}.search button{border:0;background:var(--ink);color:#fff;padding:0 18px;font-weight:800;cursor:pointer}.wrap{width:min(1400px,calc(100% - 32px));margin:auto}.crumbs{padding:22px 0 12px;color:var(--muted);font-size:13px}.crumbs a{text-decoration:none}.hero{background:linear-gradient(125deg,#fff 0%,#fff7f7 100%);border:1px solid var(--line);border-radius:22px;padding:30px;margin-bottom:18px;display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.eyebrow{color:var(--coral);font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.hero h1{font-size:clamp(34px,5vw,58px);line-height:.95;margin:9px 0 12px;letter-spacing:-.04em}.hero p{color:var(--muted);max-width:680px;margin:0;line-height:1.5}.total{background:var(--ink);color:#fff;border-radius:16px;padding:18px 22px;min-width:190px}.total strong{display:block;font-size:30px}.total span{font-size:12px;color:#cbd5e1}.typebar{display:flex;gap:8px;overflow:auto;padding:4px 0 22px}.typebar span{white-space:nowrap;background:#fff;border:1px solid var(--line);border-radius:999px;padding:8px 12px;font-size:13px;color:var(--muted)}.typebar b{color:var(--ink)}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.product{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;text-decoration:none;display:flex;flex-direction:column;transition:.18s}.product:hover{transform:translateY(-3px);box-shadow:0 14px 32px rgba(15,23,42,.09);border-color:#cbd5e1}.product-image{height:230px;background:#fff;display:grid;place-items:center;padding:18px;position:relative}.product-image img{max-width:100%;max-height:100%;object-fit:contain}.product-image>span{position:absolute;top:12px;left:12px;background:var(--ink);color:#fff;border-radius:7px;padding:5px 8px;font-size:11px;font-weight:800}.no-image{width:90px;height:90px;border:2px solid var(--line);border-radius:18px}.product-body{border-top:1px solid #f1f5f9;padding:16px;display:flex;flex-direction:column;flex:1}.brand{font-size:11px;font-weight:900;letter-spacing:.09em;color:var(--muted);text-transform:uppercase}.product h2{font-size:15px;line-height:1.35;margin:6px 0 18px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.price-row{margin-top:auto;display:flex;justify-content:space-between;align-items:end;gap:8px}.price-row small{display:block;color:var(--muted);text-transform:uppercase;font-size:10px;font-weight:800}.price-row strong{font-size:25px;letter-spacing:-.03em}.high{font-size:12px;color:var(--muted)}.offer-meta{font-size:12px;color:var(--green);font-weight:700;margin-top:8px}.pagination{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin:30px 0 50px;color:var(--muted);font-size:13px}.pagination a{padding:10px 14px;background:#fff;border:1px solid var(--line);border-radius:9px;text-decoration:none;font-weight:800}.pagination a:last-child{justify-self:end}footer{border-top:1px solid var(--line);background:#fff;padding:30px;text-align:center;color:var(--muted);font-size:13px;margin-top:50px}@media(max-width:1050px){.grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){header{height:auto;padding:12px 0}header>div{flex-wrap:wrap}.search{order:2;width:100%}.hero{padding:22px;display:block}.total{margin-top:20px;display:inline-block}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.product-image{height:175px}.product-body{padding:12px}.product h2{font-size:14px}.price-row strong{font-size:21px}}@media(max-width:420px){.wrap,header>div{width:min(100% - 20px,1400px)}.hero h1{font-size:34px}}
</style></head><body>
<header><div><a class="logo" href="/">Hi<i>Find</i></a><form class="search" action="/" method="get"><input name="q" placeholder="Rechercher un produit, une marque…" aria-label="Rechercher"><button>Rechercher</button></form></div></header>
<main class="wrap"><div class="crumbs"><a href="/">Accueil</a> / ${esc(meta.title)}</div>
<section class="hero"><div><div class="eyebrow">Comparateur de prix</div><h1>${esc(meta.title)}</h1><p>${esc(meta.description)}. Chaque référence affichée possède des offres chez plusieurs marchands distincts.</p></div><div class="total"><strong>${total.toLocaleString('fr-FR')}</strong><span>produits comparables</span></div></section>
${types.size ? `<div class="typebar">${[...types.entries()].sort((a,b)=>b[1]-a[1]).map(([label,count])=>`<span><b>${esc(label)}</b> · ${count}</span>`).join('')}</div>` : ''}
<section class="grid">${products.map(productCard).join('')}</section>${pagination}</main>
<footer>© ${new Date().getFullYear()} HiFind · Les achats sont réalisés sur le site du marchand.</footer></body></html>`;
}

export default async function handler(req, res) {
  const raw = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  const category = String(raw || '').replace(/^\/+|\/+$/g, '');
  const meta = CATEGORY_META[category];
  if (!meta) return res.status(404).send('Catégorie introuvable');
  const page = Math.max(1, Math.min(parseInt(req.query.page, 10) || 1, 500));
  const limit = 30;
  const offset = (page - 1) * limit;
  const client = await getPool().connect();
  try {
    const candidates = await rankedCandidates(client, { category, limit: limit * 3, offset });
    const total = parseInt(candidates.rows[0]?.total_count || '0', 10);
    const pages = Math.max(1, Math.ceil(total / limit));
    if (page > pages) return res.status(404).send('Page de catégorie introuvable');
    let products = await groupWithOffers(client, candidates.rows);
    if (category !== 'innovations') products = products.filter(p => p.category === category);
    products = products.slice(0, limit);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return res.status(200).send(pageHtml({ category, products, total, page, pages }));
  } catch (error) {
    console.error('Category page error:', error.message);
    return res.status(500).send('Page momentanément indisponible');
  } finally {
    client.release();
  }
}
