import dns from 'node:dns';

const dnsLookup = dns.promises.lookup;

/**
 * Vrai contre toute IP privee, loopback, lien-local ou reservee — IPv4
 * et IPv6. C'est le coeur de la protection SSRF : meme si le nom de
 * domaine semble legitime, on verifie l'adresse REELLE vers laquelle il
 * pointe avant de laisser le serveur y faire une requete.
 */
function isPrivateAddress(address, family) {
  if (family === 4) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;                              // 10.0.0.0/8
    if (a === 127) return true;                              // 127.0.0.0/8 (loopback)
    if (a === 169 && b === 254) return true;                 // 169.254.0.0/16 (link-local / metadata cloud)
    if (a === 172 && b >= 16 && b <= 31) return true;         // 172.16.0.0/12
    if (a === 192 && b === 168) return true;                 // 192.168.0.0/16
    if (a === 0) return true;                                 // 0.0.0.0/8
    if (a >= 224) return true;                                // multicast / reserve
    return false;
  }
  // IPv6
  const a = address.toLowerCase();
  if (a === '::1') return true;                               // loopback
  if (a.startsWith('fe80:') || a.startsWith('fe80::')) return true; // link-local
  if (a.startsWith('fc') || a.startsWith('fd')) return true;  // fc00::/7 (ULA, prive)
  if (a.startsWith('::ffff:')) {                               // IPv4-mapped : reverifie en IPv4
    return isPrivateAddress(a.replace('::ffff:', ''), 4);
  }
  return false;
}

async function resolveIsPrivate(hostname) {
  if (hostname === 'localhost') return true;
  try {
    const { address, family } = await dnsLookup(hostname);
    return isPrivateAddress(address, family);
  } catch (e) {
    return true;   // resolution echouee -> on refuse par prudence
  }
}

async function safeUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (await resolveIsPrivate(u.hostname)) return null;
  return u;
}

const MAX_BYTES = 8 * 1024 * 1024;   // 8 Mo, largement suffisant pour une image produit
const MAX_REDIRECTS = 2;

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).end();

  let imageUrl;
  try {
    imageUrl = decodeURIComponent(url);
    // Extrait l'URL reelle depuis les redirects Effinity
    const match = imageUrl.match(/[?&]url=([^&]+)/);
    if (match) imageUrl = decodeURIComponent(match[1]);
  } catch (e) { return res.status(400).end(); }

  let target = await safeUrl(imageUrl);
  if (!target) return res.status(400).json({ error: 'URL refusee' });

  try {
    let redirectsLeft = MAX_REDIRECTS;
    let imgRes;

    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      imgRes = await fetch(target.toString(), {
        redirect: 'manual',   // on revalide nous-memes chaque saut, jamais suivi a l'aveugle
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://hifind.fr/',
        },
      });
      clearTimeout(timeout);

      if (imgRes.status >= 300 && imgRes.status < 400 && imgRes.headers.get('location')) {
        if (redirectsLeft <= 0) return res.status(400).json({ error: 'Trop de redirections' });
        redirectsLeft--;
        const nextUrl = new URL(imgRes.headers.get('location'), target).toString();
        const nextTarget = await safeUrl(nextUrl);
        if (!nextTarget) return res.status(400).json({ error: 'Redirection refusee' });
        target = nextTarget;
        continue;
      }
      break;
    }

    if (!imgRes.ok) return res.status(imgRes.status).end();

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return res.status(415).end();

    const contentLength = parseInt(imgRes.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BYTES) return res.status(413).end();

    const buffer = await imgRes.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return res.status(413).end();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(Buffer.from(buffer));

  } catch (e) {
    return res.status(500).end();
  }
}
