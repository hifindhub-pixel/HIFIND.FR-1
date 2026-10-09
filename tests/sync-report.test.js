import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSync } from '../scripts/check-sync-report.js';
const report = (failed = []) => ({status:'success', feeds:{ok:['Marchand (12)'],empty:[],failed}});

test('partial feed failures cannot be presented as a successful sync', () => {
  assert.equal(summarizeSync(report(['Marchand B (HTTP 404)'])).failed, true);
  assert.equal(summarizeSync(report()).failed, false);
  assert.equal(summarizeSync({...report(), status:'failed'}).failed, true);
});
test('empty feeds remain visible without being treated as download errors', () => {
  const value=report();value.feeds.empty=['Vide'];
  const result=summarizeSync(value);
  assert.equal(result.failed, false);
  assert.match(result.summary, /1 vides/);
});
test('missing report sections cannot pass the check', () => {
  assert.throws(()=>summarizeSync({status:'success'}));
});
test('signed feed URLs and injected lines are excluded from the summary', () => {
  const result=summarizeSync(report(['Marchand (https://feed.example/?token=private)\n::error::bad']));
  assert.doesNotMatch(result.summary, /token=|https:\/\/|\n::error/);
});
