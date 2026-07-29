// discover-feeds.js — Découvre les flux Awin / Effinity / CJ
// Usage: node scripts/discover-feeds.js

const AWIN_API_KEY     = process.env.AWIN_API_KEY || '';
const AWIN_OAUTH_TOKEN = process.env.AWIN_OAUTH_TOKEN || '';
const AWIN_PUBLISHER_ID= process.env.AWIN_PUBLISHER_ID || '2855063';
const EFFINITY_API_KEY = process.env.EFFINITY_API_KEY || '';
const CJ_TOKEN         = process.env.CJ_TOKEN || '';
const CJ_PUBLISHER_ID  = process.env.CJ_PUBLISHER_ID || '';

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

function parseCsv(text, sep) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const split = (line) => {
    const cells = []; let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === sep && !inQ) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur); return cells;
  };
  const headers = split(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = split(line); const o = {};
    headers.forEach((h, i) => { o[h] = (cells[i] || '').trim(); });
    return o;
  });
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

async function discoverAwin() {
  console.log('\n' + '='.repeat(70));
  console.log('AWIN');
  console.log('='.repeat(70));
  if (!AWIN_API_KEY) { console.log('AWIN_API_KEY manquant - ignore'); return null; }

  // Methode 1 : API OAuth (la seule fiable pour lister les programmes)
  if (AWIN_OAUTH_TOKEN) {
    console.log('  Methode OAuth...');
    try {
      const res = await fetch('https://api.awin.com/publishers/' + AWIN_PUBLISHER_ID + '/programmes?relationship=joined', {
        headers: { 'Authorization': 'Bearer ' + AWIN_OAUTH_TOKEN }
      });
      if (res.ok) {
        const progs = await res.json();
        console.log('  Programmes rejoints : ' + progs.length + '\n');
        const feeds = [];
        for (const p of progs) {
          const name = p.displayName || p.name;
          const mid = p.id;
          if (!name || !mid) continue;
          const url = 'https://productdata.awin.com/datafeed/download/apikey/' + AWIN_API_KEY +
                      '/language/fr/mid/' + mid + '/rid/0/hasEnhancedFeeds/0/columns/' + AWIN_COLUMNS +
                      '/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/';
          process.stdout.write('  ' + name + ' (mid ' + mid + ') ... ');
          const t = await testFeed(url);
          if (!t.ok) { console.log('KO ' + t.status); continue; }
          console.log('OK');
          const entry = { name: name, url: url, limit: 5000 };
          const cat = guessCategory(name);
          if (cat) entry.category = cat;
          feeds.push(entry);
        }
        console.log('\n' + feeds.length + ' flux valides');
        console.log('\n>>> Secret AWIN_FEEDS :\n');
        console.log(JSON.stringify(feeds));
        return feeds;
      }
      console.log('  OAuth HTTP ' + res.status + ' - fallback sur les autres methodes');
    } catch (e) { console.log('  OAuth erreur: ' + e.message); }
  } else {
    console.log('  AWIN_OAUTH_TOKEN absent - methode OAuth ignoree');
    console.log('  (Awin > Account settings > API credentials > Create token)\n');
  }

  const candidates = [
    'https://productdata.awin.com/datafeed/list/apikey/' + AWIN_API_KEY + '/',
    'https://productdata.awin.com/datafeed/list/apikey/' + AWIN_API_KEY,
    'https://productdata.awin.com/datafeed/list/apikey/' + AWIN_API_KEY + '/format/csv/',
    'https://ui.awin.com/productdata-darwin-download/publisher/' + AWIN_PUBLISHER_ID + '/' + AWIN_API_KEY + '/1/feedList',
    'https://ui.awin.com/productdata-darwin-download/publisher/' + AWIN_PUBLISHER_ID + '/' + AWIN_API_KEY + '/1/feeds',
  ];

  let text = null;
  for (const url of candidates) {
    process.stdout.write('  test ' + url.replace(AWIN_API_KEY, '***') + ' ... ');
    try {
      const res = await fetch(url);
      if (!res.ok) { console.log('HTTP ' + res.status); continue; }
      const body = await res.text();
      if (body.length < 50) { console.log('reponse vide'); continue; }
      console.log('OK (' + body.length + ' octets)');
      text = body; break;
    } catch (e) { console.log('erreur: ' + e.message); }
  }

  if (!text) {
    console.log('\nAucun endpoint de liste Awin ne repond.');
    console.log('Recupere la liste manuellement : Awin > Toolbox > Create-a-Feed');
    return null;
  }

  const rows = parseCsv(text, ',');
  console.log('\nFlux trouves : ' + rows.length);
  if (!rows.length) { console.log('Contenu brut :\n' + text.slice(0, 500)); return null; }
  console.log('Colonnes : ' + Object.keys(rows[0]).join(' | ') + '\n');

  const joined = rows.filter(r => {
    const s = (r['Membership Status'] || r['Membership status'] || '').toLowerCase();
    const reg = (r['Primary Region'] || r['Region'] || '').toUpperCase();
    const lang = (r['Language'] || '').toUpperCase();
    const isJoined = s.includes('active') || s.includes('joined') || !s;
    const isFr = reg.includes('FR') || reg.includes('FRANCE') || lang === 'FR' || (!reg && !lang);
    return isJoined && isFr;
  });
  console.log('Programmes actifs FR : ' + joined.length + '\n');

  const feeds = [], skipped = [];
  for (const row of joined) {
    const fid = row['Feed ID'] || row['feedId'] || row['Feed Id'];
    const name = row['Advertiser Name'] || row['advertiserName'] || row['Advertiser'];
    const count = parseInt(row['No of products'] || row['Products'] || '0', 10);
    if (!fid || !name) continue;
    if (count === 0) { skipped.push(name + ' (vide)'); continue; }

    const url = 'https://productdata.awin.com/datafeed/download/apikey/' + AWIN_API_KEY +
                '/language/fr/fid/' + fid + '/rid/0/hasEnhancedFeeds/0/columns/' + AWIN_COLUMNS +
                '/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/';

    process.stdout.write('  ' + name + ' (' + count + ') ... ');
    const t = await testFeed(url);
    if (!t.ok) { console.log('KO ' + t.status); skipped.push(name + ' (' + t.status + ')'); continue; }
    console.log('OK');

    const entry = { name: name, url: url, limit: count > 20000 ? 3000 : 5000 };
    const cat = guessCategory(name);
    if (cat) entry.category = cat;
    feeds.push(entry);
  }

  console.log('\n' + feeds.length + ' flux Awin valides');
  if (skipped.length) console.log('Ignores : ' + skipped.join(', '));
  console.log('\n>>> Secret AWIN_FEEDS :\n');
  console.log(JSON.stringify(feeds));
  return feeds;
}

async function discoverEffinity() {
  console.log('\n' + '='.repeat(70));
  console.log('EFFINITY');
  console.log('='.repeat(70));
  if (!EFFINITY_API_KEY) { console.log('EFFINITY_API_KEY manquant - ignore'); return null; }

  const base = 'https://api.effinity.fr/apiv3/';
  const resources = [
    'programs', 'program', 'programmes', 'campaigns', 'campaign',
    'productfeeds', 'product-feeds', 'product-output', 'productoutput',
    'feeds', 'catalogs', 'catalogues', 'partnerships', 'affiliations'
  ];

  const found = [];
  for (const r of resources) {
    const url = base + r + '/publisher?apikey=' + EFFINITY_API_KEY;
    process.stdout.write('  test /apiv3/' + r + '/publisher ... ');
    try {
      const res = await fetch(url);
      const body = await res.text();
      if (!res.ok) { console.log('HTTP ' + res.status); continue; }
      if (body.length < 30) { console.log('vide'); continue; }
      console.log('OK (' + body.length + ' octets)');
      found.push({ resource: r, body: body });
    } catch (e) { console.log('erreur: ' + e.message); }
  }

  if (!found.length) {
    console.log('\nAucun endpoint Effinity apiv3 ne repond.');
    console.log('Ouvre la doc dans ton navigateur pour voir les ressources disponibles :');
    console.log('https://api.effinity.fr/apiv3/documentation/publisher?apikey=***');
    return null;
  }

  for (const f of found) {
    console.log('\n' + '-'.repeat(60));
    console.log('/apiv3/' + f.resource + '/publisher');
    console.log('-'.repeat(60));
    console.log(f.body.slice(0, 1500));
  }
  console.log('\n>>> Envoie ces apercus a Claude pour generer EFFINITY_FEEDS');
  return found;
}

async function discoverCJ() {
  console.log('\n' + '='.repeat(70));
  console.log('COMMISSION JUNCTION');
  console.log('='.repeat(70));
  if (!CJ_TOKEN) {
    console.log('CJ_TOKEN manquant.');
    console.log('  1. Va sur https://developers.cj.com');
    console.log('  2. Authentication > Create Personal Access Token');
    console.log('  3. Ajoute les secrets GitHub CJ_TOKEN et CJ_PUBLISHER_ID');
    return null;
  }

  const query = '{ productFeeds(companyId: "' + CJ_PUBLISHER_ID + '") { resultList { adId feedName advertiserId advertiserName productCount language sourceCurrency } } }';

  try {
    const res = await fetch('https://ads.api.cj.com/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CJ_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query }),
    });
    if (!res.ok) { console.log('HTTP ' + res.status); console.log((await res.text()).slice(0, 400)); return null; }
    const data = await res.json();
    const list = (data && data.data && data.data.productFeeds && data.data.productFeeds.resultList) || [];
    console.log('Flux CJ trouves : ' + list.length);
    const fr = list.filter(f => (f.language || '').toLowerCase().indexOf('fr') === 0);
    console.log('Flux FR : ' + fr.length + '\n');
    for (const f of fr) console.log('  ' + f.advertiserName + ' | adId ' + f.adId + ' | ' + f.productCount + ' produits');
    console.log('\n>>> Envoie cette liste a Claude pour generer le sync CJ');
    return fr;
  } catch (e) { console.log('Erreur: ' + e.message); return null; }
}

async function main() {
  console.log('Decouverte multi-reseaux HiFind');
  const awin = await discoverAwin();
  await discoverEffinity();
  await discoverCJ();
  if (awin) {
    const fs = await import('fs');
    fs.writeFileSync('awin-feeds.json', JSON.stringify(awin, null, 2));
    console.log('\nawin-feeds.json sauvegarde');
  }
  console.log('\nTermine');
}

main().catch(e => { console.error('Erreur fatale: ' + e.message); process.exit(1); });
