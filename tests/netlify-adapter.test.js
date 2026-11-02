import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, resolveRoute } from '../scripts/netlify-adapter.js';

test('Netlify routes preserve dynamic pages and reject arbitrary API files', () => {
  assert.deepEqual(resolveRoute('/baisses-de-prix'), { name: 'discovery', query: { pageType: 'baisses-prix' } });
  assert.deepEqual(resolveRoute('/produit/telephone/123'), { name: 'produit', query: { slug: 'telephone/123' } });
  assert.deepEqual(resolveRoute('/marque/apple'), { name: 'discovery', query: { pageType: 'marque', slug: 'apple' } });
  assert.deepEqual(resolveRoute('/sitemap-2.xml'), { name: 'sitemap', query: { part: '2' } });
  assert.equal(resolveRoute('/api/product-type'), null);
});

test('search query, pagination, method and JSON response survive adapter', async () => {
  const result = await dispatch({ rawUrl: 'https://preview/api/products?q=aspirateur', httpMethod: 'GET', queryStringParameters: { q: 'aspirateur', page: '2' } }, {
    products(req, res) { assert.equal(req.query.q, 'aspirateur'); assert.equal(req.query.page, '2'); res.setHeader('Cache-Control', 'no-store'); res.status(200).json({ data: [] }); },
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), { data: [] });
  assert.equal(result.headers['cache-control'], 'no-store');
});

test('route parameters take precedence over query spoofing', async () => {
  await dispatch({ path: '/marque/apple', queryStringParameters: { slug: 'other', pageType: 'tendances', page: '2' } }, {
    discovery(req, res) { assert.deepEqual(req.query, { slug: 'apple', pageType: 'marque', page: '2' }); res.send('ok'); },
  });
});

test('binary image bytes are preserved', async () => {
  const bytes = Buffer.from([0, 255, 128, 10]);
  const result = await dispatch({ path: '/api/img', httpMethod: 'GET' }, { img(req, res) { res.setHeader('Content-Type', 'image/png'); res.send(bytes); } });
  assert.equal(result.isBase64Encoded, true);
  assert.deepEqual(Buffer.from(result.body, 'base64'), bytes);
});

test('POST JSON and HEAD/OPTIONS empty bodies are supported', async () => {
  const post = await dispatch({ path: '/api/engagement', httpMethod: 'POST', body: Buffer.from('{"event":"click"}').toString('base64'), isBase64Encoded: true }, {
    engagement(req, res) { assert.equal(req.body.event, 'click'); res.status(202).json({ ok: true }); },
  });
  assert.equal(post.statusCode, 202);
  const head = await dispatch({ path: '/api/products', httpMethod: 'HEAD' }, { products(req, res) { res.send('hidden'); } });
  assert.equal(head.body, '');
  const options = await dispatch({ path: '/api/engagement', httpMethod: 'OPTIONS' }, { engagement(req, res) { res.status(204).end(); } });
  assert.equal(options.body, '');
});

test('invalid requests and failures never expose secrets or get cached', async () => {
  assert.equal((await dispatch({ path: '/marque/%ZZ' }, {})).statusCode, 400);
  assert.equal((await dispatch({ path: '/api/engagement', body: '{' }, {})).statusCode, 400);
  const result = await dispatch({ path: '/api/products' }, { products() { throw new Error('secret'); } });
  assert.equal(result.statusCode, 500);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.ok(!result.body.includes('secret'));
});
