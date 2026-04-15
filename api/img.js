const ALLOWED_TYPES = ['image/jpeg','image/png','image/webp','image/gif','image/avif','image/svg+xml'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB max

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).end();

  let imageUrl;
  try {
    imageUrl = decodeURIComponent(url);
    // Extrait l'URL réelle depuis les redirects Effinity/Rakuten
    const match = imageUrl.match(/[?&]url=([^&]+)/);
    if (match) imageUrl = decodeURIComponent(match[1]);
  } catch(e) { return res.status(400).end(); }

  // Timeout 6s
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const imgRes = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Referer': 'https://hifind.fr/',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
      }
    });
    clearTimeout(timeout);

    if (!imgRes.ok) return res.status(imgRes.status).end();

    // Vérifie la taille via Content-Length si disponible
    const contentLength = imgRes.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_SIZE_BYTES) {
      return res.status(413).end();
    }

    // Vérifie le Content-Type
    const contentType = imgRes.headers.get('content-type') || '';
    const baseType = contentType.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.some(t => baseType === t || baseType.startsWith('image/'))) {
      return res.status(415).end();
    }

    const buffer = await imgRes.arrayBuffer();
    if (buffer.byteLength > MAX_SIZE_BYTES) return res.status(413).end();

    res.setHeader('Content-Type', baseType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Vary', 'Accept');
    return res.status(200).send(Buffer.from(buffer));

  } catch(e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') return res.status(504).end();
    return res.status(502).end();
  }
}
