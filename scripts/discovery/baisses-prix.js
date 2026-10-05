import { getPool, groupWithOffers } from '../../api/products.js';
import { SITE_URL, esc, jsonLd, slugify } from '../../api/categorie.js';

export function priceDropsHtml({ products, period = 30, page = 1, pages = 1, total = 0 }) {
  const path = '/baisses-de-prix';
  const query = `periode=${period}`;
  const canonical = `${SITE_URL}${path}?${query}${page > 1 ? `&page=${page}` : ''}`;
  const title = `Baisses de prix sur ${period} jours | HiFind`;
  const description = `Découvrez des produits dont le prix actuel est au moins 5 % sous leur prix moyen pondéré des ${period} derniers jours.`;
  const structured = {'@context':'https://schema.org','@type':'CollectionPage',name:title,url:canonical,description,mainEntity:{'@type':'ItemList',numberOfItems:products.length,itemListElement:products.map((p,i)=>({'@type':'ListItem',position:(page-1)*30+i+1,url:`${SITE_URL}/produit/${slugify(p.title)||'produit'}-${p.ean}`,name:p.title}))}};
  const pagination = pages > 1 ? `<nav class="pagination">${page>1?`<a rel="prev" href="${path}?${query}&page=${page-1}">← Précédent</a>`:'<span></span>'}<span>Page ${page} sur ${pages}</span>${page<pages?`<a rel="next" href="${path}?${query}&page=${page+1}">Suivant →</a>`:'<span></span>'}</nav>` : '';
  const cards = products.map(product => {
    const current = Number(product.current_price || product.price);
    const average = Number(product.period_average);
    const reduction = Math.max(0, Math.round((1-current/average)*100));
    const offers = Number(product.offers_count || product.ean_offers?.length || 0);
    const image = product.image_url ? `<img src="/api/img?url=${encodeURIComponent(product.image_url)}" alt="${esc(product.title)}" loading="lazy" onerror="this.hidden=true">` : '<span class="no-image">HiFind</span>';
    return `<a class="deal" href="/produit/${slugify(product.title)||'produit'}-${encodeURIComponent(product.ean)}"><div class="media">${image}<b>−${reduction} %</b></div><div class="body">${product.brand?`<span class="brand">${esc(product.brand)}</span>`:''}<h2>${esc(product.title)}</h2><div class="prices"><strong>${current.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} €</strong><span>Moyenne ${period} j : ${average.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} €</span></div><div class="foot"><span>${offers} marchands comparés</span><span>${Number(product.coverage_days)} jours couverts</span></div></div></a>`;
  }).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}"><meta name="robots" content="${products.length?'index':'noindex'},follow,max-image-preview:large"><script type="application/ld+json">${jsonLd(structured)}</script><link rel="icon" href="/favicon.png"><style>
:root{--ink:#0f172a;--coral:#ff6b6b;--paper:#f6f7f9;--line:#e3e7ed;--muted:#667085;--green:#087f5b}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}a{color:inherit}header{height:72px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center}header>div,.wrap{width:min(1320px,calc(100% - 32px));margin:auto}.logo{font-size:27px;font-weight:950;text-decoration:none;letter-spacing:-1.4px}.logo i{font-style:normal;color:var(--coral)}.crumbs{padding:22px 0 12px;color:var(--muted);font-size:13px}.hero{background:linear-gradient(125deg,#fff,#edfff8);border:1px solid var(--line);border-radius:24px;padding:38px;margin-bottom:20px}.eyebrow{color:var(--green);font-size:11px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.hero h1{font-size:clamp(38px,6vw,62px);line-height:.95;margin:10px 0 14px;letter-spacing:-.05em}.hero p{max-width:760px;color:var(--muted);line-height:1.55}.periods{display:flex;gap:8px;margin-top:20px}.periods a{background:#fff;border:1px solid var(--line);border-radius:999px;padding:9px 15px;text-decoration:none;font-size:12px;font-weight:850}.periods a.active{background:var(--ink);border-color:var(--ink);color:#fff}.method{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px 16px;color:var(--muted);font-size:12px;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}.deal{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:17px;overflow:hidden;text-decoration:none;transition:.17s}.deal:hover{transform:translateY(-3px);box-shadow:0 15px 35px #0f172a14}.media{height:225px;display:grid;place-items:center;padding:18px;position:relative}.media img{max-width:100%;max-height:100%;object-fit:contain}.media b{position:absolute;top:12px;left:12px;background:#e8fff5;color:#067653;border-radius:8px;padding:6px 9px;font-size:12px}.no-image{color:#cbd5e1;font-size:18px;font-weight:950}.body{border-top:1px solid #f0f2f5;padding:15px;display:flex;flex-direction:column;flex:1}.brand{font-size:10px;font-weight:900;color:var(--coral);text-transform:uppercase;letter-spacing:.08em}.body h2{font-size:14px;line-height:1.4;margin:6px 0 17px}.prices{margin-top:auto}.prices strong{display:block;font-size:24px}.prices span{display:block;color:var(--muted);font-size:10px;margin-top:3px}.foot{display:flex;justify-content:space-between;gap:6px;border-top:1px solid #f0f2f5;margin:13px -15px -15px;padding:11px 15px;color:var(--muted);font-size:9px}.pagination{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin:30px 0}.pagination a{background:#fff;border:1px solid var(--line);border-radius:9px;padding:10px 14px;text-decoration:none;font-weight:800}.pagination a:last-child{justify-self:end}@media(max-width:980px){.grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:720px){.grid{grid-template-columns:repeat(2,1fr);gap:9px}.media{height:175px}.hero{padding:25px}}@media(max-width:430px){header>div,.wrap{width:calc(100% - 20px)}.foot{display:block}.foot span{display:block;margin-top:3px}}
</style></head><body><header><div><a class="logo" href="/">Hi<i>Find</i></a></div></header><main class="wrap"><div class="crumbs"><a href="/">Accueil</a> / Baisses de prix</div><section class="hero"><div class="eyebrow">Historique vérifié</div><h1>Les vraies baisses de prix</h1><p>${esc(description)}</p><div class="periods"><a class="${period===30?'active':''}" href="${path}?periode=30">30 jours</a><a class="${period===90?'active':''}" href="${path}?periode=90">90 jours</a></div></section><div class="method">Le prix de référence est une moyenne pondérée par le temps réellement passé à chaque niveau de prix. Une couverture d’au moins 70 % de la période est obligatoire.</div><section class="grid">${cards}</section>${products.length?'':'<p>Aucune baisse vérifiable pour cette période actuellement. L’historique continue de se constituer.</p>'}${pagination}</main></body></html>`;
}

export function verifiedDrops(products, stats) {
  return products.map(product => {
    const prices=(product.ean_offers||[]).map(o=>Number(o.price)).filter(n=>Number.isFinite(n)&&n>0);
    const reference=stats.get(product.ean);
    const current=Math.min(...prices);
    const average=Number(reference?.period_average);
    if (!prices.length || !(average>0) || current>average*.95) return null;
    return {...product,period_average:average,coverage_days:reference.coverage_days,current_price:current};
  }).filter(Boolean);
}

export default async function handler(req,res){
  const period=Number(req.query.periode)===90?90:30;
  const page=Math.max(1,Math.min(parseInt(req.query.page,10)||1,200));
  const limit=30,offset=(page-1)*limit;
  const client=await getPool().connect();
  try{
    const result=await client.query(`WITH segments AS (
      SELECT ean,observed_at,min_price,LEAD(observed_at,1,NOW()) OVER(PARTITION BY ean ORDER BY observed_at) AS next_at
      FROM price_history WHERE observed_at>=NOW()-INTERVAL '365 days'
    ), averages AS (
      SELECT ean,
        SUM(min_price*EXTRACT(EPOCH FROM (LEAST(next_at,NOW())-GREATEST(observed_at,NOW()-make_interval(days=>$1::int)))))/NULLIF(SUM(EXTRACT(EPOCH FROM (LEAST(next_at,NOW())-GREATEST(observed_at,NOW()-make_interval(days=>$1::int))))),0) AS period_average,
        EXTRACT(DAY FROM NOW()-GREATEST(MIN(observed_at),NOW()-make_interval(days=>$1::int)))::int AS coverage_days
      FROM segments WHERE next_at>NOW()-make_interval(days=>$1::int) AND observed_at<NOW()
      GROUP BY ean HAVING COUNT(*)>=3 AND MAX(observed_at)>=NOW()-INTERVAL '8 days'
    ), current_products AS (
      SELECT DISTINCT ON(p.ean) p.*,pr.title AS program_title,MIN(p.price) OVER(PARTITION BY p.ean) AS current_price
      FROM products p LEFT JOIN programs pr ON pr.id=p.program_id
      WHERE p.status='enabled' AND p.ean IS NOT NULL AND p.price>0 AND p.program_id NOT LIKE '%darty%'
        AND EXISTS(SELECT 1 FROM products p2 WHERE p2.ean=p.ean AND p2.status='enabled' AND p2.program_id<>p.program_id)
      ORDER BY p.ean,p.price ASC
    ), eligible AS (
      SELECT c.*,a.period_average,a.coverage_days,COUNT(*) OVER() AS total_count
      FROM current_products c JOIN averages a USING(ean)
      WHERE a.coverage_days>=CEIL($1::numeric*.7) AND c.current_price<=a.period_average*.95
    ) SELECT * FROM eligible ORDER BY (1-current_price/period_average) DESC,ean LIMIT $2 OFFSET $3`,[period,limit,offset]);
    const total=Number(result.rows[0]?.total_count||0),pages=Math.max(1,Math.ceil(total/limit));
    if(page>pages) return res.status(404).send('Page introuvable');
    const stats=new Map(result.rows.map(row=>[row.ean,row]));
    const grouped=verifiedDrops(await groupWithOffers(client,result.rows),stats);
    res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=900, stale-while-revalidate=3600');
    return res.status(200).send(priceDropsHtml({products:grouped,period,page,pages,total}));
  }catch(error){console.error('Price drops error:',error.message);return res.status(500).send('Page momentanément indisponible');}finally{client.release();}
}
