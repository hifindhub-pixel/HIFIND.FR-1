import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awinDownloadKeys, parseAwinFeedList, loadAwinFeedList, awinFeedEntry } from '../scripts/lib/awin-feed-list.js';
const csv = 'Advertiser Name,Feed ID,Language,Membership Status,No of products,URL\n"Boutique, FR",42,French,Joined,10,https://productdata.awin.com/datafeed/download/apikey/valid/fid/42/';
test('official CSV language and URL fields are preserved', () => {
  const entry = awinFeedEntry(parseAwinFeedList(csv)[0]);
  assert.equal(entry.name,'Boutique, FR');
  assert.equal(entry.language,'french');
  assert.equal(entry.count,10);
  assert.ok(entry.url.endsWith('/fid/42/'));
});
test('download keys are only reused from known HTTPS Awin hosts', () => {
  assert.deepEqual(awinDownloadKeys('old',[
    {url:'https://productdata.awin.com/datafeed/download/apikey/good/fid/42'},
    {url:'https://evil.example/apikey/rejected'},
    {url:'http://productdata.awin.com/apikey/rejected'},
    {url:'https://ui.awin.com/productdata-darwin-download/publisher/123/darwin/1'}
  ]),['old','good','darwin']);
});
test('a rejected configured key falls back to an existing authorized download key', async () => {
  let calls=0;
  const rows=await loadAwinFeedList({apiKey:'old',feeds:[{url:'https://productdata.awin.com/apikey/good/'}],fetchImpl:async url=>{
    calls++;
    return url.endsWith('/old') ? new Response('',{status:401}) : new Response(csv);
  }});
  assert.equal(calls,2);assert.equal(rows.length,1);
});
test('failed access never exposes the credential or response body', async () => {
  await assert.rejects(loadAwinFeedList({apiKey:'private',fetchImpl:async()=>new Response('private',{status:401})}),error=>/HTTP 401/.test(error.message)&&!error.message.includes('private'));
});
test('quoted multiline fields and malformed lists are handled', () => {
  assert.equal(parseAwinFeedList('Feed ID,Advertiser Name\n1,"Line one\nline two"')[0]['Advertiser Name'],'Line one\nline two');
  assert.throws(()=>parseAwinFeedList('<html>login</html>'));
});
