import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectCjPages, cjReadLimit } from '../scripts/lib/cj-pagination.js';

const products = Array.from({length: 7}, (_, id) => ({id: String(id)}));
test('complete pagination follows actual returned count even for short pages', async () => {
  const offsets = [];
  const result = await collectCjPages(async ({offset, limit}) => {
    offsets.push(offset);
    return { totalCount: 7, resultList: products.slice(offset, offset + Math.min(limit, 2)) };
  });
  assert.deepEqual(offsets, [0,2,4,6]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.items, products);
});
test('configured caps remain incomplete, except the two affected merchants', async () => {
  const result = await collectCjPages(async ({offset,limit}) => ({totalCount:7,resultList:products.slice(offset,offset+limit)}), {limit:3});
  assert.equal(result.complete, false);
  assert.equal(result.items.length, 3);
  assert.equal(cjReadLimit('Notino',5000), Infinity);
  assert.equal(cjReadLimit('Ugreen',600), Infinity);
  assert.equal(cjReadLimit('Other',600), 600);
});
test('empty complete catalogue is valid', async () => {
  assert.equal((await collectCjPages(async () => ({totalCount:0,resultList:[]}))).complete, true);
});
test('malformed, truncated, shifting and repeated pages fail closed', async () => {
  for (const response of [null, {}, {totalCount:null,resultList:[]}, {totalCount:7,resultList:[]}, {totalCount:1,resultList:[{}]}]) {
    await assert.rejects(collectCjPages(async () => response));
  }
  let calls = 0;
  await assert.rejects(collectCjPages(async () => ({totalCount:7,resultList:[{id:'1'},{id:'1'}]})), /Repeated/);
  await assert.rejects(collectCjPages(async () => ({totalCount: ++calls === 1 ? 7 : 8,resultList:[{id:String(calls)}]})), /changed/);
  await assert.rejects(collectCjPages(async () => { throw new Error('HTTP 503'); }), /503/);
});
test('CJ can legitimately repeat a SKU within a complete feed', async () => {
  const result = await collectCjPages(async () => ({totalCount:2,resultList:[{id:'same'},{id:'same'}]}));
  assert.equal(result.complete,true);
});
