import pg from 'pg';
import { streamFeed } from './lib/stream-feed.js';

const feed=JSON.parse(process.env.EFFINITY_FEEDS || '[]').find(feed=>feed.name==='Un Amour de Tapis');
if(!feed) throw new Error('Configured rug feed missing');
const eans=new Set();
const stats=await streamFeed(feed.url,{label:feed.name,onRecord(row){
  if(typeof row==='string') throw new Error('Expected CSV feed');
  const code=String(row.gtin || row.ean || row.ean13 || row.barcode || row.code_barre || row.mpn || '').trim();
  if(/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) {
    const digits=code.split('').map(Number), check=digits.pop();
    const sum=digits.reverse().reduce((s,d,i)=>s+d*(i%2===0?3:1),0);
    if((10-sum%10)%10===check)eans.add(code);
  }
  return true;
}});
if(stats.stopped || !eans.size) throw new Error('Incomplete or empty rug feed');
const client=new pg.Client({connectionString:process.env.NEON_URL,connectionTimeoutMillis:15000});
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='60s'");
  const size=await client.query(`SELECT pg_database_size(current_database())::bigint database_bytes,
    pg_total_relation_size('products')::bigint product_storage_bytes`);
  const matches=await client.query(`WITH source AS (SELECT unnest($1::text[]) ean), coverage AS (
    SELECT s.ean,COUNT(p.id) FILTER (WHERE p.program_id='effinity_un_amour_de_tapis') own,
    COUNT(p.id) FILTER (WHERE p.program_id<>'effinity_un_amour_de_tapis') other
    FROM source s LEFT JOIN products p ON p.ean=s.ean AND p.status='enabled' GROUP BY s.ean)
    SELECT COUNT(*)::int source_eans,
      COUNT(*) FILTER (WHERE own>0)::int currently_selected,
      COUNT(*) FILTER (WHERE own=0 AND other>0)::int absent_but_other_offer_selected,
      COUNT(*) FILTER (WHERE own=0 AND other=0)::int absent_entirely
    FROM coverage`,[[...eans]]);
  const history=await client.query(`SELECT day,observed_at,m->>'offers' AS selected_offers,m->>'older_than_7d' AS stale
    FROM catalogue_health_snapshots, jsonb_array_elements(snapshot->'merchants') m
    WHERE m->>'program_id'='effinity_un_amour_de_tapis' ORDER BY day DESC LIMIT 7`);
  console.log(JSON.stringify({source_records:stats.records,...matches.rows[0],...size.rows[0],history:history.rows}));
  await client.query('COMMIT');
} finally {await client.end();}
