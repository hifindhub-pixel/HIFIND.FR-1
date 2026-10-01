import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupWithOffers } from '../api/products.js';
import { countDistinctMerchants, resetCacheForTests } from '../scripts/lib/merchants.js';

test('catalogue remains readable at storage quota while excluding contradictory EANs', async () => {
  resetCacheForTests();
  const row = (ean, id, brand, category, price) => ({ ean, id, program_id:id, program_title:id, title:'Produit', brand, category, price });
  const offers = [row('good','a','Sony','high-tech',100), row('good','b','Sony','high-tech',120), row('bad','c','Apple','high-tech',20), row('bad','d','Bissell','maison-jardin',15)];
  const queries = [];
  const client = { query: async sql => {
    queries.push(sql);
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error('database storage quota exceeded');
    return { rows: sql.includes('merchant_aliases') ? [] : offers };
  }};
  const result = await groupWithOffers(client, [offers[0], offers[2]]);
  assert.equal(result.length,1);
  assert.equal(result[0].ean,'good');
  assert.equal(result[0].offers_count,2);
  assert.equal(result[0].price,100);
  assert.ok(queries.every(sql=>/^\s*SELECT\b/i.test(sql)));
});

test('merchant alias cache retries after a transient database failure', async () => {
  resetCacheForTests();
  let attempts=0;
  const client={query:async()=>{if(++attempts===1) throw new Error('temporary failure');return {rows:[{raw_program_id:'a',merchant_id:1},{raw_program_id:'b',merchant_id:1}]};}};
  const offers=[{program_id:'a'},{program_id:'b'}];
  await assert.rejects(countDistinctMerchants(client,offers),/temporary/);
  assert.equal(await countDistinctMerchants(client,offers),1);
  assert.equal(attempts,2);
});
