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

const PRODUCT_TYPES = [
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

const TYRE_BRANDS = [
  'pneu', 'pneus', 'continental', 'bridgestone', 'goodyear', 'pirelli',
  'dunlop', 'hankook', 'yokohama', 'falken', 'nexen', 'vredestein',
  'uniroyal', 'firestone', 'kumho', 'toyo tires', 'nokian',
];

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
function classifyProductType(title) {
  const t = norm(title);
  if (!t) return 'other';

  const hasGamingPlatform = anyWord(t, GAMING_PLATFORM_TOKENS)
    || t.includes('playstation') || t.includes('nintendo switch');

  // 1) Gaming : console, jeu ou accessoire -- dans cet ordre de priorite.
  if (hasGamingPlatform || /\bconsole\b/.test(t)) {
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
  if (anyWord(t, TYRE_BRANDS)) return 'tyre';
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

  const wantsGame = hasWord(q, 'jeu') || hasWord(q, 'jeux');
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

  return { primaryType, wantsAccessory, wantsGame };
}

export { classifyProductType, parseQueryIntent, PRODUCT_TYPES };
