// ══════════════════════════════════════════
// HIFIND — Vercel API Function
// /api/products.js
// ══════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

async function supabaseQuery(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json'
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Supabase error ' + res.status + ': ' + err);
  }
  return res.json();
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action = 'list', q = '', limit = '30', page = '1', id = '', cat = '' } = req.query;
  const limitN  = Math.min(parseInt(limit) || 30, 100);
  const offset  = (parseInt(page) - 1) * limitN;

  try {
    let data;

    if (action === 'search' && q) {
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&or=(title.ilike.*' + encodeURIComponent(q) + '*,description.ilike.*' + encodeURIComponent(q) + '*)' +
        '&status=eq.enabled&order=updated_at.desc' +
        '&limit=' + limitN + '&offset=' + offset
      );
    } else if (action === 'product' && id) {
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&id=eq.' + encodeURIComponent(id) + '&limit=1'
      );
    } else if (action === 'history' && id) {
      data = await supabaseQuery(
        'price_history?product_id=eq.' + encodeURIComponent(id) +
        '&order=recorded_at.asc&limit=365'
      );
    } else if (action === 'programs') {
      data = await supabaseQuery('programs?select=*&order=title.asc');
    } else if (action === 'category' && cat) {
      data = await supabaseQuery(
        'products?select=*,programs(title)' +
        '&category=eq.' + encodeURIComponent(cat) +
        '&status=eq.enabled&order=updated_at.desc' +
        '&limit=' + limitN + '&offset=' + offset
      );
    } else {
      // Liste tous les produits
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&status=eq.enabled&order=updated_at.desc' +
        '&limit=' + limitN + '&offset=' + offset
      );
    }

    return res.status(200).json({
      data:  data,
      count: Array.isArray(data) ? data.length : 0
    });

  } catch (err) {
    console.error('API error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
