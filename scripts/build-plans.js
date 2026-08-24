/**
 * Build step: precompute the Marathon 2Q (Table 16.3) workout values.
 *
 * The raw plans.json stores the book's notation as strings, e.g.
 *   "Q1 = 4 E + 8 M + 1 T + 1 E (a nonstop workout)"
 * This script parses those strings ONCE and writes numeric segments plus
 * ready-to-display km/mi strings to webapp/data/plans.segments.json, so the
 * browser never has to parse workout text at runtime.
 *
 * Run:  node scripts/build-plans.js
 *
 * Segment schema (VDOT-independent — pace is applied at runtime):
 *   { "p": "E", "mi": 4 }                4 miles at Easy pace
 *   { "p": "M", "mi": 8 }                8 miles at Marathon pace
 *   { "p": "E", "m": 30 }                30 minutes Easy
 *   { "p": "W", "m": 2 }                 2 minutes rest (walk/standing)
 *   { "p": "E", "mi": 20, "capMin": 150 } "lesser of 20 mi and 150 min"
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'webapp', 'data', 'plans.json');
const OUT = path.join(__dirname, '..', 'webapp', 'data', 'plans.segments.json');

const plans = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const structured = plans.marathon_2q_structured;
if (!structured || !structured.categories) {
  console.error('No marathon_2q_structured.categories found in plans.json');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Workout-string parser (moved out of the browser; runs only at build time).
// ---------------------------------------------------------------------------

function roundMi(x) { return Math.round(x * 1e6) / 1e6; }

function toMiles(num, zone, hasKm) {
  if (hasKm) return num / 1.609344;
  if (zone === 'R') return num / 1609.344;                                 // 200 R / 400 R are metres
  if ((zone === 'I' || zone === 'T') && num >= 100) return num / 1609.344; // 800 T / 1,200 I are metres
  return num;                                                              // bare number = miles
}

// Returns { p, mi } for distance, { p, m } for time, or null.
function parseUnit(s) {
  const r = s.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*min\s+([EMTIRLWH])\b/i);
  if (r) { const z = r[3].toUpperCase(); return { p: z === 'H' ? 'I' : z, m: (parseFloat(r[1]) + parseFloat(r[2])) / 2 }; }
  const t = s.match(/^(\d+(?:\.\d+)?)\s*min\s+([EMTIRLWH])\b/i);
  if (t) { const z = t[2].toUpperCase(); return { p: z === 'H' ? 'I' : z, m: parseFloat(t[1]) }; }
  const d = s.match(/^([\d.,]+)\s*(km\s+)?([EMTIRLW])\b/i);
  if (d) {
    const z = d[3].toUpperCase();
    const num = parseFloat(d[1].replace(/,/g, ''));
    return { p: z, mi: roundMi(toMiles(num, z, !!d[2])) };
  }
  return null;
}

// Recovery after a rep: { p:'E', m } jog, { p:'W', m } rest, or { p:'E', mi } distance jog.
function parseRecovery(rec) {
  const s = rec.trim().replace(/\s+/g, ' ');
  const min = s.match(/(\d+(?:\.\d+)?)\s*min/);
  if (min) {
    const mins = parseFloat(min[1]);
    return { p: /rest/i.test(s) ? 'W' : 'E', m: mins };
  }
  const dist = s.match(/(\d+(?:,\d+)?)\s*m?\s*(?:jg|jog)/i);
  if (dist) {
    const meters = parseFloat(dist[1].replace(/,/g, ''));
    return { p: 'E', mi: roundMi(meters / 1609.344) };
  }
  return null;
}

function addSeg(segs, unit, count) {
  if (!unit) return;
  if (unit.m != null) { segs.push({ p: unit.p, m: roundMi(unit.m * count) }); return; }
  if (unit.mi != null) { segs.push({ p: unit.p, mi: roundMi(unit.mi * count) }); }
}

function steadySegments(rest) {
  const s = rest.trim();
  const lesser = s.match(/lesser of\s+([\d.]+)\s*miles?[\s\S]*?and\s+([\d.]+)\s*min/i);
  if (lesser) {
    return [{ p: 'E', mi: roundMi(parseFloat(lesser[1])), capMin: parseFloat(lesser[2]) }];
  }
  const rng = s.match(/(\d+)\s*[-–—]\s*(\d+)\s*min/i);
  if (rng) return [{ p: 'E', m: (parseFloat(rng[1]) + parseFloat(rng[2])) / 2 }];
  const mn = s.match(/(\d+)\s*min/i);
  if (mn) return [{ p: 'E', m: parseFloat(mn[1]) }];
  const ml = s.match(/(\d+(?:\.\d+)?)\s*miles?/i);
  if (ml) return [{ p: 'E', mi: roundMi(parseFloat(ml[1])) }];
  return [];
}

function splitTopLevel(s) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === '+' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean);
}

function parseSegments(raw) {
  if (!raw) return [];
  let s = raw.replace(/^Q[12]\s*=\s*/i, '').trim();
  s = s.split(/\s+or\s+/i)[0].trim();
  // Drop annotation parentheticals "(a nonstop workout)", "(32 km)"; keep rep groups with "w/".
  s = s.replace(/\(([^()]*)\)/g, (m, inner) => (/w\//i.test(inner) ? m : ' ')).trim();

  const segs = [];
  const steady = s.match(/^steady\s+E\s+run\s+of\s+(.+)$/i);
  if (steady) return steadySegments(steady[1]);

  for (const part of splitTopLevel(s)) {
    const rep = part.match(/^(\d+)\s*[×x]\s*(.+)$/i);
    if (rep) {
      const count = parseInt(rep[1], 10);
      const body = rep[2].replace(/^\(|\)$/g, '').trim();
      const wi = body.split(/\s+w\//i);
      addSeg(segs, parseUnit(wi[0].trim()), count);
      if (wi[1]) addSeg(segs, parseRecovery(wi[1]), count);
      continue;
    }
    const rest = part.match(/^(\d+(?:\.\d+)?)\s*min\s+(?:rests?|recover)\b/i);
    if (rest) { segs.push({ p: 'W', m: parseFloat(rest[1]) }); continue; }
    addSeg(segs, parseUnit(part), 1);
  }
  return segs;
}

// ---------------------------------------------------------------------------
// Display converter (mirror of the app's toUnitsDetail, applied once here).
// ---------------------------------------------------------------------------
function cleanDisplay(raw) {
  return (raw || '').replace(/^Q[12]\s*=\s*/i, '').trim();
}

function toUnitsDetail(str, units) {
  if (!str) return str;
  let out = str.replace(/\s*\(\d+(?:\.\d+)?\s*km\)/gi, '');
  if (units !== 'km') return out;
  out = out.replace(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*miles?\b/gi, (_, a, b) => {
    const c = v => (parseFloat(v) * 1.609344).toFixed(1);
    return b ? `${c(a)}-${c(b)} km` : `${c(a)} km`;
  });
  out = out.replace(/(\d+(?:\.\d+)?)\s*mi\b/gi, (_, v) => `${(parseFloat(v) * 1.609344).toFixed(1)} km`);
  out = out.replace(/(\d+(?:\.\d+)?)\s+(?=(?:E|M|T|L)\b)/g, (_, v) => `${(parseFloat(v) * 1.609344).toFixed(1)} km `);
  return out;
}

// ---------------------------------------------------------------------------
// Build the precomputed data.
// ---------------------------------------------------------------------------
const categories = structured.categories.map(cat => {
  const weeks = {};
  for (const [wkStr, wk] of Object.entries(cat.weeks)) {
    if (wkStr === '1' && wk.raceWeek) {
      const raceWeekSegments = {};
      const raceWeekKm = {};
      const raceWeekMi = {};
      for (const [d, raw] of Object.entries(wk.raceWeek)) {
        raceWeekSegments[d] = parseSegments(raw);
        raceWeekKm[d] = toUnitsDetail(cleanDisplay(raw), 'km');
        raceWeekMi[d] = toUnitsDetail(cleanDisplay(raw), 'miles');
      }
      weeks['1'] = { raceWeekSegments, raceWeekKm, raceWeekMi };
      continue;
    }
    const w = {};
    if (wk.q1 != null) {
      w.q1Segments = parseSegments(wk.q1);
      w.q1Km = toUnitsDetail(cleanDisplay(wk.q1), 'km');
      w.q1Mi = toUnitsDetail(cleanDisplay(wk.q1), 'miles');
    }
    if (wk.q2 != null) {
      w.q2Segments = parseSegments(wk.q2);
      w.q2Km = toUnitsDetail(cleanDisplay(wk.q2), 'km');
      w.q2Mi = toUnitsDetail(cleanDisplay(wk.q2), 'miles');
    }
    weeks[wkStr] = w;
  }
  return { name: cat.name, minMiles: cat.minMiles, maxMiles: cat.maxMiles, weeks };
});

const out = {
  format: 'plans-2q-segments',
  version: 1,
  categories
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${categories.length} categories)`);
