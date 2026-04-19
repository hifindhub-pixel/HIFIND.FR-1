// HIFIND - Sync Affilae + Effinity -> Neon
const AFFILAE_TOKEN       = process.env.AFFILAE_TOKEN;
const NEON_URL            = process.env.NEON_URL;
const EFFINITY_FEEDS_JSON = process.env.EFFINITY_FEEDS;
const AFFILAE_BASE        = 'https://rest.affilae.com';

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
  { cat: 'cbd-chanvre',     keywords: ['cbd','chanvre','cannabis','hemp','cannabidiol','fleur cbd','huile cbd'] },
  { cat: 'enfants-bebes',   keywords: ['enfant','bébé','baby','jouet','jeu','puériculture','poussette','couche','biberon','apprentissage','éveil'] },
  { cat: 'sport-outdoor',   keywords: ['sport','fitness','musculation','yoga','running','vélo','natation','randonnée','camping','outdoor','gym','trail','ski','tennis','football'] },
  { cat: 'high-tech',       keywords: ['tech','électronique','smartphone','téléphone','ordinateur','laptop','tablette','casque','écouteur','drone','smart','bluetooth','gaming','console'] },
  { cat: 'animaux',         keywords: ['animal','animaux','chien','chat','oiseau','poisson','lapin','croquette','litière','collier','aquarium'] },
  { cat: 'auto-moto',       keywords: ['auto','moto','voiture','véhicule','scooter','pièce auto','pneu','huile moteur','gps','tuning'] },
];

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

async function syncEffinity() {
  console.log('🔄 Effinity sync...');
  if (!EFFINITY_FEEDS_JSON) { console.log('⚠️ EFFINITY_FEEDS missing'); return; }
  let feeds;
  try { feeds = JSON.parse(EFFINITY_FEEDS_JSON); } catch(e) { console.log('❌ JSON invalide'); return; }

  for (const feed of feeds) {
    try {
      const feedLimit = feed.limit || 200;
      console.log('  →', feed.name, '(limit:', feedLimit, ')');

      const res = await fetch(feed.url);
      console.log('  HTTP status:', res.status, 'for', feed.url);
      if (!res.ok) { console.log('  ❌', feed.name, res.status); continue; }

      const buffer = await res.arrayBuffer();
      // Détecte l'encodage depuis le XML header ou force UTF-8 d'abord
      let text;
      const rawBytes = new Uint8Array(buffer);
      const rawStr = String.fromCharCode(...rawBytes.slice(0, 200));
      const isIso = rawStr.includes('iso-8859') || rawStr.includes('ISO-8859') || rawStr.includes('windows-1252');
      if (isIso) {
        text = new TextDecoder('iso-8859-1').decode(buffer);
      } else {
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch(e) {
          text = new TextDecoder('iso-8859-1').decode(buffer);
        }
      }


      const products = [];
      const seen = new Set();

      if (text.trim().startsWith('<')) {
        // Détecte automatiquement la balise produit utilisée
        const tagMatch = text.match(/<(item|product|offer|Product|Offer|annonce|Article|PRODUCT|ITEM|produit|Produit)[\s>]/i);
        const xmlTag = tagMatch ? tagMatch[1] : 'item';
        console.log('  XML tag detected:', xmlTag);
        const regex = new RegExp('<' + xmlTag + '[^>]*>([\\s\\S]*?)<\\/' + xmlTag + '>', 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          const item = match[0];
          const get = tag => { const m = item.match(new RegExp('<'+tag+'[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</'+tag+'>','i')); return m?(m[1]||'').trim():''; };
          const p = {
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
          if (!p.title || !p.url) continue;
          const key = p.product_id || (p.title.toLowerCase().trim()+'_'+p.price);
          if (seen.has(key)) continue;
          seen.add(key);
          products.push(p);
          if (products.length >= feedLimit) break;
        }
      } else {
        // Parser CSV RFC-4180 (gère les champs avec guillemets et séparateurs internes)
        function parseCSVLine(line, sep) {
          const result = [];
          let field = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
              if (inQuotes && line[i+1] === '"') { field += '"'; i++; }
              else inQuotes = !inQuotes;
            } else if (c === sep && !inQuotes) {
              result.push(field); field = '';
            } else {
              field += c;
            }
          }
          result.push(field);
          return result;
        }

        const lines = text.split('\n').filter(l=>l.trim());
        const sep = lines[0].includes(';') ? ';' : ',';
        const headers = parseCSVLine(lines[0], sep).map(h=>h.trim().toLowerCase());
        for (const line of lines.slice(1)) {
          if (!line.trim()) continue;
          const vals = parseCSVLine(line, sep);
          const obj = {}; headers.forEach((h,i)=>obj[h]=(vals[i]||'').trim());
          const p = { title:cleanTitle(obj.title||obj.name), description:fixEncoding(obj.description||''), price:parseFloat(obj.price||'0'), url:obj.link||obj.url, image_url:obj.image_link||obj.image, feed_cat:obj.category_level2||obj.category_level1||obj.category||'', product_id:obj.id||obj.item_id||'', ean:extractEAN(obj.gtin||obj.ean||obj.barcode), brand:obj.brand||'' };
          if (!p.title || !p.url) continue;
          const key = p.product_id || (p.title.toLowerCase().trim()+'_'+p.price);
          if (seen.has(key)) continue;
          seen.add(key);
          products.push(p);
          if (products.length >= feedLimit) break;
        }
      }

      console.log('  Feed size:', text.length, 'chars');
      console.log('  Feed start:', text.slice(0, 300).replace(/\n/g,' '));
      console.log('  Sample URL:', products[0]?.url);
      console.log('  📦', feed.name, ':', products.length, 'produits');

      const programId = 'effinity_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g,'_');
      await supabaseUpsert('programs', [{ id:programId, title:feed.name, categories:[], countries:['FR'], updated_at:new Date().toISOString() }]);

      // Déduplique par EAN par vendeur — garde le moins cher
      const eanSeen = new Map();
      const deduped = [];
      for (const p of products.filter(p=>p.title&&p.url)) {
        if (p.ean) {
          if (!eanSeen.has(p.ean) || p.price < eanSeen.get(p.ean).price) {
            eanSeen.set(p.ean, p);
          }
        } else {
          deduped.push(p);
        }
      }
      deduped.push(...eanSeen.values());

      const mapped = deduped.map((p,i) => {
        const rawId = p.product_id ? programId+'_'+p.product_id : programId+'_'+i;
        const safeId = rawId.replace(/[^a-z0-9_\-]/gi,'_').slice(0,100);
        return {
          id: safeId, affilae_id: safeId, program_id: programId,
          title: p.title, description: p.description||null, price: p.price||null,
          currency: 'EUR', url: p.url, tracking_id: null,
          image_url: p.image_url||null,
          brand: p.brand||null,
          ean: p.ean || null,
          category: feed.category || detectCategory({ title:p.title, description:p.description||'', program:{title:feed.name} }),
          lang: 'fr', status: 'enabled', updated_at: new Date().toISOString()
        };
      });

      console.log('  📦 après dédup:', mapped.length, 'produits ('+deduped.length+' uniques)');
      for (let i = 0; i < mapped.length; i += 50) await supabaseUpsert('products', mapped.slice(i,i+50));
      console.log('  ✅', feed.name, ':', mapped.length, 'insérés');

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
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch(e) { text = new TextDecoder('iso-8859-1').decode(buffer); }

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

      const res = await fetch(feed.url);
      console.log('  HTTP status:', res.status, 'for', feed.name);
      if (!res.ok) { console.log('  ❌', feed.name, res.status); continue; }

      const buffer = await res.arrayBuffer();
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch(e) { text = new TextDecoder('iso-8859-1').decode(buffer); }

      console.log('  Feed size:', text.length, 'chars');

      const products = [];
      const seen = new Set();

      if (feed.format === 'xml' || text.trim().startsWith('<')) {
        // XML parser (réutilise la même logique qu'Effinity)
        const tagMatch = text.match(/<(item|product|offer|Product|entry|Article|ARTICLE|g:item)[\s>]/i);
        const xmlTag = tagMatch ? tagMatch[1] : 'item';
        console.log('  XML tag detected:', xmlTag);
        const regex = new RegExp('<' + xmlTag + '[^>]*>([\\s\\S]*?)<\\/' + xmlTag + '>', 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          const item = match[0];
          const get = tag => { const m = item.match(new RegExp('<'+tag+'[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</'+tag+'>','i')); return m?(m[1]||'').trim():''; };
          const p = {
            title: cleanTitle(get('title')||get('name')||get('g:title')||''),
            price: parseFloat((get('price')||get('g:price')||get('sale_price')||'0').replace(/[^\d.,]/g,'').replace(',','.')),
            url: get('link')||get('g:link')||get('url')||'',
            image_url: get('image_link')||get('g:image_link')||get('image')||'',
            ean: extractEAN(get('gtin')||get('g:gtin')||get('ean')||''),
            brand: get('brand')||get('g:brand')||'',
            product_id: get('id')||get('g:id')||get('item_id')||'',
          };
          if (!p.title || !p.url || p.price <= 0) continue;
          const key = p.product_id || (p.title.toLowerCase()+'_'+p.price);
          if (seen.has(key)) continue;
          seen.add(key);
          products.push(p);
          if (products.length >= feedLimit) break;
        }
      } else {
        // CSV parser RFC-4180
        const sep = feed.separator && feed.separator !== 'none' ? feed.separator : (text.includes('|') ? '|' : ',');
        function parseCSVLine(line, s) {
          const result = []; let field = ''; let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { if (inQuotes && line[i+1] === '"') { field += '"'; i++; } else inQuotes = !inQuotes; }
            else if (c === s && !inQuotes) { result.push(field); field = ''; }
            else field += c;
          }
          result.push(field);
          return result;
        }
        const cleanText = text.replace(/^\uFEFF/, '');
        const lines = cleanText.split('\n').filter(l => l.trim());
        const rawHdrs = parseCSVLine(lines[0], sep);
        const headers = rawHdrs.map(h => h.trim().replace(/^"|"$/g,'').toLowerCase().replace(/[\s\-\/]+/g,'_'));
        console.log('  CSV headers:', headers.join(', '), '| sep:', JSON.stringify(sep), '| cols:', headers.length);
        for (const line of lines.slice(1)) {
          if (!line.trim()) continue;
          const vals = parseCSVLine(line, sep);
          const obj = {}; headers.forEach((h,i) => obj[h] = (vals[i]||'').replace(/^"|"$/g,'').trim());
          const rawPrice = obj.price||obj.prix||obj.search_price||obj.sale_price||obj.regular_price||obj.product_price||obj.prix_ttc||obj.montant||obj.prix_ttc_remise||obj.prix_public||'0';
          // Colonnes spécifiques 1001 Pneus
          const pneuTitle = obj.marque && obj.profil ? (obj.marque+' '+obj.profil+' '+obj.largeur+'/'+obj.hauteur+'R'+obj.diametre) : '';
          const pneuUrl = obj.url_produit||obj.lien_produit||obj.affiliate||obj.url_affiliation||obj.lien||'';
          const pneuPrice = obj.prix_ttc||obj.prix_public||obj.tarif||'';
          const pneuImg = obj.image||obj.image_principale||obj.photo_produit||'';
          const pneuEan = obj.ean||obj.ean13||obj.code_barre||obj.gtin||'';
          const p = {
            title: cleanTitle(pneuTitle||obj.title||obj.name||obj.product_name||obj.nom||obj.designation||obj.libelle||''),
            price: parseFloat((pneuPrice||rawPrice).replace(/[^\d.,]/g,'').replace(',','.')||'0'),
            url: obj.link||pneuUrl||obj.url||obj.lien||obj.product_url||obj.aw_deep_link||obj.affiliate_link||obj.deeplink||obj.product_link||'',
            image_url: obj.image_link||pneuImg||obj.image||obj.image_url||obj.photo||obj.visuel||obj.aw_image_url||obj.merchant_image_url||'',
            ean: extractEAN(pneuEan||obj.gtin||obj.ean||obj.ean13||obj.barcode||obj.code_barre||obj.product_gtin||obj.mpn||''),
            brand: obj.brand||obj.brand_name||obj.marque||obj.fabricant||'',
            product_id: obj.id||obj.product_id||obj.item_id||obj.reference||obj.ref||obj.aw_product_id||'',
          };
          if (!p.title || !p.url || p.price <= 0) continue;
          const key = p.product_id || (p.title.toLowerCase()+'_'+p.price);
          if (seen.has(key)) continue;
          seen.add(key);
          products.push(p);
          if (products.length >= feedLimit) break;
        }
      }

      console.log('  Sample URL:', products[0]?.url);
      console.log('  📦', feed.name, ':', products.length, 'produits');

      const programId = 'affilae_feed_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g,'_');
      await supabaseUpsert('programs', [{ id:programId, title:feed.name, categories:[], countries:['FR'], updated_at:new Date().toISOString() }]);

      // Dédup par EAN
      const eanSeen = new Map();
      const deduped = [];
      for (const p of products) {
        if (p.ean) {
          if (!eanSeen.has(p.ean) || p.price < eanSeen.get(p.ean).price) eanSeen.set(p.ean, p);
        } else deduped.push(p);
      }
      deduped.push(...eanSeen.values());

      const mapped = deduped.map((p,i) => {
        const rawId = p.product_id ? programId+'_'+p.product_id : programId+'_'+i;
        return {
          id: rawId.replace(/[^a-z0-9_\-]/gi,'_').slice(0,100),
          affilae_id: rawId.slice(0,100), program_id: programId,
          title: p.title, description: null, price: p.price, currency: 'EUR',
          url: p.url, tracking_id: null, image_url: p.image_url||null,
          brand: p.brand||null, ean: p.ean||null,
          category: feed.category || detectCategory({ title:p.title, description:'', program:{title:feed.name} }),
          lang: 'fr', status: 'enabled', updated_at: new Date().toISOString()
        };
      });

      for (let i = 0; i < mapped.length; i += 50) await supabaseUpsert('products', mapped.slice(i,i+50));
      console.log('  ✅', feed.name, ':', mapped.length, 'insérés');

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

      const res = await fetch(feed.url, { headers: { 'Accept-Encoding': 'gzip' } });
      console.log('  HTTP status:', res.status, 'for', feed.name);
      if (!res.ok) { console.log('  ❌', feed.name, res.status); continue; }

      // Décompresse gzip si nécessaire
      const buffer = await res.arrayBuffer();
      let text;
      const bytes = new Uint8Array(buffer);
      // Détecte gzip magic bytes (1f 8b)
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const zlib = await import('zlib');
        const decompressed = await new Promise((resolve, reject) => {
          zlib.gunzip(Buffer.from(buffer), (err, result) => {
            if (err) reject(err); else resolve(result);
          });
        });
        text = decompressed.toString('utf-8');
      } else {
        text = new TextDecoder('utf-8').decode(buffer);
      }

      console.log('  Feed size:', text.length, 'chars');

      // Parse CSV Awin (séparateur virgule par défaut)
      function parseCSVLine(line, sep) {
        const result = []; let field = ''; let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') { if (inQuotes && line[i+1] === '"') { field += '"'; i++; } else inQuotes = !inQuotes; }
          else if (c === sep && !inQuotes) { result.push(field); field = ''; }
          else field += c;
        }
        result.push(field);
        return result;
      }

      const lines = text.split('\n').filter(l => l.trim());
      const sep = lines[0].includes('\t') ? '\t' : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ',');
      const headers = parseCSVLine(lines[0], sep).map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));

      const products = [];
      const seen = new Set();

      for (const line of lines.slice(1)) {
        if (!line.trim()) continue;
        const vals = parseCSVLine(line, sep);
        const obj = {}; headers.forEach((h, i) => obj[h] = (vals[i]||'').trim());

        const title = cleanTitle(obj.product_name || obj.name || obj.title || '');
        const url = obj.aw_deep_link || obj.merchant_deep_link || obj.url || '';
        const price = parseFloat(obj.search_price || obj.store_price || obj.price || '0');
        const image = obj.aw_image_url || obj.merchant_image_url || obj.large_image || '';
        const ean = extractEAN(obj.ean || obj.product_gtin || obj.upc || obj.isbn || '');
        const brand = obj.brand_name || obj.brand || '';
        const productId = obj.aw_product_id || obj.merchant_product_id || '';

        if (!title || !url || price <= 0) continue;
        const key = productId || (title.toLowerCase() + '_' + price);
        if (seen.has(key)) continue;
        seen.add(key);
        products.push({ title, url, price, image_url:image, ean, brand, product_id:productId });
        if (products.length >= feedLimit) break;
      }

      console.log('  Sample URL:', products[0]?.url);
      console.log('  📦', feed.name, ':', products.length, 'produits');

      const programId = 'awin_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await supabaseUpsert('programs', [{ id:programId, title:feed.name, categories:[], countries:['FR'], updated_at:new Date().toISOString() }]);

      // Dédup par EAN
      const eanSeen = new Map();
      const deduped = [];
      for (const p of products) {
        if (p.ean) {
          if (!eanSeen.has(p.ean) || p.price < eanSeen.get(p.ean).price) eanSeen.set(p.ean, p);
        } else deduped.push(p);
      }
      deduped.push(...eanSeen.values());

      const mapped = deduped.map((p, i) => {
        const rawId = p.product_id ? programId+'_'+p.product_id : programId+'_'+i;
        return {
          id: rawId.replace(/[^a-z0-9_\-]/gi,'_').slice(0,100),
          affilae_id: rawId.slice(0,100),
          program_id: programId,
          title: p.title, description: null,
          price: p.price, currency: feed.currency || 'EUR',
          url: p.url, tracking_id: null,
          image_url: p.image_url || null,
          brand: p.brand || null, ean: p.ean || null,
          category: feed.category || detectCategory({ title:p.title, description:'', program:{title:feed.name} }),
          lang: 'fr', status: 'enabled', updated_at: new Date().toISOString()
        };
      });

      for (let i = 0; i < mapped.length; i += 50) await supabaseUpsert('products', mapped.slice(i, i+50));
      console.log('  ✅', feed.name, ':', mapped.length, 'insérés');

    } catch(e) { console.log('  ⚠️', feed.name, ':', e.message); }
  }
  console.log('🎉 Awin done');
}

async function main() {
  try {
    await syncAffilae();
    await syncEffinity();
    await syncBCDJeux();
    await syncRakuten();
    await syncAffilaeFeeds();
    await syncAwin();
    if (_neonClient) await _neonClient.end();
    console.log('🎉 All done!');
  } catch(e) {
    console.error('❌ Failed:', e.message);
    if (_neonClient) await _neonClient.end();
    process.exit(1);
  }
}

main();
