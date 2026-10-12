// Improve display only; never merge GTINs or replace merchant offer metadata.
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function models(title) {
  return new Set((String(title || '').toUpperCase().match(/[A-Z0-9]+(?:-[A-Z0-9]+)*/g) || [])
    .filter(token => /^[A-Z]/.test(token) && /\d{3,}/.test(token) && token.length >= 4)
    .map(normalize));
}

export function productDisplayTitle(reference, offers, merchantIdentity = offer => offer.program_id) {
  const original = reference.title;
  if (!reference.ean || !reference.brand || models(original).size) return original;
  const candidates = (offers || []).filter(offer => offer.ean === reference.ean
    && normalize(offer.brand) === normalize(reference.brand) && offer.title && offer.title.length <= 220);
  const support = new Map();
  for (const offer of candidates) {
    const merchant = merchantIdentity(offer);
    if (!merchant) continue;
    for (const model of models(offer.title)) {
      if (!support.has(model)) support.set(model,new Set());
      support.get(model).add(merchant);
    }
  }
  const agreed = [...support].filter(([,merchants])=>merchants.size >= 2).map(([model])=>model);
  if (agreed.length !== 1) return original;
  const compatible = candidates.filter(offer => {
    const tokens=models(offer.title);
    return tokens.size===1 && tokens.has(agreed[0]);
  });
  compatible.sort((a,b)=>a.title.length-b.title.length || a.title.localeCompare(b.title));
  return compatible[0]?.title || original;
}
