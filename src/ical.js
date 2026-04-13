/**
 * ical.js — RFC 5545 iCal/ICS generation and parsing
 * Zero dependencies, ES module.
 */

const CRLF = '\r\n';
const FOLD_WIDTH = 75;

/**
 * Escape special characters per RFC 5545 section 3.3.11.
 * \  →  \\
 * ,  →  \,
 * ;  →  \;
 * newline  →  \n
 */
export function escapeText(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Reverse of escapeText.
 */
export function unescapeText(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Fold a single content line to max `width` octets per RFC 5545 section 3.1.
 * Continuation lines begin with a single LWSP character (space).
 */
export function foldLine(line, width = FOLD_WIDTH) {
  if (line.length <= width) return line;

  const parts = [];
  let remaining = line;

  // First chunk: up to `width` chars
  parts.push(remaining.slice(0, width));
  remaining = remaining.slice(width);

  // Subsequent chunks: up to `width - 1` chars (1 char used by leading space)
  while (remaining.length > 0) {
    parts.push(' ' + remaining.slice(0, width - 1));
    remaining = remaining.slice(width - 1);
  }

  return parts.join(CRLF);
}

/**
 * Format a Date object as iCal date-time or date string.
 * allDay  →  "20260413"
 * utc     →  "20260413T120000Z"
 * local   →  "20260413T120000"
 */
export function formatDateTime(date, allDay = false, utc = true) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new TypeError('formatDateTime: expected a valid Date');
  }

  if (allDay) {
    // Date-only: use local calendar date
    const y = date.getFullYear().toString().padStart(4, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}${m}${d}`;
  }

  if (utc) {
    const y = date.getUTCFullYear().toString().padStart(4, '0');
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = date.getUTCDate().toString().padStart(2, '0');
    const hh = date.getUTCHours().toString().padStart(2, '0');
    const mm = date.getUTCMinutes().toString().padStart(2, '0');
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    return `${y}${m}${d}T${hh}${mm}${ss}Z`;
  }

  // Local (floating) time
  const y = date.getFullYear().toString().padStart(4, '0');
  const mo = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  const ss = date.getSeconds().toString().padStart(2, '0');
  return `${y}${mo}${d}T${hh}${mm}${ss}`;
}

/**
 * Generate a unique identifier suitable for UID property.
 */
export function generateUID() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}@sen.ltd`;
}

/**
 * Build an RRULE string from a rule object.
 * rule: { freq, count, until, interval, byday, bymonthday, bymonth, wkst }
 */
export function buildRRULE(rule) {
  if (!rule || !rule.freq) return '';

  const parts = [`FREQ=${rule.freq.toUpperCase()}`];

  if (rule.interval && rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }
  if (rule.count != null) {
    parts.push(`COUNT=${rule.count}`);
  } else if (rule.until instanceof Date) {
    parts.push(`UNTIL=${formatDateTime(rule.until, false, true)}`);
  }
  if (rule.byday) {
    const days = Array.isArray(rule.byday) ? rule.byday.join(',') : rule.byday;
    parts.push(`BYDAY=${days}`);
  }
  if (rule.bymonthday) {
    const days = Array.isArray(rule.bymonthday)
      ? rule.bymonthday.join(',')
      : rule.bymonthday;
    parts.push(`BYMONTHDAY=${days}`);
  }
  if (rule.bymonth) {
    const months = Array.isArray(rule.bymonth)
      ? rule.bymonth.join(',')
      : rule.bymonth;
    parts.push(`BYMONTH=${months}`);
  }
  if (rule.wkst) {
    parts.push(`WKST=${rule.wkst.toUpperCase()}`);
  }

  return parts.join(';');
}

/**
 * Build a VEVENT block string for one event.
 *
 * event: {
 *   uid, summary, description, location,
 *   dtstart, dtend, allDay, timezone,
 *   rrule, exdates, alarms
 * }
 */
export function buildEvent(event) {
  const lines = [];

  const add = (line) => lines.push(foldLine(line));

  add('BEGIN:VEVENT');
  add(`UID:${event.uid || generateUID()}`);
  add(`DTSTAMP:${formatDateTime(new Date(), false, true)}`);

  if (event.allDay) {
    add(`DTSTART;VALUE=DATE:${formatDateTime(event.dtstart, true)}`);
    if (event.dtend) {
      add(`DTEND;VALUE=DATE:${formatDateTime(event.dtend, true)}`);
    }
  } else if (event.timezone && event.timezone !== 'UTC') {
    add(
      `DTSTART;TZID=${event.timezone}:${formatDateTime(event.dtstart, false, false)}`
    );
    if (event.dtend) {
      add(
        `DTEND;TZID=${event.timezone}:${formatDateTime(event.dtend, false, false)}`
      );
    }
  } else {
    add(`DTSTART:${formatDateTime(event.dtstart, false, true)}`);
    if (event.dtend) {
      add(`DTEND:${formatDateTime(event.dtend, false, true)}`);
    }
  }

  if (event.summary) {
    add(`SUMMARY:${escapeText(event.summary)}`);
  }
  if (event.description) {
    add(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.location) {
    add(`LOCATION:${escapeText(event.location)}`);
  }

  if (event.rrule) {
    const rruleStr = buildRRULE(event.rrule);
    if (rruleStr) {
      add(`RRULE:${rruleStr}`);
    }
  }

  if (Array.isArray(event.exdates)) {
    for (const exdate of event.exdates) {
      if (exdate instanceof Date) {
        add(`EXDATE:${formatDateTime(exdate, false, true)}`);
      }
    }
  }

  if (Array.isArray(event.alarms)) {
    for (const alarm of event.alarms) {
      lines.push('BEGIN:VALARM');
      add(`TRIGGER:${alarm.trigger}`);
      add(`ACTION:${alarm.action || 'DISPLAY'}`);
      if (alarm.description) {
        add(`DESCRIPTION:${escapeText(alarm.description)}`);
      }
      lines.push('END:VALARM');
    }
  }

  add('END:VEVENT');
  return lines.join(CRLF);
}

/**
 * Build a full ICS string from a calendar object.
 *
 * calendar: {
 *   prodId,   // optional, defaults to -//sen.ltd//ICal Builder//EN
 *   calName,  // optional CALNAME
 *   events,   // array of event objects
 * }
 */
export function buildICS(calendar) {
  const prodId =
    calendar.prodId || '-//sen.ltd//ICal Builder//EN';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    foldLine(`PRODID:${prodId}`),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  if (calendar.calName) {
    lines.push(foldLine(`X-WR-CALNAME:${escapeText(calendar.calName)}`));
  }

  const events = Array.isArray(calendar.events) ? calendar.events : [];
  for (const event of events) {
    lines.push(buildEvent(event));
  }

  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Unfold RFC 5545 content lines (join continuation lines).
 */
function unfoldLines(str) {
  return str.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n');
}

/**
 * Parse a single property line into { name, params, value }.
 * e.g. "DTSTART;TZID=America/New_York:20260413T120000"
 */
function parsePropLine(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return { name: line.toUpperCase(), params: {}, value: '' };

  const namePart = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);

  const segments = namePart.split(';');
  const name = segments[0].toUpperCase();
  const params = {};
  for (let i = 1; i < segments.length; i++) {
    const eq = segments[i].indexOf('=');
    if (eq !== -1) {
      params[segments[i].slice(0, eq).toUpperCase()] = segments[i].slice(eq + 1);
    }
  }

  return { name, params, value };
}

/**
 * Parse an ICS datetime string to a JS Date.
 * Handles: "20260413", "20260413T120000", "20260413T120000Z"
 */
function parseICSDate(str, tzid = null) {
  if (!str) return null;
  const allDay = !str.includes('T');

  const y = parseInt(str.slice(0, 4), 10);
  const mo = parseInt(str.slice(4, 6), 10) - 1;
  const d = parseInt(str.slice(6, 8), 10);

  if (allDay) {
    return new Date(y, mo, d);
  }

  const hh = parseInt(str.slice(9, 11), 10);
  const mm = parseInt(str.slice(11, 13), 10);
  const ss = parseInt(str.slice(13, 15), 10);
  const isUtc = str.endsWith('Z');

  if (isUtc || !tzid) {
    return new Date(Date.UTC(y, mo, d, hh, mm, ss));
  }
  // Local floating time (no Z, no reliable tzid conversion in vanilla JS)
  return new Date(y, mo, d, hh, mm, ss);
}

/**
 * Parse an RRULE string into a rule object.
 */
function parseRRULE(rruleStr) {
  const rule = {};
  const parts = rruleStr.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).toUpperCase();
    const val = part.slice(eq + 1);
    switch (key) {
      case 'FREQ':
        rule.freq = val;
        break;
      case 'COUNT':
        rule.count = parseInt(val, 10);
        break;
      case 'INTERVAL':
        rule.interval = parseInt(val, 10);
        break;
      case 'UNTIL':
        rule.until = parseICSDate(val);
        break;
      case 'BYDAY':
        rule.byday = val.includes(',') ? val.split(',') : val;
        break;
      case 'BYMONTHDAY':
        rule.bymonthday = val.includes(',')
          ? val.split(',').map(Number)
          : parseInt(val, 10);
        break;
      case 'BYMONTH':
        rule.bymonth = val.includes(',')
          ? val.split(',').map(Number)
          : parseInt(val, 10);
        break;
      case 'WKST':
        rule.wkst = val;
        break;
    }
  }
  return rule;
}

/**
 * Parse an ICS string into a calendar object.
 * Returns the same shape that buildICS expects.
 */
export function parseICS(str) {
  const unfolded = unfoldLines(str);
  const lines = unfolded.split('\n').map((l) => l.trimEnd());

  const calendar = { prodId: '', calName: '', events: [] };
  let currentEvent = null;
  let currentAlarm = null;
  let inEvent = false;
  let inAlarm = false;

  for (const line of lines) {
    if (!line) continue;

    const { name, params, value } = parsePropLine(line);

    switch (name) {
      case 'BEGIN':
        if (value === 'VEVENT') {
          inEvent = true;
          currentEvent = {
            uid: '',
            summary: '',
            description: '',
            location: '',
            dtstart: null,
            dtend: null,
            allDay: false,
            timezone: null,
            rrule: null,
            exdates: [],
            alarms: [],
          };
        } else if (value === 'VALARM' && inEvent) {
          inAlarm = true;
          currentAlarm = { trigger: '', action: 'DISPLAY', description: '' };
        }
        break;

      case 'END':
        if (value === 'VALARM' && inAlarm) {
          inAlarm = false;
          if (currentEvent) currentEvent.alarms.push(currentAlarm);
          currentAlarm = null;
        } else if (value === 'VEVENT' && inEvent) {
          inEvent = false;
          calendar.events.push(currentEvent);
          currentEvent = null;
        }
        break;

      case 'PRODID':
        calendar.prodId = value;
        break;

      case 'X-WR-CALNAME':
        calendar.calName = unescapeText(value);
        break;

      case 'UID':
        if (inEvent) currentEvent.uid = value;
        break;

      case 'SUMMARY':
        if (inEvent) currentEvent.summary = unescapeText(value);
        break;

      case 'DESCRIPTION':
        if (inAlarm) currentAlarm.description = unescapeText(value);
        else if (inEvent) currentEvent.description = unescapeText(value);
        break;

      case 'LOCATION':
        if (inEvent) currentEvent.location = unescapeText(value);
        break;

      case 'DTSTART': {
        if (!inEvent) break;
        const allDay = params.VALUE === 'DATE';
        const tzid = params.TZID || null;
        currentEvent.allDay = allDay;
        if (tzid) currentEvent.timezone = tzid;
        currentEvent.dtstart = parseICSDate(value, tzid);
        break;
      }

      case 'DTEND': {
        if (!inEvent) break;
        const tzid = params.TZID || null;
        currentEvent.dtend = parseICSDate(value, tzid);
        break;
      }

      case 'RRULE':
        if (inEvent) currentEvent.rrule = parseRRULE(value);
        break;

      case 'EXDATE':
        if (inEvent) {
          const exdate = parseICSDate(value, params.TZID || null);
          if (exdate) currentEvent.exdates.push(exdate);
        }
        break;

      case 'TRIGGER':
        if (inAlarm) currentAlarm.trigger = value;
        break;

      case 'ACTION':
        if (inAlarm) currentAlarm.action = value;
        break;
    }
  }

  return calendar;
}
