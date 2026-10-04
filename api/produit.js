import { readFileSync } from 'node:fs';
import { getPool, getComparableProductDetail } from './products.js';

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
const CATEGORY_LABELS = {
  'high-tech':'High-Tech', 'auto-moto':'Auto & Moto', 'maison-jardin':'Maison & Jardin',
  'mode-vetements':'Mode & Vêtements', 'beaute-bienetre':'Beauté & Bien-être',
  'sante-nutrition':'Santé & Nutrition', 'enfants-bebes':'Enfants & Bébés',
  'sport-outdoor':'Sport & Outdoor', 'animaux':'Animalerie',
  'alimentation-bio':'Alimentation', 'livres-bd':'Livres & BD', 'autres':'Autres produits',
};
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
  const count = Number(product.offers_count) || offers.length || 1;
  const canonical = SITE_URL + productPath(product);
  const fullTitle = String(product.title || 'Produit').replace(/\s+/g, ' ').trim();
  const title = `${truncate(fullTitle, 48)} : comparez ${count} prix | HiFind`;
  const description = truncate(`Comparez ${count} offres pour ${fullTitle}. Meilleur prix relevé : ${euros(low)} €. Historique et vendeurs disponibles sur HiFind.`, 158);
  const image = product.image_url ? `${SITE_URL}/api/img?url=${encodeURIComponent(product.image_url)}` : '';
  const gtin = String(product.ean || '');
  const gtinProperty = ['8','12','13','14'].includes(String(gtin.length)) ? `gtin${gtin.length}` : 'sku';
  const individualOffers = offers.map(offer => {
    const price = Number(offer.price);
    const merchant = offer.program_title || offer.programs?.title || '';
    const shipping = offer.shipping_cost == null || offer.shipping_cost === '' ? null : Number(offer.shipping_cost);
    return {
      '@type':'Offer', price:price.toFixed(2), priceCurrency:'EUR',
      url:offer.tracking_url || offer.url || canonical,
      ...(merchant ? { seller:{ '@type':'Organization', name:merchant } } : {}),
      ...(offer.in_stock === true ? { availability:'https://schema.org/InStock' }
        : offer.in_stock === false ? { availability:'https://schema.org/OutOfStock' } : {}),
      ...(Number.isFinite(shipping) && shipping >= 0 ? { shippingDetails:{
        '@type':'OfferShippingDetails',
        shippingRate:{ '@type':'MonetaryAmount', value:shipping.toFixed(2), currency:'EUR' },
        shippingDestination:{ '@type':'DefinedRegion', addressCountry:'FR' },
      } } : {}),
    };
  });
  const category = CATEGORY_LABELS[product.category] || product.category_family || '';
  const structured = {
    '@context':'https://schema.org', '@type':'Product', name:product.title,
    description:truncate(product.description || description, 500), url:canonical,
    ...(image ? { image:[image] } : {}),
    ...(product.brand ? { brand:{ '@type':'Brand', name:product.brand } } : {}),
    ...(category ? { category } : {}),
    [gtinProperty]:gtin,
    offers:{ '@type':'AggregateOffer', priceCurrency:'EUR', lowPrice:low, highPrice:high,
      offerCount:count, url:canonical, ...(individualOffers.length ? { offers:individualOffers } : {}) },
  };
  const categoryCrumb = category && product.category && product.category !== 'autres'
    ? { '@type':'ListItem', position:2, name:category, item:`${SITE_URL}/categorie/${product.category}` }
    : null;
  const breadcrumb = {
    '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[
      { '@type':'ListItem', position:1, name:'Accueil', item:SITE_URL + '/' },
      ...(categoryCrumb ? [categoryCrumb] : []),
      { '@type':'ListItem', position:categoryCrumb ? 3 : 2, name:product.title, item:canonical },
    ]
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

export default async function handler(req, res) {
  const ean = extractEanFromSlug(req.query.slug);
  if (!ean) return res.status(404).send('Produit introuvable');
  const client = await getPool().connect();
  try {
    const product = await getComparableProductDetail(client, { ean, includeHistory:false });
    if (!product) return res.status(404).send('Produit non comparable');
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
