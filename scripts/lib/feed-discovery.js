// Metadata discovery only. Product catalogues remain streamed by sync.js.
// Never log authenticated URLs, response bodies or API credentials.
const NETWORKS = ['awin', 'effinity', 'cj'];
const id = value => /^\d+$/.test(String(value ?? '')) ? String(value) : null;
const french = value => /^fr(?:[-_].*)?$/i.test(String(value || ''));
const httpsUrl = value => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch { return null; }
};

export function parseFeedList(text) {
  text = text.replace(/^\uFEFF/, '').trim();
  if (text.startsWith('[') || text.startsWith('{')) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed.feeds || parsed.productfeeds || parsed.data;
    if (!Array.isArray(rows)) throw new Error('unexpected_schema');
    return rows;
  }
  // Metadata CSV: quoted commas, escaped quotes and embedded newlines.
  const records = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); records.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new Error('invalid_csv');
  if (row.length || field) { row.push(field); records.push(row); }
  const headers = records.shift();
  if (!headers || headers.length < 2) throw new Error('unexpected_schema');
  return records.filter(r => r.some(Boolean)).map(r => {
    if (r.length !== headers.length) throw new Error('invalid_csv');
    return Object.fromEntries(headers.map((h, i) => [h.trim(), r[i]]));
  });
}

export function normalizeFeed(network, row) {
  if (!row || typeof row !== 'object') return null;
  if (network === 'awin') {
    const feedId = id(row['Feed ID'] ?? row.feedId ?? row.id);
    const advertiserId = id(row['Advertiser ID'] ?? row.advertiserId);
    const language = row.Language ?? row.language;
    const url = httpsUrl(row['Example Download URL'] ?? row.exampleDownloadUrl ?? row.downloadUrl);
    const name = row['Advertiser Name'] ?? row.advertiserName;
    const count = Number(row['No of products'] ?? row.productCount);
    if (!feedId || !advertiserId || !name || !french(language) || !(count > 0) || !url) return null;
    return { network, key: feedId, advertiserId, name: String(name), url, count };
  }
  if (network === 'effinity') {
    const feedId = id(row.id_lien);
    const advertiserId = id(row.id_affilieur);
    const url = httpsUrl(row.code);
    // The API request explicitly restricts country=fr and filter=mines.
    if (!feedId || !advertiserId || !row.nomprogramme || !url) return null;
    return { network, key: feedId, advertiserId, name: String(row.nomprogramme), url };
  }
  if (network === 'cj') {
    const advertiserId = id(row.advertiserId);
    if (!advertiserId || !row.advertiserName || !french(row.language) || row.currency !== 'EUR' || !(Number(row.productCount) > 0)) return null;
    return { network, key: advertiserId, advertiserId, name: String(row.advertiserName), count: Number(row.productCount) };
  }
  return null;
}

// Includes body consumption in the timeout; limits metadata, never product feeds.
export async function requestMetadata(url, options = {}, fetchImpl = fetch, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('http_' + response.status);
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 10 * 1024 * 1024) throw new Error('metadata_too_large');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(chunks).toString('utf8');
  } catch (error) {
    const code = /^(http_\d+|metadata_too_large)$/.test(error.message) ? error.message : controller.signal.aborted ? 'timeout' : 'request_failed';
    throw new Error(code);
  } finally { clearTimeout(timer); }
}

export async function discoverFeeds(env = process.env, fetchImpl = fetch) {
  const results = await Promise.all(NETWORKS.map(async network => {
    try {
      let rows;
      if (network === 'awin') {
        if (!env.AWIN_API_KEY) return { network, status: 'missing_credentials', feeds: [] };
        rows = parseFeedList(await requestMetadata('https://productdata.awin.com/datafeed/list/apikey/' + encodeURIComponent(env.AWIN_API_KEY), {}, fetchImpl));
      } else if (network === 'effinity') {
        if (!env.EFFINITY_API_KEY) return { network, status: 'missing_credentials', feeds: [] };
        rows = parseFeedList(await requestMetadata('https://apiv2.effiliation.com/apiv2/productfeeds.json?key=' + encodeURIComponent(env.EFFINITY_API_KEY) + '&filter=mines&country=fr&type=7,33', {}, fetchImpl));
      } else {
        if (!env.CJ_TOKEN || !id(env.CJ_PUBLISHER_ID)) return { network, status: 'missing_credentials', feeds: [] };
        // Preserve the project's query until its live account schema is verified.
        const query = '{ productFeeds(companyId: "' + env.CJ_PUBLISHER_ID + '") { resultList { advertiserId advertiserName productCount language currency } } }';
        const data = JSON.parse(await requestMetadata('https://ads.api.cj.com/query', {
          method: 'POST', headers: { Authorization: 'Bearer ' + env.CJ_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query })
        }, fetchImpl));
        if (data.errors) throw new Error('graphql_error');
        rows = data.data?.productFeeds?.resultList;
        if (!Array.isArray(rows)) throw new Error('unexpected_schema');
      }
      const feeds = new Map();
      for (const row of rows) {
        const feed = normalizeFeed(network, row);
        if (feed) feeds.set(feed.key, feed);
      }
      return { network, status: 'ok', received: rows.length, feeds: [...feeds.values()] };
    } catch (error) {
      const code = /^(http_\d+|timeout|request_failed|metadata_too_large|graphql_error|unexpected_schema|invalid_csv)$/.test(error.message) ? error.message : 'invalid_response';
      return { network, status: code, feeds: [] };
    }
  }));
  return results;
}

export function parseApprovals(value = '{}') {
  let approvals;
  try { approvals = JSON.parse(value || '{}'); }
  catch { throw new Error('invalid_approvals'); }
  if (!approvals || Array.isArray(approvals) || typeof approvals !== 'object') throw new Error('invalid_approvals');
  for (const [network, entries] of Object.entries(approvals)) {
    if (!NETWORKS.includes(network) || !Array.isArray(entries)) throw new Error('invalid_approvals');
    const keys = new Set(), names = new Set();
    for (const entry of entries) {
      if (!entry || !id(entry.key) || typeof entry.name !== 'string' || !entry.name.trim() || /[\r\n]/.test(entry.name)) throw new Error('invalid_approvals');
      const nameKey = entry.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      if (keys.has(String(entry.key)) || names.has(nameKey)) throw new Error('duplicate_approval');
      keys.add(String(entry.key)); names.add(nameKey);
    }
  }
  return approvals;
}

// Explicit identities prevent discovered display-name changes from creating
// a second seller. Existing manually configured sources are never removed.
export function mergeFeeds(existing, discovered, approvals = []) {
  if (!Array.isArray(existing) || existing.some(f => !f || typeof f.name !== 'string')) throw new Error('invalid_existing_feeds');
  const merged = existing.map(f => ({ ...f }));
  for (const approval of approvals) {
    const candidate = discovered.find(f => f.key === String(approval.key));
    if (!candidate) continue;
    const match = merged.findIndex(f => f.name === approval.name);
    const otherIdentity = merged.some(f => f.name !== approval.name && ((candidate.url && f.url === candidate.url) || (candidate.network === 'cj' && String(f.advertiserId) === candidate.advertiserId)));
    if (otherIdentity) throw new Error('merchant_identity_conflict');
    const entry = { ...(match < 0 ? {} : merged[match]), name: approval.name };
    if (candidate.network === 'cj') entry.advertiserId = candidate.advertiserId;
    else entry.url = candidate.url;
    if (approval.category) entry.category = approval.category;
    if (match < 0) merged.push(entry); else merged[match] = entry;
  }
  return merged;
}

export function publicReport(results, approvals) {
  return {
    generatedAt: new Date().toISOString(),
    networks: results.map(r => ({
      network: r.network, status: r.status, received: r.received ?? 0,
      candidates: r.feeds.map(f => ({ key: f.key, advertiserId: f.advertiserId, name: f.name, products: f.count ?? null,
        selected: (approvals[r.network] || []).some(a => String(a.key) === f.key) })),
      selectedButMissing: (approvals[r.network] || []).filter(a => !r.feeds.some(f => f.key === String(a.key))).map(a => String(a.key))
    }))
  };
}
