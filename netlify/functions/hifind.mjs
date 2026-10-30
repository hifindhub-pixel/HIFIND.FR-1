import { resolveRoute, invokeHandler } from '../../scripts/lib/netlify-adapter.js';

// Literal imports allow Netlify to bundle only the public application handlers.
const handlers = {
  products: () => import('../../api/products.js'),
  produit: () => import('../../api/produit.js'),
  categorie: () => import('../../api/categorie.js'),
  discovery: () => import('../../api/discovery.js'),
  marchand: () => import('../../api/marchand.js'),
  marchands: () => import('../../api/marchands.js'),
  sitemap: () => import('../../api/sitemap.js'),
  img: () => import('../../api/img.js'),
  engagement: () => import('../../api/engagement.js'),
  flights: () => import('../../api/flights.js'),
};
export default async function hifind(request) {
  try {
    const route = resolveRoute(new URL(request.url));
    if (!route) return new Response('Page introuvable', { status:404 });
    const allowed = route.name === 'engagement' ? ['POST','OPTIONS'] : ['GET','HEAD','OPTIONS'];
    if (!allowed.includes(request.method)) return new Response('Méthode non autorisée', { status:405, headers:{ Allow:allowed.join(', ') } });
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:{ Allow:allowed.join(', ') } });
    if (!['img','flights'].includes(route.name) && !process.env.NEON_URL) {
      return Response.json({ error:'Catalogue temporairement indisponible', code:'DATABASE_NOT_CONFIGURED' }, { status:503, headers:{ 'Cache-Control':'no-store' } });
    }
    const { default:handler } = await handlers[route.name]();
    return await invokeHandler(handler, request, route.query);
  } catch {
    return Response.json({ error:'Ressource momentanément indisponible' }, { status:500, headers:{ 'Cache-Control':'no-store' } });
  }
}
export const config = {
  path:['/api/*','/produit/*','/categorie/*','/marchand/*','/marque/*','/marchands','/marques','/tendances','/baisses-de-prix','/sitemap.xml','/sitemap-:part.xml'],
};
