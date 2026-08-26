/**
 * Workout Renderer - compose localized workout text from neutral segments.
 *
 * Segments are language-neutral facts: { p: zoneCode, mi?: number, m?: number, capMin?: number }
 * where zoneCode ∈ { E, M, T, I, R, L, W, ST }. This module renders them as a
 * sentence in the active locale (via I18n), so the app never displays stored
 * English prose.
 */
const WorkoutRender = (() => {
  const ZONE_ORDER_FRIENDLY = 'EMTIRLWST';

  function zoneName(zone) {
    if (zone == null) return '';
    return I18n.t('zone.' + zone);
  }

  // Format a numeric amount: time (minutes) or distance (miles) in the chosen units.
  function fmtAmount(seg, units) {
    if (seg.m != null) {
      const m = Math.round(seg.m);
      return `${m} ${I18n.t('wr.min')}`;
    }
    if (seg.mi != null) {
      if (units === 'km') {
        const km = seg.mi * 1.609344;
        return `${Number(km.toFixed(1))} ${I18n.t('unit.km')} ${zoneName(seg.p)}`;
      }
      return `${Number(seg.mi.toFixed(1))} ${I18n.t('unit.mi')} ${zoneName(seg.p)}`;
    }
    return '';
  }

  // A "steady E run" / long-run segment: { p:'E', mi: X, capMin: Y } (lesser of X mi / Y min)
  // or { p:'E', m: N } (a fixed-minutes steady run).
  function renderSteady(seg, units) {
    const zone = zoneName(seg.p);
    if (seg.capMin != null && seg.mi != null) {
      const dist = seg.mi * 1.609344;
      const distStr = units === 'km' ? `${Number(dist.toFixed(1))} ${I18n.t('unit.km')}` : `${Number(seg.mi.toFixed(1))} ${I18n.t('unit.mi')}`;
      return I18n.t('wr.lesserOf', { dist: distStr, min: seg.capMin });
    }
    if (seg.m != null) {
      return `${Math.round(seg.m)} ${I18n.t('wr.min')} ${zone}`;
    }
    if (seg.mi != null) {
      const km = seg.mi * 1.609344;
      const dist = units === 'km' ? `${Number(km.toFixed(1))} ${I18n.t('unit.km')}` : `${Number(seg.mi.toFixed(1))} ${I18n.t('unit.mi')}`;
      return `${dist} ${zone}`;
    }
    return zone;
  }

  // Render a single segment (which may include a recovery sub-segment via `rec`).
  function renderOne(seg, units) {
    if (seg.p === 'W' || seg.p === 'rest') {
      if (seg.m != null) return `${Math.round(seg.m)} ${I18n.t('wr.min')} ${I18n.t('wr.rest')}`;
      return I18n.t('zone.rest');
    }
    if (seg.p === 'ST') {
      if (seg.note) return seg.note; // e.g. "9 strides"
      const n = seg.times || 1;
      return `${n} ${I18n.t('wr.strides')}`;
    }
    // Steady / long-run "lesser of" or plain distance/time runs carrying only E zone
    const isSteady = (seg.p === 'E' || seg.p === 'L') &&
      ((seg.capMin != null) || (seg.mi != null && seg.mi >= 2) || seg.steady);
    if (isSteady && seg.capMin != null) {
      return renderSteady(seg, units);
    }
    if (seg.p === 'L') {
      return renderSteady(seg, units);
    }
    // Repetition group: { p, mi|m, times, rec }  ->  "N × (amt w/ recAmt)"
    if (seg.times && seg.times > 1) {
      const amt = fmtAmount({ p: seg.p, mi: seg.mi, m: seg.m }, units);
      const rec = seg.rec ? fmtRecovery(seg.rec, units) : null;
      const body = rec ? `${amt} ${I18n.t('wr.with')} ${rec}` : amt;
      return `${seg.times} × (${body})`;
    }
    return fmtAmount(seg, units);
  }

  function fmtRecovery(rec, units) {
    if (rec.m != null) {
      const kind = rec.p === 'W' ? I18n.t('wr.rest') : I18n.t('wr.jog');
      return `${Math.round(rec.m)} ${I18n.t('wr.min')} ${kind}`;
    }
    if (rec.mi != null) {
      if (units === 'km') {
        return `${Number((rec.mi * 1.609344).toFixed(1))} ${I18n.t('unit.km')} ${rec.p === 'W' ? I18n.t('wr.rest') : I18n.t('wr.jog')}`;
      }
      return `${Number(rec.mi.toFixed(1))} ${I18n.t('unit.mi')} ${rec.p === 'W' ? I18n.t('wr.rest') : I18n.t('wr.jog')}`;
    }
    return '';
  }

  // Render a whole segment list as "A + B + C".
  function renderSegments(segments, units) {
    if (!segments || !segments.length) return '';
    return segments.map(s => renderOne(s, units)).filter(Boolean).join(' + ');
  }

  // Render a mileage-category name from the neutral min/max range.
  // The last category uses maxMiles 999 to signal "more than".
  function renderCategoryName(cat, units) {
    const min = cat.minMiles, max = cat.maxMiles;
    const km = v => Math.round(v * 1.609344);
    if (max >= 999) {
      return I18n.t('cat.moreThan', { min, km: km(min) });
    }
    return I18n.t('cat.range', { min, max, kmMin: km(min), kmMax: km(max) });
  }

  // A stable count of zone letter used for shorter labels.
  function zoneCode(zone) { return zone; }

  return { renderSegments, renderCategoryName, zoneName, zoneCode };
})();
