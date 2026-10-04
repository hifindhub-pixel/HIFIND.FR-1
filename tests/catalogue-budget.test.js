import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetCatalogue } from '../scripts/lib/catalogue-budget.js';

const offer = (ean, program, extra = {}) => ({
  ean, program_id:program, price:100, title:`Produit ${ean}`, category:'high-tech', ...extra,
});

test('storage budget never leaves a product with one merchant',()=>{
  const rows=[offer('1','a'),offer('1','b'),offer('2','a'),offer('2','b')];
  const result=budgetCatalogue(rows,3);
  assert.equal(result.rows.length,2);
  assert.equal(new Set(result.rows.map(row=>row.ean)).size,1);
});

test('merchant coverage wins before feed order',()=>{
  const rows=[offer('2','a'),offer('2','b'),offer('1','a'),offer('1','b'),offer('1','c')];
  const result=budgetCatalogue(rows,3);
  assert.deepEqual([...result.eans],['1']);
  assert.equal(result.rows.length,3);
});

test('known and complete products win deterministic ties',()=>{
  const rows=[
    offer('1','a',{category:'autres'}),offer('1','b',{category:'autres'}),
    offer('2','a',{image_url:'x'}),offer('2','b',{brand:'Marque'}),
  ];
  const result=budgetCatalogue(rows,2);
  assert.deepEqual([...result.eans],['2']);
  assert.equal(result.stats.capped,true);
});

test('offers are deduplicated by merchant and capped per product',()=>{
  const rows=[offer('1','a',{price:110}),offer('1','a',{price:90}),offer('1','b'),offer('1','c'),offer('1','d'),offer('1','e')];
  const result=budgetCatalogue(rows,10,4);
  assert.equal(result.rows.length,4);
  assert.equal(result.rows.filter(row=>row.program_id==='a')[0].price,90);
});
