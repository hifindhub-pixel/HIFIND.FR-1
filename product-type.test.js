// test/product-type.test.js
//
// LOT 9 du cahier des charges : rejoue automatiquement, a chaque
// deploiement, tout ce qui a ete verifie manuellement aujourd'hui.
// Chaque cas ici correspond a un titre REEL vu en session ou a un
// critere d'acceptation explicite du cahier des charges -- aucun cas
// invente pour gonfler artificiellement le nombre de tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyProductType, parseQueryIntent } from '../api/product-type.js';

test('classification -- titres reels de la session du 09/08', () => {
  const cases = [
    ['Pack PS5 Slim & Fortnite Flowering Chaos - Console de jeux PlayStation 5 Slim 1 To', 'console'],
    ['Sony Console PlayStation 5 Pro avec Manette PS5 sans fil Dualsense', 'console'],
    ['Konix Naruto Shippuden Façade de protection pour console PS5 Slim', 'gaming_accessory'],
    ['GTA V PS5', 'video_game'],
    ['DualSense v3 - Manette PlayStation 5, Midnight black', 'gaming_accessory'],
    ['Casque Gaming Trust Carus Ps5 Blanc', 'gaming_accessory'],
    ['Apple iPhone 15 128 Go Noir', 'smartphone'],
    ['Samsung Galaxy S24 256 Go', 'smartphone'],
    ['Coque Samsung Galaxy S24', 'smartphone_accessory'],
    ['Jeu de societe avec cases numerotees Monopoly', 'other'],
  ];
  for (const [title, expected] of cases) {
    assert.equal(classifyProductType(title), expected, `titre: "${title}"`);
  }
});

test('classification -- accessoires en vocabulaire anglais (Apple)', () => {
  // Bug reel trouve le 09/08 : "Case"/"Cover" en anglais n'etaient
  // reconnus par aucune regle, ces produits retombaient a tort sur
  // "smartphone" plein, comme si c'etaient de vrais telephones.
  const titles = [
    'Apple Silicone Case with MagSafe Noir Apple iPhone 17 Pro',
    'Apple Clear Case with MagSafe iPhone 16',
    'BOYA BY-V3 Microphone Lavalier sans fil pour iPhone série 15/16 Samsung',
    'BOYA BY-V3 sans fil Lavalier revers Mirophone micro Rechargeable antibruit pour iPhone Android',
  ];
  for (const title of titles) {
    assert.equal(classifyProductType(title), 'smartphone_accessory', `titre: "${title}"`);
  }
});

test('classification -- HEAD étui universel (SQL réel du 09/08)', () => {
  const title = 'HEAD HDAC01 coque de protection pour téléphones portables 17,3 cm Étui avec dragonne Noir Universel iPhone 15 Pro, Google Pixel 7, Xiaomi 13';
  assert.equal(classifyProductType(title), 'smartphone_accessory');
});

test('intention de recherche -- 4 criteres d\'acceptation core du cahier des charges', () => {
  assert.equal(parseQueryIntent('PS5').primaryType, 'console', 'critere 2 : PS5');
  assert.equal(parseQueryIntent('jeu PS5').primaryType, 'video_game', 'critere 3 : jeu PS5');
  assert.equal(parseQueryIntent('manette PS5').primaryType, 'gaming_accessory', 'critere 4 : manette PS5');
  assert.equal(parseQueryIntent('iPhone 15').primaryType, 'smartphone', 'critere 1 : iPhone 15');
});

test('tri par palier -- console bat toujours un jeu sur une recherche nue, meme avec un score textuel plus faible', () => {
  // Reproduit le vrai bug du 09/08 : "GTA V PS5" (titre court, tres
  // dense en mots-cles) obtenait un score de similarite textuelle plus
  // eleve que le vrai titre de console, plus long et verbeux. Le tri
  // DOIT rester par palier (type exact d'abord), jamais par score seul.
  const intent = parseQueryIntent('PS5');
  const rows = [
    { title: 'GTA V PS5', score: 1.0079271 },
    { title: 'PS5 Pro 2 To - Console de jeux PlayStation 5 Pro (Digital) - Excellent état', score: 0.58 },
  ];
  const ranked = rows
    .map(r => ({ row: r, tier: classifyProductType(r.title) === intent.primaryType ? 1 : 0 }))
    .sort((a, b) => (b.tier - a.tier) || (b.row.score - a.row.score));
  assert.match(ranked[0].row.title, /Console/, 'la console doit gagner malgre un score textuel plus faible');
});
