import test from 'node:test';
import assert from 'node:assert/strict';
import { priceDropsHtml } from '../scripts/discovery/baisses-prix.js';

test('price drops page explains its strict reference and shows verified reductions',()=>{
  const product={ean:'1234567890123',title:'Produit <test>',brand:'ACME',price:80,current_price:80,period_average:100,coverage_days:26,offers_count:2,ean_offers:[{price:80},{price:90}]};
  const html=priceDropsHtml({products:[product],period:30,page:1,pages:1,total:1});
  assert.match(html,/<link rel="canonical" href="https:\/\/hifind.fr\/baisses-de-prix\?periode=30">/);
  assert.match(html,/−20 %/);
  assert.match(html,/Moyenne 30 j : 100,00 €/);
  assert.match(html,/26 jours couverts/);
  assert.match(html,/moyenne pondérée/);
  assert.match(html,/Produit &lt;test&gt;/);
  assert.doesNotMatch(html,/Produit <test>/);
});

test('a discarded cheap offer cannot manufacture a price drop', async()=>{
  const {verifiedDrops}=await import('../scripts/discovery/baisses-prix.js');
  const stats=new Map([['x',{period_average:100,coverage_days:30}]]);
  assert.equal(verifiedDrops([{ean:'x',ean_offers:[{price:110},{price:120}]}],stats).length,0);
  assert.equal(verifiedDrops([{ean:'x',ean_offers:[{price:80},{price:120}]}],stats)[0].current_price,80);
});
