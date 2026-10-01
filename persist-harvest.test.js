import test from 'node:test';
import assert from 'node:assert/strict';
import { persistHarvest } from './scripts/lib/persist-harvest.js';
const batch = (name, n) => ({ programId: name, meta: { title: name }, rows: Array.from({ length: n }, () => ({ category: 'beaute-bienetre' })) });

test('count committed offers only after merchant transaction completes', async () => {
  const sql = [], sizes = [];
  const result = await persistHarvest([batch('A', 51), batch('B', 2)], { query: async s => sql.push(s) }, async (table, rows) => { if (table === 'products') sizes.push(rows.length); });
  assert.deepEqual(sql, ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT']);
  assert.deepEqual(sizes, [50, 1, 2]);
  assert.equal(result.committed, 53);
  assert.equal(result.categories['beaute-bienetre'], 53);
});

test('quota failure rolls back whole merchant and stops later writes', async () => {
  const sql = []; let products = 0;
  await assert.rejects(persistHarvest([batch('A', 1), batch('B', 51), batch('C', 1)], { query: async s => sql.push(s) }, async table => {
    if (table === 'products' && ++products === 3) throw Object.assign(new Error('quota'), { code: '53100' });
  }), error => {
    assert.equal(error.report.committed, 1);
    assert.equal(error.report.planned, 53);
    assert.equal(error.report.failedMerchant, 'B');
    assert.equal(error.report.outcome, 'rolled_back');
    return true;
  });
  assert.deepEqual(sql, ['BEGIN', 'COMMIT', 'BEGIN', 'ROLLBACK']);
});

test('lost COMMIT response is explicitly unknown and not counted as success', async () => {
  await assert.rejects(persistHarvest([batch('A', 1)], { query: async s => { if (s === 'COMMIT') throw new Error('connection lost'); } }, async () => {}), e => e.report.committed === 0 && e.report.outcome === 'unknown');
});
