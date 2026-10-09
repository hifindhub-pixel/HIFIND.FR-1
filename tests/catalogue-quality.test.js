import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMerchant, evaluateCatalogue } from '../scripts/lib/catalogue-quality.js';

const merchant = (offers, extra = {}) => ({
  program_id: 'merchant-a', offers, older_than_7d:0, missing_image:0, uncategorized:0, ...extra,
});

test('a large merchant collapse is reported as critical', () => {
  const alerts = evaluateMerchant(merchant(400), merchant(1000));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, 'critical');
  assert.equal(alerts[0].code, 'offers_drop');
  assert.equal(alerts[0].drop_ratio, 0.6);
});

test('small volatile feeds do not create drop alerts', () => {
  assert.deepEqual(evaluateMerchant(merchant(5), merchant(80)), []);
});

test('staleness and content quality are evaluated independently', () => {
  const alerts = evaluateMerchant(merchant(1000, {
    older_than_7d: 700,
    missing_image: 250,
    uncategorized: 300,
  }), null);
  assert.deepEqual(alerts.map(item => item.code), ['stale_offers', 'missing_images', 'uncategorized']);
  assert.equal(alerts[0].severity, 'critical');
});

test('new EAN collisions surface without mutating the catalogue', () => {
  const result = evaluateCatalogue([merchant(500)], null, {
    unresolved_quarantines: 12,
    new_quarantines_24h: 3,
  });
  assert.equal(result.status, 'warning');
  assert.equal(result.counts.unresolved_quarantines, 12);
  assert.equal(result.alerts[0].code, 'new_ean_collisions');
});

test('a merchant that disappears entirely is reported as a complete loss', () => {
  const result = evaluateCatalogue([], { merchants:[merchant(500)] });
  assert.equal(result.status, 'critical');
  assert.equal(result.alerts[0].current_offers, 0);
  assert.equal(result.alerts[0].drop_ratio, 1);
});

test('a missing small feed still respects the minimum baseline threshold', () => {
  assert.equal(evaluateCatalogue([], { merchants:[merchant(20)] }).status, 'healthy');
});
