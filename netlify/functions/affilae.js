// ══════════════════════════════════════════
// HIFIND — Netlify Function
// Interroge Supabase (base locale) au lieu
// d'appeler Affilae à chaque requête
// ══════════════════════════════════════════

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY;

async function supabaseQuery(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json'
    }
  });
  if (!res.ok) throw new Error('Supabase error ' + res.status);
  return res.json();
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type':                 'application/json',
    'Cache-Control':                'public, max-age=300'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const action = params.action || 'list';
  const query  = params.q    || '';
  const limit  = parseInt(params.limit) || 30;
  const page   = parseInt(params.page)  || 1;
  const offset = (page - 1) * limit;

  try {
    let data;

    if (action === 'search' && query) {
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&or=(title.ilike.*' + encodeURIComponent(query) + '*,description.ilike.*' + encodeURIComponent(query) + '*)' +
        '&status=eq.enabled' +
        '&order=updated_at.desc' +
        '&limit=' + limit +
        '&offset=' + offset
      );
    } else if (action === 'product') {
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&id=eq.' + encodeURIComponent(params.id) +
        '&limit=1'
      );
    } else if (action === 'history') {
      data = await supabaseQuery(
        'price_history?product_id=eq.' + encodeURIComponent(params.id) +
        '&order=recorded_at.asc&limit=365'
      );
    } else if (action === 'programs') {
      data = await supabaseQuery('programs?select=*&order=title.asc');
    } else if (action === 'category') {
      data = await supabaseQuery(
        'products?select=*,programs(title)' +
        '&category=eq.' + encodeURIComponent(params.cat || '') +
        '&status=eq.enabled&order=updated_at.desc' +
        '&limit=' + limit + '&offset=' + offset
      );
    } else {
      data = await supabaseQuery(
        'products?select=*,programs(title,countries)' +
        '&status=eq.enabled&order=updated_at.desc' +
        '&limit=' + limit + '&offset=' + offset
      );
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: data, count: Array.isArray(data) ? data.length : 0 })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
