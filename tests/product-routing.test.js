import { test } from 'node:test';
import assert from 'node:assert/strict';
import productHandler, { extractEanFromSlug } from '../api/produit.js';
import engagementHandler from '../api/engagement.js';
import { CATEGORY_META } from '../api/categorie.js';

test('legacy product URLs redirect permanently to the interactive product view', () => {
  assert.equal(extractEanFromSlug('sac-nike-1234567890123'), '1234567890123');
  let redirect;
  const res = {
    setHeader(){},
    redirect(status, location){ redirect = { status, location }; return this; },
  };
  productHandler({ query:{ slug:'sac-nike-1234567890123' } }, res);
  assert.deepEqual(redirect, { status:308, location:'/?openEan=1234567890123' });
});

test('innovations exists as a real cross-category collection', () => {
  assert.equal(CATEGORY_META.innovations.title, 'Innovations');
  assert.match(CATEGORY_META.innovations.description, /technolog/i);
});

test('engagement rejects invalid or identifying payloads before touching the database', async () => {
  let response;
  const res = {
    setHeader(){},
    status(code){ this.code = code; return this; },
    json(body){ response = { code:this.code, body }; return this; },
  };
  await engagementHandler({ method:'POST', body:{ ean:'not-an-ean', event:'detail_view', email:'x@example.test' } }, res);
  assert.equal(response.code, 400);
});
