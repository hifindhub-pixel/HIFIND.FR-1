// test/categorize.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textSignal } from '../scripts/lib/categorize.js';

test('GTA V ne tombe plus dans auto-moto (collision du mot "auto")', () => {
  const sig = textSignal({ title: 'Grand Theft Auto V - Edition Premium PS5', description: '', feedCat: '' });
  assert.notEqual(sig && sig.category, 'auto-moto');
});

test('les vraies pieces auto restent detectees (non-regression du fix GTA)', () => {
  const sig = textSignal({ title: 'Filtre a huile auto Renault Clio', description: '', feedCat: '' });
  assert.equal(sig.category, 'auto-moto');
});

test('titres de jeux avec plateforme identifiable -> high-tech (pas "autres")', () => {
  const cases = [
    'GTA V PS5',
    'GTA V - PS5 - Version Française',
  ];
  for (const title of cases) {
    const sig = textSignal({ title, description: '', feedCat: '' });
    assert.equal(sig && sig.category, 'high-tech', `titre: "${title}"`);
  }
});

test('limite connue et acceptee : un titre de jeu SANS mention de plateforme reste sans signal', () => {
  // "Rockstar Games Grand Theft Auto V - Neuf" ne contient ni "PS5" ni
  // aucun autre mot des listes de detection -- documente comme limite
  // honnete le 09/08, pas un bug a corriger par mot-cle (une liste de
  // noms de jeux serait necessaire, hors scope de la detection par texte).
  const sig = textSignal({ title: 'Rockstar Games Grand Theft Auto V - Neuf', description: '', feedCat: '' });
  assert.equal(sig, null);
});
