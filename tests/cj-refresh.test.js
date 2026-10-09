import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cjRefreshRow } from '../scripts/lib/cj-refresh.js';
const product = {id:'SKU:1',title:'Test',link:'https://example.com/product',gtin:'4006381333931',price:{amount:'25.90',currency:'EUR'}};
test('refresh matches the stored CJ identity and validated GTIN', () => {
  assert.deepEqual(cjRefreshRow('cj_notino',product),{id:'cj_notino_SKU_1',affilae_id:'cj_notino_SKU:1',ean:'4006381333931',price:25.9});
  assert.equal(cjRefreshRow('cj_notino',{...product,salePrice:{amount:'20',currency:'EUR'}}).price,20);
});
test('invalid barcode, currency, missing link and nonfinite prices cannot refresh offers', () => {
  for (const patch of [{gtin:'4006381333932'}, {link:''}, {price:{amount:'25',currency:'USD'}}, {price:{amount:'Infinity',currency:'EUR'}}, {id:''}]) {
    assert.equal(cjRefreshRow('cj_notino',{...product,...patch}),null);
  }
});
