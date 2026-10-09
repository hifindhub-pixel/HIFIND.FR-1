import { parseCSVLine } from './stream-feed.js';

export function awinDownloadKeys(configuredKey, feeds = []) {
  const keys = [configuredKey];
  for (const feed of feeds) {
    try {
      const url = new URL(feed.url);
      if (url.protocol !== 'https:') continue;
      if (['productdata.awin.com','datafeed.api.productserve.com'].includes(url.hostname)) {
        keys.push(url.pathname.match(/\/apikey\/([^/]+)/)?.[1]);
      } else if (url.hostname === 'ui.awin.com') {
        keys.push(url.pathname.match(/\/publisher\/\d+\/([^/]+)/)?.[1]);
      }
    } catch {}
  }
  return [...new Set(keys.filter(Boolean))];
}

export function parseAwinFeedList(text) {
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (/^[\[{]/.test(clean)) {
    const data = JSON.parse(clean);
    const rows = Array.isArray(data) ? data : data.feeds || data.data;
    if (!Array.isArray(rows)) throw new Error('Format de liste Awin inconnu');
    return rows;
  }
  const records = [];
  let record = '', quoted = false;
  for (let i=0;i<clean.length;i++) {
    const char = clean[i];
    if(char === '"') {
      if(quoted && clean[i+1] === '"') { record += '""'; i++; continue; }
      quoted = !quoted;
    }
    if(char === '\n' && !quoted) { records.push(record.replace(/\r$/, '')); record = ''; }
    else record += char;
  }
  if(quoted) throw new Error('CSV Awin incomplet');
  if(record) records.push(record);
  const headers = parseCSVLine(records.shift() || '', ',');
  if(!headers.includes('Feed ID')) throw new Error('En-tête de liste Awin invalide');
  return records.filter(Boolean).map(line => Object.fromEntries(parseCSVLine(line, ',').map((value,index)=>[headers[index],value])));
}

export async function loadAwinFeedList({ apiKey, feeds = [], fetchImpl = fetch }) {
  const statuses = [];
  for (const key of awinDownloadKeys(apiKey, feeds)) {
    try {
      const response = await fetchImpl('https://productdata.awin.com/datafeed/list/apikey/' + key,
        { signal:AbortSignal.timeout(30000) });
      if (!response.ok) { statuses.push('HTTP '+response.status); await response.body?.cancel(); continue; }
      return parseAwinFeedList(await response.text());
    } catch (error) { statuses.push(error.name === 'TimeoutError' ? 'timeout' : 'lecture impossible'); }
  }
  // Deliberately exclude URL, token and response body from errors.
  throw new Error('Liste Awin indisponible : '+(statuses.join(', ') || 'clé de téléchargement manquante'));
}

export function awinFeedEntry(row) {
  return {
    id: row['Feed ID'] || row.feedId || row['Feed Id'] || row.id,
    name: row['Advertiser Name'] || row.advertiserName || row.Advertiser,
    language: String(row.Language || row.language || '').toLowerCase(),
    membership: String(row['Membership Status'] || row.membershipStatus || '').toLowerCase(),
    count: Number.parseInt(row['No of products'] || row.productCount || row.Products || '0',10),
    url: row.URL || row['Example Download URL'] || row.exampleDownloadUrl || row['Example URL'] || row.url || row.downloadUrl,
  };
}
