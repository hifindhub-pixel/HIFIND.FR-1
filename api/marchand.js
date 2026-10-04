import { getPool, groupWithOffers, slugifyMerchant } from './products.js';
import { SITE_URL, CATEGORY_META, esc, jsonLd, productCard, slugify } from './categorie.js';

const MULTI_VENDOR_WHERE = `
  p.ean IS NOT NULL AND p.status = 'enabled'
  AND p.program_id NOT LIKE '%darty%'
  AND EXISTS (
    SELECT 1 FROM products p2 WHERE p2.ean = p.ean
    AND p2.program_id != p.program_id AND p2.status = 'enabled'
  )
`;

export function merchantPageHtml({ merchant, products, total, page = 1, pages = 1 }) {
  const basePath = `/marchand/${slugifyMerchant(merchant)}`;
  const canonical = `${SITE_URL}${basePath}${page > 1 ? `?page=${page}` : ''}`;
  const previous = page > 1 ? `${SITE_URL}${basePath}${page > 2 ? `?page=${page - 1}` : ''}` : '';
  const next = page < pages ? `${SITE_URL}${basePath}?page=${page + 1}` : '';
  const title = `${merchant} : comparez ses prix et offres | HiFind`;
  const description = `Comparez les prix de ${total.toLocaleString('fr-FR')} produits vendus par ${merchant} avec les offres d’autres marchands sur HiFind.`;
  const categories = new Map();
  products.forEach(product => {
    const label = product.product_type_label || CATEGORY_META[product.category]?.title || 'Autres produits';
    categories.set(label, (categories.get(label) || 0) + 1);
  });
  const merchantKey = String(merchant).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const brands = new Set(products.map(p => p.brand).filter(Boolean));
  let bestPriceCount = 0;
  let evaluatedCount = 0;
  products.forEach(product => {
    const offers = (product.ean_offers || []).filter(o => Number(o.price) > 0);
    if (!offers.length) return;
    const best = Math.min(...offers.map(o => Number(o.price)));
    const seller = offers.filter(o => {
      const name = String(o.program_title || o.programs?.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      return name === merchantKey;
    }).sort((a,b) => Number(a.price) - Number(b.price))[0];
    const merchantPrice = Number(seller?.price || product.price);
    if (!(merchantPrice > 0)) return;
    evaluatedCount++;
    if (merchantPrice <= best + 0.01) bestPriceCount++;
  });
  const bestRate = evaluatedCount ? Math.round(bestPriceCount / evaluatedCount * 100) : 0;
  const structured = {
    '@context':'https://schema.org', '@type':'CollectionPage', name:title, url:canonical, description,
    about:{ '@type':'Organization', name:merchant },
    mainEntity:{ '@type':'ItemList', numberOfItems:products.length, itemListElement:products.map((p, i) => ({
      '@type':'ListItem', position:(page - 1) * 30 + i + 1,
      url:`${SITE_URL}/produit/${slugify(p.title) || 'produit'}-${encodeURIComponent(p.ean)}`, name:p.title
    }))}
  };
  const pagination = pages > 1 ? `<nav class="pagination" aria-label="Pagination">
    ${page > 1 ? `<a href="${basePath}?page=${page - 1}" rel="prev">← Précédent</a>` : '<span></span>'}
    <span>Page ${page.toLocaleString('fr-FR')} sur ${pages.toLocaleString('fr-FR')}</span>
    ${page < pages ? `<a href="${basePath}?page=${page + 1}" rel="next">Suivant →</a>` : '<span></span>'}
  </nav>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}">${previous ? `<link rel="prev" href="${previous}">` : ''}${next ? `<link rel="next" href="${next}">` : ''}
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}">
<link rel="icon" href="/favicon.png"><script type="application/ld+json">${jsonLd(structured)}</script>
<style>
:root{--ink:#0f172a;--coral:#ff6b6b;--paper:#f6f7f9;--line:#e3e7ed;--muted:#667085;--green:#087f5b}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}a{color:inherit}header{height:72px;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);display:flex;align-items:center;position:sticky;top:0;z-index:10;backdrop-filter:blur(12px)}header>div,.wrap{width:min(1400px,calc(100% - 32px));margin:auto}header>div{display:flex;align-items:center;gap:24px}.logo{font-size:27px;font-weight:950;text-decoration:none;letter-spacing:-1.4px}.logo i{font-style:normal;color:var(--coral)}.search{margin-left:auto;width:min(560px,60%);display:flex;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;background:#fff}.search:focus-within{border-color:var(--ink);box-shadow:0 0 0 3px rgba(15,23,42,.07)}.search input{width:100%;border:0;padding:12px 14px;font:inherit;outline:0}.search button{border:0;background:var(--ink);color:#fff;padding:0 20px;font-weight:800}.crumbs{padding:22px 0 12px;color:var(--muted);font-size:13px}.crumbs a{text-decoration:none}.hero{position:relative;overflow:hidden;background:linear-gradient(125deg,#fff 0%,#f8faff 64%,#edf1f8 100%);border:1px solid var(--line);border-radius:24px;padding:32px;margin-bottom:14px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:32px}.hero:after{content:"";position:absolute;width:260px;height:260px;border-radius:50%;right:-120px;top:-150px;border:42px solid rgba(15,23,42,.045)}.merchant-heading{display:flex;align-items:center;gap:18px;position:relative;z-index:1}.merchant-mark{width:70px;height:70px;display:grid;place-items:center;border-radius:18px;background:var(--ink);color:#fff;font-size:23px;font-weight:950;letter-spacing:-.06em;box-shadow:0 9px 20px rgba(15,23,42,.16)}.eyebrow{color:#d94d4d;font-size:11px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.hero h1{font-size:clamp(34px,5vw,55px);line-height:.95;margin:7px 0 11px;letter-spacing:-.045em}.hero p{color:var(--muted);max-width:720px;margin:0;line-height:1.5}.trustline{display:flex;flex-wrap:wrap;gap:14px;margin-top:16px;font-size:12px;font-weight:750}.trustline span{display:flex;align-items:center;gap:6px}.trustline i{width:7px;height:7px;border-radius:50%;background:var(--green)}.hero-stats{position:relative;z-index:1;display:grid;grid-template-columns:repeat(2,minmax(130px,1fr));gap:9px;width:340px}.stat{background:rgba(255,255,255,.9);border:1px solid #d7dde6;border-radius:14px;padding:14px}.stat.primary{background:var(--ink);color:#fff;border-color:var(--ink)}.stat strong{display:block;font-size:23px;letter-spacing:-.04em}.stat span{display:block;color:var(--muted);font-size:11px;margin-top:2px}.stat.primary span{color:#cbd5e1}.notice{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:13px;padding:13px 15px;margin-bottom:17px;color:var(--muted);font-size:12px;line-height:1.45}.notice b{color:var(--ink)}.notice i{font-style:normal;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:#eef2f7;color:var(--ink);font-weight:900}.typebar{display:flex;gap:8px;overflow:auto;padding:2px 0 18px;scrollbar-width:none}.typebar::-webkit-scrollbar{display:none}.type-chip{white-space:nowrap;background:#fff;border:1px solid var(--line);border-radius:999px;padding:9px 13px;font:inherit;font-size:12px;color:var(--muted);cursor:pointer}.type-chip b{color:var(--ink)}.type-chip:hover,.type-chip.active{border-color:var(--ink);background:var(--ink);color:#cbd5e1}.type-chip.active b{color:#fff}.catalogue-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin:4px 0 14px}.catalogue-head h2{font-size:22px;letter-spacing:-.025em;margin:0 0 4px}.catalogue-head p{margin:0;color:var(--muted);font-size:12px}.tools{display:flex;gap:8px}.local-search,.sort{height:40px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font:inherit;font-size:13px}.local-search{width:230px;padding:0 12px}.sort{padding:0 32px 0 11px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.product{background:#fff;border:1px solid var(--line);border-radius:17px;overflow:hidden;text-decoration:none;display:flex;flex-direction:column;transition:transform .18s,box-shadow .18s,border-color .18s}.product:hover{transform:translateY(-3px);box-shadow:0 16px 36px rgba(15,23,42,.09);border-color:#cbd5e1}.product[hidden]{display:none}.product-image{height:230px;background:#fff;display:grid;place-items:center;padding:18px;position:relative}.product-image img{max-width:100%;max-height:100%;object-fit:contain}.product-image>span{position:absolute;top:12px;left:12px;border-radius:7px;padding:5px 8px;font-size:10px;font-weight:900;letter-spacing:.03em}.trend-badge{background:var(--ink);color:#fff}.deal-badge{background:#e8fff5;color:#067653}.no-image{width:100%;height:100%;border:1px dashed #d7dde5;border-radius:12px;background:linear-gradient(145deg,#fafbfc,#f3f5f8);display:grid;place-content:center;text-align:center;color:#98a2b3}.no-image[hidden]{display:none}.no-image span{font-size:18px;font-weight:950;letter-spacing:-.04em;color:#c1c7d0}.no-image small{font-size:10px;margin-top:4px}.product-body{border-top:1px solid #f0f2f5;padding:16px;display:flex;flex-direction:column;flex:1}.brand{font-size:10px;font-weight:900;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}.product h2{font-size:15px;line-height:1.4;margin:6px 0 18px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.price-row{margin-top:auto;display:flex;justify-content:space-between;align-items:end;gap:8px}.price-row small{display:block;color:var(--muted);text-transform:uppercase;font-size:9px;font-weight:900}.price-row strong{font-size:25px;letter-spacing:-.035em}.high{font-size:11px;color:var(--muted);text-align:right}.offer-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--green);font-weight:800;margin-top:8px}.offer-meta span+span:before{content:"·";margin-right:8px;color:#98a2b3}.card-foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #f0f2f5;margin:13px -16px -16px;padding:11px 16px;color:var(--muted);font-size:10px}.card-foot b{color:var(--ink);font-size:11px}.card-foot i{font-style:normal;color:var(--coral)}.empty{display:none;background:#fff;border:1px dashed #cbd5e1;border-radius:16px;padding:48px;text-align:center;color:var(--muted)}.pagination{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin:30px 0 50px;color:var(--muted);font-size:13px}.pagination a{padding:10px 14px;background:#fff;border:1px solid var(--line);border-radius:9px;text-decoration:none;font-weight:800}.pagination a:last-child{justify-self:end}footer{border-top:1px solid var(--line);background:#fff;padding:30px;text-align:center;color:var(--muted);font-size:13px;margin-top:50px}@media(max-width:1050px){.grid{grid-template-columns:repeat(3,1fr)}.hero{grid-template-columns:1fr}.hero-stats{width:100%;grid-template-columns:repeat(4,1fr)}}@media(max-width:760px){header{height:auto;padding:12px 0}header>div{flex-wrap:wrap}.search{order:2;width:100%}.hero{padding:22px}.merchant-heading{align-items:flex-start}.merchant-mark{width:56px;height:56px;border-radius:14px}.hero-stats{grid-template-columns:repeat(2,1fr)}.catalogue-head{align-items:stretch;flex-direction:column}.tools{display:grid;grid-template-columns:1fr 1fr}.local-search{width:100%}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.product-image{height:175px}.product-body{padding:12px}.product h2{font-size:13px}.price-row strong{font-size:20px}.card-foot{margin:11px -12px -12px;padding:10px 12px}.card-foot>span{display:none}}@media(max-width:440px){.wrap,header>div{width:min(100% - 20px,1400px)}.hero h1{font-size:34px}.tools{grid-template-columns:1fr}.grid{gap:8px}}
</style></head><body>
<header><div><a class="logo" href="/">Hi<i>Find</i></a><form class="search" action="/" method="get"><input name="q" placeholder="Rechercher un produit, une marque…" aria-label="Rechercher"><button>Rechercher</button></form></div></header>
<main class="wrap"><div class="crumbs"><a href="/">Accueil</a> / Marchands / ${esc(merchant)}</div>
<section class="hero"><div class="merchant-heading"><div class="merchant-mark" aria-hidden="true">${esc(merchant).slice(0,2).toUpperCase()}</div><div><div class="eyebrow">Marchand référencé</div><h1>${esc(merchant)}</h1><p>${esc(description)}</p><div class="trustline"><span><i></i>Offres issues des flux marchands</span><span><i></i>Comparaison indépendante</span><span><i></i>Prix non sponsorisés</span></div></div></div><div class="hero-stats"><div class="stat primary"><strong>${total.toLocaleString('fr-FR')}</strong><span>produits comparables</span></div><div class="stat"><strong>${categories.size}</strong><span>types sur cette page</span></div><div class="stat"><strong>${brands.size}</strong><span>marques représentées</span></div><div class="stat"><strong>${bestRate} %</strong><span>au meilleur prix sur cette page</span></div></div></section>
<div class="notice"><i>i</i><div><b>HiFind n’est pas ${esc(merchant)}.</b> Nous comparons ses offres avec celles d’autres vendeurs. La commande, le paiement, la livraison et le service après-vente restent assurés par le marchand choisi.</div></div>
${categories.size ? `<div class="typebar" aria-label="Filtrer par type"><button class="type-chip active" data-type=""><b>Tous</b> · ${products.length}</button>${[...categories.entries()].sort((a,b)=>b[1]-a[1]).map(([label,count])=>`<button class="type-chip" data-type="${esc(label)}"><b>${esc(label)}</b> · ${count}</button>`).join('')}</div>` : ''}
<div class="catalogue-head"><div><h2>Produits ${esc(merchant)} à comparer</h2><p><span id="visibleCount">${products.length}</span> références sur cette page, classées par intérêt actuel</p></div><div class="tools"><input class="local-search" id="catalogueSearch" type="search" placeholder="Filtrer les produits…" aria-label="Filtrer les produits"><select class="sort" id="catalogueSort" aria-label="Trier les produits"><option value="rank">Popularité</option><option value="price">Prix croissant</option><option value="offers">Nombre de marchands</option><option value="spread">Écart de prix</option></select></div></div>
<section class="grid" id="productGrid">${products.map((product,index) => productCard(product,index,page)).join('')}</section><div class="empty" id="emptyState">Aucun produit ne correspond à ce filtre sur cette page.</div>${pagination}</main>
<footer>© ${new Date().getFullYear()} HiFind · Comparateur indépendant. Les achats sont réalisés sur le site du marchand.</footer>
<script>(()=>{const grid=document.getElementById('productGrid'),cards=[...grid.querySelectorAll('.product')],search=document.getElementById('catalogueSearch'),sort=document.getElementById('catalogueSort'),count=document.getElementById('visibleCount'),empty=document.getElementById('emptyState'),chips=[...document.querySelectorAll('.type-chip')];let type='';function render(){const q=search.value.trim().toLowerCase();let visible=cards.filter(card=>(!type||card.dataset.type===type)&&(!q||card.dataset.title.includes(q)));visible.sort((a,b)=>sort.value==='price'?+a.dataset.price-+b.dataset.price:sort.value==='offers'?+b.dataset.offers-+a.dataset.offers:sort.value==='spread'?+b.dataset.spread-+a.dataset.spread:+a.dataset.rank-+b.dataset.rank);cards.forEach(card=>card.hidden=true);visible.forEach(card=>{card.hidden=false;grid.appendChild(card)});count.textContent=visible.length;empty.style.display=visible.length?'none':'block'}search.addEventListener('input',render);sort.addEventListener('change',render);chips.forEach(chip=>chip.addEventListener('click',()=>{type=chip.dataset.type;chips.forEach(c=>c.classList.toggle('active',c===chip));render()}));})();</script></body></html>`;
}

export default async function handler(req, res) {
  const raw = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  const slug = String(raw || '').replace(/^\/+|\/+$/g, '');
  if (!slug) return res.status(404).send('Marchand introuvable');
  const page = Math.max(1, Math.min(parseInt(req.query.page, 10) || 1, 500));
  const limit = 30;
  const offset = (page - 1) * limit;
  const client = await getPool().connect();
  try {
    const programs = await client.query(`SELECT DISTINCT pr.id, pr.title FROM programs pr
      JOIN products p ON p.program_id=pr.id
      WHERE p.status='enabled' AND pr.title IS NOT NULL AND p.program_id NOT LIKE '%darty%'`);
    const matched = programs.rows.filter(row => slugifyMerchant(row.title) === slug);
    if (!matched.length) return res.status(404).send('Marchand introuvable');
    const merchant = matched[0].title;
    const programIds = matched.map(row => row.id);
    const candidates = await client.query(`WITH engagement AS (
        SELECT ean, SUM(detail_views)::int AS detail_views, SUM(offer_clicks)::int AS offer_clicks
        FROM product_engagement_daily
        WHERE day >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY ean
      ), distinct_products AS (
        SELECT DISTINCT ON (p.ean) p.*, pr.title AS program_title
          , (COALESCE(e.detail_views,0) * 2 + COALESCE(e.offer_clicks,0) * 6) AS trend_score
        FROM products p LEFT JOIN programs pr ON p.program_id=pr.id
        LEFT JOIN engagement e ON e.ean=p.ean
        WHERE ${MULTI_VENDOR_WHERE} AND p.program_id=ANY($1)
        ORDER BY p.ean, p.price ASC
      )
      SELECT distinct_products.*, COUNT(*) OVER() AS total_count
      FROM distinct_products
      ORDER BY trend_score DESC, updated_at DESC NULLS LAST, ean
      LIMIT $2 OFFSET $3`, [programIds, limit * 3, offset]);
    const total = parseInt(candidates.rows[0]?.total_count || '0', 10);
    const pages = Math.max(1, Math.ceil(total / limit));
    if (!total || page > pages) return res.status(404).send('Page marchand introuvable');
    const products = (await groupWithOffers(client, candidates.rows)).slice(0, limit);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return res.status(200).send(merchantPageHtml({ merchant, products, total, page, pages }));
  } catch (error) {
    console.error('Merchant page error:', error.message);
    return res.status(500).send('Page momentanément indisponible');
  } finally {
    client.release();
  }
}
