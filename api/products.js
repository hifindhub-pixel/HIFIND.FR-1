const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_KEY       = process.env.SUPABASE_ANON_KEY;
const AFFILAE_PROFILE_ID = '69c1bc52b682a8edf3205672';

async function supabaseQuery(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Supabase ' + res.status + ': ' + err.slice(0, 200));
  }
  return res.json();
}

function makeTrackingUrl(product) {
  if (!product.url) return '#';
  // Produits Effinity → lien de tracking direct (déjà dans url)
  if (product.program_id && product.program_id.startsWith('effinity_')) {
    return product.url;
  }
  // Produits Affilae → tracking Affilae
  if (product.program_id) {
    return 'https://track.affilae.com/' + product.program_id +
           '?ae=' + AFFILAE_PROFILE_ID +
           '&url=' + encodeURIComponent(product.url);
  }
  return product.url || '#';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action='list', q='', limit='30', page='1', id='', cat='' } = req.query;
  const limitN = Math.min(parseInt(limit)||30, 100);
  const offset = (parseInt(page)-1) * limitN;

  try {
    let data;

    if (action === 'search' && q) {
      // Encode correctement le terme de recherche pour Supabase
      const term = encodeURIComponent('%' + q + '%');
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&title=ilike.' + term +
        '&status=eq.enabled&order=updated_at.desc' +
        '&limit=' + limitN + '&offset=' + offset
      );
      // Si pas de résultats par titre, cherche dans la description
      if (!data || data.length === 0) {
        data = await supabaseQuery(
          'products?select=*,programs(title,countries)' +
          '&description=ilike.' + term +
          '&status=eq.enabled&order=updated_at.desc' +
          '&limit=' + limitN + '&offset=' + offset
        );
      }
    } else if (action === 'product' && id) {
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)&id=eq.' + encodeURIComponent(id) + '&limit=1'
      );
    } else if (action === 'history' && id) {
      data = await supabaseQuery(
        'price_history?product_id=eq.' + encodeURIComponent(id) + '&order=recorded_at.asc&limit=365'
      );
    } else if (action === 'programs') {
      data = await supabaseQuery('programs?select=*&order=title.asc');
    } else if (action === 'category' && cat) {
      data = await supabaseQuery(
        'products?select=*,programs(title)&category=eq.' + encodeURIComponent(cat) +
        '&status=eq.enabled&order=updated_at.desc&limit=' + limitN + '&offset=' + offset
      );
    } else {
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&status=eq.enabled&order=updated_at.desc' +
        '&limit=' + limitN + '&offset=' + offset
      );
    }

    if (Array.isArray(data)) {
      data = data.map(p => ({ ...p, tracking_url: makeTrackingUrl(p) }));
    }

    return res.status(200).json({ data, count: Array.isArray(data) ? data.length : 0 });

  } catch (err) {
    console.error('API error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
