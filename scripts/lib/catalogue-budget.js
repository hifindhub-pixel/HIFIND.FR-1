const completeness = rows => {
  let score = 0;
  if (rows.some(row => row.image_url)) score += 3;
  if (rows.some(row => row.brand)) score += 2;
  if (rows.some(row => row.description)) score += 1;
  return score;
};

/**
 * Fits a comparable catalogue into a predictable offer-row budget.
 * Whole EAN groups are kept or rejected: a product can never be left with
 * one merchant. Coverage, classification and data completeness win before
 * the stable EAN tie-breaker, so the cap does not depend on feed order.
 */
export function budgetCatalogue(rows, maxRows = Infinity, maxOffersPerEan = 4) {
  const limit = Number.isFinite(Number(maxRows)) ? Math.max(2, Number(maxRows)) : Infinity;
  const offerCap = Math.max(2, Number(maxOffersPerEan) || 4);
  const grouped = new Map();
  for (const row of rows || []) {
    if (!row?.ean) continue;
    if (!grouped.has(row.ean)) grouped.set(row.ean, []);
    grouped.get(row.ean).push(row);
  }

  const candidates = [...grouped.entries()].map(([ean, offers]) => {
    const vendors = new Map();
    offers.forEach(offer => {
      const current = vendors.get(offer.program_id);
      if (!current || Number(offer.price || Infinity) < Number(current.price || Infinity)) {
        vendors.set(offer.program_id, offer);
      }
    });
    const unique = [...vendors.values()].sort((a,b) => Number(a.price || Infinity) - Number(b.price || Infinity));
    const knownCategory = unique.some(row => row.category && row.category !== 'autres');
    return { ean, offers:unique.slice(0, offerCap), coverage:unique.length, knownCategory, quality:completeness(unique) };
  }).filter(group => group.coverage >= 2)
    .sort((a,b) => b.coverage - a.coverage
      || Number(b.knownCategory) - Number(a.knownCategory)
      || b.quality - a.quality
      || a.ean.localeCompare(b.ean));

  const selected = [];
  const eans = new Set();
  for (const group of candidates) {
    if (selected.length + group.offers.length > limit) continue;
    selected.push(...group.offers);
    eans.add(group.ean);
  }
  return {
    rows:selected,
    eans,
    stats:{
      candidate_eans:candidates.length,
      selected_eans:eans.size,
      candidate_offers:candidates.reduce((sum, group) => sum + group.offers.length, 0),
      selected_offers:selected.length,
      max_offers:limit,
      capped:selected.length < candidates.reduce((sum, group) => sum + group.offers.length, 0),
    },
  };
}
