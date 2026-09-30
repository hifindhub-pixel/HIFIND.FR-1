import { Worker } from 'node:worker_threads';

export const merchantKey = name => String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(france|fr)\b/g, '').replace(/[^a-z0-9]/g, '');

export function validSample(row) {
  const ean = String(row.ean ?? row.gtin ?? row.product_gtin ?? '').trim();
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(ean)) return false;
  const digits = ean.split('').map(Number), check = digits.pop();
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 ? 1 : 3), 0);
  if ((10 - sum % 10) % 10 !== check) return false;
  const rawPrice = row.search_price ?? row.price ?? row.prix_ttc;
  const currency = row.currency ?? rawPrice?.currency ?? (/\bEUR\b/i.test(String(rawPrice)) ? 'EUR' : '');
  const price = Number(String(rawPrice?.amount ?? rawPrice ?? '').replace(/\s*EUR\s*/i, '').replace(',', '.'));
  const title = row.product_name ?? row.title ?? row.nom ?? row.name;
  const link = row.aw_deep_link ?? row.link ?? row.url ?? row.url_produit;
  if (row.price_ht || row.prix_ht || /^(false|0|no)$/i.test(String(row.vat_included ?? ''))) return false;
  return currency === 'EUR' && price > 0 && Number.isFinite(price) && typeof title === 'string' && title.trim().length > 0 && /^https?:\/\//.test(String(link));
}

// Workers bound wall time even when a remote body stalls before its first byte.
// Their stdout/stderr are discarded: feed errors can embed authenticated URLs.
export function probeFeed(feed, env = process.env) {
  return new Promise(resolve => {
    const worker = new Worker(new URL('./feed-probe-worker.js', import.meta.url), {
      workerData: { feed, cjToken: feed.network === 'cj' ? env.CJ_TOKEN : undefined, cjPublisherId: env.CJ_PUBLISHER_ID },
      stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 96 }
    });
    worker.stdout.resume(); worker.stderr.resume();
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true; clearTimeout(timer); void worker.terminate(); resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: 'probe_timeout' }), 25_000);
    worker.once('message', finish);
    worker.once('error', () => finish({ ok: false, reason: 'probe_failed' }));
    worker.once('exit', () => finish({ ok: false, reason: 'probe_failed' }));
  });
}

export async function autoSelect(results, existingByNetwork, manual = {}, probe = probeFeed) {
  const approvals = Object.fromEntries(Object.entries(manual).map(([k, v]) => [k, [...v]]));
  const decisions = [];
  // A merchant already served by another network is not counted twice.
  const owners = new Map();
  for (const [network, feeds] of Object.entries(existingByNetwork)) {
    for (const f of feeds) {
      const key = merchantKey(f.name);
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(network);
    }
  }
  // Probe concurrently, with four bounded workers at most. No catalogue cap:
  // candidates beyond a fixed first page must also be eligible next sync.
  const pending = results.filter(r => r.status === 'ok').flatMap(r => r.feeds)
    .filter(f => !/\b(pro|b2b|business|professionnel)\b/i.test(f.name));
  const validations = new Map();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (cursor < pending.length) {
      const candidate = pending[cursor++];
      try { validations.set(candidate, await probe(candidate)); }
      catch { validations.set(candidate, { ok: false, reason: 'probe_failed' }); }
    }
  }));
  for (const result of results) {
    const network = result.network;
    if (result.status !== 'ok') continue;
    const used = new Set();
    const selected = approvals[network] ||= [];
    const manualAdvertisers = new Set(result.feeds.filter(f => selected.some(a => String(a.key) === f.key)).map(f => f.advertiserId));
    for (const candidate of [...result.feeds].sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }))) {
      const decision = { network, key: candidate.key, status: '' };
      decisions.push(decision);
      if (manualAdvertisers.has(candidate.advertiserId)) { decision.status = 'manual_selection'; continue; }
      if (used.has(candidate.advertiserId)) { decision.status = 'same_advertiser'; continue; }
      const key = merchantKey(candidate.name);
      if (!key || /\b(pro|b2b|business|professionnel)\b/i.test(candidate.name)) { decision.status = 'business_or_unknown'; continue; }
      if (owners.has(key) && [...owners.get(key)].some(n => n !== network)) { decision.status = 'other_network'; continue; }
      const existing = existingByNetwork[network] || [];
      const matches = existing.filter(f => merchantKey(f.name) === key || (candidate.url && f.url === candidate.url) || (network === 'cj' && String(f.advertiserId) === candidate.advertiserId));
      // Existing split catalogues need their configured mapping; do not collapse them.
      if (matches.length > 1) { decision.status = 'ambiguous_identity'; continue; }
      if (selected.some(a => merchantKey(a.name) === key)) { decision.status = 'same_merchant'; continue; }
      const validation = validations.get(candidate) || { ok: false, reason: 'probe_failed' };
      if (!validation.ok) { decision.status = validation.reason; continue; }
      const name = matches[0]?.name || candidate.name;
      selected.push({ key: candidate.key, name, ...(matches.length ? {} : { programId: network + '_auto_' + candidate.advertiserId }) });
      owners.set(key, new Set([network])); used.add(candidate.advertiserId);
      decision.status = 'auto_selected';
    }
  }
  return { approvals, decisions };
}
