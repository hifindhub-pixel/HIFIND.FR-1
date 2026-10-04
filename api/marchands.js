import { getPool, slugifyMerchant } from './products.js';
import { SITE_URL, esc, jsonLd } from './categorie.js';

export function merchantDirectoryHtml(merchants) {
  const totalProducts = merchants.reduce((sum, merchant) => sum + Number(merchant.products || 0), 0);
  const title = 'Marchands comparés sur HiFind';
  const description = `Découvrez ${merchants.length.toLocaleString('fr-FR')} marchands référencés et les produits dont les prix sont réellement comparés sur HiFind.`;
  const structured = {
    '@context':'https://schema.org', '@type':'CollectionPage', name:title, url:`${SITE_URL}/marchands`, description,
    mainEntity:{ '@type':'ItemList', numberOfItems:merchants.length, itemListElement:merchants.map((merchant, index) => ({
      '@type':'ListItem', position:index + 1, url:`${SITE_URL}/marchand/${slugifyMerchant(merchant.title)}`,
      item:{ '@type':'Organization', name:merchant.title }
    })) }
  };
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${SITE_URL}/marchands">
<meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${SITE_URL}/marchands">
<link rel="icon" href="/favicon.png"><script type="application/ld+json">${jsonLd(structured)}</script><style>
:root{--ink:#0f172a;--coral:#ff6b6b;--paper:#f6f7f9;--line:#e3e7ed;--muted:#667085;--green:#087f5b}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}a{color:inherit}header{height:72px;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);display:flex;align-items:center;position:sticky;top:0;z-index:10;backdrop-filter:blur(12px)}header>div,.wrap{width:min(1180px,calc(100% - 32px));margin:auto}header>div{display:flex;align-items:center;gap:24px}.logo{font-size:27px;font-weight:950;text-decoration:none;letter-spacing:-1.4px}.logo i{font-style:normal;color:var(--coral)}.header-link{margin-left:auto;text-decoration:none;font-size:13px;font-weight:800}.crumbs{padding:22px 0 12px;color:var(--muted);font-size:13px}.crumbs a{text-decoration:none}.hero{position:relative;overflow:hidden;background:linear-gradient(125deg,#fff 0%,#fff8f7 72%,#ffe9e5 100%);border:1px solid var(--line);border-radius:24px;padding:38px;margin-bottom:18px}.hero:after{content:"";position:absolute;width:280px;height:280px;border-radius:50%;right:-110px;top:-160px;border:45px solid rgba(255,107,107,.09)}.eyebrow{color:#d94d4d;font-size:11px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.hero h1{position:relative;font-size:clamp(38px,6vw,64px);line-height:.94;margin:10px 0 15px;letter-spacing:-.05em}.hero p{position:relative;color:var(--muted);max-width:700px;line-height:1.55;margin:0}.stats{position:relative;display:flex;gap:9px;flex-wrap:wrap;margin-top:22px}.stat{background:rgba(255,255,255,.86);border:1px solid #d7dde6;border-radius:13px;padding:12px 15px;min-width:145px}.stat strong{display:block;font-size:22px}.stat span{display:block;color:var(--muted);font-size:10px;margin-top:2px}.tools{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:25px 0 13px}.tools h2{font-size:22px;margin:0}.search{width:min(390px,100%);border:1px solid #cbd5e1;border-radius:11px;background:#fff;padding:12px 14px;font:inherit;outline:0}.search:focus{border-color:var(--ink);box-shadow:0 0 0 3px rgba(15,23,42,.07)}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.merchant{display:flex;flex-direction:column;gap:13px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:17px;text-decoration:none;transition:transform .16s,box-shadow .16s}.merchant:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(15,23,42,.08)}.merchant[hidden]{display:none}.merchant h2{font-size:16px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.counts{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.count{background:#f7f8fa;border-radius:9px;padding:9px}.count strong{display:block;font-size:16px}.count span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;font-weight:800;margin-top:2px}.merchant-foot{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:11px;border-top:1px solid #f0f2f5;padding-top:11px}.merchant-foot b{color:var(--coral)}.empty{display:none;border:1px dashed #cbd5e1;border-radius:14px;padding:40px;text-align:center;color:var(--muted)}footer{margin-top:45px;border-top:1px solid var(--line);background:#fff;padding:28px;text-align:center;color:var(--muted);font-size:12px}@media(max-width:820px){.grid{grid-template-columns:repeat(2,1fr)}.hero{padding:26px}.tools{align-items:stretch;flex-direction:column}.search{width:100%}}@media(max-width:520px){header>div,.wrap{width:calc(100% - 20px)}.grid{grid-template-columns:1fr}.header-link{display:none}.hero h1{font-size:38px}}
</style></head><body><header><div><a class="logo" href="/">Hi<i>Find</i></a><a class="header-link" href="/?q=">Rechercher un produit</a></div></header>
<main class="wrap"><div class="crumbs"><a href="/">Accueil</a> / Marchands</div><section class="hero"><div class="eyebrow">Comparaison indépendante</div><h1>Les marchands sur HiFind</h1><p>${esc(description)} Une page marchand n’affiche que les références disposant d’au moins une offre concurrente.</p><div class="stats"><div class="stat"><strong>${merchants.length.toLocaleString('fr-FR')}</strong><span>marchands visibles</span></div><div class="stat"><strong>${totalProducts.toLocaleString('fr-FR')}</strong><span>présences produits</span></div></div></section>
<div class="tools"><h2>Explorer les vendeurs</h2><input class="search" id="merchantSearch" type="search" placeholder="Rechercher un marchand…" aria-label="Rechercher un marchand"></div>
<section class="grid" id="merchantGrid">${merchants.map(merchant => `<a class="merchant" href="/marchand/${slugifyMerchant(merchant.title)}" data-name="${esc(merchant.title.toLowerCase())}"><h2>${esc(merchant.title)}</h2><div class="counts"><div class="count"><strong>${Number(merchant.products).toLocaleString('fr-FR')}</strong><span>produits comparables</span></div><div class="count"><strong>${Number(merchant.categories).toLocaleString('fr-FR')}</strong><span>catégories</span></div></div><div class="merchant-foot"><span>${Number(merchant.offers).toLocaleString('fr-FR')} offres actives</span><b>Voir les prix →</b></div></a>`).join('')}</section><div class="empty" id="emptyState">Aucun marchand ne correspond à cette recherche.</div></main>
<footer>© ${new Date().getFullYear()} HiFind · Les achats sont réalisés directement sur le site du marchand choisi.</footer><script>(()=>{const input=document.getElementById('merchantSearch'),cards=[...document.querySelectorAll('.merchant')],empty=document.getElementById('emptyState');input.addEventListener('input',()=>{const q=input.value.trim().toLowerCase();let visible=0;cards.forEach(card=>{card.hidden=q&&!card.dataset.name.includes(q);if(!card.hidden)visible++});empty.style.display=visible?'none':'block'});})();</script></body></html>`;
}

export default async function handler(req, res) {
  const client = await getPool().connect();
  try {
    const result = await client.query(`SELECT pr.title,
      COUNT(DISTINCT p.ean)::int AS products, COUNT(*)::int AS offers,
      COUNT(DISTINCT COALESCE(p.category,'autres'))::int AS categories
      FROM products p JOIN programs pr ON pr.id=p.program_id
      WHERE p.status='enabled' AND p.ean IS NOT NULL AND p.price>0
        AND p.program_id NOT LIKE '%darty%' AND pr.title IS NOT NULL
        AND EXISTS (SELECT 1 FROM products p2 WHERE p2.ean=p.ean AND p2.status='enabled' AND p2.program_id<>p.program_id)
      GROUP BY pr.title HAVING COUNT(DISTINCT p.ean)>0
      ORDER BY products DESC, pr.title ASC`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    return res.status(200).send(merchantDirectoryHtml(result.rows));
  } catch (error) {
    console.error('Merchant directory error:', error.message);
    return res.status(500).send('Annuaire momentanément indisponible');
  } finally { client.release(); }
}
