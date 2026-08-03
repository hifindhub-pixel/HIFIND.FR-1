// scripts/lib/categorize.js
//
// Classement d'un produit dans une catégorie HiFind.
//
// Trois problemes que ce module resout :
//   1. La categorie du marchand ne vaut que pour les marchands specialises.
//      Une marketplace (Rakuten, Pixmania, ManoMano...) vend de tout : lui
//      appliquer une categorie unique met des peluches en high-tech.
//   2. Le nom du marchand ne doit jamais entrer dans la detection, sinon
//      chaque produit de "Gorilla Sports" marque un point sur "sport".
//   3. La comparaison se fait sur des mots entiers. "Nintendo Switch Sports"
//      n'est pas un article de sport ; "jeune" n'est pas un jeu.

export const CATEGORIES = [
  'high-tech','auto-moto','maison-jardin','mode-vetements','beaute-bienetre',
  'sante-nutrition','enfants-bebes','sport-outdoor','animaux','alimentation-bio',
  'livres-bd','autres'
];

/** Marchands generalistes : leur categorie declaree n'est pas fiable. */
export const MARKETPLACES = new Set([
  // Generalistes uniquement : ceux qui vendent de tout, donc dont la
  // categorie declaree ne veut rien dire au niveau du produit.
  'rakuten','rue du commerce','pixmania','joybuy','aliexpress',
  'temu','onbuy','cdiscount','fnac','darty'
]);

const norm = s => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // enleve les accents
  .replace(/[’']/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Regles fortes : un seul terme suffit, aucune ambiguite possible. */
const STRONG = [
  ['livres-bd', ['tome','manga','bande dessinee','integrale','roman','livre','livres',
    'coffret bd','edition collector','anthologie','beau livre','album','poche','broche',
    'guide de voyage','dictionnaire','encyclopedie','biographie','essai','recueil',
    'shonen','shojo','seinen','comics','graphic novel','artbook','one shot',
    'edition limitee bd','strip','webtoon']],
  ['auto-moto', ['pneu','pneus','jante','plaquette de frein','plaquettes de frein','amortisseur',
    'huile moteur','filtre a huile','filtre a air','bougie d allumage','essuie glace','attelage',
    'casque moto','casque integral','casque jet','blouson moto','gant moto','botte moto',
    'echappement','carburateur','demarreur','alternateur','embrayage','courroie de distribution',
    'batterie voiture','chaine moto','antivol moto','top case','sacoche moto']],
  ['high-tech', ['smartphone','iphone','ipad','macbook','ordinateur portable','pc portable',
    'disque dur','ssd','carte graphique','carte mere','processeur','ram ddr','clavier mecanique',
    'souris gamer','ecouteurs','casque bluetooth','casque audio','enceinte bluetooth','televiseur',
    'tv led','tv oled','videoprojecteur','imprimante','cartouche d encre','toner','routeur',
    'cle usb','carte sd','micro sd','console','nintendo switch','playstation','xbox','manette',
    'tablette tactile','montre connectee','drone','appareil photo','objectif photo','webcam',
    'camera de securite','camera ip','camera de surveillance','visiophone','interphone',
    'thermostat connecte','ampoule connectee','prise connectee','assistant vocal',
    'liseuse','barre de son','casque vr','carte mere','alimentation pc','ventirad']],
  ['beaute-bienetre', ['eau de parfum','eau de toilette','eau de cologne','rouge a levres',
    'fond de teint','mascara','vernis a ongles','anti rides','creme hydratante','serum visage',
    'shampooing','shampoing','apres shampoing','coloration cheveux','tondeuse cheveux',
    'seche cheveux','lisseur','fer a boucler','gel douche','deodorant','rasoir','apres rasage']],
  ['enfants-bebes', ['peluche','doudou','poussette','siege auto bebe','biberon','tetine','couche',
    'lait infantile','chaise haute','lit parapluie','porte bebe','jouet','jeu de construction',
    'lego','playmobil','puzzle','puzzle enfant','trotteur','veilleuse','baby phone','table a langer',
    'figurine','poupee','peluche geante','jeu de societe','jeu de cartes','uno','monopoly',
    'circuit de voiture','train electrique','maison de poupee','deguisement','tapis d eveil',
    'porteur','draisienne','trottinette enfant','baby gym','hochet','boite a musique',
    'billard de table','babyfoot','flechettes','coloriage','pate a modeler','kit creatif']],
  ['animaux', ['croquette','croquettes','litiere','griffoir','aquarium','niche','laisse',
    'collier chien','collier chat','panier chien','panier chat','harnais chien','gamelle',
    'arbre a chat','cage oiseau','terrarium','pate pour chat','pate pour chien']],
  ['auto-moto', ['revue technique']],
  ['sport-outdoor', ['tapis de course','velo elliptique','rameur','halteres','kettlebell',
    'banc de musculation','tapis de yoga','raquette de tennis','ballon de football',
    'crampons football','maillot de football','sac de couchage','tente de camping',
    'rechaud camping','baton de randonnee','chaussure de randonnee','combinaison de plongee',
    'planche de surf','ski alpin','snowboard','trottinette electrique']],
  ['maison-jardin', ['perceuse','visseuse','meuleuse','scie circulaire','ponceuse','tronconneuse',
    'tondeuse a gazon','taille haie','debroussailleuse','nettoyeur haute pression','aspirateur',
    'lave linge','lave vaisselle','refrigerateur','congelateur','four encastrable','micro ondes',
    'plaque induction','hotte aspirante','robot cuisine','cafetiere','bouilloire','mitigeur',
    'pince','pince multifonction','tournevis','marteau','cle a molette','cle a cliquet',
    'niveau a bulle','metre ruban','scie','burin','etau','serre joint','pistolet a colle',
    'multiprise','rallonge electrique','ampoule','interrupteur','cadenas','serrure',
    'decapeur thermique','lame de scie','disque a tronconner','foret','meche','cheville',
    'store','store enrouleur','purificateur d air','deshumidificateur','humidificateur',
    'ventilateur','radiateur','climatiseur','nettoyeur vapeur','injecteur extracteur',
    'centrale vapeur','fer a repasser','grille pain','friteuse','blender','mixeur',
    'autocuiseur','cocotte','poele','casserole','couvercle de cuisson','planche a decouper',
    'robinet','lavabo','receveur de douche','parquet','carrelage','peinture murale','tapis salon',
    'rideau','store enrouleur','matelas','sommier','couette','escabeau','echelle']],
  ['mode-vetements', ['robe','jean','pantalon','chemise','veste','manteau','pull','sweat',
    't shirt','tee shirt','polo','jupe','short','chaussettes','collant','soutien gorge',
    'culotte','slip','boxer','pyjama','maillot de bain','basket','sneaker','mocassin',
    'escarpin','sandale','botte','bottine','sac a main','portefeuille','ceinture','echarpe',
    'bonnet','casquette','lunettes de soleil','montre homme','montre femme','bracelet',
    'collier femme','bague','boucles d oreilles']],
  ['sante-nutrition', ['complement alimentaire','vitamine','magnesium','probiotique','collagene',
    'proteine whey','huile essentielle','gelule','comprime','tensiometre','thermometre medical',
    'lentilles de contact','pansement','desinfectant']],
  ['alimentation-bio', ['cafe en grain','the vert','miel','huile d olive','farine','pates',
    'riz','confiture','chocolat noir','biscuit','jus de fruit','sirop','epice','conserve']],
];

/** Regles faibles : il en faut plusieurs pour trancher. */
const WEAK = [
  ['livres-bd', ['editions','edition','auteur','scenario','dessin','couleurs','volume','chapitre','saga','serie']],
  ['high-tech', ['tech','electronique','usb','hdmi','wifi','bluetooth','gaming','pc','led',
    'batterie','chargeur','ecran','pouces','go','to','ghz','mah']],
  ['auto-moto', ['auto','moto','voiture','vehicule','scooter','quad','remorque','moteur','r15','r16','r17','r18']],
  ['maison-jardin', ['maison','jardin','deco','meuble','cuisine','salle de bain','bricolage',
    'outil','outillage','jardinage','arrosage','terrasse','piscine','chauffage','luminaire']],
  ['mode-vetements', ['mode','vetement','pret a porter','taille','coton','cuir','laine','denim','manches']],
  ['beaute-bienetre', ['beaute','soin','creme','serum','cosmetique','parfum','visage','cheveux',
    'peau','maquillage','hydratant','nettoyant','bio']],
  ['sante-nutrition', ['sante','complement','nutrition','minceur','detox','sommeil','immunite','bien etre']],
  ['enfants-bebes', ['enfant','bebe','baby','kids','garcon','fille','puericulture','eveil','ans']],
  ['sport-outdoor', ['sport','fitness','musculation','yoga','running','velo','randonnee','camping',
    'outdoor','trail','ski','tennis','football','natation','entrainement']],
  ['animaux', ['animal','animaux','chien','chat','chiot','chaton','rongeur','oiseau','aquariophilie']],
  ['alimentation-bio', ['alimentation','epicerie','boisson','snack','vegan','sans gluten','saveur','gout']],
];

/** Mots du texte du flux marchand vers une categorie HiFind. */
const FEED_HINTS = [
  ['livres-bd', ['livre','livres','bd','manga','comics','litterature','librairie','bande dessinee','jeunesse']],
  ['high-tech', ['informatique','telephonie','image son','high tech','multimedia','photo','audio','console','jeux video']],
  ['auto-moto', ['auto','moto','pneumatique','pieces detachees','garage','2 roues']],
  ['maison-jardin', ['maison','jardin','bricolage','electromenager','meuble','decoration','cuisine','sanitaire','chauffage','outillage']],
  ['mode-vetements', ['mode','vetement','pret a porter','chaussure','maroquinerie','bijoux','accessoire','lingerie']],
  ['beaute-bienetre', ['beaute','parfum','cosmetique','soin','hygiene','capillaire']],
  ['sante-nutrition', ['sante','parapharmacie','nutrition','medical','complement']],
  ['enfants-bebes', ['enfant','bebe','puericulture','jouet','jeux','naissance']],
  ['sport-outdoor', ['sport','fitness','outdoor','montagne','cycle','nautisme','chasse','peche']],
  ['animaux', ['animalerie','animaux','chien','chat']],
  ['alimentation-bio', ['alimentation','epicerie','boisson','bio','gastronomie','vin']],
];

function hasWord(hay, term) {
  // hay et term sont deja normalises (mots separes par des espaces simples)
  return (' ' + hay + ' ').indexOf(' ' + term + ' ') !== -1;
}

function scoreRules(text, rules, weight) {
  const out = {};
  for (const [cat, terms] of rules) {
    let n = 0;
    for (const t of terms) if (hasWord(text, t)) n++;
    if (n) out[cat] = (out[cat] || 0) + n * weight;
  }
  return out;
}

/**
 * @param {object} p
 * @param {string} p.title
 * @param {string} [p.description]
 * @param {string} [p.feedCat]           categorie telle qu'annoncee par le flux
 * @param {string} [p.merchant]          nom du marchand
 * @param {string} [p.merchantCategory]  categorie configuree pour ce marchand
 * @returns {{category:string, source:string, score:number}}
 */
export function categorize(p) {
  const title = norm(p.title);
  const desc  = norm(p.description).slice(0, 300);
  const feed  = norm(p.feedCat);
  const merchant = norm(p.merchant);
  const isMarketplace = [...MARKETPLACES].some(m => merchant.indexOf(norm(m)) !== -1);

  // 1) Regle forte sur le titre : verdict immediat.
  for (const [cat, terms] of STRONG) {
    for (const t of terms) if (hasWord(title, t)) return { category: cat, source: 'titre', score: 10 };
  }

  // 2) Cumul pondere : titre > categorie du flux > description.
  const scores = {};
  const add = src => { for (const k in src) scores[k] = (scores[k] || 0) + src[k]; };
  add(scoreRules(title, WEAK, 3));
  add(scoreRules(feed,  FEED_HINTS, 4));
  add(scoreRules(feed,  WEAK, 2));
  add(scoreRules(desc,  WEAK, 1));

  // 3) Categorie du marchand : uniquement s'il est specialise.
  if (p.merchantCategory && !isMarketplace) {
    // Un marchand specialise est un signal fort : sans lui, un titre de livre
    // sans le mot "tome" finirait en "autres".
    scores[p.merchantCategory] = (scores[p.merchantCategory] || 0) + 4;
  }

  let best = null, bestScore = 0;
  for (const k in scores) if (scores[k] > bestScore) { bestScore = scores[k]; best = k; }

  if (best && bestScore >= 3) return { category: best, source: 'score', score: bestScore };

  // 4) Repli : le marchand specialise, sinon "autres".
  if (p.merchantCategory && !isMarketplace) {
    return { category: p.merchantCategory, source: 'marchand', score: 1 };
  }
  return { category: 'autres', source: 'defaut', score: 0 };
}
