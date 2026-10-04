import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEanFromSlug, productPath, renderProductShell } from '../api/produit.js';
import engagementHandler from '../api/engagement.js';
import { CATEGORY_META } from '../api/categorie.js';

test('clean product URLs render the interactive app with indexable metadata', () => {
  const product={ean:'1234567890123',title:'Téléphone <Premium>',brand:'Marque & Co',description:'Description réelle',
    image_url:'https://images.example.test/p.jpg',price:699,offers_count:2,category:'high-tech',
    ean_offers:[
      {price:699,program_title:'Marchand A',url:'https://shop-a.example/p',shipping_cost:4.9,in_stock:true},
      {price:749,program_title:'Marchand B',url:'https://shop-b.example/p',shipping_cost:null,in_stock:null},
    ]};
  assert.equal(extractEanFromSlug('telephone-premium-1234567890123'),'1234567890123');
  assert.equal(productPath(product),'/produit/telephone-premium-1234567890123');
  const shell='<!doctype html><html><head><title>HiFind</title><meta name="description" content="Accueil"></head><body><div id="page-detail"></div></body></html>';
  const html=renderProductShell(product,shell);
  assert.match(html,/<link rel="canonical" href="https:\/\/hifind.fr\/produit\/telephone-premium-1234567890123">/);
  assert.match(html,/<meta property="og:type" content="product">/);
  assert.match(html,/"@type":"Product"/);
  assert.match(html,/"lowPrice":699/);
  assert.match(html,/"offerCount":2/);
  assert.match(html,/"offers":\[\{"@type":"Offer"/);
  assert.match(html,/"seller":\{"@type":"Organization","name":"Marchand A"\}/);
  assert.match(html,/"availability":"https:\/\/schema.org\/InStock"/);
  assert.match(html,/"shippingRate":\{"@type":"MonetaryAmount","value":"4.90","currency":"EUR"\}/);
  assert.match(html,/"name":"High-Tech","item":"https:\/\/hifind.fr\/categorie\/high-tech"/);
  assert.doesNotMatch(html,/Marchand B[^<]+shippingDetails/);
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
