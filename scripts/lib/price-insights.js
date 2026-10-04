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

function windowStats(observations, currentPrice, now, days) {
  if (!observations.length) return null;
  const nowMs = now.getTime();
  const startMs = nowMs - days * 86400000;
  const timed = observations.map(item => ({ ...item, time:new Date(item.date).getTime() }))
    .filter(item => Number.isFinite(item.time) && item.time <= nowMs);
  if (!timed.length) return null;

  const before = timed.filter(item => item.time <= startMs).at(-1);
  const firstInside = timed.find(item => item.time > startMs);
  const first = before || firstInside;
  if (!first) return null;
  const effectiveStart = before ? startMs : first.time;
  const coverageDays = Math.max(0, (nowMs - effectiveStart) / 86400000);
  // Une valeur « 30 j » ou « 90 j » n'est publiée que si au moins 70 %
  // de la période est réellement couverte. Pas d'extrapolation marketing.
  if (coverageDays < days * 0.7) return null;

  let cursor = effectiveStart;
  let activePrice = first.min_price;
  let weighted = 0;
  const prices = [activePrice];
  for (const item of timed) {
    if (item.time <= effectiveStart) continue;
    weighted += activePrice * (item.time - cursor);
    cursor = item.time;
    activePrice = item.min_price;
    prices.push(activePrice);
  }
  weighted += activePrice * Math.max(0, nowMs - cursor);
  prices.push(currentPrice);
  const duration = Math.max(1, nowMs - effectiveStart);
  const average = weighted / duration;
  return {
    days,
    coverage_days: Math.round(coverageDays),
    average,
    low:Math.min(...prices),
    high:Math.max(...prices),
    change_pct:first.min_price > 0 ? (currentPrice - first.min_price) / first.min_price * 100 : null,
    vs_average_pct:average > 0 ? (currentPrice - average) / average * 100 : null,
  };
}

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
  let historyLow = null, historyHigh = null, historyAverage = null, historyMedian = null;
  let lowestObservedAt = null, historyPositionPct = null, vsTypicalPct = null;

  if (observations.length) {
    const historicalPrices = observations.map(item => item.min_price);
    historyLow = Math.min(...historicalPrices);
    historyHigh = Math.max(...historicalPrices);
    historyAverage = historicalPrices.reduce((sum, value) => sum + value, 0) / historicalPrices.length;
    historyMedian = median(historicalPrices);
    const lowObservation = observations.reduce((best, item) => item.min_price < best.min_price ? item : best, observations[0]);
    lowestObservedAt = lowObservation.date;
  }
  const stats30 = windowStats(observations, currentPrice, now, 30);
  const stats90 = windowStats(observations, currentPrice, now, 90);
  if (historyReady) {
    const range = historyHigh - historyLow;
    historyPoints = range < 0.01 ? 18 : Math.max(0, Math.min(30, 30 * (historyHigh - currentPrice) / range));
    historyPositionPct = range < 0.01 ? 50 : Math.max(0, Math.min(100, (currentPrice - historyLow) / range * 100));
    const typicalPrice = stats90?.average || historyMedian;
    vsTypicalPct = typicalPrice > 0 ? (currentPrice - typicalPrice) / typicalPrice * 100 : null;
  }

  const availablePoints = 70 + (historyReady ? 30 : 0);
  const score = Math.max(0, Math.min(100, Math.round((coveragePoints + marketPoints + freshnessPoints + historyPoints) / availablePoints * 100)));
  const atHistoryLow = historyReady && currentPrice <= historyLow * 1.01;
  let label;
  if (historyReady) {
    label = atHistoryLow ? 'Au plus bas observé'
      : vsTypicalPct <= -5 ? 'Sous le prix habituel'
      : vsTypicalPct >= 8 ? 'Au-dessus du prix habituel'
      : 'Dans la moyenne habituelle';
  } else {
    label = discountVsMedian >= 0.1 ? 'Prix compétitif' : 'Prix à comparer';
  }
  const confidence = historyReady
    ? (spanDays >= 30 && observations.length >= 5 && merchantCount >= 3 ? 'élevée' : 'modérée')
    : 'limitée';

  return {
    score,
    label,
    confidence,
    history_status: historyReady ? 'ready' : 'collecting',
    current_price: currentPrice,
    market_median: marketMedian,
    discount_vs_median_pct: Math.round(discountVsMedian * 100),
    history_low: historyLow,
    history_high: historyHigh,
    history_average: historyAverage,
    history_median: historyMedian,
    history_position_pct: historyPositionPct == null ? null : Math.round(historyPositionPct),
    vs_typical_pct: vsTypicalPct == null ? null : Math.round(vsTypicalPct * 10) / 10,
    at_history_low: atHistoryLow,
    lowest_observed_at: lowestObservedAt,
    history_span_days: Math.max(0, Math.round(spanDays)),
    average_30d:stats30 ? Math.round(stats30.average * 100) / 100 : null,
    average_90d:stats90 ? Math.round(stats90.average * 100) / 100 : null,
    change_30d_pct:stats30?.change_pct == null ? null : Math.round(stats30.change_pct * 10) / 10,
    change_90d_pct:stats90?.change_pct == null ? null : Math.round(stats90.change_pct * 10) / 10,
    vs_average_90d_pct:stats90?.vs_average_pct == null ? null : Math.round(stats90.vs_average_pct * 10) / 10,
    history_coverage_30d:stats30?.coverage_days || 0,
    history_coverage_90d:stats90?.coverage_days || 0,
    observation_count: observations.length,
    components: {
      merchant_coverage: Math.round(coveragePoints),
      market_position: Math.round(marketPoints),
      freshness: Math.round(freshnessPoints),
      history: Math.round(historyPoints),
    },
  };
}
