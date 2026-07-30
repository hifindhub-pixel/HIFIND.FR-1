# HiFind — contexte projet

Comparateur de prix français (hifind.fr). Projet solo, bootstrappé, budget serré.

## Principe métier

On agrège des flux produits de marchands via des réseaux d'affiliation, puis on
rapproche les offres **par code-barres EAN**. Un produit n'a de valeur pour le site
que s'il est vendu par **au moins deux marchands distincts** — sinon il n'y a rien à
comparer. Tout le reste est supprimé à chaque sync.

## Stack

| Élément | Détail |
|---|---|
| Front | `index.html` — un seul fichier, vanilla JS, pas de build |
| API | `api/products.js`, `api/flights.js` — fonctions serverless Vercel |
| Base | Neon PostgreSQL — **plan gratuit, plafond 512 Mo** |
| Sync | `scripts/sync.js` via GitHub Actions (`.github/workflows/sync.yml`) |
| Découverte | `scripts/discover-feeds.js` (`.github/workflows/discover-feeds.yml`) |

## Réseaux d'affiliation

- **Effinity** — ~80 flux CSV, secret `EFFINITY_FEEDS` (JSON : name, url, category, limit)
- **Awin** — ~15 flux CSV gzip, secret `AWIN_FEEDS`
- **Affilae** — 6 flux CSV/XML, secret `AFFILAE_FEEDS`
- **CJ** — API GraphQL `ads.api.cj.com`, secrets `CJ_TOKEN`, `CJ_PUBLISHER_ID`, `CJ_FEEDS`
- **Rakuten** — API directe par mots-clés

Les liens de flux **expirent régulièrement** côté plateforme. Un 400/404/500 sur un
flux ne se corrige pas dans le code : il faut régénérer le lien sur la plateforme.
C'est une action humaine.

## Contraintes dures

1. **Neon 512 Mo.** Le sync nettoie les mono-vendeurs après chaque réseau
   (`cleanupMonoVendors`). Ne pas retirer ces appels : sans eux le sync sature
   la base en cours de route et échoue.
2. **Certains flux dépassent 400 Mo.** Le décodage en une seule chaîne JS fait
   planter V8 (`FATAL ERROR: v8::ToLocalChecked Empty MaybeLocal`). Traiter en
   streaming, pas en `Buffer.toString()` global.
3. **Aucun timeout réseau actuellement.** Un marchand qui ne répond plus bloque
   le job jusqu'au `timeout-minutes` du workflow et fait perdre tout le run.
4. Les prix HT sont à exclure (c'était le cas de Darty Pro, retiré).

## Pièges déjà rencontrés

- **Noms de marchands splittés.** Awin oblige à découper certains gros flux en
  plusieurs entrées (`Rakuten FR1/FR2/FR3`, `Rue du Commerce A/C`,
  `AliExpress A/B/C`). Ils doivent partager le **même `program_id`**, sinon ils
  matchent entre eux et le site affiche « 2 marchands » pour un seul vendeur.
  Voir `feedDisplayName` dans `syncAwin`.
- **Matchings cross-catégorie.** Des EAN identiques apparaissent parfois sur des
  produits sans rapport (une pièce moto et un parfum). Filtré via `INCOMPATIBLE`
  dans `api/products.js`.
- **Variantes du même vendeur.** Un marchand liste le même produit en plusieurs
  tailles/couleurs avec le même EAN. Dédupliqué par `program_id` en gardant le
  prix le plus bas.
- **Encodage.** Les flux Effinity sont tantôt UTF-8, tantôt ISO-8859-1, sans
  déclaration fiable. `TextDecoder` plante sur les gros volumes.

## Conventions

- Commits en conventional commits : `fix(sync): ...`, `feat(api): ...`
- Toujours `node --check scripts/sync.js` avant de committer
- Ne jamais committer de clé API en dur, même une clé publique
- Le design du front a été validé par le propriétaire : **ne pas le refondre**
  sans demande explicite

## Diagnostic

```bash
# Dernier run du sync
gh run list --workflow="Sync Products" --limit 3
gh run view <id> --log | tail -100

# Taille de la base
psql "$NEON_URL" -c "SELECT pg_size_pretty(pg_total_relation_size('products'));"

# Matchings par catégorie
psql "$NEON_URL" -c "
SELECT category, COUNT(DISTINCT p.ean) AS matchings
FROM products p
WHERE p.ean IS NOT NULL
  AND EXISTS (SELECT 1 FROM products p2
              WHERE p2.ean = p.ean AND p2.program_id <> p.program_id)
GROUP BY category ORDER BY matchings DESC;"
```
