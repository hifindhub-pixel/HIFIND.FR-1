const AFFILAE_TOKEN = process.env.AFFILAE_TOKEN;
const AFFILAE_BASE = 'https://rest.affilae.com';

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const action = params.action || 'search';
  const query  = params.q || '';
  const limit  = params.limit || '20';

  let url;
  if (action === 'list') {
    url = AFFILAE_BASE + '/publisher/products.list?limit=' + limit;
  } else if (action === 'feeds') {
    url = AFFILAE_BASE + '/publisher/product-feeds.list?limit=50';
  } else if (action === 'partnerships') {
    url = AFFILAE_BASE + '/publisher/partnerships.list?status=accepted&limit=50';
  } else if (action === 'me') {
    url = AFFILAE_BASE + '/publisher/publishers.me';
  } else {
    url = AFFILAE_BASE + '/publisher/products.list?q=' + encodeURIComponent(query) + '&limit=' + limit;
  }

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + AFFILAE_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    const text = await res.text();

    return {
      statusCode: res.status,
      headers,
      body: text
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
