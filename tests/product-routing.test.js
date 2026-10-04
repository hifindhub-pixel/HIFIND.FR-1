import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEanFromSlug, productPath, renderProductShell } from '../api/produit.js';
import engagementHandler from '../api/engagement.js';
import { CATEGORY_META } from '../api/categorie.js';

test('clean product URLs render the interactive app with indexable metadata', () => {
  const product={ean:'1234567890123',title:'Téléphone <Premium>',brand:'Marque & Co',description:'Description réelle',
    image_url:'https://images.example.test/p.jpg',price:699,offers_count:2,
    ean_offers:[{price:699},{price:749}]};
  assert.equal(extractEanFromSlug('telephone-premium-1234567890123'),'1234567890123');
  assert.equal(productPath(product),'/produit/telephone-premium-1234567890123');
  const shell='<!doctype html><html><head><title>HiFind</title><meta name="description" content="Accueil"></head><body><div id="page-detail"></div></body></html>';
  const html=renderProductShell(product,shell);
  assert.match(html,/<link rel="canonical" href="https:\/\/hifind.fr\/produit\/telephone-premium-1234567890123">/);
  assert.match(html,/<meta property="og:type" content="product">/);
  assert.match(html,/"@type":"Product"/);
  assert.match(html,/"lowPrice":699/);
  assert.match(html,/Téléphone &lt;Premium&gt;/);
  assert.match(html,/id="page-detail"/);
});

test('innovations exists as a real cross-category collection', () => {
  assert.equal(CATEGORY_META.innovations.title, 'Innovations');
  assert.match(CATEGORY_META.innovations.description, /technolog/i);
});

test('engagement rejects invalid or identifying payloads before touching the database', async () => {
  let response;
  const res = { setHeader(){}, status(code){ this.code=code; return this; }, json(body){ response={code:this.code,body}; return this; } };
  await engagementHandler({ method:'POST', body:{ ean:'not-an-ean', event:'detail_view', email:'x@example.test' } }, res);
  assert.equal(response.code,400);
});
