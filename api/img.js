export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).end();

  let imageUrl;
  try {
    imageUrl = decodeURIComponent(url);
    // Extrait l'URL réelle depuis les redirects Effinity
    const match = imageUrl.match(/[?&]url=([^&]+)/);
    if (match) imageUrl = decodeURIComponent(match[1]);
  } catch(e) { return res.status(400).end(); }

  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        // Simule un vrai navigateur
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://hifind.fr/',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
        'Cache-Control': 'no-cache',
      }
    });

    if (!imgRes.ok) {
      return res.status(imgRes.status).end();
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(Buffer.from(buffer));

  } catch(e) {
    return res.status(500).end();
  }
}
