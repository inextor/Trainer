# Training Calendar App

A web application that generates personalized training calendars based on VDOT training methodology.

## Features

- **VDOT Calculator**: Calculate VDOT from any race distance/time
- **Training Paces**: Get your personalized E/M/T/I/R paces
- **Calendar Generator**: 16-week training plans for 5K, 10K, Half Marathon, Marathon
- **Flexible Scheduling**: 4, 5, 6, or 7 days per week
- **Quality Session Adjustment**: Automatic adjustment when only 1 quality session/week is possible
- **Phase Breakdown**: Base → Build → Peak → Taper with recovery weeks

## Quick Start

```bash
# Start local server
cd webapp
python3 -m http.server 8080

# Open in browser
open http://localhost:8080
```

## Project Structure

```
webapp/
├── index.html              # Main UI
├── css/styles.css          # Responsive styling
└── js/
    ├── vdot-calculator.js  # VDOT calculation from race time
    ├── calendar-generator.js # Training plan generation
    └── app.js              # UI logic and rendering
```

## Training Types

| Code | Name | Purpose |
|------|------|---------|
| E | Easy | Recovery, aerobic base |
| M | Marathon | Marathon-specific fitness |
| T | Tempo | Lactate threshold |
| I | Interval | VO2max improvement |
| R | Repetition | Running economy |
| L | Long | Endurance |

## VDOT System

VDOT is a pseudonymous VO2max value derived from race performance. Range: 30-85.

### 6-Second Rule
Each pace zone is approximately 6 seconds per 400m apart.

