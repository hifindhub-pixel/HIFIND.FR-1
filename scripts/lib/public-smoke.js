export function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function merchantName(offer) {
  return String(offer?.program_title || offer?.programs?.title || offer?.program_id || '').trim();
}

export function validateTrending(payload) {
  const products = Array.isArray(payload?.data) ? payload.data : [];
  if (!products.length) throw new Error('La sélection tendances est vide');
  const product = products.find(item => /^\d{8,14}$/.test(String(item.ean || '')) && Number(item.offers_count) >= 2);
  if (!product) throw new Error('Aucun produit comparable avec EAN et deux marchands');
  return product;
}

export function validateProductDetail(payload, expectedEan = '') {
  const product = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!product) throw new Error('La fiche produit JSON est vide');
  if (expectedEan && String(product.ean) !== String(expectedEan)) throw new Error('La fiche renvoie un autre EAN');
  const offers = (product.ean_offers || []).filter(offer => Number(offer.price) > 0 && (offer.tracking_url || offer.url));
  const merchants = new Set(offers.map(merchantName).filter(Boolean));
  if (offers.length < 2 || merchants.size < 2) throw new Error('La fiche ne contient plus deux offres marchands réelles');
  return { product, offers, merchants };
}

export function productPath(product) {
  return `/produit/${slugify(product.title) || 'produit'}-${encodeURIComponent(product.ean)}`;
}
