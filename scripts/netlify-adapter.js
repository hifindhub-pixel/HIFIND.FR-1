// Keep the existing Vercel handlers usable on Netlify without duplicating logic.
export function resolveRoute(pathname) {
  const path = pathname.replace(/\/$/, '') || '/';
  const api = path.match(/^\/api\/(products|flights|img|engagement|categorie|discovery|marchand|marchands|produit|sitemap)$/);
  if (api) return { name: api[1], query: {} };
  const discovery = { '/tendances': 'tendances', '/baisses-de-prix': 'baisses-prix', '/marques': 'marques' };
  if (Object.hasOwn(discovery, path)) return { name: 'discovery', query: { pageType: discovery[path] } };
  if (path === '/marchands') return { name: 'marchands', query: {} };
  if (path === '/sitemap.xml') return { name: 'sitemap', query: {} };
  const sitemap = path.match(/^\/sitemap-(\d+)\.xml$/);
  if (sitemap) return { name: 'sitemap', query: { part: sitemap[1] } };
  const page = path.match(/^\/(marque|marchand|categorie|produit)\/(.+)$/);
  if (!page) return null;
  return { name: page[1] === 'marque' ? 'discovery' : page[1], query: {
    ...(page[1] === 'marque' ? { pageType: 'marque' } : {}), slug: decodeURIComponent(page[2]),
  } };
}

export async function dispatch(event, handlers) {
  let route;
  try { route = resolveRoute(new URL(event.rawUrl || event.path, 'https://localhost').pathname); }
  catch { return { statusCode: 400, body: 'URL invalide' }; }
  if (!route) return { statusCode: 404, body: 'Page introuvable' };
  const headers = {};
  let statusCode = 200;
  let body = '';
  let isBase64Encoded = false;
  const res = {
    setHeader(name, value) { headers[name.toLowerCase()] = String(value); return this; },
    status(code) { statusCode = code; return this; },
    end(value = '') { return this.send(value); },
    send(value = '') {
      isBase64Encoded = Buffer.isBuffer(value);
      body = isBase64Encoded ? value.toString('base64') : String(value);
      if (!headers['content-type']) headers['content-type'] = 'text/html; charset=utf-8';
      return this;
    },
    json(value) { this.setHeader('Content-Type', 'application/json; charset=utf-8'); return this.send(JSON.stringify(value)); },
  };
  let requestBody;
  if (event.body) {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    try { requestBody = JSON.parse(raw); }
    catch { return { statusCode: 400, headers: { 'cache-control': 'no-store' }, body: 'JSON invalide' }; }
  }
  try {
    await handlers[route.name]({
      method: event.httpMethod, headers: event.headers || {}, body: requestBody,
      query: { ...(event.queryStringParameters || {}), ...route.query },
    }, res);
  } catch {
    return { statusCode: 500, headers: { 'cache-control': 'no-store' }, body: 'Service momentanément indisponible' };
  }
  if (statusCode >= 400) headers['cache-control'] = 'no-store';
  return { statusCode, headers, body: event.httpMethod === 'HEAD' || statusCode === 204 ? '' : body, isBase64Encoded };
}
