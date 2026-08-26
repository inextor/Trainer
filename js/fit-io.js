/**
 * FitIO - Export a single training day as a .fit (FIT) file for Intervals.icu.
 *
 * A FIT file is a sequence of message definitions + data records, wrapped in a
 * 14-byte header and (optionally) a 2-byte CRC trailer. This module implements a
 * small, dependency-free encoder that produces a file Intervals.icu (and other
 * FIT consumers) can import as a planned run workout.
 *
 * Record layout (FIT profile v2):
 *   - Header: 14 bytes (size, protocol 2.0, profile version, data size, ".FIT")
 *   - file_id (msg 0): identifies this as a workout file
 *   - workout (msg 26): one workout with sport + step count + name
 *   - workout_step (msg 27): one record per interval/step of the workout
 *
 * Base types used here:
 *   enum    = 0x00 (1 byte)
 *   uint8   = 0x02
 *   uint16  = 0x84 (endian-capable, 2 bytes)
 *   uint32  = 0x86 (endian-capable, 4 bytes)
 *   string  = 0x07 (N bytes, NUL-terminated, no 'invalid' field)
 *   timestamp (date_time) = 0x86 (uint32, seconds since FIT epoch)
 *
 * Architecture byte 0 = little-endian; all multi-byte numerics are written LE.
 */
const FitIO = (() => {
  // ---- FIT constants ----
  const MSG_FILE_ID = 0;
  const MSG_WORKOUT = 26;
  const MSG_WORKOUT_STEP = 27;

  // file_id.type
  const FILE_TYPE_WORKOUT = 5;
  // workout.sport / workout_step.sport
  const SPORT_RUNNING = 1;
  // workout_step.intensity
  const INTENSITY_WARMUP = 0;
  const INTENSITY_COOLDOWN = 2;
  const INTENSITY_REST = 3;
  const INTENSITY_ACTIVE = 5;
  // workout_step.duration_type
  const DURATION_TIME = 0;      // duration_value = seconds
  const DURATION_DISTANCE = 1;  // duration_value = meters * 100
  // workout_step.target_type (FIT enum `wkt_step_target`)
  const TARGET_SPEED = 0;       // target_value = speed in m/s * 1000 (mm/s)

  // FIT epoch (seconds between 1989-12-31 and 1970-01-01, UTC)
  const FIT_EPOCH = 631065600;
  const M_PER_MILE = 1609.344;

  // Fixed byte width for string fields (FIT strings are fixed-size per message:
  // the definition declares one width and every record is padded to it with NULs).
  const STR_SIZE = 32;

  // base type byte widths (for numeric fields; strings use STR_SIZE)
  const BASE_SZ = { 0x00: 1, 0x02: 1, 0x84: 2, 0x86: 4, 0x07: STR_SIZE };

  // ---- low-level writer ----
  function Writer() {
    this.bytes = [];
  }
  Writer.prototype.u8 = function (v) { this.bytes.push(v & 0xff); };
  Writer.prototype.u16le = function (v) { this.bytes.push(v & 0xff, (v >> 8) & 0xff); };
  Writer.prototype.u32le = function (v) {
    this.bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  };
  Writer.prototype.raw = function (arr) { for (let i = 0; i < arr.length; i++) this.bytes.push(arr[i] & 0xff); };

  /**
   * Append a definition message + its data records.
   * @param {Writer} w
   * @param {number} localMsgType  local message number (0..15)
   * @param {number} globalMsgNum  global message number
   * @param {Array<{num:number, type:number, size:number, value:*}>} fields
   * @param {Array<Array<*>>} rows  one array of raw values per data record (aligned to fields)
   */
  function appendMessage(w, localMsgType, globalMsgNum, fields, rows) {
    if (!rows || !rows.length) return;
    // definition
    w.u8(0x40 | localMsgType);      // header: definition, local type
    w.u8(0);                        // reserved
    w.u8(1);                        // architecture: little-endian
    w.u16le(globalMsgNum);          // global message number
    w.u8(fields.length);            // number of fields
    for (const f of fields) {
      w.u8(f.num);
      w.u8(f.size || BASE_SZ[f.type]);
      w.u8(f.type);
    }
    // data records
    for (const row of rows) {
      const hdr = localMsgType;     // data message: normal header, local type
      w.u8(hdr);
      fields.forEach((f, i) => {
        const v = row[i];
        switch (f.type) {
          case 0x00: w.u8(v); break;                       // enum
          case 0x02: w.u8(v); break;                       // uint8
          case 0x84: w.u16le(v); break;                    // uint16
          case 0x86: w.u32le(v); break;                    // uint32 / date_time
          case 0x07: {                                     // string (fixed-width, NUL-padded)
            const s = String(v == null ? '' : v).slice(0, STR_SIZE - 1);
            const bytes = [];
            for (let j = 0; j < s.length; j++) bytes.push(s.charCodeAt(j) & 0xff);
            while (bytes.length < STR_SIZE) bytes.push(0);
            w.raw(bytes);
            break;
          }
          default: w.raw(new Array(f.size || 1).fill(0));
        }
      });
    }
  }

  // ---- zone / pace helpers ----
  // seconds per KILOMETER (FIT target speeds are m/s or km/h; we store /km pace
  // in custom_target fields and a human pace in notes).
  function paceSecPerKm(spm) {
    if (spm == null || !isFinite(spm) || spm <= 0) return null;
    return spm / 1.609344;
  }

  // Build a "mm:ss /km" string from seconds/mile.
  function fmtPaceKm(spm) {
    const spk = paceSecPerKm(spm);
    if (spk == null) return '';
    const m = Math.floor(spk / 60);
    const s = Math.round(spk % 60);
    return `${m}:${String(s).padStart(2, '0')}/km`;
  }

  /**
   * Resolve a single day's segments into a flat list of FIT workout_step rows
   * plus the total valid step count. Mirrors the app's expand/render semantics.
   */
  function resolveSteps(day, vdot) {
    const segs = day.segments || [];
    if (!segs.length) return null; // rest day -> no export
    const steps = [];
    const n = segs.length;

    const push = (zone, intensity, durType, durValue, targetType, targetValue, name) => {
      steps.push({ zone, intensity, durType, durValue, targetType, targetValue, name });
    };

    const durationFor = (seg) => {
      if (seg.m != null) {
        // time-based
        const secs = Math.round(seg.m * 60);
        return { type: DURATION_TIME, value: secs };
      }
      if (seg.mi != null) {
        // distance-based: duration_value is meters * 100
        const m100 = Math.round(seg.mi * M_PER_MILE * 100);
        return { type: DURATION_DISTANCE, value: m100 };
      }
      return { type: DURATION_TIME, value: 0 };
    };

    const zoneTarget = (zone) => {
      const spm = (typeof CalendarGenerator !== 'undefined' && CalendarGenerator.paceSecondsPerMile)
        ? CalendarGenerator.paceSecondsPerMile(vdot, zone)
        : null;
      return spm;
    };

    segs.forEach((seg, i) => {
      const zone = seg.p || 'E';
      // warmup / cooldown heuristic (same as app.js / day.html)
      const isWarm = i === 0 && (zone === 'E' || zone === 'L');
      const isCool = i === n - 1 && (zone === 'E' || zone === 'L') && n > 2;

      const intensity = zone === 'W' || zone === 'rest'
        ? INTENSITY_REST
        : isWarm ? INTENSITY_WARMUP : isCool ? INTENSITY_COOLDOWN : INTENSITY_ACTIVE;

      // unroll repetitions: N × (work + recovery)
      const times = seg.times && seg.times > 1 ? seg.times : 1;
      for (let t = 0; t < times; t++) {
        if (zone === 'ST') {
          // strides: active, time from m or a nominal 0.3 min
          const m = seg.m != null ? seg.m : (seg.dur || 0.3);
          const d = durationFor({ m });
          push(zone, INTENSITY_ACTIVE, d.type, d.value, 0, 0,
            seg.note || `${times} strides`);
        } else if (zone === 'W' || zone === 'rest') {
          const d = durationFor(seg);
          push(zone, INTENSITY_REST, d.type, d.value, 0, 0, 'rest');
        } else {
          const spm = zoneTarget(zone);
          const spk = paceSecPerKm(spm);
          const d = durationFor(seg);
          const stepName = seg.capMin != null
            ? `${zone} · lesser of ${(seg.mi != null ? (seg.mi * 1.609344).toFixed(1) : '?')} km / ${seg.capMin} min`
            : `${zone}${spk ? ' @ ' + fmtPaceKm(spm) : ''}`;
          // target speed in mm/s (FIT target_type=speed stores m/s * 1000)
          const tgtSpeed = spk != null ? Math.round(1e6 / spk) : 0;
          push(zone, intensity, d.type, d.value,
            tgtSpeed > 0 ? TARGET_SPEED : 0,
            tgtSpeed, stepName);
        }

        // recovery interval after each repetition (except the last)
        if (seg.rec && t < times - 1) {
          const rz = seg.rec.p === 'W' || seg.rec.p === 'rest' ? 'W' : seg.rec.p;
          const rIntensity = rz === 'W' || rz === 'rest' ? INTENSITY_REST : INTENSITY_ACTIVE;
          const rd = durationFor(seg.rec);
          push(rz, rIntensity, rd.type, rd.value, 0, 0,
            (rz === 'W' || rz === 'rest') ? 'recovery rest' : 'recovery jog');
        }
      }
    });

    return steps;
  }

  /**
   * Encode a single training day as a FIT ArrayBuffer.
   * @param {Object} day       day object (segments, label, date, ...)
   * @param {number} vdot      VDOT for pace computation
   * @returns {ArrayBuffer|null}
   */
  function exportFitForDay(day, vdot) {
    if (!day) return null;
    const steps = resolveSteps(day, vdot);
    if (!steps || !steps.length) return null;

    const w = new Writer();
    const ts = Math.floor(Date.now() / 1000) - FIT_EPOCH; // seconds since FIT epoch
    const name = String(day.label || 'Training Day').slice(0, STR_SIZE - 1);

    // file_id
    const fileIdFields = [
      { num: 0, type: 0x00, value: FILE_TYPE_WORKOUT },   // type
      { num: 1, type: 0x84, value: 255 },                  // manufacturer (development)
      { num: 2, type: 0x84, value: 1 },                    // product
      { num: 4, type: 0x86, value: ts }                    // time_created
    ];
    appendMessage(w, 0, MSG_FILE_ID, fileIdFields, [
      [FILE_TYPE_WORKOUT, 255, 1, ts]
    ]);

    // workout
    const workoutFields = [
      { num: 4, type: 0x00, value: SPORT_RUNNING },        // sport
      { num: 7, type: 0x84, value: steps.length },          // num_valid_steps
      { num: 8, type: 0x07, value: name }                   // wkt_name
    ];
    appendMessage(w, 1, MSG_WORKOUT, workoutFields, [
      [SPORT_RUNNING, steps.length, name]
    ]);

    // workout_step (one field layout; rows = one per step)
    const stepFields = [
      { num: 5, type: 0x00, value: 0 },          // duration_type
      { num: 6, type: 0x86, value: 0 },          // duration_value
      { num: 7, type: 0x00, value: 0 },          // target_type
      { num: 8, type: 0x86, value: 0 },          // target_value
      { num: 11, type: 0x00, value: 0 },         // intensity
      { num: 1, type: 0x07, value: '' }          // wkt_step_name (string)
    ];
    const stepRows = steps.map((s) => [
      s.durType, s.durValue, s.targetType, s.targetValue, s.intensity, s.name
    ]);
    appendMessage(w, 2, MSG_WORKOUT_STEP, stepFields, stepRows);

    // assemble header + body + CRC(0)
    const body = w.bytes;
    const dataSize = body.length;
    const totalSize = 14 + dataSize + 2; // header + body + CRC

    const out = new Uint8Array(totalSize);
    const dv = new DataView(out.buffer);
    // header (14 bytes)
    out[0] = 14;                          // header_size
    out[1] = 0x20;                        // protocol_version 2.0
    dv.setUint16(2, 2100, true);          // profile_version (LE)
    dv.setUint32(4, dataSize, true);      // data_size (LE)
    out[8] = 0x2e; out[9] = 0x46; out[10] = 0x49; out[11] = 0x54; // ".FIT"
    for (let i = 0; i < body.length; i++) out[14 + i] = body[i];
    // CRC = 0 (allowed for reading; document in header comment)
    out[12] = 0;
    out[13] = 0;

    return out.buffer;
  }

  // ---- download ----
  function defaultFileName(dateISO) {
    const d = dateISO || new Date().toISOString().slice(0, 10);
    return `trainingday-${d}.fit`;
  }

  /**
   * Trigger a browser download of a single day as .fit. Returns file name or null.
   * @param {Object} day
   * @param {number} vdot
   * @param {string} units  'km' | 'miles' (unused by encoder; kept for signature parity)
   */
  function downloadFitForDay(day, vdot) {
    const buf = exportFitForDay(day, vdot);
    if (!buf) return null;
    const iso = day && day.date ? new Date(day.date).toISOString().slice(0, 10) : null;
    const name = defaultFileName(iso);
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }

  return { exportFitForDay, downloadFitForDay, defaultFileName };
})();
