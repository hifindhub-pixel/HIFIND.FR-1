// test/merchants.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countDistinctMerchants, resetCacheForTests } from '../scripts/lib/merchants.js';

function makeFakeClient(rows, onQuery) {
  return {
    query: async () => {
      if (onQuery) onQuery();
      await new Promise(r => setTimeout(r, 5));   // simule une vraie latence reseau
      return { rows };
    },
  };
}

test('Footstore + Foot Store 2 comptent comme 1 seul marchand', async () => {
  resetCacheForTests();
  const client = makeFakeClient([
    { raw_program_id: 'awin_footstore', merchant_id: 1 },
    { raw_program_id: 'awin_foot_store_2', merchant_id: 1 },
  ]);
  const offers = [
    { program_id: 'awin_footstore' },
    { program_id: 'awin_foot_store_2' },
    { program_id: 'awin_pixmania' },
  ];
  assert.equal(await countDistinctMerchants(client, offers), 2);
});

test('appels concurrents : une seule requete SQL (protection contre la condition de course du 09/08)', async () => {
  resetCacheForTests();   // isole ce test du cache rempli par le test precedent
  // Bug reel : sans verrou pendingLoad, N appels concurrents (typique
  // d'une recherche affichant N produits) lancaient chacun leur propre
  // requete SQL avant que le tout premier n'ait fini de remplir le cache.
  let queryCount = 0;
  const client = makeFakeClient(
    [{ raw_program_id: 'awin_footstore', merchant_id: 1 }],
    () => { queryCount++; }
  );

  await Promise.all([
    countDistinctMerchants(client, [{ program_id: 'awin_footstore' }]),
    countDistinctMerchants(client, [{ program_id: 'awin_pixmania' }]),
    countDistinctMerchants(client, [{ program_id: 'awin_footstore' }]),
  ]);

  assert.equal(queryCount, 1);
});
