import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedList, normalizeFeed, discoverFeeds, mergeFeeds, parseApprovals, publicReport, requestMetadata } from './scripts/lib/feed-discovery.js';

const awin = { 'Feed ID': '11', 'Advertiser ID': '21', 'Advertiser Name': 'Marchand', Language: 'FR', 'No of products': '100', 'Example Download URL': 'https://productdata.awin.com/feed/private-key' };
const effinity = { id_lien: '12', id_affilieur: '22', nomprogramme: 'Autre marchand', code: 'https://feed.example/products?key=private-key' };
const cj = { advertiserId: '23', advertiserName: 'Marchand CJ', language: 'fr-FR', currency: 'EUR', productCount: 30 };

test('CSV metadata supports BOM, quoted commas, escaped quotes and multiline names', () => {
  assert.deepEqual(parseFeedList('\uFEFFid,name\r\n1,"A, ""B""\nC"'), [{ id: '1', name: 'A, "B"\nC' }]);
  assert.throws(() => parseFeedList('id,name\n1,"broken'), /invalid_csv/);
  assert.throws(() => parseFeedList('<html>login</html>'), /unexpected_schema/);
});

test('source mapping excludes missing identities, empty catalogues and unsupported locales', () => {
  assert.equal(normalizeFeed('awin', awin).key, '11');
  assert.equal(normalizeFeed('effinity', effinity).url, effinity.code);
  assert.equal(normalizeFeed('cj', cj).advertiserId, '23');
  assert.equal(normalizeFeed('awin', { ...awin, Language: 'en' }), null);
  assert.equal(normalizeFeed('awin', { ...awin, 'No of products': 0 }), null);
  assert.equal(normalizeFeed('awin', { ...awin, 'Advertiser ID': '' }), null);
  assert.equal(normalizeFeed('effinity', { ...effinity, code: '<a href="https://example.com">feed</a>' }), null);
  assert.equal(normalizeFeed('cj', { ...cj, currency: 'USD' }), null);
});

test('one failed API leaves the other networks available and hides error response secrets', async () => {
  const fetcher = async url => {
    if (url.includes('productdata.awin')) return new Response(JSON.stringify([awin]));
    if (url.includes('effiliation')) return new Response('private-key', { status: 503 });
    return new Response(JSON.stringify({ data: { productFeeds: { resultList: [cj] } } }));
  };
  const results = await discoverFeeds({ AWIN_API_KEY: 'private-key', EFFINITY_API_KEY: 'private-key', CJ_TOKEN: 'private-key', CJ_PUBLISHER_ID: '1' }, fetcher);
  assert.deepEqual(results.map(r => r.status), ['ok', 'http_503', 'ok']);
  const report = JSON.stringify(publicReport(results, {}));
  assert.ok(!report.includes('private-key'));
  assert.ok(!report.includes('https://'));
});

test('GraphQL error and missing credentials are not reported as successful empty discovery', async () => {
  const results = await discoverFeeds({ CJ_TOKEN: 'secret', CJ_PUBLISHER_ID: '1' }, async () => new Response(JSON.stringify({ errors: [{ message: 'secret' }] })));
  assert.deepEqual(results.map(r => r.status), ['missing_credentials', 'missing_credentials', 'graphql_error']);
});

test('approval updates URL in place, preserves merchant name/settings and never removes existing feeds', () => {
  const existing = [{ name: 'Marchand historique', url: 'https://old.example/feed', category: 'high-tech', separator: ';' }, { name: 'Autre', url: 'https://other.example/feed' }];
  const found = [normalizeFeed('awin', awin)];
  assert.deepEqual(mergeFeeds(existing, found), existing);
  const selected = [{ key: '11', name: 'Marchand historique' }];
  const merged = mergeFeeds(existing, found, selected);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].url, awin['Example Download URL']);
  assert.equal(merged[0].separator, ';');
  assert.equal(merged[0].category, 'high-tech');
  assert.deepEqual(mergeFeeds(existing, [], selected), existing);
  assert.equal(existing[0].url, 'https://old.example/feed');
});

test('new Effinity/CJ configurations use importer fields and require a selection', () => {
  const ef = normalizeFeed('effinity', effinity), cf = normalizeFeed('cj', cj);
  assert.deepEqual(mergeFeeds([], [ef], [{ key: '12', name: 'Stable' }]), [{ name: 'Stable', url: effinity.code }]);
  assert.deepEqual(mergeFeeds([], [cf], [{ key: '23', name: 'CJ stable' }]), [{ name: 'CJ stable', advertiserId: '23' }]);
});

test('duplicate merchant configurations and invalid approval shapes fail explicitly', () => {
  for (const value of ['[]', '{"other":[]}', '{"awin":[{"key":"abc","name":"A"}]}', '{"awin":[{"key":"1","name":"A"},{"key":"2","name":"a"}]}']) assert.throws(() => parseApprovals(value));
  assert.throws(() => mergeFeeds([{ name: 'Already there', advertiserId: '23' }], [normalizeFeed('cj', cj)], [{ key: '23', name: 'Different' }]), /merchant_identity_conflict/);
});

test('metadata timeout covers a stalled response body and does not disclose URL', async () => {
  const fetcher = async (_url, { signal }) => new Response(new ReadableStream({
    start(controller) { signal.addEventListener('abort', () => controller.error(new Error('secret-url'))); }
  }));
  await assert.rejects(requestMetadata('https://example.com/secret', {}, fetcher, 10), /timeout/);
});

test('metadata size limit prevents an accidental catalogue download', async () => {
  const fetcher = async () => new Response(new Uint8Array(10 * 1024 * 1024 + 1));
  await assert.rejects(requestMetadata('https://example.com', {}, fetcher), /metadata_too_large/);
});

test('Awin switches to the existing Darwin endpoint on classic service failure', async () => {
  const urls = [];
  const results = await discoverFeeds({ AWIN_API_KEY: 'fake', AWIN_PUBLISHER_ID: '123' }, async url => {
    urls.push(url);
    return url.includes('productdata.awin.com') ? new Response('', { status: 500 }) : new Response(JSON.stringify([awin]));
  });
  assert.equal(results[0].status, 'ok');
  assert.equal(results[0].feeds.length, 1);
  assert.equal(urls.length, 2);
});
