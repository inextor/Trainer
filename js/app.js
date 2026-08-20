/**
 * Main App - Training Calendar (time-based, persisted).
 */
document.addEventListener('DOMContentLoaded', () => {
  let currentVDOT = 50;
  let currentCalendar = null;
  let currentWeekIndex = 0;
  let completed = {}; // { 'YYYY-MM-DD': true }

  const $ = id => document.getElementById(id);

  // ---- Load reference data ----
  async function loadData() {
    try {
      const [vdotRes, plansRes] = await Promise.all([
        fetch('data/vdot.json').then(r => r.json()),
        fetch('data/plans.json').then(r => r.json())
      ]);
      VDOTCalculator.setTable(vdotRes.vdot);
      window.PLANS = plansRes;
    } catch (e) {
      console.warn('Could not load reference data', e);
    }
  }

  // ---- Restore saved state ----
  async function restore() {
    const saved = await Storage.load();
    if (saved && saved.config) {
      const c = saved.config;
      $('event').value = c.event;
      $('raceDate').value = c.raceDate;
      document.querySelector(`input[name="daysPerWeek"][value="${c.daysPerWeek}"]`).checked = true;
      $('currentMileage').value = c.currentMileage;
      document.querySelector(`input[name="units"][value="${c.units || 'km'}"]`).checked = true;
      if (c.maxHr) $('maxHr').value = c.maxHr;
      if (c.restHr) $('restHr').value = c.restHr;
      if (c.vdot) { currentVDOT = c.vdot; $('vdotSlider').value = c.vdot; }
      completed = saved.completed || {};
      if (c.raceDate) {
        generate(true);
      }
    }
  }

  // ---- Tabs ----
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.method-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      $(`${tab.dataset.method}Method`).classList.add('active');
    });
  });

  $('vdotSlider').addEventListener('input', e => {
    currentVDOT = parseInt(e.target.value, 10);
    $('vdotValue').textContent = currentVDOT;
    updatePaceDisplay();
  });

  $('calculateVdot').addEventListener('click', () => {
    const distance = $('raceDistance').value;
    const hours = $('raceHours').value;
    const minutes = $('raceMinutes').value;
    const seconds = $('raceSeconds').value;
    if (!minutes) { alert('Please enter a race time'); return; }
    const totalSeconds = VDOTCalculator.timeToSeconds(hours, minutes, seconds);
    const vdot = VDOTCalculator.calculateVDOT(distance, totalSeconds);
    if (vdot && vdot >= 30 && vdot <= 85) {
      currentVDOT = vdot;
      $('vdotSlider').value = vdot;
      $('vdotValue').textContent = vdot;
      $('vdotResult').textContent = `Calculated VDOT: ${vdot}`;
      $('vdotResult').classList.remove('hidden');
      updatePaceDisplay();
    } else {
      alert('Could not calculate VDOT. Please check your time.');
    }
  });

  function fmtMin(min) {
    if (min == null) return '';
    const m = Math.floor(min);
    const s = Math.round((min - m) * 60);
    return s ? `${m} min ${s}s` : `${m} min`;
  }
  function fmtDist(km, units) {
    if (!km) return '';
    return units === 'miles' ? `${(km / 1.609344).toFixed(1)} mi` : `${km.toFixed(1)} km`;
  }
  function isoDate(d) { return d.toISOString().slice(0, 10); }

  function updatePaceDisplay() {
    const paces = VDOTCalculator.getTrainingPaces(currentVDOT);
    const units = (document.querySelector('input[name="units"]:checked') || {}).value || 'km';
    $('currentVdot').textContent = currentVDOT;
    $('paceEasy').textContent = paces.easy;
    $('paceMarathon').textContent = paces.marathon;
    $('paceTempo').textContent = paces.tempo;
    $('paceInterval').textContent = paces.interval;
    $('paceRepetition').textContent = paces.rep;
    // km equivalents
    const kmOf = z => CalendarGenerator.fmtPace(CalendarGenerator.paceSecondsPerMile(currentVDOT, z));
    $('paceEasyKm').textContent = `/km ${kmOf('E')}`;
    $('paceMarathonKm').textContent = `/km ${kmOf('M')}`;
    $('paceTempoKm').textContent = `/km ${kmOf('T')}`;
    $('paceIntervalKm').textContent = `/km ${kmOf('I')}`;
    $('paceRepetitionKm').textContent = `/km ${kmOf('R')}`;

    // HR zones
    const maxHr = parseInt($('maxHr').value, 10) || 190;
    const restHr = parseInt($('restHr').value, 10) || 60;
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

  $('maxHr').addEventListener('input', updatePaceDisplay);
  $('restHr').addEventListener('input', updatePaceDisplay);

  // ---- Generate ----
  function getConfig() {
    return {
      event: $('event').value,
      raceDate: $('raceDate').value,
      vdot: currentVDOT,
      daysPerWeek: parseInt(document.querySelector('input[name="daysPerWeek"]:checked').value, 10),
      currentMileage: parseInt($('currentMileage').value, 10),
      units: document.querySelector('input[name="units"]:checked').value,
      maxHr: parseInt($('maxHr').value, 10),
      restHr: parseInt($('restHr').value, 10)
    };
  }

  function generate(skipScroll) {
    const config = getConfig();
    if (!config.event || !config.raceDate) { alert('Please fill in all required fields'); return; }
    currentCalendar = CalendarGenerator.generateCalendar(config);
    currentWeekIndex = 0;
    $('calendarPanel').classList.remove('hidden');
    renderCalendar();
    updatePaceDisplay();
    saveState();
    if (!skipScroll) $('calendarPanel').scrollIntoView({ behavior: 'smooth' });
  }

  $('trainingForm').addEventListener('submit', e => { e.preventDefault(); generate(false); });

  $('resetPlan').addEventListener('click', async () => {
    await Storage.clear();
    completed = {};
    $('calendarPanel').classList.add('hidden');
    alert('Saved plan cleared.');
  });

  async function saveState() {
    await Storage.save({ config: getConfig(), completed });
  }

  // ---- Render ----
  function renderCalendar() {
    if (!currentCalendar) return;
    const week = currentCalendar.weeks[currentWeekIndex];
    const units = currentCalendar.units;
    $('weekIndicator').textContent = `Week ${week.weekNum} of ${currentCalendar.totalWeeks} (${week.weeksUntilRace} wk to race)`;
    $('countdown').textContent = `Race: ${currentCalendar.raceDate.toLocaleDateString()} · Phase: ${week.phase}`;

    const grid = $('calendarGrid');
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
      const dist = day.distanceKm ? fmtDist(day.distanceKm, units) : '';
      cell.innerHTML = `
        <div class="day-number">${dateStr}</div>
        <div class="workout-type ${day.type}">${day.label}</div>
        ${time ? `<div class="workout-time">${time}</div>` : ''}
        ${dist ? `<div class="workout-dist">${dist}</div>` : ''}
        ${day.detail ? `<div class="workout-detail">${day.detail}</div>` : ''}
        ${day.type !== 'rest' ? `<label class="done-chk"><input type="checkbox" data-date="${key}" ${done ? 'checked' : ''}> done</label>` : ''}
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

    // Week details
    $('weekDetails').innerHTML = `
      <h3>Week ${week.weekNum} Summary ${week.note ? `<span class="week-note">${week.note}</span>` : ''}</h3>
      <div class="week-summary">
        <div class="summary-item"><span class="label">Total Time</span><span class="value">${fmtMin(week.totalMinutes)}</span></div>
        <div class="summary-item"><span class="label">Total Dist</span><span class="value">${fmtDist(week.totalKm, units)}</span></div>
        <div class="summary-item"><span class="label">Quality</span><span class="value">${week.qualityCount}</span></div>
        <div class="summary-item"><span class="label">Phase</span><span class="value">${week.phase}</span></div>
      </div>`;

    renderPhaseTimeline();
  }

  function renderPhaseTimeline() {
    const phases = [
      ['build', 'Build'], ['peak', 'Peak'], ['taper', 'Taper']
    ];
    $('calendarSummary').innerHTML = `
      <h3>Training Phases</h3>
      <div class="phase-timeline">
        ${phases.map(([p, lbl]) => `<div class="phase-block ${p}">${lbl}</div>`).join('')}
      </div>
      <p style="color:var(--gray-500);font-size:0.9rem;">Novice plan is time-based (Table 16.2). Toggle workouts as done; progress is saved automatically.</p>`;
  }

  $('prevWeek').addEventListener('click', () => {
    if (currentWeekIndex > 0) { currentWeekIndex--; renderCalendar(); }
  });
  $('nextWeek').addEventListener('click', () => {
    if (currentCalendar && currentWeekIndex < currentCalendar.weeks.length - 1) { currentWeekIndex++; renderCalendar(); }
  });

  // Default race date = 18 weeks out (novice plan length)
  const def = new Date();
  def.setDate(def.getDate() + 18 * 7);
  $('raceDate').valueAsDate = def;

  // Init
  loadData().then(() => {
    updatePaceDisplay();
    restore();
  });
});
