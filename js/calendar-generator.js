/**
 * Calendar Generator - time-based, unit-aware, race-countdown driven.
 * Consumes VDOTCalculator (paces) and global PLANS (novice marathon plan).
 */
const CalendarGenerator = (() => {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // %VO2max ranges per zone (used for HR zones + pace selection)
  const ZONE_VO2 = {
    E: [59, 74], M: [75, 84], T: [85, 88], I: [95, 100], R: [98, 100], L: [59, 74], W: [0, 0], ST: [80, 90]
  };

  function paceSecondsPerMile(vdot, zone) {
    const table = VDOTCalculator.getTable();
    if (!table) return 480;
    const row = table[String(vdot)] || table['50'];
    switch (zone) {
      case 'E': return avg(parsePace(row.easy_min), parsePace(row.easy_max));
      case 'M': return parsePace(row.marathon);
      case 'T': return parsePace(row.tempo);
      case 'I': return parsePace(row.interval_1k); // ~1K interval pace proxy
      case 'R': return parsePace(row.interval_400);
      case 'L': return avg(parsePace(row.easy_min), parsePace(row.easy_max));
      default: return avg(parsePace(row.easy_min), parsePace(row.easy_max));
    }
  }

  function parsePace(s) {
    const [mm, ss] = s.split(':').map(Number);
    return mm * 60 + ss;
  }
  function avg(a, b) { return (a + b) / 2; }
  function fmtPace(secPerMile) {
    const secPerKm = secPerMile / 1.609344;
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // Expand a segment list (resolving "repeat" references and repetitions)
  function expandSegments(sessions, ref) {
    if (typeof sessions === 'string') return expandSegments(ref[sessions], ref);
    return sessions.map(seg => {
      const out = [];
      const times = seg.times || 1;
      for (let i = 0; i < times; i++) {
        out.push({ p: seg.p, m: seg.m != null ? seg.m : (seg.dur || 0) });
        if (seg.rec) out.push({ p: seg.rec.p, m: seg.rec.m });
      }
      if (seg.p === 'ST') out.push({ p: 'ST', m: seg.dur || 0.3, times: seg.times || 1, note: '' });
      return out;
    }).flat();
  }

  function segmentMinutes(segs) {
    return segs.reduce((t, s) => t + (s.m || 0), 0);
  }
  function segmentDistanceMiles(segs, vdot) {
    let miles = 0;
    for (const s of segs) {
      if (s.p === 'W' || s.p === 'ST' || s.p === 'rest') continue;
      const spm = paceSecondsPerMile(vdot, s.p);
      miles += ((s.m || 0) * 60) / spm;
    }
    return miles;
  }

  function segsToDetail(segs, units) {
    // Compose a localized workout sentence from neutral segments.
    if (typeof WorkoutRender !== 'undefined') {
      return WorkoutRender.renderSegments(segs, units);
    }
    // Fallback (English) when the renderer is unavailable.
    return segs.map(s => {
      const t = s.m >= 1 ? `${Math.round(s.m)} min` : `${Math.round(s.m * 60)} s`;
      if (s.p === 'ST') return `${s.note || 'strides'}`;
      return `${t} ${s.p}`;
    }).join(' + ');
  }

  function week10Note() {
    if (typeof I18n !== 'undefined' && I18n.locale === 'es') return I18n.t('note.week10');
    return 'During week 10, try to complete a steady 10K run (easy effort if raced).';
  }

  function catName(cat) {
    if (typeof WorkoutRender !== 'undefined') {
      return WorkoutRender.renderCategoryName(cat);
    }
    // Fallback (English) when the renderer is unavailable.
    return `${cat.minMiles}-${cat.maxMiles} miles per week`;
  }

  function phaseFor(w) {
    if (w >= 11) return 'build';
    if (w >= 2) return 'peak';
    return 'taper';
  }

  // ---- Novice marathon plan ----
  function noviceWorkout(w, daysPerWeek, vdot, plans, raceDate, units) {
    const plan = plans.novice_marathon;
    const t = (typeof I18n !== 'undefined') ? I18n.t.bind(I18n) : (k) => k;
    const restLabel = t('zone.rest') || 'Rest';
    const taperLabel = t('wr.taper') || 'Taper';
    const block = plan.blocks.find(b => w >= Math.min(...b.weeks) && w <= Math.max(...b.weeks));
    if (block) {
      const sel = plan.daySelection[String(daysPerWeek)] || plan.daySelection['5'];
      const map = { 3: { A: 1, C: 3, E: 5 }, 4: { A: 1, B: 2, C: 3, E: 5 }, 5: { A: 1, B: 2, C: 3, D: 4, E: 5 } }[String(daysPerWeek)] || { A: 1, B: 2, C: 3, D: 4, E: 5 };
      const days = [];
      for (let d = 0; d < 7; d++) {
        const sess = Object.keys(map).find(k => map[k] === d + 1);
        if (sess) {
          const segs = expandSegments(block.sessions[sess], block.sessions);
          days.push(makeDay('quality', sess, segs, vdot, plan, units));
        } else {
          days.push(makeDay('rest', restLabel, [], vdot, plan, units));
        }
      }
      return { days, phase: phaseFor(w), note: w === 10 ? week10Note() : '' };
    }
    if (w >= 2) {
      const q = plan.weeks9_2[String(w)];
      if (q) {
        const q1 = expandSegments(q.q1), q2 = expandSegments(q.q2);
        const eDay = [{ p: 'E', m: 40 }];
        const days = [];
        for (let d = 0; d < 7; d++) {
          if (d === 1) days.push(makeDay('quality', 'Q1', q1, vdot, plan, units));
          else if (d === 4) days.push(makeDay('quality', 'Q2', q2, vdot, plan, units));
          else days.push(makeDay('easy', 'E', eDay, vdot, plan, units));
        }
        return { days, phase: 'peak', note: '' };
      }
    }
    // race week (w == 1): place each listed "day" by days-until-race
    const raceDow = new Date(raceDate + 'T00:00:00').getDay(); // 0=Sun
    const days = [];
    const placed = {};
    for (const [dk, segs] of Object.entries(plan.week1)) {
      const d = parseInt(dk, 10);
      const dow = (raceDow - d + 7) % 7; // weekday index 0=Mon..6=Sun
      placed[dow] = expandSegments(segs);
    }
    for (let di = 0; di < 7; di++) {
      if (placed[di]) days.push(makeDay('easy', taperLabel, placed[di], vdot, plan, units));
      else days.push(makeDay('rest', restLabel, [], vdot, plan, units));
    }
    return { days, phase: 'taper', note: '' };
  }

  function makeDay(type, label, segs, vdot, plan, units) {
    return {
      type, label,
      segments: segs,
      totalMinutes: segmentMinutes(segs),
      distanceMiles: segmentDistanceMiles(segs, vdot),
      detail: segsToDetail(segs, units)
    };
  }

  // ---- Precomputed 2Q segment values (from data/plans.segments.json) ----
  // Segments are generated at build time (scripts/build-plans.js); the app only
  // applies VDOT pace here. Segment schema: { p, mi } distance in miles,
  // { p, m } time in minutes, { p, mi, capMin } "lesser of X mi and Y min".
  function segmentTotals(segs, vdot) {
    let minutes = 0, miles = 0;
    for (const s of (segs || [])) {
      if (s.mi != null) {
        const spm = paceSecondsPerMile(vdot, s.p);
        let t = s.mi * spm / 60;
        let d = s.mi;
        if (s.capMin != null && t > s.capMin) { t = s.capMin; d = s.capMin * 60 / spm; }
        minutes += t;
        miles += d;
      } else if (s.m != null) {
        minutes += s.m;
        if (s.p !== 'W' && s.p !== 'ST') {
          const spm = paceSecondsPerMile(vdot, s.p);
          miles += s.m * 60 / spm;
        }
      }
    }
    return { totalMinutes: Math.round(minutes), distanceMiles: miles };
  }

  function dayFromSegments(label, segs, vdot, detail) {
    const totals = segmentTotals(segs, vdot);
    return {
      type: 'quality',
      label,
      segments: segs,
      totalMinutes: totals.totalMinutes,
      distanceMiles: totals.distanceMiles,
      detail
    };
  }

  // ---- Marathon 2Q (Table 16.3) - weeksUntilRace countdown, mileage-category aware ----
  function marathon2QWorkout(w, weeklyMiles, vdot, units) {
    const segData = window.PLANS_2Q_SEGMENTS || null;
    if (!segData || !segData.categories) return null;
    // Find mileage category that covers weeklyMiles
    let cat = null;
    for (const c of segData.categories) {
      if (weeklyMiles >= c.minMiles && weeklyMiles <= c.maxMiles) { cat = c; break; }
    }
    if (!cat) cat = segData.categories[0];
    const wk = cat.weeks[String(w)];
    if (!wk) return null;

    if (w === 1 && wk.raceWeekSegments) {
      return {
        days: [],
        phase: phaseFor(w),
        note: (typeof I18n !== 'undefined') ? I18n.t('note.2qTaper', { cat: catName(cat) }) : `2Q • ${cat.minMiles}-${cat.maxMiles} miles • Taper week`,
        raceWeek: true,
        taperSegments: wk.raceWeekSegments
      };
    }

    const eDay = [{ p: 'E', m: 40 }];
    const q1Detail = WorkoutRender && WorkoutRender.renderSegments(wk.q1Segments, units);
    const q2Detail = WorkoutRender && WorkoutRender.renderSegments(wk.q2Segments, units);
    const days = [];
    for (let d = 0; d < 7; d++) {
      if (d === 1) days.push(dayFromSegments('Q1', wk.q1Segments, vdot, q1Detail));
      else if (d === 4) days.push(dayFromSegments('Q2', wk.q2Segments, vdot, q2Detail));
      else days.push(makeDay('easy', 'E', eDay, vdot, {}, units));
    }
    return { days, phase: phaseFor(w), note: (typeof I18n !== 'undefined') ? I18n.t('note.2q', { cat: catName(cat) }) : `2Q • ${cat.minMiles}-${cat.maxMiles} miles` };
  }

  // ---- Standard (distance-based) events, converted to time ----
  const STD = {
    marathon: { 4: stdTpl(['rest','T','E','rest','M','E','L'],[[5,7],[5,7],[12,20]]),
                5: stdTpl(['E','I','E','T','rest','E','L'],[[5,7],[5,7],[14,20]]),
                6: stdTpl(['E','I','E','T','E','E','L'],[[5,7],[5,7],[15,22]]),
                7: stdTpl(['E','I','E','T','E','E','L'],[[5,8],[5,8],[16,22]]) },
    half_marathon: { 4: stdTpl(['rest','I','E','rest','T','E','L'],[[5,7],[5,7],[12,16]]),
                5: stdTpl(['E','I','E','T','rest','E','L'],[[5,7],[5,7],[13,18]]) },
    '10k': { 4: stdTpl(['rest','I','E','rest','T','E','L'],[[4,6],[4,6],[10,15]]),
                5: stdTpl(['E','I','E','T','rest','E','L'],[[4,6],[4,6],[12,16]]) },
    '5k': { 4: stdTpl(['rest','I','E','rest','R','E','L'],[[4,6],[4,6],[10,14]]),
                5: stdTpl(['E','I','E','R','rest','E','L'],[[4,6],[4,6],[10,14]]) }
  };
  function stdTpl(types, ranges) {
    return types.map((t, i) => {
      if (t === 'rest') return { type: 'rest' };
      if (t === 'L') return { type: 'L', zone: 'L', miles: ranges[2][0] };
      if (t === 'E') return { type: 'E', zone: 'E', miles: ranges[0][0] };
      return { type: 'quality', zone: t, miles: ranges[1][0] };
    });
  }

  function stdWorkout(weekIdx, totalWeeks, event, daysPerWeek, vdot, units) {
    const tpl = (STD[event] && STD[event][String(daysPerWeek)]) || STD[event]['4'] || STD.marathon['4'];
    const days = [];
    const isRecovery = (totalWeeks - weekIdx) % 4 === 0;
    const t = (typeof I18n !== 'undefined') ? I18n.t.bind(I18n) : (k) => k;
    const restLabel = t('zone.rest') || 'Rest';
    for (let d = 0; d < 7; d++) {
      const cell = tpl[d];
      if (!cell || cell.type === 'rest' || d >= daysPerWeek) {
        days.push({ type: 'rest', label: restLabel, segments: [], totalMinutes: 0, distanceMiles: 0, detail: '' });
        continue;
      }
      const zone = cell.zone || 'E';
      const miles = cell.miles || 5;
      const spm = paceSecondsPerMile(vdot, zone);
      const minutes = (miles * spm) / 60;
      const segs = [{ p: zone, m: minutes }];
      const distStr = units === 'km' ? `${(miles*1.609344).toFixed(1)} km` : `${miles} mi`;
      days.push({
        type: cell.type === 'quality' ? 'quality' : 'easy',
        label: zone,
        segments: segs,
        totalMinutes: minutes,
        distanceMiles: miles,
        detail: `${Math.round(minutes)} ${t('wr.min')} ${zone} (~${distStr})`
      });
    }
    return { days, phase: phaseFor(totalWeeks - weekIdx), note: '' };
  }

  function generateCalendar(config) {
    const { event, raceDate, vdot, daysPerWeek, units } = config;
    const plans = window.PLANS || null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rd = new Date(raceDate + 'T00:00:00');
    const diffDays = Math.round((rd - today) / 86400000);
    const totalWeeks = Math.max(1, Math.ceil(diffDays / 7));

    const offset = (today.getDay() + 6) % 7;
    const startMonday = new Date(today); startMonday.setDate(today.getDate() - offset);

    const weeks = [];
    for (let k = 0; k < totalWeeks; k++) {
      const w = totalWeeks - k; // weeks until race
      const weekStart = new Date(startMonday); weekStart.setDate(startMonday.getDate() + 7 * k);
      let built;
      if (event === 'marathon' && ['3', '4', '5'].includes(String(daysPerWeek)) && plans && plans.novice_marathon) {
        built = noviceWorkout(w, daysPerWeek, vdot, plans, raceDate, units);
      } else if (event === 'marathon' && plans && plans.tables) {
        const weeklyMileageRaw = config.currentMileage || 40;
        const weeklyMiles = (config.units === 'km' ? weeklyMileageRaw / 1.609344 : weeklyMileageRaw);
        let b = null;
        if (weeklyMiles >= 20 && w >=1 && w <=26) b = marathon2QWorkout(w, weeklyMiles, vdot, config.units);
        built = b || stdWorkout(k, totalWeeks, event, daysPerWeek, vdot, config.units);
      } else {
        built = stdWorkout(k, totalWeeks, event, daysPerWeek, vdot, config.units);
      }
      // Race-week taper: map "N days before race" to actual dates (2Q w=1)
      if (built.raceWeek && built.taperSegments) {
        const rd = new Date(raceDate + 'T00:00:00');
        const raceWeekDays = [];
        const t = (typeof I18n !== 'undefined') ? I18n.t.bind(I18n) : (k) => k;
        const restLabel = t('zone.rest') || 'Rest';
        const raceLabel = t('wr.race') || 'RACE';
        for (let di=0; di<7; di++) {
          const dayDate = new Date(weekStart); dayDate.setDate(weekStart.getDate() + di);
          const diff = Math.round((rd - dayDate)/86400000);
          let day;
          if (diff === 0) {
            day = { type: 'rest', label: raceLabel, segments: [], totalMinutes: 0, distanceMiles: 0, detail: t('wr.raceDay', { event }) };
          } else if (diff >= 1 && diff <= 7 && built.taperSegments[diff]) {
            const segs = built.taperSegments[diff];
            const isRest = segs.length === 0 || segs.every(s => s.p === 'W' || s.p === 'rest');
            const detail = (WorkoutRender && WorkoutRender.renderSegments(segs, units)) || '';
            if (isRest) {
              day = { type: 'rest', label: restLabel, segments: [], totalMinutes: 0, distanceMiles: 0, detail: restLabel };
            } else {
              const totals = segmentTotals(segs, vdot);
              day = { type: 'easy', label: (detail || t('zone.E') || 'Easy').slice(0, 30), segments: segs, totalMinutes: totals.totalMinutes, distanceMiles: totals.distanceMiles, detail };
            }
          } else {
            day = { type: 'rest', label: restLabel, segments: [], totalMinutes: 0, distanceMiles: 0, detail: restLabel };
          }
          raceWeekDays.push({ ...day, date: dayDate, dayName: DAYS[di] });
        }
        weeks.push({
          weekNum: k + 1,
          weeksUntilRace: w,
          phase: built.phase,
          note: built.note || '',
          days: raceWeekDays,
          totalMinutes: raceWeekDays.reduce((t, d) => t + (d.totalMinutes || 0), 0),
          totalMiles: raceWeekDays.reduce((t, d) => t + (d.distanceMiles || 0), 0),
          qualityCount: 0
        });
        continue;
      }
      // assign real dates
      const days = built.days.map((day, di) => ({
        ...day,
        date: new Date(weekStart), // set below per weekday
        dayName: DAYS[di]
      }));
      // fix dates
      days.forEach((day, di) => { const dt = new Date(weekStart); dt.setDate(weekStart.getDate() + di); day.date = dt; });

      const totalMin = days.reduce((t, d) => t + (d.totalMinutes || 0), 0);
      const totalMiles = days.reduce((t, d) => t + (d.distanceMiles || 0), 0);
      const qualityCount = days.filter(d => d.type === 'quality').length;

      weeks.push({
        weekNum: k + 1,
        weeksUntilRace: w,
        phase: built.phase,
        note: built.note || '',
        days,
        totalMinutes: totalMin,
        totalMiles,
        qualityCount
      });
    }

    return {
      event, daysPerWeek, vdot, units,
      paces: VDOTCalculator.getTrainingPaces(vdot),
      weeks, startDate: startMonday, raceDate: rd, totalWeeks
    };
  }

  // HR zones from max/resting HR using %HRR ~ 0.94*%VO2 - 4.7
  function hrZones(vdot, maxHR, restHR) {
    const out = {};
    for (const [z, [lo, hi]] of Object.entries(ZONE_VO2)) {
      if (z === 'W' || z === 'ST') continue;
      const f = p => Math.round(restHR + ((0.94 * p - 4.7) / 100) * (maxHR - restHR));
      out[z] = [f(lo), f(hi)];
    }
    return out;
  }

  return { generateCalendar, hrZones, paceSecondsPerMile, fmtPace, DAYS, ZONE_VO2 };
})();
