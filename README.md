# iCal Builder

**iCal/ICS file builder conforming to RFC 5545 — with recurrence rules, alarms, and live preview.**

Zero dependencies · No build step · Vanilla JS ES Modules

[Live Demo](https://sen.ltd/portfolio/ical-builder/) · [Built by SEN LLC](https://sen.ltd)

---

## Features

- **Form-based event creation** — title, description, location, start/end date-time
- **Timezone support** — per-event timezone (UTC, Asia/Tokyo, America/New_York, …)
- **All-day events** — RFC 5545 `DATE` value type
- **Recurrence rules** — daily / weekly / monthly / yearly with interval, count, until
- **Alarms / reminders** — 15 min / 1 hour / 1 day before
- **Multiple events** in one calendar file
- **Live ICS preview** — updates as you type
- **Download** `.ics` — opens in Google Calendar, Apple Calendar, Outlook
- **Paste / upload existing ICS** — parse and edit
- **Japanese / English UI** — language toggle in header
- **Dark / light theme** — respects system preference, toggleable

## Getting Started

```bash
# Clone
git clone https://github.com/sen-ltd/ical-builder.git
cd ical-builder

# Serve (no build required)
npm run serve        # python3 -m http.server 8080
# Open http://localhost:8080
```

## Tests

```bash
node --test tests/ical.test.js   # 38 tests, zero dependencies
```

## Project Structure

```
ical-builder/
├── index.html          # Single-page app shell
├── style.css           # CSS custom properties, dark/light themes
├── src/
│   ├── ical.js         # RFC 5545 ICS generation & parsing (pure functions)
│   ├── i18n.js         # ja/en translations + timezone list
│   └── main.js         # DOM, form state, event handlers
├── tests/
│   └── ical.test.js    # 38 tests (node:test)
└── assets/             # Screenshots
```

## API (src/ical.js)

```js
import { buildICS, parseICS, buildEvent, formatDateTime,
         escapeText, unescapeText, foldLine, generateUID, buildRRULE }
  from './src/ical.js';

// Build a full .ics string
const ics = buildICS({
  calName: 'My Calendar',
  events: [{
    uid: generateUID(),
    summary: 'Team Meeting',
    description: 'Weekly sync',
    location: 'Zoom',
    dtstart: new Date('2026-04-13T15:00:00Z'),
    dtend:   new Date('2026-04-13T16:00:00Z'),
    allDay: false,
    timezone: 'UTC',
    rrule: { freq: 'WEEKLY', count: 10 },
    alarms: [{ trigger: '-PT15M', action: 'DISPLAY', description: 'Reminder' }],
    exdates: [],
  }],
});

// Parse existing ICS
const calendar = parseICS(icsString);
```

## RFC 5545 Compliance

- CRLF (`\r\n`) line endings
- Content lines folded at 75 octets with `CRLF + SPACE` continuation
- Text property escaping: `\` `\\`, `,` `\,`, `;` `\;`, newline `\n`
- `DTSTART;VALUE=DATE` for all-day events
- `DTSTART;TZID=…` for non-UTC events
- `RRULE` with `FREQ`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY`, `BYMONTHDAY`, `BYMONTH`
- `VALARM` component for reminders

## License

MIT © 2026 [SEN LLC (SEN 合同会社)](https://sen.ltd)

<!-- sen-publish:links -->
## Links

- 🌐 Demo: https://sen.ltd/portfolio/ical-builder/
- 📝 dev.to: https://dev.to/sendotltd/building-an-rfc-5545-ical-file-generator-line-folding-escaping-and-all-5fid
<!-- /sen-publish:links -->
