import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productDisplayTitle } from '../scripts/lib/product-display-title.js';
const base={ean:'8715946667836',brand:'Epson',title:'Epson imprimante EcoTank - Noir',program_id:'a',price:100};
const a={...base,program_id:'b',title:'Epson EcoTank ET-16600 - Neuf',price:120};
const b={...base,program_id:'c',title:'Imprimante multifonction couleur A3+ EcoTank ET-16600 Epson',price:130};
test('a generic title gains a model confirmed by two merchants without changing prices or offers',()=>{
  const offers=[base,a,b], before=JSON.stringify(offers);
  assert.equal(productDisplayTitle(base,offers),a.title);
  assert.equal(JSON.stringify(offers),before);
});
test('one merchant, different GTIN, different brand or conflicting models cannot establish consensus',()=>{
  for(const second of [{...b,program_id:'b'},{...b,ean:'other'},{...b,brand:'Canon'},{...b,title:'Epson EcoTank ET-16650'}]) {
    assert.equal(productDisplayTitle(base,[a,second]),base.title);
  }
  assert.equal(productDisplayTitle(base,[a,b],()=> 'same-merchant'),base.title);
});
test('already precise titles and ambiguous multiple model references are preserved',()=>{
  assert.equal(productDisplayTitle(a,[a,b]),a.title);
  const kit={...a,title:'Epson ET-16600 ET-16650'};
  assert.equal(productDisplayTitle(base,[kit,{...kit,program_id:'c'}]),base.title);
});
