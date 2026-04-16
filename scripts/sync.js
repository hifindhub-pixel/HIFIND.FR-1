// HIFIND - Sync Affilae + Effinity -> Neon
const AFFILAE_TOKEN       = process.env.AFFILAE_TOKEN;
const NEON_URL            = process.env.NEON_URL;
const EFFINITY_FEEDS_JSON = process.env.EFFINITY_FEEDS;
const AFFILAE_BASE        = 'https://rest.affilae.com';

import pkg from 'pg';
const { Client } = pkg;

let _neonClient = null;
async function getNeon() {
  if (!_neonClient) {
    _neonClient = new Client({ connectionString: NEON_URL });
    await _neonClient.connect();
  }
  return _neonClient;
}

const PAGE_SIZE           = 20;

const CATEGORY_RULES = [
  { cat: 'beaute-bienetre', keywords: [
    'beauté','soin','crème','sérum','shampoing','cosmétique','parfum','eau de toilette','cologne',
    'visage','corps','cheveux','peau','maquillage','hydrat','collagène','démêlant','nettoyant',
    'pieds','pied','masque visage','fond de teint','rouge à lèvres','mascara','eyeliner','blush',
    'anticernes','lotion','baume','huile corps','lisseur','sèche-cheveux','brosse chauffante',
    'dissolvant','ongles','exfoliant','gommage','contour yeux','beurre de karité','tonique',
    'micellar','bb cream','cc cream','make up','aftershave','rasage','épilation','manucure',
    'auto-bronzant','solaire','spf','coiffure','couleur cheveux','coloration'
  ]},
  { cat: 'sante-nutrition', keywords: [
    'santé','complément','vitamine','minéral','probiotique','magnésium','protéine','immunit',
    'énergie','fatigue','sommeil','stress','minceur','détox','nutrition','aromathérapie',
    'huile essentielle','gélule','capsule','spray','mélatonine','collagène marin',
    'omega','zinc','fer','calcium','vitamine c','vitamine d','cure','ampoule','phytothérapie',
    'homéopathie','antioxydant','curcuma','spiruline','chlorella','maca','ashwagandha',
    'ginseng','chardon','boswellia','glucosamine','chondroïtine','coenzyme q10',
    'parapharmacie','médecine douce','naturopathie','plantes médicinales','infusion santé'
  ]},
  { cat: 'mode-vetements', keywords: [
    'mode','vêtement','robe','pantalon','jean','chemise','veste','manteau','pull','t-shirt',
    'chaussure','basket','sneaker','sac','bijou','montre','lingerie','fashion','bague',
    'collier','bracelet','boucle','bottine','sandale','escarpins','robe longue','combinaison',
    'salopette','short','bermuda','jupe','legging','débardeur','body','ceinture','écharpe',
    'bonnet','gants','chapeau','casquette','bob','sac à main','porte-monnaie','maroquinerie',
    'valise','bagage','lunettes de soleil','vêtements homme','vêtements femme','prêt-à-porter',
    'taille 38','taille 40','slim fit','col rond'
  ]},
  { cat: 'maison-jardin', keywords: [
    'maison','jardin','déco','décoration','meuble','cuisine','ménager','aspirateur','plante','graine',
    'potager','terrasse','outil','jardinage','arrosage','fleur','tapis','coussin','rideau','lampe',
    'éclairage','canapé','table','chaise','armoire','buffet','étagère','bibliothèque','cadre photo',
    'bougie','diffuseur','vase','balai','robot nettoyeur','robot tondeuse','sécateur','taille-haie',
    'tondeuse','débroussailleuse','perceuse','visseuse','marteau','peinture mur','store','serrure',
    'literie','matelas','oreiller','couette','drap','housse de couette','parure de lit',
    'cafetière','grille-pain','four','micro-ondes','hotte','réfrigérateur','lave-vaisselle'
  ]},
  { cat: 'alimentation-bio', keywords: [
    'alimentation','bio','nourriture','snack','boisson','thé','café','superaliment','céréale',
    'vegan','sans gluten','organic','épicerie','miel','huile olive','vinaigre','sauce','pâtes',
    'riz','lentille','pois chiche','quinoa','chocolat','biscuit','confiture','sirop','kombucha',
    'kéfir','lait végétal','protéine végétale','tofu','granola','levure alimentaire','sucre de coco',
    'sirop agave','clean eating','whole food','raw food','açaï','matcha','baies de goji'
  ]},
  { cat: 'cbd-chanvre', keywords: [
    'cbd','chanvre','cannabis','hemp','cannabidiol','fleur cbd','huile cbd','résine cbd',
    'wax cbd','cristaux cbd','vape cbd','e-liquide cbd','terpènes cbd','cannabinoïde'
  ]},
  { cat: 'enfants-bebes', keywords: [
    'enfant','bébé','baby','jouet','jeu','puériculture','poussette','couche','biberon',
    'apprentissage','éveil','peluche','jeux de société','puzzle','lego','playmobil',
    'construction','circuit voiture jouet','poupée','marionnette','tricycle','draisienne',
    'trottinette enfant','siège auto bébé','lit parapluie','baignoire bébé','chauffe-biberon',
    'stérilisateur','moniteur bébé','baby phone','portique','tapis d\'éveil','hochet',
    'tablette enfant','vêtement enfant','pyjama bébé','body bébé','gigoteuse'
  ]},
  { cat: 'sport-outdoor', keywords: [
    'sport','fitness','musculation','yoga','running','vélo','natation','randonnée','camping',
    'outdoor','gym','trail','ski','tennis','football','badminton','golf','surf','escalade',
    'barre de traction','haltère','kettlebell','résistance','élastique','tapis roulant',
    'vélo elliptique','vélo appartement','rameur','palmes','corde à sauter','sac de sport',
    'gourde sport','thermos sport','chaussures de trail','chaussures running','legging sport',
    'brassière de sport','veste softshell','tente camping','sac de couchage','sac à dos rando',
    'matelas de sol','lampe frontale','snowboard','planche surf','raquette'
  ]},
  { cat: 'high-tech', keywords: [
    'tech','électronique','smartphone','téléphone mobile','ordinateur','laptop','tablette','casque',
    'écouteur','drone','bluetooth','gaming','console','câble usb','chargeur','batterie externe',
    'hub usb','souris','clavier','webcam','microphone','enceinte bluetooth','écran pc','moniteur',
    'projecteur','imprimante','scanner','disque dur','ssd','clé usb','routeur wifi','ampoule led',
    'prise connectée','thermostat connecté','robot aspirateur','trottinette électrique',
    'vélo électrique','montre connectée','bracelet connecté','appareil photo','réflex','objectif',
    'jeux vidéo','xbox','playstation','ps5','nintendo switch','steam deck','vr','manette jeu'
  ]},
  { cat: 'animaux', keywords: [
    'animal','animaux','chien','chat','oiseau','poisson','lapin','croquette','litière','collier',
    'aquarium','terrarium','niche','cage','griffoir','arbre à chat','distributeur croquettes',
    'fontaine chat','jouet chien','jouet chat','laisse','harnais','vêtement chien','antiparasitaire',
    'puce animaux','vermifuge','shampoing chien','shampoing chat','nourriture chien','nourriture chat',
    'nourriture lapin','granulés animaux','animalerie','reptile','furet','rongeur','cochon d\'inde'
  ]},
  { cat: 'auto-moto', keywords: [
    'auto','moto','voiture','véhicule','scooter','pièce auto','pneu','huile moteur','gps auto',
    'tuning','autoradio','dash cam','câble obd','alarme voiture','housse siège auto',
    'tapis de sol voiture','nettoyant auto','polish','cire carrosserie','batterie voiture',
    'chargeur batterie auto','gonfleur pneu','kit réparation crevaison','antivol moto','casque moto',
    'blouson moto','gants moto','pompe à vélo','pédales vtt','dérailleur vélo','chaîne vélo',
    'porte vélo','attelage','remorque'
  ]},
];

// Brand shortcuts — very high confidence
const BRAND_CAT = {
  'nike': 'sport-outdoor', 'adidas': 'sport-outdoor', 'under armour': 'sport-outdoor',
  'reebok': 'sport-outdoor', 'puma': 'sport-outdoor', 'columbia': 'sport-outdoor',
  'the north face': 'sport-outdoor', 'salomon': 'sport-outdoor', 'asics': 'sport-outdoor',
  'apple': 'high-tech', 'samsung': 'high-tech', 'sony': 'high-tech', 'lg electronics': 'high-tech',
  'bose': 'high-tech', 'jbl': 'high-tech', 'anker': 'high-tech', 'xiaomi': 'high-tech',
  'huawei': 'high-tech', 'philips': 'high-tech', 'logitech': 'high-tech', 'razer': 'high-tech',
  'corsair': 'high-tech', 'asus': 'high-tech', 'lenovo': 'high-tech', 'dell': 'high-tech',
  'microsoft': 'high-tech', 'nintendo': 'high-tech', 'playstation': 'high-tech',
  'loreal': 'beaute-bienetre', 'l\'oréal': 'beaute-bienetre', 'garnier': 'beaute-bienetre',
  'vichy': 'beaute-bienetre', 'la roche-posay': 'beaute-bienetre', 'nivea': 'beaute-bienetre',
  'neutrogena': 'beaute-bienetre', 'clarins': 'beaute-bienetre', 'yves rocher': 'beaute-bienetre',
  'nars': 'beaute-bienetre', 'maybelline': 'beaute-bienetre', 'rimmel': 'beaute-bienetre',
  'purina': 'animaux', 'royal canin': 'animaux', 'pedigree': 'animaux', 'whiskas': 'animaux',
  'hill\'s': 'animaux', 'eukanuba': 'animaux', 'felix': 'animaux',
  'lego': 'enfants-bebes', 'playmobil': 'enfants-bebes', 'hasbro': 'enfants-bebes',
  'mattel': 'enfants-bebes', 'fisher-price': 'enfants-bebes', 'chicco': 'enfants-bebes',
  'vertbaudet': 'enfants-bebes', 'oxybul': 'enfants-bebes',
};

// Program title shortcuts (Affilae/Effinity partner names)
const PROGRAM_CAT = {
  'vertbaudet':   'enfants-bebes',
  'blancheporte': 'mode-vetements',
  'norauto':      'auto-moto',
  'lunii':        'enfants-bebes',
  'valebio':      'sante-nutrition',
  'naturalia':    'alimentation-bio',
  'greenweez':    'alimentation-bio',
  'zooplus':      'animaux',
  'animalis':     'animaux',
  'veepee':       'mode-vetements',
  'showroomprivé':'mode-vetements',
};

// Feed category string → our category (used for Effinity/AWIN feed_cat field)
function mapFeedCategory(feedCat) {
  if (!feedCat) return null;
  const fc = feedCat.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip accents
  if (fc.match(/\bmode\b|vetement|chaussure|fashion|lingerie|sac a main|maroquinerie|pret.a.porter/)) return 'mode-vetements';
  if (fc.match(/\bbeaute\b|cosmetique|maquillage|soin visage|soin corps|parfum|capillaire|coiffure/)) return 'beaute-bienetre';
  if (fc.match(/\bsante\b|nutrition|complement|vitamine|pharmacie|parapharmacie/)) return 'sante-nutrition';
  if (fc.match(/\bmaison\b|jardin|deco|meubles|electromenager|eclairage|bricolage|literie|cuisine equipee/)) return 'maison-jardin';
  if (fc.match(/\benfant\b|bebe|jouet|jeux de societe|puericulture|creche/)) return 'enfants-bebes';
  if (fc.match(/\bsport\b|fitness|outdoor|randonnee|camping|musculation|velo sport|loisir sportif/)) return 'sport-outdoor';
  if (fc.match(/high.?tech|informatique|telephone|smartphone|\baudio\b|hifi|gaming|electronique|materiel informatique/)) return 'high-tech';
  if (fc.match(/\banimal\b|animalerie|\bchien\b|\bchat\b|rongeur/)) return 'animaux';
  if (fc.match(/\bauto\b|\bmoto\b|voiture|vehicule|pieces auto|accessoires auto/)) return 'auto-moto';
  if (fc.match(/alimentation|epicerie|boisson|\bthe\b|\bcafe\b|\bbio\b|produit bio/)) return 'alimentation-bio';
  if (fc.match(/cbd|chanvre|cannabis|hemp/)) return 'cbd-chanvre';
  return null;
}

function detectCategory(product) {
  const title = (product.title || '').toLowerCase();
  const desc  = (product.description || '').toLowerCase();
  const prog  = ((product.program && product.program.title) || '').toLowerCase();
  const brand = (product.brand || '').toLowerCase();

  // 1. Brand shortcut (very high confidence)
  for (const [b, cat] of Object.entries(BRAND_CAT)) {
    if (brand === b || brand.startsWith(b) || title.startsWith(b + ' ') || title.includes(' ' + b + ' ')) return cat;
  }

  // 2. Program name shortcut
  for (const [p, cat] of Object.entries(PROGRAM_CAT)) {
    if (prog.includes(p)) return cat;
  }

  // 3. Weighted keyword scoring: title 3×, program title 2×, description 1×
  let bestCat = null, bestScore = 0;
  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (title.includes(kw))  score += 3;
      else if (prog.includes(kw)) score += 2;
      else if (desc.includes(kw)) score += 1;
    }
    if (score > bestScore) { bestScore = score; bestCat = rule.cat; }
  }
  // Require score ≥ 3 (at least one title match OR multiple weaker signals)
  return (bestScore >= 3 && bestCat) ? bestCat : 'autres';
}

function fixEncoding(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str
    .replace(/Ã©/g, 'é').replace(/Ã¨/g, 'è').replace(/Ãª/g, 'ê').replace(/Ã«/g, 'ë')
    .replace(/Ã /g, 'à').replace(/Ã¢/g, 'â').replace(/Ã¤/g, 'ä').replace(/Ã¦/g, 'æ')
    .replace(/Ã®/g, 'î').replace(/Ã¯/g, 'ï').replace(/Ã´/g, 'ô').replace(/Ã¶/g, 'ö')
    .replace(/Ã¹/g, 'ù').replace(/Ã»/g, 'û').replace(/Ã¼/g, 'ü').replace(/Ã§/g, 'ç')
    .replace(/Ã‰/g, 'É').replace(/Ã€/g, 'À').replace(/Ã‡/g, 'Ç').replace(/Ã"/g, 'Ó')
    .replace(/Ã˜/g, 'Ø').replace(/Ã±/g, 'ñ').replace(/Ã³/g, 'ó').replace(/Ã¿/g, 'ÿ')
    .replace(/â€™/g, "'").replace(/â€œ/g, '"').replace(/â€/g, '"').replace(/â€¦/g, '…')
    .replace(/â€"/g, '–').replace(/â€"/g, '—').replace(/Â°/g, '°').replace(/Â«/g, '«')
    .replace(/Â»/g, '»').replace(/Â©/g, '©').replace(/Â®/g, '®').replace(/Âµ/g, 'µ')
    .replace(/Ã¥/g, 'å').replace(/Ã/g, 'Â');
}

function extractEAN(val) {
  if (!val) return null;
  // Prend le premier code numérique valide (8-14 chiffres)
  const parts = String(val).split(/[\s,;|]+/);
  for (const part of parts) {
    const clean = part.trim().replace(/\.0$/, '');
    if (/^\d{8,14}$/.test(clean)) return clean;
  }
  return null;
}

function cleanTitle(str) {
  if (!str || typeof str !== 'string') return '';
  return fixEncoding(str)
    .replace(/\s*-\s*null\s*-\s*/gi, ' - ')
    .replace(/^null\s*-\s*/gi, '')
    .replace(/\s*-\s*null$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function supabaseUpsert(table, rows) {
  if (!rows || rows.length === 0) return;
  const client = await getNeon();
  const BATCH = 50;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    if (table === 'programs') {
      const vals = batch.map((row, j) => {
        const b = j * 5;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5})`;
      }).join(',');
      const params = batch.flatMap(row => [
        row.id, row.title,
        JSON.stringify(row.categories||[]),
        JSON.stringify(row.countries||[]),
        row.updated_at||new Date().toISOString()
      ]);
      await client.query(`
        INSERT INTO programs (id,title,categories,countries,updated_at) VALUES ${vals}
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, updated_at=EXCLUDED.updated_at
      `, params);

    } else if (table === 'products') {
      const vals = batch.map((row, j) => {
        const b = j * 16;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16})`;
      }).join(',');
      const params = batch.flatMap(row => [
        row.id, row.affilae_id||row.id, row.program_id,
        row.title, row.description||null, row.price||null,
        row.currency||'EUR', row.url||null, row.tracking_id||null,
        row.image_url||null, row.category||'autres', row.lang||'fr',
        row.status||'enabled', row.ean||null, row.brand||null,
        row.updated_at||new Date().toISOString()
      ]);
      await client.query(`
        INSERT INTO products (id,affilae_id,program_id,title,description,price,currency,url,tracking_id,image_url,category,lang,status,ean,brand,updated_at)
        VALUES ${vals}
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,price=EXCLUDED.price,ean=EXCLUDED.ean,brand=EXCLUDED.brand,image_url=EXCLUDED.image_url,url=EXCLUDED.url,updated_at=EXCLUDED.updated_at
      `, params);
    }
  }
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
    if (all.length === 0) console.log('Affilae total count:', data.count);
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

  const mapped = all.map(p => {
    // Use program categories from Affilae API if available
    const progCats = (p.program && p.program.categories) || [];
    const feedCatStr = progCats.join(' ');
    const category = mapFeedCategory(feedCatStr)
      || detectCategory({ title: p.title||'', description: p.description||'', program: p.program, brand: p.brand||'' });
    return {
      id: p.id, affilae_id: p.id, program_id: p.program ? p.program.id : null,
      title: p.title||'', description: p.description||null,
      price: p.price ? p.price/100 : null, currency: 'EUR',
      url: p.url||null, tracking_id: p.trackingId||null,
      image_url: p.images&&p.images[0] ? p.images[0].url : null,
      brand: p.brand||null, ean: null,
      category, lang: p.lang||'fr',
      status: 'enabled', updated_at: new Date().toISOString()
    };
  });

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
      console.log('  HTTP status:', res.status, 'for', feed.url);
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


      const products = [];
      const seen = new Set();

      if (text.trim().startsWith('<')) {
        // Détecte automatiquement la balise produit utilisée
        const tagMatch = text.match(/<(item|product|offer|Product|Offer|annonce|Article|PRODUCT|ITEM|produit|Produit)[\s>]/i);
        const xmlTag = tagMatch ? tagMatch[1] : 'item';
        console.log('  XML tag detected:', xmlTag);
        const regex = new RegExp('<' + xmlTag + '[^>]*>([\\s\\S]*?)<\\/' + xmlTag + '>', 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          const item = match[0];
          const get = tag => { const m = item.match(new RegExp('<'+tag+'[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</'+tag+'>','i')); return m?(m[1]||'').trim():''; };
          const p = {
            title:       cleanTitle(get('title')||get('name')||get('nomproduit')||get('designation')),
            description: fixEncoding(get('description')||get('custom_label_0')||get('descriptif')||''),
            price:       parseFloat((get('price')||get('sale_price')||get('prix')||get('prixttc')||'0').replace(',','.')),
            url:         get('link')||get('url')||get('urlproduit')||get('lien'),
            image_url:   get('image_link')||get('image')||get('photo')||get('urlimage')||get('image1'),
            brand:       get('brand')||get('marque')||get('fabricant')||'',
            feed_cat:    get('category_level2')||get('category_level1')||get('category')||get('rayon')||get('categorie')||'',
            product_id:  get('id')||get('item_id')||get('idproduit')||get('codebarre')||'',
            ean:         extractEAN(get('gtin')||get('ean')||get('barcode')||get('codebarre')),
          };
          if (!p.title || !p.url) continue;
          const key = p.product_id || (p.title.toLowerCase().trim()+'_'+p.price);
          if (seen.has(key)) continue;
          seen.add(key);
          products.push(p);
          if (products.length >= feedLimit) break;
        }
      } else {
        // Parser CSV RFC-4180 (gère les champs avec guillemets et séparateurs internes)
        function parseCSVLine(line, sep) {
          const result = [];
          let field = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
              if (inQuotes && line[i+1] === '"') { field += '"'; i++; }
              else inQuotes = !inQuotes;
            } else if (c === sep && !inQuotes) {
              result.push(field); field = '';
            } else {
              field += c;
            }
          }
          result.push(field);
          return result;
        }

        const lines = text.split('\n').filter(l=>l.trim());
        const sep = lines[0].includes(';') ? ';' : ',';
        const headers = parseCSVLine(lines[0], sep).map(h=>h.trim().toLowerCase());
        for (const line of lines.slice(1)) {
          if (!line.trim()) continue;
          const vals = parseCSVLine(line, sep);
          const obj = {}; headers.forEach((h,i)=>obj[h]=(vals[i]||'').trim());
          const p = { title:cleanTitle(obj.title||obj.name), description:fixEncoding(obj.description||''), price:parseFloat(obj.price||'0'), url:obj.link||obj.url, image_url:obj.image_link||obj.image, feed_cat:obj.category_level2||obj.category_level1||obj.category||'', product_id:obj.id||obj.item_id||'', ean:extractEAN(obj.gtin||obj.ean||obj.barcode), brand:obj.brand||'' };
          if (!p.title || !p.url) continue;
          const key = p.product_id || (p.title.toLowerCase().trim()+'_'+p.price);
          if (seen.has(key)) continue;
          seen.add(key);
          products.push(p);
          if (products.length >= feedLimit) break;
        }
      }

      console.log('  Feed size:', text.length, 'chars');
      console.log('  Feed start:', text.slice(0, 300).replace(/\n/g,' '));
      console.log('  Sample URL:', products[0]?.url);
      console.log('  📦', feed.name, ':', products.length, 'produits');

      const programId = 'effinity_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g,'_');
      await supabaseUpsert('programs', [{ id:programId, title:feed.name, categories:[], countries:['FR'], updated_at:new Date().toISOString() }]);

      const mapped = products.filter(p=>p.title&&p.url).map((p,i) => ({
        id: programId+'_'+i, affilae_id: programId+'_'+i, program_id: programId,
        title: p.title, description: p.description||null, price: p.price||null,
        currency: 'EUR', url: p.url, tracking_id: null,
        image_url: p.image_url||null,
        brand: p.brand||null,
        ean: p.ean || null,
        category: feed.category || mapFeedCategory(p.feed_cat) || detectCategory({ title:p.title, description:p.description||'', program:{title:feed.name}, brand:p.brand||'' }),
        lang: 'fr', status: 'enabled', updated_at: new Date().toISOString()
      }));

      for (let i = 0; i < mapped.length; i += 50) await supabaseUpsert('products', mapped.slice(i,i+50));
      console.log('  ✅', feed.name, ':', mapped.length, 'insérés');

    } catch(e) { console.log('  ⚠️', feed.name, ':', e.message, '\n  Stack:', e.stack?.split('\n')[1]?.trim()); }
  }
  console.log('🎉 Effinity done');
}

// ══ BCD JEUX (BeezUP) ══
async function syncBCDJeux() {
  console.log('🔄 BCD Jeux sync...');
  const url = 'http://export.beezup.com/BCD_Jeux/Comparateur_BeezUP_CSV_2_FRA/8b4995eb-85a8-5258-ac4e-08fc6d3d39ed';
  const programId = 'bcdjeux';
  const AFFILIATE_CODE = '#ae=448';
  const LIMIT = 500;

  try {
    const res = await fetch(url);
    if (!res.ok) { console.log('  ❌ BCD Jeux:', res.status); return; }
    const buffer = await res.arrayBuffer();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch(e) { text = new TextDecoder('iso-8859-1').decode(buffer); }

    const lines = text.split('\n').filter(l => l.trim());
    // Détecte séparateur
    const sep = lines[0].includes(';') ? ';' : ',';
    // Format: ID;EAN;Nom;Fabricant;Prix;SKU;Stock;Qte;URL;Image;Image2;Categorie;CatRacine;Origine
    const products = [];
    const seen = new Set();

    for (const line of lines.slice(1)) {
      const cols = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
      if (cols.length < 9) continue;
      const [id, ean, nom, fabricant, prix, sku, stock, qte, urlProd, image, , categorie] = cols;
      if (!nom || !urlProd) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      // Ajoute le code affilié à la fin de l'URL
      const trackUrl = urlProd + AFFILIATE_CODE;

      products.push({
        id:          'bcdjeux_' + id,
        title:       cleanTitle(nom),
        price:       parseFloat(prix.replace(',', '.')) || null,
        url:         trackUrl,
        image_url:   image || null,
        category:    'enfants-bebes', // BCD Jeux = jeux/jouets
        brand:       fabricant || 'BCD Jeux',
        ean:         ean || null,
      });
      if (products.length >= LIMIT) break;
    }

    console.log('  📦 BCD Jeux:', products.length, 'produits');

    await supabaseUpsert('programs', [{
      id: programId, title: 'BCD Jeux', categories: [], countries: ['FR'],
      updated_at: new Date().toISOString()
    }]);

    const mapped = products.map(p => ({
      id:          p.id,
      affilae_id:  p.id,
      program_id:  programId,
      title:       p.title,
      description: null,
      price:       p.price,
      currency:    'EUR',
      url:         p.url,
      tracking_id: null,
      image_url:   p.image_url,
      category:    p.category,
      lang:        'fr',
      status:      'enabled',
      updated_at:  new Date().toISOString()
    }));

    for (let i = 0; i < mapped.length; i += 50) await supabaseUpsert('products', mapped.slice(i, i+50));
    console.log('  ✅ BCD Jeux:', mapped.length, 'insérés');

  } catch(e) {
    console.log('  ⚠️ BCD Jeux:', e.message);
  }
  console.log('🎉 BCD Jeux done');
}
const RAKUTEN_COUNTER = '23254453';
const RAKUTEN_BASE    = 'https://priceminister.effiliation.com/pm/api.html';

const RAKUTEN_SEARCHES = [
  // Mode
  { kw: 'robe',              cat: 'mode-vetements',    nav: 'Mode'           },
  { kw: 'chaussures femme',  cat: 'mode-vetements',    nav: 'Mode'           },
  { kw: 'sac à main',        cat: 'mode-vetements',    nav: 'Mode'           },
  { kw: 'manteau',           cat: 'mode-vetements',    nav: 'Mode'           },
  // Beauté
  { kw: 'crème visage',      cat: 'beaute-bienetre',   nav: 'Soins-Beaute'  },
  { kw: 'parfum femme',      cat: 'beaute-bienetre',   nav: 'Soins-Beaute'  },
  { kw: 'sérum visage',      cat: 'beaute-bienetre',   nav: 'Soins-Beaute'  },
  // Santé
  { kw: 'complément alimentaire', cat: 'sante-nutrition', nav: 'Sante'      },
  { kw: 'vitamine',          cat: 'sante-nutrition',   nav: 'Sante'          },
  // Maison
  { kw: 'aspirateur',        cat: 'maison-jardin',     nav: 'Maison'         },
  { kw: 'cafetière',         cat: 'maison-jardin',     nav: 'Electromenager' },
  { kw: 'luminaire',         cat: 'maison-jardin',     nav: 'Maison'         },
  // High-tech
  { kw: 'smartphone',        cat: 'high-tech',         nav: 'Informatique'   },
  { kw: 'casque audio',      cat: 'high-tech',         nav: 'Hifi'           },
  { kw: 'ordinateur portable',cat: 'high-tech',        nav: 'Informatique'   },
  { kw: 'tablette',          cat: 'high-tech',         nav: 'Informatique'   },
  { kw: 'jeux vidéo',        cat: 'high-tech',         nav: 'Jeux-video'     },
  // Sport
  { kw: 'vélo',              cat: 'sport-outdoor',     nav: 'Loisirs'        },
  { kw: 'tapis de course',   cat: 'sport-outdoor',     nav: 'Loisirs'        },
  { kw: 'chaussures running', cat: 'sport-outdoor',    nav: 'Mode'           },
  // Enfants
  { kw: 'jouet enfant',      cat: 'enfants-bebes',     nav: 'Enfant'         },
  { kw: 'lego',              cat: 'enfants-bebes',     nav: 'Enfant'         },
  // Auto
  { kw: 'pneu voiture',      cat: 'auto-moto',         nav: 'auto-moto'      },
  { kw: 'autoradio',         cat: 'auto-moto',         nav: 'auto-moto'      },
  // Animaux
  { kw: 'croquettes chien',  cat: 'animaux',           nav: 'Animalerie'     },
  { kw: 'litière chat',      cat: 'animaux',           nav: 'Animalerie'     },
];

function parseRakutenXML(xml) {
  const products = [];
  const regex = /<product>([\s\S]*?)<\/product>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const item = match[1];
    const get = tag => { const m = item.match(new RegExp('<'+tag+'[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</'+tag+'>','i')); return m?(m[1]||'').trim():''; };
    const getDeep = (tag1, tag2) => { const block = item.match(new RegExp('<'+tag1+'>[\\s\\S]*?<\\/'+tag1+'>','i')); return block ? (block[0].match(new RegExp('<'+tag2+'[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</'+tag2+'>','i'))||[])[1]||'' : ''; };

    const title = cleanTitle(get('headline'));
    const url   = get('url');
    const price = parseFloat(getDeep('advertprice','amount')||'0');
    // Image : extrait l'URL réelle depuis le redirect Effinity
    const imgRedirect = getDeep('image','url');
    const imgMatch = imgRedirect.match(/url=([^&]+)/);
    const image_url = imgMatch ? decodeURIComponent(imgMatch[1]) : '';

    if (!title || !url) continue;
    products.push({
      id:          'rakuten_' + get('productid'),
      title,
      price,
      url,
      image_url,
      category:    get('category'),
      brand:       get('caption'),
      product_id:  get('productid'),
    });
  }
  return products;
}

async function syncRakuten() {
  console.log('🔄 Rakuten sync...');
  const programId = 'rakuten_priceminister';

  await supabaseUpsert('programs', [{
    id: programId, title: 'Rakuten', categories: [], countries: ['FR'],
    updated_at: new Date().toISOString()
  }]);

  let totalInserted = 0;

  for (const search of RAKUTEN_SEARCHES) {
    try {
      const url = RAKUTEN_BASE + '?id_compteur=' + RAKUTEN_COUNTER +
                  '&kw=' + encodeURIComponent(search.kw) +
                  '&nav=' + encodeURIComponent(search.nav) +
                  '&nbproductsperpage=50&pagenumber=1';

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) { console.log('  ❌ Rakuten', search.nav, res.status); continue; }
      const text = await res.text();
      const products = parseRakutenXML(text);

      const mapped = products.map(p => ({
        id:          p.id,
        affilae_id:  p.id,
        program_id:  programId,
        title:       p.title,
        description: null,
        price:       p.price || null,
        currency:    'EUR',
        url:         p.url,
        tracking_id: null,
        image_url:   p.image_url || null,
        category:    search.cat,
        lang:        'fr',
        status:      'enabled',
        updated_at:  new Date().toISOString()
      }));

      if (mapped.length > 0) {
        await supabaseUpsert('products', mapped);
        totalInserted += mapped.length;
        console.log('  ✅ Rakuten "'+search.kw+'" :', mapped.length, 'produits');
      }
    } catch(e) {
      console.log('  ⚠️ Rakuten "'+search.kw+'" :', e.message);
    }
  }
  console.log('🎉 Rakuten done:', totalInserted, 'produits');
}

// ══ AWIN (Affiliate Window) ══
// Supports les flux CSV produits AWIN (datafeeds)
// Config via env AWIN_FEEDS = JSON array de { name, url, category, limit }
async function syncAwin() {
  console.log('🔄 Awin sync...');
  const AWIN_FEEDS_JSON = process.env.AWIN_FEEDS;
  if (!AWIN_FEEDS_JSON) { console.log('⚠️ AWIN_FEEDS manquant — skipped'); return; }

  let feeds;
  try { feeds = JSON.parse(AWIN_FEEDS_JSON); } catch(e) { console.log('❌ AWIN_FEEDS JSON invalide'); return; }

  for (const feed of feeds) {
    try {
      const feedLimit = feed.limit || 300;
      console.log('  →', feed.name, '(limit:', feedLimit, ')');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(feed.url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) { console.log('  ❌ AWIN', feed.name, res.status); continue; }

      const buffer = await res.arrayBuffer();
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch(e) { text = new TextDecoder('iso-8859-1').decode(buffer); }

      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { console.log('  ⚠️ AWIN', feed.name, ': flux vide'); continue; }

      // Détecte le séparateur (TSV ou CSV)
      const sep = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
      const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

      const products = [];
      const seen = new Set();

      for (const line of lines.slice(1)) {
        if (!line.trim()) continue;
        // Parser CSV simple (guillemets)
        const vals = [];
        let field = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') { if (inQ && line[i+1] === '"') { field += '"'; i++; } else inQ = !inQ; }
          else if (c === sep && !inQ) { vals.push(field); field = ''; }
          else field += c;
        }
        vals.push(field);
        const obj = {};
        headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());

        // Champs AWIN standard (nom de colonnes AWIN datafeed)
        const title = cleanTitle(
          obj['product_name'] || obj['product name'] || obj['name'] || obj['title'] || ''
        );
        const url = obj['aw_deep_link'] || obj['deep_link'] || obj['product_url'] || obj['url'] || '';
        const price = parseFloat(
          (obj['search_price'] || obj['price'] || obj['rrp_price'] || '0').replace(',', '.')
        ) || 0;
        const image_url = obj['aw_image_url'] || obj['merchant_image_url'] || obj['image_url'] || '';
        const brand  = obj['brand_name'] || obj['brand'] || obj['manufacturer'] || '';
        const ean    = extractEAN(obj['ean'] || obj['gtin'] || obj['barcode'] || '');
        const prodId = obj['aw_product_id'] || obj['merchant_product_id'] || obj['product_id'] || obj['id'] || '';

        if (!title || !url) continue;
        const key = ean || prodId || (title.toLowerCase().trim() + '_' + price);
        if (seen.has(key)) continue;
        seen.add(key);
        products.push({ title, url, price, image_url, brand, ean, product_id: prodId });
        if (products.length >= feedLimit) break;
      }

      console.log('  📦 AWIN', feed.name, ':', products.length, 'produits');

      const programId = 'awin_' + feed.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await supabaseUpsert('programs', [{
        id: programId, title: feed.name, categories: [], countries: ['FR'],
        updated_at: new Date().toISOString()
      }]);

      const mapped = products.map((p, i) => ({
        id:          p.product_id ? programId + '_' + p.product_id : programId + '_' + i,
        affilae_id:  p.product_id ? programId + '_' + p.product_id : programId + '_' + i,
        program_id:  programId,
        title:       p.title,
        description: null,
        price:       p.price || null,
        currency:    'EUR',
        url:         p.url,
        tracking_id: null,
        image_url:   p.image_url || null,
        brand:       p.brand || null,
        ean:         p.ean || null,
        category:    feed.category || mapFeedCategory(p.feed_cat) || detectCategory({ title: p.title, description: '', program: { title: feed.name }, brand: p.brand || '' }),
        lang:        'fr',
        status:      'enabled',
        updated_at:  new Date().toISOString()
      }));

      for (let i = 0; i < mapped.length; i += 50) await supabaseUpsert('products', mapped.slice(i, i + 50));
      console.log('  ✅ AWIN', feed.name, ':', mapped.length, 'insérés');

    } catch(e) {
      console.log('  ⚠️ AWIN', feed.name, ':', e.message);
    }
  }
  console.log('🎉 Awin done');
}

// ══ AWIN MERCHANTS — auto-découverte par merchant ID ══
const AWIN_API_KEY      = process.env.AWIN_API_KEY;
const AWIN_PUBLISHER_ID = '2855063';

const AWIN_MERCHANTS = [
  { id: '105475', name: 'Perfumeria Comas', cat: 'beaute-bienetre', trackMid: '105475' },
  { id: '12592',  name: 'Acer France',      cat: 'high-tech',       trackMid: '12592'  },
  { id: '7928',   name: 'Pneus FR',         cat: 'auto-moto',       trackMid: '7928'   },
  { id: '122426', name: 'IMOU FR',          cat: 'high-tech',       trackMid: '122426' },
  { id: '123918', name: 'Planetfoot',       cat: 'sport-outdoor',   trackMid: '123918' },
  { id: '114822', name: 'Atmosfera Sport',  cat: 'sport-outdoor',   trackMid: '114822' },
];

function awinTrackUrl(awinmid, productUrl) {
  return `https://www.awin1.com/cread.php?awinmid=${awinmid}&awinaffid=${AWIN_PUBLISHER_ID}&ued=${encodeURIComponent(productUrl)}`;
}

async function syncAwinMerchants() {
  console.log('🔄 AWIN Merchants sync...');
  if (!AWIN_API_KEY) { console.log('⚠️ AWIN_API_KEY manquant — skipped'); return; }

  // 1. Récupère la liste des flux disponibles pour ce publisher
  let feedList;
  try {
    const listRes = await fetch(
      `https://productdata.awin.com/datafeed/list/apikey/${AWIN_API_KEY}/format/json/`
    );
    if (!listRes.ok) {
      console.log('❌ AWIN feed list HTTP', listRes.status, await listRes.text());
      return;
    }
    feedList = await listRes.json();
    console.log(`  📋 ${feedList.length} flux disponibles au total`);
  } catch(e) {
    console.log('❌ AWIN feed list erreur:', e.message);
    return;
  }

  // 2. Pour chaque marchand cible, trouve et télécharge son flux
  for (const merchant of AWIN_MERCHANTS) {
    try {
      // Cherche le flux correspondant au merchantId
      const feed = feedList.find(f =>
        String(f.merchantId) === merchant.id || String(f.advertiserCountryCode) === merchant.id
      );

      if (!feed) {
        console.log(`  ⚠️ Aucun flux pour ${merchant.name} (id=${merchant.id}) — non approuvé ?`);
        continue;
      }

      const feedId  = feed.feedId || feed.id;
      const dlUrl   = `https://productdata.awin.com/datafeed/download/apikey/${AWIN_API_KEY}/language/fr/fid/${feedId}/format/csv/delimiter/%7C/`;
      console.log(`  → ${merchant.name} (feedId=${feedId})`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(dlUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) { console.log(`  ❌ ${merchant.name} HTTP ${res.status}`); continue; }

      const buffer = await res.arrayBuffer();
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch(e) { text = new TextDecoder('iso-8859-1').decode(buffer); }

      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { console.log(`  ⚠️ ${merchant.name}: flux vide`); continue; }

      const sep = lines[0].includes('|') ? '|' : (lines[0].includes('\t') ? '\t' : ',');
      const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

      const products = [];
      const seen = new Set();
      const LIMIT = 500;

      for (const line of lines.slice(1)) {
        if (!line.trim()) continue;
        const vals = line.split(sep);
        const obj = {};
        headers.forEach((h, i) => obj[h] = (vals[i] || '').trim().replace(/^"|"$/g, ''));

        const title     = cleanTitle(obj['product_name'] || obj['product name'] || obj['name'] || obj['title'] || '');
        const productUrl= obj['aw_deep_link'] || obj['deep_link'] || obj['product_url'] || obj['url'] || '';
        const price     = parseFloat((obj['search_price'] || obj['price'] || obj['rrp_price'] || '0').replace(',', '.')) || 0;
        const image_url = obj['aw_image_url'] || obj['merchant_image_url'] || obj['image_url'] || '';
        const brand     = obj['brand_name'] || obj['brand'] || obj['manufacturer'] || '';
        const ean       = extractEAN(obj['ean'] || obj['gtin'] || obj['barcode'] || '');
        const prodId    = obj['aw_product_id'] || obj['merchant_product_id'] || obj['product_id'] || obj['id'] || '';
        const feedCat   = obj['category_name'] || obj['category'] || obj['merchant_category'] || '';

        if (!title || !productUrl) continue;
        const key = ean || prodId || (title.toLowerCase().trim() + '_' + price);
        if (seen.has(key)) continue;
        seen.add(key);

        // Construit l'URL de tracking AWIN pour ce produit
        const trackUrl = awinTrackUrl(merchant.trackMid, productUrl);

        products.push({ title, url: trackUrl, price, image_url, brand, ean, product_id: prodId, feed_cat: feedCat });
        if (products.length >= LIMIT) break;
      }

      console.log(`  📦 ${merchant.name}: ${products.length} produits`);

      const programId = 'awin_' + merchant.id;
      await supabaseUpsert('programs', [{
        id: programId, title: merchant.name, categories: [], countries: ['FR'],
        updated_at: new Date().toISOString()
      }]);

      const mapped = products.map((p, i) => ({
        id:          p.product_id ? programId + '_' + p.product_id : programId + '_' + i,
        affilae_id:  p.product_id ? programId + '_' + p.product_id : programId + '_' + i,
        program_id:  programId,
        title:       p.title,
        description: null,
        price:       p.price || null,
        currency:    'EUR',
        url:         p.url,
        tracking_id: null,
        image_url:   p.image_url || null,
        brand:       p.brand || null,
        ean:         p.ean || null,
        category:    merchant.cat || mapFeedCategory(p.feed_cat) || detectCategory({ title: p.title, description: '', program: { title: merchant.name }, brand: p.brand || '' }),
        lang:        'fr',
        status:      'enabled',
        updated_at:  new Date().toISOString()
      }));

      for (let i = 0; i < mapped.length; i += 50) await supabaseUpsert('products', mapped.slice(i, i + 50));
      console.log(`  ✅ ${merchant.name}: ${mapped.length} insérés`);

    } catch(e) {
      console.log(`  ⚠️ ${merchant.name}:`, e.message);
    }
  }
  console.log('🎉 AWIN Merchants done');
}

async function main() {
  try {
    await syncAffilae();
    await syncEffinity();
    await syncBCDJeux();
    await syncRakuten();
    await syncAwin();
    await syncAwinMerchants();
    if (_neonClient) await _neonClient.end();
    console.log('🎉 All done!');
  } catch(e) {
    console.error('❌ Failed:', e.message);
    if (_neonClient) await _neonClient.end();
    process.exit(1);
  }
}

main();

// v5 - includes syncAwin (AWIN affiliate feeds)
