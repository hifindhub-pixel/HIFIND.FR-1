import pg from 'pg';
import assert from 'node:assert/strict';
import { CLOSED_PROGRAMS } from './lib/closed-programs.js';
const client = new pg.Client({ connectionString:process.env.NEON_URL, connectionTimeoutMillis:15000 });
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await client.query("SET LOCAL statement_timeout = '60s'");
  const ids = Object.keys(CLOSED_PROGRAMS);
  const others = await client.query("SELECT COUNT(*)::int AS count FROM products WHERE status='enabled' AND (program_id IS NULL OR NOT (program_id=ANY($1::text[])))", [ids]);
  const result = await client.query("UPDATE products SET status='disabled' WHERE status='enabled' AND program_id=ANY($1::text[]) RETURNING program_id", [ids]);
  const remaining = await client.query("SELECT COUNT(*)::int AS count FROM products WHERE status='enabled' AND program_id=ANY($1::text[])", [ids]);
  const after = await client.query("SELECT COUNT(*)::int AS count FROM products WHERE status='enabled' AND (program_id IS NULL OR NOT (program_id=ANY($1::text[])))", [ids]);
  assert.equal(remaining.rows[0].count, 0, 'Closed programme still has enabled offers');
  assert.equal(after.rows[0].count, others.rows[0].count, 'Other programmes changed inside retirement transaction');
  await client.query('COMMIT');
  console.log(JSON.stringify({programmes:ids,disabled_offers:result.rowCount,remaining_enabled:0,other_enabled_offers:after.rows[0].count}));
} catch(error) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error('Closed feed retirement failed:', error.message);
  process.exitCode=1;
} finally { await client.end(); }
