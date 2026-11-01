import { writeFile, appendFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Bounded, read-only supervisor. No database, affiliate credentials or LLM required.
export const WORKFLOWS = [
  { file: 'sync.yml', name: 'Import produits', maxAgeHours: 36, maxRunHours: 3.5 },
  { file: 'catalogue-health.yml', name: 'Qualité du catalogue', maxAgeHours: 36, maxRunHours: 0.5 },
  { file: 'public-smoke.yml', name: 'Parcours public', maxAgeHours: 36, maxRunHours: 0.5 },
  { file: 'discover-feeds.yml', name: 'Découverte marchands', maxAgeHours: 192, maxRunHours: 0.5 },
];
const HOUR = 3600000;
const finding = (severity, code, subject, evidence, action) => ({ severity, code, subject, evidence, action });
const age = (date, now) => (now - Date.parse(date)) / HOUR;

export function inspectRuns(config, runs, now = Date.now()) {
  if (!Array.isArray(runs)) throw new Error('Invalid workflow response');
  const list = runs.filter(r => r.head_branch === 'main' && r.event !== 'pull_request')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const result = [];
  const latest = list[0];
  const completed = list.find(r => r.status === 'completed');
  const success = list.find(r => r.status === 'completed' && r.conclusion === 'success');
  if (!latest) return [finding('warning', 'workflow_missing', config.name, 'Aucune exécution main trouvée.', 'Vérifier que ce workflow est activé dans GitHub Actions.')];
  if (latest.status !== 'completed' && age(latest.run_started_at || latest.created_at, now) > config.maxRunHours) {
    result.push(finding('critical', 'workflow_stuck', config.name, 'Exécution ou attente anormalement longue.', 'Inspecter le job avant toute relance pour éviter deux imports concurrents.'));
  }
  if (completed && completed.conclusion !== 'success') {
    result.push(finding('critical', 'workflow_failed', config.name, `Dernière exécution terminée : ${completed.conclusion}.`, 'Lire le journal du job en échec. Pour un lien de flux expiré, le régénérer sur la plateforme partenaire.'));
  }
  if (!success || !Number.isFinite(age(success.created_at, now)) || age(success.created_at, now) > config.maxAgeHours) {
    result.push(finding('warning', 'workflow_stale', config.name, `Aucun succès récent dans les ${config.maxAgeHours} dernières heures (20 exécutions examinées au maximum).`, 'Vérifier la planification et le dernier import réussi.'));
  }
  return result;
}

function validPrice(value) {
  return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) && Number(value) > 0;
}
function webUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

export function inspectProduct(product, now = Date.now()) {
  const subject = /^\d{8,14}$/.test(String(product?.ean)) ? String(product.ean) : 'EAN invalide';
  const offers = Array.isArray(product?.ean_offers) ? product.ean_offers : [];
  const result = [];
  const add = (severity, code, evidence, action) => result.push(finding(severity, code, subject, evidence, action));
  if (subject === 'EAN invalide') add('critical', 'invalid_ean', 'Identifiant produit absent ou invalide.', 'Contrôler le rapprochement EAN à la source.');
  const usable = offers.filter(o => validPrice(o.price) && webUrl(o.tracking_url || o.url));
  // offers_count is computed by the API using canonical merchant aliases.
  if (Number(product?.offers_count) < 2 || !Number.isFinite(Number(product?.offers_count)) || usable.length < 2) {
    add('critical', 'not_comparable', 'Moins de deux offres utilisables ou marchands canoniques.', 'Vérifier les liens, les prix et les alias marchands avant de republier cette fiche.');
  }
  if (!validPrice(product?.price) || offers.some(o => !validPrice(o.price))) add('critical', 'invalid_price', 'Prix absent, nul, négatif ou non numérique.', 'Corriger le mapping du flux concerné ; ne pas inventer un prix.');
  if (offers.some(o => !webUrl(o.tracking_url || o.url))) add('warning', 'invalid_link', 'URL marchande absente ou non HTTP(S).', 'Contrôler le lien affilié dans le flux.');
  if (!webUrl(product?.image_url)) add('warning', 'missing_image', 'Image absente ou URL invalide.', 'Vérifier le champ image du flux.');
  const stale = offers.filter(o => !Number.isFinite(age(o.updated_at, now)) || age(o.updated_at, now) > 168);
  if (stale.length) add('warning', 'stale_offers', `${stale.length} offre(s) de plus de 7 jours ou sans date exploitable.`, 'Contrôler le dernier rafraîchissement des flux concernés.');
  const prices = usable.map(o => Number(o.price));
  if (prices.length >= 2 && Math.max(...prices) / Math.min(...prices) >= 5) add('warning', 'price_spread', 'Écart de prix supérieur ou égal à ×5.', 'Vérifier variantes, état, accessoires et EAN. Cet écart est un signal, pas une erreur confirmée.');
  return result;
}

export async function collectReport({ fetchImpl = fetch, now = Date.now(), token = '', repository = 'hifindhub-pixel/HIFIND.FR-1' } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository');
  const report = { schema: 1, observed_at: new Date(now).toISOString(), mode: 'read-only', checks: [], findings: [], sample_size: 0 };
  async function request(url, github = false) {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': 'HiFind-Agent/1.0', ...(github && token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(20000), redirect: 'error',
    });
    if (!response.ok) {
      const error = new Error('Request failed');
      error.status = Number(response.status);
      error.deploymentDisabled = response.headers?.get('x-vercel-error') === 'DEPLOYMENT_DISABLED';
      throw error;
    }
    return response.json();
  }
  for (const config of WORKFLOWS) {
    try {
      const payload = await request(`https://api.github.com/repos/${repository}/actions/workflows/${config.file}/runs?branch=main&per_page=20`, true);
      report.findings.push(...inspectRuns(config, payload.workflow_runs, now));
      report.checks.push({ name: config.name, observed: true, url: `https://github.com/${repository}/actions/workflows/${config.file}` });
    } catch {
      report.checks.push({ name: config.name, observed: false });
      report.findings.push(finding('warning', 'unobservable', config.name, 'Impossible de lire les exécutions.', 'Vérifier les permissions actions:read et la disponibilité de GitHub.'));
    }
  }
  try {
    const payload = await request('https://hifind.fr/api/products?action=trending&limit=12');
    if (!Array.isArray(payload?.data)) throw new Error('Invalid catalogue');
    const seen = new Set();
    if (!payload.data.length) report.findings.push(finding('critical', 'empty_catalogue', 'Tendances', 'Sélection vide.', 'Contrôler les imports et les filtres de comparabilité.'));
    for (const product of payload.data.slice(0, 12)) {
      if (product?.ean && seen.has(product.ean)) report.findings.push(finding('warning', 'duplicate_ean', String(product.ean), 'EAN répété dans la sélection.', 'Vérifier la déduplication de la sélection.'));
      seen.add(product?.ean);
      report.findings.push(...inspectProduct(product, now));
      report.sample_size++;
    }
    report.checks.push({ name: 'Échantillon de produits publics', observed: true });
  } catch (error) {
    report.checks.push({ name: 'Échantillon de produits publics', observed: false });
    report.findings.push(error.deploymentDisabled
      ? finding('critical', 'deployment_disabled', 'Hébergement Vercel', 'Vercel renvoie DEPLOYMENT_DISABLED.', 'Ouvrir le projet Vercel pour identifier la cause de la suspension et rétablir le déploiement avant de modifier le catalogue.')
      : finding('critical', 'catalogue_unavailable', 'API produits', Number.isInteger(error.status) ? `Réponse HTTP ${error.status}.` : 'Réponse indisponible ou invalide.', 'Vérifier la route API, les journaux Vercel et la connexion à Neon.'));
  }
  const priority = { critical: 0, warning: 1 };
  report.findings.sort((a, b) => priority[a.severity] - priority[b.severity]);
  report.status = report.findings.some(f => f.severity === 'critical') ? 'critical' : report.findings.length ? 'warning' : 'healthy';
  return report;
}

export function renderReport(report) {
  const clean = value => String(value).replace(/https?:\/\/\S+/gi, '[URL masquée]').replace(/[\r\n<>|`]/g, ' ').slice(0, 500);
  return [
    '# HiFind — bilan de l’agent', '', `État : **${report.status}** · ${report.observed_at}`,
    '', `${report.sample_size} fiches échantillonnées ; ${report.checks.filter(c => c.observed).length}/${report.checks.length} sources observées.`,
    'Contrôle par règles, en lecture seule. Les prix et les stocks ne sont pas vérifiés sur les sites marchands.', '',
    ...report.checks.map(c => `- ${c.observed ? '✓' : '?'} ${c.name}${c.url ? ` — [Exécutions](${c.url})` : ''}`), '',
    '## Actions prioritaires', '',
    ...(report.findings.length ? report.findings.map((f, i) => `${i + 1}. **${f.severity} · ${clean(f.subject)}** — ${clean(f.evidence)}\n   Action proposée : ${clean(f.action)}`) : ['Aucune anomalie détectée dans les contrôles effectués.']),
    '', 'Aucune modification du catalogue, dépense, relance ou publication automatique.', '',
  ].join('\n');
}

async function main() {
  const report = await collectReport({ token: process.env.GITHUB_TOKEN, repository: process.env.GITHUB_REPOSITORY || 'hifindhub-pixel/HIFIND.FR-1' });
  const markdown = renderReport(report);
  await mkdir('agent-report', { recursive: true });
  await writeFile('agent-report/report.json', JSON.stringify(report, null, 2));
  await writeFile('agent-report/report.md', markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(markdown);
  if (report.status === 'critical') process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
