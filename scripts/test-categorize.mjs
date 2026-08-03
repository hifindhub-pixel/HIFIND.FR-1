import { categorize } from '/mnt/user-data/outputs/scripts/lib/categorize.js';

const cases = [
  // Cas réels tirés de la base, catégorie "autres"
  ['Décapeur thermique STANLEY FME670K FATMAX - 2000W','Rakuten',null,'','maison-jardin'],
  ['Figurine Naruto Shippuden - Jiraiya - Colosseum 16 cm','Rakuten',null,'','enfants-bebes'],
  ['Eufy Indoor Cam S350 Bulbe Caméra de sécurité IP Intérieure','Rakuten',null,'','high-tech'],
  ["Viollet-le-duc - l'homme qui ressuscita Notre-dame",'BDfugue','livres-bd','','livres-bd'],
  ['Leitz TruSens Z-2000 35 m² 64 dB 28 W Argent et Blanc','Rakuten',null,'','autres'],
  ['Taf Toys 12385','Rakuten',null,'','autres'],
  ['les chemins de malefosse tome 1 - le diable noir','BDfugue','livres-bd','','livres-bd'],
  ['Notes - Tome 7 - Formicapunk','BDfugue','livres-bd','','livres-bd'],
  ['mierEdu Boîte magnétique de voyage - Policier','Rakuten',null,'','autres'],
  ['Les grandes aventures de Romano Scarpa tome 8','BDfugue','livres-bd','','livres-bd'],
  ['Bouilloire vintage','Rakuten',null,'','maison-jardin'],
  ['Lame de scie DSB 240/W - 575416','Rakuten',null,'','maison-jardin'],
  ['King Conan - Colossal','BDfugue','livres-bd','','livres-bd'],
  ['Les Reines De Sang - Cléopâtre, La Reine Fatale - Tome 2','BDfugue','livres-bd','','livres-bd'],
  ['Billard de table 70 x 36 x 23 cm LEGLER','Rakuten',null,'','enfants-bebes'],
  ['Garfield - Tome 37 - C\'est La Fête !','BDfugue','livres-bd','','livres-bd'],
  ['EziClean® Nettoyeur injecteur-extracteur détachant W2','Rakuten',null,'','maison-jardin'],
  ['Games Liar\'s Uno','Rakuten',null,'','enfants-bebes'],
  ['LEGO Ninjago 71829 Le dragon vert de la forêt de Lloyd','Rakuten',null,'','enfants-bebes'],
  ['Store à rouleau bambou naturel 100 x 160 cm','Rakuten',null,'','maison-jardin'],
  // Non-régression
  ['Peluche Lapin Doudou 30cm','Pixmania','high-tech','','enfants-bebes'],
  ['Pince multifonction 12 en 1 acier','Gorilla Sports','sport-outdoor','','maison-jardin'],
  ['Nintendo Switch Sports - Jeu Switch','Rakuten',null,'','high-tech'],
  ['Pneu Michelin Primacy 4','Rakuten',null,'','auto-moto'],
  ['Eau de Parfum Gucci Bloom 100ml','Pixmania','high-tech','','beaute-bienetre'],
  ['Croquettes chaton poulet 12x85g','Rakuten',null,'','animaux'],
  ['Robe longue fleurie été','Blancheporte','mode-vetements','','mode-vetements'],
  ['Casque J-CRUISE 2 UNI SHOEI','Maxxess','auto-moto','','auto-moto'],
];

let ok = 0, ko = [];
for (const [title, merchant, mcat, feedCat, want] of cases) {
  const r = categorize({ title, merchant, merchantCategory: mcat, feedCat });
  if (r.category === want) ok++; else ko.push([title, r.category, want]);
}
console.log(ok + '/' + cases.length + ' corrects');
if (ko.length) { console.log('\nEcarts :'); ko.forEach(k => console.log('  ' + k[0].slice(0,48).padEnd(50) + k[1].padEnd(16) + '(attendu ' + k[2] + ')')); }
