import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EanIndex, MIN_VENDORS, merchantIdentity } from '../scripts/lib/ean-index.js';

test('two independent merchants make an exact EAN comparable by default', () => {
  assert.equal(MIN_VENDORS, 2);
  const index = new EanIndex();
  index.add('1234567890123', merchantIdentity('Marchand A'));
  assert.equal(index.isMulti('1234567890123'), false);
  index.add('1234567890123', merchantIdentity('Marchand B'));
  assert.equal(index.isMulti('1234567890123'), true);
});

test('the same merchant on Awin and CJ never counts twice', () => {
  const index = new EanIndex();
  index.add('1234567890123', merchantIdentity('Notino FR'));
  index.add('1234567890123', merchantIdentity('Notino France'));
  assert.equal(index.isMulti('1234567890123'), false);
  index.add('1234567890123', merchantIdentity('Rue du Commerce'));
  assert.equal(index.isMulti('1234567890123'), true);
});
