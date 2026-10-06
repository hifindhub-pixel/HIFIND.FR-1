import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import pkg from 'pg';
import { rankedCandidates } from '../../api/products.js';

// Keep this benchmark read-only, including the transaction itself.
const client = new pkg.Client({ connectionString: process.env.NEON_URL });
function narrowQuery(sql) {
  const narrow = sql.replace(
    'SELECT DISTINCT ON (p.ean) p.*, pr.title AS program_title\n      FROM products p LEFT JOIN programs pr ON p.program_id = pr.id',
    'SELECT DISTINCT ON (p.ean) p.id, p.ean, p.title, p.updated_at\n      FROM products p',
  );
  assert.notEqual(narrow, sql, 'Expected ranking query shape has changed');
  return `WITH ranked_page AS MATERIALIZED (${narrow})
    SELECT p.*, pr.title AS program_title, ranked_page.market_interest,
      ranked_page.trend_views, ranked_page.trend_clicks,
      ranked_page.trend_score, ranked_page.total_count
    FROM ranked_page JOIN products p ON p.id = ranked_page.id
    LEFT JOIN programs pr ON pr.id = p.program_id
    ORDER BY ranked_page.trend_score DESC, ranked_page.updated_at DESC NULLS LAST, ranked_page.ean`;
}
const signature = rows => rows.map(row => ({
  ean:row.ean, title:row.title, price:row.price, program_id:row.program_id,
  score:row.trend_score, views:row.trend_views, clicks:row.trend_clicks, total:row.total_count,
}));
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '25s'");
  for (const options of [{limit:30}, {limit:30,offset:30}, {category:'high-tech',limit:30}, {category:'innovations',limit:30}]) {
    let query;
    await rankedCandidates({query:async (text,values) => { query={text,values}; return {rows:[]}; }}, options);
    const timings={baseline:[],narrow:[]};
    let baseline;
    const rounds = !options.category && !options.offset ? 3 : 1;
    for(let round=0;round<rounds;round++) {
      for(const variant of round % 2 ? ['narrow','baseline'] : ['baseline','narrow']) {
        const start=performance.now();
        const result=await client.query(variant==='baseline'?query.text:narrowQuery(query.text),query.values);
        timings[variant].push(Math.round(performance.now()-start));
        const current=signature(result.rows);
        if(!baseline) baseline=current;
        assert.deepEqual(current,baseline,'Ranking changed for '+JSON.stringify(options));
      }
    }
    console.log(JSON.stringify({options,rows:baseline.length,equivalent:true,timings_ms:timings}));
  }
  await client.query('ROLLBACK');
} finally { await client.end(); }
