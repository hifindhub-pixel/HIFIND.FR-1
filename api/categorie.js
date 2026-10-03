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

export function productCard(product, rank = -1, page = 1) {
  const offers = product.ean_offers || [];
  const prices = offers.map(o => Number(o.price)).filter(p => p > 0).sort((a,b) => a-b);
  const low = prices[0] || Number(product.price) || 0;
  const high = prices.at(-1) || low;
  const count = Number(product.offers_count) || offers.length;
  const spread = high > low ? Math.round((1 - low / high) * 100) : 0;
  const type = product.product_type_label || 'Autres produits';
  const searchText = `${product.brand || ''} ${product.title || ''}`.toLowerCase();
  const image = product.image_url
    ? `<img src="/api/img?url=${encodeURIComponent(product.image_url)}" alt="${esc(product.title)}" loading="lazy" width="280" height="210">`
    : '<div class="no-image" aria-hidden="true"></div>';
  const badge = page === 1 && rank >= 0 && rank < 3
    ? '<span class="trend-badge">Tendance</span>'
    : (spread >= 20 ? `<span class="deal-badge">${spread} % d’écart</span>` : '');
  return `<a class="product" href="${esc(productUrl(product))}" data-title="${esc(searchText)}" data-brand="${esc(product.brand || '')}" data-type="${esc(type)}" data-price="${low}" data-offers="${count}" data-spread="${spread}" data-rank="${rank}">
    <div class="product-image">${image}${badge}</div>
    <div class="product-body">
      ${product.brand ? `<div class="brand">${esc(product.brand)}</div>` : ''}
      <h2>${esc(product.title)}</h2>
      <div class="price-row"><div><small>Dès</small><strong>${fmt(low)}</strong></div>${high > low ? `<div class="high">jusqu’à ${fmt(high)}</div>` : ''}</div>
      <div class="offer-meta"><span>${count} marchand${count > 1 ? 's' : ''} comparé${count > 1 ? 's' : ''}</span>${spread ? `<span>${spread} % d’écart</span>` : ''}</div>
      <div class="card-foot"><span>${esc(type)}</span><b>Comparer <i>→</i></b></div>
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
  const lows = products.map(p => {
    const prices = (p.ean_offers || []).map(o => Number(o.price)).filter(n => n > 0);
    return prices.length ? Math.min(...prices) : Number(p.price) || 0;
  }).filter(Boolean).sort((a,b) => a-b);
  const median = lows.length ? lows[Math.floor(lows.length / 2)] : 0;
  const merchants = new Set();
  const brands = new Set();
  let bestSpread = 0;
  products.forEach(p => {
    if (p.brand) brands.add(p.brand);
    const prices = (p.ean_offers || []).map(o => Number(o.price)).filter(n => n > 0);
    if (prices.length > 1) bestSpread = Math.max(bestSpread, Math.round((1 - Math.min(...prices) / Math.max(...prices)) * 100));
    (p.ean_offers || []).forEach(o => merchants.add(o.program_title || o.programs?.title || o.program_id || 'Marchand'));
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
:root{--ink:#0f172a;--coral:#ff6b6b;--coral2:#ff8b78;--paper:#f6f7f9;--line:#e3e7ed;--muted:#667085;--green:#087f5b;--soft:#fff4f2}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}a{color:inherit}header{height:72px;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);display:flex;align-items:center;position:sticky;top:0;z-index:10;backdrop-filter:blur(12px)}header>div{width:min(1400px,calc(100% - 32px));margin:auto;display:flex;align-items:center;gap:24px}.logo{font-size:27px;font-weight:950;text-decoration:none;letter-spacing:-1.4px}.logo i{font-style:normal;color:var(--coral)}.search{margin-left:auto;width:min(560px,60%);display:flex;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}.search:focus-within{border-color:var(--ink);box-shadow:0 0 0 3px rgba(15,23,42,.07)}.search input{width:100%;border:0;padding:12px 14px;font:inherit;outline:0}.search button{border:0;background:var(--ink);color:#fff;padding:0 20px;font-weight:800;cursor:pointer}.wrap{width:min(1400px,calc(100% - 32px));margin:auto}.crumbs{padding:22px 0 12px;color:var(--muted);font-size:13px}.crumbs a{text-decoration:none}.hero{position:relative;overflow:hidden;background:linear-gradient(125deg,#fff 0%,#fff8f7 72%,#ffe9e5 100%);border:1px solid var(--line);border-radius:24px;padding:34px;margin-bottom:18px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:32px}.hero:after{content:"";position:absolute;width:260px;height:260px;border-radius:50%;right:-120px;top:-150px;border:42px solid rgba(255,107,107,.09)}.hero-main{position:relative;z-index:1}.eyebrow{display:flex;align-items:center;gap:8px;color:#d94d4d;font-size:11px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.eyebrow:before{content:"";width:22px;height:2px;background:var(--coral)}.hero h1{font-size:clamp(36px,5vw,60px);line-height:.94;margin:10px 0 14px;letter-spacing:-.045em}.hero p{color:var(--muted);max-width:720px;margin:0;line-height:1.55}.trustline{display:flex;flex-wrap:wrap;gap:14px;margin-top:18px;font-size:12px;font-weight:750}.trustline span{display:flex;align-items:center;gap:6px}.trustline i{width:7px;height:7px;border-radius:50%;background:var(--green)}.hero-stats{position:relative;z-index:1;display:grid;grid-template-columns:repeat(2,minmax(128px,1fr));gap:9px;width:330px}.stat{background:rgba(255,255,255,.86);border:1px solid rgba(203,213,225,.8);border-radius:14px;padding:14px}.stat.primary{background:var(--ink);color:#fff;border-color:var(--ink)}.stat strong{display:block;font-size:23px;letter-spacing:-.04em}.stat span{display:block;color:var(--muted);font-size:11px;margin-top:2px}.stat.primary span{color:#cbd5e1}.typebar{display:flex;gap:8px;overflow:auto;padding:3px 0 18px;scrollbar-width:none}.typebar::-webkit-scrollbar{display:none}.type-chip{white-space:nowrap;background:#fff;border:1px solid var(--line);border-radius:999px;padding:9px 13px;font:inherit;font-size:12px;color:var(--muted);cursor:pointer}.type-chip b{color:var(--ink)}.type-chip:hover,.type-chip.active{border-color:var(--ink);background:var(--ink);color:#cbd5e1}.type-chip.active b{color:#fff}.catalogue-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin:4px 0 14px}.catalogue-head h2{font-size:22px;letter-spacing:-.025em;margin:0 0 4px}.catalogue-head p{margin:0;color:var(--muted);font-size:12px}.tools{display:flex;gap:8px}.local-search,.sort{height:40px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font:inherit;font-size:13px}.local-search{width:230px;padding:0 12px}.sort{padding:0 32px 0 11px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.product{background:#fff;border:1px solid var(--line);border-radius:17px;overflow:hidden;text-decoration:none;display:flex;flex-direction:column;transition:transform .18s,box-shadow .18s,border-color .18s}.product:hover{transform:translateY(-3px);box-shadow:0 16px 36px rgba(15,23,42,.09);border-color:#cbd5e1}.product[hidden]{display:none}.product-image{height:230px;background:#fff;display:grid;place-items:center;padding:18px;position:relative}.product-image img{max-width:100%;max-height:100%;object-fit:contain}.product-image>span{position:absolute;top:12px;left:12px;border-radius:7px;padding:5px 8px;font-size:10px;font-weight:900;letter-spacing:.03em}.trend-badge{background:var(--ink);color:#fff}.deal-badge{background:#e8fff5;color:#067653}.no-image{width:90px;height:90px;border:2px solid var(--line);border-radius:18px}.product-body{border-top:1px solid #f0f2f5;padding:16px;display:flex;flex-direction:column;flex:1}.brand{font-size:10px;font-weight:900;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}.product h2{font-size:15px;line-height:1.4;margin:6px 0 18px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.price-row{margin-top:auto;display:flex;justify-content:space-between;align-items:end;gap:8px}.price-row small{display:block;color:var(--muted);text-transform:uppercase;font-size:9px;font-weight:900}.price-row strong{font-size:25px;letter-spacing:-.035em}.high{font-size:11px;color:var(--muted);text-align:right}.offer-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--green);font-weight:800;margin-top:8px}.offer-meta span+span:before{content:"·";margin-right:8px;color:#98a2b3}.card-foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #f0f2f5;margin:13px -16px -16px;padding:11px 16px;color:var(--muted);font-size:10px}.card-foot b{color:var(--ink);font-size:11px}.card-foot i{font-style:normal;color:var(--coral)}.empty{display:none;background:#fff;border:1px dashed #cbd5e1;border-radius:16px;padding:48px;text-align:center;color:var(--muted)}.pagination{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin:30px 0 50px;color:var(--muted);font-size:13px}.pagination a{padding:10px 14px;background:#fff;border:1px solid var(--line);border-radius:9px;text-decoration:none;font-weight:800}.pagination a:last-child{justify-self:end}footer{border-top:1px solid var(--line);background:#fff;padding:30px;text-align:center;color:var(--muted);font-size:13px;margin-top:50px}@media(max-width:1050px){.grid{grid-template-columns:repeat(3,1fr)}.hero{grid-template-columns:1fr}.hero-stats{width:100%;grid-template-columns:repeat(4,1fr)}}@media(max-width:760px){header{height:auto;padding:12px 0}header>div{flex-wrap:wrap}.search{order:2;width:100%}.hero{padding:23px}.hero-stats{grid-template-columns:repeat(2,1fr)}.catalogue-head{align-items:stretch;flex-direction:column}.tools{display:grid;grid-template-columns:1fr 1fr}.local-search{width:100%}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.product-image{height:175px}.product-body{padding:12px}.product h2{font-size:13px}.price-row strong{font-size:20px}.card-foot{margin:11px -12px -12px;padding:10px 12px}.card-foot>span{display:none}}@media(max-width:440px){.wrap,header>div{width:min(100% - 20px,1400px)}.hero h1{font-size:35px}.stat{padding:11px}.stat strong{font-size:20px}.tools{grid-template-columns:1fr}.grid{gap:8px}}
</style></head><body>
<header><div><a class="logo" href="/">Hi<i>Find</i></a><form class="search" action="/" method="get"><input name="q" placeholder="Rechercher un produit, une marque…" aria-label="Rechercher"><button>Rechercher</button></form></div></header>
<main class="wrap"><div class="crumbs"><a href="/">Accueil</a> / ${esc(meta.title)}</div>
<section class="hero"><div class="hero-main"><div class="eyebrow">Sélection marché · prix comparés</div><h1>${esc(meta.title)}</h1><p>${esc(meta.description)}. Les références sont classées selon leur intérêt actuel puis comparées uniquement lorsqu’elles disposent d’offres chez plusieurs marchands.</p><div class="trustline"><span><i></i>Prix marchands réels</span><span><i></i>Classement actualisé</span><span><i></i>Aucun produit sponsorisé</span></div></div><div class="hero-stats"><div class="stat primary"><strong>${total.toLocaleString('fr-FR')}</strong><span>produits comparables</span></div><div class="stat"><strong>${merchants.size}</strong><span>marchands sur cette page</span></div><div class="stat"><strong>${brands.size}</strong><span>marques représentées</span></div><div class="stat"><strong>${bestSpread ? `${bestSpread} %` : fmt(median)}</strong><span>${bestSpread ? 'écart de prix maximal' : 'prix médian relevé'}</span></div></div></section>
${types.size ? `<div class="typebar" aria-label="Filtrer par type"><button class="type-chip active" data-type=""><b>Tous</b> · ${products.length}</button>${[...types.entries()].sort((a,b)=>b[1]-a[1]).map(([label,count])=>`<button class="type-chip" data-type="${esc(label)}"><b>${esc(label)}</b> · ${count}</button>`).join('')}</div>` : ''}
<div class="catalogue-head"><div><h2>Les produits qui attirent le plus d’intérêt</h2><p><span id="visibleCount">${products.length}</span> références sur cette page · prix et disponibilité susceptibles d’évoluer</p></div><div class="tools"><input class="local-search" id="catalogueSearch" type="search" placeholder="Filtrer cette sélection…" aria-label="Filtrer les produits"><select class="sort" id="catalogueSort" aria-label="Trier les produits"><option value="rank">Popularité</option><option value="price">Prix croissant</option><option value="offers">Nombre de marchands</option><option value="spread">Écart de prix</option></select></div></div>
<section class="grid" id="productGrid">${products.map((product,index) => productCard(product,index,page)).join('')}</section><div class="empty" id="emptyState">Aucun produit ne correspond à ce filtre sur cette page.</div>${pagination}</main>
<footer>© ${new Date().getFullYear()} HiFind · Comparaison indépendante. Les achats sont réalisés sur le site du marchand.</footer>
<script>(()=>{const grid=document.getElementById('productGrid'),cards=[...grid.querySelectorAll('.product')],search=document.getElementById('catalogueSearch'),sort=document.getElementById('catalogueSort'),count=document.getElementById('visibleCount'),empty=document.getElementById('emptyState'),chips=[...document.querySelectorAll('.type-chip')];let type='';function render(){const q=search.value.trim().toLowerCase();let visible=cards.filter(card=>(!type||card.dataset.type===type)&&(!q||card.dataset.title.includes(q)));visible.sort((a,b)=>sort.value==='price'?+a.dataset.price-+b.dataset.price:sort.value==='offers'?+b.dataset.offers-+a.dataset.offers:sort.value==='spread'?+b.dataset.spread-+a.dataset.spread:+a.dataset.rank-+b.dataset.rank);cards.forEach(card=>card.hidden=true);visible.forEach(card=>{card.hidden=false;grid.appendChild(card)});count.textContent=visible.length;empty.style.display=visible.length?'none':'block'}search.addEventListener('input',render);sort.addEventListener('change',render);chips.forEach(chip=>chip.addEventListener('click',()=>{type=chip.dataset.type;chips.forEach(c=>c.classList.toggle('active',c===chip));render()}));})();</script></body></html>`;
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
