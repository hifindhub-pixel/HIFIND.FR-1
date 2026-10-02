import { writeFile } from 'node:fs/promises';
import { discoverFeeds, parseApprovals, publicReport } from './lib/feed-discovery.js';

const approvals = parseApprovals(process.env.FEED_DISCOVERY_APPROVALS);
const report = publicReport(await discoverFeeds(), approvals);
await writeFile('feed-discovery-report.json', JSON.stringify(report, null, 2));
for (const network of report.networks) {
  console.log(`${network.network}: ${network.status}; ${network.candidates.length} candidats; ${network.selectedButMissing.length} selections absentes`);
}
// A green workflow must not hide an unavailable discovery connector.
if (report.networks.some(n => n.status !== 'ok')) process.exitCode = 1;
