import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePriceInsights } from '../scripts/lib/price-insights.js';

const now = new Date('2026-10-02T12:00:00Z');
const offers = [
  { price:80, updated_at:'2026-10-02T08:00:00Z' },
  { price:100, updated_at:'2026-10-02T08:00:00Z' },
  { price:120, updated_at:'2026-10-02T08:00:00Z' },
];

test('score works immediately without inventing historical data',()=>{
  const insight=computePriceInsights(offers,[],now);
  assert.equal(insight.history_status,'collecting');
  assert.equal(insight.history_low,null);
  assert.ok(insight.score>=65);
  assert.equal(insight.discount_vs_median_pct,20);
});

test('mature history contributes to the score and real trend',()=>{
  const history=[
    {observed_at:'2026-09-01',min_price:110},
    {observed_at:'2026-09-15',min_price:95},
    {observed_at:'2026-10-01',min_price:80},
  ];
  const insight=computePriceInsights(offers,history,now);
  assert.equal(insight.history_status,'ready');
  assert.equal(insight.history_low,80);
  assert.equal(insight.history_high,110);
  assert.equal(insight.change_30d_pct,-15.8);
  assert.ok(insight.components.history>0);
});
