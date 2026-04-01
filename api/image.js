// ══════════════════════════════════════════
// HIFIND — Image Proxy
// /api/image.js
// Sert les images Affilae depuis hifind.fr
// pour contourner les bloqueurs de pub
// ══════════════════════════════════════════

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Sécurité : on n'accepte que les images Affilae et Amazon
  const allowedDomains = [
    'static.affilae.com',
    'm.media-amazon.com',
    'cdn.idealo.com',
    'images-na.ssl-images-amazon.com'
  ];

  let imageUrl;
  try {
    imageUrl = decodeURIComponent(url);
    const host = new URL(imageUrl).hostname;
    if (!allowedDomains.some(d => host.endsWith(d))) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }
  } catch(e) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HiFind/1.0)',
        'Accept': 'image/*'
      }
    });

    if (!imgRes.ok) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).send(Buffer.from(buffer));

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
