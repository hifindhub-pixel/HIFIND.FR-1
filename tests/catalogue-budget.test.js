import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetCatalogue, compactCatalogueRows } from '../scripts/lib/catalogue-budget.js';

const offer = (ean, program, extra = {}) => ({
  ean, program_id:program, price:100, title:`Produit ${ean}`, category:'high-tech', ...extra,
});

test('merchant diagnostics distinguish total storage pressure from per-product selection',()=>{
  const rows=[offer('1','a',{price:1}),offer('1','b',{price:2}),offer('1','c',{price:3}),
    offer('2','a'),offer('2','b')];
  const result=budgetCatalogue(rows,2,2);
  const merchant=id=>result.stats.merchant_selection.find(row=>row.program_id===id);
  assert.deepEqual(merchant('a'),{program_id:'a',input_offers:2,eligible_after_offer_cap:2,selected_offers:1,excluded_before_total_budget:0,excluded_by_total_budget:1});
  assert.deepEqual(merchant('c'),{program_id:'c',input_offers:1,eligible_after_offer_cap:0,selected_offers:0,excluded_before_total_budget:1,excluded_by_total_budget:0});
  assert.equal(result.stats.merchant_selection.reduce((sum,row)=>sum+row.selected_offers,0),result.rows.length);
  assert.equal(budgetCatalogue(rows,Infinity,2).stats.merchant_selection.every(row=>row.excluded_by_total_budget===0),true);
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

test('metadata compaction keeps one searchable description without touching offers',()=>{
  const rows=[
    offer('1','a',{price:90,description:'A'.repeat(900),url:'https://a.invalid'}),
    offer('1','b',{price:100,description:'description dupliquée',url:'https://b.invalid'}),
    offer('2','c',{price:80,description:null,url:'https://c.invalid'}),
    offer('2','d',{price:85,description:'description unique',url:'https://d.invalid'}),
  ];
  const stats=compactCatalogueRows(rows,600);
  assert.equal(rows[0].description.length,600);
  assert.equal(rows[1].description,null);
  assert.equal(rows[2].description,null);
  assert.equal(rows[3].description,'description unique');
  assert.deepEqual(rows.map(row=>row.url),['https://a.invalid','https://b.invalid','https://c.invalid','https://d.invalid']);
  assert.equal(stats.descriptions_before,3);
  assert.equal(stats.descriptions_after,2);
  assert.ok(stats.characters_saved>0);
});
