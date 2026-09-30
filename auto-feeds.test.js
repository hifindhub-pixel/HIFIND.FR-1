import test from 'node:test';
import assert from 'node:assert/strict';
import { autoSelect, validSample, probeFeed } from './scripts/lib/auto-feeds.js';
import { createServer } from 'node:http';
import { mergeFeeds } from './scripts/lib/feed-discovery.js';
const row = { ean: '4006381333931', price: '12.50', currency: 'EUR', title: 'Produit', link: 'https://shop.example/item' };
const feed = (network, key, name, advertiserId = key) => ({ network, key, name, advertiserId, url: `https://feed.example/${network}/${key}` });
const result = (network, feeds) => ({ network, status: 'ok', feeds });
const good = async () => ({ ok: true });

test('samples require checked GTIN, usable price, currency and link; HT is rejected', () => {
  assert.equal(validSample(row), true);
  for (const change of [{ ean: '4006381333932' }, { currency: 'USD' }, { currency: '' }, { price: '0' }, { price: 'Infinity' }, { link: '' }, { price_ht: '10' }]) assert.equal(validSample({ ...row, ...change }), false);
});

test('accepted catalogues select automatically without manual approvals on all networks', async () => {
  const results = ['awin', 'effinity', 'cj'].map((n, i) => result(n, [feed(n, String(i + 1), `Marchand ${i}`)]));
  const out = await autoSelect(results, {}, {}, good);
  for (const n of ['awin', 'effinity', 'cj']) {
    assert.equal(out.approvals[n].length, 1);
    const merged = mergeFeeds([], results.find(r => r.network === n).feeds, out.approvals[n]);
    assert.match(merged[0].programId, new RegExp('^' + n + '_auto_'));
  }
});

test('several feeds of the same advertiser count once and cross-network names do not duplicate', async () => {
  const out = await autoSelect([
    result('awin', [feed('awin', '1', 'Boutique', '100'), feed('awin', '2', 'Boutique catalogue B', '100')]),
    result('effinity', [feed('effinity', '3', 'Boutique France')])
  ], {}, {}, good);
  assert.equal(out.approvals.awin.length, 1);
  assert.equal(out.approvals.effinity.length, 0);
});

test('existing merchant identity is preserved; ambiguous existing identities are held', async () => {
  const f = feed('awin', '1', 'Marchand France');
  const out = await autoSelect([result('awin', [f])], { awin: [{ name: 'Marchand', url: 'https://old.example' }] }, {}, good);
  assert.equal(out.approvals.awin[0].name, 'Marchand');
  assert.equal(out.approvals.awin[0].programId, undefined);
  const ambiguous = await autoSelect([result('awin', [f])], { awin: [{ name: 'Marchand' }, { name: 'Marchand FR' }] }, {}, good);
  assert.equal(ambiguous.approvals.awin.length, 0);
});

test('failed probes, B2B feeds and unavailable networks never enable a source', async () => {
  const out = await autoSelect([result('awin', [feed('awin', '1', 'Shop'), feed('awin', '2', 'Shop Pro')]), { network: 'cj', status: 'http_503', feeds: [] }], {}, {}, async () => ({ ok: false, reason: 'empty_feed' }));
  assert.equal(out.approvals.awin.length, 0);
  assert.deepEqual(out.decisions.map(d => d.status), ['empty_feed', 'business_or_unknown']);
});

test('manual configuration takes precedence and new merchant ID survives a display-name change', async () => {
  const f = feed('awin', '1', 'Shop', '100');
  const manual = { awin: [{ key: '1', name: 'Existing custom name' }] };
  assert.deepEqual((await autoSelect([result('awin', [f])], {}, manual, good)).approvals.awin, manual.awin);
  const a = await autoSelect([result('awin', [f])], {}, {}, good);
  const b = await autoSelect([result('awin', [{ ...f, name: 'Shop renamed' }])], {}, {}, good);
  assert.equal(a.approvals.awin[0].programId, b.approvals.awin[0].programId);
});

test('all candidates are considered with at most four concurrent probes', async () => {
  let active = 0, max = 0;
  const rows = Array.from({ length: 35 }, (_, i) => feed('awin', String(i + 1), 'Seller' + i));
  const out = await autoSelect([result('awin', rows)], {}, {}, async () => {
    active++; max = Math.max(max, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
    return { ok: true };
  });
  assert.equal(out.approvals.awin.length, 35);
  assert.ok(max <= 4);
});

test('real probe worker reads CSV and rejects malformed product records', async () => {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.end('ean,price,currency,title,link\n' + (req.url === '/good' ? '4006381333931,12.50,EUR,Produit,https://shop.example/item\n' : 'invalid,0,USD,Produit,https://shop.example/item\n'));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const root = 'http://127.0.0.1:' + server.address().port;
    assert.equal((await probeFeed({ network: 'awin', url: root + '/good' }, {})).ok, true);
    assert.equal((await probeFeed({ network: 'awin', url: root + '/bad' }, {})).ok, false);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
