# Classification v3

The existing 12 category slugs are retained for SQL queries, URLs and integrations.
`scripts/lib/categorize.js` is the category authority used by ingestion, reclassification
and API responses. Named subject rules precede device/model references; ambiguous
brand names cannot classify a product alone. Unknown imports remain `autres`.

`scripts/lib/product-type.js` adds an explicit category → family → product-type
hierarchy. Every emitted type is checked against its category. The public import
path `api/product-type.js` remains supported. API responses add `category_family`,
`category_path`, `product_type_label`, `category_source`, `classification_version`.
Existing product identifiers, offer URLs, prices and conditions are preserved.

For existing opaque titles, the API and backfill retain the stored category until
there is reliable replacement evidence. These rows appear in unresolved.json;
this is a deliberate migration limitation, not proof their historical category
is correct. Families/types are computed, not separately stored/indexed in SQL.
Category counts/pagination still use the existing SQL category column and may
exceed displayed comparable groups after compatibility filtering. Type facets
only count loaded results, as labelled in the UI.

## Applying existing catalogue corrections

The existing reclassification workflow runs tests, then `scripts/recategorize.js
--apply`. A default invocation without `--apply` only writes a report. It exports
the previous category and the exact timestamp as text before applying an atomic
transaction. Any changed/missing row causes a rollback of the entire batch.
There are no product/offer deletions, price writes, or price timestamp changes.
Reports remain available in the workflow artifact for 30 days.

## Validation

- Existing category, search, condition, merchant and grouping regressions.
- v3 tests cover live-catalogue errors and separately identified synthetic cases.
- A public API sample captured on 2026-10-02: 30 products / 90 offers retained when
  replayed through the revised grouping function (not a full catalogue audit).
- Frontend type chips and sidebar now both use stable type IDs for filtering.

Pending work: catalogue-wide precision review, indexed family/type filters,
explicit review of unresolved rows, and durable historical price storage. The
existing daily snapshot workflow alone is not a public price-history service.
