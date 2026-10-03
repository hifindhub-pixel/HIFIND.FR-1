import pkg from 'pg';
const { Client } = pkg;

const NEON_URL = process.env.NEON_URL;
if (!NEON_URL) throw new Error('NEON_URL manquant');

const client = new Client({ connectionString: NEON_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS price_history (
      ean TEXT NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      min_price NUMERIC(14,2) NOT NULL,
      avg_price NUMERIC(14,2) NOT NULL,
      max_price NUMERIC(14,2) NOT NULL,
      merchant_count SMALLINT NOT NULL,
      PRIMARY KEY (ean, observed_at)
    );
    CREATE INDEX IF NOT EXISTS idx_price_history_ean_date
      ON price_history (ean, observed_at DESC);
  `);

  const result = await client.query(`
    WITH current_prices AS (
      SELECT p.ean,
        ROUND(MIN(p.price)::numeric, 2) AS min_price,
        ROUND(AVG(p.price)::numeric, 2) AS avg_price,
        ROUND(MAX(p.price)::numeric, 2) AS max_price,
        COUNT(DISTINCT COALESCE(ma.merchant_id::text, p.program_id))::smallint AS merchant_count
      FROM products p
      LEFT JOIN merchant_aliases ma ON ma.raw_program_id = p.program_id
      WHERE p.status = 'enabled' AND p.ean IS NOT NULL AND p.price > 0
        AND p.program_id NOT LIKE '%darty%'
        AND NOT EXISTS (
          SELECT 1 FROM quarantined_eans q
          WHERE q.ean = p.ean AND q.resolved_at IS NULL
        )
      GROUP BY p.ean
      HAVING COUNT(DISTINCT COALESCE(ma.merchant_id::text, p.program_id)) >= 2
    ), latest AS (
      SELECT DISTINCT ON (ean) ean, min_price, avg_price, max_price, merchant_count
      FROM price_history ORDER BY ean, observed_at DESC
    )
    INSERT INTO price_history (ean, observed_at, min_price, avg_price, max_price, merchant_count)
    SELECT c.ean, NOW(), c.min_price, c.avg_price, c.max_price, c.merchant_count
    FROM current_prices c LEFT JOIN latest l USING (ean)
    WHERE l.ean IS NULL
       -- Un prix inchange doit quand meme construire un historique reel.
       -- Un point hebdomadaire suffit pour etablir la stabilite sans creer
       -- des millions de lignes quotidiennes inutiles.
       OR l.observed_at < NOW() - INTERVAL '7 days'
       OR c.min_price IS DISTINCT FROM l.min_price
       OR c.avg_price IS DISTINCT FROM l.avg_price
       OR c.max_price IS DISTINCT FROM l.max_price
       OR c.merchant_count IS DISTINCT FROM l.merchant_count
    RETURNING ean
  `);
  const deleted = await client.query(`DELETE FROM price_history WHERE observed_at < NOW() - INTERVAL '365 days'`);
  console.log(`Price history: ${result.rowCount} changements enregistrés, ${deleted.rowCount} anciennes observations supprimées.`);
} finally {
  await client.end();
}
