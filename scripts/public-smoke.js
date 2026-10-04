import { writeFile } from 'node:fs/promises';
import { merchantName, productPath, slugify, validateProductDetail, validateTrending } from './lib/public-smoke.js';

const SITE_URL = String(process.env.SITE_URL || 'https://hifind.fr').replace(/\/$/, '');
const timeout = Number(process.env.SMOKE_TIMEOUT_MS) || 20000;
const checks = [];

async function request(path, { json = false, contains = '' } = {}) {
  const started = Date.now();
  const response = await fetch(SITE_URL + path, {
    headers:{ 'user-agent':'HiFind production smoke test/1.0', accept:json ? 'application/json' : 'text/html,*/*' },
    signal:AbortSignal.timeout(timeout),
  });
  const body = json ? await response.json() : await response.text();
  if (!response.ok) throw new Error(`${path} répond HTTP ${response.status}`);
  if (contains && !String(body).includes(contains)) throw new Error(`${path} ne contient plus « ${contains} »`);
  checks.push({ path, status:response.status, duration_ms:Date.now()-started });
  return body;
}

try {
  await request('/', { contains:'HiFind' });
  const trending = await request('/api/products?action=trending&limit=12', { json:true });
  const seed = validateTrending(trending);
  const detailPayload = await request(`/api/products?action=product&ean=${encodeURIComponent(seed.ean)}`, { json:true });
  const { product, offers } = validateProductDetail(detailPayload, seed.ean);

  await request(productPath(product), { contains:'application/ld+json' });
  const category = product.category && product.category !== 'autres' ? product.category : 'high-tech';
  await request(`/categorie/${encodeURIComponent(category)}`, { contains:'produits comparables' });

  const merchant = merchantName(offers[0]);
  if (merchant) await request(`/marchand/${encodeURIComponent(slugify(merchant))}`, { contains:'Marchand référencé' });

  const query = String(product.brand || product.title || '').trim().split(/\s+/).slice(0,3).join(' ');
  const suggestions = await request(`/api/products?action=suggest&q=${encodeURIComponent(query)}&limit=8`, { json:true });
  validateTrending(suggestions);
  await request('/sitemap.xml', { contains:'sitemap' });

  const summary = `## Parcours public HiFind — ✅ opérationnel\n\n${checks.map(c => `- \`${c.path}\` — ${c.status} en ${c.duration_ms} ms`).join('\n')}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag:'a' });
} catch (error) {
  const summary = `## Parcours public HiFind — 🚨 échec\n\n${error.message}\n\n${checks.map(c => `- ✅ \`${c.path}\` — ${c.duration_ms} ms`).join('\n')}\n`;
  console.error(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag:'a' });
  process.exitCode = 1;
}
