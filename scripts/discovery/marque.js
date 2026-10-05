import { getPool, groupWithOffers } from '../../api/products.js';
import { SITE_URL, esc, jsonLd, productCard, slugify } from '../../api/categorie.js';
import { ENGAGEMENT_DECAY_SQL, engagementTrendSql } from '../lib/trend-ranking.js';

export function brandPageHtml({ brand, products, total, page = 1, pages = 1 }) {
  const path = `/marque/${slugify(brand)}`;
  const canonical = `${SITE_URL}${path}${page > 1 ? `?page=${page}` : ''}`;
  const title = `${brand} : comparez les prix | HiFind`;
  const description = `Comparez les prix de ${total.toLocaleString('fr-FR')} produits ${brand} disponibles chez plusieurs marchands sur HiFind.`;
  const merchants = new Set();
  products.forEach(product => (product.ean_offers || []).forEach(offer => merchants.add(offer.program_title || offer.programs?.title || offer.program_id)));
  const structured = {'@context':'https://schema.org','@type':'CollectionPage',name:title,url:canonical,description,about:{'@type':'Brand',name:brand},mainEntity:{'@type':'ItemList',numberOfItems:products.length,itemListElement:products.map((p,i)=>({'@type':'ListItem',position:(page-1)*30+i+1,url:`${SITE_URL}/produit/${slugify(p.title)||'produit'}-${encodeURIComponent(p.ean)}`,name:p.title}))}};
  const pagination = pages > 1 ? `<nav class="pagination">${page > 1 ? `<a rel="prev" href="${path}${page > 2 ? `?page=${page-1}` : ''}">← Précédent</a>` : '<span></span>'}<span>Page ${page} sur ${pages}</span>${page < pages ? `<a rel="next" href="${path}?page=${page+1}">Suivant →</a>` : '<span></span>'}</nav>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}">${page>1?`<link rel="prev" href="${SITE_URL}${path}${page>2?`?page=${page-1}`:''}">`:''}${page<pages?`<link rel="next" href="${SITE_URL}${path}?page=${page+1}">`:''}<script type="application/ld+json">${jsonLd(structured)}</script><link rel="icon" href="/favicon.png"><style>
:root{--ink:#0f172a;--coral:#ff6b6b;--paper:#f6f7f9;--line:#e3e7ed;--muted:#667085}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}a{color:inherit}header{height:72px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center}header>div,.wrap{width:min(1400px,calc(100% - 32px));margin:auto}.logo{font-size:27px;font-weight:950;text-decoration:none;letter-spacing:-1.4px}.logo i{font-style:normal;color:var(--coral)}.crumbs{padding:22px 0 12px;color:var(--muted);font-size:13px}.hero{background:linear-gradient(125deg,#fff,#fff8f7);border:1px solid var(--line);border-radius:24px;padding:34px;margin-bottom:23px}.eyebrow{color:#d94d4d;font-size:11px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.hero h1{font-size:clamp(38px,6vw,60px);line-height:.95;margin:9px 0 13px;letter-spacing:-.05em}.hero p{color:var(--muted);line-height:1.5}.stats{display:flex;gap:10px;flex-wrap:wrap;margin-top:19px}.stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 15px}.stat strong{display:block;font-size:21px}.stat span{color:var(--muted);font-size:10px}.catalogue-head{display:flex;align-items:end;justify-content:space-between;gap:14px;margin-bottom:14px}.catalogue-head h2{margin:0}.local-search{width:270px;border:1px solid #cbd5e1;border-radius:10px;padding:11px 13px;font:inherit}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.product{background:#fff;border:1px solid var(--line);border-radius:17px;overflow:hidden;text-decoration:none;display:flex;flex-direction:column}.product[hidden]{display:none}.product-image{height:230px;display:grid;place-items:center;padding:18px;position:relative}.product-image img{max-width:100%;max-height:100%;object-fit:contain}.product-image>span{position:absolute;top:12px;left:12px;background:var(--ink);color:#fff;border-radius:7px;padding:5px 8px;font-size:10px}.no-image{width:100%;height:100%;display:grid;place-content:center;text-align:center;color:#98a2b3}.product-body{border-top:1px solid #f0f2f5;padding:16px;display:flex;flex-direction:column;flex:1}.brand{font-size:10px;font-weight:900;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}.product h2{font-size:15px;line-height:1.4;margin:6px 0 18px}.price-row{margin-top:auto;display:flex;justify-content:space-between;align-items:end}.price-row small{display:block;color:var(--muted);font-size:9px}.price-row strong{font-size:24px}.high{font-size:11px;color:var(--muted)}.offer-meta{font-size:11px;color:#087f5b;font-weight:800;margin-top:8px}.offer-meta span+span:before{content:' · '}.card-foot{display:flex;justify-content:space-between;border-top:1px solid #f0f2f5;margin:13px -16px -16px;padding:11px 16px;color:var(--muted);font-size:10px}.card-foot b{color:var(--ink)}.card-foot i{color:var(--coral)}.pagination{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin:30px 0}.pagination a{background:#fff;border:1px solid var(--line);border-radius:9px;padding:10px 14px;text-decoration:none;font-weight:800}.pagination a:last-child{justify-self:end}@media(max-width:1000px){.grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:720px){.catalogue-head{align-items:stretch;flex-direction:column}.local-search{width:100%}.grid{grid-template-columns:repeat(2,1fr);gap:9px}.product-image{height:175px}}@media(max-width:440px){header>div,.wrap{width:calc(100% - 20px)}.hero{padding:24px}}
</style></head><body><header><div><a class="logo" href="/">Hi<i>Find</i></a></div></header><main class="wrap"><div class="crumbs"><a href="/">Accueil</a> / <a href="/marques">Marques</a> / ${esc(brand)}</div><section class="hero"><div class="eyebrow">Marque comparée</div><h1>${esc(brand)}</h1><p>${esc(description)}</p><div class="stats"><div class="stat"><strong>${total.toLocaleString('fr-FR')}</strong><span>produits comparables</span></div><div class="stat"><strong>${merchants.size}</strong><span>marchands sur cette page</span></div></div></section><div class="catalogue-head"><h2>Produits ${esc(brand)} à comparer</h2><input class="local-search" id="brandProductsSearch" type="search" placeholder="Filtrer ces produits…"></div><section class="grid">${products.map((product,index)=>productCard(product,index,page)).join('')}</section>${pagination}</main><script>(()=>{const input=document.getElementById('brandProductsSearch'),cards=[...document.querySelectorAll('.product')];input.addEventListener('input',()=>{const q=input.value.trim().toLowerCase();cards.forEach(c=>c.hidden=q&&!c.dataset.title.includes(q))})})();</script></body></html>`;
}

export default async function handler(req, res) {
  const slug = String(Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug || '').replace(/^\/+|\/+$/g,'');
  if (!slug) return res.status(404).send('Marque introuvable');
  const page = Math.max(1, Math.min(parseInt(req.query.page,10)||1,500));
  const limit=30, offset=(page-1)*limit;
  const client=await getPool().connect();
  try {
    const names=await client.query(`SELECT DISTINCT brand FROM products WHERE status='enabled' AND brand IS NOT NULL AND length(trim(brand)) BETWEEN 2 AND 80`);
    const matched=names.rows.map(r=>r.brand).filter(name=>slugify(name)===slug);
    if (!matched.length) return res.status(404).send('Marque introuvable');
    const brand=matched[0];
    const result=await client.query(`WITH engagement AS (${ENGAGEMENT_DECAY_SQL}), candidates AS (
      SELECT DISTINCT ON (p.ean) p.*, pr.title AS program_title, ${engagementTrendSql('e')} AS trend_score
      FROM products p LEFT JOIN programs pr ON pr.id=p.program_id LEFT JOIN engagement e ON e.ean=p.ean
      WHERE p.status='enabled' AND p.ean IS NOT NULL AND p.price>0 AND p.brand=ANY($1) AND p.program_id NOT LIKE '%darty%'
        AND EXISTS (SELECT 1 FROM products p2 LEFT JOIN merchant_aliases ma2 ON ma2.raw_program_id=p2.program_id
          LEFT JOIN merchant_aliases ma ON ma.raw_program_id=p.program_id WHERE p2.ean=p.ean AND p2.status='enabled'
          AND COALESCE(ma2.merchant_id::text,p2.program_id)<>COALESCE(ma.merchant_id::text,p.program_id))
      ORDER BY p.ean,p.price ASC)
      SELECT candidates.*,COUNT(*) OVER() AS total_count FROM candidates
      ORDER BY trend_score DESC,updated_at DESC NULLS LAST,ean LIMIT $2 OFFSET $3`,[matched,limit,offset]);
    const total=Number(result.rows[0]?.total_count||0),pages=Math.max(1,Math.ceil(total/limit));
    if (!total||page>pages) return res.status(404).send('Page marque introuvable');
    const products=(await groupWithOffers(client,result.rows)).slice(0,limit);
    res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=1800');
    return res.status(200).send(brandPageHtml({brand,products,total,page,pages}));
  } catch(error){console.error('Brand page error:',error.message);return res.status(500).send('Page momentanément indisponible');}
  finally{client.release();}
}
