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

const norm = s => String(s ?? '')
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
    'robot aspirateur','aspirateur robot','enceinte connectee',
    // Abreviations de plateformes : "playstation 5" est deja liste, mais
    // c'est "ps5" qui apparait dans l'ecrasante majorite des vrais titres
    // marchand ("GTA V PS5", "Rockstar Games Grand Theft Auto V - Neuf"
    // n'a MEME PAS "PS5" mais releve du meme manque general). Sans ces
    // abreviations, un titre de jeu video ne matchait litteralement
    // aucun mot des trois listes et retombait sur "autres" faute de
    // tout signal exploitable -- pas une erreur de classement, une
    // absence totale de signal.
    'ps5','ps4','xbox one','xbox series x','xbox series s']],
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
  ['mode-vetements', ['mode','vetement','bijoux','broche','pret a porter','taille','coton','cuir','laine','denim','manches','col','doublure','fermeture eclair','coupe','slim','regular','oversize']],
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
/**
 * Certains mots-cles STRONG sont de vrais mots entiers dans des titres
 * sans rapport avec la categorie visee -- "auto" est a la fois une piece
 * automobile ET un mot entier de "Grand Theft Auto". Aucune limite de
 * mot ne peut lever cette ambiguite seule : on neutralise les collisions
 * CONNUES avant le matching, plutot que de retirer le mot-cle des regles
 * STRONG (ce qui degraderait la vraie detection auto-moto partout ailleurs).
 */
const KNOWN_AMBIGUOUS_PHRASES = [
  { phrase: 'grand theft auto', strip: 'auto' },
];

function stripKnownAmbiguity(title) {
  let t = title;
  for (const { phrase, strip } of KNOWN_AMBIGUOUS_PHRASES) {
    if (t.includes(phrase)) {
      t = (' ' + t + ' ').split(' ' + strip + ' ').join(' ').trim();
    }
  }
  return t;
}

// V2: precise product types first; longest title evidence beats generic words.
// A brand, a description ingredient, or the merchant must not decide alone.
const AMBIGUOUS = new Set(['bridgestone','goodyear','pirelli','hankook','yokohama','falken','nexen','vredestein','uniroyal','firestone','kumho','toyo tires','nokian','cooper tires','sailun','landsail','laufenn','ballon','arc','cible','tome','integrale','roman','livre','livres','edition collector','album','poche','broche','essai','one shot','strip','foret','niche','scorpion','wrangler','continental','dunlop','frontale','rechaud','tapis de sol','pince','meche','cheville','store','body','combinaison','mule','couche','console','veilleuse','collagene','miel','the vert','riz','pates','sirop']);
const TYPES = [
  ['high-tech', /\b(bracelet connecte|smart band \d+|galaxy (?:[saz]\d+|tab|watch|buds)|(?:google )?pixel \d+|redmi (?:note )?\d+|ecouteurs|openfit|openrun|open swim|openswim|soundform|forerunner|ps5|ps4|xbox|jeu (nintendo|video)|drone miniature|casque stereo|casque filaire|casque avec micro)\b/],
  ['maison-jardin', /\b(reveil|compresseur sans fil)\b/],

  ['auto-moto', /\b(desodorisant voiture|parfum (pour )?voiture|booster de demarrage|anti fuite metallique pour radiateur|chargeur de batterie (de )?voiture)\b/],
  ['maison-jardin', /\b(colle a bois|porte outils|bague de (copie|copiage)|commode|absorbeur d humidite|deshumidificateur|parfum d interieur|concentre de parfum|sachets armoire|parfum d ambiance)\b/],
  ['high-tech', /\b(support pour (manette|smartphone)|pour switch [12])\b/],
  ['enfants-bebes', /\b(mamontessoribox|montessoribox|lego|couche culotte|pampers|sylvanian|jouet a tirer|jouet (de )?premier age|jouet bebe|atelier de bijoux|veilleuse musicale|matelas pour berceau)\b/],
  ['mode-vetements', /\b(valise|bagage)\b/],

  ['maison-jardin', /\bserre livres\b/],
  ['mode-vetements', /\b(sac banane|sac a dos scolaire)\b/],
  ['enfants-bebes', /\b(peluche|figurine|jouet|miniature|newray|maquette|poupee|poupees|barbie|beanie boo s|melissa doug|melissa et doug|livre (de coloriage|d activite)|coffret coloriage|lego|playmobil|puzzle|doudou|poussette|biberon|tetine|siege auto bebe|jeu de societe|jeu de cartes|circuit de voiture)\b/],
  ['animaux', /\b(croquettes?|litiere|griffoir|arbre a chat|aquarium|terrarium|gamelle|laisse|harnais (pour )?(chien|chat)|jouet (pour )?(chien|chat)|shampooing (pour )?(chien|chat))\b/],
  ['maison-jardin', /\b(ballon ((d )?eau chaude|thermodynamique)|chauffe eau|console (murale|d entree|extensible)|robot aspirateur|aspirateur robot|nettoyeur detacheur|spotclean|crosswave|detergent|filtre (a|de) sable|pince a linge|cheville (molly|nylon)|store enrouleur)\b/],
  ['beaute-bienetre', /\b(creme (pour le |de |du )?(corps|visage|mains|nuit|jour)|creme hydratante|body (cream|lotion|milk)|eau de (parfum|toilette|cologne)|parfum|mascara|rouge a levres|fond de teint|serum visage|baume levres|soin levres|phyto ombres|lotion (exfoliante|clarifiante)|gel de teint|gommage|scrub|creme a raser|demaquillant|demaquillants|baume demaquillant|contour des yeux|soin total regard|savon visage|shampooing|shampoing|deodorant|gel douche|pince a epiler|meches (de cheveux|extensions))\b/],
  ['sante-nutrition', /\b(complement alimentaire|gelules?|comprimes?|pansements?|tensiometre|thermometre medical|chevillere|attelle|lentilles de contact)\b/],
  ['high-tech', /\b(ps5|ps4|playstation|xbox|nintendo|jeu video|smartphone|iphone|ipad|macbook|apple watch|galaxy watch|montre connectee|casque (audio|bluetooth|vr)|camera (de securite|de surveillance)|cartouche d encre|toner|quietcomfort|surface arc mouse|arlo essential|ultrachrome|pellicule|kit tambour)\b/],
  ['sport-outdoor', /\b(trottinette electrique|pneu (de |pour )?(velo|vtt)|casque (de )?(velo|ski|equitation)|chaussures? (de )?(running|football|randonnee|trail|ski)|sac a dos football|maillot (de )?(football|rugby|cyclisme)|ballon (de )?(football|basket|rugby|handball|volley)|raquette|vtt|velo (electrique|de route)|tapis de (yoga|course))\b/],
  ['auto-moto', /\b(casque (moto|integral|jet)|blouson moto|gants? moto|pneus?|plaquettes? de frein|huile moteur|filtre a huile|essuie glace|amortisseur|embrayage|revue technique)\b/],
];

function ranked(scores, source, minimum = 6, margin = 3) {
  const entries = Object.entries(scores).sort((a,b) => b[1]-a[1]);
  if (!entries.length || entries[0][1] < minimum || (entries[1] && entries[0][1]-entries[1][1] < margin)) return null;
  return { category: entries[0][0], source, score: entries[0][1] };
}

// Explicit product subjects outrank model names, compatible devices and brands.
// Each override is named so import audits can explain the decision.
const SUBJECT_RULES = [
  {id:'sujet-accessoire-gaming', category:'high-tech', pattern:/\b(amiibo|support pour (manette|smartphone))\b/},
  {id:'sujet-jeu-lego', category:'high-tech', pattern:/\blego\b(?=.*\b(ps[345]|xbox|jeu video)\b)(?!.*\b(\d{5}|pieces|construction|console|figurines?|jouet)\b)/},
  {id:'sujet-jouet', category:'enfants-bebes', pattern:/\b(lego|playmobil|peluches?|poupees?|maquettes?|figurines?|puzzles?)\b(?!.*\bserre livres\b)/},
  {id:'sujet-jouet-lego', category:'enfants-bebes', pattern:/\blego\b/},
  {id:'sujet-outillage', category:'maison-jardin', pattern:/\b(perforateur|burineur|scie (sabre|circulaire|sauteuse)|perceuse|visseuse|meuleuse|ponceuse)\b/},
  {id:'sujet-mobilier', category:'maison-jardin', pattern:/\b(meuble (pour )?(tv|television)|support mural (pour )?(tv|televiseur)|console (murale|d entree|extensible))\b/},
  {id:'sujet-cyclisme', category:'sport-outdoor', pattern:/\bpneus? (de |pour )?(velo|vtt|bicyclette)\b/},
  {id:'sujet-animal', category:'animaux', pattern:/\b(jouet|shampooing|shampoing|harnais|collier|panier) (pour (les? )?)?(chien|chat|chiot|chaton)\b/},
  {id:'sujet-entretien', category:'maison-jardin', pattern:/\b(detergent|lessive|nettoyant (pour )?(sol|sols|vitres)|sac (pour )?aspirateur|filtre (pour )?aspirateur)\b/},
  {id:'sujet-interieur', category:'maison-jardin', pattern:/\b(parfum d (interieur|ambiance)|bougie parfumee)\b/},
  {id:'sujet-auto', category:'auto-moto', pattern:/\b(desodorisant voiture|parfum (pour )?voiture|chargeur de batterie (de )?voiture)\b/},
];

export function textSignal(p = {}) {
  const title = stripKnownAmbiguity(norm(p.title));
  // ISBN is a book identifier, unlike a generic manufacturer prefix.
  const ean = String(p.ean || '').trim();
  if (/^97[89]\d{10}$/.test(ean) && [...ean].reduce((sum,d,i)=>sum+Number(d)*(i%2?3:1),0)%10===0)
    return {category:'livres-bd',source:'isbn',score:40};
  const subject = SUBJECT_RULES.find(rule => rule.pattern.test(title) &&
    !(rule.id === 'sujet-animal' && /\b(premier age|bebe|a tirer|boite a musique)\b/.test(title)));
  if (subject) return { category:subject.category, source:subject.id, score:35 };
  if (/\b\d{3} \d{2} ?[rz] ?\d{2}\b/.test(title)) return {category:'auto-moto',source:'dimension-pneu',score:30};
  if (/\b(tome|vol) \d+\b/.test(title) && !/\b(mascara|parfum|serum|shampooing)\b/.test(title))
    return {category:'livres-bd',source:'volume-livre',score:30};
  // Explicit animal destination, not an animal character in a children's toy.
  if (/\b(jouet|shampooing|shampoing|harnais|collier|panier) (pour (les? )?)?(chien|chat|chiot|chaton)\b/.test(title) && !/\b(peluche|poupee|premier age|bebe|a tirer|boite a musique)\b/.test(title))
    return { category:'animaux', source:'type-produit', score:30 };
  for (const [category, pattern] of TYPES) {
    if (pattern.test(title)) return { category, source:'type-produit', score:30 };
  }
  const scores = {};
  for (const [category, terms] of STRONG) {
    for (const term of terms) {
      if (!AMBIGUOUS.has(term) && hasWord(title, term)) {
        // Max instead of sum: repeated synonyms cannot overwhelm a precise phrase.
        scores[category] = Math.max(scores[category] || 0, 8 + term.split(' ').length * 3);
      }
    }
  }
  const exact = ranked(scores, 'titre', 11, 3);
  if (exact) return exact;
  // Prefer the deepest merchant taxonomy segment, never a broad parent such as "enfants".
  const segments = String(p.feedCat || '').split(/[>|/\\;]+/).reverse();
  for (const segment of segments) {
    const feed = norm(segment);
    const category = CATEGORIES.find(c => norm(c) === feed);
    if (category && category !== 'autres') return { category, source:'categorie-flux', score:12 };
    const hit = ranked(scoreRules(feed, FEED_HINTS, 6), 'categorie-flux', 6, 3);
    if (hit) return hit;
  }
  const weak = scoreRules(title, WEAK, 3);
  // Description only corroborates a category already present in the title.
  const desc = scoreRules(norm(p.description).slice(0,600), WEAK, 1);
  for (const cat in weak) weak[cat] += Math.min(desc[cat] || 0, 2);
  return ranked(weak, 'indices-titre', 6, 3);
}

export function categorize(p = {}) {
  const signal = textSignal(p);
  // No automatic merchant/brand/EAN fallback: uncertain references remain unclassified.
  return signal || { category:'autres', source:'a-verifier', score:0 };
}

