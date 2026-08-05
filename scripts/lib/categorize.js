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
  // Marques de pneus : quasi jamais utilisees seules dans un titre
  // generique (contrairement a "watch" ou "casque"), donc sans risque de
  // faux positif. Les titres de pneus se limitent souvent au nom de
  // marque + modele commercial ("Quatrac", "Scorpion Winter"...) sans
  // jamais le mot "pneu" lui-meme.
  ['auto-moto', ['continental','bridgestone','goodyear','pirelli',
    'dunlop','hankook','yokohama','falken','nexen','vredestein','uniroyal',
    'firestone','kumho','toyo tires','nokian','cooper tires','sailun',
    'landsail','laufenn','ecocontact','premiumcontact','sportcontact',
    'wintercontact','allseasoncontact','primacy','pilot sport','energy saver',
    'eagle f1','efficientgrip','vector 4seasons','cinturato','scorpion',
    'p zero','winter sottozero','ventus','kinergy','dueler','turanza',
    'ecopia','geolandar','wrangler','ice edge','snowmaster','wintrac',
    'quatrac','snow max','winguard','roadian','all season 2','eurowinter',
    'night dragon']],
  ['sport-outdoor', ['tapis de course','velo elliptique','rameur','halteres','kettlebell',
    'banc de musculation','tapis de yoga','raquette de tennis','ballon de football',
    'crampons football','maillot de football','sac de couchage','tente de camping',
    'rechaud camping','baton de randonnee','chaussure de randonnee','combinaison de plongee',
    'planche de surf','ski alpin','snowboard','trottinette electrique','ballon','ballon de basket','ballon de rugby','ballon de handball',
    'raquette','raquette de badminton','raquette de padel','volant de badminton','corde a sauter',
    'tapis de gym','banc abdominaux','barre de traction','elastique de musculation',
    'gourde sport','sac de sport','maillot de bain sport','lunettes de natation','bonnet de bain',
    'palmes','masque de plongee','tuba','gilet de sauvetage','kayak','paddle',
    'velo de route','vtt','velo electrique','casque velo','antivol velo','porte bidon',
    'chaussure de running','chaussure de foot','crampons','protege tibia','gant de boxe',
    'sac de frappe','tapis de sol','swiss ball','roue abdominale','stepper','velo d appartement',
    'chaussure de ski','fixation ski','baton de ski','luge','crampons alpinisme','baudrier',
    'sac a dos randonnee','frontale','rechaud','gourde isotherme','matelas autogonflant',
    'canne a peche','moulinet','leurre','epuisette','carquois','arc','cible']],
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
    'liseuse','barre de son','casque vr','carte mere','alimentation pc','ventirad',
    'apple watch','airpods','galaxy watch','galaxy buds','imac','ipod','apple tv',
    'kindle','liseuse kindle','playstation 5','xbox series','nintendo 3ds',
    'fitbit','disque dur externe','ssd externe','power bank','batterie externe',
    'robot aspirateur','aspirateur robot','enceinte connectee']],
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
  ['mode-vetements', ['chemise homme','chemise femme','pantalon homme','pantalon femme',
    'pull homme','pull femme','veste homme','veste femme','tee shirt homme','tee shirt femme',
    'chaussure homme','chaussure femme','sandale femme','mule','tunique','peignoir','body',
    'combinaison','blouson','parka','doudoune','trench','gilet','cardigan','legging',
    'robe','jean','pantalon','chemise','veste','manteau','pull','sweat',
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
  ['auto-moto', ['auto','moto','voiture','vehicule','scooter','quad','remorque','moteur','r15','r16','r17','r18','casque']],
  ['maison-jardin', ['maison','jardin','deco','meuble','cuisine','salle de bain','bricolage',
    'outil','outillage','jardinage','arrosage','terrasse','piscine','chauffage','luminaire']],
  ['mode-vetements', ['mode','vetement','pret a porter','taille','coton','cuir','laine','denim','manches','col','doublure','fermeture eclair','coupe','slim','regular','oversize']],
  ['beaute-bienetre', ['beaute','soin','creme','serum','cosmetique','parfum','visage','cheveux',
    'peau','maquillage','hydratant','nettoyant','bio']],
  ['sante-nutrition', ['sante','complement','nutrition','minceur','detox','sommeil','immunite','bien etre']],
  ['enfants-bebes', ['enfant','bebe','baby','kids','garcon','fille','puericulture','eveil','ans']],
  ['sport-outdoor', ['sport','fitness','musculation','yoga','running','velo','randonnee','camping',
    'outdoor','trail','ski','tennis','football','natation','entrainement','casque']],
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
/**
 * Score TEXTE SEUL (titre + categorie de flux + description), sans jamais
 * consulter le marchand. Sert a la fois de base pour categorize() et de
 * verification independante dans ean-prefix.js (pour ne pas propager une
 * categorie qui contredirait ce que le produit dit lui-meme de son cote).
 */
export function textSignal(p) {
  const title = norm(p.title);
  const desc  = norm(p.description).slice(0, 300);
  const feed  = norm(p.feedCat);

  for (const [cat, terms] of STRONG) {
    for (const t of terms) if (hasWord(title, t)) return { category: cat, source: 'titre', score: 10 };
  }

  const scores = {};
  const add = src => { for (const k in src) scores[k] = (scores[k] || 0) + src[k]; };
  add(scoreRules(title, WEAK, 3));
  add(scoreRules(feed,  FEED_HINTS, 4));
  add(scoreRules(feed,  WEAK, 2));
  add(scoreRules(desc,  WEAK, 1));

  let best = null, bestScore = 0;
  for (const k in scores) if (scores[k] > bestScore) { bestScore = scores[k]; best = k; }
  return best ? { category: best, source: 'score', score: bestScore } : null;
}

/**
 * Categories dont les boutiques specialisees vendent aussi, en articles
 * d'appel, des produits qui n'ont rien a voir (le cas signale : un Apple
 * Watch vendu par un motoriste, classe "auto-moto" faute de mieux). Pour
 * celles-ci, le repli marchand exige un indice textuel, meme faible.
 */
const RISKY_FALLBACK = new Set(['auto-moto', 'maison-jardin', 'sport-outdoor']);

export function categorize(p) {
  const merchant = norm(p.merchant);
  const isMarketplace = [...MARKETPLACES].some(m => merchant.indexOf(norm(m)) !== -1);

  const sig = textSignal(p);          // 1+2) regle forte, puis score pondere sur le texte seul
  if (sig && sig.score >= 10) return sig;   // regle forte : verdict immediat, le marchand ne rentre pas en jeu

  // 3) Le marchand ne DEPARTAGE que s'il existe deja un indice textuel,
  //    meme faible et ambigu. Sans texte du tout, laisser le marchand
  //    seul decider revient a plaquer sa categorie sur n'importe quel
  //    produit — un chargeur, une montre, un parfum vendu par un
  //    specialiste auto-moto se retrouvait ainsi classe "auto-moto".
  //    Mieux vaut "autres" honnete qu'une categorie fausse avec assurance.
  if (sig && p.merchantCategory && !isMarketplace) {
    const scores = { [sig.category]: sig.score, [p.merchantCategory]: (sig.category === p.merchantCategory ? sig.score : 0) + 4 };
    let best = null, bestScore = 0;
    for (const k in scores) if (scores[k] > bestScore) { bestScore = scores[k]; best = k; }
    if (bestScore >= 3) return { category: best, source: 'score', score: bestScore };
  }

  if (sig && sig.score >= 3) return sig;

  // 4) Repli marchand. Pour les categories "a risque" — celles dont les
  //    boutiques specialisees vendent aussi, en articles d'appel, des
  //    produits sans rapport (gadgets electroniques chez un motoriste,
  //    outillage chez un jardinier...) — on exige un indice textuel, meme
  //    faible. Pour les specialistes purs (un libraire ne vend QUE des
  //    livres), le repli reste inconditionnel : le risque de derive y est
  //    quasi nul, et l'exiger degraderait des classements deja fiables.
  if (p.merchantCategory && !isMarketplace) {
    const risky = RISKY_FALLBACK.has(p.merchantCategory);
    if (!risky || sig) return { category: p.merchantCategory, source: 'marchand', score: 1 };
  }
  return { category: 'autres', source: 'defaut', score: 0 };
}
