import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('// ══ PRODUCT COMPARE ══'), html.indexOf('// ══ DETAIL ══'));
const context = {
  compareProducts: [], currentProduct: null, currentResults: [], favorites: [], homeProductsCache: {},
  localStorage: { setItem() {} },
  document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; }, body: { append() {}, style: {} } },
  normalizeMerchant(value) { return String(value || '').trim(); },
  setTimeout() { return 1; }, clearTimeout() {}, console
};
vm.createContext(context);
vm.runInContext(source, context);

test('comparison only accepts products from the same precise type', () => {
  assert.equal(context.productsCompatible({ product_type:'smartphone', category:'telephonie' }, { product_type:'smartphone', category:'telephonie' }), true);
  assert.equal(context.productsCompatible({ product_type:'smartphone', category:'telephonie' }, { product_type:'casque-audio', category:'audio-video' }), false);
  assert.equal(context.productsCompatible({ category:'informatique' }, { category:'informatique' }), true);
});

test('comparison metrics deduplicate merchants and never invent shipping', () => {
  const metrics = context.compareMetrics({ price:99, ean_offers:[
    { program_title:'Marchand A', price:100, shipping_cost:null },
    { program_title:'Marchand A', price:95, shipping_cost:null },
    { program_title:'Marchand B', price:110, shipping_cost:5 }
  ]});
  assert.equal(metrics.merchants, 2);
  assert.equal(metrics.best, 95);
  assert.equal(metrics.delivered, 115);
  assert.equal(metrics.spread, 15);
});

test('persisted comparison strips heavy offer payloads', () => {
  const compact = context.compactCompareProduct({ id:'p1', title:'Produit', category:'high-tech', ean_offers:[{ price:10 }], description:'longue' });
  assert.deepEqual(Object.keys(compact).sort(), ['category','id','title']);
});
