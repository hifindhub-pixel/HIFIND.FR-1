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
      console.log('  →', feed.name);
      const feedLimit = feed.limit || 500;
      const res = await fetch(feed.url);
      if (!res.ok) { console.log('  ❌', feed.name, res.status); continue; }

      // Décode en ISO-8859-1
      const buffer = await res.arrayBuffer();
      const text = new TextDecoder('iso-8859-1').decode(buffer);

      let products = [];
      if (text.trim().startsWith('<')) {
        // Parse XML item par item et s'arrête dès qu'on a assez
        const regex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
        const seen = new Set();
        let match;
        while ((match = regex.exec(text)) !== null) {
          const item = match[0];
          const get = tag => { const m = item.match(new RegExp('<'+tag+'[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</'+tag+'>','i')); return m?(m[1]||'').trim():''; };
          const p = {
            title: get('title')||get('name'),
            description: get('description')||get('custom_label_0')||'',
            price: parseFloat(get('price')||'0'),
            url: get('link')||get('url'),
            image_url: get('image_link')||get('image'),
            brand: get('brand')||'',
            feed_cat: get('category_level2')||get('category_level1')||get('category')||'',
            product_id: get('id')||get('item_id')||'',
          };
          if (!p.title || !p.url) continue;
          const key = p.product_id || (p.title.toLowerCase().trim()+'_'+p.price);
          if (seen.has(key)) continue;
          seen.add(key);
          products.push(p);
          if (products.length >= feedLimit * 5) break;
        }
      } else {
        const lines = text.split('\n').filter(l=>l.trim());
        const sep = lines[0].includes(';')?';':',';
        const headers = lines[0].split(sep).map(h=>h.trim().replace(/"/g,'').toLowerCase());
        const seen = new Set();
        for (const line of lines.slice(1)) {
          const vals = line.split(sep).map(v=>v.trim().replace(/^"|"$/g,''));
          const obj = {}; headers.forEach((h,i)=>obj[h]=vals[i]||'');
          const p = { title:obj.title||obj.name, description:obj.description||'', price:parseFloat(obj.price||'0'), url:obj.link||obj.url, image_url:obj.image_link||obj.image, brand:obj.brand||'', feed_cat:obj.category_level2||obj.category_level1||obj.category||'', product_id:obj.id||obj.item_id||'' };
          if (!p.title || !p.url) continue;
          const key = p.product_id || (p.title.toLowerCase().trim()+'_'+p.price);
          if (seen.has(key)) continue;
          seen.add(key);
          products.push(p);
          if (products.length >= feedLimit * 5) break;
        }
      }

      // Mix de catégories : prend N produits par catégorie du flux
      function mixByCategory(products, limit) {
        const bycat = {};
        for (const p of products) {
          const cat = (p.feed_cat||'autres').toLowerCase().trim()||'autres';
          if (!bycat[cat]) bycat[cat] = [];
          bycat[cat].push(p);
        }
        const cats = Object.keys(bycat);
        const result = [];
        let i = 0;
        while (result.length < limit) {
          let added = false;
          for (const cat of cats) {
            if (result.length >= limit) break;
            if (bycat[cat][i]) { result.push(bycat[cat][i]); added = true; }
          }
          i++;
          if (!added) break;
        }
        return result.slice(0, limit); // Garantit la limite
      }

      const limited = mixByCategory(products, feedLimit);
      console.log('  📦', feed.name, ':', products.length, 'parsés →', limited.length, 'insérés (mix catégories)');

      // Mapping catégories du flux → catégories HiFind
      const feedCatMap = {
        'chaussures femme':   'mode-vetements',
        'chaussures homme':   'mode-vetements',
        'chaussures enfant':  'mode-vetements',
        'chaussures':         'mode-vetements',
        'sneakers':           'mode-vetements',
        'boots':              'mode-vetements',
        'sandales':           'mode-vetements',
        'soin':               'beaute-bienetre',
        'soins':              'beaute-bienetre',
        'semelles':           'sante-nutrition',
        'accessoires':        'mode-vetements',
        'sport':              'sport-outdoor',
      };

      const programId = 'effinity_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g,'_');
      await supabaseUpsert('programs', [{ id:programId, title:feed.name, categories:[], countries:['FR'], updated_at:new Date().toISOString() }]);

      const mapped = limited.filter(p=>p.title&&p.url).map((p, i) => {
        const feedCatLower = (p.feed_cat||'').toLowerCase().trim();
        const hifindCat = feed.category ||
          feedCatMap[feedCatLower] ||
          Object.entries(feedCatMap).find(([k]) => feedCatLower.includes(k))?.[1] ||
          detectCategory({ title:p.title, description:p.description, program:{title:feed.name} });

        return {
          id: programId + '_' + i,
          affilae_id: programId + '_' + i,
          program_id: programId,
          title: p.title,
          description: p.description || null,
          price: p.price || null,
          currency: 'EUR',
          url: feed.tracking || p.url,
          tracking_id: null,
          image_url: p.image_url || null,
          category: hifindCat,
          lang: 'fr',
          status: 'enabled',
          updated_at: new Date().toISOString()
        };
      });

      for (let i = 0; i < mapped.length; i += 50) {
        await supabaseUpsert('products', mapped.slice(i, i+50));
      }
      console.log('  ✅', feed.name, ':', mapped.length, 'produits uniques');

      // Stats catégories
      const cats = {};
      mapped.forEach(p => { cats[p.category] = (cats[p.category]||0)+1; });
      console.log('  📊', JSON.stringify(cats));

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
