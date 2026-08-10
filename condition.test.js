// test/condition.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCondition, filterByCondition } from '../scripts/lib/condition.js';

test('extraction sur titres reels de la session du 09/08', () => {
  const cases = [
    ['Rockstar Games Grand Theft Auto V - Neuf', 'neuf'],
    ['PS5 Pro 2 To - Console de jeux PlayStation 5 Pro (Digital) - Excellent état', 'occasion'],
    ['Pack PS5 Slim & Fortnite Flowering Chaos - ... (Standard) - Bon état', 'occasion'],
    ['Rematch Elite Edition (PS5) - Excellent état', 'occasion'],
    ['Konix Naruto Shippuden Façade de protection pour console PS5 Slim', 'neuf'],
    ['iPhone 15 128 Go Reconditionné Grade A', 'reconditionne'],
    ['Apple iPhone 15 128 Go Noir', 'neuf'],
  ];
  for (const [title, expected] of cases) {
    assert.equal(extractCondition(title), expected, `titre: "${title}"`);
  }
});

test('filtrage : l\'etat majoritaire l\'emporte', () => {
  const offers = [
    { title: 'GTA V PS5 - Neuf', price: 45 },
    { title: 'GTA V PS5 - Neuf', price: 42 },
    { title: 'GTA V PS5 - Excellent état', price: 25 },
  ];
  const filtered = filterByCondition(offers);
  assert.equal(filtered.length, 2);
  assert.ok(filtered.every(o => extractCondition(o.title) === 'neuf'));
});

test('filtrage : une egalite ne doit RIEN exclure (comme le fix marque)', () => {
  const offers = [
    { title: 'GTA V PS5 - Neuf', price: 45 },
    { title: 'GTA V PS5 - Excellent état', price: 25 },
  ];
  assert.equal(filterByCondition(offers).length, 2);
});
