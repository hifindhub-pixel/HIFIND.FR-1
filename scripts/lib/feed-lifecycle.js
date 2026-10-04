// Tracks whether a merchant catalogue was fully harvested and ingested.
// Stale offers may only be archived when every observed partition succeeded.
export class FeedLifecycle {
  constructor() {
    this.complete = new Set();
    this.incomplete = new Set();
    this.ingestFailures = new Set();
  }

  feedSucceeded(programId, count) {
    if (count > 0) this.complete.add(programId);
    else this.incomplete.add(programId);
  }

  feedIncomplete(programId) {
    this.incomplete.add(programId);
  }

  ingestFailed(programId) {
    this.ingestFailures.add(programId);
  }

  safePrograms() {
    return [...this.complete].filter(programId =>
      !this.incomplete.has(programId) && !this.ingestFailures.has(programId)
    ).sort();
  }

  summary() {
    return {
      complete_programs: this.complete.size,
      protected_incomplete_programs: this.incomplete.size,
      protected_ingest_failures: this.ingestFailures.size,
      safe_to_archive: this.safePrograms().length,
    };
  }
}
