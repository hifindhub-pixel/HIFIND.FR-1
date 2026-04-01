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
const RAKUTEN_BASE         = 'https://api.rakutenadvertising.com';

async function syncRakuten() {
  console.log('🔄 Starting Rakuten sync...');

  if (!RAKUTEN_ACCESS_TOKEN) {
    console.log('⚠️ RAKUTEN_ACCESS_TOKEN missing — skipping');
    return;
  }

  try {
    // Test avec l'endpoint advertisers
    const res = await fetch(RAKUTEN_BASE + '/publishers/advertisers/approved', {
      headers: {
        'Authorization': 'Bearer ' + RAKUTEN_ACCESS_TOKEN,
        'Accept': 'application/json'
      }
    });

    const text = await res.text();
    console.log('Rakuten status:', res.status);
    console.log('Rakuten response:', text.slice(0, 300));

    if (!res.ok) return;

    const data = JSON.parse(text);
    const advertisers = data.data || data.advertisers || data || [];
    console.log('✅ Rakuten advertisers:', Array.isArray(advertisers) ? advertisers.length : 'unknown');

    if (Array.isArray(advertisers) && advertisers.length > 0) {
      const programs = advertisers.map(adv => ({
        id:         'rakuten_' + (adv.advertiserId || adv.id || Math.random().toString(36).slice(2)),
        title:      adv.advertiserName || adv.name || 'Rakuten Partner',
        categories: [],
        countries:  ['FR'],
        updated_at: new Date().toISOString()
      }));
      await supabaseUpsert('programs', programs);
      console.log('✅ Rakuten programs upserted:', programs.length);
    }
  } catch(e) {
    console.log('⚠️ Rakuten error:', e.message);
  }
}

async function syncAll() {
  await sync();
  try {
    await syncRakuten();
  } catch(e) {
    console.log('⚠️ Rakuten sync skipped:', e.message);
  }
  console.log('🎉 All syncs complete!');
}

// Remplace le sync() final par syncAll()
