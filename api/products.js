const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_KEY       = process.env.SUPABASE_ANON_KEY;
const AFFILAE_PROFILE_ID = '69c1bc52b682a8edf3205672';

async function supabaseQuery(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Supabase ' + res.status + ': ' + err.slice(0, 300));
  }
  return res.json();
}

function makeTrackingUrl(product) {
  if (!product.url) return '#';
  if (product.program_id && product.program_id.startsWith('effinity_')) return product.url;
  if (product.program_id && product.program_id.startsWith('rakuten_')) return product.url;
  if (product.program_id) {
    return 'https://track.affilae.com/' + product.program_id +
           '?ae=' + AFFILAE_PROFILE_ID + '&url=' + encodeURIComponent(product.url);
  }
  return product.url;
}

// Groupe les produits par EAN — retourne un produit principal avec toutes ses offres
function groupByEAN(products) {
  const eanMap = {};
  const noEAN = [];

  for (const p of products) {
    p.tracking_url = makeTrackingUrl(p);
    if (p.ean && p.ean.length >= 8) {
      if (!eanMap[p.ean]) {
        eanMap[p.ean] = { ...p, offers: [p] };
      } else {
        // Ajoute comme offre supplémentaire
        eanMap[p.ean].offers.push(p);
        // Garde le meilleur prix comme prix principal
        if (p.price && p.price < eanMap[p.ean].price) {
          eanMap[p.ean].price = p.price;
          eanMap[p.ean].image_url = eanMap[p.ean].image_url || p.image_url;
        }
      }
    } else {
      noEAN.push({ ...p, offers: [p] });
    }
  }

  return [...Object.values(eanMap), ...noEAN];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action='list', q='', limit='30', page='1', id='', cat='', ean='' } = req.query;
  const limitN = Math.min(parseInt(limit)||30, 100);
  const offset = (parseInt(page)-1) * limitN;

  try {
    let data;

    if (action === 'search' && q) {
      const term = encodeURIComponent('%' + q + '%');
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&title=ilike.' + term +
        '&status=eq.enabled&order=updated_at.desc' +
        '&limit=200&offset=0'
      );
      if (!data || data.length < 5) {
        const descData = await supabaseQuery(
          'products?select=*,programs(title,countries)' +
          '&description=ilike.' + term +
          '&status=eq.enabled&order=updated_at.desc' +
          '&limit=100&offset=0'
        );
        const ids = new Set((data||[]).map(p => p.id));
        const extra = (descData||[]).filter(p => !ids.has(p.id));
        data = [...(data||[]), ...extra];
      }
      data = groupByEAN(data).slice(0, limitN);

    } else if (action === 'product' && id) {
      // Charge le produit + toutes ses offres EAN
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)&id=eq.' + encodeURIComponent(id) + '&limit=1'
      );
      if (data && data.length > 0 && data[0].ean) {
        // Charge toutes les offres avec le même EAN
        const eanData = await supabaseQuery(
          'products?select=*,programs(title,countries)' +
          '&ean=eq.' + encodeURIComponent(data[0].ean) +
          '&status=eq.enabled&order=price.asc&limit=20'
        );
        if (eanData && eanData.length > 1) {
          data[0].ean_offers = eanData.map(p => ({...p, tracking_url: makeTrackingUrl(p)}));
        }
      }

    } else if (action === 'ean' && ean) {
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&ean=eq.' + encodeURIComponent(ean) +
        '&status=eq.enabled&order=price.asc&limit=20'
      );

    } else if (action === 'history' && id) {
      data = await supabaseQuery(
        'price_history?product_id=eq.' + encodeURIComponent(id) + '&order=recorded_at.asc&limit=365'
      );
    } else if (action === 'programs') {
      data = await supabaseQuery('programs?select=*&order=title.asc');
    } else if (action === 'category' && cat) {
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&category=eq.' + encodeURIComponent(cat) +
        '&status=eq.enabled&order=updated_at.desc' +
        '&limit=200&offset=' + offset
      );
      data = groupByEAN(data).slice(0, limitN);
    } else {
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&status=eq.enabled&order=updated_at.desc' +
        '&limit=200&offset=' + offset
      );
      data = groupByEAN(data).slice(0, limitN);
    }

    if (Array.isArray(data) && action !== 'product') {
      data = data.map(p => ({ ...p, tracking_url: p.tracking_url || makeTrackingUrl(p) }));
    } else if (action === 'product' && Array.isArray(data)) {
      data = data.map(p => ({ ...p, tracking_url: makeTrackingUrl(p) }));
    }

    return res.status(200).json({ data, count: Array.isArray(data) ? data.length : 0 });

  } catch (err) {
    console.error('API error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
