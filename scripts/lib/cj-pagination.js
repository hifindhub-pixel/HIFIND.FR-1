import { createHash } from 'node:crypto';
// Read the complete feed for merchants whose configured caps left old offers
// untouched. Storage limits are applied separately by catalogue-budget.
export function cjReadLimit(name, configuredLimit) {
  if (['notino', 'ugreen'].includes(String(name).toLowerCase())) return Infinity;
  const limit = Number.parseInt(configuredLimit, 10);
  return Number.isFinite(limit) && limit > 0 ? limit : Infinity;
}

export async function collectCjPages(fetchPage, { limit = Infinity, pageSize = 1000 } = {}) {
  if (!(limit === Infinity || Number.isInteger(limit) && limit > 0)
      || !Number.isInteger(pageSize) || pageSize < 1) throw new Error('Invalid CJ pagination options');
  const items = [], pages = new Set();
  let total = null;
  while (total === null || items.length < Math.min(total, limit)) {
    const size = Math.min(pageSize, limit - items.length, total === null ? Infinity : total - items.length);
    const page = await fetchPage({ offset: items.length, limit: size });
    if (!page || page.totalCount == null || !Number.isSafeInteger(Number(page.totalCount))
        || Number(page.totalCount) < 0 || !Array.isArray(page.resultList)) {
      throw new Error('Malformed CJ catalogue page');
    }
    if (total !== null && total !== Number(page.totalCount)) throw new Error('CJ catalogue changed during pagination; retry required');
    total = Number(page.totalCount);
    const batch = page.resultList;
    if (batch.length > size || items.length + batch.length > total) throw new Error('CJ page exceeds expected count');
    if (!batch.length && items.length < Math.min(total, limit)) throw new Error('CJ catalogue ended prematurely');
    // CJ may expose the same product ID in multiple feeds. A repeated whole
    // page, rather than a repeated SKU, indicates stalled pagination.
    const fingerprint = createHash('sha256').update(JSON.stringify(batch)).digest('hex');
    if (batch.length && pages.has(fingerprint)) throw new Error('Repeated CJ catalogue page');
    pages.add(fingerprint);
    for (const product of batch) {
      if (product?.id == null || String(product.id) === '') {
        throw new Error('Missing CJ product identity');
      }
      items.push(product);
    }
  }
  return { items, total, complete: items.length === total };
}
