import { loadAwinFeedList, awinFeedEntry } from './lib/awin-feed-list.js';
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
  console.log('AWIN — liste officielle des flux');
  const configured = JSON.parse(process.env.AWIN_FEEDS || '[]');
  const rows = await loadAwinFeedList({ apiKey:AWIN_API_KEY, feeds:configured });
  const configuredNames = new Set(configured.map(feed => feed.name.toLowerCase()));
  const feeds = [], skipped = [];
  for (const row of rows) {
    const entry = awinFeedEntry(row);
    if (!entry.id || !entry.name || !entry.url) continue;
    if (!['fr','french','français','francais'].includes(entry.language)) continue;
    if (!['joined','active'].includes(entry.membership) && !configuredNames.has(entry.name.toLowerCase())) continue;
    if (!(entry.count > 0)) continue;
    const check = await testFeed(entry.url);
    if (!check.ok) { skipped.push(entry.name); continue; }
    const feed = { name:entry.name, url:entry.url, limit:entry.count > 20000 ? 3000 : 5000 };
    const category = guessCategory(entry.name);
    if (category) feed.category = category;
    feeds.push(feed);
  }
  console.log(`${rows.length} flux visibles, ${feeds.length} flux français validés, ${skipped.length} indisponibles.`);
  // The download URLs contain credentials: save them to the existing artifact, never log them.
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
      catch (e) { console.log('Réponse Effinity non JSON.'); continue; }

      const list = Array.isArray(data) ? data : (data.feeds || data.productfeeds || data.data || []);
      console.log('  Flux trouves : ' + list.length);
      if (list.length) {
        console.log('  Champs : ' + Object.keys(list[0]).join(', ') + '\n');
        console.log('  Exemple :');
        console.log('  Données privées omises des journaux.');
        console.log('\n  Liste complete :');
        console.log(list.map(row => row.nomprogramme || row.nom || 'Flux').join(', '));
      } else {
        console.log('Aucun flux Effinity retourné.');
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
  let awin;
  for (const [network, discover] of [['Awin',discoverAwin],['Effinity',discoverEffinity],['CJ',discoverCJ]]) {
    try {
      const result = await discover();
      if (network === 'Awin') awin = result;
      if (result === null) { console.error(`::error::Découverte ${network} indisponible.`); process.exitCode = 1; }
    } catch(error) {
      console.error(`::error::Découverte ${network} : ${error.message}`);
      process.exitCode = 1;
    }
  }
  if (awin && awin.length) {
    const fs = await import('fs');
    fs.writeFileSync('awin-feeds.json', JSON.stringify(awin, null, 2));
    console.log('\nawin-feeds.json sauvegarde');
  }
  console.log('\nTermine');
}

main().catch(e => { console.error('Erreur fatale: ' + e.message); process.exit(1); });

