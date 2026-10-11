import pg from 'pg';
import assert from 'node:assert/strict';
import { CONFIRMED_MOTO_COLLISIONS } from './lib/untrusted-feed-identities.js';

const client = new pg.Client({connectionString:process.env.NEON_URL,connectionTimeoutMillis:15000});
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await client.query("SET LOCAL statement_timeout='30s'");
  const other = await client.query(`SELECT COUNT(*)::int count FROM products WHERE status='enabled' AND program_id IS DISTINCT FROM 'effinity_moto_axxe'`);
  const result = await client.query(`UPDATE products SET status='disabled'
    WHERE program_id='effinity_moto_axxe' AND status='enabled' AND ean=ANY($1::text[]) RETURNING ean`, [CONFIRMED_MOTO_COLLISIONS]);
  const remaining = await client.query(`SELECT COUNT(*)::int count FROM products WHERE status='enabled'
    AND program_id='effinity_moto_axxe' AND ean=ANY($1::text[])`, [CONFIRMED_MOTO_COLLISIONS]);
  assert.equal(remaining.rows[0].count,0);
  const after = await client.query(`SELECT COUNT(*)::int count FROM products WHERE status='enabled' AND program_id IS DISTINCT FROM 'effinity_moto_axxe'`);
  assert.equal(after.rows[0].count,other.rows[0].count);
  await client.query('COMMIT');
  console.log(JSON.stringify({disabled_false_matches:result.rowCount,remaining_false_matches:0,other_active_offers:after.rows[0].count}));
} catch(error) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error(error.message); process.exitCode=1;
} finally { await client.end(); }
