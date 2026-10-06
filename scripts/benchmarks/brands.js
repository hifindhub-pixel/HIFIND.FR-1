import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import pkg from 'pg';
import { BRAND_DIRECTORY_SQL } from '../lib/brand-directory.js';

const BASELINE_SQL = `SELECT p.brand, COUNT(DISTINCT p.ean)::int AS products,
      COUNT(DISTINCT COALESCE(ma.merchant_id::text,p.program_id))::int AS merchants
      FROM products p LEFT JOIN merchant_aliases ma ON ma.raw_program_id=p.program_id
      WHERE p.status='enabled' AND p.ean IS NOT NULL AND p.price>0 AND p.brand IS NOT NULL
        AND length(trim(p.brand)) BETWEEN 2 AND 80 AND p.program_id NOT LIKE '%darty%'
        AND EXISTS (SELECT 1 FROM products p2 LEFT JOIN merchant_aliases ma2 ON ma2.raw_program_id=p2.program_id
          WHERE p2.ean=p.ean AND p2.status='enabled'
          AND COALESCE(ma2.merchant_id::text,p2.program_id)<>COALESCE(ma.merchant_id::text,p.program_id))
      GROUP BY p.brand HAVING COUNT(DISTINCT p.ean)>=2
      ORDER BY products DESC, p.brand ASC LIMIT 1000`;
const client = new pkg.Client({ connectionString: process.env.NEON_URL });
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '25s'");
  let reference;
  const timings = { baseline:[], grouped:[] };
  for (let round = 0; round < 3; round++) {
    for (const variant of round % 2 ? ['grouped','baseline'] : ['baseline','grouped']) {
      const start = performance.now();
      const result = await client.query(variant === 'baseline' ? BASELINE_SQL : BRAND_DIRECTORY_SQL);
      timings[variant].push(Math.round(performance.now() - start));
      if (!reference) reference = result.rows;
      assert.deepEqual(result.rows, reference, 'Brand names, ordering or counters changed');
    }
  }
  console.log(JSON.stringify({ brands:reference.length, equivalent:true, timings_ms:timings }));
  await client.query('ROLLBACK');
} finally { await client.end(); }
