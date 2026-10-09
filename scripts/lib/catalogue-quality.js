import { CLOSED_PROGRAMS, isClosedProgram } from './closed-programs.js';
const DEFAULT_THRESHOLDS = Object.freeze({
  minimumBaselineOffers: 100,
  warningDropRatio: 0.30,
  criticalDropRatio: 0.55,
  warningMinimumLoss: 50,
  criticalMinimumLoss: 100,
  staleWarningRatio: 0.25,
  staleCriticalRatio: 0.60,
  missingImageWarningRatio: 0.20,
  uncategorizedWarningRatio: 0.25,
});

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratio(part, total) {
  return total > 0 ? part / total : 0;
}

function alert(severity, code, programId, message, context = {}) {
  return { severity, code, program_id: programId, message, ...context };
}

/**
 * Compare un état marchand au dernier état observé. Les seuils combinent
 * toujours un ratio ET un volume minimal afin qu'un petit flux volatil ne
 * déclenche pas de fausse alerte.
 */
function evaluateMerchant(current, previous, thresholds = DEFAULT_THRESHOLDS) {
  const programId = String(current.program_id || 'inconnu');
  const offers = number(current.offers);
  const stale = number(current.older_than_7d);
  const missingImages = number(current.missing_image);
  const uncategorized = number(current.uncategorized);
  const alerts = [];

  if (previous) {
    const before = number(previous.offers);
    const loss = Math.max(0, before - offers);
    const dropRatio = ratio(loss, before);
    if (before >= thresholds.minimumBaselineOffers
        && loss >= thresholds.criticalMinimumLoss
        && dropRatio >= thresholds.criticalDropRatio) {
      alerts.push(alert('critical', 'offers_drop', programId,
        `Le catalogue actif a chuté de ${Math.round(dropRatio * 100)} % (${before} → ${offers}).`,
        { previous_offers: before, current_offers: offers, drop_ratio: dropRatio }));
    } else if (before >= thresholds.minimumBaselineOffers
        && loss >= thresholds.warningMinimumLoss
        && dropRatio >= thresholds.warningDropRatio) {
      alerts.push(alert('warning', 'offers_drop', programId,
        `Le catalogue actif a baissé de ${Math.round(dropRatio * 100)} % (${before} → ${offers}).`,
        { previous_offers: before, current_offers: offers, drop_ratio: dropRatio }));
    }
  }

  const staleRatio = ratio(stale, offers);
  if (offers >= thresholds.minimumBaselineOffers && staleRatio >= thresholds.staleCriticalRatio) {
    alerts.push(alert('critical', 'stale_offers', programId,
      `${Math.round(staleRatio * 100)} % des offres actives n'ont pas été rafraîchies depuis 7 jours.`,
      { stale_offers: stale, stale_ratio: staleRatio }));
  } else if (offers >= thresholds.minimumBaselineOffers && staleRatio >= thresholds.staleWarningRatio) {
    alerts.push(alert('warning', 'stale_offers', programId,
      `${Math.round(staleRatio * 100)} % des offres actives n'ont pas été rafraîchies depuis 7 jours.`,
      { stale_offers: stale, stale_ratio: staleRatio }));
  }

  const missingImageRatio = ratio(missingImages, offers);
  if (offers >= thresholds.minimumBaselineOffers && missingImageRatio >= thresholds.missingImageWarningRatio) {
    alerts.push(alert('warning', 'missing_images', programId,
      `${Math.round(missingImageRatio * 100)} % des offres actives n'ont pas d'image.`,
      { missing_images: missingImages, missing_image_ratio: missingImageRatio }));
  }

  const uncategorizedRatio = ratio(uncategorized, offers);
  if (offers >= thresholds.minimumBaselineOffers && uncategorizedRatio >= thresholds.uncategorizedWarningRatio) {
    alerts.push(alert('warning', 'uncategorized', programId,
      `${Math.round(uncategorizedRatio * 100)} % des offres actives restent dans Autres.`,
      { uncategorized_offers: uncategorized, uncategorized_ratio: uncategorizedRatio }));
  }

  return alerts;
}

function evaluateCatalogue(currentMerchants, previousReport, extras = {}, thresholds = DEFAULT_THRESHOLDS) {
  const previousByProgram = new Map((previousReport?.merchants || []).map(row => [String(row.program_id), row]));
  const alerts = currentMerchants.flatMap(row => evaluateMerchant(row, previousByProgram.get(String(row.program_id)), thresholds));
  // A merchant absent from the current GROUP BY has zero active offers.
  // It must still be compared with its previous catalogue.
  const currentIds = new Set(currentMerchants.map(row => String(row.program_id)));
  for (const [programId, previous] of previousByProgram) {
    if (!currentIds.has(programId) && !isClosedProgram(programId)) {
      alerts.push(...evaluateMerchant({ program_id:programId, offers:0 }, previous, thresholds));
    }
  }
  for (const row of currentMerchants) {
    if (isClosedProgram(row.program_id) && number(row.offers) > 0) {
      alerts.push(alert('critical', 'closed_program_active', row.program_id,
        'Des offres actives subsistent pour un programme dont la fermeture est confirmée.'));
    }
  }
  const unresolved = number(extras.unresolved_quarantines);
  const newQuarantines = number(extras.new_quarantines_24h);

  if (newQuarantines > 0) {
    alerts.push(alert('warning', 'new_ean_collisions', null,
      `${newQuarantines} collision(s) EAN ont été placées en quarantaine depuis 24 h.`,
      { new_quarantines_24h: newQuarantines, unresolved_quarantines: unresolved }));
  }

  const critical = alerts.filter(item => item.severity === 'critical').length;
  const warnings = alerts.filter(item => item.severity === 'warning').length;
  return {
    status: critical ? 'critical' : warnings ? 'warning' : 'healthy',
    counts: { critical, warnings, unresolved_quarantines: unresolved },
    alerts,
    confirmed_closures: Object.entries(CLOSED_PROGRAMS).map(([program_id, details]) => ({ program_id, ...details })),
  };
}

export { DEFAULT_THRESHOLDS, evaluateMerchant, evaluateCatalogue };
