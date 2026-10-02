const numeric = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const median = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function computePriceInsights(offers = [], history = [], now = new Date(), options = {}) {
  const prices = offers.map(offer => numeric(offer.price)).filter(Boolean).sort((a, b) => a - b);
  if (!prices.length) return null;

  const currentPrice = prices[0];
  const marketMedian = median(prices);
  const merchantCount = Math.max(1, Number(options.merchantCount) || prices.length);
  const discountVsMedian = marketMedian > currentPrice ? (marketMedian - currentPrice) / marketMedian : 0;

  const coveragePoints = Math.min(20, 8 + Math.max(0, merchantCount - 2) * 4);
  const marketPoints = Math.min(35, discountVsMedian * 140);
  const freshest = offers.map(offer => new Date(offer.updated_at || 0).getTime()).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
  const ageDays = freshest ? Math.max(0, (now.getTime() - freshest) / 86400000) : Infinity;
  const freshnessPoints = ageDays <= 2 ? 15 : ageDays <= 7 ? 10 : ageDays <= 30 ? 4 : 0;

  const observations = history.map(item => ({
    date: item.observed_at || item.date,
    min_price: numeric(item.min_price),
  })).filter(item => item.date && item.min_price).sort((a, b) => new Date(a.date) - new Date(b.date));
  const spanDays = observations.length > 1
    ? (new Date(observations.at(-1).date) - new Date(observations[0].date)) / 86400000 : 0;
  const historyReady = observations.length >= 3 && spanDays >= 7;
  let historyPoints = 0;
  let historyLow = null, historyHigh = null, historyAverage = null, change30d = null;

  if (observations.length) {
    const historicalPrices = observations.map(item => item.min_price);
    historyLow = Math.min(...historicalPrices);
    historyHigh = Math.max(...historicalPrices);
    historyAverage = historicalPrices.reduce((sum, value) => sum + value, 0) / historicalPrices.length;
  }
  if (historyReady) {
    const range = historyHigh - historyLow;
    historyPoints = range < 0.01 ? 18 : Math.max(0, Math.min(30, 30 * (historyHigh - currentPrice) / range));
    const cutoff = now.getTime() - 30 * 86400000;
    const baseline = observations.find(item => new Date(item.date).getTime() >= cutoff) || observations[0];
    change30d = baseline.min_price > 0 ? ((currentPrice - baseline.min_price) / baseline.min_price) * 100 : null;
  }

  const availablePoints = 70 + (historyReady ? 30 : 0);
  const score = Math.max(0, Math.min(100, Math.round((coveragePoints + marketPoints + freshnessPoints + historyPoints) / availablePoints * 100)));
  const label = score >= 80 ? 'Très bon prix' : score >= 65 ? 'Bon prix' : score >= 45 ? 'Prix correct' : 'À comparer';

  return {
    score,
    label,
    confidence: historyReady && merchantCount >= 3 ? 'élevée' : 'standard',
    history_status: historyReady ? 'ready' : 'collecting',
    current_price: currentPrice,
    market_median: marketMedian,
    discount_vs_median_pct: Math.round(discountVsMedian * 100),
    history_low: historyLow,
    history_high: historyHigh,
    history_average: historyAverage,
    change_30d_pct: change30d == null ? null : Math.round(change30d * 10) / 10,
    observation_count: observations.length,
    components: {
      merchant_coverage: Math.round(coveragePoints),
      market_position: Math.round(marketPoints),
      freshness: Math.round(freshnessPoints),
      history: Math.round(historyPoints),
    },
  };
}
