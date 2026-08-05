import { categorize } from '/mnt/user-data/outputs/scripts/lib/categorize.js';

const cases = [
  ['Geolandar A/T (G015)', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
  ['Continental EcoContact 6 Q (+) 255/50R19', '1001 Pneus', 'auto-moto', '', 'auto-moto'],
  ["Pirelli P Zero Race TLR RS 30C/R700", '1001 Pneus', 'auto-moto', '', 'auto-moto'],
  ["Nexen N'Blue S 175/55R15", '1001 Pneus', 'auto-moto', '', 'auto-moto'],
  ['Eagle F1 Asymmetric 6', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
  ['EUROWINTER HS02PRO', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
  ['Quatrac', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
  ['Scorpion Winter', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
  ['Winter SottoZero 3 Run Flat', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
  ['Night Dragon GT', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
  ['P Zero PZ5', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
  ['Snow Max 3', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
  ['AllSeasonContact 2', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
  ['Winguard WT1', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
  // Non-regression : ne doivent pas basculer par accident
  ['Apple Watch Series 9 45mm GPS', 'Maxxess', 'auto-moto', '', 'high-tech'],
  ['Michelin Star Restaurant Guide 2026', 'BDfugue', 'livres-bd', '', 'livres-bd'],
  ['Pneu Michelin Primacy 4 205/55 R16', 'Pneus FR', 'auto-moto', '', 'auto-moto'],
];

let ok = 0, ko = [];
for (const [title, merchant, mcat, feedCat, want] of cases) {
  const r = categorize({ title, merchant, merchantCategory: mcat, feedCat });
  if (r.category === want) ok++; else ko.push([title, r.category, want]);
}
console.log(ok + '/' + cases.length + ' corrects');
if (ko.length) ko.forEach(k => console.log('  KO  ' + k[0].padEnd(45) + '-> ' + k[1] + '  (attendu ' + k[2] + ')'));
