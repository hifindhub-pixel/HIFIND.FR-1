export function cjRefreshRow(programId, product) {
  const priceObj = product.salePrice?.amount ? product.salePrice : product.price;
  const price = Number(priceObj?.amount);
  if (!product.id || !product.title || !product.link || priceObj?.currency !== 'EUR' || !Number.isFinite(price) || price <= 0) return null;
  let ean = null;
  for (const part of String(product.gtin || product.mpn || '').split(/[\s,;|]+/)) {
    const code = part.trim().replace(/\.0$/, '');
    if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) continue;
    const digits = code.split('').map(Number), check = digits.pop();
    const sum = digits.reverse().reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1), 0);
    if ((10 - sum % 10) % 10 === check) { ean = code; break; }
  }
  if (!ean) return null;
  const raw = programId + '_' + product.id;
  return { id: raw.replace(/[^a-z0-9_\-]/gi, '_').slice(0,100), affilae_id: raw.slice(0,100), ean, price };
}

export function unambiguousCjRows(rows) {
  const unique = new Map(), ambiguous = new Set();
  for (const row of rows) {
    const previous = unique.get(row.id);
    if (previous && (previous.affilae_id !== row.affilae_id || previous.ean !== row.ean || previous.price !== row.price)) ambiguous.add(row.id);
    unique.set(row.id,row);
  }
  return { rows: [...unique.values()].filter(row => !ambiguous.has(row.id)), ambiguous: ambiguous.size };
}
