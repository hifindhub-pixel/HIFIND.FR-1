# Catalogue observations

The daily `Catalogue health and price observations` workflow exports a read-only
snapshot at 08:15 UTC. Each successful run stores `health.json` and gzip JSONL
merchant price observations in GitHub Actions artifacts for 90 days.

The export is streamed in batches in one consistent read-only transaction. It
creates no tables or indexes in Neon. It measures active offers refreshed in
24 hours and older than 7/30 days, per merchant, plus database size.

`observed_at` means when HiFind read its catalogue; `updated_at` means the last
import time. Neither guarantees the price still exists on the merchant website.
Archived prices must not be presented as today's verified prices. Future price
charts need product identity/condition validation and durable storage before
artifact expiry. This first collection does not expose a public history API.

Do not exclude old offers globally until this report is reviewed: an import
outage could otherwise empty entire categories. Repair failed source imports
first, then apply an explicit freshness policy.
