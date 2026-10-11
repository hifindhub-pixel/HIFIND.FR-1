# Moto Axxe / Maxxess source identity audit — 2026-10-11

Read-only source audit: GitHub Actions run 38136675211. Both configured
Effinity feeds downloaded completely: Moto Axxe 17,401 rows and Maxxess
16,572 rows. The feeds have zero common GTIN values, including after
zero-padding, despite 12,452 common manufacturer references (MPN).
Neither feed shares a GTIN with the audited Speedway catalogue.

Examples of matching brand/MPN and conflicting GTIN:

| Brand | MPN | Moto Axxe GTIN | Maxxess GTIN |
|---|---|---|---|
| ZARCO | ECH-Z519 | 3000057112043 | 3000177415918 |
| LS2 | 509001007 | 3000057112401 | 3000177416397 |
| LS2 | 404362011 | 3000057112760 | 3000177416274 |

These examples have matching titles (word order differs) and matching
colours where supplied, but the size field is empty. MPN alone is not
enough to establish an exact sellable variant or invent a replacement GTIN.

Two existing comparisons are positively incorrect:

| GTIN | Moto Axxe product | Rue du Commerce product |
|---|---|---|
| 3000057241538 | BERING Gants KX 2 | Helloshop26 Rampe d'accès pour chien - Noir |
| 3000058301538 | ALPINESTARS Pantalon Cross FLUID APEX | Helloshop26 Rampe télescopique pour chien - 121,5 à 213,5 cm |

`quarantine-moto-collisions.js` disables only the Moto Axxe rows for those
two codes. It preserves every other merchant and does not refresh prices.
`untrusted-feed-identities.js` blocks future harvesting from the two
audited feeds until their source GTINs are corrected or exact variant
identities can be independently validated. The sync report lists this as
a source failure; neither merchant is classified as a closed programme.

Required source correction: ask Effinity/the merchants for manufacturer
GTINs per sellable variant (including size and colour), rather than
merchant-local identifiers in the GTIN field. After a new complete audit,
remove the appropriate guard and import only validated comparisons.

Follow-up on CJ: the October 10 and 11 syncs fully read Notino and Ugreen.
At this audit, Notino had 4,699 active offers and Ugreen 63; neither had
active offers older than seven days. The 134 previously stale offers are
therefore no longer an active freshness issue, after normal catalogue
selection and stale-offer cleanup. This does not imply all were refreshed.

Other open monitoring item on October 11: Un Amour de Tapis fell from
353 to 65 selected active offers. The overall storage cap is 180,000
selected offers; this merchant's decline still needs a separate diagnosis.
