import { parentPort, workerData } from 'node:worker_threads';
import { streamFeed } from './stream-feed.js';
import { requestMetadata } from './feed-discovery.js';
import { validSample } from './auto-feeds.js';

try {
  const { feed, cjToken, cjPublisherId } = workerData;
  const rows = [];
  if (feed.network === 'cj') {
    const query = `{ products(companyId: "${cjPublisherId}", partnerIds: ["${feed.advertiserId}"], limit: 50, offset: 0) { resultList { title link price { amount currency } ... on Shopping { gtin } } } }`;
    const body = JSON.parse(await requestMetadata('https://ads.api.cj.com/query', {
      method: 'POST', headers: { Authorization: 'Bearer ' + cjToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ query })
    }));
    if (body.errors || !Array.isArray(body.data?.products?.resultList)) throw new Error();
    rows.push(...body.data.products.resultList);
  } else {
    await streamFeed(feed.url, {
      timeoutMs: 10_000, streamMs: 15_000, retries: 1,
      normalizeHeader: h => h.trim().toLowerCase().replace(/[\s-]+/g, '_'),
      onRecord: row => { rows.push(row); return rows.length < 50; }
    });
  }
  // XML formats or unknown mappings are left for review rather than guessed.
  const valid = rows.filter(r => typeof r === 'object' && validSample(r)).length;
  parentPort.postMessage({ ok: rows.length > 0 && valid / rows.length >= 0.8,
    reason: rows.length ? 'sample_quality' : 'empty_feed' });
} catch { parentPort.postMessage({ ok: false, reason: 'probe_failed' }); }
