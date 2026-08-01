// discover-feeds.js — Decouvre les flux Awin / Effinity / CJ
// Usage: node scripts/discover-feeds.js

const AWIN_API_KEY      = process.env.AWIN_API_KEY || '';
const AWIN_OAUTH_TOKEN  = process.env.AWIN_OAUTH_TOKEN || '';
const AWIN_PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || '2855063';
const EFFINITY_API_KEY  = process.env.EFFINITY_API_KEY || '';
const CJ_TOKEN          = process.env.CJ_TOKEN || '';
const CJ_PUBLISHER_ID   = process.env.CJ_PUBLISHER_ID || '';

const AWIN_COLUMNS = 'aw_deep_link,product_name,aw_product_id,merchant_image_url,search_price,merchant_name,brand_name,aw_image_url,currency,ean,product_GTIN';

const CATEGORY_RULES = [
  { k:['pneu','auto','moto','carter','norauto','piece','garage','oscaro','feu vert','midas','speedway','maxxess','axxe'], c:'auto-moto' },
  { k:['parfum','beaut','cosmet','maquillage','sephora','nocibe','marionnaud','coiffeur','clarins','perfum','yves rocher'], c:'beaute-bienetre' },
  { k:['tech','electro','informatique','ordinateur','smartphone','xiaomi','acer','asus','samsung','geekbuying','pixmania','ldlc','boulanger','fnac','darty'], c:'high-tech' },
  { k:['sport','foot','running','fitness','decathlon','intersport','snowleader','velo','bike','gorilla'], c:'sport-outdoor' },
  { k:['mode','vetement','chaussure','sneaker','zalando','spartoo','sarenza','redoute','kiabi','celio','daxon','dim'], c:'mode-vetements' },
  { k:['bebe','enfant','jouet','vertbaudet','oxybul','king jouet','toys','aubert'], c:'enfants-bebes' },
  { k:['maison','jardin','deco','meuble','conforama','ikea','castorama','leroy','electrolux','bosch'], c:'maison-jardin' },
  { k:['animal','animalerie','chien','chat','zooplus','croquette'], c:'animaux' },
  { k:['bio','alimentation','epicerie','greenweez','naturalia'], c:'alimentation-bio' },
  { k:['sante','pharma','nutrition','complement','parapharmacie','biomedi'], c:'sante-nutrition' },
];

function guessCategory(name) {
  const n = (name || '').toLowerCase();
  for (const r of CATEGORY_RULES) if (r.k.some(x => n.includes(x))) return r.c;
  return null;
}

async function testFeed(url) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to);
    res.body && res.body.cancel && res.body.cancel();
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

// ============================== AWIN ==============================
async function discoverAwin() {
  console.log('\n' + '='.repeat(70));
  console.log('AWIN');
  console.log('='.repeat(70));

  if (!AWIN_OAUTH_TOKEN) {
    console.log('AWIN_OAUTH_TOKEN manquant.');
    console.log('  Awin > ton nom (haut droite) > Account settings > API credentials');
    return null;
  }
  if (!AWIN_API_KEY) { console.log('AWIN_API_KEY manquant'); return null; }

  // 1) Programmes rejoints (donne les mid + noms)
  const progUrl = 'https://api.awin.com/publishers/' + AWIN_PUBLISHER_ID + '/programmes?relationship=joined';
  console.log('  GET ' + progUrl);
  const midToName = {};
  try {
    const res = await fetch(progUrl, { headers: { 'Authorization': 'Bearer ' + AWIN_OAUTH_TOKEN } });
    const body = await res.text();
    if (!res.ok) { console.log('  HTTP ' + res.status + ' ' + body.slice(0, 200)); return null; }
    const progs = JSON.parse(body);
    for (const p of progs) midToName[String(p.id)] = p.displayName || p.name;
    console.log('  Programmes rejoints : ' + progs.length);
  } catch (e) { console.log('  Erreur: ' + e.message); return null; }

  // 2) Liste des FLUX (fid). Le fid n'est PAS le mid : il faut cet endpoint.
  console.log('\n  Recuperation de la liste des flux (fid)...');
  const listCandidates = [
    'https://productdata.awin.com/datafeed/list/apikey/' + AWIN_API_KEY + '/',
    'https://api.awin.com/publishers/' + AWIN_PUBLISHER_ID + '/datafeeds',
    'https://api.awin.com/publishers/' + AWIN_PUBLISHER_ID + '/productdata/feeds',
  ];

  let feedRows = null;
  for (const u of listCandidates) {
    process.stdout.write('  test ' + u.replace(AWIN_API_KEY, '***').replace(AWIN_OAUTH_TOKEN, '***') + ' ... ');
    try {
      const headers = u.indexOf('api.awin.com') !== -1
        ? { 'Authorization': 'Bearer ' + AWIN_OAUTH_TOKEN } : {};
      const r = await fetch(u, { headers: headers });
      const b = await r.text();
      if (!r.ok) { console.log('HTTP ' + r.status); continue; }
      if (b.length < 50) { console.log('vide'); continue; }
      console.log('OK (' + b.length + ' octets)');
      feedRows = b.trim().charAt(0) === '[' || b.trim().charAt(0) === '{'
        ? JSON.parse(b) : parseCsv(b, ',');
      break;
    } catch (e) { console.log('erreur: ' + e.message); }
  }

  if (!feedRows) {
    console.log('\n  Impossible de recuperer les fid automatiquement.');
    console.log('  Le mid ne permet PAS de construire l\'URL de telechargement.');
    console.log('  Genere les liens sur Awin > Toolbox > Create-a-Feed.\n');
    console.log('  Programmes rejoints (mid | nom) :');
    for (const mid of Object.keys(midToName)) console.log('    ' + mid + ' | ' + midToName[mid]);
    return null;
  }

  console.log('  Flux listes : ' + feedRows.length);
  if (feedRows.length) console.log('  Champs : ' + Object.keys(feedRows[0]).join(', ') + '\n');

  const feeds = [], skipped = [];
  for (const row of feedRows) {
    const fid   = row['Feed ID'] || row.feedId || row['Feed Id'] || row.id;
    const name  = row['Advertiser Name'] || row.advertiserName || row['Advertiser'] || midToName[String(row['Advertiser ID'] || row.advertiserId)];
    const count = parseInt(row['No of products'] || row.productCount || row['Products'] || '0', 10);
    const lang  = (row['Language'] || row.language || '').toUpperCase();
    if (!fid || !name) continue;
    if (lang && lang !== 'FR') { continue; }
    if (count === 0) { skipped.push(name + ' (vide)'); continue; }

    const feedUrl = 'https://productdata.awin.com/datafeed/download/apikey/' + AWIN_API_KEY +
                    '/language/fr/fid/' + fid + '/rid/0/hasEnhancedFeeds/0/columns/' + AWIN_COLUMNS +
                    '/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/';

    process.stdout.write('  ' + name + ' (fid ' + fid + ', ' + count + ') ... ');
    const t = await testFeed(feedUrl);
    if (!t.ok) { console.log('KO ' + t.status); skipped.push(name); continue; }
    console.log('OK');

    const entry = { name: name, url: feedUrl, limit: count > 20000 ? 3000 : 5000 };
    const cat = guessCategory(name);
    if (cat) entry.category = cat;
    feeds.push(entry);
  }

  if (skipped.length) console.log('\n  Ignores : ' + skipped.join(', '));
  console.log('\n' + feeds.length + ' flux Awin valides');
  if (skipped.length) console.log('Sans flux produit : ' + skipped.join(', '));
  console.log('\n>>> Secret AWIN_FEEDS :\n');
  console.log(JSON.stringify(feeds));
  return feeds;
}

// ============================ EFFINITY ============================
async function discoverEffinity() {
  console.log('\n' + '='.repeat(70));
  console.log('EFFINITY');
  console.log('='.repeat(70));
  if (!EFFINITY_API_KEY) { console.log('EFFINITY_API_KEY manquant'); return null; }

  const filters = ['mines', 'active'];
  for (const filter of filters) {
    const url = 'https://apiv2.effiliation.com/apiv2/productfeeds.json?key=' + EFFINITY_API_KEY + '&filter=' + filter;
    process.stdout.write('  productfeeds.json?filter=' + filter + ' ... ');
    try {
      const res = await fetch(url);
      const body = await res.text();
      if (!res.ok) { console.log('HTTP ' + res.status); continue; }
      console.log('OK (' + body.length + ' octets)');

      let data;
      try { data = JSON.parse(body); }
      catch (e) { console.log('\n  Reponse brute :\n  ' + body.slice(0, 1200)); continue; }

      const list = Array.isArray(data) ? data : (data.feeds || data.productfeeds || data.data || []);
      console.log('  Flux trouves : ' + list.length);
      if (list.length) {
        console.log('  Champs : ' + Object.keys(list[0]).join(', ') + '\n');
        console.log('  Exemple :');
        console.log('  ' + JSON.stringify(list[0], null, 2).replace(/\n/g, '\n  '));
        console.log('\n  Liste complete :');
        console.log(JSON.stringify(list));
      } else {
        console.log('\n  Reponse :\n  ' + body.slice(0, 1200));
      }
      console.log('\n>>> Envoie ceci a Claude pour generer EFFINITY_FEEDS');
      return list;
    } catch (e) { console.log('erreur: ' + e.message); }
  }
  return null;
}

// ============================== CJ ==============================
async function discoverCJ() {
  console.log('\n' + '='.repeat(70));
  console.log('COMMISSION JUNCTION');
  console.log('='.repeat(70));
  if (!CJ_TOKEN) {
    console.log('CJ_TOKEN manquant - https://developers.cj.com/account/personal-access-tokens');
    return null;
  }

  const query = '{ productFeeds(companyId: "' + CJ_PUBLISHER_ID + '") { resultList { adId feedName advertiserId advertiserName productCount language currency lastUpdated } } }';

  try {
    const res = await fetch('https://ads.api.cj.com/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CJ_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query }),
    });
    const body = await res.text();
    if (!res.ok) { console.log('HTTP ' + res.status); console.log(body.slice(0, 600)); return null; }

    const data = JSON.parse(body);
    if (data.errors) { console.log('Erreurs GraphQL :'); console.log(JSON.stringify(data.errors, null, 2)); return null; }

    const list = (data.data && data.data.productFeeds && data.data.productFeeds.resultList) || [];
    console.log('Flux CJ trouves : ' + list.length + '\n');

    const fr = list.filter(f => (f.language || '').toLowerCase().indexOf('fr') === 0);
    console.log('Flux FR : ' + fr.length + '\n');
    console.log('  advertiserId | adId     | produits | devise | annonceur');
    console.log('  ' + '-'.repeat(70));
    for (const f of fr) {
      console.log('  ' + String(f.advertiserId).padEnd(12) + ' | ' + String(f.adId).padEnd(8)
        + ' | ' + String(f.productCount).padStart(8) + ' | ' + String(f.currency).padEnd(6)
        + ' | ' + f.advertiserName);
    }
    console.log('\n  JSON brut (advertiserId + nom + volume) :');
    console.log('  ' + JSON.stringify(fr.map(f => ({
      advertiserId: f.advertiserId, adId: f.adId,
      name: f.advertiserName, n: f.productCount, cur: f.currency
    }))));
    if (!fr.length && list.length) {
      console.log('Aucun FR. Toutes langues :');
      for (const f of list.slice(0, 30)) {
        console.log('  ' + f.advertiserName + ' | ' + f.language + ' | ' + f.productCount + ' produits');
      }
    }
    console.log('\n>>> Envoie cette liste a Claude pour generer le sync CJ');
    return fr;
  } catch (e) { console.log('Erreur: ' + e.message); return null; }
}

async function main() {
  console.log('Decouverte multi-reseaux HiFind');
  const awin = await discoverAwin();
  await discoverEffinity();
  await discoverCJ();
  if (awin && awin.length) {
    const fs = await import('fs');
    fs.writeFileSync('awin-feeds.json', JSON.stringify(awin, null, 2));
    console.log('\nawin-feeds.json sauvegarde');
  }
  console.log('\nTermine');
}

main().catch(e => { console.error('Erreur fatale: ' + e.message); process.exit(1); });
