// test/quarantine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectContradictions } from '../scripts/lib/quarantine.js';

test('PS5 reelle (3 libelles de marque, meme fabricant, categorie coherente) : PAS de contradiction', () => {
  // Faux positif trouve et corrige le 09/08 : "Sony", "Sony Interactive
  // Entertainment", "Playstation" sont 3 libelles du MEME fabricant --
  // aucune majorite textuelle, mais categorie identique partout. La
  // premiere version de detectContradictions flaguait ce cas a tort.
  const issues = detectContradictions('0711719021711', [
    { brand: 'Sony Interactive Entertainment', category: 'high-tech' },
    { brand: 'Sony', category: 'high-tech' },
    { brand: 'Playstation', category: 'high-tech' },
  ]);
  assert.equal(issues.length, 0);
});

test('marque ET categorie divergent ensemble : vraie contradiction', () => {
  const issues = detectContradictions('123', [
    { brand: 'Apple', category: 'high-tech' },
    { brand: 'Bissell', category: 'maison-jardin' },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].reason, 'brands_and_categories_no_majority');
});

test('vraie majorite de marque : geree par le filtre normal, pas de quarantaine necessaire', () => {
  const issues = detectContradictions('999', [
    { brand: 'Apple', category: 'high-tech' },
    { brand: 'Apple', category: 'high-tech' },
    { brand: 'Bissell', category: 'maison-jardin' },
  ]);
  assert.equal(issues.length, 0);
});
