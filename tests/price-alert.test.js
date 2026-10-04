import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('// ══ LOCAL PRICE ALERTS ══'), html.indexOf('// ══ DETAIL ══'));
const context = {
  priceAlerts: {}, currentProduct:null, CURRENT_OFFERS:[],
  fmtEur(value) { return Number(value).toFixed(2) + ' €'; },
  localStorage:{ setItem() {} },
  document:{ getElementById() { return null; }, body:{ append() {}, style:{} } },
  Date, Math, Number, Boolean
};
vm.createContext(context);
vm.runInContext(source, context);

test('price target is reached only by a real current price at or below target', () => {
  const alert = { target:90 };
  assert.equal(context.isPriceTargetReached(alert, 89.99), true);
  assert.equal(context.isPriceTargetReached(alert, 90), true);
  assert.equal(context.isPriceTargetReached(alert, 90.01), false);
  assert.equal(context.isPriceTargetReached(alert, 0), false);
});

test('price alerts are keyed by EAN before internal product id', () => {
  assert.equal(context.priceAlertKey({ id:'internal', ean:'1234567890123' }), '1234567890123');
  assert.equal(context.priceAlertKey({ id:'internal' }), 'internal');
});

test('local alert copy clearly states that checks happen on later visits', () => {
  const product = { id:'p1', ean:'1234567890123' };
  context.priceAlerts['1234567890123'] = { target:80 };
  assert.match(context.priceAlertStatusHTML(product, 100), /prochaines visites/);
  assert.match(context.priceAlertStatusHTML(product, 75), /objectif de prix est atteint/);
});

test('a real product visit updates the last observed price', () => {
  const product = { id:'p1', ean:'1234567890123' };
  context.priceAlerts['1234567890123'] = { target:80, lastPrice:100 };
  context.recordPriceAlertObservation(product, 74.5);
  assert.equal(context.priceAlerts['1234567890123'].lastPrice, 74.5);
  assert.ok(context.priceAlerts['1234567890123'].lastCheckedAt);
});
