import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeedLifecycle } from '../scripts/lib/feed-lifecycle.js';

test('a merchant is archivable only after a non-empty complete feed', () => {
  const lifecycle = new FeedLifecycle();
  lifecycle.feedSucceeded('awin_ok', 1200);
  lifecycle.feedSucceeded('awin_empty', 0);
  assert.deepEqual(lifecycle.safePrograms(), ['awin_ok']);
});

test('one failed partition protects every offer of the merchant', () => {
  const lifecycle = new FeedLifecycle();
  lifecycle.feedSucceeded('awin_manomano', 20000);
  lifecycle.feedIncomplete('awin_manomano');
  lifecycle.feedSucceeded('cj_notino', 4000);
  lifecycle.ingestFailed('cj_notino');
  assert.deepEqual(lifecycle.safePrograms(), []);
  assert.deepEqual(lifecycle.summary(), {
    complete_programs:2,
    protected_incomplete_programs:1,
    protected_ingest_failures:1,
    safe_to_archive:0,
  });
});
