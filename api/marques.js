import { getPool } from './products.js';
import { SITE_URL, esc, jsonLd, slugify } from './categorie.js';

export function brandDirectoryHtml(brands) {
  const title = 'Marques comparées sur HiFind';
  const description = `Explorez ${brands.length.toLocaleString('fr-FR')} marques dont les prix sont comparés chez plusieurs marchands sur HiFind.`;
  const structured = {
    '@context':'https://schema.org', '@type':'CollectionPage', name:title, url:`${SITE_URL}/marques`, description,
    mainEntity:{ '@type':'ItemList', numberOfItems:brands.length, itemListElement:brands.map((brand, index) => ({
      '@type':'ListItem', position:index + 1, url:`${SITE_URL}/marque/${slugify(brand.brand)}`, name:brand.brand
    })) }
  };
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${SITE_URL}/marques">
<meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${SITE_URL}/marques">
<link rel="icon" href="/favicon.png"><script type="application/ld+json">${jsonLd(structured)}</script><style>
:root{--ink:#0f172a;--coral:#ff6b6b;--paper:#f6f7f9;--line:#e3e7ed;--muted:#667085}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}a{color:inherit}header{height:72px;background:#fffffff2;border-bottom:1px solid var(--line);display:flex;align-items:center;position:sticky;top:0;z-index:5;backdrop-filter:blur(12px)}header>div,.wrap{width:min(1180px,calc(100% - 32px));margin:auto}header>div{display:flex;align-items:center}.logo{font-size:27px;font-weight:950;text-decoration:none;letter-spacing:-1.4px}.logo i{font-style:normal;color:var(--coral)}.nav{margin-left:auto;text-decoration:none;font-size:13px;font-weight:800}.crumbs{padding:22px 0 12px;color:var(--muted);font-size:13px}.crumbs a{text-decoration:none}.hero{background:linear-gradient(125deg,#fff,#fff8f7);border:1px solid var(--line);border-radius:24px;padding:38px;margin-bottom:25px}.eyebrow{color:#d94d4d;font-size:11px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.hero h1{font-size:clamp(38px,6vw,64px);line-height:.95;margin:10px 0 15px;letter-spacing:-.05em}.hero p{color:var(--muted);max-width:720px;line-height:1.55}.tools{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}.tools h2{margin:0;font-size:22px}.search{width:min(390px,100%);border:1px solid #cbd5e1;border-radius:11px;background:#fff;padding:12px 14px;font:inherit}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.brand-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:17px;text-decoration:none;transition:.16s}.brand-card:hover{transform:translateY(-2px);box-shadow:0 12px 30px #0f172a14}.brand-card[hidden]{display:none}.brand-card h2{font-size:16px;margin:0 0 14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.numbers{display:flex;gap:18px;color:var(--muted);font-size:10px}.numbers strong{display:block;color:var(--ink);font-size:17px}.go{display:block;border-top:1px solid #f0f2f5;margin-top:13px;padding-top:11px;color:var(--coral);font-size:11px;font-weight:850}.empty{display:none;text-align:center;padding:35px;color:var(--muted)}footer{margin-top:45px;border-top:1px solid var(--line);background:#fff;padding:28px;text-align:center;color:var(--muted);font-size:12px}@media(max-width:850px){.grid{grid-template-columns:repeat(2,1fr)}.tools{align-items:stretch;flex-direction:column}.search{width:100%}}@media(max-width:500px){header>div,.wrap{width:calc(100% - 20px)}.grid{grid-template-columns:1fr}.hero{padding:26px}.nav{display:none}}
</style></head><body><header><div><a class="logo" href="/">Hi<i>Find</i></a><a class="nav" href="/marchands">Voir les marchands</a></div></header><main class="wrap"><div class="crumbs"><a href="/">Accueil</a> / Marques</div><section class="hero"><div class="eyebrow">Catalogue réel</div><h1>Les marques sur HiFind</h1><p>${esc(description)} Seules les marques disposant de produits réellement comparables sont publiées.</p></section><div class="tools"><h2>Explorer les marques</h2><input class="search" id="brandSearch" type="search" placeholder="Rechercher une marque…" aria-label="Rechercher une marque"></div><section class="grid">${brands.map(brand => `<a class="brand-card" href="/marque/${slugify(brand.brand)}" data-name="${esc(brand.brand.toLowerCase())}"><h2>${esc(brand.brand)}</h2><div class="numbers"><span><strong>${Number(brand.products).toLocaleString('fr-FR')}</strong>produits</span><span><strong>${Number(brand.merchants).toLocaleString('fr-FR')}</strong>marchands</span></div><span class="go">Comparer les prix →</span></a>`).join('')}</section><div class="empty" id="emptyState">Aucune marque ne correspond à cette recherche.</div></main><footer>© ${new Date().getFullYear()} HiFind · Comparateur indépendant.</footer><script>(()=>{const input=document.getElementById('brandSearch'),cards=[...document.querySelectorAll('.brand-card')],empty=document.getElementById('emptyState');input.addEventListener('input',()=>{const q=input.value.trim().toLowerCase();let n=0;cards.forEach(c=>{c.hidden=q&&!c.dataset.name.includes(q);if(!c.hidden)n++});empty.style.display=n?'none':'block'});})();</script></body></html>`;
}

export default async function handler(req, res) {
  const client = await getPool().connect();
  try {
    const result = await client.query(`SELECT p.brand, COUNT(DISTINCT p.ean)::int AS products,
      COUNT(DISTINCT COALESCE(ma.merchant_id::text,p.program_id))::int AS merchants
      FROM products p LEFT JOIN merchant_aliases ma ON ma.raw_program_id=p.program_id
      WHERE p.status='enabled' AND p.ean IS NOT NULL AND p.price>0 AND p.brand IS NOT NULL
        AND length(trim(p.brand)) BETWEEN 2 AND 80 AND p.program_id NOT LIKE '%darty%'
        AND EXISTS (SELECT 1 FROM products p2 LEFT JOIN merchant_aliases ma2 ON ma2.raw_program_id=p2.program_id
          WHERE p2.ean=p.ean AND p2.status='enabled'
          AND COALESCE(ma2.merchant_id::text,p2.program_id)<>COALESCE(ma.merchant_id::text,p.program_id))
      GROUP BY p.brand HAVING COUNT(DISTINCT p.ean)>=2
      ORDER BY products DESC, p.brand ASC LIMIT 1000`);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','public, s-maxage=900, stale-while-revalidate=3600');
    return res.status(200).send(brandDirectoryHtml(result.rows));
  } catch (error) {
    console.error('Brand directory error:', error.message);
    return res.status(500).send('Annuaire momentanément indisponible');
  } finally { client.release(); }
}
