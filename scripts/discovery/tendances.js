import { getPool, groupWithOffers, rankedCandidates } from '../../api/products.js';
import { SITE_URL, esc, jsonLd, slugify } from '../../api/categorie.js';

export function trendsHtml({ products, page = 1, pages = 1, total = 0 }) {
  const path='/tendances';
  const canonical=`${SITE_URL}${path}${page>1?`?page=${page}`:''}`;
  const title='Produits tendance : les comparaisons du moment | HiFind';
  const description=`Découvrez les ${total.toLocaleString('fr-FR')} produits qui suscitent actuellement le plus d’intérêt sur HiFind, tous comparés chez plusieurs marchands.`;
  const structured={'@context':'https://schema.org','@type':'CollectionPage',name:title,url:canonical,description,mainEntity:{'@type':'ItemList',numberOfItems:products.length,itemListElement:products.map((p,i)=>({'@type':'ListItem',position:(page-1)*30+i+1,url:`${SITE_URL}/produit/${slugify(p.title)||'produit'}-${p.ean}`,name:p.title}))}};
  const cards=products.map((product,index)=>{const offers=product.ean_offers||[],prices=offers.map(o=>Number(o.price)).filter(n=>n>0).sort((a,b)=>a-b),low=prices[0]||Number(product.price),high=prices.at(-1)||low,spread=high>low?Math.round((1-low/high)*100):0,image=product.image_url?`<img src="/api/img?url=${encodeURIComponent(product.image_url)}" alt="${esc(product.title)}" loading="lazy" onerror="this.hidden=true">`:'<span class="no-image">HiFind</span>';return `<a class="trend" href="/produit/${slugify(product.title)||'produit'}-${encodeURIComponent(product.ean)}"><div class="rank">${(page-1)*30+index+1}</div><div class="media">${image}${spread>=15?`<b>${spread} % d’écart</b>`:''}</div><div class="body">${product.brand?`<span class="brand">${esc(product.brand)}</span>`:''}<h2>${esc(product.title)}</h2><div class="price"><small>Dès</small><strong>${low.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong></div><div class="foot"><span>${Number(product.offers_count)||offers.length} marchands comparés</span><b>Comparer →</b></div></div></a>`}).join('');
  const pagination=pages>1?`<nav class="pagination">${page>1?`<a rel="prev" href="${path}${page>2?`?page=${page-1}`:''}">← Précédent</a>`:'<span></span>'}<span>Page ${page} sur ${pages}</span>${page<pages?`<a rel="next" href="${path}?page=${page+1}">Suivant →</a>`:'<span></span>'}</nav>`:'';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}">${page>1?`<link rel="prev" href="${SITE_URL}${path}${page>2?`?page=${page-1}`:''}">`:''}${page<pages?`<link rel="next" href="${SITE_URL}${path}?page=${page+1}">`:''}<meta name="robots" content="index,follow,max-image-preview:large"><script type="application/ld+json">${jsonLd(structured)}</script><link rel="icon" href="/favicon.png"><style>
:root{--ink:#0f172a;--coral:#ff6b6b;--paper:#f6f7f9;--line:#e3e7ed;--muted:#667085}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}a{color:inherit}header{height:72px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center}header>div,.wrap{width:min(1320px,calc(100% - 32px));margin:auto}.logo{font-size:27px;font-weight:950;text-decoration:none;letter-spacing:-1.4px}.logo i{font-style:normal;color:var(--coral)}.crumbs{padding:22px 0 12px;color:var(--muted);font-size:13px}.hero{background:linear-gradient(125deg,#fff,#fff3f0);border:1px solid var(--line);border-radius:24px;padding:38px;margin-bottom:22px}.eyebrow{color:#d94d4d;font-size:11px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.hero h1{font-size:clamp(38px,6vw,62px);line-height:.95;margin:10px 0 14px;letter-spacing:-.05em}.hero p{max-width:760px;color:var(--muted);line-height:1.55}.method{margin-top:18px;color:var(--muted);font-size:11px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}.trend{position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:17px;overflow:hidden;text-decoration:none;transition:.17s}.trend:hover{transform:translateY(-3px);box-shadow:0 15px 35px #0f172a14}.rank{position:absolute;z-index:2;top:10px;left:10px;width:29px;height:29px;border-radius:9px;background:var(--ink);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:900}.media{height:225px;display:grid;place-items:center;padding:18px;position:relative}.media img{max-width:100%;max-height:100%;object-fit:contain}.media b{position:absolute;right:12px;top:12px;background:#fff0ed;color:#c83e3e;border-radius:8px;padding:6px 8px;font-size:10px}.no-image{color:#cbd5e1;font-size:18px;font-weight:950}.body{border-top:1px solid #f0f2f5;padding:15px;display:flex;flex-direction:column;flex:1}.brand{font-size:10px;font-weight:900;color:var(--coral);text-transform:uppercase;letter-spacing:.08em}.body h2{font-size:14px;line-height:1.4;margin:6px 0 17px}.price{margin-top:auto}.price small{display:block;color:var(--muted);font-size:9px}.price strong{font-size:24px}.foot{display:flex;justify-content:space-between;border-top:1px solid #f0f2f5;margin:13px -15px -15px;padding:11px 15px;color:var(--muted);font-size:10px}.foot b{color:var(--ink)}.pagination{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin:30px 0}.pagination a{background:#fff;border:1px solid var(--line);border-radius:9px;padding:10px 14px;text-decoration:none;font-weight:800}.pagination a:last-child{justify-self:end}@media(max-width:980px){.grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:720px){.grid{grid-template-columns:repeat(2,1fr);gap:9px}.media{height:175px}.hero{padding:25px}.foot span{display:none}}@media(max-width:430px){header>div,.wrap{width:calc(100% - 20px)}}
</style></head><body><header><div><a class="logo" href="/">Hi<i>Find</i></a></div></header><main class="wrap"><div class="crumbs"><a href="/">Accueil</a> / Tendances</div><section class="hero"><div class="eyebrow">Intérêt récent</div><h1>Les tendances du moment</h1><p>${esc(description)}</p><div class="method">Classement combinant des critères du catalogue et les consultations et clics récents, avec une pondération décroissante sur sept jours et un plafonnement anti-manipulation.</div></section><section class="grid">${cards}</section>${pagination}</main></body></html>`;
}

export default async function handler(req, res) {
  const page = Math.max(1, Math.min(parseInt(req.query.page, 10) || 1, 200));
  const limit = 30, offset = (page - 1) * limit;
  const started = performance.now();
  let client;
  try {
    client = await getPool().connect();
    const connected = performance.now();
    const result = await rankedCandidates(client, { limit, offset });
    const ranked = performance.now();
    const total = Number(result.rows[0]?.total_count || 0);
    const pages = Math.max(1, Math.ceil(total / limit));
    if (page > pages) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).send('Page introuvable');
    }
    const products = (await groupWithOffers(client, result.rows)).slice(0, limit);
    const grouped = performance.now();
    const html = trendsHtml({ products, page, pages, total });
    res.setHeader('Server-Timing', [
      `db_connect;dur=${(connected - started).toFixed(1)}`,
      `ranking;dur=${(ranked - connected).toFixed(1)}`,
      `offers;dur=${(grouped - ranked).toFixed(1)}`,
      `render;dur=${(performance.now() - grouped).toFixed(1)}`,
    ].join(', '));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');
    return res.status(200).send(html);
  } catch (error) {
    console.error('Trends page error:', error.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send('Page momentanément indisponible');
  } finally {
    client?.release();
  }
}
