import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, textSignal } from '../scripts/lib/categorize.js';
const cases = {
 'enfants-bebes': ['Suzuki GSX-R 1000 1:12 NewRay blanc/bleu','Figurine de football','Peluche chat','LEGO voiture de course','Poussette compacte','Jeu de société édition collector'],
 'high-tech': ['Nintendo Switch Sports','Grand Theft Auto V PS5','Apple Watch Series 10','Casque audio sans fil','Cartouche d’encre Epson orange','Caméra de surveillance WiFi','Smartphone Samsung Galaxy'],
 'maison-jardin': ['Ballon eau chaude', 'Ballon d’eau chaude 200 litres','Console murale bois','Robot aspirateur Xiaomi','Filtre A Sable Powerline Top 10 M3/h','Pince à linge','Ventilateur de table Makita','Perceuse sans fil'],
 'beaute-bienetre': ['Elizabeth Arden Green Tea crème corps 500ml','Crème corps miel thé vert','Pince à épiler','Parfum Scorpion','Shampooing hydratant','Body lotion Green Tea'],
 'sport-outdoor': ['Pneu vélo Continental','Casque vélo adulte','Ballon de football','Chaussures de running homme','Maillot de football enfant','Tapis de yoga'],
 'auto-moto': ['Casque moto Scorpion','Filtre à huile Renault Clio','Pneu Michelin Primacy 205 55 R16','Plaquettes de frein Renault'],
 'mode-vetements': ['Jean Wrangler homme','Pantalon avec poche','Broche fleur bijoux','Veste enfant coton','Robe été'],
 'animaux': ['Jouet pour chien ballon','Shampooing pour chien','Croquettes chat adulte','Harnais chien'],
 'sante-nutrition': ['Gélules collagène','Complément alimentaire miel','Tensiomètre bras'],
 'alimentation-bio': ['Chocolat noir 80%','Farine de blé'],
 'livres-bd': ['Manga Naruto tome 2','Bande dessinée Tintin'],
};
for (const [category,titles] of Object.entries(cases)) for (const title of titles) test(title,()=>assert.equal(categorize({title}).category,category));
test('merchant does not determine unknown title',()=>assert.equal(categorize({title:'ZX 1500',merchant:'Gorilla Sports',merchantCategory:'sport-outdoor'}).category,'autres'));
test('deepest taxonomy wins',()=>assert.equal(categorize({title:'Collection été',feedCat:'Enfant > Mode > Chaussure'}).category,'mode-vetements'));
test('description ingredients do not override cosmetics',()=>assert.equal(categorize({title:'Crème corps 500ml',description:'Miel et thé vert bio'}).category,'beaute-bienetre'));
test('no arbitrary tie resolution',()=>assert.equal(textSignal({title:'Poche album édition collector'}),null));
for (const [title,category] of [
 ['Bose Casque QuietComfort Ultra','high-tech'],['Arlo Essential 2K Outdoor','high-tech'],
 ['Microsoft Surface Arc Mouse','high-tech'],['Melissa & Doug Batterie De Cuisine','enfants-bebes'],
 ['Livre de coloriage enfant Water Wow','enfants-bebes'],['Nettoyeur Détacheur Bissell Spotclean','maison-jardin'],
 ['Disney Figurine serre-livres Stitch','maison-jardin'],['Avon Cobra Chrome 170/80R15','auto-moto'],
 ['BISSELL Détergent naturel multisurface pour animaux','maison-jardin'],
 ['Nintendo Animal Crossing Série 5 Paquet de cartes','high-tech']
]) test('catalogue: '+title,()=>assert.equal(categorize({title}).category,category));
for(const [title,category] of [
 ['Mortelle Adèle Tome 11 Ça sent la croquette','livres-bd'],['Marie-Lune tome 6 Ne me laisse pas tomber','livres-bd'],
 ['Yves Saint Laurent Mascara Tome 2','beaute-bienetre'],['Jouet à tirer Toby le chien','enfants-bebes'],
 ['Peluche chien jouet premier âge','enfants-bebes'],['Commode 2 tiroirs 1 niche','maison-jardin'],
 ['Désodorisant voiture parfum pêche','auto-moto'],['Parfum d’intérieur thé blanc','maison-jardin'],
 ['Festool Bague de copiage','maison-jardin'],['Colle à bois biberon 250g','maison-jardin'],
 ['Couche-culotte Pampers','enfants-bebes'],['Trottinette électrique pneus 10 pouces','sport-outdoor'],
 ['HORI sac banane pour Switch 2','high-tech'],['LEGO Serre-livres Disney','enfants-bebes'],
 ['Valise avec serrure TSA','mode-vetements']
])test('audit: '+title,()=>assert.equal(categorize({title}).category,category));
