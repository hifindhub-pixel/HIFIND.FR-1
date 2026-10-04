import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getComparableProductDetail, prioritizeProductReferences } from '../api/products.js';
import { resetCacheForTests } from '../scripts/lib/merchants.js';

const rows = [
  { id:'case', ean:'1234567890123', title:'Coque iPhone 15 transparente', price:19, program_id:'accessory', status:'enabled', category:'high-tech' },
  { id:'phone-a', ean:'1234567890123', title:'Apple iPhone 15 128 Go noir', price:699, program_id:'shop-a', status:'enabled', category:'high-tech', brand:'Apple' },
  { id:'phone-b', ean:'1234567890123', title:'Smartphone Apple iPhone 15 128GB', price:719, program_id:'shop-b', status:'enabled', category:'high-tech', brand:'Apple' },
];

test('the canonical reference follows multi-feed product support before price', () => {
  assert.equal(prioritizeProductReferences(rows)[0].id, 'phone-a');
});

test('SEO and interactive detail share one comparable-product loader', async () => {
  resetCacheForTests();
  const client = { query: async sql => {
    if (sql.includes('SELECT p.*, pr.title AS program_title')) return { rows };
    if (sql.includes('SELECT DISTINCT ON (p.program_id)')) return { rows };
    if (sql.includes('merchant_aliases')) return { rows:[] };
    throw new Error(`Unexpected query: ${sql}`);
  }};
  const product = await getComparableProductDetail(client, { ean:'1234567890123', includeHistory:false });
  assert.equal(product.id, 'phone-a');
  assert.equal(product.offers_count, 3);
  assert.equal(product.ean_offers.length, 3);
  assert.equal('price_history' in product, false);
});
