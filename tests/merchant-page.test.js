import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merchantPageHtml } from '../api/marchand.js';
import { slugifyMerchant } from '../api/products.js';

const product={ean:'1234567890123',title:'Casque audio',brand:'ACME',price:99,image_url:'https://example.invalid/x.jpg',category_family:'TV, Audio & Vidéo',offers_count:2,ean_offers:[{price:99},{price:119}]};

test('merchant page is canonical, escaped and paginated',()=>{
  const html=merchantPageHtml({merchant:'Marchand & Fils',products:[product],total:65,page:2,pages:3});
  assert.match(html,/<link rel="canonical" href="https:\/\/hifind.fr\/marchand\/marchand-fils\?page=2">/);
  assert.match(html,/Marchand &amp; Fils/);
  assert.match(html,/rel="prev"/);
  assert.match(html,/rel="next"/);
  assert.match(html,/99,00 €/);
  assert.match(html,/2 marchands comparés/);
});

test('merchant slugs are stable and accent-free',()=>{
  assert.equal(slugifyMerchant('Électro Dépôt'), 'electro-depot');
});
