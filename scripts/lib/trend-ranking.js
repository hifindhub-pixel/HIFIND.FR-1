// Recent behaviour should move discovery pages without letting one old spike
// or repeated clicks dominate forever. Seven-day half-life, thirty-day window.
export const ENGAGEMENT_DECAY_SQL = `
  SELECT ean,
    SUM(detail_views * POWER(0.5, GREATEST(0, CURRENT_DATE - day) / 7.0))::double precision AS trend_views,
    SUM(offer_clicks * POWER(0.5, GREATEST(0, CURRENT_DATE - day) / 7.0))::double precision AS trend_clicks
  FROM product_engagement_daily
  WHERE day >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY ean
`;

export function engagementTrendSql(alias = 'engagement') {
  return `(LEAST(18, LN(1 + COALESCE(${alias}.trend_views, 0)) * 5)
    + LEAST(32, LN(1 + COALESCE(${alias}.trend_clicks, 0)) * 10))`;
}

export function engagementTrendScore({ views = 0, clicks = 0, ageDays = 0 } = {}) {
  const decay = Math.pow(0.5, Math.max(0, Number(ageDays) || 0) / 7);
  const weightedViews = Math.max(0, Number(views) || 0) * decay;
  const weightedClicks = Math.max(0, Number(clicks) || 0) * decay;
  return Math.min(18, Math.log1p(weightedViews) * 5)
    + Math.min(32, Math.log1p(weightedClicks) * 10);
}
