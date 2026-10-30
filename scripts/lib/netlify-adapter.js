// Adapt the existing Vercel-style handlers to standard Request/Response.
export function resolveRoute(url) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const query = Object.fromEntries(url.searchParams);
  const api = path.match(/^\/api\/(products|produit|categorie|discovery|marchand|marchands|sitemap|img|engagement|flights)$/);
  if (api) return { name: api[1], query };
  const pages = { '/tendances':'tendances', '/baisses-de-prix':'baisses-prix', '/marques':'marques' };
  if (pages[path]) return { name:'discovery', query:{ ...query, pageType:pages[path] } };
  if (path === '/marchands') return { name:'marchands', query };
  if (path === '/sitemap.xml') return { name:'sitemap', query };
  const part = path.match(/^\/sitemap-(\d+)\.xml$/);
  if (part) return { name:'sitemap', query:{ ...query, part:part[1] } };
  const detail = path.match(/^\/(produit|categorie|marchand|marque)\/(.+)$/);
  if (detail) {
    const slug = decodeURIComponent(detail[2]);
    return detail[1] === 'marque'
      ? { name:'discovery', query:{ ...query, pageType:'marque', slug } }
      : { name:detail[1], query:{ ...query, slug } };
  }
  return null;
}

export async function invokeHandler(handler, request, query) {
  let status = 200, body = null;
  const headers = new Headers();
  const res = {
    setHeader(name, value) { headers.set(name, String(value)); return res; },
    status(value) { status = value; return res; },
    json(value) { headers.set('Content-Type', 'application/json; charset=utf-8'); body = JSON.stringify(value); return res; },
    send(value) { body = value; if (!headers.has('Content-Type')) headers.set('Content-Type', typeof value === 'string' ? 'text/html; charset=utf-8' : 'application/octet-stream'); return res; },
    end(value) { body = value ?? null; return res; },
  };
  let input;
  if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
    const raw = await request.text();
    if (raw.length > 16384) return new Response('Requête trop volumineuse', { status:413 });
    try { input = raw ? JSON.parse(raw) : {}; }
    catch { return new Response('JSON invalide', { status:400 }); }
  }
  await handler({ method:request.method, query, body:input, headers:Object.fromEntries(request.headers), url:request.url }, res);
  return new Response(request.method === 'HEAD' || [204,304].includes(status) ? null : body, { status, headers });
}
