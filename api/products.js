const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_KEY       = process.env.SUPABASE_ANON_KEY;
const AFFILAE_PROFILE_ID = '69c1bc52b682a8edf3205672';

async function supabaseQuery(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  return res.json();
}

function makeTrackingUrl(product) {
  if (!product.url || !product.program_id) return product.url || '#';
  // Format officiel Affilae publisher tracking
  return 'https://track.affilae.com/' + product.program_id +
         '?ae=' + AFFILAE_PROFILE_ID +
         '&url=' + encodeURIComponent(product.url);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action='list', q='', limit='30', page='1', id='', cat='' } = req.query;
  const limitN = Math.min(parseInt(limit)||30, 100);
  const offset = (parseInt(page)-1) * limitN;

  try {
    let data;

    if (action === 'search' && q) {
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&or=(title.ilike.*' + encodeURIComponent(q) + '*,description.ilike.*' + encodeURIComponent(q) + '*)' +
        '&status=eq.enabled&order=updated_at.desc&limit=' + limitN + '&offset=' + offset
      );
    } else if (action === 'product' && id) {
      data = await supabaseQuery('products?select=*,programs(title,countries)&id=eq.' + encodeURIComponent(id) + '&limit=1');
    } else if (action === 'history' && id) {
      data = await supabaseQuery('price_history?product_id=eq.' + encodeURIComponent(id) + '&order=recorded_at.asc&limit=365');
    } else if (action === 'programs') {
      data = await supabaseQuery('programs?select=*&order=title.asc');
    } else if (action === 'category' && cat) {
      data = await supabaseQuery('products?select=*,programs(title)&category=eq.' + encodeURIComponent(cat) + '&status=eq.enabled&order=updated_at.desc&limit=' + limitN + '&offset=' + offset);
    } else {
      data = await supabaseQuery('products?select=*,programs(title,countries)&status=eq.enabled&order=updated_at.desc&limit=' + limitN + '&offset=' + offset);
    }

    // Ajoute le lien de tracking à chaque produit
    if (Array.isArray(data)) {
      data = data.map(p => ({ ...p, tracking_url: makeTrackingUrl(p) }));
    }

    return res.status(200).json({ data, count: Array.isArray(data) ? data.length : 0 });

  } catch (err) {
    console.error('API error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
