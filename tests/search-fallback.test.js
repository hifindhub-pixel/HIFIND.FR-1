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
