/**
 * VDOT Calculator - training pace computation
 * Calculates VDOT from race performance
 */

const VDOTCalculator = (() => {
  // Distance in meters for common races
  const DISTANCES = {
    '5k': 5000,
    '10k': 10000,
    'half': 21097.5,
    'marathon': 42195
  };

  // Full VDOT pace table loaded from data/vdot.json (VDOT 30..85)
  let VDOT_TABLE = null;
  function setTable(t) { VDOT_TABLE = t; }
  function getTable() { return VDOT_TABLE; }

  /**
   * Convert time string (h:mm:ss) to seconds
   */
  function timeToSeconds(hours, minutes, seconds) {
    return (parseInt(hours) || 0) * 3600 + 
           (parseInt(minutes) || 0) * 60 + 
           (parseInt(seconds) || 0);
  }

  /**
   * Convert seconds to pace string (min:sec per mile)
   */
  function secondsToPace(totalSeconds, distanceMeters) {
    const miles = distanceMeters / 1609.344;
    const paceSeconds = totalSeconds / miles;
    const mins = Math.floor(paceSeconds / 60);
    const secs = Math.floor(paceSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Calculate VO2 from velocity and time
   * VO2 = -4.60 + 0.182258*v + 0.000104*v^2
   * where v = velocity in m/min
   */
  function calculateVO2(velocity, timeMinutes) {
    return -4.60 + 0.182258 * velocity + 0.000104 * velocity * velocity;
  }

  /**
   * Calculate %VO2max from time
   * %VO2max = 0.8 + 0.1894393*e^(-0.012778*t) + 0.2989558*e^(-0.1932605*t)
   * where t = time in minutes
   */
  function calculatePercentVO2max(timeMinutes) {
    return 0.8 + 
           0.1894393 * Math.exp(-0.012778 * timeMinutes) + 
           0.2989558 * Math.exp(-0.1932605 * timeMinutes);
  }

  /**
   * Calculate VDOT from race distance and time
   */
  function calculateVDOT(distanceKey, timeSeconds) {
    const distanceMeters = DISTANCES[distanceKey];
    if (!distanceMeters) return null;

    const timeMinutes = timeSeconds / 60;
    const velocity = distanceMeters / timeMinutes;
    const vo2 = calculateVO2(velocity, timeMinutes);
    const percentVO2max = calculatePercentVO2max(timeMinutes);
    
    // VDOT = VO2 / %VO2max
    const vdot = vo2 / percentVO2max;
    return Math.round(vdot);
  }

  /**
   * Get training paces (per mile) for a given VDOT, from the full table when loaded.
   */
  function getTrainingPaces(vdot) {
    if (VDOT_TABLE) {
      const v = Math.max(30, Math.min(85, Math.round(vdot)));
      const row = VDOT_TABLE[String(v)] || VDOT_TABLE['50'];
      return {
        easy: `${row.easy_min}-${row.easy_max}`,
        marathon: row.marathon,
        tempo: row.tempo,
        interval: row.interval_1k,
        rep: row.interval_400
      };
    }
    // Fallback hardcoded table
    const paceTable = {
       30: { easy: '10:00-10:30', marathon: '9:15', tempo: '8:40', interval: '8:10', rep: '7:20' },
       35: { easy: '9:04-9:31', marathon: '8:23', tempo: '7:50', interval: '7:23', rep: '6:39' },
       40: { easy: '8:19-8:45', marathon: '7:41', tempo: '7:10', interval: '6:45', rep: '6:05' },
       45: { easy: '7:42-8:07', marathon: '7:05', tempo: '6:36', interval: '6:13', rep: '5:37' },
       50: { easy: '7:12-7:36', marathon: '6:36', tempo: '6:08', interval: '5:47', rep: '5:13' },
       55: { easy: '6:47-7:10', marathon: '6:12', tempo: '5:44', interval: '5:25', rep: '4:53' },
       60: { easy: '6:26-6:49', marathon: '5:52', tempo: '5:24', interval: '5:05', rep: '4:35' },
       65: { easy: '6:08-6:31', marathon: '5:34', tempo: '5:06', interval: '4:48', rep: '4:19' },
       70: { easy: '5:53-6:16', marathon: '5:19', tempo: '4:51', interval: '4:34', rep: '4:05' },
       75: { easy: '5:39-6:01', marathon: '5:05', tempo: '4:37', interval: '4:20', rep: '3:53' },
       80: { easy: '5:27-5:48', marathon: '4:52', tempo: '4:24', interval: '4:08', rep: '3:42' }
    };
    const keys = Object.keys(paceTable).map(Number);
    let closest = keys[0];
    for (const key of keys) {
      if (Math.abs(key - vdot) < Math.abs(closest - vdot)) closest = key;
    }
    const paces = paceTable[closest];
    if (closest !== vdot) {
      const lower = keys.filter(k => k <= vdot).pop() || keys[0];
      const upper = keys.filter(k => k >= vdot).shift() || keys[keys.length - 1];
      if (lower !== upper) {
        const ratio = (vdot - lower) / (upper - lower);
        return interpolatePaces(paceTable[lower], paceTable[upper], ratio);
      }
    }
    return paces;
  }

  /**
   * Interpolate between two pace objects
   */
  function interpolatePaces(low, high, ratio) {
    const result = {};
    for (const key of Object.keys(low)) {
      if (typeof low[key] === 'string') {
        // Parse and interpolate time values
        const lowTime = parsePaceToSeconds(low[key]);
        const highTime = parsePaceToSeconds(high[key]);
        const interpolated = Math.round(lowTime + (highTime - lowTime) * ratio);
        result[key] = secondsToPace(interpolated, 1609.344);
      }
    }
    return result;
  }

  /**
   * Parse pace string to seconds
   */
  function parsePaceToSeconds(pace) {
    const parts = pace.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    // Handle range (e.g., "10:00-10:30")
    const rangeParts = pace.split('-');
    if (rangeParts.length === 2) {
      return parsePaceToSeconds(rangeParts[0]);
    }
    return 0;
  }

  return {
    calculateVDOT,
    getTrainingPaces,
    setTable,
    getTable,
    timeToSeconds,
    secondsToPace,
    DISTANCES
  };
})();