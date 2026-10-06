// Resolve merchant aliases once, then identify multi-merchant EANs as a set.
// The second merchant keeps the same eligibility rules as the former EXISTS.
export const BRAND_DIRECTORY_SQL = `WITH active_offers AS MATERIALIZED (
  SELECT p.ean, p.brand, p.price, p.program_id,
    COALESCE(ma.merchant_id::text, p.program_id) AS merchant
  FROM products p LEFT JOIN merchant_aliases ma ON ma.raw_program_id = p.program_id
  WHERE p.status = 'enabled' AND p.ean IS NOT NULL
), comparable_eans AS (
  SELECT ean FROM active_offers
  GROUP BY ean HAVING MIN(merchant) <> MAX(merchant)
)
SELECT p.brand, COUNT(DISTINCT p.ean)::int AS products,
  COUNT(DISTINCT p.merchant)::int AS merchants
FROM active_offers p JOIN comparable_eans c ON c.ean = p.ean
WHERE p.price > 0 AND p.brand IS NOT NULL
  AND length(trim(p.brand)) BETWEEN 2 AND 80 AND p.program_id NOT LIKE '%darty%'
GROUP BY p.brand HAVING COUNT(DISTINCT p.ean) >= 2
ORDER BY products DESC, p.brand ASC LIMIT 1000`;
