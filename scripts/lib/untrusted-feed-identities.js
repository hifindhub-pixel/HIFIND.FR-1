// Source audit 2026-10-11: Moto Axxe and Maxxess expose disjoint GTINs for
// 12,452 shared manufacturer references. Two Moto Axxe codes also collide
// with unrelated dog ramps. Do not treat these feed identifiers as GTINs.
// Re-enable only after corrected source identifiers or validated variant
// mapping is available. These merchants are NOT closed programmes.
export const UNTRUSTED_FEED_IDENTITIES = Object.freeze({
  effinity_moto_axxe: 'GTIN source non fiables : collisions entre produits incompatibles',
  effinity_maxxess: 'GTIN source non concordants avec les références fabricant communes',
});

export const untrustedFeedIdentityReason = programId =>
  Object.hasOwn(UNTRUSTED_FEED_IDENTITIES, programId) ? UNTRUSTED_FEED_IDENTITIES[programId] : null;

export const CONFIRMED_MOTO_COLLISIONS = Object.freeze(['3000057241538','3000058301538']);
