import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engagementScore, rankSearchResults, textRelevance } from '../scripts/lib/search-ranking.js';

test('an exact EAN and model reference outrank generic wording', () => {
  const exact = {ean:'0195949038327',title:'Apple iPhone 17 Pro 256 Go',product_type:'smartphone',offers_count:2};
  const generic = {ean:'1111111111111',title:'Coque compatible iPhone 17 Pro',product_type:'smartphone_accessory',offers_count:8};
  assert.ok(textRelevance(exact, exact.ean) > textRelevance(generic, exact.ean));
  assert.equal(rankSearchResults([generic, exact], 'iPhone 17 Pro', {primaryType:'smartphone'})[0].ean, exact.ean);
});

test('product intent wins before popularity', () => {
  const consoleProduct = {ean:'1',title:'Console Sony PlayStation 5 Slim',product_type:'console',offers_count:2};
  const popularGame = {ean:'2',title:'Grand Theft Auto V PS5',product_type:'video_game',offers_count:9};
  const engagement = new Map([['2',{detail_views:100000,offer_clicks:10000}]]);
  assert.equal(rankSearchResults([popularGame, consoleProduct], 'PS5', {primaryType:'console'}, engagement)[0].ean, '1');
});

test('real offer clicks break a relevance tie without linear runaway', () => {
  const a = {ean:'1',title:'Bose QuietComfort Ultra',brand:'Bose',product_type:'headphones',offers_count:2};
  const b = {...a,ean:'2',offers_count:3};
  const engagement = new Map([['1',{detail_views:2,offer_clicks:0}],['2',{detail_views:5,offer_clicks:3}]]);
  assert.equal(rankSearchResults([a,b], 'Bose', {}, engagement)[0].ean, '2');
  assert.ok(engagementScore({detail_views:1000000}) < 30);
});
