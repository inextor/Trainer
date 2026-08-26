/**
 * I18n - Language detection and localization.
 *
 * Detects the browser language (navigator.language / navigator.languages[0])
 * and chooses a locale: 'es' when the primary language is Spanish, otherwise
 * 'en' (the default). All user-facing text is rendered through I18n.t(), so
 * data stays language-neutral and labels are composed per locale.
 *
 * Supported locales: en (default), es.
 */
const I18n = (() => {
  const DEFAULT_LOCALE = 'en';

  function detectLocale() {
    let lang = 'en';
    try {
      lang = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    } catch (e) {
      lang = 'en';
    }
    if (/^es\b/i.test(lang) || /^es[_-]/i.test(lang)) return 'es';
    return DEFAULT_LOCALE;
  }

  const STRINGS = {
    // ---- Brand / nav ----
    'brand.title': { en: 'Training Calendar', es: 'Calendario de entrenamiento' },
    'brand.tagline': { en: 'VDOT · Training Planner', es: 'VDOT · Planificador de entrenamiento' },
    'nav.configuration': { en: 'Configuration', es: 'Configuración' },
    'nav.calendar': { en: 'Calendar', es: 'Calendario' },
    'nav.backToCalendar': { en: '← Calendar', es: '← Calendario' },

    // ---- Config form: sections ----
    'form.title': { en: 'Training Configuration', es: 'Configuración del entrenamiento' },
    'form.subtitle': { en: 'Set your race, availability and fitness to build a personalized plan.', es: 'Define tu carrera, disponibilidad y forma física para crear un plan personalizado.' },
    'section.raceDetails': { en: 'Race Details', es: 'Detalles de la carrera' },
    'section.schedule': { en: 'Schedule', es: 'Horario' },
    'section.fitness': { en: 'Fitness', es: 'Forma física' },

    // ---- Config form: fields ----
    'field.raceEvent': { en: 'Race Event', es: 'Evento de carrera' },
    'field.selectEvent': { en: 'Select event...', es: 'Seleccionar evento...' },
    'event.halfMarathon': { en: 'Half Marathon', es: 'Media maratón' },
    'event.marathon': { en: 'Marathon', es: 'Maratón' },
    'field.raceDate': { en: 'Race Date', es: 'Fecha de la carrera' },
    'field.daysPerWeek': { en: 'Days Available Per Week', es: 'Días disponibles por semana' },
    'field.daysUnit': { en: 'days', es: 'días' },
    'field.distanceUnits': { en: 'Distance Units', es: 'Unidades de distancia' },
    'units.kilometers': { en: 'Kilometers', es: 'Kilómetros' },
    'units.miles': { en: 'Miles', es: 'Millas' },
    'field.currentWeeklyDistance': { en: 'Current Weekly Distance', es: 'Distancia semanal actual' },
    'field.currentWeeklyMileage': { en: 'Current Weekly Mileage', es: 'Millaje semanal actual' },
    'field.kmPerWeek': { en: 'km per week', es: 'km por semana' },
    'field.milesPerWeek': { en: 'miles per week', es: 'millas por semana' },
    'field.vdotLevel': { en: 'VDOT Level', es: 'Nivel VDOT' },
    'field.fromRaceTime': { en: 'From Race Time', es: 'Desde marca de carrera' },
    'field.manualVdot': { en: 'Manual VDOT', es: 'VDOT manual' },
    'field.calculate': { en: 'Calculate', es: 'Calcular' },
    'field.calculatedVdot': { en: 'Calculated VDOT: {vdot}', es: 'VDOT calculado: {vdot}' },
    'field.heartRate': { en: 'Heart Rate (for zone display)', es: 'Frecuencia cardíaca (para mostrar zonas)' },
    'field.maxBpm': { en: 'max bpm', es: 'bpm máx.' },
    'field.restBpm': { en: 'rest bpm', es: 'bpm reposo' },
    'field.hrNote': { en: 'Zones are estimates from %VO2max (Swain formula). Paces remain the source of truth.', es: 'Las zonas son estimaciones a partir del %VO2máx (fórmula de Swain). Los ritmos siguen siendo la referencia.' },
    'field.generatePlan': { en: 'Generate Training Plan', es: 'Generar plan de entrenamiento' },
    'field.clearPlan': { en: 'Clear Saved Plan', es: 'Borrar plan guardado' },
    'field.planBackup': { en: 'Plan Backup', es: 'Copia de seguridad del plan' },
    'field.exportPlan': { en: 'Export Plan', es: 'Exportar plan' },
    'field.importPlan': { en: 'Import Plan', es: 'Importar plan' },
    'field.exportFit': { en: 'Export .fit', es: 'Exportar .fit' },

    // ---- Alerts ----
    'alert.enterRaceTime': { en: 'Please enter a race time', es: 'Introduce el tiempo de la carrera' },
    'alert.couldNotCalcVdot': { en: 'Could not calculate VDOT. Please check your time.', es: 'No se pudo calcular el VDOT. Comprueba tu tiempo.' },
    'alert.fillRequired': { en: 'Please fill in all required fields', es: 'Completa todos los campos obligatorios' },
    'alert.savedCleared': { en: 'Saved plan cleared.', es: 'Plan guardado borrado.' },

    // ---- Calendar page ----
    'cal.title': { en: 'Training Calendar', es: 'Calendario de entrenamiento' },
    'cal.prev': { en: '&laquo; Prev', es: '&laquo; Anterior' },
    'cal.next': { en: 'Next &raquo;', es: 'Siguiente &raquo;' },
    'cal.weekIndicator': { en: 'Week {n} of {m} ({wk} wk to race)', es: 'Semana {n} de {m} ({wk} sem. para la carrera)' },
    'cal.raceCountdown': { en: 'Race: {date} · Phase: {phase}', es: 'Carrera: {date} · Fase: {phase}' },
    'cal.noPlanTitle': { en: 'No training plan yet', es: 'Aún no hay plan de entrenamiento' },
    'cal.noPlanBody': { en: 'Configure your race to generate a personalized training calendar.', es: 'Configura tu carrera para generar un calendario de entrenamiento personalizado.' },
    'cal.createPlan': { en: 'Create a Training Plan', es: 'Crear un plan de entrenamiento' },
    'cal.yourPacesPrefix': { en: 'Your Training Paces (VDOT', es: 'Tus ritmos de entrenamiento (VDOT' },
    'cal.yourPacesSuffix': { en: ')', es: ')' },
    'cal.hrZones': { en: 'Heart-Rate Zones (est.)', es: 'Zonas de frecuencia cardíaca (est.)' },
    'cal.done': { en: 'done', es: 'hecho' },
    'cal.weekSummary': { en: 'Week {n} Summary', es: 'Resumen de la semana {n}' },
    'cal.totalTime': { en: 'Total Time', es: 'Tiempo total' },
    'cal.totalDist': { en: 'Total Dist', es: 'Distancia total' },
    'cal.quality': { en: 'Quality', es: 'Calidad' },
    'cal.phase': { en: 'Phase', es: 'Fase' },
    'phase.build': { en: 'Build', es: 'Base' },
    'phase.peak': { en: 'Peak', es: 'Pico' },
    'phase.taper': { en: 'Taper', es: 'Afinado' },
    'cal.phasesTitle': { en: 'Phases', es: 'Fases' },
    'cal.phaseCaption': { en: 'You\'re in the {phase} phase · Week {n} of {m}', es: 'Estás en la fase {phase} · Semana {n} de {m}' },
    'cal.phaseHint': { en: 'Tap a day for details. Progress is saved automatically.', es: 'Toca un día para ver detalles. El progreso se guarda automáticamente.' },

    // ---- Legend / zone names ----
    'zone.E': { en: 'Easy', es: 'Suave' },
    'zone.M': { en: 'Marathon', es: 'Maratón' },
    'zone.T': { en: 'Tempo', es: 'Umbral' },
    'zone.I': { en: 'Interval', es: 'Intervalo' },
    'zone.R': { en: 'Repetition', es: 'Repetición' },
    'zone.L': { en: 'Long', es: 'Largo' },
    'zone.W': { en: 'Walk / Rest', es: 'Caminar / Descanso' },
    'zone.ST': { en: 'Strides', es: 'Progresiones' },
    'zone.rest': { en: 'Rest', es: 'Descanso' },
    'legend.easy': { en: 'E Easy', es: 'E Suave' },
    'legend.marathon': { en: 'M Marathon', es: 'M Maratón' },
    'legend.tempo': { en: 'T Tempo', es: 'T Umbral' },
    'legend.interval': { en: 'I Interval', es: 'I Intervalo' },
    'legend.repetition': { en: 'R Repetition', es: 'R Repetición' },
    'legend.long': { en: 'L Long', es: 'L Largo' },
    'legend.walk': { en: 'W Walk / Rest', es: 'W Caminar / Descanso' },
    'legend.strides': { en: 'ST Strides', es: 'ST Progresiones' },

    // ---- Day detail (dialog + standalone) ----
    'day.title': { en: 'Training Day', es: 'Día de entrenamiento' },
    'day.detail': { en: 'Workout Detail', es: 'Detalle del entrenamiento' },
    'day.notFound': { en: 'Day not found.', es: 'Día no encontrado.' },
    'day.backToCalendar': { en: 'Back to Calendar', es: 'Volver al calendario' },
    'day.totalFor': { en: 'Total for the day: {time}', es: 'Total del día: {time}' },
    'day.totalHint': { en: 'Total includes warm-up, main set and cool-down.', es: 'El total incluye calentamiento, bloque principal y enfriamiento.' },
    'day.warmup': { en: 'Warm-up', es: 'Calentamiento' },
    'day.cooldown': { en: 'Cool-down', es: 'Enfriamiento' },
    'day.rest': { en: 'Rest', es: 'Descanso' },

    // ---- Workout renderer tokens ----
    'wr.steady': { en: 'Steady {zone} run', es: 'Carrera continua {zone}' },
    'wr.lesserOf': { en: 'the lesser of {dist} and {min} min', es: 'el menor de {dist} y {min} min' },
    'wr.with': { en: 'with', es: 'con' },
    'wr.jog': { en: 'jog', es: 'trote' },
    'wr.rest': { en: 'rest', es: 'descanso' },
    'wr.recovery': { en: 'recovery', es: 'recuperación' },
    'wr.min': { en: 'min', es: 'min' },
    'wr.strides': { en: 'strides', es: 'progresiones' },
    'wr.raceDay': { en: 'Race day — {event}', es: 'Día de la carrera — {event}' },
    'wr.race': { en: 'RACE', es: 'CARRERA' },
    'wr.taper': { en: 'Taper', es: 'Afinado' },
    'wr.chip.E': { en: 'E', es: 'E' },

    // ---- Category / notes ----
    'cat.range': { en: '{min}-{max} miles ({kmMin}-{kmMax} km) per week', es: '{min}-{max} millas ({kmMin}-{kmMax} km) por semana' },
    'cat.moreThan': { en: 'More than {min} miles ({km} km) per week', es: 'Más de {min} millas ({km} km) por semana' },
    'note.week10': { en: 'During week 10, try to complete a steady 10K run (easy effort if raced).', es: 'Durante la semana 10, intenta completar una carrera continua de 10K (esfuerzo suave si has competido).' },
    'note.2q': { en: '2Q • {cat}', es: '2Q • {cat}' },
    'note.2qTaper': { en: '2Q • {cat} • Taper week', es: '2Q • {cat} • Semana de afinado' },

    // ---- Day names (for calendar headers) ----
    'day.Mon': { en: 'Mon', es: 'Lun' },
    'day.Tue': { en: 'Tue', es: 'Mar' },
    'day.Wed': { en: 'Wed', es: 'Mié' },
    'day.Thu': { en: 'Thu', es: 'Jue' },
    'day.Fri': { en: 'Fri', es: 'Vie' },
    'day.Sat': { en: 'Sat', es: 'Sáb' },
    'day.Sun': { en: 'Sun', es: 'Dom' },

    // ---- Misc ----
    'footer.text': { en: 'Training plan calendar generator v1.0.7', es: 'Generador de calendario de plan de entrenamiento v1.0.7' },
    'unit.km': { en: 'km', es: 'km' },
    'unit.mi': { en: 'mi', es: 'mi' },
    'unit.min': { en: 'min', es: 'min' },
    'unit.sec': { en: 's', es: 's' },
    'unit.bpm': { en: 'bpm', es: 'bpm' },

    // ---- Plan IO ----
    'io.notJson': { en: 'The file is not valid JSON.', es: 'El archivo no es JSON válido.' },
    'io.unrecognised': { en: 'Unrecognised plan file.', es: 'Archivo de plan no reconocido.' },
    'io.noPlan': { en: 'The file does not contain a training plan (missing event / race date).', es: 'El archivo no contiene un plan de entrenamiento (falta evento / fecha de carrera).' },
    'io.exported': { en: 'Exported "{name}".', es: 'Exportado "{name}".' },
    'io.noPlanToExport': { en: 'No saved plan to export yet.', es: 'Aún no hay un plan guardado para exportar.' },
    'io.exportFailed': { en: 'Export failed: {msg}', es: 'Error al exportar: {msg}' },
    'io.imported': { en: 'Imported "{name}".', es: 'Importado "{name}".' },
    'io.importFailed': { en: 'Import failed: {msg}', es: 'Error al importar: {msg}' },
    'io.fitExported': { en: 'Exported "{name}".', es: 'Exportado "{name}".' },
    'io.fitExportFailed': { en: 'FIT export failed: {msg}', es: 'Error al exportar FIT: {msg}' },
    'io.fitRestDay': { en: 'Rest day — nothing to export.', es: 'Día de descanso — nada que exportar.' }
  };

  const locale = detectLocale();
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }

  function t(key, vars) {
    const entry = STRINGS[key];
    let str;
    if (!entry) {
      str = key;
    } else {
      str = entry[locale] != null ? entry[locale] : entry.en;
    }
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.split(`{${k}}`).join(String(v));
      }
    }
    return str;
  }

  function applyStatic(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    scope.querySelectorAll('[data-i18n-attr]').forEach(el => {
      const spec = el.getAttribute('data-i18n-attr'); // "attrName:i18nKey"
      const idx = spec.indexOf(':');
      const attr = spec.slice(0, idx);
      const key = spec.slice(idx + 1);
      el.setAttribute(attr, t(key));
    });
  }

  // Run static translation as soon as DOM is parsed (even before DOMContentLoaded).
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => applyStatic());
    } else {
      applyStatic();
    }
  }

  return { locale, t, applyStatic };
})();
