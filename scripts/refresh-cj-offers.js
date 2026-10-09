import pg from 'pg';
import { collectCjPages } from './lib/cj-pagination.js';
import { cjRefreshRow, unambiguousCjRows } from './lib/cj-refresh.js';

const { CJ_TOKEN, CJ_PUBLISHER_ID, NEON_URL } = process.env;
if (!CJ_TOKEN || !CJ_PUBLISHER_ID || !NEON_URL) throw new Error('Required CJ/Neon configuration missing');
const feeds = JSON.parse(process.env.CJ_FEEDS || '[]');
const snapshots = [];
// Finish both catalogues before opening a database transaction. No stale offer
// is disabled here: only an exact existing product identity may be refreshed.
for (const name of ['notino', 'ugreen']) {
  const matches = feeds.filter(feed => String(feed.name).toLowerCase() === name);
  if (matches.length !== 1) throw new Error('Expected one configured CJ feed: ' + name);
  const feed = matches[0], partnerId = feed.advertiserId || feed.adId;
  if (!partnerId) throw new Error('Missing CJ advertiser identity');
  const observedAt = new Date().toISOString();
  const snapshot = await collectCjPages(async ({offset, limit, page}) => {
    const query = `{ products(companyId: ${JSON.stringify(String(CJ_PUBLISHER_ID))}, partnerIds: [${JSON.stringify(String(partnerId))}], limit: ${limit}${page ? ', page: ' + JSON.stringify(page) : ''}) { totalCount nextPage resultList { id title link price { amount currency } ... on Shopping { gtin mpn salePrice { amount currency } } } } }`;
    const response = await fetch('https://ads.api.cj.com/query', {
      method:'POST', headers:{Authorization:'Bearer ' + CJ_TOKEN,'Content-Type':'application/json'},
      body:JSON.stringify({query}), signal:AbortSignal.timeout(60000)
    });
    if (!response.ok) {
      const detail = (await response.text()).split(CJ_TOKEN).join('[redacted]').split(CJ_PUBLISHER_ID).join('[publisher]').replace(/https?:\/\/[^\s"<>]+/g,'[URL]').slice(0,700);
      throw new Error('CJ HTTP ' + response.status + ' offset=' + offset + ' limit=' + limit + ' ' + detail);
    }
    const body = await response.json();
    if (body.errors?.length) throw new Error('CJ GraphQL request failed');
    if (offset % 10000 === 0) console.log(name + ': page offset ' + offset);
    return body.data?.products;
  });
  if (!snapshot.complete || !snapshot.total) throw new Error('Incomplete or empty CJ catalogue: ' + name);
  const programId = 'cj_' + name;
  const { rows, ambiguous } = unambiguousCjRows(snapshot.items.map(product => cjRefreshRow(programId, product)).filter(Boolean));
  if (!rows.length) throw new Error('No valid EUR/GTIN products: ' + name);
  snapshots.push({programId, observedAt, total:snapshot.total, rows});
  console.log(JSON.stringify({programId, complete:true,total:snapshot.total,valid:rows.length,ambiguous}));
}

const client = new pg.Client({connectionString:NEON_URL,connectionTimeoutMillis:15000});
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await client.query("SET LOCAL statement_timeout='60s'");
  const reports = [];
  for (const snapshot of snapshots) {
    let updated = 0;
    for (let offset = 0; offset < snapshot.rows.length; offset += 1000) {
      const result = await client.query(`UPDATE products p SET price=r.price, updated_at=$3::timestamptz
        FROM jsonb_to_recordset($1::jsonb) AS r(id text, affilae_id text, ean text, price numeric)
        WHERE p.program_id=$2 AND p.status='enabled' AND p.id=r.id AND p.affilae_id=r.affilae_id AND p.ean=r.ean
          AND p.currency='EUR' AND (p.updated_at IS NULL OR p.updated_at <= $3::timestamptz)`,
        [JSON.stringify(snapshot.rows.slice(offset,offset+1000)),snapshot.programId,snapshot.observedAt]);
      updated += result.rowCount;
    }
    if (!updated) throw new Error('No existing offer matched: ' + snapshot.programId);
    const status = await client.query(`SELECT COUNT(*)::int active,
      COUNT(*) FILTER (WHERE updated_at < NOW()-INTERVAL '7 days' OR updated_at IS NULL)::int stale
      FROM products WHERE program_id=$1 AND status='enabled'`,[snapshot.programId]);
    reports.push({programId:snapshot.programId,catalogue:snapshot.total,updated,...status.rows[0]});
  }
  await client.query('COMMIT');
  console.log('Committed CJ refresh: ' + JSON.stringify(reports));
} catch (error) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error('CJ refresh failed: ' + error.message);
  process.exitCode=1;
} finally { await client.end(); }
