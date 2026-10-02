import { getPool } from './products.js';

const EVENTS = new Set(['detail_view', 'offer_click']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const ean = String(req.body?.ean || '').trim();
  const event = String(req.body?.event || '').trim();
  if (!/^\d{8,14}$/.test(ean) || !EVENTS.has(event)) {
    return res.status(400).json({ error: 'Événement invalide' });
  }

  const client = await getPool().connect();
  try {
    const detailViews = event === 'detail_view' ? 1 : 0;
    const offerClicks = event === 'offer_click' ? 1 : 0;
    await client.query(`
      INSERT INTO product_engagement_daily (ean, day, detail_views, offer_clicks)
      VALUES ($1, CURRENT_DATE, $2, $3)
      ON CONFLICT (ean, day) DO UPDATE SET
        detail_views = product_engagement_daily.detail_views + EXCLUDED.detail_views,
        offer_clicks = product_engagement_daily.offer_clicks + EXCLUDED.offer_clicks,
        updated_at = NOW()
    `, [ean, detailViews, offerClicks]);
    return res.status(202).json({ ok: true });
  } catch (error) {
    console.error('Engagement error:', error.message);
    return res.status(503).json({ error: 'Mesure momentanément indisponible' });
  } finally {
    client.release();
  }
}
