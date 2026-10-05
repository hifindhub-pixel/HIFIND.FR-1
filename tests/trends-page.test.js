import test from 'node:test';
import assert from 'node:assert/strict';
import { trendsHtml } from '../api/tendances.js';

test('trends page is indexable, honest and based on comparable offers',()=>{
  const product={ean:'1234567890123',title:'Produit <tendance>',brand:'ACME',price:80,image_url:'https://example.test/p.jpg',ean_offers:[{price:80},{price:100}]};
  const html=trendsHtml({products:[product],page:1,pages:2,total:45});
  assert.match(html,/<link rel="canonical" href="https:\/\/hifind.fr\/tendances">/);
  assert.match(html,/rel="next"/);
  assert.match(html,/pondération décroissante sur sept jours/);
  assert.match(html,/2 marchands comparés/);
  assert.match(html,/20 % d’écart/);
  assert.match(html,/Produit &lt;tendance&gt;/);
  assert.doesNotMatch(html,/Produit <tendance>/);
});
