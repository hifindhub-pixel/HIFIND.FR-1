import pkg from 'pg';
const { Client } = pkg;

if (!process.env.NEON_URL) throw new Error('NEON_URL manquant');
const client = new Client({ connectionString: process.env.NEON_URL });

const statements = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_active_ean_program_price
    ON products (ean, program_id, price) WHERE status = 'enabled' AND ean IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_active_category_ean_price
    ON products (category, ean, price) WHERE status = 'enabled' AND ean IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_active_program_ean
    ON products (program_id, ean) WHERE status = 'enabled' AND ean IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_active_updated
    ON products (updated_at DESC) WHERE status = 'enabled'`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_merchant_aliases_raw_program
    ON merchant_aliases (raw_program_id)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quarantined_eans_unresolved
    ON quarantined_eans (ean) WHERE resolved_at IS NULL`,
];

try {
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS product_engagement_daily (
    ean TEXT NOT NULL,
    day DATE NOT NULL DEFAULT CURRENT_DATE,
    detail_views INTEGER NOT NULL DEFAULT 0,
    offer_clicks INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ean, day)
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_product_engagement_day_ean
    ON product_engagement_daily (day DESC, ean)`);
  try { await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm'); }
  catch (error) { console.warn('Extension pg_trgm:', error.message); }

  const columns = await client.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products'`);
  const names = new Set(columns.rows.map(row => row.column_name));
  if (names.has('search_vector')) statements.push(
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_search_vector_gin ON products USING GIN (search_vector)`
  );
  if (names.has('title')) statements.push(
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_title_trgm ON products USING GIN (title gin_trgm_ops)`
  );

  for (const sql of statements) {
    try {
      const name = sql.match(/INDEX CONCURRENTLY IF NOT EXISTS\s+(\S+)/i)?.[1] || 'index';
      const started = Date.now();
      await client.query(sql);
      console.log(`${name}: prêt (${Date.now() - started} ms)`);
    } catch (error) {
      console.warn(`Index ignoré: ${error.message}`);
    }
  }
  await client.query('ANALYZE products');
  console.log('Optimisation PostgreSQL terminée.');
} finally {
  await client.end();
}
