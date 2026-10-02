// Read-only daily export: no history table in the constrained catalogue database.
import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
const client = new pg.Client({ connectionString: process.env.NEON_URL, connectionTimeoutMillis: 15000, statement_timeout: 120000 });
const dir = 'reports/catalogue-health';
try {
  await client.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const observedAt = new Date().toISOString();
  const size = await client.query("SELECT pg_database_size(current_database())::bigint AS database_bytes, pg_total_relation_size('products')::bigint AS products_bytes");
  const health = await client.query(`SELECT program_id, COUNT(*)::int AS offers,
    COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours')::int AS refreshed_24h,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '7 days' OR updated_at IS NULL)::int AS older_than_7d,
    COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '30 days' OR updated_at IS NULL)::int AS older_than_30d,
    MAX(updated_at) AS last_update FROM products WHERE status = 'enabled' GROUP BY program_id ORDER BY offers DESC`);
  await mkdir(dir, { recursive: true });
  // Keep raw merchant observations, not misleading minima mixing conditions/variants.
  await client.query(`DECLARE snapshot_cursor NO SCROLL CURSOR FOR
    SELECT id, ean, program_id, price, shipping_cost, updated_at
    FROM products WHERE status = 'enabled' AND price > 0 AND ean IS NOT NULL`);
  let count = 0;
  async function* observations() {
    yield JSON.stringify({ schema: 1, observed_at: observedAt, note: 'Catalogue observations; updated_at is the import time, not a merchant price verification.' }) + '\n';
    while (true) {
      const batch = await client.query('FETCH FORWARD 2000 FROM snapshot_cursor');
      if (!batch.rows.length) break;
      for (const row of batch.rows) { count++; yield JSON.stringify(row) + '\n'; }
    }
  }
  await pipeline(Readable.from(observations()), createGzip(), createWriteStream(`${dir}/prices.jsonl.gz`));
  await client.query('COMMIT');
  const report = { observed_at: observedAt, ...size.rows[0], archived_offers: count, merchants: health.rows };
  await writeFile(`${dir}/health.json`, JSON.stringify(report, null, 2));
  const total = health.rows.reduce((n, m) => n + m.offers, 0);
  const fresh = health.rows.reduce((n, m) => n + m.refreshed_24h, 0);
  const summary = `Catalogue: ${total} offres actives ; ${fresh} importées depuis 24 h ; ${count} observations archivées. Base: ${size.rows[0].database_bytes} octets.`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
} catch (error) {
  console.error('Catalogue health failed:', error.message);
  process.exitCode = 1;
} finally { await client.end(); }
