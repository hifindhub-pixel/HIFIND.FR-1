// discover-feeds.js — Découvre automatiquement tous les flux Awin disponibles
// Usage: node scripts/discover-feeds.js
// Génère le JSON prêt à coller dans le secret AWIN_FEEDS

const AWIN_API_KEY = process.env.AWIN_API_KEY || '9286caa1eff7176a0a48abae76b26893';
const AWIN_PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || '2855063';

// Colonnes minimales (réduit la taille des flux et évite les crashs mémoire)
const COLUMNS = 'aw_deep_link,product_name,aw_product_id,merchant_image_url,search_price,merchant_name,brand_name,aw_image_url,currency,ean,product_GTIN';

// Mapping mot-clé → catégorie HiFind
const CATEGORY_RULES = [
  { keywords: ['pneu','auto','moto','carter','norauto','piece','garage','oscaro','feu vert','midas'], category: 'auto-moto' },
  { keywords: ['parfum','beaut','cosmet','maquillage','sephora','nocibe','marionnaud','coiffeur','clarins','perfum'], category: 'beaute-bienetre' },
  { keywords: ['tech','electro','informatique','pc ','ordinateur','smartphone','xiaomi','acer','asus','samsung','geekbuying','pixmania','ldlc','materiel'], category: 'high-tech' },
  { keywords: ['sport','foot','running','fitness','decathlon','intersport','snowleader','velo','bike'], category: 'sport-outdoor' },
  { keywords: ['mode','vetement','chaussure','sneaker','zalando','spartoo','sarenza','redoute','kiabi','celio'], category: 'mode-vetements' },
  { keywords: ['bebe','enfant','jouet','vertbaudet','oxybul','king jouet','toys'], category: 'enfants-bebes' },
  { keywords: ['maison','jardin','deco','meuble','conforama','but','ikea','castorama','leroy','electrolux','bosch'], category: 'maison-jardin' },
  { keywords: ['animal','animalerie','chien','chat','zooplus','croquette'], category: 'animaux' },
  { keywords: ['bio','alimentation','epicerie','greenweez','naturalia'], category: 'alimentation-bio' },
  { keywords: ['sante','pharma','nutrition','complement','parapharmacie'], category: 'sante-nutrition' },
];

function guessCategory(name) {
  const n = (name || '').toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => n.includes(k))) return rule.category;
  }
  return null; // pas de catégorie → sera déduite produit par produit
}

function buildFeedUrl(fid) {
  return 'https://productdata.awin.com/datafeed/download/apikey/' + AWIN_API_KEY +
         '/language/fr/fid/' + fid +
         '/rid/0/hasEnhancedFeeds/0/columns/' + COLUMNS +
         '/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/';
}

// Parse un CSV simple (la feed list Awin est propre)
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    // split en respectant les guillemets
    const cells = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] || '').trim(); });
    return obj;
  });
}

// Teste si un flux répond correctement (HEAD-like, on lit juste les premiers octets)
async function testFeed(url, name) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, status: res.status };
    // On annule le téléchargement dès qu'on a confirmé le 200
    res.body?.cancel?.();
    return { ok: true, status: 200 };
  } catch (e) {
    return { ok: false, status: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

async function main() {
  console.log('🔍 Récupération de la liste des flux Awin...\n');

  const listUrl = 'https://productdata.awin.com/datafeed/list/apikey/' + AWIN_API_KEY;
  const res = await fetch(listUrl);
  if (!res.ok) {
    console.error('❌ Impossible de récupérer la liste des flux. HTTP', res.status);
    console.error('   Vérifie AWIN_API_KEY.');
    process.exit(1);
  }

  const text = await res.text();
  const rows = parseCsv(text);
  console.log('📋 Flux trouvés au total :', rows.length, '\n');

  // Filtre : uniquement les programmes rejoints, région FR/EUR
  const joined = rows.filter(r => {
    const status = (r['Membership Status'] || r['Membership status'] || '').toLowerCase();
    const region = (r['Primary Region'] || r['Region'] || '').toUpperCase();
    const lang = (r['Language'] || '').toUpperCase();
    const isJoined = status.includes('active') || status.includes('joined');
    const isFr = region.includes('FR') || region.includes('FRANCE') || lang === 'FR' || (!region && !lang);
    return isJoined && isFr;
  });

  console.log('✅ Programmes rejoints (FR) :', joined.length, '\n');

  if (!joined.length) {
    console.log('⚠️ Aucun programme filtré. Colonnes disponibles dans la liste :');
    console.log('  ', Object.keys(rows[0] || {}).join(' | '));
    console.log('\n   Exemple de ligne :');
    console.log('  ', JSON.stringify(rows[0] || {}, null, 2));
    return;
  }

  const feeds = [];
  const skipped = [];

  for (const row of joined) {
    const fid = row['Feed ID'] || row['feedId'] || row['Feed Id'];
    const name = row['Advertiser Name'] || row['advertiserName'] || row['Advertiser'];
    const productCount = parseInt(row['No of products'] || row['Products'] || '0', 10);

    if (!fid || !name) continue;
    if (productCount === 0) { skipped.push(name + ' (0 produits)'); continue; }

    const url = buildFeedUrl(fid);
    process.stdout.write('  → ' + name + ' (fid ' + fid + ', ' + productCount + ' produits)... ');
    const test = await testFeed(url, name);

    if (!test.ok) {
      console.log('❌ HTTP', test.status);
      skipped.push(name + ' (HTTP ' + test.status + ')');
      continue;
    }
    console.log('✅');

    const entry = { name, url, limit: productCount > 20000 ? 3000 : 5000 };
    const cat = guessCategory(name);
    if (cat) entry.category = cat;
    feeds.push(entry);
  }

  console.log('\n' + '='.repeat(70));
  console.log('📦 ' + feeds.length + ' flux valides');
  if (skipped.length) {
    console.log('⏭️  ' + skipped.length + ' ignorés : ' + skipped.slice(0, 10).join(', ') + (skipped.length > 10 ? '…' : ''));
  }
  console.log('='.repeat(70));
  console.log('\n👉 Copie ce JSON dans le secret GitHub AWIN_FEEDS :\n');
  console.log(JSON.stringify(feeds));
  console.log('\n');

  // Sauvegarde aussi dans un fichier pour récupération facile
  const fs = await import('fs');
  fs.writeFileSync('awin-feeds.json', JSON.stringify(feeds, null, 2));
  console.log('💾 Également sauvegardé dans awin-feeds.json');
}

main().catch(e => { console.error('❌ Erreur:', e.message); process.exit(1); });
