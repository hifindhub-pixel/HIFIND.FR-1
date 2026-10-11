import pg from 'pg';
import { streamFeed } from './lib/stream-feed.js';

const feeds = JSON.parse(process.env.EFFINITY_FEEDS || '[]');
const sets = [];
for (const name of ['Moto Axxe','Maxxess','Speedway']) {
  const feed = feeds.find(feed => feed.name === name);
  if (!feed) throw new Error('Missing configured feed: ' + name);
  const values = new Map(), lengths = {}, samples = [], byMpn = new Map(), byGtin = new Map();
  const result = await streamFeed(feed.url, {
    label:name,
    onHeaders(headers) { console.log(name + ' barcode headers: ' + JSON.stringify(headers.filter(h=>/ean|gtin|barcode|mpn|code.*bar/i.test(h)))); },
    onRecord(row) {
      if (typeof row === 'string') throw new Error('Expected confirmed CSV format');
      const fields = Object.fromEntries(Object.entries(row).filter(([key])=>/ean|gtin|barcode|mpn|code.*bar/i.test(key)));
      const identity = Object.fromEntries(Object.entries(row).filter(([key])=>/^(title|brand|gtin|mpn|size|color|item_group_id)$/.test(key)));
      if (row.mpn) { const list=byMpn.get(row.mpn)||[]; list.push(identity); byMpn.set(row.mpn,list); }
      if (row.gtin) byGtin.set(row.gtin,identity);
      if (samples.length < 4) samples.push(fields);
      for (const [key,value] of Object.entries(fields)) {
        const code=String(value).trim();
        if (!values.has(key)) values.set(key,new Set());
        if (code) values.get(key).add(code);
        lengths[key] ||= {};
        lengths[key][code.length]=(lengths[key][code.length] || 0)+1;
      }
      return true;
    }
  });
  if (result.stopped) throw new Error('Incomplete audit feed');
  sets.push({name,values,byMpn,byGtin});
  console.log(JSON.stringify({name,records:result.records,lengths,samples}));
}
let examples=0, ambiguousVariants=0;
for(const [mpn,left] of sets[0].byMpn) {
  const right=sets[1].byMpn.get(mpn);
  if (!right) continue;
  if(left.length>1 || right.length>1) ambiguousVariants++;
  if(examples++<5) console.log('Shared manufacturer reference: '+JSON.stringify({left:left.slice(0,3),right:right.slice(0,3)}));
}
console.log('Shared MPN groups with multiple variants: '+ambiguousVariants);
for (let i=0;i<sets.length;i++) for(let j=i+1;j<sets.length;j++) {
  for (const [a,left] of sets[i].values) for (const [b,right] of sets[j].values) {
    const normalized=new Set([...right].filter(s=>/^\d{8,14}$/.test(s)).map(s=>s.padStart(14,'0')));
    console.log(JSON.stringify({left:sets[i].name,leftField:a,right:sets[j].name,rightField:b,
      exact:[...left].filter(code=>right.has(code)).length,
      padded:[...left].filter(code=>/^\d{8,14}$/.test(code)&&normalized.has(code.padStart(14,'0'))).length}));
  }
}
const client=new pg.Client({connectionString:process.env.NEON_URL,connectionTimeoutMillis:15000});
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const result=await client.query(`SELECT program_id,COUNT(*)::int AS offers,
    COUNT(*) FILTER (WHERE updated_at < NOW()-INTERVAL '7 days' OR updated_at IS NULL)::int AS stale
    FROM products WHERE status='enabled' AND program_id=ANY($1::text[]) GROUP BY program_id`,
    [['effinity_moto_axxe','effinity_maxxess','effinity_speedway','cj_notino','cj_ugreen']]);
  console.log('Current offers: '+JSON.stringify(result.rows));
  const overlaps=await client.query(`SELECT p.program_id,p.ean,p.title,p.brand,p2.program_id AS other_program,p2.title AS other_title,p2.brand AS other_brand
    FROM products p JOIN products p2 ON p2.ean=p.ean AND p2.program_id<>p.program_id AND p2.status='enabled'
    WHERE p.status='enabled' AND p.program_id IN ('effinity_moto_axxe','effinity_maxxess') LIMIT 20`);
  console.log('Existing moto comparisons: '+JSON.stringify(overlaps.rows));
  await client.query('COMMIT');
} finally { await client.end(); }
