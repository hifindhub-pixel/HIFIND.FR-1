import pkg from 'pg';
const { Pool } = pkg;

const AFFILAE_PROFILE_ID = '69c1bc52b682a8edf3205672';

// ═══════════════════════════════════════════════════════════════
// Pool de connexion créé UNE SEULE FOIS au chargement du module,
// pas à chaque requête. Sur Vercel, une instance serverless "chaude"
// réutilise ce pool entre deux invocations successives — ça évite de
// refaire une poignée de main TCP+TLS complète avec Neon à chaque
// visite, qui était la première cause de lenteur.
//
// max:3 reste prudent sur le plan gratuit Neon (limite de connexions
// simultanées basse) tout en permettant un peu de parallélisme réel.
// ═══════════════════════════════════════════════════════════════
let _pool = null;
export function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.NEON_URL,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return _pool;
}

export function makeTrackingUrl(product) {
  if (!product.url) return '#';
  if (product.program_id && (
    product.program_id.startsWith('effinity_') ||
    product.program_id.startsWith('rakuten_') ||
    product.program_id.startsWith('bcdjeux') ||
    product.program_id.startsWith('awin_') ||
    product.program_id.startsWith('affilae_feed_') ||
    product.program_id.startsWith('cj_')
  )) return product.url;
  if (product.program_id) {
    return 'https://track.affilae.com/' + product.program_id +
           '?ae=' + AFFILAE_PROFILE_ID + '&url=' + encodeURIComponent(product.url);
  }
  return product.url;
}

export function formatRow(p) {
  return {
    ...p,
    programs: p.program_title ? { title: p.program_title, countries: [] } : null,
    tracking_url: makeTrackingUrl(p)
  };
}

const MULTI_VENDOR_WHERE = `
  p.ean IS NOT NULL
  AND p.status = 'enabled'
  AND p.program_id NOT LIKE '%darty%'
  AND EXISTS (
    SELECT 1 FROM products p2
    WHERE p2.ean = p.ean
    AND p2.program_id != p.program_id
    AND p2.status = 'enabled'
  )
`;

const INCOMPATIBLE = {
  'auto-moto': ['beaute-bienetre','mode-vetements','enfants-bebes','alimentation-bio'],
  'beaute-bienetre': ['auto-moto','sport-outdoor'],
  'high-tech': ['auto-moto','beaute-bienetre','alimentation-bio'],
};

function normalizeBrand(b) {
  return String(b || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Filtre les offres d'un meme EAN pour ne garder que celles compatibles
 * avec le produit de reference : categorie non contradictoire (deja en
 * place), et surtout marque non contradictoire. Un EAN mal saisi ou
 * reutilise cote marchand peut faire "matcher" deux produits sans rapport
 * (voir l'audit : une batterie de cuisine remontee en tete de High-Tech).
 * Sans marque renseignee des deux cotes, aucun conflit n'est detectable —
 * on ne filtre alors que sur la categorie.
 */
function filterCompatibleOffers(mainCategory, offers) {
  const excluded = INCOMPATIBLE[mainCategory || ''] || [];
  let filtered = offers.filter(o => !excluded.includes(o.category));

  const brandCounts = new Map();
  filtered.forEach(o => {
    const nb = normalizeBrand(o.brand);
    if (nb) brandCounts.set(nb, (brandCounts.get(nb) || 0) + 1);
  });
  if (brandCounts.size > 1) {
    let refBrand = null, refCount = 0;
    for (const [b, n] of brandCounts) if (n > refCount) { refBrand = b; refCount = n; }
    filtered = filtered.filter(o => {
      const nb = normalizeBrand(o.brand);
      return !nb || nb === refBrand;
    });
  }
  return filtered;
}

export async function getEanOffers(client, ean, mainCategory) {
  const r = await client.query(`
    SELECT DISTINCT ON (p.program_id) p.*, pr.title as program_title
    FROM products p
    LEFT JOIN programs pr ON p.program_id = pr.id
    WHERE p.ean = $1 AND p.status = 'enabled'
    AND p.program_id NOT LIKE '%darty%'
    ORDER BY p.program_id, p.price ASC
  `, [ean]);
  const rows = filterCompatibleOffers(mainCategory, r.rows.map(formatRow));
  rows.sort((a,b) => (parseFloat(a.price)||0) - (parseFloat(b.price)||0));
  return rows;
}

// Récupère toutes les offres pour une liste d'EANs en UNE SEULE requête
async function getAllOffersForEans(client, eans) {
  if (!eans.length) return new Map();
  const r = await client.query(`
    SELECT DISTINCT ON (p.ean, p.program_id) p.*, pr.title as program_title
    FROM products p
    LEFT JOIN programs pr ON p.program_id = pr.id
    WHERE p.ean = ANY($1) AND p.status = 'enabled'
    AND p.program_id NOT LIKE '%darty%'
    ORDER BY p.ean, p.program_id, p.price ASC
  `, [eans]);

  const byEan = new Map();
  for (const row of r.rows) {
    const formatted = formatRow(row);
    if (!byEan.has(row.ean)) byEan.set(row.ean, []);
    byEan.get(row.ean).push(formatted);
  }
  for (const offers of byEan.values()) {
    offers.sort((a,b) => (parseFloat(a.price)||0) - (parseFloat(b.price)||0));
  }
  return byEan;
}

async function groupWithOffers(client, products) {
  const eans = [...new Set(products.map(p => p.ean).filter(Boolean))];
  const offersByEan = await getAllOffersForEans(client, eans);

  const eanMap = new Map();
  for (const p of products) {
    const key = p.ean || p.id;
    if (eanMap.has(key)) continue;
    const offers = offersByEan.get(p.ean) || [];

    const filtered = filterCompatibleOffers(p.category, offers);
    const distinctVendors = [...new Set(filtered.map(o => o.program_id))];
    if (distinctVendors.length < 2) continue;

    const best = filtered[0];
    eanMap.set(key, {
      ...best,
      price: best.price,
      ean_offers: filtered,
      offers_count: distinctVendors.length
    });
  }
  return Array.from(eanMap.values());
}

/**
 * Compte le nombre total d'EAN distincts correspondant au filtre, pour
 * construire une vraie pagination ("page 3 sur 47"). Requête légère :
 * juste un COUNT sur des EAN déjà indexés, pas de récupération de lignes.
 */
const ACCESSORY_WORDS = [
  'coque','etui','housse','protection','film','verre trempe','support',
  'cable','chargeur','adaptateur','dock','sacoche','pochette','bandouliere',
  'chargeur voiture','batterie externe','power bank','cordon',
  // Peripheriques gaming : leur titre contient presque toujours le mot-type
  // ("Manette DualSense PS5", "Casque Gaming PS5"), contrairement aux jeux
  // dont le titre ne contient jamais le mot "jeu" -- seulement le nom propre
  // du jeu. Meme mecanisme que les accessoires, meme fiabilite de detection.
  'manette', 'controleur', 'volant de course', 'stand de recharge',
];

function isAccessoryTitle(title) {
  const t = String(title || '').toLowerCase();
  return ACCESSORY_WORDS.some(w => t.includes(w));
}

/**
 * Construit une requete tsquery a partir de la saisie utilisateur : chaque
 * mot devient un prefixe (ex. "iphon:*") pour matcher une saisie partielle,
 * les mots sont combines en ET logique.
 */
function buildTsQuery(q) {
  return q.trim().split(/\s+/).filter(Boolean)
    .map(w => w.replace(/[^\p{L}\p{N}]/gu, '') + ':*')
    .filter(w => w !== ':*')
    .join(' & ');
}

async function countDistinctEans(client, whereSql, params) {
  const r = await client.query(`
    SELECT COUNT(DISTINCT p.ean) AS total
    FROM products p
    WHERE ${whereSql}
  `, params);
  return parseInt(r.rows[0]?.total || '0', 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action='list', q='', limit='30', page='1', id='', cat='' } = req.query;
  const limitN = Math.min(parseInt(limit)||30, 100);
  const pageN = Math.max(parseInt(page)||1, 1);
  const offset = (pageN - 1) * limitN;

  const pool = getPool();
  const client = await pool.connect();

  try {
    let rows = [];
    let total = null;
    let searchMeta = {};

    if (action === 'search' && q) {
      const tsQuery = buildTsQuery(q);
      // Requete a mots-vides uniquement (ex: "de", "le") -> repli simple
      const hasQuery = tsQuery.length > 0;

      let r, totalCount;
      if (hasQuery) {
        const searchWhere = MULTI_VENDOR_WHERE;
        [r, totalCount] = await Promise.all([
          client.query(`
            WITH matched AS (
              SELECT DISTINCT ON (p.ean) p.*, pr.title as program_title,
                ts_rank(p.search_vector, query) AS rank,
                similarity(p.title, $1) AS trgm_sim
              FROM products p
              LEFT JOIN programs pr ON p.program_id = pr.id,
              to_tsquery('french', $2) query
              WHERE ${searchWhere}
              AND (p.search_vector @@ query OR p.title % $1)
              ORDER BY p.ean, ts_rank(p.search_vector, query) DESC, p.price ASC
            )
            SELECT * FROM matched
            ORDER BY rank DESC, trgm_sim DESC
            LIMIT $3 OFFSET $4
          `, [q, tsQuery, limitN * 4, offset]),
          client.query(`
            SELECT COUNT(DISTINCT p.ean) AS total
            FROM products p, to_tsquery('french', $2) query
            WHERE ${MULTI_VENDOR_WHERE}
            AND (p.search_vector @@ query OR p.title % $1)
          `, [q, tsQuery]).then(res => parseInt(res.rows[0]?.total || '0', 10)),
        ]);
      } else {
        r = { rows: [] };
        totalCount = 0;
      }
      total = totalCount;

      if (r.rows.length > 0) {
        // Penalite (pas exclusion) pour les accessoires quand la recherche
        // elle-meme n'en demande pas : "iPhone 15" ne doit pas faire
        // remonter une coque avant un vrai telephone, sans pour autant
        // cacher les coques a qui les cherche explicitement.
        const queryWantsAccessory = isAccessoryTitle(q);

        // Boost (pas penalite sur les jeux, indetectables par mot-cle --
        // "GTA V" ne contient jamais le mot "jeu") pour la console
        // elle-meme quand la recherche est nue ("PS5", pas "manette PS5").
        // Verifie sur 40 titres reels : "console" apparait litteralement
        // sur les deux seules vraies consoles de l'echantillon, jamais
        // ailleurs -- signal fiable, contrairement a "edition standard"
        // ou la capacite de stockage, qui apparaissent aussi sur des jeux.
        const isConsoleTitle = t => /\bconsole\b/i.test(t || '');
        const queryIsBarePlatform = !queryWantsAccessory;

        const ranked = r.rows.map(row => ({
          row,
          score: parseFloat(row.rank) + parseFloat(row.trgm_sim || 0)
                 - (!queryWantsAccessory && isAccessoryTitle(row.title) ? 0.5 : 0)
                 + (queryIsBarePlatform && isConsoleTitle(row.title) ? 0.8 : 0),
        })).sort((a, b) => b.score - a.score).map(x => x.row);

        // Diagnostic temporaire : &debug=1 dans l'URL renvoie le detail du
        // calcul de score pour les 15 premiers candidats, AVANT le
        // regroupement par EAN. Ne s'active que sur demande explicite,
        // aucun effet sur la reponse normale.
        if (req.query.debug === '1') {
          searchMeta.debug = r.rows.slice(0, 15).map(row => ({
            title: row.title,
            ean: row.ean,
            program_id: row.program_id,
            rank: parseFloat(row.rank),
            trgm_sim: parseFloat(row.trgm_sim || 0),
            isAccessory: isAccessoryTitle(row.title),
            isConsole: isConsoleTitle(row.title),
            finalScore: parseFloat(row.rank) + parseFloat(row.trgm_sim || 0)
                        - (!queryWantsAccessory && isAccessoryTitle(row.title) ? 0.5 : 0)
                        + (queryIsBarePlatform && isConsoleTitle(row.title) ? 0.8 : 0),
          }));
          searchMeta.totalCandidatesFetched = r.rows.length;
        }

        rows = await groupWithOffers(client, ranked);
        rows = rows.slice(0, limitN);

        // La penalite fait descendre les accessoires, mais s'il n'existe
        // simplement AUCUN produit principal compare a 3 marchands ou
        // plus, ils restent les seuls resultats disponibles -- ce n'est
        // pas la meme chose que "le produit principal existe et gagne".
        // Le signaler explicitement evite de laisser croire qu'une coque
        // EST la reponse a "iPhone 15".
        searchMeta.allAccessories = !queryWantsAccessory
          && rows.length > 0
          && rows.every(p => isAccessoryTitle(p.title));
      } else {
        const term = '%' + q + '%';
        const r2 = await client.query(`
          SELECT p.*, pr.title as program_title
          FROM products p LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE p.status = 'enabled'
          AND p.program_id NOT LIKE '%darty%'
          AND (p.title ILIKE $1 OR p.brand ILIKE $1)
          ORDER BY p.updated_at DESC LIMIT $2
        `, [term, limitN]);
        rows = r2.rows.map(p => ({...formatRow(p), ean_offers: null, offers_count: 1}));
        total = rows.length;
      }

    } else if (action === 'merchants') {
      // Liste complete des marchands actifs, independante de l'echantillon
      // affiche en page d'accueil — pour la bande defilante notamment.
      const r = await client.query(`
        SELECT DISTINCT pr.title
        FROM products p
        JOIN programs pr ON p.program_id = pr.id
        WHERE p.status = 'enabled'
        AND p.program_id NOT LIKE '%darty%'
        AND pr.title IS NOT NULL
        ORDER BY pr.title
      `);
      rows = r.rows.map(row => ({ title: row.title }));
      total = rows.length;

    } else if (action === 'product' && id) {
      const r = await client.query(`
        SELECT p.*, pr.title as program_title FROM products p
        LEFT JOIN programs pr ON p.program_id = pr.id
        WHERE p.id = $1 LIMIT 1
      `, [id]);
      if (r.rows.length > 0) {
        const product = formatRow(r.rows[0]);
        if (product.ean) {
          const offers = await getEanOffers(client, product.ean, product.category);
          product.ean_offers = offers;
          product.offers_count = offers.length;
        }
        rows = [product];
      }

    } else if (action === 'category' && cat) {
      const catWhere = MULTI_VENDOR_WHERE + ' AND p.category = $1';

      const [r, totalCount] = await Promise.all([
        client.query(`
          SELECT DISTINCT ON (p.ean) p.*, pr.title as program_title
          FROM products p
          LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE ${catWhere}
          ORDER BY p.ean, p.price ASC
          LIMIT $2 OFFSET $3
        `, [cat, limitN * 3, offset]),
        countDistinctEans(client, catWhere, [cat]),
      ]);
      total = totalCount;

      if (r.rows.length > 0) {
        rows = await groupWithOffers(client, r.rows);
        rows = rows.slice(0, limitN);
      } else {
        const r2 = await client.query(`
          SELECT p.*, pr.title as program_title FROM products p
          LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE p.status = 'enabled'
          AND p.program_id NOT LIKE '%darty%'
          AND p.category = $1
          ORDER BY p.updated_at DESC LIMIT $2 OFFSET $3
        `, [cat, limitN, offset]);
        rows = r2.rows.map(p => ({...formatRow(p), ean_offers: null, offers_count: 1}));
        total = rows.length;
      }

    } else {
      // HOME : sélection équilibrée par catégorie, TOUT en parallèle.
      // Avant : 7 categories x 2 requêtes chacune, l'une après l'autre
      // (jusqu'à 14 allers-retours séquentiels). Maintenant : les 7
      // premières requêtes partent en même temps, puis UNE SEULE requête
      // d'offres pour l'ensemble des produits collectés.
      const CATS = [
        { cat: 'beaute-bienetre', n: 8 },
        { cat: 'auto-moto',       n: 6 },
        { cat: 'high-tech',       n: 5 },
        { cat: 'sport-outdoor',   n: 4 },
        { cat: 'mode-vetements',  n: 3 },
        { cat: 'enfants-bebes',   n: 2 },
        { cat: 'maison-jardin',   n: 2 },
      ];

      const perCatResults = await Promise.all(CATS.map(({ cat, n }) =>
        client.query(`
          SELECT DISTINCT ON (p.ean) p.*, pr.title as program_title
          FROM products p
          LEFT JOIN programs pr ON p.program_id = pr.id
          WHERE ${MULTI_VENDOR_WHERE}
          AND p.category = $1
          ORDER BY p.ean, p.price ASC
          LIMIT $2
        `, [cat, n * 3])
      ));

      // Une seule requête d'offres pour TOUS les candidats de toutes
      // les catégories, au lieu d'une par catégorie.
      const allCandidates = perCatResults.flatMap(r => r.rows);
      const grouped = await groupWithOffers(client, allCandidates);

      // Re-répartit par catégorie pour respecter le nombre voulu par
      // section (n), puis mélange chaque section indépendamment.
      const byCat = new Map();
      for (const p of grouped) {
        if (!byCat.has(p.category)) byCat.set(p.category, []);
        byCat.get(p.category).push(p);
      }
      const allRows = [];
      for (const { cat, n } of CATS) {
        const list = (byCat.get(cat) || []).sort(() => Math.random() - 0.5);
        allRows.push(...list.slice(0, n));
      }

      rows = allRows.sort(() => Math.random() - 0.5).slice(0, limitN);
      total = rows.length;
    }

    const pages = total != null ? Math.max(1, Math.ceil(total / limitN)) : null;
    return res.status(200).json({
      data: rows,
      count: rows.length,
      total,
      page: pageN,
      pages,
      limit: limitN,
      meta: searchMeta,
    });

  } catch(err) {
    console.error('API error:', err.message);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  } finally {
    client.release();   // rend la connexion au pool, ne la ferme pas
  }
}
