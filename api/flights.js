// ESM — compatible "type": "module" dans package.json
const TP_TOKEN = '22ac0b6e6ed865e0c673152376023db4';

const ROUTES = [
  { origin: 'CDG', destination: 'TUN' },
  { origin: 'CDG', destination: 'RAK' },
  { origin: 'CDG', destination: 'BCN' },
  { origin: 'CDG', destination: 'FCO' },
  { origin: 'CDG', destination: 'DXB' },
  { origin: 'MRS', destination: 'ALG' },
  { origin: 'CDG', destination: 'ALG' },
  { origin: 'CDG', destination: 'CMN' },
  { origin: 'CDG', destination: 'LHR' },
  { origin: 'CDG', destination: 'MAD' },
  { origin: 'CDG', destination: 'JFK' },
  { origin: 'CDG', destination: 'DJE' },
  { origin: 'MRS', destination: 'TUN' },
  { origin: 'MRS', destination: 'DKR' },
  { origin: 'MRS', destination: 'IST' },
  { origin: 'MRS', destination: 'YUL' },
  { origin: 'MRS', destination: 'ABJ' },
  { origin: 'CDG', destination: 'IST' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const now = new Date();
  now.setMonth(now.getMonth() + 1);
  const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  const results = [];

  for (const route of ROUTES) {
    try {
      const url = 'https://api.travelpayouts.com/v1/prices/cheap?origin=' + route.origin +
        '&destination=' + route.destination +
        '&depart_date=' + month +
        '&currency=eur&token=' + TP_TOKEN;

      const r = await fetch(url, { headers: { 'x-access-token': TP_TOKEN } });
      if (!r.ok) continue;
      const data = await r.json();

      if (data.success && data.data && data.data[route.destination]) {
        const offers = Object.values(data.data[route.destination]);
        if (offers.length > 0) {
          const minPrice = Math.min(...offers.map(o => o.price));
          results.push({ origin: route.origin, destination: route.destination, price: minPrice });
        }
      }
    } catch(e) {}
  }

  return res.status(200).json({ data: results });
}
