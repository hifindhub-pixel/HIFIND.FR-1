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
  assert.equal(insight.label,'Prix compétitif');
  assert.equal(insight.confidence,'limitée');
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
  assert.equal(insight.at_history_low,true);
  assert.equal(insight.label,'Au plus bas observé');
  assert.equal(insight.history_median,95);
  assert.equal(insight.lowest_observed_at,'2026-10-01');
  assert.ok(insight.components.history>0);
});

test('a high current price is never presented as a bargain',()=>{
  const expensiveOffers=[
    {price:125,updated_at:'2026-10-02T08:00:00Z'},
    {price:130,updated_at:'2026-10-02T08:00:00Z'},
    {price:135,updated_at:'2026-10-02T08:00:00Z'},
  ];
  const history=[
    {observed_at:'2026-08-01',min_price:90},
    {observed_at:'2026-09-01',min_price:100},
    {observed_at:'2026-10-01',min_price:110},
  ];
  const insight=computePriceInsights(expensiveOffers,history,now);
  assert.equal(insight.label,'Au-dessus du prix habituel');
  assert.ok(insight.vs_typical_pct>20);
  assert.equal(insight.at_history_low,false);
});
