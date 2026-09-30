import { writeFile } from 'node:fs/promises';
import { discoverFeeds, mergeFeeds, parseApprovals, publicReport } from './lib/feed-discovery.js';

// No authenticated feed URL is persisted or passed through GitHub outputs.
// Discovery failures retain the existing network configuration.
const approvals = parseApprovals(process.env.FEED_DISCOVERY_APPROVALS);
const results = await discoverFeeds();
const report = publicReport(results, approvals);
await writeFile('feed-discovery-report.json', JSON.stringify(report, null, 2));
for (const result of results) {
  const variable = result.network.toUpperCase() + '_FEEDS';
  if (result.status !== 'ok') {
    console.warn(`${result.network}: decouverte indisponible (${result.status}), configuration existante conservee`);
    continue;
  }
  const selected = approvals[result.network] || [];
  if (!selected.length) continue;
  let existing;
  try { existing = JSON.parse(process.env[variable] || '[]'); }
  catch { throw new Error(variable + ': configuration JSON invalide'); }
  process.env[variable] = JSON.stringify(mergeFeeds(existing, result.feeds, selected));
}
await import('./sync.js');
