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
      if (seg.p === 'ST') out.push({ p: 'ST', m: seg.dur || 0.3, note: `${seg.times || 1} strides` });
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

  function segsToDetail(segs) {
    return segs.map(s => {
      const t = s.m >= 1 ? `${Math.round(s.m)} min` : `${Math.round(s.m * 60)} s`;
      if (s.p === 'ST') return `${s.note || 'strides'}`;
      return `${t} ${s.p}`;
    }).join(' + ');
  }

  function phaseFor(w) {
    if (w >= 11) return 'build';
    if (w >= 2) return 'peak';
    return 'taper';
  }

  // ---- Novice marathon plan ----
  function noviceWorkout(w, daysPerWeek, vdot, plans, raceDate) {
    const plan = plans.novice_marathon;
    const block = plan.blocks.find(b => w >= Math.min(...b.weeks) && w <= Math.max(...b.weeks));
    if (block) {
      const sel = plan.daySelection[String(daysPerWeek)] || plan.daySelection['5'];
      const map = { 3: { A: 1, C: 3, E: 5 }, 4: { A: 1, B: 2, C: 3, E: 5 }, 5: { A: 1, B: 2, C: 3, D: 4, E: 5 } }[String(daysPerWeek)] || { A: 1, B: 2, C: 3, D: 4, E: 5 };
      const days = [];
      for (let d = 0; d < 7; d++) {
        const sess = Object.keys(map).find(k => map[k] === d + 1);
        if (sess) {
          const segs = expandSegments(block.sessions[sess], block.sessions);
          days.push(makeDay('quality', sess, segs, vdot, plan));
        } else {
          days.push(makeDay('rest', 'Rest', [], vdot, plan));
        }
      }
      return { days, phase: phaseFor(w), note: w === 10 ? plan.week10_note : '' };
    }
    if (w >= 2) {
      const q = plan.weeks9_2[String(w)];
      if (q) {
        const q1 = expandSegments(q.q1), q2 = expandSegments(q.q2);
        const eDay = [{ p: 'E', m: 40 }];
        const days = [];
        for (let d = 0; d < 7; d++) {
          if (d === 1) days.push(makeDay('quality', 'Q1', q1, vdot, plan));
          else if (d === 4) days.push(makeDay('quality', 'Q2', q2, vdot, plan));
          else days.push(makeDay('easy', 'E', eDay, vdot, plan));
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
      if (placed[di]) days.push(makeDay('easy', 'Taper', placed[di], vdot, plan));
      else days.push(makeDay('rest', 'Rest', [], vdot, plan));
    }
    return { days, phase: 'taper', note: '' };
  }

  function makeDay(type, label, segs, vdot, plan) {
    return {
      type, label,
      segments: segs,
      totalMinutes: segmentMinutes(segs),
      distanceMiles: segmentDistanceMiles(segs, vdot),
      detail: segsToDetail(segs)
    };
  }

  // Internal = miles. Convert raw book text (miles-native) to display units.
  function toUnitsDetail(str, units) {
    if (!str) return str;
    // Strip the book's own "(N km)" parenthetical to avoid duplication
    let out = str.replace(/\s*\(\d+(?:\.\d+)?\s*km\)/gi, '');
    if (units !== 'km') return out;
    // Labeled miles -> km
    out = out.replace(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*miles?\b/gi, (_, a, b) => {
      const c = v => (parseFloat(v) * 1.609344).toFixed(1);
      return b ? `${c(a)}-${c(b)} km` : `${c(a)} km`;
    });
    out = out.replace(/(\d+(?:\.\d+)?)\s*mi\b/gi, (_, v) => `${(parseFloat(v)*1.609344).toFixed(1)} km`);
    // Bare miles before pace letter (e.g. "2 E" = 2 miles at E) -> km
    out = out.replace(/(\d+(?:\.\d+)?)\s+(?=(?:E|M|T|L)\b)/g, (_, v) => `${(parseFloat(v)*1.609344).toFixed(1)} km `);
    return out;
  }

  // ---- Marathon 2Q (Table 16.3) - weeksUntilRace countdown, mileage-category aware ----
  function marathon2QWorkout(w, weeklyMiles, vdot, plans, units, raceDate) {
    // Prefer structured data if available (build-time normalized)
    const structured = plans.marathon_2q_structured || plans.tables && plans.tables.marathon_2q && plans.tables.marathon_2q_structured;
    // Also check top-level structured
    const sData = plans.marathon_2q_structured || (plans.tables && plans.tables.marathon_2q_structured) || null;
    // Actually the structured we built is at plans.marathon_2q_structured (top-level)
    const s = plans.marathon_2q_structured;
    if (s && s.categories) {
      // Find category
      let cat = null;
      for (const c of s.categories) {
        if (weeklyMiles >= c.minMiles && weeklyMiles <= c.maxMiles) { cat = c; break; }
      }
      if (!cat) cat = s.categories[0];
      const wk = cat.weeks[String(w)];
      if (!wk) return null;
      if (w === 1 && wk.raceWeek) {
        // Race week taper: will be correctly mapped to actual dates in generateCalendar via daysBeforeRace
        // Return the taper map and let generateCalendar handle date mapping; also provide a placeholder days array for fallback
        const taper = wk.raceWeek;
        const days = [];
        for (let d=0; d<7; d++) {
          // Placeholder - actual mapping uses raceDate in generateCalendar's raceWeek handling
          let raw = [taper[7], taper[6], taper[5], taper[4], taper[3], taper[2], taper[1]][d] || 'Rest';
          raw = raw.replace(/^Q[12]\s*=\s*/, '').trim();
          const det = toUnitsDetail(raw, units);
          const type = /^\s*Rest\s*$/i.test(det) ? 'rest' : 'easy';
          days.push({ type, label: det.slice(0,30) || 'Easy', segments: [], totalMinutes: 0, distanceMiles: 0, detail: det });
        }
        return { days, phase: phaseFor(w), note: `2Q • ${cat.name} • Taper week`, raceWeek: true, taper };
      }
      // Normal Q1/Q2 week
      const q1raw = (wk.q1 || '').replace(/^Q1\s*=\s*/, '');
      const q2raw = (wk.q2 || '').replace(/^Q2\s*=\s*/, '');
      const q1 = toUnitsDetail(q1raw, units);
      const q2 = toUnitsDetail(q2raw, units);
      const eDay = [{ p: 'E', m: 40 }];
      const q1segs = [{ p: 'T', m: 60, note: q1 }];
      const q2segs = [{ p: 'T', m: 60, note: q2 }];
      const days = [];
      for (let d=0; d<7; d++) {
        if (d===1) days.push({ type:'quality', label:'Q1', segments: q1segs, totalMinutes: 60, distanceMiles: 0, detail: q1 });
        else if (d===4) days.push({ type:'quality', label:'Q2', segments: q2segs, totalMinutes: 60, distanceMiles: 0, detail: q2 });
        else days.push(makeDay('easy','E', eDay, vdot, {}));
      }
      return { days, phase: phaseFor(w), note: `2Q • ${cat.name}` };
    }
    const tbl = plans.tables && plans.tables.marathon_2q;
    if (!tbl) return null;
    const rows = tbl.rows;
    // Find mileage category header that covers weeklyMiles
    let catStart = -1, catEnd = rows.length;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].length === 1 && /miles/i.test(rows[i][0])) {
        // header like "Up to 40 miles (64 km) per week"
        const hdr = rows[i][0];
        let lo = 0, hi = 999;
        const m = hdr.match(/(\d+)\s*(?:-|to|–|—)\s*(\d+)\s*miles/i);
        const up = hdr.match(/Up to\s*(\d+)/i);
        const more = hdr.match(/More than\s*(\d+)/i);
        if (m) { lo = parseInt(m[1],10); hi = parseInt(m[2],10); }
        else if (up) { lo = 0; hi = parseInt(up[1],10); }
        else if (more) { lo = parseInt(more[1],10)+1; hi = 999; }
        else continue;
        if (weeklyMiles >= lo && weeklyMiles <= hi) {
          catStart = i;
          // find next header
          for (let j=i+1;j<rows.length;j++) if (rows[j].length===1 && /miles/i.test(rows[j][0])) { catEnd=j; break; }
          break;
        }
      }
    }
    if (catStart === -1) { // fallback: use first category
      for (let i=0;i<rows.length;i++) if (rows[i].length===1 && /miles/i.test(rows[i][0])) { catStart=i; for(let j=i+1;j<rows.length;j++) if(rows[j].length===1 && /miles/i.test(rows[j][0])){catEnd=j;break;} break; }
    }
    if (catStart===-1) return null;
    // Within category, find weeksUntilRace w
    // Category rows 0 is header, 1 is column header ["Weeks until race","Fraction..."], then pairs per week
    for (let i=catStart+2; i<catEnd; i++) {
      const r = rows[i];
      if (r.length>=3 && r[0] === String(w)) {
        if (w === 1) {
          // Race-week taper: "7 days: Q1 = 90 min E 6 days: 60 min E ... 1 day: 20-30 min E (tomorrow is the race)"
          const raw = r[2];
          const taper = {};
          // Split by "N days:" / "1 day:" - capture days number and workout
          const re = /(\d+)\s+days?:\s*/g;
          let m, lastIdx = 0, lastN = null;
          const parts = [];
          // Find all day markers
          const markers = [...raw.matchAll(/(\d+)\s+days?:\s*/g)];
          for (let k=0; k<markers.length; k++) {
            const n = parseInt(markers[k][1], 10);
            const start = markers[k].index + markers[k][0].length;
            const end = k+1 < markers.length ? markers[k+1].index : raw.length;
            let txt = raw.slice(start, end).trim();
            // Remove trailing parenthetical "(tomorrow is the race)" from 1 day entry, keep workout
            txt = txt.replace(/\s*\(tomorrow.*?\)\s*$/i, '').trim();
            // Strip leading Q1 = / Q2 = 
            txt = txt.replace(/^Q[12]\s*=\s*/, '').trim();
            taper[n] = txt;
          }
          // Build race-week days Mon-Sun correctly via actual race date
          const rd = new Date(raceDate + 'T00:00:00');
          const weekStart = new Date(rd);
          // Find Monday of race week
          const dow = (rd.getDay() + 6) % 7; // Mon=0
          weekStart.setDate(rd.getDate() - dow);
          const days = [];
          for (let d=0; d<7; d++) {
            const dayDate = new Date(weekStart); dayDate.setDate(weekStart.getDate() + d);
            const diff = Math.round((rd - dayDate)/86400000);
            let rawDay, label, type;
            if (diff === 0) { rawDay = 'RACE — Marathon'; label = 'RACE'; type = 'rest'; }
            else if (diff >=1 && diff <=7 && taper[diff]) { rawDay = taper[diff]; label = rawDay.slice(0,30) || 'Easy'; type = /RACE/i.test(rawDay) ? 'rest' : 'easy'; }
            else { rawDay = 'Rest'; label = 'Rest'; type = 'rest'; }
            const det = toUnitsDetail(rawDay, units);
            days.push({ type, label, segments: [], totalMinutes: 0, distanceMiles: 0, detail: det, _raw: rawDay });
          }
          return { days, phase: phaseFor(w), note: `2Q • ${rows[catStart][0]} • Taper week`, raceWeek: true, taper };
        }
        const q1raw = r[2];
        const r2 = rows[i+1] || [];
        const q2raw = r2[0] || "";
        const q1 = toUnitsDetail(q1raw.replace(/^Q1\s*=\s*/,''), units);
        const q2 = toUnitsDetail(q2raw.replace(/^Q2\s*=\s*/,''), units);
        const eDay = [{ p: 'E', m: 40 }];
        const q1segs = [{ p: 'T', m: 60, note: q1 }]; // placeholder segs so distance calc is skipped; detail holds raw
        const q2segs = [{ p: 'T', m: 60, note: q2 }];
        const days = [];
        for (let d=0; d<7; d++) {
          if (d===1) days.push({ type:'quality', label:'Q1', segments: q1segs, totalMinutes: 60, distanceMiles: 0, detail: q1 });
          else if (d===4) days.push({ type:'quality', label:'Q2', segments: q2segs, totalMinutes: 60, distanceMiles: 0, detail: q2 });
          else days.push(makeDay('easy','E', eDay, vdot, {}));
        }
        return { days, phase: phaseFor(w), note: `2Q • ${rows[catStart][0]}` };
      }
    }
    return null;
  }

  // ---- Marathon 18-week (Table 16.6 miles / 16.7 km / 16.8 time) ----
  function marathon18WkWorkout(w, vdot, plans, units) {
    const key = units==='km' ? 'marathon_18wk_km' : 'marathon_18wk_miles';
    const tbl = plans.tables && (plans.tables[key] || plans.tables.marathon_18wk_miles || plans.tables.marathon_18wk_time);
    if (!tbl) return null;
    const rows = tbl.rows;
    // Table has header row ["Week","Workout"], then each week spans 7 rows: first has Week num + first day workout, next 6 have 1 col (workout)
    let weekStartIdx = -1;
    // Build map weekNum -> workouts[7]
    const weekMap = {};
    let curWeek = null, curList = [];
    for (let i=1; i<rows.length; i++) {
      const r = rows[i];
      if (r.length===2 && /^\d+$/.test(r[0].trim())) {
        if (curWeek!==null) weekMap[curWeek]=curList;
        curWeek = parseInt(r[0],10);
        curList = [r[1]];
      } else if (r.length===1) {
        if (curWeek!==null) curList.push(r[0]);
      }
    }
    if (curWeek!==null) weekMap[curWeek]=curList;
    // w is weeksUntilRace (1 = race week, 18 = 18 out). Table Week 1 = 18 out, Week 18 = race week => tableWeek = 19 - w
    const tableWeek = 19 - w;
    const workouts = weekMap[tableWeek];
    if (!workouts) return null;
    const days = [];
    for (let d=0; d<7; d++) {
      const raw = workouts[d] || 'E day';
      const det = toUnitsDetail(raw, units);
      const isRest = /rest/i.test(det) && det.length<10;
      const isLong = /L run/i.test(det);
      const type = isRest ? 'rest' : isLong ? 'long' : /[TIR]/.test(det) ? 'quality' : 'easy';
      days.push({ type, label: type==='rest'?'Rest': det.slice(0,30), segments: [], totalMinutes: 0, distanceMiles: 0, detail: det });
    }
    return { days, phase: phaseFor(w), note: `18-week • Week ${tableWeek}` };
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
    for (let d = 0; d < 7; d++) {
      const cell = tpl[d];
      if (!cell || cell.type === 'rest' || d >= daysPerWeek) {
        days.push({ type: 'rest', label: 'Rest', segments: [], totalMinutes: 0, distanceMiles: 0, detail: '' });
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
        detail: `${Math.round(minutes)} min ${zone} (~${distStr})`
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
        built = noviceWorkout(w, daysPerWeek, vdot, plans, raceDate);
      } else if (event === 'marathon' && plans && plans.tables) {
        const weeklyMileageRaw = config.currentMileage || 40;
        const weeklyMiles = (config.units === 'km' ? weeklyMileageRaw / 1.609344 : weeklyMileageRaw);
        let b = null;
        if (weeklyMiles >= 20 && w >=1 && w <=26) b = marathon2QWorkout(w, weeklyMiles, vdot, plans, config.units);
        if (!b && w >=1 && w <=18) b = marathon18WkWorkout(w, vdot, plans, config.units);
        built = b || stdWorkout(k, totalWeeks, event, daysPerWeek, vdot, config.units);
      } else {
        built = stdWorkout(k, totalWeeks, event, daysPerWeek, vdot, config.units);
      }
      // Race-week taper: map "N days before race" to actual dates (2Q w=1)
      if (built.raceWeek && built.taper) {
        const rd = new Date(raceDate + 'T00:00:00');
        const raceWeekDays = [];
        for (let di=0; di<7; di++) {
          const dayDate = new Date(weekStart); dayDate.setDate(weekStart.getDate() + di);
          const diff = Math.round((rd - dayDate)/86400000);
          let raw, label, type, detail;
          if (diff === 0) {
            label = 'RACE';
            type = 'rest';
            detail = `Race day — ${event}`;
          } else if (diff >=1 && diff <=7 && built.taper[diff]) {
            raw = built.taper[diff].replace(/^Q[12]\s*=\s*/, '').trim();
            const det = toUnitsDetail(raw, units);
            const isRest = /^\s*Rest\s*$/i.test(det);
            type = isRest ? 'rest' : 'easy';
            label = det.slice(0,30) || 'Easy';
            detail = det;
          } else {
            label = 'Rest';
            type = 'rest';
            detail = 'Rest';
          }
          raceWeekDays.push({ type, label, segments: [], totalMinutes: 0, distanceMiles: 0, detail, date: dayDate, dayName: DAYS[di] });
        }
        weeks.push({
          weekNum: k + 1,
          weeksUntilRace: w,
          phase: built.phase,
          note: built.note || '',
          days: raceWeekDays,
          totalMinutes: 0,
          totalMiles: 0,
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
