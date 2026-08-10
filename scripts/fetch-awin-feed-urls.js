// scripts/fetch-awin-feed-urls.js
//
// Tente de recuperer les URLs de flux (datafeeds) pour les nouveaux
// marchands Awin acceptes aujourd'hui, via l'API historique Awin
// (productdata.awin.com), DIFFERENTE de l'API moderne api.awin.com deja
// utilisee par list-merchants.js.
//
// Confirme le 09/08 via la doc officielle Awin (help.awin.com/docs/
// product-feed-list-download) : "the API key used to access the
// product feed list file is different to the API key used to access
// the Publisher API" -- deux cles distinctes, pas une seule reutilisable
// partout. D'ou AWIN_FEED_LIST_KEY, separee de AWIN_API_KEY.
//
// Source du format d'URL : meme doc officielle, confirmee independamment
// par un SDK tiers documente publiquement (ckilb/awin-product-sdk) --
//   https://productdata.awin.com/datafeed/list/apikey/{apiKey}
// Retourne un CSV listant tous les flux disponibles pour ce publisher,
// avec Advertiser ID, Advertiser Name, et l'URL du flux lui-meme.
//
// Usage : node scripts/fetch-awin-feed-urls.js
// Variable d'environnement necessaire : AWIN_FEED_LIST_KEY (recuperee
// sur Awin -- Toolbox > Create-a-Feed > encadre "Feed List Download")

// Les 36 marchands Awin identifies comme nouveaux et pertinents le
// 09/08, apres relecture manuelle (VIP Cars, Free2move, Alison et
// Nutrinixy retires -- ce sont des services, pas des vendeurs de
// produits physiques).
const TARGET_ADVERTISER_IDS = [
  13991, 98667, 127127, 116299, 114822, 125332, 83139, 87255, 126139,
  120301, 127705, 124946, 70855, 114336, 122426, 119897, 25709, 123168,
  116247, 99151, 123746, 20930, 124120, 127959, 111366, 28737, 124816,
  109230, 44635, 105835, 125624, 58007, 102013, 121692, 59757, 128237,
];

function parseCSVLine(line) {
  // Parsing CSV simple : suffisant pour ce format Awin (pas de virgules
  // imbriquees dans les champs habituels de cette liste de flux).
  return line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
}

async function main() {
  const apiKey = process.env.AWIN_FEED_LIST_KEY;
  if (!apiKey) {
    console.log('⚠️  AWIN_FEED_LIST_KEY manquant, arret.');
    process.exit(1);
  }

  const url = `https://productdata.awin.com/datafeed/list/apikey/${apiKey}`;
  console.log('Interrogation de l\'API legacy Awin...');
  const res = await fetch(url);

  if (!res.ok) {
    console.log(`❌ HTTP ${res.status} -- verifier que AWIN_FEED_LIST_KEY est correcte.`);
    console.log('   Cette cle se recupere sur Awin : Toolbox > Create-a-Feed,');
    console.log('   encadre "Feed List Download" en haut de la page.');
    process.exit(1);
  }

  const text = await res.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) {
    console.log('⚠️  Reponse vide -- format inattendu, verifier manuellement.');
    return;
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  const idIdx = headers.findIndex(h => h.includes('advertiser') && h.includes('id'));
  const nameIdx = headers.findIndex(h => h.includes('advertiser') && h.includes('name'));
  const urlIdx = headers.findIndex(h => h.includes('url') || h.includes('feed'));

  if (idIdx === -1 || urlIdx === -1) {
    console.log('⚠️  Colonnes attendues introuvables. En-tetes recus :', headers.join(' | '));
    console.log('   Premieres lignes brutes pour diagnostic :');
    lines.slice(0, 5).forEach(l => console.log('   ' + l));
    return;
  }

  console.log(`✅ ${lines.length - 1} flux au total dans la reponse.\n`);

  const found = [];
  const missing = [];
  for (const id of TARGET_ADVERTISER_IDS) {
    const row = lines.slice(1).find(l => parseCSVLine(l)[idIdx] === String(id));
    if (row) {
      const cols = parseCSVLine(row);
      found.push({ id, name: cols[nameIdx] || '?', url: cols[urlIdx] });
    } else {
      missing.push(id);
    }
  }

  console.log(`=== TROUVES (${found.length}/${TARGET_ADVERTISER_IDS.length}) ===`);
  found.forEach(f => console.log(`  [${f.id}] ${f.name}\n    ${f.url}`));

  if (missing.length) {
    console.log(`\n=== ABSENTS de la liste (${missing.length}) -- pas de flux configure cote Awin, ou pas encore actif ===`);
    console.log('  ' + missing.join(', '));
  }
}

main().catch(err => {
  console.error('Erreur :', err.message);
  process.exit(1);
});
