// Counters describe committed writes, never the prepared catalogue.
export async function persistHarvest(batches, client, upsert) {
  const report = { planned: batches.reduce((n, b) => n + b.rows.length, 0), committed: 0, merchants: 0, categories: {} };
  for (const batch of batches) {
    let phase = 'begin';
    try {
      await client.query('BEGIN');
      phase = 'write';
      await upsert('programs', [{ id: batch.programId, title: batch.meta.title, categories: [], countries: ['FR'], updated_at: new Date().toISOString() }]);
      for (let i = 0; i < batch.rows.length; i += 50) await upsert('products', batch.rows.slice(i, i + 50));
      phase = 'commit';
      await client.query('COMMIT');
    } catch (cause) {
      let rolledBack = false;
      try { await client.query('ROLLBACK'); rolledBack = true; } catch { /* Connection may already be closed. */ }
      // A connection loss during COMMIT has an unknown outcome: do not claim
      // rollback or count those rows as confirmed writes.
      const error = new Error('Import interrompu pour ' + batch.meta.title + ' (code ' + (cause.code || 'unknown') + ').');
      error.cause = cause;
      error.report = { ...report, failedMerchant: batch.meta.title, outcome: phase === 'commit' || !rolledBack ? 'unknown' : 'rolled_back' };
      throw error;
    }
    report.committed += batch.rows.length;
    report.merchants++;
    for (const row of batch.rows) report.categories[row.category] = (report.categories[row.category] || 0) + 1;
  }
  return report;
}
