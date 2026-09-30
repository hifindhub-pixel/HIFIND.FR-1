import { writeFile } from 'node:fs/promises';
import { discoverFeeds, mergeFeeds, parseApprovals, publicReport } from './lib/feed-discovery.js';
import { autoSelect } from './lib/auto-feeds.js';

// No authenticated feed URL is persisted or passed through GitHub outputs.
// Discovery failures retain the existing network configuration.
let approvals = parseApprovals(process.env.FEED_DISCOVERY_APPROVALS);
const results = await discoverFeeds();
const existingByNetwork = {};
for (const network of ['awin', 'effinity', 'cj', 'affilae']) {
  try {
    existingByNetwork[network] = JSON.parse(process.env[network.toUpperCase() + '_FEEDS'] || '[]');
    if (!Array.isArray(existingByNetwork[network]) || existingByNetwork[network].some(f => !f || typeof f.name !== 'string')) throw new Error();
  } catch { throw new Error(network + ': configuration JSON invalide'); }
}
const automatic = process.env.AUTO_DISCOVER_FEEDS === 'true'
  ? await autoSelect(results, existingByNetwork, approvals) : { approvals, decisions: [] };
approvals = automatic.approvals;
const report = publicReport(results, approvals);
report.automatic = automatic.decisions;
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
if (process.env.FEED_DISCOVERY_DRY_RUN === 'true') {
  for (const network of report.networks) console.log(`${network.network}: ${network.status}, ${network.candidates.length} candidats`);
  console.log('Selection automatique : ' + report.automatic.filter(d => d.status === 'auto_selected').length);
  if (report.networks.some(n => n.status !== 'ok')) process.exitCode = 1;
} else {
  await import('./sync.js');
}
