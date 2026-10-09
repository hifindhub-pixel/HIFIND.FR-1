import { isClosedProgram } from './lib/closed-programs.js';
// HIFIND - Sync Affilae + Effinity -> Neon
const AFFILAE_TOKEN       = process.env.AFFILAE_TOKEN;
const NEON_URL            = process.env.NEON_URL;
const EFFINITY_FEEDS_JSON = process.env.EFFINITY_FEEDS;
const AFFILAE_BASE        = 'https://rest.affilae.com';

import { streamFeed, parseCSVLine } from './lib/stream-feed.js';
import { EanIndex, HarvestWriter, resetHarvest, harvestedPrograms, selectMatching, harvestDiskUsage, merchantIdentity } from './lib/ean-index.js';
import { reconcileCategories } from './lib/category-consensus.js';
import { categorize } from './lib/categorize.js';
import { FeedLifecycle } from './lib/feed-lifecycle.js';
import { budgetCatalogue, compactCatalogueRows } from './lib/catalogue-budget.js';
import { writeFileSync } from 'node:fs';
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
// The current Neon project is capped at 1 GB. Keep the strongest comparable
// catalogue within a predictable row envelope; an upgrade can raise this
// value without changing matching semantics.
const MAX_STORED_OFFERS   = Math.max(20000, parseInt(process.env.MAX_STORED_OFFERS || '180000', 10));
const MAX_OFFERS_PER_EAN  = Math.max(2, parseInt(process.env.MAX_OFFERS_PER_EAN || '4', 10));

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
const CAT_STATS = {};
const PROGRAM_META = new Map();   // programId -> { title, category }
const LIFECYCLE = new FeedLifecycle();

const FEED_REPORT = { ok: [], empty: [], failed: [] };
const SYNC_STARTED_AT = new Date().toISOString();
function reportFeed(name, count, err) {
  if (err) FEED_REPORT.failed.push(name + ' (' + err + ')');
  else if (!count) FEED_REPORT.empty.push(name);
  else FEED_REPORT.ok.push(name + ' (' + count + ')');
}

function saveSyncReport(status, details = {}) {
  writeFileSync('sync-report.json', JSON.stringify({
    status,
    started_at: SYNC_STARTED_AT,
    finished_at: new Date().toISOString(),
    feeds: FEED_REPORT,
    ...details,
  }, null, 2));
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

/**
 * Verifie la cle de controle GS1 (algorithme officiel GTIN-8/12/13/14) :
 * poids alternes 3/1 en partant du chiffre juste avant la cle, en
 * remontant vers la gauche. Une valeur numerique de bonne longueur mais
 * a cle invalide n'est quasiment jamais un vrai code-barres — le plus
 * souvent une reference interne du marchand, un SKU ou une faute de
 * frappe qui, laissee passer, peut fusionner deux produits sans rapport
 * sous le meme "EAN" (voir l'audit : batterie de cuisine en tete de
 * High-Tech, tres probablement cause par ce genre de collision).
 */
function isValidEanChecksum(code) {
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return ((10 - (sum % 10)) % 10) === check;
}

/**
 * Interprete une valeur de frais de livraison, quel que soit son format
 * source : nombre simple ("4.90"), valeur composee style Google Merchant
 * ("FR::Standard:4.90 EUR"), ou mention textuelle ("Gratuit"/"Free").
 * Retourne null si rien d'exploitable -- jamais 0 par defaut, pour ne
 * pas fabriquer une gratuite qui n'a jamais ete confirmee par la source.
 */
function parseShippingCost(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  if (/^(gratuit|free|offert)/i.test(s)) return 0;
  // Valeur composee Google Merchant : le montant est le dernier segment
  // numerique avant un eventuel code devise (ex: "4.90 EUR", "4,90€").
  const m = s.match(/(-?\d+(?:[.,]\d+)?)\s*(?:eur|€|\$|usd)?\s*$/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Interprete une valeur de disponibilite, quel que soit son vocabulaire
 * source. Retourne null (pas false) si la valeur est absente ou
 * inexploitable -- ne jamais inventer une rupture de stock qui n'a pas
 * ete confirmee par la source, meme logique que parseShippingCost().
 */
function parseInStock(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim().toLowerCase();
  if (/^(1|true|yes|in.?stock|en.?stock|disponible|available)$/.test(s)) return true;
  if (/^(0|false|no|out.?of.?stock|rupture|indisponible|unavailable)$/.test(s)) return false;
  return null;
}

function extractEAN(val) {
  if (!val) return null;
  // Prend le premier code numerique de longueur GTIN valide (8, 12, 13
  // ou 14 chiffres — 9/10/11 ne sont pas des longueurs GTIN standard)
  // ET dont la cle de controle est correcte.
  const parts = String(val).split(/[\s,;|]+/);
  for (const part of parts) {
    const clean = part.trim().replace(/\.0$/, '');
    if (/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(clean) && isValidEanChecksum(clean)) return clean;
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
        const b = j * 19;   // 17 -> 19 : +delivery_time +in_stock (LOT 3)
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19})`;
      }).join(',');
      const params = batch.flatMap(row => [
        row.id, row.affilae_id||row.id, row.program_id,
        row.title, row.description||null, row.price||null,
        row.currency||'EUR', row.url||null, row.tracking_id||null,
        row.image_url||null, row.category||'autres', row.lang||'fr',
        row.status||'enabled', row.ean||null, row.brand||null,
        row.updated_at||new Date().toISOString(),
        row.shipping_cost != null ? row.shipping_cost : null,
        row.delivery_time || null,
        row.in_stock != null ? row.in_stock : null,
      ]);
      await client.query(`
        INSERT INTO products (id,affilae_id,program_id,title,description,price,currency,url,tracking_id,image_url,category,lang,status,ean,brand,updated_at,shipping_cost,delivery_time,in_stock)
        VALUES ${vals}
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,price=EXCLUDED.price,ean=EXCLUDED.ean,brand=EXCLUDED.brand,category=EXCLUDED.category,image_url=EXCLUDED.image_url,url=EXCLUDED.url,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,shipping_cost=EXCLUDED.shipping_cost,delivery_time=EXCLUDED.delivery_time,in_stock=EXCLUDED.in_stock
      `, params);
    }
  }
}

async function prepareCatalogueStorage(selectedRows) {
  if (!selectedRows?.length) throw new Error('Refus de préparer le stockage sans offre sélectionnée');
  const client = await getNeon();
  // This GIN index duplicated the full-text index and consumed a large share
  // of the 1 GB quota. Search still uses search_vector; typo-free substring
  // fallback remains available without storing another copy of every title.
  await client.query('DROP INDEX IF EXISTS idx_products_title_trgm');
  await client.query('CREATE TEMP TABLE sync_selected_offers (id TEXT PRIMARY KEY) ON COMMIT PRESERVE ROWS');
  const ids = selectedRows.map(row => row.id);
  for (let i = 0; i < ids.length; i += 1000) {
    await client.query(`INSERT INTO sync_selected_offers (id)
      SELECT DISTINCT unnest($1::text[]) ON CONFLICT DO NOTHING`, [ids.slice(i, i + 1000)]);
  }
  await client.query(`DELETE FROM products WHERE status <> 'enabled' OR ean IS NULL`);
  const safePrograms = LIFECYCLE.safePrograms();
  let pruned = 0;
  if (safePrograms.length) {
    const result = await client.query(`DELETE FROM products p
      WHERE p.program_id = ANY($1::text[])
      AND NOT EXISTS (SELECT 1 FROM sync_selected_offers s WHERE s.id = p.id)`, [safePrograms]);
    pruned = result.rowCount;
  }
  await client.query('VACUUM (ANALYZE) products');
  console.log('🧹 Budget stockage : ' + pruned.toLocaleString('fr-FR') + ' anciennes offres retirées avant ingestion');
  return pruned;
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
    const programId = 'effinity_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g,'_');
    PROGRAM_META.set(programId, { title: feed.name, category: feed.category });
    try {
      console.log('  →', feed.name, '(lecture intégrale)');

      const products = [];
      const seen = new Set();
      const feedEans = new Set();

      // Mapping XML → produit
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
          shipping_cost: parseShippingCost(get('shipping_cost')||get('shipping')||''),
          // LOT 3 -- noms de colonnes non confirmes sur un flux Effinity
          // reel (contrairement a Awin), devines par convention courante.
          delivery_time: get('delivery_time')||get('delai_livraison')||get('livraison')||'',
          in_stock: parseInStock(get('in_stock')||get('stock')||get('disponible')||''),
        };
      };

      // Mapping CSV → produit
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
          brand: obj.brand || obj.marque || obj.fabricant || obj.brand_name || '',
          shipping_cost: parseShippingCost(obj.shipping_cost || obj.shipping || obj.frais_livraison || ''),
          // LOT 3 -- meme reserve que ci-dessus, noms devines
          delivery_time: obj.delivery_time || obj.delai_livraison || obj.livraison || '',
          in_stock: parseInStock(obj.in_stock || obj.stock || obj.disponible || ''),
        };
      };

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
        feedEans.add(p.ean);
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
      if (stat.stopped) throw new Error('lecture interrompue avant la fin du flux');
      const merchantId = merchantIdentity(feed.name);
      feedEans.forEach(ean => EAN_INDEX.add(ean, merchantId));
      console.log('  📦', feed.name, ':', writer.count, 'lignes recoltees ('
                  + writer.skippedNoEan + ' sans EAN ignorees)');
      reportFeed(feed.name, writer.count);
      LIFECYCLE.feedSucceeded(programId, writer.count);

    } catch(e) {
      LIFECYCLE.feedIncomplete(programId);
      reportFeed(feed.name, 0, e.message);
      console.log('  ⚠️', feed.name, ':', e.message, '\n  Stack:', e.stack?.split('\n')[1]?.trim());
    }
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
  let failedSearches = 0;

  for (const search of RAKUTEN_SEARCHES) {
    try {
      const url = RAKUTEN_BASE + '?id_compteur=' + RAKUTEN_COUNTER +
                  '&kw=' + encodeURIComponent(search.kw) +
                  '&nav=' + encodeURIComponent(search.nav) +
                  '&nbproductsperpage=50&pagenumber=1';

      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
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
      failedSearches++;
      LIFECYCLE.feedIncomplete(programId);
      console.log('  ⚠️ Rakuten "'+search.kw+'" :', e.message);
    }
  }
  reportFeed('Rakuten API', totalInserted, failedSearches ? `${failedSearches}/${RAKUTEN_SEARCHES.length} recherches en échec` : null);
  console.log('🎉 Rakuten done:', totalInserted, 'produits');
}

async function syncAffilaeFeeds() {
  console.log('🔄 Affilae Feeds sync...');
  const AFFILAE_FEEDS_JSON = process.env.AFFILAE_FEEDS;
  if (!AFFILAE_FEEDS_JSON) { console.log('⚠️ AFFILAE_FEEDS missing'); return; }

  let feeds;
  try { feeds = JSON.parse(AFFILAE_FEEDS_JSON); } catch(e) { console.log('❌ AFFILAE_FEEDS JSON invalide'); return; }

  for (const feed of feeds) {
    const programId = 'affilae_feed_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g,'_');
    PROGRAM_META.set(programId, { title: feed.name, category: feed.category });
    try {
      console.log('  →', feed.name, '(lecture intégrale)');

      const products = [];
      const seen = new Set();
      const feedEans = new Set();

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
          shipping_cost: parseShippingCost(get('shipping_cost')||get('frais_livraison')||get('shipping')||''),
          // LOT 3 -- noms de colonnes non confirmes sur un flux Affilae
          // reel, devines par convention courante.
          delivery_time: get('delivery_time')||get('delai_livraison')||get('livraison')||'',
          in_stock: parseInStock(get('in_stock')||get('stock')||get('disponible')||''),
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
          shipping_cost: parseShippingCost(obj.frais_livraison||obj.shipping_cost||obj.shipping||''),
          // LOT 3 -- meme reserve que ci-dessus, noms devines
          delivery_time: obj.delivery_time || obj.delai_livraison || obj.livraison || '',
          in_stock: parseInStock(obj.in_stock || obj.stock || obj.disponible || ''),
        };
      };

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
        feedEans.add(p.ean);
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
      if (stat.stopped) throw new Error('lecture interrompue avant la fin du flux');
      const merchantId = merchantIdentity(feed.name);
      feedEans.forEach(ean => EAN_INDEX.add(ean, merchantId));
      console.log('  📦', feed.name, ':', writer.count, 'lignes recoltees ('
                  + writer.skippedNoEan + ' sans EAN ignorees)');
      reportFeed(feed.name, writer.count);
      LIFECYCLE.feedSucceeded(programId, writer.count);

    } catch(e) { LIFECYCLE.feedIncomplete(programId); reportFeed(feed.name, 0, e.message); console.log('  ⚠️', feed.name, ':', e.message); }
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
    // Normalise les noms de vendeurs splittes AVANT la recolte.
    let feedDisplayName = feed.name;
    if (feed.name.match(/^Rue du Commerce [A-Z]/)) feedDisplayName = 'Rue du Commerce';
    if (feed.name.match(/^Rakuten FR\d/)) feedDisplayName = 'Rakuten';
    if (feed.name.match(/^AliExpress [A-Z]/)) feedDisplayName = 'AliExpress';
    if (feed.name.match(/^ManoMano [A-Z]/)) feedDisplayName = 'ManoMano';
    if (feed.name.match(/^Whirlpool [A-Z]/)) feedDisplayName = 'Whirlpool';
    if (feed.name.match(/^Velostore [A-Z]/)) feedDisplayName = 'Velostore';
    if (feed.name === 'Foot Store 2') feedDisplayName = 'Footstore';
    const programId = 'awin_' + feedDisplayName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (isClosedProgram(programId)) {
      console.log('  Programme fermé ignoré :', feedDisplayName);
      continue;
    }
    PROGRAM_META.set(programId, { title: feedDisplayName, category: feed.category });
    try {
      console.log('  →', feed.name, '(lecture intégrale)');
      const writer = new HarvestWriter(programId);

      const seen = new Set();
      const feedEans = new Set();
      let firstSample = null;

      const stat = await streamFeed(feed.url, {
        label: feed.name,
        normalizeHeader: h => h.trim().replace(/^"|"$/g,'').toLowerCase().replace(/\s+/g,'_'),
        onHeaders: (headers, sep) => console.log('  Colonnes:', headers.length, '| sep:', JSON.stringify(sep)),
        onRecord: (obj) => {
          // Deux familles de flux Awin : le format "datafeed" classique
          // (aw_deep_link, search_price, ean) et le format Google Merchant
          // "retail" (link, price, gtin) utilise par certains marchands
          // (ex: Planet Foot, Welax) quand le format classique est vide.
          const title = cleanTitle(obj.product_name || obj.title || obj.name || '');
          const url = obj.aw_deep_link || obj.merchant_deep_link || obj.link || obj.url || '';
          const price = parseFloat(obj.search_price || obj.price || obj.store_price || obj.sale_price || '0');
          const image = obj.aw_image_url || obj.image_link || obj.merchant_image_url || obj.large_image || '';
          const ean = extractEAN(obj.ean || obj.gtin || obj.product_gtin || obj.upc || obj.isbn || '');
          const brand = obj.brand_name || obj.brand || '';
          const productId = obj.aw_product_id || obj.id || obj.merchant_product_id || '';
          const shippingCost = parseShippingCost(obj.delivery_cost || obj.shipping_cost || '');
          // LOT 3 : vu directement dans de vrais flux Awin aujourd'hui
          // (colonnes delivery_time / in_stock confirmees sur plusieurs
          // marchands), contrairement a Affilae/Effinity ou ces noms
          // sont devines par convention.
          const deliveryTime = obj.delivery_time || obj.delivery_time_text || '';
          const inStock = parseInStock(obj.in_stock);

          if (!title || !url || !(price > 0) || !ean) return true;
          const key = ean + '_' + price;
          if (seen.has(key)) return true;
          seen.add(key);
          const p = { title, url, price, image_url: image, ean, brand, product_id: productId,
                      shipping_cost: shippingCost,
                      delivery_time: deliveryTime,
                      in_stock: inStock,
                      program_id: programId, feed_name: feedDisplayName,
                      feed_category: feed.category || null };
          if (!firstSample) firstSample = p;
          writer.write(p);
          feedEans.add(ean);
          return true;
        },
      });

      console.log('  Format:', stat.format, '| encodage:', stat.encoding,
                  '|', Math.round(stat.bytes/1e6*10)/10, 'Mo lus',
                  stat.stopped ? '(arret anticipe)' : '');

      await writer.close();
      if (stat.stopped) throw new Error('lecture interrompue avant la fin du flux');
      const merchantId = merchantIdentity(feedDisplayName);
      feedEans.forEach(ean => EAN_INDEX.add(ean, merchantId));
      console.log('  📦', feedDisplayName, ':', writer.count, 'lignes recoltees ('
                  + writer.skippedNoEan + ' sans EAN ignorees)');
      reportFeed(feed.name, writer.count);
      LIFECYCLE.feedSucceeded(programId, writer.count);

    } catch(e) { LIFECYCLE.feedIncomplete(programId); reportFeed(feed.name, 0, e.message); console.log('  ⚠️', feed.name, ':', e.message); }
  }
  console.log('🎉 Awin done');
}

/**
 * Noms de colonnes CONFIRMES le 09/08 directement depuis le
 * configurateur de flux Kwanko (Oscaro FR) -- aucune supposition,
 * contrairement a Affilae/Effinity. url_product est deja etiquetee
 * "Tracking URL" par Kwanko lui-meme : aucun enveloppement manuel
 * necessaire, contrairement a CJ.
 */
async function syncKwanko() {
  console.log('🔄 Kwanko sync...');
  const KWANKO_FEEDS_JSON = process.env.KWANKO_FEEDS;
  if (!KWANKO_FEEDS_JSON) { console.log('⚠️ KWANKO_FEEDS missing'); return; }

  let feeds;
  try { feeds = JSON.parse(KWANKO_FEEDS_JSON); } catch(e) { console.log('❌ KWANKO_FEEDS JSON invalide'); return; }

  for (const feed of feeds) {
    const programId = 'kwanko_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    PROGRAM_META.set(programId, { title: feed.name, category: feed.category });
    try {
      console.log('  →', feed.name, '(lecture intégrale)');

      const writer = new HarvestWriter(programId);
      const seen = new Set();
      const feedEans = new Set();
      let firstSample = null;

      const stat = await streamFeed(feed.url, {
        label: feed.name,
        normalizeHeader: h => h.trim().replace(/^"|"$/g,'').toLowerCase().replace(/\s+/g,'_'),
        onHeaders: (headers, sep) => console.log('  Colonnes:', headers.length, '| sep:', JSON.stringify(sep)),
        onRecord: (obj) => {
          const title = cleanTitle(obj.name || '');
          const url = obj.url_product || '';
          const price = parseFloat(String(obj.price || '0').replace(',', '.'));
          const image = obj.url_image || '';
          const ean = extractEAN(obj.ean || '');
          const brand = obj.brand || '';
          const productId = obj.sku || obj.reference || '';
          const shippingCost = parseShippingCost(obj.shipping_cost || '');
          const deliveryTime = obj.delivery_time || '';
          const inStock = parseInStock(obj.availability);

          if (!title || !url || !(price > 0) || !ean) return true;
          const key = ean + '_' + price;
          if (seen.has(key)) return true;
          seen.add(key);
          const p = { title, url, price, image_url: image, ean, brand, product_id: productId,
                      shipping_cost: shippingCost,
                      delivery_time: deliveryTime,
                      in_stock: inStock,
                      description: obj.description || '',
                      // product_type Kwanko sert de piste de categorie
                      // (feed_cat), meme role que dans syncEffinity --
                      // a ne pas confondre avec le product_type HiFind
                      // (classifyProductType, LOT 1), notion differente.
                      feed_cat: obj.product_type || '',
                      program_id: programId, feed_name: feed.name,
                      feed_category: feed.category || null };
          if (!firstSample) firstSample = p;
          writer.write(p);
          feedEans.add(ean);
          return true;
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
        console.log('  \u26a0\ufe0f aucune ligne exploitable');
      }
      await writer.close();
      if (stat.stopped) throw new Error('lecture interrompue avant la fin du flux');
      const merchantId = merchantIdentity(feed.name);
      feedEans.forEach(ean => EAN_INDEX.add(ean, merchantId));
      console.log('  📦', feed.name, ':', writer.count, 'lignes recoltees ('
                  + writer.skippedNoEan + ' sans EAN ignorees)');
      reportFeed(feed.name, writer.count);
      LIFECYCLE.feedSucceeded(programId, writer.count);

    } catch(e) { LIFECYCLE.feedIncomplete(programId); reportFeed(feed.name, 0, e.message); console.log('  ⚠️', feed.name, ':', e.message); }
  }
  console.log('🎉 Kwanko done');
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

  // CJ ne fournit pas de lien tracke pret a l'emploi dans son API produits
  // (le champ "link" est l'URL brute du marchand). Pour toucher une
  // commission, chaque URL produit doit etre enveloppee dans un lien de
  // clic CJ generique propre a l'annonceur : celui-ci se recupere une
  // fois sur cj.com (fiche annonceur > Links > un lien texte generique)
  // et se reutilise indefiniment pour n'importe quelle URL produit du
  // meme annonceur via le parametre ?url=.
  //
  // Cle = feed.name normalise (minuscules, espaces->underscore) tel que
  // genere plus bas pour construire le programId ('cj_' + cette cle).
  const CJ_LINKS = {
    notino: { domain: 'jdoqocy.com', linkId: '12907546' },
    // A completer au fur et a mesure : sandisk, ugreen, wd, stiga_sports,
    // babybjorn, printworks, irobot, first_class_watches, skechers,
    // ecosupplements, onebioshop. Sans entree ici, l'URL brute (non
    // trackee) est utilisee en repli plutot que de faire planter le sync.
  };

  function wrapCjLink(feedKey, rawUrl) {
    if (!rawUrl) return '';
    const cfg = CJ_LINKS[feedKey];
    if (!cfg) return rawUrl;   // pas encore configure pour cet annonceur
    return 'https://www.' + cfg.domain + '/click-' + CJ_PUBLISHER_ID + '-' + cfg.linkId +
           '?url=' + encodeURIComponent(rawUrl);
  }

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
    const requestedLimit = Number.parseInt(feed.limit, 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : Infinity;
    const partnerId = feed.advertiserId || feed.adId;
    console.log('  \u2192 ' + feed.name + ' (partnerId ' + partnerId + ', ' + (Number.isFinite(limit) ? 'limit ' + limit : 'lecture intégrale') + ')');

    const programId = 'cj_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    PROGRAM_META.set(programId, { title: feed.name, category: feed.category });

    const all = [];
    let offset = 0;
    let totalAvailable = null;
    const pageSize = 1000;

    try {
      while (all.length < limit) {
        const requestSize = Number.isFinite(limit) ? Math.min(pageSize, limit - all.length) : pageSize;
        const query = '{ products(companyId: "' + CJ_PUBLISHER_ID + '", partnerIds: ["' + partnerId + '"], limit: ' + requestSize + ', offset: ' + offset + ') { totalCount count resultList { ' + CJ_FIELDS + ' } } }';
        const data = await cjQuery(query);
        const res = data && data.products;
        if (!res) break;
        const items = res.resultList || [];
        if (offset === 0) {
          totalAvailable = Number(res.totalCount);
          console.log('     total dispo: ' + res.totalCount);
          if (!res.totalCount) {
            console.log('     \u26a0\ufe0f aucun produit \u2014 verifier que partnerId est bien un advertiserId');
          }
        }
        if (!items.length) break;
        all.push.apply(all, items);
        offset += requestSize;
        if (items.length < requestSize) break;
      }
    } catch (e) {
      console.log('     \u274c ' + e.message);
      LIFECYCLE.feedIncomplete(programId);
      reportFeed(feed.name, 0, e.message);
      continue;
    }

    const selected = Number.isFinite(limit) ? all.slice(0, limit) : all;
    const mapped = selected.map(function (p, i) {
      const priceObj = p.salePrice && p.salePrice.amount ? p.salePrice : p.price;
      const price = parseFloat((priceObj && priceObj.amount) || 0);
      // p.shipping peut etre un objet {amount,currency} comme price, ou une
      // valeur simple selon le jeu de champs retenu -- parseShippingCost
      // gere les deux formats sans distinction.
      const shippingRaw = p.shipping && p.shipping.amount != null ? p.shipping.amount : p.shipping;
      return {
        product_id: p.id || String(i),
        title: cleanTitle(p.title || ''),
        price: price,
        currency: (priceObj && priceObj.currency) || 'EUR',
        url: wrapCjLink(feed.name.toLowerCase().replace(/[^a-z0-9]/g, '_'), p.link || ''),
        image_url: p.imageLink || '',
        brand: p.brand || null,
        ean: extractEAN(p.gtin || p.mpn || ''),
        description: p.description || '',
        shipping_cost: parseShippingCost(shippingRaw),
      };
    }).filter(function (p) {
      return p.title && p.url && p.price > 0 && p.currency === 'EUR';
    });

    const dropped = selected.length - mapped.length;
    if (dropped > 0) console.log('     ' + dropped + ' ecartes (devise != EUR ou champs manquants)');

    const seen = new Set();
    const feedEans = new Set();
    const writer = new HarvestWriter(programId);
    mapped.forEach(function (p) {
      const key = p.ean || p.product_id;
      if (seen.has(key)) return;
      seen.add(key);
      p.program_id = programId;
      p.feed_name = feed.name;
      p.feed_category = feed.category || null;
      writer.write(p);
      if (p.ean) feedEans.add(p.ean);
    });

    const withEan = mapped.filter(function (x) { return x.ean; }).length;
    const pct = mapped.length ? Math.round(100 * withEan / mapped.length) : 0;
    console.log('     EAN renseigne : ' + withEan + '/' + mapped.length + ' (' + pct + '%)');
    if (mapped.length && pct === 0) {
      const s = all[0] || {};
      console.log('     \u26a0\ufe0f aucun EAN \u2014 gtin=' + JSON.stringify(s.gtin)
                  + ' mpn=' + JSON.stringify(s.mpn));
    }
    await writer.close();
    const merchantId = merchantIdentity(feed.name);
    feedEans.forEach(ean => EAN_INDEX.add(ean, merchantId));
    console.log('     \ud83d\udce6 ' + writer.count + ' recoltees (' + writer.skippedNoEan + ' sans EAN ignorees)');
    reportFeed(feed.name, writer.count);
    const fullCatalogue = !Number.isFinite(limit)
      || (Number.isFinite(totalAvailable) && all.length >= totalAvailable);
    if (fullCatalogue) LIFECYCLE.feedSucceeded(programId, writer.count);
    else LIFECYCLE.feedIncomplete(programId);
  }
  console.log('\ud83c\udf89 CJ done');
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
  const PENDING = [];
  for (const { programId, file } of harvestedPrograms()) {
    const meta = PROGRAM_META.get(programId) || { title: programId, category: null };
    try {
      const { scanned, kept } = await selectMatching(file, EAN_INDEX);
      totalScanned += scanned;
      if (!kept.length) {
        console.log('  \u2013 ' + meta.title + ' : 0 / ' + scanned.toLocaleString('fr-FR'));
        continue;
      }

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
          shipping_cost: p.shipping_cost != null ? p.shipping_cost : null,
          delivery_time: p.delivery_time || null,
          in_stock: p.in_stock != null ? p.in_stock : null,
          category: categorize({
            ean: p.ean,
            title: p.title,
            description: p.description || '',
            feedCat: p.feed_cat || '',
            merchant: meta.title,
            merchantCategory: p.feed_category || meta.category || null
          }).category,
          lang: 'fr', status: 'enabled', updated_at: new Date().toISOString()
        };
      });

      PENDING.push({ programId: programId, meta: meta, rows: mapped });
      totalKept += mapped.length;
      const pct = scanned ? Math.round(1000 * mapped.length / scanned) / 10 : 0;
      console.log('  \u2705 ' + meta.title + ' : ' + mapped.length.toLocaleString('fr-FR')
                  + ' / ' + scanned.toLocaleString('fr-FR') + '  (' + pct + '%)');
    } catch (e) {
      LIFECYCLE.ingestFailed(programId);
      console.log('  \u26a0\ufe0f ' + meta.title + ' : ' + e.message);
    }
  }

  // Reconcile only exact barcodes with unanimous product evidence.
  const categoryRows = PENDING.flatMap(batch => batch.rows);
  const decisions = reconcileCategories(categoryRows, categoryRows.map(row => {
    const signal = categorize(row);
    return signal.category !== 'autres' ? signal : {category:row.category,score:10};
  }));
  categoryRows.forEach((row,i) => { row.category = decisions[i].category; });

  const budget = budgetCatalogue(categoryRows, MAX_STORED_OFFERS, MAX_OFFERS_PER_EAN);
  const selectedRows = new Set(budget.rows);
  PENDING.forEach(batch => { batch.rows = batch.rows.filter(row => selectedRows.has(row)); });
  budget.stats.metadata_compaction = compactCatalogueRows(budget.rows);
  totalKept = budget.rows.length;
  console.log('💾 Budget catalogue : ' + budget.stats.selected_eans.toLocaleString('fr-FR') + ' EAN, '
    + budget.stats.selected_offers.toLocaleString('fr-FR') + ' offres conservées sur '
    + budget.stats.candidate_offers.toLocaleString('fr-FR'));
  budget.stats.pruned_stale_offers = await prepareCatalogueStorage(budget.rows);

  // ── Insertion ──
  for (const b of PENDING) {
    try {
      await supabaseUpsert('programs', [{
        id: b.programId, title: b.meta.title, categories: [], countries: ['FR'],
        updated_at: new Date().toISOString()
      }]);
      for (let i = 0; i < b.rows.length; i += 50) {
        await supabaseUpsert('products', b.rows.slice(i, i + 50));
      }
    } catch (e) { LIFECYCLE.ingestFailed(b.programId); console.log('  \u26a0\ufe0f ' + b.meta.title + ' : ' + e.message); }
  }
  budget.rows.forEach(function(r){ CAT_STATS[r.category] = (CAT_STATS[r.category] || 0) + 1; });

  console.log('\n\ud83c\udf89 Ingestion : ' + totalKept.toLocaleString('fr-FR')
              + ' produits comparables sur ' + totalScanned.toLocaleString('fr-FR') + ' recoltes');

  const cats = Object.entries(CAT_STATS).sort(function(a,b){ return b[1]-a[1]; });
  if (cats.length) {
    console.log('\nRepartition par categorie :');
    cats.forEach(function(e){
      const pct = Math.round(1000 * e[1] / totalKept) / 10;
      console.log('  ' + e[0].padEnd(20) + String(e[1]).padStart(7) + '  (' + pct + '%)');
    });
  }
  return { totalKept, matching:{ ...s, storage_budget:budget.stats } };
}

async function archiveStaleOffers(cutoff) {
  const programs = LIFECYCLE.safePrograms();
  if (!programs.length) {
    console.log('🛡️ Aucun marchand éligible à l’archivage des offres obsolètes');
    return { ...LIFECYCLE.summary(), archived_offers:0 };
  }
  const client = await getNeon();
  let archived = 0;
  const changes = [];
  await client.query('BEGIN');
  try {
    for (const programId of programs) {
      const result = await client.query(`
        UPDATE products SET status='disabled'
        WHERE program_id=$1 AND status='enabled' AND updated_at < $2::timestamptz
      `, [programId, cutoff]);
      archived += result.rowCount;
      if (result.rowCount) changes.push([programId, result.rowCount]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  changes.forEach(([programId, count]) => console.log('  🗄️ ' + programId + ' : ' + count + ' offres obsolètes désactivées'));
  console.log('🛡️ Archivage contrôlé : ' + archived + ' offres sur ' + programs.length + ' marchands complets');
  return { ...LIFECYCLE.summary(), archived_offers:archived };
}

async function main() {
  let matching = null;
  let ingestedProducts = 0;
  let lifecycle = LIFECYCLE.summary();
  try {
    // ── PHASE A : récolte (aucune écriture en base) ──
    console.log('='.repeat(64));
    console.log('PHASE A \u2014 RECOLTE (lecture integrale des catalogues)');
    console.log('='.repeat(64));
    resetHarvest();

    await syncEffinity();
    await syncAffilaeFeeds();
    await syncAwin();
    await syncKwanko();
    await syncCJ();   // API paginee : reste en phase A pour beneficier du croisement 3-marchands

    // ── PHASE B : on n'insère que les EAN présents chez 2+ vrais marchands ──
    const ingestion = await ingestHarvest();
    ingestedProducts = ingestion.totalKept;
    matching = ingestion.matching;

    // ── Sources API : petits volumes, insertion directe ──
    await syncBCDJeux();
    await syncRakuten();
    // await syncAliExpress(); // Désactivé - tracking_id invalide
    lifecycle = await archiveStaleOffers(SYNC_STARTED_AT);
    if (_neonClient) await _neonClient.end();
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
    saveSyncReport('success', { matching, ingested_products:ingestedProducts, lifecycle });
    console.log('🎉 All done!');
  } catch(e) {
    console.error('❌ Failed:', e.message);
    saveSyncReport('failed', { matching, ingested_products:ingestedProducts, lifecycle:LIFECYCLE.summary(), error:e.message });
    if (_neonClient) await _neonClient.end();
    process.exit(1);
  }
}

main();
