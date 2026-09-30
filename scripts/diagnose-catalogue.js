import { writeFile } from 'node:fs/promises';
import pg from 'pg';

// Read-only transaction: no cleanup, schema change, import, or paid plan change.
const client = new pg.Client({ connectionString: process.env.NEON_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const size = await client.query('SELECT pg_database_size(current_database())::text AS database_bytes');
  const tables = await client.query(`SELECT relname,
    pg_total_relation_size(relid)::text AS total_bytes,
    pg_relation_size(relid)::text AS table_bytes,
    pg_indexes_size(relid)::text AS index_bytes,
    n_live_tup::text, n_dead_tup::text, last_vacuum, last_autovacuum
    FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15`);
  const categories = await client.query(`SELECT category, COUNT(*)::text AS offer_rows,
    COUNT(DISTINCT ean)::text AS distinct_eans,
    COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours')::text AS updated_last_24h
    FROM products GROUP BY category ORDER BY COUNT(*) DESC`);
  const aliases = await client.query("SELECT to_regclass('public.merchant_aliases') IS NOT NULL AS available");
  const hasAliases = aliases.rows[0].available;
  const merchant = hasAliases ? "COALESCE('merchant:' || a.merchant_id::text, p.program_id)" : 'p.program_id';
  const join = hasAliases ? 'LEFT JOIN merchant_aliases a ON a.raw_program_id = p.program_id' : '';
  const perfumes = await client.query(`SELECT p.ean, MIN(p.title) AS example_title,
    COUNT(DISTINCT ${merchant})::int AS merchants,
    MIN(p.price)::text AS lowest_price, MAX(p.price)::text AS highest_price,
    MIN(p.updated_at) AS oldest_offer, MAX(p.updated_at) AS newest_offer,
    ARRAY_AGG(DISTINCT pr.title) AS merchant_names
    FROM products p ${join} LEFT JOIN programs pr ON pr.id = p.program_id
    WHERE p.category = 'beaute-bienetre' AND p.ean IS NOT NULL
      AND p.price > 0 AND p.currency = 'EUR' AND p.status = 'enabled'
      AND p.in_stock IS DISTINCT FROM FALSE
      AND p.updated_at >= NOW() - INTERVAL '48 hours'
      AND lower(p.title) ~ '(parfum|eau de toilette|eau de cologne)'
    GROUP BY p.ean HAVING COUNT(DISTINCT ${merchant}) >= 2
    ORDER BY COUNT(DISTINCT ${merchant}) DESC, p.ean LIMIT 100`);
  await client.query('ROLLBACK');
  const report = { generatedAt: new Date().toISOString(), database: size.rows[0], tables: tables.rows,
    categories: categories.rows, merchantAliasesAvailable: hasAliases, perfumeCandidates: perfumes.rows,
    limitations: ['La taille SQL de cette base ne mesure pas tous les usages du projet Neon.',
      'n_dead_tup est une estimation de lignes mortes, pas un volume recuperable.',
      'Les candidats sont tries par couverture, pas par popularite ou rentabilite.',
      'Le rapprochement EAN ne valide pas les variantes ni le prix actuel chez le marchand.',
      'Les compteurs de categorie incluent les offres non comparables.'] };
  await writeFile('catalogue-diagnostic.json', JSON.stringify(report, null, 2));
  console.log('DIAGNOSTIC ' + JSON.stringify({ database: report.database, tables: report.tables, categories: report.categories, perfumeCandidates: perfumes.rows.length, merchantAliasesAvailable: hasAliases }));
} catch (error) {
  console.error('Diagnostic impossible (code ' + (error.code || 'unknown') + ').');
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
