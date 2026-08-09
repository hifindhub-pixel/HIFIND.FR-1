// scripts/inspect-shipping-columns.js
//
// Script de diagnostic A USAGE UNIQUE : verifie, pour chaque reseau
// d'affiliation, si un champ de frais de livraison existe reellement
// dans les donnees brutes -- sans rien modifier en base, sans rien
// ecrire nulle part. Juste un etat des lieux avant de construire
// l'integration des frais de port dans le calcul du meilleur prix.
//
// Usage : node scripts/inspect-shipping-columns.js
// (necessite les memes variables d'environnement que sync.js)

const SHIPPING_HINTS = [
  'ship', 'deliv', 'livrai', 'frais', 'freight', 'postage', 'transport'
];

function flagShippingLike(name) {
  const n = name.toLowerCase();
  return SHIPPING_HINTS.some(h => n.includes(h));
}

async function inspectCsvHeaders(label, url) {
  console.log('\n=== ' + label + ' ===');
  try {
    const res = await fetch(url);
    if (!res.ok) { console.log('  HTTP', res.status, '-- impossible de recuperer un echantillon'); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let text = '';
    // Ne lit que les premiers Ko : il ne faut que la ligne d'en-tete.
    while (text.length < 8000) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});

    const firstLine = text.split(/\r?\n/)[0] || '';
    const sep = firstLine.includes('\t') ? '\t' : firstLine.includes('|') ? '|' : ',';
    const headers = firstLine.split(sep).map(h => h.trim().replace(/^"|"$/g, ''));

    console.log('  ' + headers.length + ' colonnes detectees (separateur ' + JSON.stringify(sep) + ') :');
    headers.forEach(h => {
      const marker = flagShippingLike(h) ? '  <-- CANDIDAT LIVRAISON' : '';
      console.log('    - ' + h + marker);
    });
    if (!headers.some(flagShippingLike)) {
      console.log('  Aucune colonne evoquant la livraison dans ce flux.');
    }
  } catch (e) {
    console.log('  Erreur:', e.message);
  }
}

async function inspectCjSchema() {
  console.log('\n=== CJ (introspection GraphQL du type Product) ===');
  const CJ_TOKEN = process.env.CJ_TOKEN;
  if (!CJ_TOKEN) { console.log('  CJ_TOKEN manquant, ignore'); return; }
  try {
    const query = `{ __type(name: "Product") { fields { name description } } }`;
    const res = await fetch('https://ads.api.cj.com/query', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CJ_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const body = await res.json();
    const fields = body?.data?.__type?.fields || [];
    if (!fields.length) { console.log('  Introspection vide ou refusee:', JSON.stringify(body).slice(0, 300)); return; }
    console.log('  ' + fields.length + ' champs disponibles sur le type Product :');
    fields.forEach(f => {
      const marker = flagShippingLike(f.name) ? '  <-- CANDIDAT LIVRAISON' : '';
      console.log('    - ' + f.name + (f.description ? ' (' + f.description + ')' : '') + marker);
    });
    if (!fields.some(f => flagShippingLike(f.name))) {
      console.log('  Aucun champ evoquant la livraison dans le schema Product.');
    }
  } catch (e) {
    console.log('  Erreur:', e.message);
  }
}

async function main() {
  console.log('Inspection des colonnes disponibles -- aucune ecriture, diagnostic seul.');

  try {
    const effinityFeeds = JSON.parse(process.env.EFFINITY_FEEDS || '[]');
    if (effinityFeeds[0]) await inspectCsvHeaders('Effinity — ' + effinityFeeds[0].name, effinityFeeds[0].url);
    else console.log('\n=== Effinity === \n  EFFINITY_FEEDS vide ou absent');
  } catch (e) { console.log('\n=== Effinity ===\n  EFFINITY_FEEDS illisible:', e.message); }

  try {
    const awinFeeds = JSON.parse(process.env.AWIN_FEEDS || '[]');
    if (awinFeeds[0]) await inspectCsvHeaders('Awin — ' + awinFeeds[0].name, awinFeeds[0].url);
    else console.log('\n=== Awin ===\n  AWIN_FEEDS vide ou absent');
  } catch (e) { console.log('\n=== Awin ===\n  AWIN_FEEDS illisible:', e.message); }

  try {
    const affilaeFeeds = JSON.parse(process.env.AFFILAE_FEEDS || '[]');
    if (affilaeFeeds[0]) await inspectCsvHeaders('Affilae Feeds — ' + affilaeFeeds[0].name, affilaeFeeds[0].url);
    else console.log('\n=== Affilae Feeds ===\n  AFFILAE_FEEDS vide ou absent');
  } catch (e) { console.log('\n=== Affilae Feeds ===\n  AFFILAE_FEEDS illisible:', e.message); }

  await inspectCjSchema();

  console.log('\nTermine. Copie tout ce qui precede et renvoie-le pour construire l\'integration.');
}

main().catch(e => { console.error('Erreur fatale:', e.message); process.exit(1); });
