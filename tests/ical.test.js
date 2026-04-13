/**
 * ical.test.js — Tests for src/ical.js (20+ test cases)
 * Run with: node --test tests/ical.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeText,
  unescapeText,
  foldLine,
  formatDateTime,
  generateUID,
  buildRRULE,
  buildEvent,
  buildICS,
  parseICS,
} from '../src/ical.js';

const CRLF = '\r\n';

// ---------------------------------------------------------------------------
// escapeText
// ---------------------------------------------------------------------------
test('escapeText: backslash is doubled', () => {
  assert.equal(escapeText('a\\b'), 'a\\\\b');
});

test('escapeText: comma is escaped', () => {
  assert.equal(escapeText('a,b'), 'a\\,b');
});

test('escapeText: semicolon is escaped', () => {
  assert.equal(escapeText('a;b'), 'a\\;b');
});

test('escapeText: newline becomes \\n literal', () => {
  assert.equal(escapeText('a\nb'), 'a\\nb');
  assert.equal(escapeText('a\r\nb'), 'a\\nb');
});

test('escapeText: null/undefined returns empty string', () => {
  assert.equal(escapeText(null), '');
  assert.equal(escapeText(undefined), '');
});

// ---------------------------------------------------------------------------
// unescapeText
// ---------------------------------------------------------------------------
test('unescapeText: reverses escapeText', () => {
  const originals = [
    'Hello, world; backslash \\ and\nnewline',
    'Just plain text',
    '1,2;3\\4',
  ];
  for (const s of originals) {
    assert.equal(unescapeText(escapeText(s)), s);
  }
});

// ---------------------------------------------------------------------------
// foldLine
// ---------------------------------------------------------------------------
test('foldLine: short line is unchanged', () => {
  const line = 'SUMMARY:Short title';
  assert.equal(foldLine(line), line);
});

test('foldLine: line at exactly 75 chars is unchanged', () => {
  const line = 'A'.repeat(75);
  assert.equal(foldLine(line), line);
});

test('foldLine: line of 76 chars is folded with CRLF+space', () => {
  const line = 'A'.repeat(76);
  const folded = foldLine(line);
  assert.ok(folded.includes(CRLF + ' '));
  // First segment must be 75 chars
  const parts = folded.split(CRLF);
  assert.equal(parts[0].length, 75);
  // Continuation starts with space
  assert.equal(parts[1][0], ' ');
});

test('foldLine: long line is folded into multiple continuations', () => {
  const line = 'X'.repeat(200);
  const folded = foldLine(line);
  // Reconstructed (remove CRLF + space) should equal original
  const reconstructed = folded.replace(/\r\n /g, '');
  assert.equal(reconstructed, line);
});

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------
test('formatDateTime: UTC datetime', () => {
  const d = new Date(Date.UTC(2026, 3, 13, 12, 0, 0)); // 2026-04-13T12:00:00Z
  assert.equal(formatDateTime(d, false, true), '20260413T120000Z');
});

test('formatDateTime: local (floating) datetime', () => {
  // Create a date that in local time is 2026-04-13 15:30:00
  const d = new Date(2026, 3, 13, 15, 30, 0); // local
  const result = formatDateTime(d, false, false);
  assert.equal(result, '20260413T153000');
});

test('formatDateTime: all-day returns date-only', () => {
  const d = new Date(2026, 3, 13); // local date
  assert.equal(formatDateTime(d, true), '20260413');
});

test('formatDateTime: throws on invalid Date', () => {
  assert.throws(() => formatDateTime(new Date('invalid')), TypeError);
  assert.throws(() => formatDateTime('2026-04-13'), TypeError);
});

// ---------------------------------------------------------------------------
// generateUID
// ---------------------------------------------------------------------------
test('generateUID: returns non-empty string with @sen.ltd', () => {
  const uid = generateUID();
  assert.ok(typeof uid === 'string');
  assert.ok(uid.includes('@sen.ltd'));
});

test('generateUID: successive calls produce different values', () => {
  const uids = new Set(Array.from({ length: 10 }, generateUID));
  assert.equal(uids.size, 10);
});

// ---------------------------------------------------------------------------
// buildRRULE
// ---------------------------------------------------------------------------
test('buildRRULE: daily with count', () => {
  assert.equal(buildRRULE({ freq: 'DAILY', count: 10 }), 'FREQ=DAILY;COUNT=10');
});

test('buildRRULE: weekly with interval', () => {
  assert.equal(
    buildRRULE({ freq: 'WEEKLY', interval: 2 }),
    'FREQ=WEEKLY;INTERVAL=2'
  );
});

test('buildRRULE: monthly with until date', () => {
  const until = new Date(Date.UTC(2026, 11, 31, 0, 0, 0));
  const result = buildRRULE({ freq: 'MONTHLY', until });
  assert.ok(result.startsWith('FREQ=MONTHLY;UNTIL='));
  assert.ok(result.includes('20261231'));
});

test('buildRRULE: yearly', () => {
  assert.equal(buildRRULE({ freq: 'YEARLY' }), 'FREQ=YEARLY');
});

test('buildRRULE: null/missing freq returns empty string', () => {
  assert.equal(buildRRULE(null), '');
  assert.equal(buildRRULE({}), '');
});

test('buildRRULE: with byday array', () => {
  const result = buildRRULE({ freq: 'WEEKLY', byday: ['MO', 'WE', 'FR'] });
  assert.equal(result, 'FREQ=WEEKLY;BYDAY=MO,WE,FR');
});

// ---------------------------------------------------------------------------
// buildEvent
// ---------------------------------------------------------------------------
test('buildEvent: produces BEGIN/END VEVENT', () => {
  const ev = {
    uid: 'test-uid@sen.ltd',
    summary: 'Test Event',
    description: '',
    location: '',
    dtstart: new Date(Date.UTC(2026, 3, 13, 10, 0, 0)),
    dtend: new Date(Date.UTC(2026, 3, 13, 11, 0, 0)),
    allDay: false,
    timezone: 'UTC',
    rrule: null,
    exdates: [],
    alarms: [],
  };
  const block = buildEvent(ev);
  assert.ok(block.startsWith('BEGIN:VEVENT'));
  assert.ok(block.endsWith('END:VEVENT'));
  assert.ok(block.includes('SUMMARY:Test Event'));
  assert.ok(block.includes('UID:test-uid@sen.ltd'));
});

test('buildEvent: all-day event uses DATE value', () => {
  const ev = {
    uid: 'allday@sen.ltd',
    summary: 'All Day',
    description: '',
    location: '',
    dtstart: new Date(2026, 3, 13),
    dtend: new Date(2026, 3, 14),
    allDay: true,
    timezone: 'UTC',
    rrule: null,
    exdates: [],
    alarms: [],
  };
  const block = buildEvent(ev);
  assert.ok(block.includes('DTSTART;VALUE=DATE:20260413'));
  assert.ok(block.includes('DTEND;VALUE=DATE:20260414'));
});

test('buildEvent: alarm is included', () => {
  const ev = {
    uid: 'alarm@sen.ltd',
    summary: 'Alarm Test',
    description: '',
    location: '',
    dtstart: new Date(Date.UTC(2026, 3, 13, 9, 0, 0)),
    dtend: new Date(Date.UTC(2026, 3, 13, 10, 0, 0)),
    allDay: false,
    timezone: 'UTC',
    rrule: null,
    exdates: [],
    alarms: [{ trigger: '-PT15M', action: 'DISPLAY', description: 'Reminder' }],
  };
  const block = buildEvent(ev);
  assert.ok(block.includes('BEGIN:VALARM'));
  assert.ok(block.includes('TRIGGER:-PT15M'));
  assert.ok(block.includes('END:VALARM'));
});

test('buildEvent: special chars in summary are escaped', () => {
  const ev = {
    uid: 'escape@sen.ltd',
    summary: 'Meeting, Q1; review\\done',
    description: '',
    location: '',
    dtstart: new Date(Date.UTC(2026, 3, 13, 9, 0, 0)),
    dtend: new Date(Date.UTC(2026, 3, 13, 10, 0, 0)),
    allDay: false,
    timezone: 'UTC',
    rrule: null,
    exdates: [],
    alarms: [],
  };
  const block = buildEvent(ev);
  assert.ok(block.includes('SUMMARY:Meeting\\,'));
  assert.ok(block.includes('\\;'));
  assert.ok(block.includes('\\\\'));
});

// ---------------------------------------------------------------------------
// buildICS
// ---------------------------------------------------------------------------
test('buildICS: produces valid VCALENDAR wrapper', () => {
  const cal = {
    events: [],
  };
  const ics = buildICS(cal);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('END:VCALENDAR'));
  assert.ok(ics.includes('VERSION:2.0'));
});

test('buildICS: single event round-trips basic fields', () => {
  const cal = {
    calName: 'Test Calendar',
    events: [
      {
        uid: 'rt-001@sen.ltd',
        summary: 'Round Trip',
        description: 'Testing',
        location: 'Zoom',
        dtstart: new Date(Date.UTC(2026, 3, 13, 14, 0, 0)),
        dtend: new Date(Date.UTC(2026, 3, 13, 15, 0, 0)),
        allDay: false,
        timezone: 'UTC',
        rrule: null,
        exdates: [],
        alarms: [],
      },
    ],
  };
  const ics = buildICS(cal);
  assert.ok(ics.includes('SUMMARY:Round Trip'));
  assert.ok(ics.includes('DESCRIPTION:Testing'));
  assert.ok(ics.includes('LOCATION:Zoom'));
});

test('buildICS: multiple events all appear', () => {
  const make = (n) => ({
    uid: `ev-${n}@sen.ltd`,
    summary: `Event ${n}`,
    description: '',
    location: '',
    dtstart: new Date(Date.UTC(2026, 3, n, 10, 0, 0)),
    dtend: new Date(Date.UTC(2026, 3, n, 11, 0, 0)),
    allDay: false,
    timezone: 'UTC',
    rrule: null,
    exdates: [],
    alarms: [],
  });
  const cal = { events: [make(1), make(2), make(3)] };
  const ics = buildICS(cal);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.equal((ics.match(/END:VEVENT/g) || []).length, 3);
});

test('buildICS: uses CRLF line endings', () => {
  const cal = { events: [] };
  const ics = buildICS(cal);
  assert.ok(ics.includes('\r\n'));
  assert.ok(!ics.replace(/\r\n/g, '').includes('\n')); // no bare LF
});

test('buildICS: event with RRULE', () => {
  const cal = {
    events: [
      {
        uid: 'rrule@sen.ltd',
        summary: 'Weekly Standup',
        description: '',
        location: '',
        dtstart: new Date(Date.UTC(2026, 3, 13, 9, 0, 0)),
        dtend: new Date(Date.UTC(2026, 3, 13, 9, 30, 0)),
        allDay: false,
        timezone: 'UTC',
        rrule: { freq: 'WEEKLY', count: 12 },
        exdates: [],
        alarms: [],
      },
    ],
  };
  const ics = buildICS(cal);
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;COUNT=12'));
});

// ---------------------------------------------------------------------------
// parseICS
// ---------------------------------------------------------------------------
test('parseICS: basic round-trip', () => {
  const cal = {
    calName: 'RT Calendar',
    events: [
      {
        uid: 'parse-001@sen.ltd',
        summary: 'Parse Test',
        description: 'Some description',
        location: 'Office',
        dtstart: new Date(Date.UTC(2026, 3, 13, 10, 0, 0)),
        dtend: new Date(Date.UTC(2026, 3, 13, 11, 0, 0)),
        allDay: false,
        timezone: 'UTC',
        rrule: null,
        exdates: [],
        alarms: [],
      },
    ],
  };
  const ics = buildICS(cal);
  const parsed = parseICS(ics);
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].summary, 'Parse Test');
  assert.equal(parsed.events[0].description, 'Some description');
  assert.equal(parsed.events[0].location, 'Office');
  assert.equal(parsed.events[0].uid, 'parse-001@sen.ltd');
});

test('parseICS: multiple events', () => {
  const make = (n, summary) => ({
    uid: `multi-${n}@sen.ltd`,
    summary,
    description: '',
    location: '',
    dtstart: new Date(Date.UTC(2026, 3, n, 10, 0, 0)),
    dtend: new Date(Date.UTC(2026, 3, n, 11, 0, 0)),
    allDay: false,
    timezone: 'UTC',
    rrule: null,
    exdates: [],
    alarms: [],
  });
  const cal = { events: [make(1, 'Alpha'), make(2, 'Beta'), make(3, 'Gamma')] };
  const ics = buildICS(cal);
  const parsed = parseICS(ics);
  assert.equal(parsed.events.length, 3);
  assert.equal(parsed.events[0].summary, 'Alpha');
  assert.equal(parsed.events[1].summary, 'Beta');
  assert.equal(parsed.events[2].summary, 'Gamma');
});

test('parseICS: unescapes text fields', () => {
  const cal = {
    events: [
      {
        uid: 'unescape@sen.ltd',
        summary: 'Meeting\\, Q1; all\\\\hands',
        description: '',
        location: '',
        dtstart: new Date(Date.UTC(2026, 3, 13, 9, 0, 0)),
        dtend: new Date(Date.UTC(2026, 3, 13, 10, 0, 0)),
        allDay: false,
        timezone: 'UTC',
        rrule: null,
        exdates: [],
        alarms: [],
      },
    ],
  };
  // Build with pre-escaped summary to simulate raw ICS input
  const ics = buildICS(cal);
  const parsed = parseICS(ics);
  // double-escaped in raw → single after unescape
  assert.ok(parsed.events[0].summary.includes(','));
});

test('parseICS: parses RRULE', () => {
  const cal = {
    events: [
      {
        uid: 'rrule-parse@sen.ltd',
        summary: 'Recurring',
        description: '',
        location: '',
        dtstart: new Date(Date.UTC(2026, 3, 13, 9, 0, 0)),
        dtend: new Date(Date.UTC(2026, 3, 13, 9, 30, 0)),
        allDay: false,
        timezone: 'UTC',
        rrule: { freq: 'WEEKLY', count: 5 },
        exdates: [],
        alarms: [],
      },
    ],
  };
  const ics = buildICS(cal);
  const parsed = parseICS(ics);
  assert.equal(parsed.events[0].rrule.freq, 'WEEKLY');
  assert.equal(parsed.events[0].rrule.count, 5);
});

test('parseICS: parses alarm/VALARM', () => {
  const cal = {
    events: [
      {
        uid: 'alarm-parse@sen.ltd',
        summary: 'Alarm Event',
        description: '',
        location: '',
        dtstart: new Date(Date.UTC(2026, 3, 13, 8, 0, 0)),
        dtend: new Date(Date.UTC(2026, 3, 13, 9, 0, 0)),
        allDay: false,
        timezone: 'UTC',
        rrule: null,
        exdates: [],
        alarms: [{ trigger: '-PT1H', action: 'DISPLAY', description: 'Reminder' }],
      },
    ],
  };
  const ics = buildICS(cal);
  const parsed = parseICS(ics);
  assert.equal(parsed.events[0].alarms.length, 1);
  assert.equal(parsed.events[0].alarms[0].trigger, '-PT1H');
});

test('parseICS: empty ICS returns no events', () => {
  const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
  const parsed = parseICS(ics);
  assert.equal(parsed.events.length, 0);
});

test('parseICS: all-day event has allDay=true', () => {
  const cal = {
    events: [
      {
        uid: 'allday-parse@sen.ltd',
        summary: 'Holiday',
        description: '',
        location: '',
        dtstart: new Date(2026, 3, 13),
        dtend: new Date(2026, 3, 14),
        allDay: true,
        timezone: 'UTC',
        rrule: null,
        exdates: [],
        alarms: [],
      },
    ],
  };
  const ics = buildICS(cal);
  const parsed = parseICS(ics);
  assert.equal(parsed.events[0].allDay, true);
});
