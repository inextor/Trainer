/**
 * Plan IO - Export / import the training plan as a JSON file.
 * A "plan" is the full persisted state: { config, completed, exportedAt }.
 */
const PlanIO = (() => {
  const FILE_EXT = 'json';
  const SUFFIX = 'training-plan';

  function safeEventName() {
    return 'training-plan';
  }

  function defaultFileName() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${SUFFIX}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${FILE_EXT}`;
  }

  /** Build the serializable plan object from current stored state. */
  async function exportPlan() {
    const saved = await Storage.load();
    if (!saved || !saved.config || !saved.config.event || !saved.config.raceDate) {
      return null;
    }
    return {
      format: 'training-plan',
      version: 1,
      exportedAt: new Date().toISOString(),
      config: saved.config,
      completed: saved.completed || {}
    };
  }

  /** Trigger a browser download of the plan as a .json file. Returns file name or null. */
  async function downloadPlan() {
    const plan = await exportPlan();
    if (!plan) return null;
    const json = JSON.stringify(plan, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return a.download;
  }

  /** Parse a File object into a valid plan, or throw an error. */
  async function parsePlanFile(file) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('The file is not valid JSON.');
    }
    if (!data || typeof data !== 'object') {
      throw new Error('Unrecognised plan file.');
    }
    // Accept both the native wrapper and a bare {config, completed} object.
    const cfg = data.config || data;
    if (!cfg || typeof cfg !== 'object' || !cfg.event || !cfg.raceDate) {
      throw new Error('The file does not contain a training plan (missing event / race date).');
    }
    const completed = data.completed && typeof data.completed === 'object' ? data.completed : {};
    // Normalise config to the shape the app expects.
    const config = {
      event: cfg.event,
      raceDate: cfg.raceDate,
      vdot: cfg.vdot != null ? cfg.vdot : 50,
      daysPerWeek: cfg.daysPerWeek != null ? parseInt(cfg.daysPerWeek, 10) : 4,
      currentMileage: cfg.currentMileage != null ? parseInt(cfg.currentMileage, 10) : 32,
      units: cfg.units === 'miles' || cfg.units === 'km' ? cfg.units : 'km',
      maxHr: cfg.maxHr != null ? parseInt(cfg.maxHr, 10) : 190,
      restHr: cfg.restHr != null ? parseInt(cfg.restHr, 10) : 60
    };
    return { config, completed };
  }

  return { exportPlan, downloadPlan, parsePlanFile, defaultFileName };
})();
