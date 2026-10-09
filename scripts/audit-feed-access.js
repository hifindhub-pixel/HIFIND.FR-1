import { parseCSVLine } from './lib/stream-feed.js';
const targets = ['Roues et Roulettes','Ruedesplantes','Ecigplanete','April Eleven','Harlem Lifestyle','Biomedi','Geekbuying','Rakuten','Voghion Global'];
const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const wanted = s => targets.some(t => normal(s).includes(normal(t)));
const safeName = s => String(s).replace(/[\r\n]/g,' ').slice(0,100);
async function probe(url) {
  try {
    const response = await fetch(url, { signal:AbortSignal.timeout(15000) });
    await response.body?.cancel();
    return {status:response.status};
  } catch(error) { return {error:error.cause?.code || error.name}; }
}
function safeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key,value]) => {
    if (/key|token|password|secret/i.test(key)) return [key,'[masqué]'];
    if (typeof value !== 'string') return [key,typeof value === 'number' ? value : '[structure]'];
    if (/https?:\/\//i.test(value)) return [key,'[URL privée]'];
    return [key,safeName(value)];
  }));
}
for (const network of ['AWIN','EFFINITY']) {
  const feeds = JSON.parse(process.env[network+'_FEEDS'] || '[]');
  for(const feed of feeds.filter(f=>wanted(f.name))) {
    console.log(JSON.stringify({network,configured:safeName(feed.name),...await probe(feed.url)}));
  }
  const key=process.env[network+'_API_KEY'];
  if(!key) { console.log(JSON.stringify({network,list:'missing_key'}));continue; }
  const url=network==='AWIN'
    ? 'https://productdata.awin.com/datafeed/list/apikey/'+key
    : 'https://apiv2.effiliation.com/apiv2/productfeeds.json?key='+encodeURIComponent(key)+'&filter=mines';
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
    if(!response.ok) {console.log(JSON.stringify({network,list_status:response.status}));await response.body?.cancel();continue;}
    const text=await response.text();
    let rows;
    if(network==='AWIN') {
      const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
      const headers=parseCSVLine(lines.shift(),',');
      rows=lines.map(line=>Object.fromEntries(parseCSVLine(line,',').map((v,i)=>[headers[i],v])));
    } else { const data=JSON.parse(text); rows=Array.isArray(data)?data:(data.feeds||data.productfeeds||data.data||[]); }
    console.log(JSON.stringify({network,list_status:200,count:rows.length,fields:Object.keys(rows[0]||{})}));
    for(const row of rows.filter(row=>Object.values(row).some(value=>typeof value==='string'&&!value.includes('://')&&wanted(value)))) {
      const urls=Object.entries(row).filter(([k,v])=>typeof v==='string'&&/^https:\/\//i.test(v)&&/url|feed|csv|xml|link/i.test(k));
      const checks=[];for(const [field,url] of urls) checks.push({field,...await probe(url)});
      console.log(JSON.stringify({network,candidate:safeRow(row),checks}));
    }
  } catch(error) {console.log(JSON.stringify({network,list_error:error.cause?.code||error.name}));process.exitCode=1;}
}
console.log(JSON.stringify({legacy_rakuten:await probe('https://priceminister.effiliation.com/pm/api.html')}));
