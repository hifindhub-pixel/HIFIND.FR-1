import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function summarizeSync(report) {
  if (!report || !report.feeds || !['ok','empty','failed'].every(key => Array.isArray(report.feeds[key]))) {
    throw new Error('Rapport de synchronisation absent ou incomplet');
  }
  const { ok, empty, failed } = report.feeds;
  const failedRun = report.status !== 'success' || failed.length > 0;
  // Feed errors may contain signed URLs. Never copy them into the summary.
  const safe = value => String(value).replace(/https?:\/\/\S+/gi, '[URL masquée]')
    .replace(/[\r\n]/g, ' ').replace(/[<>&]/g, '').slice(0, 300);
  const summary = [
    `## Import du catalogue — ${failedRun ? '🚨 incomplet' : '✅ terminé'}`,
    '', `${ok.length} flux récoltés · ${empty.length} vides · ${failed.length} en échec`,
    ...(failed.length ? ['', 'Flux en échec :', ...failed.map(value => `- ${safe(value)}`)] : []),
    ...(empty.length ? ['', 'Les flux vides restent signalés dans sync-report.json.'] : []),
    '',
  ].join('\n');
  return { summary, failed:failedRun, failedFeeds:failed.length };
}

async function main() {
  try {
    const result = summarizeSync(JSON.parse(await readFile('sync-report.json', 'utf8')));
    console.log(result.summary);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, result.summary);
    if (result.failed) {
      console.error(`::error::Import incomplet : ${result.failedFeeds} flux en échec. Consulter le rapport de synchronisation.`);
      process.exitCode = 2;
    }
  } catch {
    console.error('::error::Impossible de valider sync-report.json : rapport absent, incomplet ou illisible.');
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
