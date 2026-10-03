import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, {getPool} from '../api/products.js';
import {resetCacheForTests} from '../scripts/lib/merchants.js';

test('fallback search keeps comparable products with no category, suggestions contain real offers', async () => {
  const pool = getPool(), original = pool.connect;
  const offers = ['a','b'].map((id,i)=>({id,ean:'1234567890123',program_id:id,program_title:id,title:'Sony casque audio',brand:'Sony',category:'high-tech',price:100+i}));
  let released = 0;
  pool.connect = async () => ({release(){released++;}, async query(sql){
    if(sql.includes('merchant_aliases')) return {rows:[]};
    if(sql.includes('COUNT(DISTINCT')) return {rows:[{total:0}]};
    if(sql.includes('WITH matched')) return {rows:[]};
    return {rows:offers};
  }});
  try {
    for (const action of ['search','suggest']) {
      resetCacheForTests();
      let body, status;
      await handler({method:'GET',query:{action,q:'Sony'}}, {setHeader(){},status(s){status=s;return this;},json(b){body=b;}});
      assert.equal(status,200); assert.equal(body.data.length,1);
      assert.equal(body.data[0].offers_count,2);
      assert.equal(body.data[0].price,100);
    }
    assert.equal(released,2);
  } finally { pool.connect = original; }
});

test('exact brand outranks a similar stem even with a higher full-text score', async () => {
  resetCacheForTests();
  const pool = getPool(), original = pool.connect;
  const make = (brand, ean, exact, rank) => ['a','b'].map(id=>({id:ean+id,ean,program_id:id,program_title:id,title:brand+' produit',brand,category:'autres',price:100,rank,trgm_sim:0.1,exact_match:exact}));
  const boss = make('Boss','1',false,0.9), bose = make('Bose','2',true,0.1);
  pool.connect = async()=>({release(){},async query(sql){
    if(sql.includes('merchant_aliases')) return {rows:[]};
    if(sql.includes('COUNT(DISTINCT')) return {rows:[{total:2}]};
    if(sql.includes('WITH matched')) return {rows:[boss[0],bose[0]]};
    return {rows:[...boss,...bose]};
  }});
  try {
    let body;
    await handler({method:'GET',query:{action:'search',q:'Bose'}},{setHeader(){},status(){return this;},json(b){body=b;}});
    assert.equal(body.data[0].brand,'Bose');
  } finally {pool.connect=original;}
});

test('a cheaper accessory sharing an EAN cannot replace the real phone', async () => {
  resetCacheForTests();
  const pool = getPool(), original = pool.connect;
  const phone = id => ({id:'p'+id,ean:'0195949038327',program_id:'phone-'+id,program_title:'Phone '+id,
    title:'Apple iPhone 17 Pro 256 Go',brand:'Apple',category:'high-tech',price:1199,rank:0.4,trgm_sim:0.8,exact_match:false});
  const accessory = id => ({id:'a'+id,ean:'0195949038327',program_id:'case-'+id,program_title:'Case '+id,
    title:'Coque de protection pour iPhone 17 Pro',brand:'Apple',category:'high-tech',price:19,rank:0.7,trgm_sim:0.9,exact_match:false});
  const candidates = [accessory('a'),phone('a'),accessory('b'),phone('b')];
  pool.connect = async()=>({release(){},async query(sql){
    if(sql.includes('merchant_aliases')) return {rows:[]};
    if(sql.includes('COUNT(DISTINCT')) return {rows:[{total:1}]};
    if(sql.includes('WITH matched')) return {rows:candidates};
    if(sql.includes('product_engagement_daily')) return {rows:[]};
    return {rows:candidates};
  }});
  try {
    let body;
    await handler({method:'GET',query:{action:'search',q:'iPhone 17 Pro'}},{setHeader(){},status(){return this;},json(b){body=b;}});
    assert.equal(body.data.length,1);
    assert.equal(body.data[0].product_type,'smartphone');
    assert.equal(body.data[0].price,1199);
    assert.equal(body.data[0].ean_offers.length,2);
    assert.ok(body.data[0].ean_offers.every(offer => offer.product_type === 'smartphone'));
  } finally {pool.connect=original;}
});
