import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import pkg from 'pg';
import { rankedCandidates } from '../../api/products.js';

// Keep this benchmark read-only, including the transaction itself.
const client = new pkg.Client({ connectionString: process.env.NEON_URL });
function compactQuery(sql) {
  const compact = sql.replace(
    '), candidates AS (\n      SELECT p.*,',
    '), candidates AS MATERIALIZED (\n      SELECT p.id, p.ean, p.updated_at,',
  ).replaceAll('COUNT(*) OVER() AS total_count', '(SELECT COUNT(*) FROM representatives) AS total_count');
  assert.notEqual(compact, sql, 'Expected ranking query shape has changed');
  return compact;
}
function baselineQuery(sql) {
  return sql.replace(
    '), candidates AS MATERIALIZED (\n      SELECT p.id, p.ean, p.updated_at,',
    '), candidates AS (\n      SELECT p.*,',
  ).replaceAll('(SELECT COUNT(*) FROM representatives) AS total_count', 'COUNT(*) OVER() AS total_count');
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
    if (!options.category && !options.offset) {
      const planResult = await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + compactQuery(baselineQuery(query.text)), query.values);
      const plan = planResult.rows[0]['QUERY PLAN'][0];
      const nodes = [];
      function summarize(node, depth = 0) {
        nodes.push({depth, type:node['Node Type'], relation:node['Relation Name'],
          subplan:node['Subplan Name'], index:node['Index Name'],
          rows:node['Actual Rows'], loops:node['Actual Loops'],
          ms:node['Actual Total Time'], removed:node['Rows Removed by Filter'],
          tempRead:node['Temp Read Blocks'], tempWritten:node['Temp Written Blocks'],
          sort:node['Sort Method']});
        for (const child of node.Plans || []) summarize(child, depth + 1);
      }
      summarize(plan.Plan);
      console.log(JSON.stringify({query_plan:{execution_ms:plan['Execution Time'], planning_ms:plan['Planning Time'], jit:plan.JIT, nodes}}));
    }
    query.text = baselineQuery(query.text);
    const timings={baseline:[],compact:[]};
    let baseline;
    const rounds = !options.category && !options.offset ? 3 : 1;
    for(let round=0;round<rounds;round++) {
      for(const variant of round % 2 ? ['compact','baseline'] : ['baseline','compact']) {
        const start=performance.now();
        const result=await client.query(variant==='baseline'?query.text:compactQuery(query.text),query.values);
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
