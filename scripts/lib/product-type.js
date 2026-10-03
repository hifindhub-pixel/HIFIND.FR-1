import { categorize } from './categorize.js';
// api/product-type.js
//
// LOT 1 du cahier des charges : remplace le bricolage specifique a PS5
// (isConsoleTitle, ACCESSORY_WORDS, boost/penalite additifs) par une
// classification generique reutilisable pour n'importe quelle famille de
// produits. Deux fonctions exportees :
//
//   classifyProductType(title) -> le type du PRODUIT (a partir de son titre)
//   parseQueryIntent(query)    -> ce que la RECHERCHE demande
//
// Le classement final compare les deux : un produit ne peut "gagner" une
// recherche generique ("PS5") que si son type correspond exactement au
// type principal demande -- exactement le meme principe que le systeme
// a paliers construit aujourd'hui pour PS5, mais generalise a toute
// famille de produits plutot que code en dur pour une seule.

const LEGACY_TYPES = [
  'smartphone', 'smartphone_accessory', 'console', 'video_game',
  'gaming_accessory', 'headphones', 'computer', 'television', 'perfume',
  'tyre', 'power_tool', 'household_appliance', 'other',
];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasWord(hay, term) {
  return (' ' + hay + ' ').indexOf(' ' + term + ' ') !== -1;
}

function anyWord(hay, terms) {
  return terms.some(t => hasWord(hay, t));
}

// Jetons de plateforme gaming : presents dans un titre, ils indiquent la
// FAMILLE (gaming) mais pas encore le TYPE precis (console, jeu ou
// accessoire) -- c'est le role des regles ci-dessous de trancher.
const GAMING_PLATFORM_TOKENS = [
  'ps5', 'ps4', 'ps3', 'playstation', 'playstation 5', 'playstation 4',
  'xbox', 'xbox one', 'xbox series x', 'xbox series s',
  'nintendo switch', 'switch 2', 'nintendo',
];

const GAMING_ACCESSORY_WORDS = [
  'manette', 'controleur', 'dualsense', 'joystick', 'volant de course',
  'stand de recharge', 'chargeur manette', 'facade', 'coque manette',
];

// "casque" seul est ambigu (moto, audio generique, gaming) -- ne compte
// comme accessoire gaming que combine a un jeton de plateforme.
const GENERIC_ACCESSORY_WORDS = [
  'coque', 'etui', 'housse', 'protection', 'verre trempe', 'film protecteur',
  'chargeur', 'cable', 'adaptateur', 'dock', 'sacoche', 'pochette',
  'bandouliere', 'support', 'batterie externe', 'power bank',
  // Beaucoup de fiches (Apple en tete) restent en anglais meme sur le
  // marche francais : "Silicone Case", "Clear Case", "MagSafe Case".
  // Sans ces equivalents, ces titres ne matchaient aucun mot-accessoire
  // et retombaient a tort sur le type "smartphone" plein, comme si
  // c'etait le telephone lui-meme. Verifie sur donnees reelles (Apple
  // Silicone Case / Clear Case, iPhone 17 Pro / iPhone 16).
  'case', 'cover', 'charger', 'sleeve', 'strap',
  // Categorie d'accessoire non couverte : microphones/objectifs
  // compatibles smartphone, vendus comme accessoire du telephone plutot
  // que comme le telephone lui-meme.
  'microphone', 'micro', 'objectif photo pour smartphone', 'trepied smartphone',
];

/**
 * "console" comme mot entier ne suffit pas : une facade de protection dit
 * aussi "pour console PS5". Distinction par position : si un mot
 * d'accessoire apparait AVANT "console" dans le titre, c'est
 * l'accessoire qui est le sujet reel, pas la console elle-meme.
 * Verifie sur donnees reelles le 09/08 (facade Konix vs pack Sony).
 */
function titleSaysConsoleAsSubject(t) {
  const m = /\bconsole\b/.exec(t);
  if (!m) return false;
  const pos = m.index;
  for (const w of [...GENERIC_ACCESSORY_WORDS, ...GAMING_ACCESSORY_WORDS]) {
    const idx = t.indexOf(w);
    if (idx !== -1 && idx < pos) return false;
  }
  return true;
}

const SMARTPHONE_BRANDS = [
  'iphone', 'galaxy s', 'galaxy a', 'galaxy z', 'galaxy note', 'pixel',
  'redmi', 'poco', 'oneplus', 'xperia', 'honor magic', 'nova',
  'smartphone', 'telephone portable',
];

const PERFUME_WORDS = ['eau de parfum', 'eau de toilette', 'eau de cologne', 'eau fraiche'];

const POWER_TOOL_WORDS = [
  'perceuse', 'visseuse', 'meuleuse', 'scie circulaire', 'ponceuse',
  'tronconneuse', 'debroussailleuse', 'nettoyeur haute pression',
  'taille haie', 'tondeuse a gazon',
];

const HOUSEHOLD_APPLIANCE_WORDS = [
  'lave linge', 'lave vaisselle', 'refrigerateur', 'congelateur',
  'four encastrable', 'micro ondes', 'plaque induction', 'hotte aspirante',
  'cafetiere', 'bouilloire', 'friteuse', 'blender', 'mixeur',
  'aspirateur balai', 'aspirateur traineau',
];

const TELEVISION_WORDS = ['televiseur', 'tv led', 'tv oled', 'tv qled', 'smart tv', 'videoprojecteur'];

const COMPUTER_WORDS = [
  'pc portable', 'ordinateur portable', 'macbook', 'pc de bureau',
  'ordinateur fixe', 'laptop', 'ultrabook',
];

const HEADPHONES_WORDS = [
  'casque audio', 'casque bluetooth', 'ecouteurs', 'airpods', 'earbuds',
  'casque sans fil', 'casque filaire',
];

/**
 * Classe un titre produit dans un product_type. L'ordre des verifications
 * compte : du plus specifique au plus generique, pour qu'un "casque
 * gaming PS5" soit un gaming_accessory et non un headphones generique.
 */
function legacyProductType(title) {
  const t = norm(title);
  if (!t) return 'other';

  const hasGamingPlatform = anyWord(t, GAMING_PLATFORM_TOKENS)
    || t.includes('playstation') || t.includes('nintendo switch');

  // 1) Gaming : console, jeu ou accessoire -- dans cet ordre de priorite.
  if (hasGamingPlatform || /\bconsole de jeux?\b/.test(t)) {
    if (titleSaysConsoleAsSubject(t)) return 'console';
    if (anyWord(t, GAMING_ACCESSORY_WORDS)) return 'gaming_accessory';
    if (hasWord(t, 'casque') && hasGamingPlatform) return 'gaming_accessory';
    if (anyWord(t, GENERIC_ACCESSORY_WORDS) && hasGamingPlatform) return 'gaming_accessory';
    // Jeton de plateforme present, ni console ni accessoire detecte :
    // tres probablement un jeu -- un titre de jeu ne contient presque
    // jamais le mot "jeu" lui-meme, seulement le nom du jeu + la
    // plateforme ("GTA V PS5"). C'est la seule facon fiable de les
    // repérer, faute de liste exhaustive de noms de jeux.
    if (hasGamingPlatform) return 'video_game';
  }

  // 2) Telephonie -- l'accessoire doit etre teste AVANT la marque nue :
  // "coque... compatible avec iPhone 15" contient "iphone" comme marque
  // mentionnee, mais designe un accessoire, pas le telephone lui-meme.
  // Meme piege que "console" pour les accessoires gaming, meme ordre de
  // priorite necessaire.
  const hasPhoneBrand = /\biphone\b|\bgalaxy\b|\bsmartphone\b|\bpixel\b/.test(t)
    || /\bgalaxy\s*[saz]\d/.test(t);   // "galaxy s24" : lettre+numero colles, sans espace
  if (hasPhoneBrand && anyWord(t, GENERIC_ACCESSORY_WORDS)) return 'smartphone_accessory';
  if (anyWord(t, SMARTPHONE_BRANDS) || /\bgalaxy\s*[saz]\d/.test(t)) return 'smartphone';

  // 3) Audio (apres gaming, pour ne pas voler les casques gaming)
  if (anyWord(t, HEADPHONES_WORDS)) return 'headphones';

  // 4) Autres familles, sans ambiguite forte connue
  if (anyWord(t, TELEVISION_WORDS)) return 'television';
  if (anyWord(t, COMPUTER_WORDS)) return 'computer';
  if (anyWord(t, PERFUME_WORDS)) return 'perfume';
  if (/\bpneus?\b|\b\d{3} \d{2} ?[rz] ?\d{2}\b/.test(t)) return 'tyre';
  if (anyWord(t, POWER_TOOL_WORDS)) return 'power_tool';
  if (anyWord(t, HOUSEHOLD_APPLIANCE_WORDS)) return 'household_appliance';

  return 'other';
}

// Type "principal" attendu pour une famille/marque nue, quand la requete
// ne precise pas explicitement un sous-type (accessoire, jeu...).
const FAMILY_PRIMARY_TYPE = [
  [['ps5', 'ps4', 'playstation', 'xbox', 'nintendo switch'], 'console'],
  [['iphone', 'galaxy s', 'galaxy a', 'pixel', 'smartphone'], 'smartphone'],
  [['airpods', 'earbuds'], 'headphones'],
  [['dyson', 'aspirateur'], 'household_appliance'],
  [['macbook', 'pc portable'], 'computer'],
];

/**
 * Analyse une requete de recherche : quel product_type est demande en
 * priorite, et la requete demande-t-elle explicitement un accessoire ou
 * un jeu (auquel cas on ne penalise pas ce type-la).
 */
function parseQueryIntent(query) {
  const q = norm(query);
  if (!q) return { primaryType: null, wantsAccessory: false, wantsGame: false };

  const wantsGame = (hasWord(q, 'jeu') || hasWord(q, 'jeux'))
    && !/\b(jeu de societe|jeux de societe|jeu de cartes|jeu de construction)\b/.test(q);
  const wantsAccessory = anyWord(q, GAMING_ACCESSORY_WORDS)
    || anyWord(q, GENERIC_ACCESSORY_WORDS)
    || (hasWord(q, 'casque') && !wantsGame);

  let primaryType = null;
  if (wantsGame) {
    primaryType = 'video_game';
  } else if (wantsAccessory) {
    // Determine le sous-type d'accessoire vise, pour un tri encore plus
    // precis ("manette PS5" ne doit pas remonter une coque iPhone).
    if (anyWord(q, GAMING_ACCESSORY_WORDS) || (hasWord(q, 'casque') && anyWord(q, GAMING_PLATFORM_TOKENS))) {
      primaryType = 'gaming_accessory';
    } else if (/\biphone\b|\bgalaxy\b|\bsmartphone\b/.test(q)) {
      primaryType = 'smartphone_accessory';
    }
  } else {
    for (const [tokens, type] of FAMILY_PRIMARY_TYPE) {
      if (anyWord(q, tokens)) { primaryType = type; break; }
    }
  }

  if (!primaryType) {
    const type = classifyProductType(query);
    if (type !== 'other') primaryType = type;
  }
  return { primaryType, wantsAccessory, wantsGame };
}




// Additive hierarchy: existing category slugs and product_type identifiers stay valid.
// A type belongs to exactly one family and one existing category.
export const TAXONOMY = {
  smartphone: ['high-tech','telephonie-mobilite','Smartphones'],
  smartphone_accessory: ['high-tech','telephonie-mobilite','Accessoires téléphone'],
  tablet: ['high-tech','telephonie-mobilite','Tablettes'],
  smartwatch: ['high-tech','telephonie-mobilite','Montres connectées'],
  console: ['high-tech','jeux-video-consoles','Consoles'],
  video_game: ['high-tech','jeux-video-consoles','Jeux vidéo'],
  gaming_accessory: ['high-tech','jeux-video-consoles','Accessoires gaming'],
  headphones: ['high-tech','tv-audio-video','Casques et écouteurs'],
  television: ['high-tech','tv-audio-video','Téléviseurs'],
  speaker: ['high-tech','tv-audio-video','Enceintes et barres de son'],
  computer: ['high-tech','informatique-bureau','Ordinateurs'],
  computer_component: ['high-tech','informatique-bureau','Composants et stockage'],
  computer_accessory: ['high-tech','informatique-bureau','Périphériques informatiques'],
  printer: ['high-tech','informatique-bureau','Imprimantes et consommables'],
  camera: ['high-tech','photo-camera','Photo et caméra'],
  perfume: ['beaute-bienetre','beaute-soins','Parfums'],
  skincare: ['beaute-bienetre','beaute-soins','Soins et cosmétiques'],
  tyre: ['auto-moto','pneus-equipement-auto','Pneus'],
  vehicle_equipment: ['auto-moto','pneus-equipement-auto','Équipement auto et moto'],
  power_tool: ['maison-jardin','bricolage','Outillage'],
  household_appliance: ['maison-jardin','electromenager','Électroménager'],
  cleaning_product: ['maison-jardin','entretien-maison','Produits d’entretien'],
  appliance_accessory: ['maison-jardin','electromenager','Accessoires électroménager'],
  furniture: ['maison-jardin','mobilier-decoration','Mobilier et décoration'],
  pet_supplies: ['animaux','animalerie','Alimentation et accessoires animaux'],
  baby_equipment: ['enfants-bebes','puericulture','Puériculture'],
  toy: ['enfants-bebes','jeux-jouets','Jeux et jouets'],
  clothing: ['mode-vetements','vetements-accessoires','Vêtements et accessoires'],
  sports_equipment: ['sport-outdoor','sport-loisirs','Équipement sportif'],
  book: ['livres-bd','livres-bandes-dessinees','Livres et bandes dessinées'],
  health: ['sante-nutrition','sante-nutrition','Santé et nutrition'],
  food: ['alimentation-bio','alimentation','Alimentation'],
};

const TYPE_RULES = [
  ['toy', /\b(action heroes|cascadeurs?)\b(?=.*\b(quad|moto|tremplin)\b)/],
  ['gaming_accessory', /\b(amiibo|support pour manette)\b/],
  ['cleaning_product', /\b(detergent|lessive|nettoyant (pour )?(sol|sols|vitres))\b/],
  ['power_tool', /\b(perforateur|burineur|scie (sabre|circulaire|sauteuse)|perceuse|visseuse|meuleuse|ponceuse)\b/],
  ['appliance_accessory', /\b(sacs?|filtres?|brosses?|accessoires?) (pour )?aspirateur\b/],
  ['furniture', /\b(console (murale|d entree|extensible)|meuble|commode|matelas|sommier|rideau|couette|serre livres)\b/],
  ['household_appliance', /\b(aspirateur|spotclean|crosswave|robot cuisine|robot patissier|lave linge|lave vaisselle|refrigerateur|congelateur|cafetiere|bouilloire|friteuse|blender|mixeur|micro ondes|four encastrable|chauffe eau|ventilateur|climatiseur|radiateur)\b/],
  ['tablet', /\b(ipad|tablette tactile|galaxy tab)\b/],
  ['smartwatch', /\b(apple watch|galaxy watch|montre connectee|bracelet connecte|smart band \d+|forerunner)\b/],
  ['printer', /\b(imprimante|cartouche d encre|toner|kit tambour|ultrachrome)\b/],
  ['computer_component', /\b(ssd|disque dur|carte graphique|carte mere|processeur|ram ddr|alimentation pc|ventirad)\b/],
  ['computer_accessory', /\b(clavier|souris|surface arc mouse|webcam|routeur|cle usb)\b/],
  ['headphones', /\b(ecouteurs|openfit|openrun|open swim|openswim|quietcomfort|soundform|galaxy buds|casque stereo|casque filaire|casque avec micro)\b/],
  ['speaker', /\b(enceinte (bluetooth|connectee)|barre de son)\b/],
  // A specification such as "caméra 200 MP" describes a phone feature,
  // not the product family. Phone subjects must therefore win before the
  // generic camera rule below. Accessories remain more specific still.
  ['smartphone_accessory', /\b(coque|etui|housse|case|cover|verre trempe|film protecteur|protection d ecran)\b(?=.*\b(iphone|galaxy|smartphone|pixel|redmi|poco)\b)/],
  ['smartphone', /\b(smartphone|iphone\s*\d+|galaxy\s*[saz]\d+|(?:google )?pixel\s*\d+|redmi (?:note )?\d+|poco\s*[a-z]*\d+)\b/],
  ['camera', /\b(appareil photo|objectif photo|pellicule|drone|camera|arlo essential)\b/],
  ['baby_equipment', /\b(poussette|biberon|tetine|couche|porte bebe|chaise haute|lit parapluie|siege auto bebe|table a langer)\b/],
];
const CATEGORY_DEFAULT_TYPE = {
  'animaux':'pet_supplies', 'mode-vetements':'clothing', 'sport-outdoor':'sports_equipment',
  'livres-bd':'book', 'sante-nutrition':'health', 'alimentation-bio':'food',
  'auto-moto':'vehicle_equipment', 'beaute-bienetre':'skincare',
};

export const PRODUCT_TYPES = [...new Set([...LEGACY_TYPES, ...Object.keys(TAXONOMY)])];

export function classifyProduct(product = {}) {
  const p = typeof product === 'string' ? {title:product} : product;
  const decision = categorize(p);
  const title = norm(p.title);
  const category = decision.category;
  // Gate every type by the category evidence. A console table, LEGO iPhone,
  // Galaxy watch, or Dunlop tennis racket must never masquerade as hardware/tyres.
  let type = 'other';
  for (const [candidate, pattern] of TYPE_RULES) {
    if (TAXONOMY[candidate][0] === category && pattern.test(title)) { type=candidate; break; }
  }
  if (type === 'other') {
    const candidate = legacyProductType(p.title);
    if (TAXONOMY[candidate]?.[0] === category) type=candidate;
  }
  if (type === 'other') type=CATEGORY_DEFAULT_TYPE[category] || 'other';
  if (type === 'other' && category === 'enfants-bebes' && /\b(lego|playmobil|peluches?|figurines?|poupees?|jouets?|puzzle|montessoribox)\b/.test(title)) type='toy';
  const entry = TAXONOMY[type];
  return {...decision, product_type:type, product_type_label:entry?.[2] || 'Autres types',
    category_family:entry?.[1] || category, category_path:entry ? [category,entry[1],type] : [category],
    classification_version:3};
}

export function classifyProductType(title) { return classifyProduct({title}).product_type; }
export { parseQueryIntent };
