// HIFIND — Sync Affilae + Effinity
const AFFILAE_TOKEN       = process.env.AFFILAE_TOKEN;
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_KEY;
const EFFINITY_FEEDS_JSON = process.env.EFFINITY_FEEDS;
const AFFILAE_BASE        = 'https://rest.affilae.com';
const PAGE_SIZE           = 20;

const CATEGORY_RULES = [
  { cat: 'beaute-bienetre', keywords: ['beauté','soin','crème','sérum','shampoing','cosmétique','parfum','visage','corps','cheveux','peau','maquillage','hydrat','collagène','démêlant','nettoyant','pieds','pied'] },
  { cat: 'sante-nutrition', keywords: ['santé','complément','vitamine','minéral','probiotique','magnésium','protéine','immunit','énergie','fatigue','sommeil','stress','minceur','détox','nutrition','aromathérapie','huile essentielle','gélule','capsule','spray','roll-on'] },
  { cat: 'mode-vetements',  keywords: ['mode','vêtement','robe','pantalon','jean','chemise','veste','manteau','pull','t-shirt','chaussure','basket','sneaker','sac','bijou','montre','lingerie','fashion'] },
  { cat: 'maison-jardin',   keywords: ['maison','jardin','déco','meuble','cuisine','ménager','aspirateur','plante','graine','potager','terrasse','outil','jardinage','arrosage','fleur'] },
  { cat: 'alimentation-bio',keywords: ['alimentation','bio','nourriture','snack','boisson','thé','café','superaliment','céréale','vegan','sans gluten','organic','épicerie','miel'] },
  { cat: 'cbd-chanvre',     keywords: ['cbd','chanvre','cannabis','hemp','cannabidiol','fleur cbd','huile cbd'] },
  { cat: 'enfants-bebes',   keywords: ['enfant','bébé','baby','jouet','jeu','puériculture','poussette','couche','biberon','apprentissage','éveil'] },
  { cat: 'sport-outdoor',   keywords: ['sport','fitness','musculation','yoga','running','vélo','natation','randonnée','camping','outdoor','gym','trail','ski','tennis','football'] },
  { cat: 'high-tech',       keywords: ['tech','électronique','smartphone','téléphone','ordinateur','laptop','tablette','casque','écouteur','drone','smart','bluetooth','gaming','console'] },
  { cat: 'animaux',         keywords: ['animal','animaux','chien','chat','oiseau','poisson','lapin','croquette','litière','collier','aquarium'] },
  { cat: 'auto-moto',       keywords: ['auto','moto','voiture','véhicule','scooter','pièce auto','pneu','huile moteur','gps','tuning'] },
];

function detectCategory(product) {
  const text = [product.title||'', product.description||'', (product.program&&product.program.title)||''].join(' ').toLowerCase();
  let bestCat = null, bestScore = 0;
  for (const rule of CATEGORY_RULES) {
    const score = rule.keywords.filter(kw => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestCat = rule.cat; }
  }
  return bestCat || 'autres';
}

async function supabaseUpsert(table, rows) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error('Supabase ' + table + ': ' + await res.text());
}

async function syncAffilae() {
  console.log('🔄 Affilae sync...');
  let offset = 0, all = [];
  while (true) {
    const res = await fetch(AFFILAE_BASE + '/publisher/products.list?limit=' + PAGE_SIZE + '&offset=' + offset, {
      headers: { 'Authorization': 'Bearer ' + AFFILAE_TOKEN }
    });
    const data = await res.json();
    const items = data.data || [];
    if (!items.length) break;
    all = all.concat(items);
    console.log('Fetched', all.length, '/', data.count);
    if (all.length >= data.count) break;
    offset += PAGE_SIZE;
  }

  const programsMap = {};
  all.forEach(p => {
    if (p.program && p.program.id) {
      programsMap[p.program.id] = { id: p.program.id, title: p.program.title, categories: p.program.categories||[], countries: p.program.countries||[], updated_at: new Date().toISOString() };
    }
  });
  await supabaseUpsert('programs', Object.values(programsMap));

  const mapped = all.map(p => ({
    id: p.id, affilae_id: p.id, program_id: p.program ? p.program.id : null,
    title: p.title||'', description: p.description||null,
    price: p.price ? p.price/100 : null, currency: 'EUR',
    url: p.url||null, tracking_id: p.trackingId||null,
    image_url: p.images&&p.images[0] ? p.images[0].url : null,
    category: detectCategory(p), lang: p.lang||'fr',
    status: 'enabled', updated_at: new Date().toISOString()
  }));

  const cats = {};
  mapped.forEach(p => { cats[p.category] = (cats[p.category]||0)+1; });
  console.log('📊', JSON.stringify(cats));

  for (let i = 0; i < mapped.length; i += 50) {
    await supabaseUpsert('products', mapped.slice(i, i+50));
    console.log('✅ Products', i+Math.min(50,mapped.length-i), '/', mapped.length);
  }
  console.log('🎉 Affilae done:', mapped.length);
}

async function syncEffinity() {
  console.log('🔄 Effinity sync...');
  if (!EFFINITY_FEEDS_JSON) { console.log('⚠️ EFFINITY_FEEDS missing'); return; }
  let feeds;
  try { feeds = JSON.parse(EFFINITY_FEEDS_JSON); } catch(e) { console.log('❌ JSON invalide'); return; }

  for (const feed of feeds) {
    try {
      const feedLimit = feed.limit || 200;
      console.log('  →', feed.name, '(limit:', feedLimit, ')');

      const res = await fetch(feed.url);
      if (!res.ok) { console.log('  ❌', feed.name, res.status); continue; }

      const buffer = await res.arrayBuffer();
      // Détecte l'encodage depuis le XML header ou force UTF-8 d'abord
      let text;
      const rawBytes = new Uint8Array(buffer);
      const rawStr = String.fromCharCode(...rawBytes.slice(0, 200));
      const isIso = rawStr.includes('iso-8859') || rawStr.includes('ISO-8859') || rawStr.includes('windows-1252');
      if (isIso) {
        text = new TextDecoder('iso-8859-1').decode(buffer);
      } else {
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch(e) {
          text = new TextDecoder('iso-8859-1').decode(buffer);
        }
      }

      // Nettoie les titres mal encodés (Ã© → é)
      function fixEncoding(str) {
        if (!str) return str;
        try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
      }

      const products = [];
      const seen = new Set();

      if (text.trim().startsWith('<')) {
        const regex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
          const item = match[0];
          const get = tag => { const m = item.match(new RegExp('<'+tag+'[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</'+tag+'>','i')); return m?(m[1]||'').trim():''; };
          const p = {
            title: fixEncoding(get('title')||get('name')),
            description: fixEncoding(get('description')||get('custom_label_0')||''),
            price: parseFloat(get('price')||'0'),
            url: get('link')||get('url'),
            image_url: get('image_link')||get('image'),
            feed_cat: get('category_level2')||get('category_level1')||get('category')||'',
            product_id: get('id')||get('item_id')||'',
          };
          if (!p.title || !p.url) continue;
          const key = p.product_id || (p.title.toLowerCase().trim()+'_'+p.price);
          if (seen.has(key)) continue;
          seen.add(key);
          products.push(p);
          if (products.length >= feedLimit) break;
        }
      } else {
        const lines = text.split('\n').filter(l=>l.trim());
        const sep = lines[0].includes(';')?';':',';
        const headers = lines[0].split(sep).map(h=>h.trim().replace(/"/g,'').toLowerCase());
        for (const line of lines.slice(1)) {
          const vals = line.split(sep).map(v=>v.trim().replace(/^"|"$/g,''));
          const obj = {}; headers.forEach((h,i)=>obj[h]=vals[i]||'');
          const p = { title:obj.title||obj.name, description:obj.description||'', price:parseFloat(obj.price||'0'), url:obj.link||obj.url, image_url:obj.image_link||obj.image, feed_cat:obj.category_level2||obj.category_level1||obj.category||'', product_id:obj.id||obj.item_id||'' };
          if (!p.title || !p.url) continue;
          const key = p.product_id || (p.title.toLowerCase().trim()+'_'+p.price);
          if (seen.has(key)) continue;
          seen.add(key);
          products.push(p);
          if (products.length >= feedLimit) break;
        }
      }

      console.log('  📦', feed.name, ':', products.length, 'produits');

      const programId = 'effinity_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g,'_');
      await supabaseUpsert('programs', [{ id:programId, title:feed.name, categories:[], countries:['FR'], updated_at:new Date().toISOString() }]);

      const mapped = products.filter(p=>p.title&&p.url).map((p,i) => ({
        id: programId+'_'+i, affilae_id: programId+'_'+i, program_id: programId,
        title: p.title, description: p.description||null, price: p.price||null,
        currency: 'EUR', url: feed.tracking||p.url, tracking_id: null,
        image_url: p.image_url||null,
        category: feed.category || detectCategory({ title:p.title, description:p.description||'', program:{title:feed.name} }),
        lang: 'fr', status: 'enabled', updated_at: new Date().toISOString()
      }));

      for (let i = 0; i < mapped.length; i += 50) await supabaseUpsert('products', mapped.slice(i,i+50));
      console.log('  ✅', feed.name, ':', mapped.length, 'insérés');

    } catch(e) { console.log('  ⚠️', feed.name, ':', e.message); }
  }
  console.log('🎉 Effinity done');
}

async function main() {
  try {
    await syncAffilae();
    await syncEffinity();
    console.log('🎉 All done!');
  } catch(e) {
    console.error('❌ Failed:', e.message);
    process.exit(1);
  }
}

main();
