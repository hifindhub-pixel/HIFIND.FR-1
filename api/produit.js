import { readFileSync } from 'node:fs';
import { getPool, groupWithOffers, getEanOffers, formatRow } from './products.js';
import { countDistinctMerchants } from '../scripts/lib/merchants.js';

export const SITE_URL = 'https://hifind.fr';
const APP_SHELL = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

export function extractEanFromSlug(slug) {
  const value = Array.isArray(slug) ? slug.join('/') : String(slug || '');
  const match = value.match(/(?:^|-)(\d{8,14})(?:\/)?$/);
  return match ? match[1] : null;
}

export function slugifyProduct(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function productPath(product) {
  return `/produit/${slugifyProduct(product.title) || 'produit'}-${product.ean}`;
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[character]));
const jsonLd = value => JSON.stringify(value).replace(/</g, '\\u003c');
const euros = value => Number(value).toLocaleString('fr-FR', { minimumFractionDigits:2, maximumFractionDigits:2 });
const truncate = (value, limit) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const atWord = text.slice(0, limit + 1).replace(/\s+\S*$/, '').trim();
  return `${atWord || text.slice(0, limit).trim()}…`;
};

export function renderProductShell(product, shell = APP_SHELL) {
  const offers = (product.ean_offers || []).filter(offer => Number(offer.price) > 0);
  const prices = offers.map(offer => Number(offer.price)).sort((a,b) => a-b);
  const low = prices[0] || Number(product.price) || 0;
  const high = prices.at(-1) || low;
  // ean_offers is the live, deduplicated list rendered by the interactive
  // page. Prefer it over a potentially stale aggregate stored on the product.
  const count = offers.length || Number(product.offers_count) || 1;
  const canonical = SITE_URL + productPath(product);
  const fullTitle = String(product.title || 'Produit').replace(/\s+/g, ' ').trim();
  const title = `${truncate(fullTitle, 48)} : comparez ${count} prix | HiFind`;
  const description = truncate(`Comparez ${count} offres pour ${fullTitle}. Meilleur prix relevé : ${euros(low)} €. Historique et vendeurs disponibles sur HiFind.`, 158);
  const image = product.image_url ? `${SITE_URL}/api/img?url=${encodeURIComponent(product.image_url)}` : '';
  const structured = {
    '@context':'https://schema.org', '@type':'Product', name:product.title,
    description:truncate(product.description || description, 500), url:canonical,
    ...(image ? { image:[image] } : {}),
    ...(product.brand ? { brand:{ '@type':'Brand', name:product.brand } } : {}),
    ...(String(product.ean || '').length === 13 ? { gtin13:String(product.ean) } : { sku:String(product.ean) }),
    offers:{ '@type':'AggregateOffer', priceCurrency:'EUR', lowPrice:low, highPrice:high, offerCount:count, url:canonical },
  };
  const breadcrumb = {
    '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[
      { '@type':'ListItem', position:1, name:'Accueil', item:SITE_URL + '/' },
      { '@type':'ListItem', position:2, name:product.title, item:canonical },
    ],
  };
  const social = `
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="product"><meta property="og:site_name" content="HiFind">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta property="product:price:amount" content="${low.toFixed(2)}"><meta property="product:price:currency" content="EUR">
<script type="application/ld+json">${jsonLd(structured)}</script><script type="application/ld+json">${jsonLd(breadcrumb)}</script>`;
  return shell
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${esc(description)}">`)
    .replace('</head>', social + '\n</head>');
}

function prioritizeProductReferences(rows) {
  const support = new Map();
  rows.forEach(row => {
    const type = formatRow(row).product_type;
    if (!support.has(type)) support.set(type, new Set());
    support.get(type).add(row.program_id);
  });
  return rows.slice().sort((a,b) => {
    const aType = formatRow(a).product_type, bType = formatRow(b).product_type;
    return (support.get(bType)?.size || 0) - (support.get(aType)?.size || 0)
      || Number(a.price || Infinity) - Number(b.price || Infinity);
  });
}

export default async function handler(req, res) {
  const ean = extractEanFromSlug(req.query.slug);
  if (!ean) return res.status(404).send('Produit introuvable');
  const client = await getPool().connect();
  try {
    const result = await client.query(`
      SELECT p.*, pr.title AS program_title
      FROM products p LEFT JOIN programs pr ON pr.id=p.program_id
      WHERE p.ean=$1 AND p.status='enabled' AND p.price>0
        AND p.program_id NOT LIKE '%darty%'
      ORDER BY p.price ASC
    `, [ean]);
    if (!result.rows.length) return res.status(404).send('Produit introuvable');
    const products = await groupWithOffers(client, prioritizeProductReferences(result.rows));
    const product = products[0];
    if (!product) return res.status(404).send('Produit non comparable');
    // Keep server-rendered SEO data on exactly the same offer path as
    // action=product, which hydrates the interactive page in the browser.
    // groupWithOffers still selects a safe reference title/type first.
    const offers = await getEanOffers(client, ean, product.category);
    const merchantCount = await countDistinctMerchants(client, offers);
    if (merchantCount < 2) return res.status(404).send('Produit non comparable');
    product.ean_offers = offers;
    product.offers_count = merchantCount;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return res.status(200).send(renderProductShell(product));
  } catch (error) {
    console.error('Product SEO page error:', error.message);
    return res.status(500).send('Page momentanément indisponible');
  } finally {
    client.release();
  }
}
