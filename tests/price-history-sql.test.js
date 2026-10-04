import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('latest price history exposes the timestamp used by the freshness guard', () => {
  const source = readFileSync(new URL('../scripts/capture-price-history.js', import.meta.url), 'utf8');
  const latest = source.match(/latest AS \(([\s\S]*?)\)\s*INSERT INTO price_history/);
  assert.ok(latest, 'latest CTE must exist');
  assert.match(latest[1], /SELECT DISTINCT ON \(ean\)[^\n]*observed_at/);
  assert.match(source, /l\.observed_at\s*<\s*NOW\(\)/);
});
