// ══════════════════════════════════════════
// HIFIND — Sync Affilae → Supabase
// Tourne toutes les heures via GitHub Actions
// ══════════════════════════════════════════

const AFFILAE_TOKEN  = process.env.AFFILAE_TOKEN;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY; // service_role

const AFFILAE_BASE   = 'https://rest.affilae.com';
const PAGE_SIZE = 50;

// ── Helpers ──────────────────────────────

async function affilaeGet(path) {
  const res = await fetch(AFFILAE_BASE + path, {
    headers: { 'Authorization': 'Bearer ' + AFFILAE_TOKEN }
  });
  if (!res.ok) throw new Error('Affilae error ' + res.status + ' on ' + path);
  return res.json();
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
  return res;
}

// ── Fetch all Affilae products (paginated) ─

async function fetchAllProducts() {
  let page = 1;
  let all  = [];

  while (true) {
    const data = await affilaeGet(
      '/publisher/products.list?limit=' + PAGE_SIZE + '&page=' + page
    );
    const items = data.data || data.items || [];
    if (!items.length) break;

    all = all.concat(items);
    console.log('Fetched page', page, '→', all.length, '/', data.count, 'products');

    if (all.length >= data.count) break;
    page++;
  }

  return all;
}

// ── Main sync ────────────────────────────

async function sync() {
  console.log('🔄 Starting Affilae → Supabase sync...');
  const startTime = Date.now();

  // 1. Fetch all products from Affilae
  const products = await fetchAllProducts();
  console.log('✅ Fetched', products.length, 'products from Affilae');

  // 2. Extract unique programs
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
  console.log('📦 Found', programs.length, 'programs');

  // 3. Upsert programs
  if (programs.length > 0) {
    await supabaseUpsert('programs', programs);
    console.log('✅ Programs upserted');
  }

  // 4. Map & upsert products (batch of 50)
  const mappedProducts = products.map(p => ({
    id:          p.id,
    affilae_id:  p.id,
    program_id:  p.program ? p.program.id : null,
    title:       p.title || p.name || '',
    description: p.description || null,
    price:       p.price ? p.price / 100 : null,  // centimes → euros
    currency:    p.currency || 'EUR',
    url:         p.url || null,
    tracking_id: p.trackingId || null,
    image_url:   p.images && p.images[0] ? p.images[0].url : null,
    category:    p.category || null,
    lang:        p.lang || 'fr',
    status:      p.status || 'enabled',
    updated_at:  new Date().toISOString()
  }));

  const batchSize = 50;
  for (let i = 0; i < mappedProducts.length; i += batchSize) {
    const batch = mappedProducts.slice(i, i + batchSize);
    await supabaseUpsert('products', batch);
    console.log('✅ Products upserted', i + batch.length, '/', mappedProducts.length);
  }

  // 5. Record price history for changed prices
  const priceHistory = mappedProducts
    .filter(p => p.price !== null)
    .map(p => ({
      product_id:  p.id,
      price:       p.price,
      recorded_at: new Date().toISOString()
    }));

  for (let i = 0; i < priceHistory.length; i += batchSize) {
    const batch = priceHistory.slice(i, i + batchSize);
    await fetch(SUPABASE_URL + '/rest/v1/price_history', {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify(batch)
    });
  }
  console.log('✅ Price history recorded:', priceHistory.length, 'entries');

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('🎉 Sync complete in', duration, 's —', products.length, 'products synced');
}

// ── Run ──────────────────────────────────
sync().catch(err => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});
