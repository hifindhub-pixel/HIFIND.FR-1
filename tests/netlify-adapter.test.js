import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveRoute,invokeHandler} from '../scripts/lib/netlify-adapter.js';
import hifind from '../netlify/functions/hifind.mjs';
const url=path=>new URL(path,'https://hifind.fr');
test('routes preserve search parameters and enforce page identity',()=>{
 assert.deepEqual(resolveRoute(url('/api/products?action=search&q=caf%C3%A9')), {name:'products',query:{action:'search',q:'café'}});
 assert.deepEqual(resolveRoute(url('/produit/telephone-12345678?slug=wrong')), {name:'produit',query:{slug:'telephone-12345678'}});
 assert.deepEqual(resolveRoute(url('/marque/apple?page=2')), {name:'discovery',query:{page:'2',pageType:'marque',slug:'apple'}});
 assert.deepEqual(resolveRoute(url('/sitemap-3.xml')), {name:'sitemap',query:{part:'3'}});
 assert.equal(resolveRoute(url('/api/private')),null);
});
test('adapter preserves JSON status, body and cache headers',async()=>{
 const r=await invokeHandler((req,res)=>res.setHeader('Cache-Control','no-store').status(202).json(req.body),new Request(url('/api/engagement'),{method:'POST',body:JSON.stringify({ean:'12345678',event:'detail_view'})}),{});
 assert.equal(r.status,202);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal((await r.json()).event,'detail_view');
});
test('adapter preserves binary image bytes and HEAD has no body',async()=>{
 const fn=(req,res)=>res.setHeader('Content-Type','image/png').send(Buffer.from([0,128,255]));
 const r=await invokeHandler(fn,new Request(url('/api/img')),{});
 assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[0,128,255]);
 assert.equal(await (await invokeHandler(fn,new Request(url('/api/img'),{method:'HEAD'}),{})).text(),'');
});
test('invalid JSON and unsupported routes/methods are rejected',async()=>{
 const r=await invokeHandler(()=>assert.fail('must not invoke'),new Request(url('/api/engagement'),{method:'POST',body:'{bad'}),{});
 assert.equal(r.status,400);
 assert.equal((await hifind(new Request(url('/api/private')))).status,404);
 assert.equal((await hifind(new Request(url('/api/products'),{method:'DELETE'}))).status,405);
});
