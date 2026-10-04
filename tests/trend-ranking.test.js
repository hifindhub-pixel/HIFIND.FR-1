import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engagementTrendScore, engagementTrendSql, ENGAGEMENT_DECAY_SQL } from '../scripts/lib/trend-ranking.js';

test('fresh engagement outranks the same old engagement',()=>{
  const fresh=engagementTrendScore({views:100,clicks:10,ageDays:0});
  const old=engagementTrendScore({views:100,clicks:10,ageDays:21});
  assert.ok(fresh>old);
});

test('trend influence is capped against runaway traffic',()=>{
  assert.ok(engagementTrendScore({views:1e9,clicks:1e9})<=50);
});

test('SQL ranking uses decay, logarithms and caps',()=>{
  assert.match(ENGAGEMENT_DECAY_SQL,/POWER\(0\.5/);
  assert.match(engagementTrendSql('e'),/LEAST\(18/);
  assert.match(engagementTrendSql('e'),/LN\(1 \+ COALESCE\(e\.trend_clicks/);
});
