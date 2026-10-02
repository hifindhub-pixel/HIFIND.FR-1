// Migration Supabase → Neon
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const NEON_URL     = process.env.NEON_URL;

async function supabaseQuery(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase ' + res.status + ': ' + await res.text());
  return res.json();
}

async function main() {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: NEON_URL });
  await client.connect();
  console.log('✅ Connecté à Neon');

  // Crée les tables
  await client.query(`
    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      title TEXT,
      categories JSONB DEFAULT '[]',
      countries JSONB DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      affilae_id TEXT,
      program_id TEXT,
      title TEXT,
      description TEXT,
      price NUMERIC,
      currency TEXT DEFAULT 'EUR',
      url TEXT,
      tracking_id TEXT,
      image_url TEXT,
      category TEXT,
      lang TEXT DEFAULT 'fr',
      status TEXT DEFAULT 'enabled',
      ean TEXT,
      brand TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean) WHERE ean IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_products_active_ean_program_price ON products(ean, program_id, price) WHERE status='enabled' AND ean IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_products_active_category_ean_price ON products(category, ean, price) WHERE status='enabled' AND ean IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_products_active_program_ean ON products(program_id, ean) WHERE status='enabled' AND ean IS NOT NULL;
    CREATE TABLE IF NOT EXISTS price_history (
      ean TEXT NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      min_price NUMERIC(14,2) NOT NULL,
      avg_price NUMERIC(14,2) NOT NULL,
      max_price NUMERIC(14,2) NOT NULL,
      merchant_count SMALLINT NOT NULL,
      PRIMARY KEY (ean, observed_at)
    );
    CREATE INDEX IF NOT EXISTS idx_price_history_ean_date ON price_history(ean, observed_at DESC);
  `);
  console.log('✅ Tables créées');

  // Migre programs
  let offset = 0;
  while (true) {
    const programs = await supabaseQuery('programs?select=*&limit=500&offset=' + offset);
    if (!programs.length) break;
    for (const p of programs) {
      await client.query(`
        INSERT INTO programs (id, title, categories, countries, updated_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, updated_at=EXCLUDED.updated_at
      `, [p.id, p.title, JSON.stringify(p.categories||[]), JSON.stringify(p.countries||[]), p.updated_at]);
    }
    offset += 500;
    console.log('✅ Programs:', offset);
    if (programs.length < 500) break;
  }

  // Migre products par batch de 500
  offset = 0;
  let total = 0;
  while (true) {
    const products = await supabaseQuery('products?select=*&limit=500&offset=' + offset);
    if (!products.length) break;
    for (const p of products) {
      await client.query(`
        INSERT INTO products (id,affilae_id,program_id,title,description,price,currency,url,tracking_id,image_url,category,lang,status,ean,brand,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,price=EXCLUDED.price,ean=EXCLUDED.ean,brand=EXCLUDED.brand,updated_at=EXCLUDED.updated_at
      `, [p.id,p.affilae_id,p.program_id,p.title,p.description,p.price,p.currency||'EUR',p.url,p.tracking_id,p.image_url,p.category,p.lang||'fr',p.status||'enabled',p.ean,p.brand,p.updated_at]);
    }
    total += products.length;
    offset += 500;
    console.log('✅ Products:', total);
    if (products.length < 500) break;
  }

  await client.end();
  console.log('🎉 Migration terminée !', total, 'produits');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
