/**
 * Legacy product URL bridge.
 *
 * Product pages now live in the interactive HiFind application. Keeping this
 * endpoint as a permanent redirect preserves every existing /produit/... link
 * without maintaining a second, visually inconsistent product page.
 */
export function extractEanFromSlug(slug) {
  const value = Array.isArray(slug) ? slug.join('/') : String(slug || '');
  const match = value.match(/(?:^|-)(\d{8,14})(?:\/)?$/);
  return match ? match[1] : null;
}

export default function handler(req, res) {
  const ean = extractEanFromSlug(req.query.slug);
  if (!ean) return res.redirect(308, '/');

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.redirect(308, `/?openEan=${encodeURIComponent(ean)}`);
}
