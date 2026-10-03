// Classement de recherche HiFind. La pertinence produit reste prioritaire ;
// l'engagement ne sert que de departage afin qu'un produit populaire mais
// hors sujet ne puisse jamais passer devant la reference demandee.

export function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return normalizeSearchText(value).split(/\s+/).filter(Boolean);
}

function modelTokens(value) {
  return tokens(value).filter(token => /\d/.test(token) && token.length >= 2);
}

export function textRelevance(product, query) {
  const q = normalizeSearchText(query);
  if (!q) return 0;
  const title = normalizeSearchText(product?.title);
  const brand = normalizeSearchText(product?.brand);
  const ean = String(product?.ean || '').replace(/\D/g, '');
  const rawDigits = String(query || '').replace(/\D/g, '');
  const queryTokens = tokens(q);
  let score = 0;

  if (rawDigits.length >= 8 && ean === rawDigits) score += 1000;
  if (title === q) score += 160;
  else if (title.startsWith(q + ' ')) score += 90;
  else if ((' ' + title + ' ').includes(' ' + q + ' ')) score += 65;
  if (brand && brand === q) score += 80;

  const matched = queryTokens.filter(token => (' ' + title + ' ').includes(' ' + token + ' '));
  if (queryTokens.length && matched.length === queryTokens.length) score += 45;
  score += matched.length * 7;

  const models = modelTokens(q);
  if (models.length && models.every(token => (' ' + title + ' ').includes(' ' + token + ' '))) score += 55;
  return score;
}

export function engagementScore(signal = {}) {
  const views = Math.max(0, Number(signal.detail_views ?? signal.trend_views) || 0);
  const clicks = Math.max(0, Number(signal.offer_clicks ?? signal.trend_clicks) || 0);
  // Logarithme : limite l'effet d'un pic ou d'un robot et conserve un bon
  // departage entre produits ayant recu un engagement reel.
  return Math.log1p(views) * 2 + Math.log1p(clicks) * 5;
}

export function rankSearchResults(products, query, intent = {}, engagementByEan = new Map()) {
  return products.map((product, index) => {
    const signal = engagementByEan.get(String(product.ean)) || product;
    return {
      product,
      index,
      typeTier: intent.primaryType && product.product_type === intent.primaryType ? 1 : 0,
      relevance: textRelevance(product, query),
      engagement: engagementScore(signal),
      offers: Number(product.offers_count) || 0,
      sqlScore: (product.exact_match ? 10 : 0) + Number(product.rank || 0) + Number(product.trgm_sim || 0),
    };
  }).sort((a, b) =>
    (b.typeTier - a.typeTier)
    || (b.relevance - a.relevance)
    || (b.sqlScore - a.sqlScore)
    || (b.engagement - a.engagement)
    || (b.offers - a.offers)
    || (a.index - b.index)
  ).map(item => ({
    ...item.product,
    search_relevance: Math.round(item.relevance * 100) / 100,
    trend_views: Number((engagementByEan.get(String(item.product.ean)) || {}).detail_views) || 0,
    trend_clicks: Number((engagementByEan.get(String(item.product.ean)) || {}).offer_clicks) || 0,
  }));
}
