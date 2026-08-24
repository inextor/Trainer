/**
 * Main App - Training Calendar (time-based, persisted) — multi-page (index + calendar)
 */
document.addEventListener('DOMContentLoaded', () => {
  let currentVDOT = 50;
  let currentCalendar = null;
  let currentWeekIndex = 0;
  let completed = {};

  const $ = id => document.getElementById(id);
  const isConfigPage = !!$('trainingForm');
  const isCalendarPage = !!$('calendarPanel');

  // ---- Load reference data ----
  async function loadData() {
    try {
      const [vdotRes, plansRes, segmentsRes] = await Promise.all([
        fetch('data/vdot.json', {cache: 'no-store'}).then(r => r.json()),
        fetch('data/plans.json', {cache: 'no-store'}).then(r => r.json()),
        fetch('data/plans.segments.json', {cache: 'no-store'}).then(r => r.json())
      ]);
      VDOTCalculator.setTable(vdotRes.vdot);
      window.PLANS = plansRes;
      window.PLANS_2Q_SEGMENTS = segmentsRes;
    } catch (e) {
      console.warn('Could not load reference data', e);
    }
  }

  // ---- Helpers ----
  function fmtMin(min) {
    if (min == null) return '';
    const m = Math.floor(min);
    const s = Math.round((min - m) * 60);
    return s ? `${m} min ${s}s` : `${m} min`;
  }
  function fmtDist(miles, units) {
    if (!miles) return '';
    return units === 'miles' ? `${miles.toFixed(1)} mi` : `${(miles * 1.609344).toFixed(1)} km`;
  }
  function isoDate(d) { return d.toISOString().slice(0, 10); }

  function updatePaceDisplay() {
    if (!$('currentVdot')) return;
    const paces = VDOTCalculator.getTrainingPaces(currentVDOT);
    const units = (document.querySelector('input[name="units"]:checked') || {}).value || 'km';
    $('currentVdot').textContent = currentVDOT;
    if ($('paceEasy')) {
      $('paceEasy').textContent = paces.easy;
      $('paceMarathon').textContent = paces.marathon;
      $('paceTempo').textContent = paces.tempo;
      $('paceInterval').textContent = paces.interval;
      $('paceRepetition').textContent = paces.rep;
      const kmOf = z => CalendarGenerator.fmtPace(CalendarGenerator.paceSecondsPerMile(currentVDOT, z));
      if ($('paceEasyKm')) $('paceEasyKm').textContent = `/km ${kmOf('E')}`;
      if ($('paceMarathonKm')) $('paceMarathonKm').textContent = `/km ${kmOf('M')}`;
      if ($('paceTempoKm')) $('paceTempoKm').textContent = `/km ${kmOf('T')}`;
      if ($('paceIntervalKm')) $('paceIntervalKm').textContent = `/km ${kmOf('I')}`;
      if ($('paceRepetitionKm')) $('paceRepetitionKm').textContent = `/km ${kmOf('R')}`;
    }
    const maxHr = parseInt($('maxHr')?.value, 10) || 190;
    const restHr = parseInt($('restHr')?.value, 10) || 60;
    if ($('hrGrid')) {
      const zones = CalendarGenerator.hrZones(currentVDOT, maxHr, restHr);
      const grid = $('hrGrid');
      grid.innerHTML = '';
      for (const z of ['E', 'M', 'T', 'I', 'R']) {
        const el = document.createElement('div');
        el.className = 'pace-item';
        el.innerHTML = `<span class="pace-type">${z}</span><span class="pace-value">${zones[z][0]}-${zones[z][1]}</span><span class="pace-km">bpm</span>`;
        grid.appendChild(el);
      }
    }
  }

  function updateMileageLabel() {
    if (!$('mileageLabel') || !$('mileageHint')) return;
    const units = document.querySelector('input[name="units"]:checked')?.value || 'km';
    $('mileageLabel').textContent = units === 'km' ? 'Current Weekly Distance' : 'Current Weekly Mileage';
    $('mileageHint').textContent = units === 'km' ? 'km per week' : 'miles per week';
  }

  function getConfig() {
    return {
      event: $('event')?.value || '',
      raceDate: $('raceDate')?.value || '',
      vdot: currentVDOT,
      daysPerWeek: parseInt(document.querySelector('input[name="daysPerWeek"]:checked')?.value || '4', 10),
      currentMileage: parseInt($('currentMileage')?.value || '32', 10),
      units: document.querySelector('input[name="units"]:checked')?.value || 'km',
      maxHr: parseInt($('maxHr')?.value || '190', 10),
      restHr: parseInt($('restHr')?.value || '60', 10)
    };
  }

  async function saveState() {
    const cfg = getConfig();
    // On calendar page the form is absent -> cfg will be empty; preserve stored config
    if (!cfg.event || !cfg.raceDate) {
      const existing = await Storage.load();
      if (existing && existing.config && existing.config.event) {
        await Storage.save({ config: existing.config, completed });
        return;
      }
    }
    await Storage.save({ config: cfg, completed });
  }

  // ---- Restore ----
  async function restoreConfigPage() {
    const saved = await Storage.load();
    if (saved && saved.config) {
      const c = saved.config;
      if ($('event')) $('event').value = c.event || '';
      if ($('raceDate')) $('raceDate').value = c.raceDate || '';
      const dpw = document.querySelector(`input[name="daysPerWeek"][value="${c.daysPerWeek}"]`);
      if (dpw) dpw.checked = true;
      if ($('currentMileage')) $('currentMileage').value = c.currentMileage ?? 32;
      const u = document.querySelector(`input[name="units"][value="${c.units || 'km'}"]`);
      if (u) u.checked = true;
      if ($('mileageLabel')) {
        $('mileageLabel').textContent = (c.units || 'km') === 'km' ? 'Current Weekly Distance' : 'Current Weekly Mileage';
        $('mileageHint').textContent = (c.units || 'km') === 'km' ? 'km per week' : 'miles per week';
      }
      if (c.maxHr && $('maxHr')) $('maxHr').value = c.maxHr;
      if (c.restHr && $('restHr')) $('restHr').value = c.restHr;
      if (c.vdot) { currentVDOT = c.vdot; if ($('vdotSlider')) $('vdotSlider').value = c.vdot; if ($('vdotValue')) $('vdotValue').textContent = c.vdot; }
      completed = saved.completed || {};
      // show link to calendar if a plan exists
      const link = $('viewPlanLink');
      if (link && c.event && c.raceDate) link.style.display = 'inline-block';
    }
  }

  async function restoreCalendarPage() {
    const saved = await Storage.load();
    const noPlan = $('noPlan');
    if (!saved || !saved.config || !saved.config.event || !saved.config.raceDate) {
      if (noPlan) noPlan.classList.remove('hidden');
      const panel = $('calendarPanel');
      if (panel) {
        // hide calendar chrome when no plan
        const hideIds = ['paceZones','calendarGrid','weekDetails','calendarSummary','countdown'];
        hideIds.forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
        const nav = document.querySelector('.calendar-nav');
        if (nav) nav.style.display = 'none';
      }
      return;
    }
    const c = saved.config;
    currentVDOT = c.vdot || 50;
    completed = saved.completed || {};
    // generate from saved config
    currentCalendar = CalendarGenerator.generateCalendar(c);
    currentWeekIndex = 0;
    if (noPlan) noPlan.classList.add('hidden');
    renderCalendar();
    updatePaceDisplay();
  }

  // ---- Tabs (config page) ----
  if (isConfigPage) {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.method-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const m = tab.dataset.method;
        const target = $(`${m}Method`);
        if (target) target.classList.add('active');
      });
    });
    if ($('vdotSlider')) $('vdotSlider').addEventListener('input', e => {
      currentVDOT = parseInt(e.target.value, 10);
      if ($('vdotValue')) $('vdotValue').textContent = currentVDOT;
      updatePaceDisplay();
    });
    if ($('calculateVdot')) $('calculateVdot').addEventListener('click', () => {
      const distance = $('raceDistance').value;
      const hours = $('raceHours').value;
      const minutes = $('raceMinutes').value;
      const seconds = $('raceSeconds').value;
      if (!minutes) { alert('Please enter a race time'); return; }
      const totalSeconds = VDOTCalculator.timeToSeconds(hours, minutes, seconds);
      const vdot = VDOTCalculator.calculateVDOT(distance, totalSeconds);
      if (vdot && vdot >= 30 && vdot <= 85) {
        currentVDOT = vdot;
        if ($('vdotSlider')) $('vdotSlider').value = vdot;
        if ($('vdotValue')) $('vdotValue').textContent = vdot;
        if ($('vdotResult')) { $('vdotResult').textContent = `Calculated VDOT: ${vdot}`; $('vdotResult').classList.remove('hidden'); }
        updatePaceDisplay();
      } else {
        alert('Could not calculate VDOT. Please check your time.');
      }
    });
    if ($('maxHr')) $('maxHr').addEventListener('input', updatePaceDisplay);
    if ($('restHr')) $('restHr').addEventListener('input', updatePaceDisplay);
    document.querySelectorAll('input[name="units"]').forEach(r => r.addEventListener('change', () => { updateMileageLabel(); updatePaceDisplay(); }));
    updateMileageLabel();

    const form = $('trainingForm');
    if (form) form.addEventListener('submit', async e => {
      e.preventDefault();
      const cfg = getConfig();
      if (!cfg.event || !cfg.raceDate) { alert('Please fill in all required fields'); return; }
      // also save vdot
      cfg.vdot = currentVDOT;
      await Storage.save({ config: cfg, completed });
      // Navigate to calendar page (real navigation, not SPA)
      window.location.href = 'calendar.html';
    });

    const resetBtn = $('resetPlan');
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      await Storage.clear();
      completed = {};
      const link = $('viewPlanLink');
      if (link) link.style.display = 'none';
      alert('Saved plan cleared.');
    });
  }

  // ---- Calendar page rendering ----
  function renderCalendar() {
    if (!currentCalendar || !isCalendarPage) return;
    const week = currentCalendar.weeks[currentWeekIndex];
    const units = currentCalendar.units;
    if ($('weekIndicator')) $('weekIndicator').textContent = `Week ${week.weekNum} of ${currentCalendar.totalWeeks} (${week.weeksUntilRace} wk to race)`;
    if ($('countdown')) $('countdown').textContent = `Race: ${currentCalendar.raceDate.toLocaleDateString()} · Phase: ${week.phase}`;

    const grid = $('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';
    CalendarGenerator.DAYS.forEach(day => {
      const h = document.createElement('div');
      h.className = 'day-header';
      h.textContent = day;
      grid.appendChild(h);
    });

    week.days.forEach(day => {
      const cell = document.createElement('div');
      cell.className = `day-cell ${day.type === 'rest' ? 'empty' : ''}`;
      const dateStr = day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const key = isoDate(day.date);
      const done = completed[key];
      const time = day.totalMinutes ? fmtMin(day.totalMinutes) : '';
      const dist = day.distanceMiles ? fmtDist(day.distanceMiles, units) : '';
      cell.innerHTML = `
        <div class="day-card-header">
          <div class="day-date-group"><span class="day-weekday-mobile">${day.dayName}</span><span class="day-number"> ${dateStr}</span></div>
          ${day.type !== 'rest' ? `<label class="done-chk"><input type="checkbox" data-date="${key}" ${done ? 'checked' : ''}> done</label>` : ''}
        </div>
        <div class="day-workout-line"><span class="workout-type ${day.type}">${day.label}</span>${time ? ` <span class="workout-time">${time}</span>` : ''}${dist ? ` <span class="workout-dist">· ${dist}</span>` : ''}</div>
        ${day.detail ? `<div class="workout-detail">${day.detail}</div>` : ''}
      `;
      grid.appendChild(cell);
    });

    grid.querySelectorAll('.done-chk input').forEach(cb => {
      cb.addEventListener('change', async e => {
        const k = e.target.dataset.date;
        if (e.target.checked) completed[k] = true; else delete completed[k];
        await saveState();
      });
    });

    week.days.forEach((day, di) => {
      const cell = grid.children[7 + di];
      if (!cell || cell.classList.contains('empty')) return;
      cell.addEventListener('click', e => {
        if (e.target.closest('.done-chk')) return;
        if (window.matchMedia('(max-width: 600px)').matches) {
          const iso = day.date.toISOString().slice(0,10);
          window.location.href = `day.html?date=${iso}`;
        } else {
          openDayDialog(day);
        }
      });
    });

    if ($('weekDetails')) $('weekDetails').innerHTML = `
      <h3>Week ${week.weekNum} Summary ${week.note ? `<span class="week-note">${week.note}</span>` : ''}</h3>
      <div class="week-summary">
        <div class="summary-item"><span class="label">Total Time</span><span class="value">${fmtMin(week.totalMinutes)}</span></div>
        <div class="summary-item"><span class="label">Total Dist</span><span class="value">${fmtDist(week.totalMiles, units)}</span></div>
        <div class="summary-item"><span class="label">Quality</span><span class="value">${week.qualityCount}</span></div>
        <div class="summary-item"><span class="label">Phase</span><span class="value">${week.phase}</span></div>
      </div>`;

    renderPhaseTimeline(week);
  }

  function renderPhaseTimeline(week) {
    const el = $('calendarSummary');
    if (!el) return;
    const order = ['build', 'peak', 'taper'];
    const labels = { build: 'Build', peak: 'Peak', taper: 'Taper' };
    const currentIdx = order.indexOf(week.phase);
    const blocks = order.map((p, i) => {
      const label = labels[p];
      const isCurrent = i === currentIdx;
      const isPast = i < currentIdx;
      const cls = `phase-block ${p}` + (isCurrent ? ' current' : '') + (isPast ? ' past' : '');
      const marker = isCurrent ? '●' : isPast ? '✓' : '○';
      return `<div class="${cls}"><span class="phase-marker">${marker}</span>${label}</div>`;
    }).join('');
    const phaseLabel = labels[week.phase] || week.phase;
    el.innerHTML = `
      <h3>Phases</h3>
      <div class="phase-timeline">${blocks}</div>
      <p class="phase-caption">You're in the <strong>${phaseLabel}</strong> phase · Week ${week.weekNum} of ${currentCalendar.totalWeeks}</p>
      <p class="phase-hint">Tap a day for details. Progress is saved automatically.</p>`;
  }

  // ---- Day detail dialog (<dialog>) ----
  const dialog = $('dayDialog');
  const dialogContent = $('dayDialogContent');
  const closeBtn = $('closeDayDialog');
  if (closeBtn && dialog) closeBtn.addEventListener('click', () => dialog.close());
  if (dialog) dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

  const ZONE_NAMES = { E:'Easy', M:'Marathon', T:'Tempo', I:'Interval', R:'Repetition', L:'Long', W:'Walk', ST:'Strides', rest:'Rest' };
  function fmtPaceMile(spm){ const m=Math.floor(spm/60); const s=Math.round(spm%60); return `${m}:${String(s).padStart(2,'0')}`; }
  function paceForZone(zone, units){
    if (zone==='W' || zone==='rest' || zone==='ST') return '';
    const spm = CalendarGenerator.paceSecondsPerMile(currentVDOT, zone);
    return units==='km' ? CalendarGenerator.fmtPace(spm)+'/km' : fmtPaceMile(spm)+'/mi';
  }
  function zoneClassFor(part) {
    if (/ST\b/i.test(part)) return 'repetition';
    if (/\bR\b/i.test(part)) return 'repetition';
    if (/\bI\b/i.test(part)) return 'interval';
    if (/\bT\b/i.test(part)) return 'tempo';
    if (/\bM\b/i.test(part)) return 'marathon';
    if (/\bL\b/i.test(part)) return 'long';
    if (/\bW\b|rest|jg|Walk/i.test(part)) return 'rest';
    if (/\bE\b/i.test(part)) return 'easy';
    return 'easy';
  }
  function zoneLabelFor(part) {
    if (/ST\b/i.test(part)) return 'ST';
    if (/\bR\b/i.test(part)) return 'R';
    if (/\bI\b/i.test(part)) return 'I';
    if (/\bT\b/i.test(part)) return 'T';
    if (/\bM\b/i.test(part)) return 'M';
    if (/\bL\b/i.test(part)) return 'L';
    if (/\bW\b|\brest\b|\bjg\b|Walk/i.test(part)) return 'W';
    if (/\bE\b/i.test(part)) return 'E';
    return 'E';
  }
  function humanizePart(part) {
    let s = part
      .replace(/×/g, 'x')
      .replace(/\bw\//g, 'with ')
      .replace(/\bjg\b/gi, 'Jog')
      .replace(/\brecoveries\b/gi, 'recovery')
      .replace(/\brec\b/gi, 'recovery')
      .replace(/\bmin\b/gi, 'Min')
      .replace(/\bST\b/g, 'Strides')
      .replace(/\bR\b/g, 'Repetition')
      .replace(/\bI\b/g, 'Interval')
      .replace(/\bT\b/g, 'Tempo')
      .replace(/\bM\b/g, 'Marathon')
      .replace(/\bE\b/g, 'Easy')
      .replace(/\bL\b/g, 'Long')
      .replace(/\bW\b/g, 'Walk');
    s = s.replace(/\s+/g, ' ');
    s = s.replace(/\s*\(\s*/g, ' (');
    s = s.replace(/\s*\)\s*/g, ' ) ');
    return s.trim();
  }
  function parseDetailSteps(detail) {
    if (!detail) return [];
    return detail.split(/\s*\+\s*(?![^()]*\))/).map(s => s.trim()).filter(Boolean);
  }
  function openDayDialog(day) {
    if (!dialog || !dialogContent) return;
    const units = currentCalendar.units;
    const time = day.totalMinutes ? fmtMin(day.totalMinutes) : '';
    const dist = day.distanceMiles ? fmtDist(day.distanceMiles, units) : '';
    const dateStr = day.date.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
    let stepsHtml = '';
    if (day.segments && day.segments.length && !day.detail) {
      const n = day.segments.length;
      stepsHtml = day.segments.map((seg,i) => {
        const zone = seg.p || 'E';
        const clsMap = { E:'easy', M:'marathon', T:'tempo', I:'interval', R:'repetition', L:'long', W:'rest', ST:'repetition' };
        const cls = clsMap[zone] || 'easy';
        const friendly = ZONE_NAMES[zone] || zone;
        const isWarm = i===0 && zone==='E';
        const isCool = i===n-1 && zone==='E';
        const role = isWarm ? 'Warm-up' : isCool ? 'Cool-down' : '';
        const pace = paceForZone(zone, units);
        const amtRaw = seg.m ? (seg.m >=1 ? `${Math.round(seg.m)} Min` : `${Math.round(seg.m*60)} s`) : seg.note || '';
        const amt = humanizePart(amtRaw);
        return `<li class="day-step"><span class="zone-chip ${cls}">${zone}</span><span class="step-text">${amt} . ${friendly}${role ? ' - '+role : ''}${pace ? ' . '+pace : ''}</span></li>`;
      }).join('');
    } else {
      const parts = parseDetailSteps(day.detail);
      stepsHtml = parts.map((part,i) => {
        const zone = zoneLabelFor(part);
        const cls = zoneClassFor(part);
        const isWarm = i===0 && zone==='E';
        const isCool = i===parts.length-1 && zone==='E';
        const friendly = ZONE_NAMES[zone] || zone;
        const role = isWarm ? 'Warm-up' : isCool ? 'Cool-down' : '';
        const pace = paceForZone(zone, units);
        const cleanRaw = part.replace(/\s+[EIMTRLW]\s*$/i, '').trim() || part;
        const clean = humanizePart(cleanRaw);
        return `<li class="day-step"><span class="zone-chip ${cls}">${zone}</span><span class="step-text">${clean} . ${friendly}${role ? ' - '+role : ''}${pace ? ' . '+pace : ''}</span></li>`;
      }).join('');
    }
    dialogContent.innerHTML = `
      <h3>${day.label} — ${dateStr}</h3>
      <div class="dialog-meta">${time ? 'Total for the day: '+time+' · ' : ''}${dist ? dist+' · ' : ''}${day.type}${day.note ? ' · '+day.note : ''}</div>
      ${time ? '<p style="font-size:0.8rem; color:var(--gray-500); margin:8px 0 10px;">Total includes warm-up, main set and cool-down. For example, “5 × 4 Min.” is 20 min work + 15 min jog = 35 min, plus the Easy kms.</p>' : ''}
      <ul class="day-steps">${stepsHtml || '<li class="day-step"><span class="step-text">'+(day.detail||'Rest')+'</span></li>'}</ul>
    `;
    dialog.showModal();
  }

  if (isCalendarPage) {
    const prevBtn = $('prevWeek');
    const nextBtn = $('nextWeek');
    if (prevBtn) prevBtn.addEventListener('click', () => { if (currentWeekIndex > 0) { currentWeekIndex--; renderCalendar(); } });
    if (nextBtn) nextBtn.addEventListener('click', () => { if (currentCalendar && currentWeekIndex < currentCalendar.weeks.length - 1) { currentWeekIndex++; renderCalendar(); } });
  } else {
    // config page: prev/next not needed
    const prevBtn = $('prevWeek');
    const nextBtn = $('nextWeek');
    if (prevBtn) prevBtn.addEventListener('click', () => {});
    if (nextBtn) nextBtn.addEventListener('click', () => {});
  }

  // ---- Export / Import plan ----
  function setupPlanIO() {
    const exportBtn = $('exportPlan');
    const importBtn = $('importPlan');
    const importFile = $('importFile');
    const status = $('planIoStatus');
    const setStatus = (msg, isErr) => {
      if (!status) return;
      status.textContent = msg || '';
      status.style.color = isErr ? 'var(--danger)' : 'var(--success)';
    };

    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          const name = await PlanIO.downloadPlan();
          if (name) setStatus(`Exported "${name}".`);
          else setStatus('No saved plan to export yet.', true);
        } catch (e) {
          setStatus(`Export failed: ${e.message}`, true);
        }
      });
    }

    if (importBtn) {
      importBtn.addEventListener('click', () => {
        if (importFile) importFile.click();
      });
    }

    if (importFile) {
      importFile.addEventListener('change', async e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const { config, completed } = await PlanIO.parsePlanFile(file);
          await Storage.save({ config, completed });
          setStatus(`Imported "${file.name}".`);
          // Reload to render the imported plan.
          location.reload();
        } catch (err) {
          setStatus(`Import failed: ${err.message}`, true);
        } finally {
          e.target.value = '';
        }
      });
    }
  }

  // Default race date = 18 weeks out
  if ($('raceDate') && !$('raceDate').value) {
    const def = new Date();
    def.setDate(def.getDate() + 18 * 7);
    $('raceDate').valueAsDate = def;
  }

  // Init
  setupPlanIO();
  loadData().then(() => {
    updatePaceDisplay();
    if (isConfigPage) {
      restoreConfigPage();
    } else if (isCalendarPage) {
      restoreCalendarPage();
    }
  });
});
