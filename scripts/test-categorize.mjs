import { categorize } from '/mnt/user-data/outputs/scripts/lib/categorize.js';

const cases = [
  // Le bug signale : Apple Watch chez un specialiste auto-moto
  ['Apple Watch Series 9 45mm GPS', 'Maxxess', 'auto-moto', '', 'high-tech'],
  ['Apple Watch SE 44mm', 'Speedway', 'auto-moto', '', 'high-tech'],
  ['AirPods Pro 2eme generation', 'Carter Cash', 'auto-moto', '', 'high-tech'],

  // Meme sans regle forte : un produit sans AUCUN indice ne doit plus
  // etre force dans la categorie du marchand (coeur du correctif)
  ['XR-4471-B', 'Maxxess', 'auto-moto', '', 'autres'],
  ['Reference 88291', 'Speedway', 'auto-moto', '', 'autres'],

  // Non-regression : les vrais produits auto doivent rester en auto-moto
  ['Casque J-CRUISE 2 UNI SHOEI', 'Maxxess', 'auto-moto', '', 'auto-moto'],
  ['Pneu Michelin Primacy 4', 'Rakuten', null, '', 'auto-moto'],
  ['ZARCO Echarpe Zarco', 'Moto Axxe', 'auto-moto', '', 'mode-vetements'],

  // Non-regression : livres, jouets, mode, sport (session precedente)
  ["Viollet-le-duc - l'homme qui ressuscita Notre-dame",'BDfugue','livres-bd','','livres-bd'],
  ['LEGO Ninjago 71829 Le dragon vert','Rakuten',null,'','enfants-bebes'],
  ['Chemise homme extraslim tissu traveler','Devred','mode-vetements','','mode-vetements'],
  ['Ballon de football Adidas Tiro League','Rakuten',null,'','sport-outdoor'],
  ['Croquettes chaton poulet 12x85g','Rakuten',null,'','animaux'],
];

let ok = 0, ko = [];
for (const [title, merchant, mcat, feedCat, want] of cases) {
  const r = categorize({ title, merchant, merchantCategory: mcat, feedCat });
  if (r.category === want) ok++; else ko.push([title, merchant, r.category, want, r.source]);
}
console.log(ok + '/' + cases.length + ' corrects');
if (ko.length) {
  console.log('\nEchecs :');
  ko.forEach(k => console.log('  ' + k[0].slice(0,40).padEnd(42) + '(' + k[1] + ')  -> ' + k[2] + '  attendu: ' + k[3] + '  [' + k[4] + ']'));
}
