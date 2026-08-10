// scripts/list-merchants.js
//
// Liste les marchands ACTUELLEMENT ACCEPTES sur Awin et CJ, via les API
// officielles de relation editeur/annonceur -- pas la liste des flux
// produits (deja geree par sync.js), mais la liste des partenariats
// approuves, y compris ceux qui n'ont pas encore de flux configure.
//
// Sources verifiees le 09/08 :
//   Awin : GET /publishers/{publisherId}/programmes?relationship=joined
//          https://developer.awin.com/apidocs/get-publishers-information-for-advertiser
//   CJ   : GET /v2/advertiser-lookup?requestor-cid=X&advertiser-ids=joined
//          https://advertiser-lookup.api.cj.com (reponse XML)
//
// Effinity : aucune API publique documentee trouvee pour lister les
// annonceurs actifs -- a verifier manuellement dans le tableau de bord
// Effinity le temps qu'une meilleure solution soit trouvee.
//
// Usage : node scripts/list-merchants.js
// Variables d'environnement necessaires :
//   AWIN_API_KEY, AWIN_PUBLISHER_ID
//   CJ_TOKEN, CJ_CID

async function listAwinMerchants() {
  const apiKey = process.env.AWIN_API_KEY;
  const publisherId = process.env.AWIN_PUBLISHER_ID;
  if (!apiKey || !publisherId) {
    console.log('⚠️  Awin : AWIN_API_KEY ou AWIN_PUBLISHER_ID manquant, etape ignoree');
    return [];
  }

  const url = `https://api.awin.com/publishers/${publisherId}/programmes?relationship=joined&accessToken=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`⚠️  Awin : HTTP ${res.status} -- verifier AWIN_API_KEY`);
    return [];
  }
  const programmes = await res.json();
  return programmes.map(p => ({
    network: 'awin',
    id: p.id,
    name: p.name,
    joinedAt: p.validationDate || null,
  }));
}

function parseXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  const m = re.exec(xml);
  return m ? m[1] : null;
}

async function listCjMerchants() {
  const token = process.env.CJ_TOKEN;
  const cid = process.env.CJ_CID;
  if (!token || !cid) {
    console.log('⚠️  CJ : CJ_TOKEN ou CJ_CID manquant, etape ignoree');
    return [];
  }

  const url = `https://advertiser-lookup.api.cj.com/v2/advertiser-lookup?requestor-cid=${cid}&advertiser-ids=joined`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.log(`⚠️  CJ : HTTP ${res.status} -- le token doit peut-etre etre regenere`);
    return [];
  }
  const xml = await res.text();

  // Reponse XML, un bloc <advertiser>...</advertiser> par marchand.
  const blocks = xml.split('<advertiser>').slice(1);
  return blocks.map(block => ({
    network: 'cj',
    id: parseXmlTag(block, 'advertiser-id'),
    name: parseXmlTag(block, 'advertiser-name'),
    status: parseXmlTag(block, 'account-status'),
  }));
}

async function main() {
  console.log('================================================================');
  console.log('MARCHANDS ACTUELLEMENT ACCEPTES -- Awin + CJ');
  console.log('================================================================');

  const [awin, cj] = await Promise.all([listAwinMerchants(), listCjMerchants()]);

  console.log(`\nAwin (${awin.length} marchands) :`);
  awin.forEach(m => console.log(`  - [${m.id}] ${m.name}`));

  console.log(`\nCJ (${cj.length} marchands) :`);
  cj.forEach(m => console.log(`  - [${m.id}] ${m.name} (${m.status})`));

  console.log('\nEffinity : pas d\'API publique trouvee -- verifier le tableau de bord manuellement.');

  console.log('\n================================================================');
  console.log('Pour reperer les marchands presents sur PLUSIEURS reseaux : compare');
  console.log('les noms ci-dessus a l\'oeil (memes enseignes, orthographes parfois');
  console.log('legerement differentes -- "Rue du Commerce" vs "RueDuCommerce"...).');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Erreur :', err.message);
  process.exit(1);
});
