// HIFIND - Sync Affilae + Effinity -> Neon
const AFFILAE_TOKEN       = process.env.AFFILAE_TOKEN;
const NEON_URL            = process.env.NEON_URL;
const EFFINITY_FEEDS_JSON = process.env.EFFINITY_FEEDS;
const AFFILAE_BASE        = 'https://rest.affilae.com';

import { streamFeed, parseCSVLine } from './lib/stream-feed.js';
import { EanIndex, HarvestWriter, resetHarvest, harvestedPrograms, selectMatching, harvestDiskUsage } from './lib/ean-index.js';
import pkg from 'pg';
const { Client } = pkg;

let _neonClient = null;
async function getNeon() {
  if (!_neonClient) {
    _neonClient = new Client({ connectionString: NEON_URL });
    await _neonClient.connect();
  }
  return _neonClient;
}

const PAGE_SIZE           = 20;

const CATEGORY_RULES = [
  { cat: 'beaute-bienetre', keywords: ['beauté','soin','crème','sérum','shampoing','cosmétique','parfum','visage','corps','cheveux','peau','maquillage','hydrat','collagène','démêlant','nettoyant','pieds','pied'] },
  { cat: 'sante-nutrition', keywords: ['santé','complément','vitamine','minéral','probiotique','magnésium','protéine','immunit','énergie','fatigue','sommeil','stress','minceur','détox','nutrition','aromathérapie','huile essentielle','gélule','capsule','spray','roll-on'] },
  { cat: 'mode-vetements',  keywords: ['mode','vêtement','robe','pantalon','jean','chemise','veste','manteau','pull','t-shirt','chaussure','basket','sneaker','sac','bijou','montre','lingerie','fashion'] },
  { cat: 'maison-jardin',   keywords: ['maison','jardin','déco','meuble','cuisine','ménager','aspirateur','plante','graine','potager','terrasse','outil','jardinage','arrosage','fleur'] },
  { cat: 'alimentation-bio',keywords: ['alimentation','bio','nourriture','snack','boisson','thé','café','superaliment','céréale','vegan','sans gluten','organic','épicerie','miel'] },
  { cat: 'sante-nutrition',     keywords: ['cbd','chanvre','cannabis','hemp','cannabidiol','fleur cbd','huile cbd'] },
  { cat: 'enfants-bebes',   keywords: ['enfant','bébé','baby','jouet','jeu','puériculture','poussette','couche','biberon','apprentissage','éveil'] },
  { cat: 'sport-outdoor',   keywords: ['sport','fitness','musculation','yoga','running','vélo','natation','randonnée','camping','outdoor','gym','trail','ski','tennis','football'] },
  { cat: 'high-tech',       keywords: ['tech','électronique','smartphone','téléphone','ordinateur','laptop','tablette','casque','écouteur','drone','smart','bluetooth','gaming','console'] },
  { cat: 'animaux',         keywords: ['animal','animaux','chien','chat','oiseau','poisson','lapin','croquette','litière','collier','aquarium'] },
  { cat: 'auto-moto',       keywords: ['auto','moto','voiture','véhicule','scooter','pièce auto','pneu','huile moteur','gps','tuning'] },
];

const EAN_INDEX = new EanIndex();
const PROGRAM_META = new Map();   // programId -> { title, category }

const FEED_REPORT = { ok: [], empty: [], failed: [] };
function reportFeed(name, count, err) {
  if (err) FEED_REPORT.failed.push(name + ' (' + err + ')');
  else if (!count) FEED_REPORT.empty.push(name);
  else FEED_REPORT.ok.push(name + ' (' + count + ')');
}

function detectCategory(product) {
  const text = [product.title||'', product.description||'', (product.program&&product.program.title)||''].join(' ').toLowerCase();
  let bestCat = null, bestScore = 0;
  for (const rule of CATEGORY_RULES) {
    const score = rule.keywords.filter(kw => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestCat = rule.cat; }
  }
  return bestCat || 'autres';
}

function fixEncoding(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str
    .replace(/Ã©/g, 'é').replace(/Ã¨/g, 'è').replace(/Ãª/g, 'ê').replace(/Ã«/g, 'ë')
    .replace(/Ã /g, 'à').replace(/Ã¢/g, 'â').replace(/Ã¤/g, 'ä').replace(/Ã¦/g, 'æ')
    .replace(/Ã®/g, 'î').replace(/Ã¯/g, 'ï').replace(/Ã´/g, 'ô').replace(/Ã¶/g, 'ö')
    .replace(/Ã¹/g, 'ù').replace(/Ã»/g, 'û').replace(/Ã¼/g, 'ü').replace(/Ã§/g, 'ç')
    .replace(/Ã‰/g, 'É').replace(/Ã€/g, 'À').replace(/Ã‡/g, 'Ç').replace(/Ã"/g, 'Ó')
    .replace(/Ã˜/g, 'Ø').replace(/Ã±/g, 'ñ').replace(/Ã³/g, 'ó').replace(/Ã¿/g, 'ÿ')
    .replace(/â€™/g, "'").replace(/â€œ/g, '"').replace(/â€/g, '"').replace(/â€¦/g, '…')
    .replace(/â€"/g, '–').replace(/â€"/g, '—').replace(/Â°/g, '°').replace(/Â«/g, '«')
    .replace(/Â»/g, '»').replace(/Â©/g, '©').replace(/Â®/g, '®').replace(/Âµ/g, 'µ')
    .replace(/Ã¥/g, 'å').replace(/Ã/g, 'Â');
}

function extractEAN(val) {
  if (!val) return null;
  // Prend le premier code numérique valide (8-14 chiffres)
  const parts = String(val).split(/[\s,;|]+/);
  for (const part of parts) {
    const clean = part.trim().replace(/\.0$/, '');
    if (/^\d{8,14}$/.test(clean)) return clean;
  }
  return null;
}

function cleanTitle(str) {
  if (!str || typeof str !== 'string') return '';
  return fixEncoding(str)
    .replace(/\s*-\s*null\s*-\s*/gi, ' - ')
    .replace(/^null\s*-\s*/gi, '')
    .replace(/\s*-\s*null$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function supabaseUpsert(table, rows) {
  if (!rows || rows.length === 0) return;
  const client = await getNeon();
  const BATCH = 50;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    if (table === 'programs') {
      const vals = batch.map((row, j) => {
        const b = j * 5;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5})`;
      }).join(',');
      const params = batch.flatMap(row => [
        row.id, row.title,
        JSON.stringify(row.categories||[]),
        JSON.stringify(row.countries||[]),
        row.updated_at||new Date().toISOString()
      ]);
      await client.query(`
        INSERT INTO programs (id,title,categories,countries,updated_at) VALUES ${vals}
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, updated_at=EXCLUDED.updated_at
      `, params);

    } else if (table === 'products') {
      const vals = batch.map((row, j) => {
        const b = j * 16;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16})`;
      }).join(',');
      const params = batch.flatMap(row => [
        row.id, row.affilae_id||row.id, row.program_id,
        row.title, row.description||null, row.price||null,
        row.currency||'EUR', row.url||null, row.tracking_id||null,
        row.image_url||null, row.category||'autres', row.lang||'fr',
        row.status||'enabled', row.ean||null, row.brand||null,
        row.updated_at||new Date().toISOString()
      ]);
      await client.query(`
        INSERT INTO products (id,affilae_id,program_id,title,description,price,currency,url,tracking_id,image_url,category,lang,status,ean,brand,updated_at)
        VALUES ${vals}
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,price=EXCLUDED.price,ean=EXCLUDED.ean,brand=EXCLUDED.brand,image_url=EXCLUDED.image_url,url=EXCLUDED.url,updated_at=EXCLUDED.updated_at
      `, params);
    }
  }
}

async function syncAffilae() {
  console.log('🔄 Affilae sync...');
  let offset = 0, all = [];
  while (true) {
    const res = await fetch(AFFILAE_BASE + '/publisher/products.list?limit=' + PAGE_SIZE + '&offset=' + offset, {
      headers: { 'Authorization': 'Bearer ' + AFFILAE_TOKEN }
    });
    const data = await res.json();
    const items = data.data || [];
    if (!items.length) break;
    if (all.length === 0) console.log('Affilae total count:', data.count);
    all = all.concat(items);
    console.log('Fetched', all.length, '/', data.count);
    if (all.length >= data.count) break;
    offset += PAGE_SIZE;
  }

  const programsMap = {};
  all.forEach(p => {
    if (p.program && p.program.id) {
      programsMap[p.program.id] = { id: p.program.id, title: p.program.title, categories: p.program.categories||[], countries: p.program.countries||[], updated_at: new Date().toISOString() };
    }
  });
  await supabaseUpsert('programs', Object.values(programsMap));

  const mapped = all.map(p => ({
    id: p.id, affilae_id: p.id, program_id: p.program ? p.program.id : null,
    title: p.title||'', description: p.description||null,
    price: p.price ? p.price/100 : null, currency: 'EUR',
    url: p.url||null, tracking_id: p.trackingId||null,
    image_url: p.images&&p.images[0] ? p.images[0].url : null,
    category: detectCategory(p), lang: p.lang||'fr',
    status: 'enabled', updated_at: new Date().toISOString()
  }));

  const cats = {};
  mapped.forEach(p => { cats[p.category] = (cats[p.category]||0)+1; });
  console.log('📊', JSON.stringify(cats));

  for (let i = 0; i < mapped.length; i += 50) {
    await supabaseUpsert('products', mapped.slice(i, i+50));
    console.log('✅ Products', i+Math.min(50,mapped.length-i), '/', mapped.length);
  }
  console.log('🎉 Affilae done:', mapped.length);
}

// Décodage robuste : Buffer.toString() supporte les gros volumes,
// contrairement à TextDecoder qui plante au-delà de ~50 Mo.
const MAX_FEED_BYTES = 250 * 1024 * 1024;
function decodeFeed(arrayBuffer, label) {
  let buf = Buffer.from(arrayBuffer);
  if (buf.length > MAX_FEED_BYTES) {
    console.log('  \u26a0\ufe0f ' + label + ' tronqu\u00e9 : ' + Math.round(buf.length / 1e6) + ' Mo \u2192 250 Mo');
    buf = buf.subarray(0, MAX_FEED_BYTES);
  }
  const head = buf.subarray(0, 400).toString('latin1');
  const declaredIso = /iso-8859|windows-1252/i.test(head);
  try {
    if (declaredIso) return buf.toString('latin1');
    const utf8 = buf.toString('utf8');
    // Trop de caractères de remplacement => ce n'était pas de l'UTF-8
    const sample = utf8.slice(0, 50000);
    const bad = (sample.match(/\uFFFD/g) || []).length;
    if (bad > 20) return buf.toString('latin1');
    return utf8;
  } catch (e) {
    try { return buf.toString('latin1'); }
    catch (e2) { console.log('  \u274c ' + label + ' : d\u00e9codage impossible (' + e2.message + ')'); return ''; }
  }
}

async function syncEffinity() {
  console.log('🔄 Effinity sync...');
  if (!EFFINITY_FEEDS_JSON) { console.log('⚠️ EFFINITY_FEEDS missing'); return; }
  let feeds;
  try { feeds = JSON.parse(EFFINITY_FEEDS_JSON); } catch(e) { console.log('❌ JSON invalide'); return; }

  for (const feed of feeds) {
    try {
      const feedLimit = feed.limit || 200;
      console.log('  →', feed.name, '(limit:', feedLimit, ')');

      const products = [];
      const seen = new Set();

      // Mapping XML → produit (inchangé)
      const mapXmlItem = (item) => {
        const get = tag => {
          const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const m = item.match(new RegExp('<' + escaped + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/' + escaped + '>', 'i'));
          return m ? (m[1]||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim() : '';
        };
        return {
          title:       cleanTitle(get('title')||get('name')||get('nomproduit')||get('designation')),
          description: fixEncoding(get('description')||get('custom_label_0')||get('descriptif')||''),
          price:       parseFloat((get('price')||get('sale_price')||get('prix')||get('prixttc')||'0').replace(',','.')),
          url:         get('link')||get('url')||get('urlproduit')||get('lien'),
          image_url:   get('image_link')||get('image')||get('photo')||get('urlimage')||get('image1'),
          brand:       get('brand')||get('marque')||get('fabricant')||'',
          feed_cat:    get('category_level2')||get('category_level1')||get('category')||get('rayon')||get('categorie')||'',
          product_id:  get('id')||get('item_id')||get('idproduit')||get('codebarre')||'',
          ean:         extractEAN(get('gtin')||get('ean')||get('barcode')||get('codebarre')),
        };
      };

      // Mapping CSV → produit (inchangé)
      const mapCsvRow = (obj) => {
        const rawUrl = obj.link || obj.url || obj.product_url || obj.deeplink || obj.tracking_url
                     || obj.lien || obj.url_produit || obj.producturl || obj.landing_page
                     || obj.aw_deep_link || obj.affiliate_link || obj.click_url || '';
        const rawPrice = obj.price || obj.sale_price || obj.prix || obj.prix_ttc
                       || obj.current_price || obj.price_ttc || obj.montant || '0';
        const rawImg = obj.image_link || obj.image || obj.image_url || obj.url_image
                     || obj.picture || obj.photo || obj.main_image || '';
        return {
          title: cleanTitle(obj.title || obj.name || obj.nom || obj.product_name || obj.designation || obj.libelle || ''),
          description: fixEncoding(obj.description || obj.short_desc || ''),
          price: parseFloat(String(rawPrice).replace(/[^\d.,-]/g,'').replace(',','.') || '0'),
          url: rawUrl,
          image_url: rawImg,
          feed_cat: obj.category_level2 || obj.category_level1 || obj.category || obj.categorie || obj.product_type || '',
          product_id: obj.id || obj.item_id || obj.reference || obj.sku || '',
          ean: extractEAN(obj.gtin || obj.ean || obj.ean13 || obj.barcode || obj.code_barre || obj.mpn || ''),
          brand: obj.brand || obj.marque || obj.fabricant || obj.brand_name || ''
        };
      };

      const programId = 'effinity_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g,'_');
      PROGRAM_META.set(programId, { title: feed.name, category: feed.category });
      const writer = new HarvestWriter(programId);

      const collect = (p) => {
        if (!p.title || !p.url || !p.ean) return true;
        const key = p.ean + '_' + p.price;
        if (seen.has(key)) return true;
        seen.add(key);
        p.program_id = programId;
        p.feed_name = feed.name;
        p.feed_category = feed.category || null;
        writer.write(p);
        EAN_INDEX.add(p.ean, programId);
        return true;   // on lit le catalogue en entier
      };

      let firstSample = null;
      const stat = await streamFeed(feed.url, {
        label: feed.name,
        onHeaders: (headers) => { console.log('  Colonnes:', headers.length); },
        onRecord: (rec) => {
          const p = typeof rec === 'string' ? mapXmlItem(rec) : mapCsvRow(rec);
          if (!firstSample) firstSample = p;
          return collect(p);
        },
      });

      console.log('  Format:', stat.format, '| encodage:', stat.encoding,
                  '|', Math.round(stat.bytes/1e6*10)/10, 'Mo lus',
                  stat.stopped ? '(arret anticipe)' : '');
      if (firstSample) {
        console.log('  Echantillon -> title=' + JSON.stringify((firstSample.title||'').slice(0,50))
          + ' | link=' + JSON.stringify((firstSample.url||'').slice(0,60))
          + ' | price=' + firstSample.price);
      } else {
        console.log('  \u26a0\ufe0f aucune ligne de donnees exploitable');
      }
      await writer.close();
      console.log('  📦', feed.name, ':', writer.count, 'lignes recoltees ('
                  + writer.skippedNoEan + ' sans EAN ignorees)');
      reportFeed(feed.name, writer.count);

    } catch(e) { console.log('  ⚠️', feed.name, ':', e.message, '\n  Stack:', e.stack?.split('\n')[1]?.trim()); }
  }
  console.log('🎉 Effinity done');
}

// ══ BCD JEUX (BeezUP) ══
async function syncBCDJeux() {
  console.log('🔄 BCD Jeux sync...');
  const url = 'http://export.beezup.com/BCD_Jeux/Comparateur_BeezUP_CSV_2_FRA/8b4995eb-85a8-5258-ac4e-08fc6d3d39ed';
  const programId = 'bcdjeux';
  const AFFILIATE_CODE = '#ae=448';
  const LIMIT = 500;

  try {
    const res = await fetch(url);
    if (!res.ok) { console.log('  ❌ BCD Jeux:', res.status); return; }
    const buffer = await res.arrayBuffer();
    let text;
    text = decodeFeed(buffer, 'flux');

    const lines = text.split('\n').filter(l => l.trim());
    // Détecte séparateur
    const sep = lines[0].includes(';') ? ';' : ',';
    // Format: ID;EAN;Nom;Fabricant;Prix;SKU;Stock;Qte;URL;Image;Image2;Categorie;CatRacine;Origine
    const products = [];
    const seen = new Set();

    for (const line of lines.slice(1)) {
      const cols = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
      if (cols.length < 9) continue;
      const [id, ean, nom, fabricant, prix, sku, stock, qte, urlProd, image, , categorie] = cols;
      if (!nom || !urlProd) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      // Ajoute le code affilié à la fin de l'URL
      const trackUrl = urlProd + AFFILIATE_CODE;

      products.push({
        id:          'bcdjeux_' + id,
        title:       cleanTitle(nom),
        price:       parseFloat(prix.replace(',', '.')) || null,
        url:         trackUrl,
        image_url:   image || null,
        category:    'enfants-bebes', // BCD Jeux = jeux/jouets
        brand:       fabricant || 'BCD Jeux',
        ean:         ean || null,
      });
      if (products.length >= LIMIT) break;
    }

    console.log('  📦 BCD Jeux:', products.length, 'produits');

    await supabaseUpsert('programs', [{
      id: programId, title: 'BCD Jeux', categories: [], countries: ['FR'],
      updated_at: new Date().toISOString()
    }]);

    const mapped = products.map(p => ({
      id:          p.id,
      affilae_id:  p.id,
      program_id:  programId,
      title:       p.title,
      description: null,
      price:       p.price,
      currency:    'EUR',
      url:         p.url,
      tracking_id: null,
      image_url:   p.image_url,
      category:    p.category,
      lang:        'fr',
      status:      'enabled',
      updated_at:  new Date().toISOString()
    }));

    for (let i = 0; i < mapped.length; i += 50) await supabaseUpsert('products', mapped.slice(i, i+50));
    console.log('  ✅ BCD Jeux:', mapped.length, 'insérés');
    reportFeed('BCD Jeux', mapped.length);

  } catch(e) {
    console.log('  ⚠️ BCD Jeux:', e.message);
  }
  console.log('🎉 BCD Jeux done');
}
const RAKUTEN_COUNTER = '23254453';
const RAKUTEN_BASE    = 'https://priceminister.effiliation.com/pm/api.html';

const RAKUTEN_SEARCHES = [
  { kw: 'robe',          cat: 'mode-vetements',   nav: 'Mode'        },
  { kw: 'chaussures',    cat: 'mode-vetements',   nav: 'Mode'        },
  { kw: 'vélo',          cat: 'sport-outdoor',    nav: 'Loisirs'     },
  { kw: 'crème visage',  cat: 'beaute-bienetre',  nav: 'Soins-Beaute'},
  { kw: 'aspirateur',    cat: 'maison-jardin',    nav: 'Maison'      },
  { kw: 'smartphone',    cat: 'high-tech',        nav: 'Informatique'},
  { kw: 'casque audio',  cat: 'high-tech',        nav: 'Hifi'        },
  { kw: 'jouet enfant',  cat: 'enfants-bebes',    nav: 'Enfant'      },
  { kw: 'cafetière',     cat: 'maison-jardin',    nav: 'Electromenager'},
  { kw: 'pneu voiture',  cat: 'auto-moto',        nav: 'auto-moto'   },
  { kw: 'croquettes',    cat: 'animaux',          nav: 'Animalerie'  },
];

function parseRakutenXML(xml) {
  const products = [];
  const regex = /<product>([\s\S]*?)<\/product>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const item = match[1];
    const get = tag => { const m = item.match(new RegExp('<'+tag+'[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</'+tag+'>','i')); return m?(m[1]||'').trim():''; };
    const getDeep = (tag1, tag2) => { const block = item.match(new RegExp('<'+tag1+'>[\\s\\S]*?<\\/'+tag1+'>','i')); return block ? (block[0].match(new RegExp('<'+tag2+'[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</'+tag2+'>','i'))||[])[1]||'' : ''; };

    const title = cleanTitle(get('headline'));
    const url   = get('url');
    const price = parseFloat(getDeep('advertprice','amount')||'0');
    // Image : extrait l'URL réelle depuis le redirect Effinity
    const imgRedirect = getDeep('image','url');
    const imgMatch = imgRedirect.match(/url=([^&]+)/);
    const image_url = imgMatch ? decodeURIComponent(imgMatch[1]) : '';

    if (!title || !url) continue;
    products.push({
      id:          'rakuten_' + get('productid'),
      title,
      price,
      url,
      image_url,
      category:    get('category'),
      brand:       get('caption'),
      product_id:  get('productid'),
    });
  }
  return products;
}

async function syncRakuten() {
  console.log('🔄 Rakuten sync...');
  const programId = 'rakuten_priceminister';

  await supabaseUpsert('programs', [{
    id: programId, title: 'Rakuten', categories: [], countries: ['FR'],
    updated_at: new Date().toISOString()
  }]);

  let totalInserted = 0;

  for (const search of RAKUTEN_SEARCHES) {
    try {
      const url = RAKUTEN_BASE + '?id_compteur=' + RAKUTEN_COUNTER +
                  '&kw=' + encodeURIComponent(search.kw) +
                  '&nav=' + encodeURIComponent(search.nav) +
                  '&nbproductsperpage=50&pagenumber=1';

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) { console.log('  ❌ Rakuten', catConfig.nav, res.status); continue; }
      const text = await res.text();
      const products = parseRakutenXML(text);

      const mapped = products.map(p => ({
        id:          p.id,
        affilae_id:  p.id,
        program_id:  programId,
        title:       p.title,
        description: null,
        price:       p.price || null,
        currency:    'EUR',
        url:         p.url,
        tracking_id: null,
        image_url:   p.image_url || null,
        category:    search.cat,
        lang:        'fr',
        status:      'enabled',
        updated_at:  new Date().toISOString()
      }));

      if (mapped.length > 0) {
        await supabaseUpsert('products', mapped);
        totalInserted += mapped.length;
        console.log('  ✅ Rakuten "'+search.kw+'" :', mapped.length, 'produits');
      }
    } catch(e) {
      console.log('  ⚠️ Rakuten "'+search.kw+'" :', e.message);
    }
  }
  console.log('🎉 Rakuten done:', totalInserted, 'produits');
}

async function syncAffilaeFeeds() {
  console.log('🔄 Affilae Feeds sync...');
  const AFFILAE_FEEDS_JSON = process.env.AFFILAE_FEEDS;
  if (!AFFILAE_FEEDS_JSON) { console.log('⚠️ AFFILAE_FEEDS missing'); return; }

  let feeds;
  try { feeds = JSON.parse(AFFILAE_FEEDS_JSON); } catch(e) { console.log('❌ AFFILAE_FEEDS JSON invalide'); return; }

  for (const feed of feeds) {
    try {
      const feedLimit = feed.limit || 2000;
      console.log('  →', feed.name, '(limit:', feedLimit, ')');

      const products = [];
      const seen = new Set();

      const mapXml = (item) => {
        const get = tag => {
          const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const m = item.match(new RegExp('<' + escaped + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/' + escaped + '>', 'i'));
          return m ? (m[1]||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim() : '';
        };
        return {
          title: cleanTitle(get('title')||get('Titre')||get('name')||get('g:title')||''),
          price: parseFloat((get('price')||get('n_price')||get('Prix')||get('g:price')||get('sale_price')||'0').replace(/[^\d.,]/g,'').replace(',','.')),
          url: get('link')||get('Landing_page')||get('g:link')||get('url')||'',
          image_url: get('image_link')||get('n_image_link')||get('g:image_link')||get('image')||'',
          ean: extractEAN(get('gtin')||get('ean')||get('EAN')||get('g:gtin')||''),
          brand: get('brand')||get('Marque')||get('g:brand')||'',
          product_id: get('id')||get('g:id')||get('item_id')||'',
        };
      };

      const mapCsv = (obj) => {
        const pneuTitle = obj.marque && obj.profil
          ? (obj.marque+' '+obj.profil+' '+obj.largeur+'/'+obj.hauteur+'R'+obj.diametre) : '';
        return {
          title: cleanTitle(pneuTitle||obj.title||obj.titre||obj.nom||obj.name||obj.product_name||''),
          price: parseFloat(String(obj.prix||obj.price||obj.prix_ttc||obj.sale_price||'0').replace(/[^\d.,]/g,'').replace(',','.')),
          url: obj.link||obj.url_produit||obj.url||obj.lien||obj.product_url||'',
          image_url: obj.image_link||obj.url_image||obj.image||obj.img||'',
          ean: extractEAN(obj.ean||obj.gtin||obj.ean13||obj.code_barre||''),
          brand: obj.brand||obj.marque||obj.fabricant||'',
          product_id: obj.id||obj.product_id||obj.reference||'',
        };
      };

      const programId = 'affilae_feed_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g,'_');
      PROGRAM_META.set(programId, { title: feed.name, category: feed.category });
      const writer = new HarvestWriter(programId);

      const collect = (p) => {
        if (!p.title || !p.url || !(p.price > 0) || !p.ean) return true;
        const key = p.ean + '_' + p.price;
        if (seen.has(key)) return true;
        seen.add(key);
        p.program_id = programId;
        p.feed_name = feed.name;
        p.feed_category = feed.category || null;
        writer.write(p);
        EAN_INDEX.add(p.ean, programId);
        return true;
      };

      let firstSample = null;
      const stat = await streamFeed(feed.url, {
        label: feed.name,
        sep: feed.separator,
        normalizeHeader: h => h.trim().replace(/^"|"$/g,'').toLowerCase().replace(/[\s\-\/]+/g,'_'),
        onHeaders: (headers, sep) => console.log('  Colonnes:', headers.length, '| sep:', JSON.stringify(sep)),
        onRecord: (rec) => {
          const p = typeof rec === 'string' ? mapXml(rec) : mapCsv(rec);
          if (!firstSample) firstSample = p;
          return collect(p);
        },
      });

      console.log('  Format:', stat.format, '| encodage:', stat.encoding,
                  '|', Math.round(stat.bytes/1e6*10)/10, 'Mo lus',
                  stat.stopped ? '(arret anticipe)' : '');

      await writer.close();
      console.log('  📦', feed.name, ':', writer.count, 'lignes recoltees ('
                  + writer.skippedNoEan + ' sans EAN ignorees)');
      reportFeed(feed.name, writer.count);

    } catch(e) { console.log('  ⚠️', feed.name, ':', e.message); }
  }
  console.log('🎉 Affilae Feeds done');
}

async function syncAwin() {
  console.log('🔄 Awin sync...');
  const AWIN_FEEDS_JSON = process.env.AWIN_FEEDS;
  if (!AWIN_FEEDS_JSON) { console.log('⚠️ AWIN_FEEDS missing'); return; }

  let feeds;
  try { feeds = JSON.parse(AWIN_FEEDS_JSON); } catch(e) { console.log('❌ AWIN_FEEDS JSON invalide'); return; }

  for (const feed of feeds) {
    try {
      const feedLimit = feed.limit || 2000;
      console.log('  →', feed.name, '(limit:', feedLimit, ')');

      // Normalise les noms de vendeurs splittes AVANT la recolte
      let feedDisplayName = feed.name;
      if (feed.name.match(/^Rue du Commerce [A-Z]/)) feedDisplayName = 'Rue du Commerce';
      if (feed.name.match(/^Rakuten FR\d/)) feedDisplayName = 'Rakuten';
      if (feed.name.match(/^AliExpress [A-Z]/)) feedDisplayName = 'AliExpress';
      if (feed.name.match(/^ManoMano [A-Z]/)) feedDisplayName = 'ManoMano';
      if (feed.name.match(/^Whirlpool [A-Z]/)) feedDisplayName = 'Whirlpool';
      const programId = 'awin_' + feedDisplayName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      PROGRAM_META.set(programId, { title: feedDisplayName, category: feed.category });
      const writer = new HarvestWriter(programId);

      const seen = new Set();
      let firstSample = null;

      const stat = await streamFeed(feed.url, {
        label: feed.name,
        normalizeHeader: h => h.trim().replace(/^"|"$/g,'').toLowerCase().replace(/\s+/g,'_'),
        onHeaders: (headers, sep) => console.log('  Colonnes:', headers.length, '| sep:', JSON.stringify(sep)),
        onRecord: (obj) => {
          const title = cleanTitle(obj.product_name || obj.name || obj.title || '');
          const url = obj.aw_deep_link || obj.merchant_deep_link || obj.url || '';
          const price = parseFloat(obj.search_price || obj.store_price || obj.price || '0');
          const image = obj.aw_image_url || obj.merchant_image_url || obj.large_image || '';
          const ean = extractEAN(obj.ean || obj.product_gtin || obj.upc || obj.isbn || '');
          const brand = obj.brand_name || obj.brand || '';
          const productId = obj.aw_product_id || obj.merchant_product_id || '';

          if (!title || !url || !(price > 0) || !ean) return true;
          const key = ean + '_' + price;
          if (seen.has(key)) return true;
          seen.add(key);
          const p = { title, url, price, image_url: image, ean, brand, product_id: productId,
                      program_id: programId, feed_name: feedDisplayName,
                      feed_category: feed.category || null };
          if (!firstSample) firstSample = p;
          writer.write(p);
          EAN_INDEX.add(ean, programId);
          return true;
        },
      });

      console.log('  Format:', stat.format, '| encodage:', stat.encoding,
                  '|', Math.round(stat.bytes/1e6*10)/10, 'Mo lus',
                  stat.stopped ? '(arret anticipe)' : '');

      await writer.close();
      console.log('  📦', feedDisplayName, ':', writer.count, 'lignes recoltees ('
                  + writer.skippedNoEan + ' sans EAN ignorees)');
      reportFeed(feed.name, writer.count);

    } catch(e) { console.log('  ⚠️', feed.name, ':', e.message); }
  }
  console.log('🎉 Awin done');
}

async function syncAliExpress() {
  console.log('🔄 AliExpress sync...');
  const APP_KEY = '532344';
  const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET;
  if (!APP_SECRET) { console.log('⚠️ ALIEXPRESS_APP_SECRET missing'); return; }

  const crypto = await import('crypto');

  function sign(params, secret) {
    const sorted = Object.keys(params).sort().map(k => k + params[k]).join('');
    return crypto.createHmac('md5', secret).update(sorted).digest('hex').toUpperCase();
  }

  async function aliCall(method, extraParams) {
    const params = {
      method,
      app_key: APP_KEY,
      timestamp: new Date().toISOString().replace('T',' ').slice(0,19),
      sign_method: 'hmac',
      v: '2.0',
      format: 'json',
      ...extraParams
    };
    params.sign = sign(params, APP_SECRET);
    const url = 'https://api-sg.aliexpress.com/sync?' + new URLSearchParams(params).toString();
    const res = await fetch(url);
    return await res.json();
  }

  const categories = [
    { keywords: 'parfum femme', cat: 'beaute-bienetre' },
    { keywords: 'casque bluetooth', cat: 'high-tech' },
    { keywords: 'montre connectee', cat: 'high-tech' },
    { keywords: 'chaussures sport', cat: 'sport-outdoor' },
    { keywords: 'soin visage', cat: 'beaute-bienetre' },
    { keywords: 'pneu voiture', cat: 'auto-moto' },
    { keywords: 'vetement homme', cat: 'mode-vetements' },
    { keywords: 'jouet enfant', cat: 'enfants-bebes' },
  ];

  let total = 0;
  const programId = 'aliexpress';
  await supabaseUpsert('programs', [{ id:programId, title:'AliExpress', categories:[], countries:['FR'], updated_at:new Date().toISOString() }]);

  for (const { keywords, cat } of categories) {
    try {
      // Try hot products first
      const data = await aliCall('aliexpress.affiliate.hotproduct.query', {
        keywords,
        target_currency: 'EUR',
        target_language: 'FR',
        page_no: '1',
        page_size: '50',
        tracking_id: 'hifind_fr',
        fields: 'product_id,product_title,target_sale_price,target_original_price,product_main_image_url,promotion_link,evaluate_rate,lastest_volume',
      });

      const resp = data?.aliexpress_affiliate_hotproduct_query_response?.resp_result;
      if (!resp || resp.resp_code !== 200) {
        console.log('  ⚠️ AliExpress "'+keywords+'" :', resp?.resp_msg || 'erreur');
        continue;
      }

      const items = resp.result?.products?.product || [];
      if (!items.length) { console.log('  ⚠️ AliExpress "'+keywords+'" : 0 résultats'); continue; }

      const products = items.map((p, i) => ({
        id: (programId + '_' + (p.product_id || i)).replace(/[^a-z0-9_]/gi,'_').slice(0,100),
        affilae_id: programId + '_' + (p.product_id || i),
        program_id: programId,
        title: cleanTitle(p.product_title || ''),
        price: parseFloat(p.target_sale_price || p.target_original_price || 0),
        currency: 'EUR',
        url: p.promotion_link || '',
        image_url: p.product_main_image_url || '',
        brand: null, ean: null,
        category: cat,
        lang: 'fr', status: 'enabled',
        updated_at: new Date().toISOString()
      })).filter(p => p.title && p.url && p.price > 0);

      await supabaseUpsert('products', products);
      total += products.length;
      console.log('  ✅ AliExpress "'+keywords+'" :', products.length, 'produits');
    } catch(e) {
      console.log('  ⚠️ AliExpress "'+keywords+'" :', e.message);
    }
  }
  console.log('🎉 AliExpress done:', total, 'produits');
}


async function syncCJ() {
  console.log('\ud83d\udd04 CJ sync...');
  const CJ_TOKEN = process.env.CJ_TOKEN;
  const CJ_PUBLISHER_ID = process.env.CJ_PUBLISHER_ID;
  if (!CJ_TOKEN || !CJ_PUBLISHER_ID) { console.log('  CJ_TOKEN/CJ_PUBLISHER_ID manquant'); return; }

  let feeds;
  try { feeds = JSON.parse(process.env.CJ_FEEDS || '[]'); }
  catch (e) { console.log('  CJ_FEEDS JSON invalide'); return; }
  if (!feeds.length) { console.log('  CJ_FEEDS vide'); return; }

  async function cjQuery(query) {
    const res = await fetch('https://ads.api.cj.com/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CJ_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query })
    });
    const body = await res.text();
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + body.slice(0, 300));
    const data = JSON.parse(body);
    if (data.errors) throw new Error(JSON.stringify(data.errors).slice(0, 400));
    return data.data;
  }

  // Le champ gtin vit sur le type concret Shopping, pas sur l'interface Product.
  // On essaie plusieurs jeux de champs, du plus riche au plus minimal.
  const CJ_FIELD_SETS = [
    'id title description link imageLink price { amount currency } salePrice { amount currency } brand availability ... on Shopping { gtin mpn }',
    'id title link imageLink price { amount currency } ... on Shopping { gtin mpn brand availability salePrice { amount currency } }',
    'id title link imageLink price { amount currency } brand',
    'id title link imageLink price { amount currency }'
  ];
  let CJ_FIELDS = null;

  for (const fs of CJ_FIELD_SETS) {
    const probe = '{ products(companyId: "' + CJ_PUBLISHER_ID + '", partnerIds: ["' + (feeds[0].advertiserId || feeds[0].adId) + '"], limit: 1, offset: 0) { totalCount resultList { ' + fs + ' } } }';
    try { await cjQuery(probe); CJ_FIELDS = fs; console.log('  \u2705 jeu de champs retenu'); break; }
    catch (e) { console.log('  \u21bb champs refuses: ' + e.message.slice(0, 160)); }
  }

  if (!CJ_FIELDS) {
    console.log('\n  \ud83d\udd0d Introspection du schema CJ pour identifier les champs disponibles :');
    try {
      const intro = await cjQuery('{ __type(name: "Product") { kind name fields { name } possibleTypes { name fields { name } } } }');
      console.log(JSON.stringify(intro, null, 2).slice(0, 3000));
    } catch (e) { console.log('  introspection impossible: ' + e.message.slice(0, 200)); }
    console.log('\n  >>> Envoie ce bloc a Claude pour corriger la requete.');
    return;
  }

  for (const feed of feeds) {
    const limit = feed.limit || 3000;
    const partnerId = feed.advertiserId || feed.adId;
    console.log('  \u2192 ' + feed.name + ' (partnerId ' + partnerId + ', limit ' + limit + ')');

    const programId = 'cj_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    await supabaseUpsert('programs', [{
      id: programId, title: feed.name, categories: [], countries: ['FR'],
      updated_at: new Date().toISOString()
    }]);

    const all = [];
    let offset = 0;
    const pageSize = 1000;

    try {
      while (all.length < limit) {
        const query = '{ products(companyId: "' + CJ_PUBLISHER_ID + '", partnerIds: ["' + partnerId + '"], limit: ' + pageSize + ', offset: ' + offset + ') { totalCount count resultList { ' + CJ_FIELDS + ' } } }';
        const data = await cjQuery(query);
        const res = data && data.products;
        if (!res) break;
        const items = res.resultList || [];
        if (offset === 0) {
          console.log('     total dispo: ' + res.totalCount);
          if (!res.totalCount) {
            console.log('     \u26a0\ufe0f aucun produit \u2014 verifier que partnerId est bien un advertiserId');
          }
        }
        if (!items.length) break;
        all.push.apply(all, items);
        offset += pageSize;
        if (items.length < pageSize) break;
      }
    } catch (e) {
      console.log('     \u274c ' + e.message);
      continue;
    }

    const products = all.slice(0, limit).map(function (p, i) {
      const priceObj = p.salePrice && p.salePrice.amount ? p.salePrice : p.price;
      const price = parseFloat((priceObj && priceObj.amount) || 0);
      return {
        id: (programId + '_' + (p.id || i)).replace(/[^a-z0-9_]/gi, '_').slice(0, 100),
        affilae_id: programId + '_' + (p.id || i),
        program_id: programId,
        title: cleanTitle(p.title || ''),
        price: price,
        currency: (priceObj && priceObj.currency) || 'EUR',
        url: p.link || '',
        image_url: p.imageLink || '',
        brand: p.brand || null,
        ean: extractEAN(p.gtin || p.mpn || ''),
        category: feed.category || detectCategory({ title: p.title || '', description: p.description || '', program: { title: feed.name } }),
        lang: 'fr',
        status: 'enabled',
        updated_at: new Date().toISOString()
      };
    }).filter(function (p) {
      return p.title && p.url && p.price > 0 && p.currency === 'EUR';
    });

    const dropped = all.slice(0, limit).length - products.length;
    if (dropped > 0) console.log('     ' + dropped + ' ecartes (devise != EUR ou champs manquants)');

    const seen = new Set();
    const unique = products.filter(function (p) {
      if (seen.has(p.id)) return false;
      seen.add(p.id); return true;
    });

    const withEan = unique.filter(function (x) { return x.ean; }).length;
    const pct = unique.length ? Math.round(100 * withEan / unique.length) : 0;
    console.log('     EAN renseigne : ' + withEan + '/' + unique.length + ' (' + pct + '%)');
    if (unique.length && pct === 0) {
      const s = all[0] || {};
      console.log('     \u26a0\ufe0f aucun EAN \u2014 gtin=' + JSON.stringify(s.gtin)
                  + ' mpn=' + JSON.stringify(s.mpn));
    }
    await supabaseUpsert('products', unique);
    console.log('     \u2705 ' + unique.length + ' ins\u00e9r\u00e9s');
  }
  console.log('\ud83c\udf89 CJ done');
}

async function cleanupMonoVendors(label) {
  try {
    const client = new Client({ connectionString: process.env.NEON_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    const del = await client.query(`
      DELETE FROM products
      WHERE ean IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM products p2
        WHERE p2.ean = products.ean
        AND p2.program_id != products.program_id
      )
    `);
    await client.end();
    console.log('\ud83e\uddf9 [' + label + '] supprimes: ' + del.rowCount);
  } catch (e) {
    console.log('\ud83e\uddf9 [' + label + '] erreur nettoyage: ' + e.message);
  }
}


// ══════════════════════════════════════════════════════════════════
// PHASE B — INGESTION
// L'index EAN est complet : on sait quels codes-barres existent chez
// au moins deux marchands. On relit les fichiers de recolte et on
// n'insere que ceux-la.
// ══════════════════════════════════════════════════════════════════
async function ingestHarvest() {
  const s = EAN_INDEX.stats();
  console.log('\n' + '='.repeat(64));
  console.log('PHASE B \u2014 INGESTION  (seuil : ' + s.seuil + ' marchands)');
  console.log('='.repeat(64));
  console.log('Lignes recoltees     : ' + s.lignes.toLocaleString('fr-FR'));
  console.log('EAN uniques          : ' + s.eansUniques.toLocaleString('fr-FR'));
  console.log('EAN chez 2 marchands+: ' + s.eansDeuxPlus.toLocaleString('fr-FR'));
  console.log('EAN retenus (>=' + s.seuil + ')   : ' + s.eansRetenus.toLocaleString('fr-FR'));
  console.log('Disque utilise       : ' + Math.round(harvestDiskUsage() / 1e6) + ' Mo');
  console.log('');

  EAN_INDEX.compact();   // libere la Map, seul le Set des EAN partages sert

  let totalKept = 0, totalScanned = 0;
  for (const { programId, file } of harvestedPrograms()) {
    const meta = PROGRAM_META.get(programId) || { title: programId, category: null };
    try {
      const { scanned, kept } = await selectMatching(file, EAN_INDEX);
      totalScanned += scanned;
      if (!kept.length) {
        console.log('  \u2013 ' + meta.title + ' : 0 / ' + scanned.toLocaleString('fr-FR'));
        continue;
      }

      await supabaseUpsert('programs', [{
        id: programId, title: meta.title, categories: [], countries: ['FR'],
        updated_at: new Date().toISOString()
      }]);

      const mapped = kept.map((p, i) => {
        const raw = p.product_id ? programId + '_' + p.product_id : programId + '_' + p.ean;
        return {
          id: raw.replace(/[^a-z0-9_\-]/gi, '_').slice(0, 100),
          affilae_id: raw.slice(0, 100),
          program_id: programId,
          title: p.title,
          description: p.description || null,
          price: p.price || null,
          currency: 'EUR',
          url: p.url,
          tracking_id: null,
          image_url: p.image_url || null,
          brand: p.brand || null,
          ean: p.ean,
          category: p.feed_category || meta.category
            || detectCategory({ title: p.title, description: p.description || '', program: { title: meta.title } }),
          lang: 'fr', status: 'enabled', updated_at: new Date().toISOString()
        };
      });

      for (let i = 0; i < mapped.length; i += 50) {
        await supabaseUpsert('products', mapped.slice(i, i + 50));
      }
      totalKept += mapped.length;
      const pct = scanned ? Math.round(1000 * mapped.length / scanned) / 10 : 0;
      console.log('  \u2705 ' + meta.title + ' : ' + mapped.length.toLocaleString('fr-FR')
                  + ' / ' + scanned.toLocaleString('fr-FR') + '  (' + pct + '%)');
    } catch (e) {
      console.log('  \u26a0\ufe0f ' + meta.title + ' : ' + e.message);
    }
  }

  console.log('\n\ud83c\udf89 Ingestion : ' + totalKept.toLocaleString('fr-FR')
              + ' produits comparables sur ' + totalScanned.toLocaleString('fr-FR') + ' recoltes');
  return totalKept;
}

async function main() {
  try {
    // ── PHASE A : récolte (aucune écriture en base) ──
    console.log('='.repeat(64));
    console.log('PHASE A \u2014 RECOLTE (lecture integrale des catalogues)');
    console.log('='.repeat(64));
    resetHarvest();

    await syncEffinity();
    await syncAffilaeFeeds();
    await syncAwin();

    // ── PHASE B : on n'insère que les EAN présents chez 2+ marchands ──
    await ingestHarvest();

    // ── Sources API : petits volumes, insertion directe ──
    await syncBCDJeux();
    await syncRakuten();
    await syncCJ();
    // await syncAliExpress(); // Désactivé - tracking_id invalide
    if (_neonClient) await _neonClient.end();
    // Nettoyage automatique des mono-vendeurs
    console.log('🧹 Nettoyage des mono-vendeurs...');
    const client2 = new Client({ connectionString: process.env.NEON_URL, ssl: { rejectUnauthorized: false } });
    await client2.connect();
    const del = await client2.query(`
      DELETE FROM products 
      WHERE ean IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM products p2 
        WHERE p2.ean = products.ean 
        AND p2.program_id != products.program_id
      )
    `);
    console.log('🧹 Supprimés:', del.rowCount, 'produits mono-vendeurs');
    await client2.end();
    console.log('\n' + '='.repeat(64));
    console.log('RECAPITULATIF DES FLUX');
    console.log('='.repeat(64));
    console.log('\u2705 Flux recoltes : ' + FEED_REPORT.ok.length);
    if (FEED_REPORT.empty.length) {
      console.log('\u26a0\ufe0f  VIDES  : ' + FEED_REPORT.empty.length + '  \u2014 ' + FEED_REPORT.empty.join(', '));
    }
    if (FEED_REPORT.failed.length) {
      console.log('\u274c ECHECS : ' + FEED_REPORT.failed.length);
      FEED_REPORT.failed.forEach(f => console.log('     ' + f));
      console.log('\n   >>> Liens expires : a regenerer sur la plateforme concernee.');
    }
    console.log('='.repeat(64));
    console.log('🎉 All done!');
  } catch(e) {
    console.error('❌ Failed:', e.message);
    if (_neonClient) await _neonClient.end();
    process.exit(1);
  }
}

main();
