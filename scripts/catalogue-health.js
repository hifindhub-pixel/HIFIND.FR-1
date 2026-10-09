import pg from 'pg';
import { writeFile } from 'node:fs/promises';
import { evaluateCatalogue } from './lib/catalogue-quality.js';
const client = new pg.Client({ connectionString: process.env.NEON_URL, connectionTimeoutMillis: 15000, statement_timeout: 120000 });

function markdown(report) {
  const lines = [
    `## Qualité du catalogue — ${report.quality.status === 'healthy' ? '✅ saine' : report.quality.status === 'warning' ? '⚠️ à surveiller' : '🚨 critique'}`,
    '',
    `**${report.totals.offers.toLocaleString('fr-FR')}** offres actives · **${report.totals.distinct_eans.toLocaleString('fr-FR')}** EAN · **${report.totals.refreshed_24h.toLocaleString('fr-FR')}** rafraîchies en 24 h`,
    '',
  ];
  if (report.quality.alerts.length) {
    lines.push('| Niveau | Marchand | Signal |', '|---|---|---|');
    report.quality.alerts.slice(0, 25).forEach(item => {
      lines.push(`| ${item.severity === 'critical' ? '🚨' : '⚠️'} | ${item.program_id || 'Catalogue'} | ${item.message.replaceAll('|', '\\|')} |`);
    });
    if (report.quality.alerts.length > 25) lines.push('', `${report.quality.alerts.length - 25} autre(s) alerte(s) dans l’artefact JSON.`);
  } else {
    lines.push('Aucune dégradation significative détectée.');
  }
  if (report.categories?.length) {
    lines.push('', '### Couverture par catégorie', '', '| Catégorie | Produits comparables | Offres |', '|---|---:|---:|');
    report.categories.forEach(item => lines.push(`| ${item.category || 'autres'} | ${Number(item.products).toLocaleString('fr-FR')} | ${Number(item.offers).toLocaleString('fr-FR')} |`));
  }
  return lines.join('\n') + '\n';
}

try {
  await client.connect();
  // Une ligne JSON agrégée par jour : historique borné et sans offre individuelle.
  await client.query(`CREATE TABLE IF NOT EXISTS catalogue_health_snapshots (
    day DATE PRIMARY KEY,
    observed_at TIMESTAMPTZ NOT NULL,
    snapshot JSONB NOT NULL
  )`);
  const previous = await client.query(`SELECT snapshot FROM catalogue_health_snapshots
    WHERE day < CURRENT_DATE ORDER BY day DESC LIMIT 1`);
  const baseline = previous.rows[0]?.snapshot || null;
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const observedAt = new Date().toISOString();
  const size = await client.query("SELECT pg_database_size(current_database())::bigint AS database_bytes, pg_total_relation_size('products')::bigint AS products_bytes");
  const health = await client.query(`SELECT p.program_id, COALESCE(MAX(pr.title), p.program_id) AS merchant,
    COUNT(*)::int AS offers,
    COUNT(DISTINCT p.ean)::int AS distinct_eans,
    COUNT(*) FILTER (WHERE p.updated_at >= NOW() - INTERVAL '24 hours')::int AS refreshed_24h,
    COUNT(*) FILTER (WHERE p.updated_at < NOW() - INTERVAL '7 days' OR p.updated_at IS NULL)::int AS older_than_7d,
    COUNT(*) FILTER (WHERE p.updated_at < NOW() - INTERVAL '30 days' OR p.updated_at IS NULL)::int AS older_than_30d,
    COUNT(*) FILTER (WHERE p.image_url IS NULL OR BTRIM(p.image_url) = '')::int AS missing_image,
    COUNT(*) FILTER (WHERE p.brand IS NULL OR BTRIM(p.brand) = '')::int AS missing_brand,
    COUNT(*) FILTER (WHERE p.category IS NULL OR p.category = 'autres')::int AS uncategorized,
    MAX(p.updated_at) AS last_update
    FROM products p LEFT JOIN programs pr ON pr.id = p.program_id
    WHERE p.status = 'enabled'
    GROUP BY p.program_id ORDER BY offers DESC`);

  const categories = await client.query(`SELECT COALESCE(p.category, 'autres') AS category,
    COUNT(DISTINCT p.ean)::int AS products, COUNT(*)::int AS offers
    FROM products p
    WHERE p.status='enabled' AND p.ean IS NOT NULL
      AND EXISTS (SELECT 1 FROM products p2 WHERE p2.ean=p.ean AND p2.status='enabled' AND p2.program_id<>p.program_id)
    GROUP BY COALESCE(p.category, 'autres') ORDER BY products DESC`);

  const quarantineTable = await client.query(`SELECT to_regclass('public.quarantined_eans') IS NOT NULL AS present`);
  let quarantines = { unresolved_quarantines: 0, new_quarantines_24h: 0 };
  if (quarantineTable.rows[0]?.present) {
    const columns = await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'quarantined_eans'`);
    const names = new Set(columns.rows.map(row => row.column_name));
    const timestampColumn = ['created_at', 'observed_at', 'quarantined_at'].find(name => names.has(name));
    const q = await client.query(`SELECT COUNT(*) FILTER (WHERE resolved_at IS NULL)::int AS unresolved_quarantines
      ${timestampColumn ? `, COUNT(*) FILTER (WHERE resolved_at IS NULL AND ${timestampColumn} >= NOW() - INTERVAL '24 hours')::int AS new_quarantines_24h` : ''}
      FROM quarantined_eans`);
    quarantines = { ...quarantines, ...q.rows[0] };
  }
  const distinct = await client.query("SELECT COUNT(DISTINCT ean)::int AS distinct_eans FROM products WHERE status = 'enabled'");
  await client.query('COMMIT');
  const quality = evaluateCatalogue(health.rows, baseline, quarantines);
  const totals = health.rows.reduce((acc, row) => {
    for (const key of ['offers', 'refreshed_24h', 'older_than_7d', 'older_than_30d', 'missing_image', 'missing_brand', 'uncategorized']) {
      acc[key] += Number(row[key] || 0);
    }
    return acc;
  }, { offers:0, distinct_eans:0, refreshed_24h:0, older_than_7d:0, older_than_30d:0, missing_image:0, missing_brand:0, uncategorized:0 });
  // An EAN sold by several merchants is counted once in the global total.
  totals.distinct_eans = Number(distinct.rows[0].distinct_eans);
  const report = {
    schema: 3,
    observed_at: observedAt,
    baseline_observed_at: baseline?.observed_at || null,
    ...size.rows[0],
    totals,
    categories:categories.rows,
    quality,
    merchants: health.rows,
  };
  await client.query(`INSERT INTO catalogue_health_snapshots (day, observed_at, snapshot)
    VALUES (CURRENT_DATE, $1, $2::jsonb)
    ON CONFLICT (day) DO UPDATE SET observed_at = EXCLUDED.observed_at, snapshot = EXCLUDED.snapshot`,
    [observedAt, JSON.stringify({ observed_at:observedAt, totals, categories:categories.rows, quality, merchants:health.rows })]);
  await client.query(`DELETE FROM catalogue_health_snapshots WHERE day < CURRENT_DATE - INTERVAL '90 days'`);
  const summary = markdown(report);
  console.log(summary);
  await writeFile('health.json', JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag:'a' });
  if (quality.status === 'critical') console.error(`::error::Catalogue critique : ${quality.counts.critical} alerte(s). Consulter le rapport health.json.`);
  if (quality.status === 'critical' && process.env.CATALOGUE_HEALTH_FAIL_ON_CRITICAL === '1') process.exitCode = 2;
} catch (error) {
  console.error('Catalogue health failed:', error.message);
  process.exitCode = 1;
} finally { await client.end(); }
