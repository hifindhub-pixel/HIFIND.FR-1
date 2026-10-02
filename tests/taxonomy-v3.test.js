import {test} from 'node:test';
import assert from 'node:assert/strict';
import {categorize, CATEGORIES} from '../scripts/lib/categorize.js';
import {classifyProduct, classifyProductType, TAXONOMY, parseQueryIntent} from '../api/product-type.js';

// First six titles observed on the public catalogue on 2026-10-02.
const cases = [
 ['Scie Sabre 18v Lxt (machine Seule) Dans Valise Synthétique Makita Djr187zk','maison-jardin','power_tool'],
 ['Makita - Perforateur Burineur Sds-max 1350w 9,4 J Dans Valise Hr4511c','maison-jardin','power_tool'],
 ['Figurines et accessoires - LICENCE / - Coffret Deluxe - 13 figurines et accessoires, dans 5 poses, planche de surf - Neuf','enfants-bebes','toy'],
 ['Casque Shokz Open Swim Pro EU Rouge MP3','high-tech','headphones'],
 ['Bissell - Crosswave - Détergent Pet Pro Fébrèze 1l - B2550 -','maison-jardin','cleaning_product'],
 ['CLINIQUE Basic 3 Temps - Étape 2 : Lotion Exfoliante Peaux sèches à mixtes 400ml','beaute-bienetre','skincare'],
 // Synthetic boundary cases, not catalogue observations.
 ['Console murale bois','maison-jardin','furniture'],
 ['Pneu vélo Continental','sport-outdoor','sports_equipment'],
 ['Raquette Dunlop tennis','sport-outdoor','sports_equipment'],
 ['LEGO Nintendo console PS5','enfants-bebes','toy'],
 ['Figurine Nintendo Mario','enfants-bebes','toy'],
 ['Samsung Galaxy Watch 7','high-tech','smartwatch'],
 ['Samsung Galaxy Tab S9','high-tech','tablet'],
 ['Sacs pour aspirateur','maison-jardin','appliance_accessory'],
 ['Sac pour aspirateur','maison-jardin','appliance_accessory'],
 ['Coque iPhone 17','high-tech','smartphone_accessory'],
 ['Pneu 205/55 R16','auto-moto','tyre'],
];
for(const [title,category,type] of cases) test('taxonomy: '+title,()=>{
 const result=classifyProduct({title});
 assert.equal(result.category,category);assert.equal(result.product_type,type);
 assert.equal(classifyProductType(title),type);
 assert.equal(result.category_path[0],category);
 assert.equal(result.category_path.at(-1),type);
});
test('brands and opaque names never manufacture a category',()=>{
 for(const title of ['Pirelli','Goodyear','Dunlop','Continental','ZX 1500']){
  assert.equal(categorize({title,merchant:'Pneus FR',merchantCategory:'auto-moto'}).category,'autres');
  assert.equal(classifyProductType(title),'other');
 }
});
test('all types retain supported legacy categories',()=>{
 for(const [category,family,label] of Object.values(TAXONOMY)){
  assert.ok(CATEGORIES.includes(category));assert.ok(family);assert.ok(label);
 }
});
test('tabletop games do not request video games',()=>assert.notEqual(parseQueryIntent('jeu de société').primaryType,'video_game'));
test('existing precise device intent survives',()=>{
 assert.equal(parseQueryIntent('Galaxy S24').primaryType,'smartphone');
 assert.equal(parseQueryIntent('casque audio').primaryType,'headphones');
});

test('offer grouping keeps genuine merchant offers when a category changes', async()=>{
 const {groupWithOffers}=await import('../api/products.js');
 const {resetCacheForTests}=await import('../scripts/lib/merchants.js');
 resetCacheForTests();
 const titles=['Scie Sabre 18v Lxt Dans Valise Makita Djr187zk','Makita Scie sabre DJR187ZK'];
 const offers=titles.map((title,i)=>({id:String(i),program_id:'vendor'+i,program_title:'vendor'+i,
  ean:'0088381806879',title,brand:'Makita',category:i?'maison-jardin':'mode-vetements',price:200+i*10,url:'https://example.invalid/'+i}));
 const snapshot=structuredClone(offers);
 const client={query:async sql=>({rows:sql.includes('merchant_aliases')?[]:offers})};
 const result=await groupWithOffers(client,[offers[0]]);
 assert.equal(result.length,1);assert.equal(result[0].offers_count,2);
 assert.equal(result[0].category,'maison-jardin');assert.equal(result[0].price,200);
 assert.deepEqual(result[0].ean_offers.map(o=>o.url),offers.map(o=>o.url));
 assert.deepEqual(offers,snapshot);
});
