# Un Amour de Tapis selection audit — 2026-10-12

The active catalogue fell from 353 to 65 offers between October 10 and 11.
This is a catalogue selection loss, not a source download outage.

| Stage | October 10 | October 11 |
|---|---:|---:|
| Harvested source offers | 6,027 | 6,025 |
| Comparable offers before budgeting | 881 | 880 |
| Active merchant offers after sync | 353 | 65 |
| Global candidate offers after per-product cap | 605,935 | 627,392 |
| Global selected offers | 179,999 | 180,000 |

Source: Sync Products runs 38044052505 and 38131797684; daily health
snapshots. No ingestion error for this merchant appears in those runs.

Read-only validation on October 12, run 38233166252:

- Source: 6,055 records, 6,044 distinct checksum-valid GTINs.
- 65 source GTINs have an active Un Amour de Tapis offer.
- Zero source GTINs have an active competing offer while this merchant is
  absent. The observed loss therefore concerns whole product groups, not
  displacement by cheaper sellers on products still selected.
- 5,979 source GTINs are absent from the active catalogue. This includes
  products without another merchant, not only budget exclusions.
- Database size: 931,848,192 bytes; products and their indexes: 858,595,328.
- October 11 health snapshot: zero selected merchant offers older than 7 days.

The current ranking prioritizes merchant coverage, known category, metadata
completeness, then barcode order, within 180,000 offers. With more competing
eligible groups, lower-ranked complete groups are removed. The configured
storage constraint remains 1 GB; the cap has not been increased.

The importer now records a per-merchant selection funnel in console output
and `matching.storage_budget.merchant_selection` in `sync-report.json`:
input offers, eligible offers after per-product selection, selected offers,
exclusions before the total budget, and exclusions due to the total budget.
This diagnostic does not change rankings or suppress quality alerts. It
will provide exact exclusion counts on the next regular sync.

Restoring more comparable products requires either a deliberate reallocation
of the existing catalogue budget or more database capacity. No old prices
were resurrected and no single-merchant products were added by this audit.
