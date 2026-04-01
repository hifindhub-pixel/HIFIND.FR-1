const AFFILAE_TOKEN  = process.env.AFFILAE_TOKEN;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const AFFILAE_BASE   = 'https://rest.affilae.com';
const PAGE_SIZE      = 20;

// ── Catégorisation automatique ────────────
const CATEGORY_RULES = [
  { cat: 'beaute-bienetre', keywords: ['beauté','soin','crème','sérum','shampoing','cosmétique','parfum','visage','corps','cheveux','peau','maquillage','nail','ongles','lèvres','fond de teint','masque','huile','glow','lumineux','hydrat','anti-âge','collagène','vieillissement','démêlant','nettoyant','moistur','skincare','haircare','beauty'] },
  { cat: 'sante-nutrition', keywords: ['santé','complément','vitamine','minéral','probiotique','oméga','magnésium','zinc','fer','calcium','protéine','collagène','immunit','énergie','fatigue','sommeil','stress','anxiété','minceur','régime','détox','nutrition','médical','thérapie','aromathérapie','huile essentielle','phytothérapie','bien-être','wellness','supplément','gélule','capsule','spray','roll-on'] },
  { cat: 'mode-vetements', kwargs: ['mode','vêtement','habit','robe','pantalon','jean','chemise','veste','manteau','pull','t-shirt','chaussure','basket','sneaker','sac','accessoire','bijou','montre','ceinture','écharpe','chapeau','lingerie','sous-vêtement','maillot','sport wear','fashion','clothing','apparel','shoe','boot','sneaker'] },
  { cat: 'maison-jardin', keywords: ['maison','jardin','déco','meuble','cuisine','ménager','aspirateur','nettoyage','rangement','literie','coussin','rideau','plante','graine','potager','terrasse','balcon','outil','jardinage','arrosage','compost','fleur','arbuste','engrais','semence','home','garden','living'] },
  { cat: 'alimentation-bio', keywords: ['alimentation','bio','nourriture','repas','snack','boisson','thé','café','infusion','superaliment','graine','céréale','légumineuse','végétal','vegan','sans gluten','sans lactose','organic','food','nutrition','épicerie','conserve','sauce','huile d\'olive','miel','confiture'] },
  { cat: 'cbd-chanvre', keywords: ['cbd','chanvre','cannabis','hemp','cannabidiol','thc','cbg','terpène','résine','fleur cbd','huile cbd','e-liquide','vape','weed','herbe','legal'] },
  { cat: 'enfants-bebes', keywords: ['enfant','bébé','baby','kid','jouet','jeu','livre enfant','puériculture','poussette','siège auto','couche','biberon','lait maternisé','vêtement enfant','school','école','crèche','maternelle','apprentissage','éveil','montessori'] },
  { cat: 'sport-outdoor', keywords: ['sport','fitness','musculation','yoga','running','vélo','natation','randonnée','escalade','camping','outdoor','gym','équipement sportif','nutrition sportive','protéine sport','trail','ski','surf','paddle','tennis','football','basket'] },
  { cat: 'high-tech', keywords: ['tech','électronique','smartphone','téléphone','ordinateur','laptop','tablette','casque','écouteur','enceinte','appareil photo','drone','robot','smart','connecté','bluetooth','wifi','cable','chargeur','batterie','accessoire tech','gaming','jeu vidéo','console'] },
  { cat: 'animaux', keywords: ['animal','animaux','chien','chat','oiseau','poisson','lapin','hamster','pet','vétérinaire','croquette','nourriture animale','litière','collier','laisse','aquarium','terrarium','friandise animale'] },
  { cat: 'auto-moto', keywords: ['auto','moto','voiture','véhicule','scooter','entretien','pièce auto','accessoire auto','pneumatique','pneu','huile moteur','batterie voiture','gps','radar','dashcam','tuning','moteur','carrosserie'] },
];

// Affilae category → HiFind category
const AFFILAE_CAT_MAP = {
  'health-beauty':        'beaute-bienetre',
  'health_and_beauty':    'beaute-bienetre',
  'beaute':               'beaute-bienetre',
  'food-drink':           'alimentation-bio',
  'food_and_drink':       'alimentation-bio',
  'alimentation':         'alimentation-bio',
  'sports':               'sport-outdoor',
  'sport':                'sport-outdoor',
  'animals':              'animaux',
  'animals-pet-supplies': 'animaux',
  'pets':                 'animaux',
  'toys-games':           'enfants-bebes',
  'toys_and_games':       'enfants-bebes',
  'jouets':               'enfants-bebes',
  'gifts':                'enfants-bebes',
  'fashion':              'mode-vetements',
  'clothing':             'mode-vetements',
  'apparel':              'mode-vetements',
  'electronics':          'high-tech',
  'technology':           'high-tech',
  'home-garden':          'maison-jardin',
  'home_and_garden':      'maison-jardin',
  'automotive':           'auto-moto',
  'auto':                 'auto-moto',
};

function detectCategory(product) {
  // 1. Essaie le mapping direct depuis la catégorie Affilae
  const affilaeCat = (product.category || '').toLowerCase().trim();
  if (AFFILAE_CAT_MAP[affilaeCat]) return AFFILAE_CAT_MAP[affilaeCat];

  // 2. Analyse le texte du produit
  const text = [
    product.title || '',
    product.description || '',
    (product.program && product.program.title) || ''
  ].join(' ').toLowerCase();

  let bestCat = null;
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    const keywords = rule.keywords || rule.kwargs || [];
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCat = rule.cat;
    }
  }

  return bestCat || 'autres';
}

// ── Helpers ───────────────────────────────

async function affilaeGet(path) {
  const res = await fetch(AFFILAE_BASE + path, {
    headers: { 'Authorization': 'Bearer ' + AFFILAE_TOKEN }
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Affilae error:', text);
    throw new Error('Affilae error ' + res.status + ' on ' + path);
  }
  return JSON.parse(text);
}

async function supabaseUpsert(table, rows) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Supabase error on ' + table + ': ' + err);
  }
}

// ── Fetch all products ────────────────────

async function fetchAllProducts() {
  let offset = 0;
  let all    = [];
  while (true) {
    const data = await affilaeGet('/publisher/products.list?limit=' + PAGE_SIZE + '&offset=' + offset);
    const items = data.data || data.items || [];
    if (!items.length) break;
    all = all.concat(items);
    console.log('Fetched', all.length, '/', data.count, 'products');
    if (all.length >= data.count) break;
    offset += PAGE_SIZE;
  }
  return all;
}

// ── Main sync ─────────────────────────────

async function sync() {
  console.log('🔄 Starting sync...');
  const start = Date.now();

  const products = await fetchAllProducts();
  console.log('✅ Fetched', products.length, 'products');

  // Upsert programs
  const programsMap = {};
  products.forEach(p => {
    if (p.program && p.program.id) {
      programsMap[p.program.id] = {
        id:         p.program.id,
        title:      p.program.title,
        categories: p.program.categories || [],
        countries:  p.program.countries  || [],
        updated_at: new Date().toISOString()
      };
    }
  });
  const programs = Object.values(programsMap);
  if (programs.length) {
    await supabaseUpsert('programs', programs);
    console.log('✅ Upserted', programs.length, 'programs');
  }

  // Map & categorize products
  const mapped = products.map(p => {
    const hifindCat = detectCategory(p);
    const catStats = {};
    CATEGORY_RULES.forEach(r => { catStats[r.cat] = 0; });
    const text = ((p.title||'') + ' ' + (p.description||'')).toLowerCase();
    CATEGORY_RULES.forEach(r => {
      const kws = r.keywords || r.kwargs || [];
      kws.forEach(kw => { if (text.includes(kw)) catStats[r.cat]++; });
    });
    return {
      id:          p.id,
      affilae_id:  p.id,
      program_id:  p.program ? p.program.id : null,
      title:       p.title || p.name || '',
      description: p.description || null,
      price:       p.price ? p.price / 100 : null,
      currency:    p.currency || 'EUR',
      url:         p.url || null,
      tracking_id: p.trackingId || null,
      image_url:   p.images && p.images[0] ? p.images[0].url : null,
      category:    hifindCat,
      lang:        p.lang || 'fr',
      status:      p.status || 'enabled',
      updated_at:  new Date().toISOString()
    };
  });

  // Log category distribution
  const catCount = {};
  mapped.forEach(p => { catCount[p.category] = (catCount[p.category]||0)+1; });
  console.log('📊 Categories:', JSON.stringify(catCount));

  // Batch upsert products
  const batchSize = 50;
  for (let i = 0; i < mapped.length; i += batchSize) {
    await supabaseUpsert('products', mapped.slice(i, i + batchSize));
    console.log('✅ Products', i + Math.min(batchSize, mapped.length-i), '/', mapped.length);
  }

  // Price history
  const priceHistory = mapped.filter(p => p.price).map(p => ({
    product_id:  p.id,
    price:       p.price,
    recorded_at: new Date().toISOString()
  }));
  for (let i = 0; i < priceHistory.length; i += batchSize) {
    await fetch(SUPABASE_URL + '/rest/v1/price_history', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(priceHistory.slice(i, i + batchSize))
    });
  }

  console.log('🎉 Sync done in', ((Date.now()-start)/1000).toFixed(1), 's');
}

syncAll().catch(err => { console.error('❌ Sync failed:', err.message); process.exit(1); });

// ══════════════════════════════════════════
// RAKUTEN — Sync complémentaire
// ══════════════════════════════════════════
const RAKUTEN_ACCESS_TOKEN = process.env.RAKUTEN_ACCESS_TOKEN;

async function tryRakutenEndpoint(url, token) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const text = await res.text();
    console.log('Rakuten [' + url + '] status:', res.status, text.slice(0, 200));
    return { status: res.status, text };
  } catch(e) {
    console.log('Rakuten [' + url + '] error:', e.message);
    return null;
  }
}

async function syncRakuten() {
  console.log('🔄 Starting Rakuten sync...');
  if (!RAKUTEN_ACCESS_TOKEN) {
    console.log('⚠️ RAKUTEN_ACCESS_TOKEN missing — skipping');
    return;
  }

  // Test plusieurs endpoints possibles
  const endpoints = [
    'https://api.rakutenadvertising.com/v1/publishers/advertisers/approved',
    'https://api.rakutenadvertising.com/publishers/advertisers/approved',
    'https://ran-reporting.rakutenmarketing.com/en/reports/advertisers/filters',
  ];

  for (const url of endpoints) {
    const result = await tryRakutenEndpoint(url, RAKUTEN_ACCESS_TOKEN);
    if (result && result.status === 200) {
      try {
        const data = JSON.parse(result.text);
        const advertisers = data.data || data.advertisers || data || [];
        if (Array.isArray(advertisers) && advertisers.length > 0) {
          const programs = advertisers.map(adv => ({
            id:         'rakuten_' + (adv.advertiserId || adv.mid || adv.id || Math.random().toString(36).slice(2)),
            title:      adv.advertiserName || adv.name || 'Rakuten Partner',
            categories: [],
            countries:  ['FR'],
            updated_at: new Date().toISOString()
          }));
          await supabaseUpsert('programs', programs);
          console.log('✅ Rakuten programs:', programs.length);
          return;
        }
      } catch(e) {}
    }
  }
  console.log('⚠️ Rakuten — no valid endpoint found');
}


// ══════════════════════════════════════════
// EFFINITY — Sync multi-flux produits
// Secret EFFINITY_FEEDS = JSON array
// ══════════════════════════════════════════
const EFFINITY_FEEDS_JSON = process.env.EFFINITY_FEEDS;

async function parseProductFeed(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Feed error ' + res.status);
  const text = await res.text();

  if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : (data.products || data.items || data.data || []);
  }

  if (text.trim().startsWith('<')) {
    const items = text.match(/<item[^>]*>([\s\S]*?)<\/item>/gi) ||
                  text.match(/<product[^>]*>([\s\S]*?)<\/product>/gi) || [];
    return items.map(item => {
      const get = tag => {
        const m = item.match(new RegExp('<' + tag + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/' + tag + '>|<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
        return m ? (m[1] || m[2] || '').trim() : '';
      };
      return {
        title:       get('title') || get('name'),
        description: get('description') || get('description_short'),
        price:       parseFloat(get('price') || get('sale_price') || '0'),
        url:         get('link') || get('url') || get('product_url'),
        image_url:   get('image_link') || get('image') || get('image_url'),
        category:    get('google_product_category') || get('category') || '',
        brand:       get('brand') || '',
      };
    });
  }

  // CSV
  const lines = text.split('\n').filter(l => l.trim());
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g,'').toLowerCase());
  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g,''));
    const obj = {};
    headers.forEach((h,i) => obj[h] = vals[i] || '');
    return {
      title:       obj.title || obj.name || '',
      description: obj.description || '',
      price:       parseFloat(obj.price || obj.sale_price || '0'),
      url:         obj.link || obj.url || '',
      image_url:   obj.image_link || obj.image || '',
      category:    obj.category || '',
      brand:       obj.brand || '',
    };
  });
}

async function syncEffinity() {
  console.log('🔄 Starting Effinity sync...');
  if (!EFFINITY_FEEDS_JSON) {
    console.log('⚠️ EFFINITY_FEEDS missing — skipping');
    return;
  }

  let feeds;
  try {
    feeds = JSON.parse(EFFINITY_FEEDS_JSON);
  } catch(e) {
    console.log('❌ EFFINITY_FEEDS invalid JSON:', e.message);
    return;
  }

  for (const feed of feeds) {
    try {
      console.log('  → Syncing', feed.name, '...');
      const products = await parseProductFeed(feed.url);
      console.log('  ✅', feed.name, ':', products.length, 'products');

      const programId = 'effinity_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

      await supabaseUpsert('programs', [{
        id:         programId,
        title:      feed.name,
        categories: [],
        countries:  ['FR'],
        updated_at: new Date().toISOString()
      }]);

      const mapped = products
        .filter(p => p.title && p.url)
        .map((p, i) => ({
          id:          programId + '_' + i,
          affilae_id:  programId + '_' + i,
          program_id:  programId,
          title:       p.title,
          description: p.description || null,
          price:       p.price || null,
          currency:    'EUR',
          url:         feed.tracking || p.url,
          tracking_id: null,
          image_url:   p.image_url || null,
          category:    detectCategory(Object.assign(p, { program: { title: feed.name } })),
          lang:        'fr',
          status:      'enabled',
          updated_at:  new Date().toISOString()
        }));

      for (let i = 0; i < mapped.length; i += 50) {
        await supabaseUpsert('products', mapped.slice(i, i + 50));
      }
      console.log('  ✅', feed.name, 'upserted:', mapped.length);

    } catch(e) {
      console.log('  ⚠️', feed.name, 'error:', e.message);
    }
  }
}

async function syncAll() {
  await sync();
  try { await syncRakuten(); } catch(e) { console.log('⚠️ Rakuten skipped:', e.message); }
  try { await syncEffinity(); } catch(e) { console.log('⚠️ Effinity skipped:', e.message); }
  console.log('🎉 All syncs complete!');
}

// Remplace le sync() final par syncAll()
