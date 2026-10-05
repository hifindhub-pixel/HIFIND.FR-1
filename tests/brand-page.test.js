import test from 'node:test';
import assert from 'node:assert/strict';
import { brandPageHtml } from '../api/marque.js';

const product={ean:'1234567890123',title:'Casque audio',brand:'ACME',price:99,image_url:'https://example.invalid/x.jpg',product_type_label:'Casques',offers_count:2,ean_offers:[{price:99,program_title:'A'},{price:119,program_title:'B'}]};

test('brand page is canonical, paginated and based on real offers',()=>{
  const html=brandPageHtml({brand:'ACME & Co',products:[product],total:62,page:2,pages:3});
  assert.match(html,/<link rel="canonical" href="https:\/\/hifind.fr\/marque\/acme-co\?page=2">/);
  assert.match(html,/ACME &amp; Co/);
  assert.match(html,/rel="prev"/);
  assert.match(html,/rel="next"/);
  assert.match(html,/2 marchands comparés/);
  assert.match(html,/id="brandProductsSearch"/);
  assert.match(html,/"@type":"Brand"/);
});
