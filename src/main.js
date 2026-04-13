/**
 * main.js — DOM interactions, form handling, app state
 */

import { buildICS, parseICS, generateUID } from './ical.js';
import { t, TIMEZONES } from './i18n.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let locale = navigator.language.startsWith('ja') ? 'ja' : 'en';
let darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * @type {{
 *   calName: string,
 *   events: Array<{
 *     id: string,
 *     uid: string,
 *     summary: string,
 *     description: string,
 *     location: string,
 *     dtstart: string,  // datetime-local value
 *     dtend: string,
 *     allDay: boolean,
 *     timezone: string,
 *     rrule: { freq: string, count: number|null, until: string|null, interval: number } | null,
 *     alarm: string,    // 'none' | '-PT15M' | '-PT1H' | '-P1D'
 *   }>
 * }}
 */
let state = {
  calName: '',
  events: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(n) {
  return String(n).padStart(2, '0');
}

function localDateTimeValue(date = new Date()) {
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  return `${y}-${mo}-${d}T${h}:${m}`;
}

function parseLocalDateTime(str) {
  if (!str) return new Date();
  // "2026-04-13T15:00" → Date (local)
  return new Date(str);
}

/** Convert state event → calendar event object for ical.js */
function stateEventToCalEvent(ev) {
  const dtstart = parseLocalDateTime(ev.dtstart);
  const dtend = ev.dtend ? parseLocalDateTime(ev.dtend) : new Date(dtstart.getTime() + 3600 * 1000);
  const isUTC = ev.timezone === 'UTC' || !ev.timezone;

  const calEv = {
    uid: ev.uid,
    summary: ev.summary,
    description: ev.description,
    location: ev.location,
    dtstart,
    dtend,
    allDay: ev.allDay,
    timezone: ev.timezone || 'UTC',
    rrule: null,
    exdates: [],
    alarms: [],
  };

  // Recurrence
  if (ev.rrule && ev.rrule.freq && ev.rrule.freq !== 'NONE') {
    const rule = { freq: ev.rrule.freq };
    if (ev.rrule.interval > 1) rule.interval = ev.rrule.interval;
    if (ev.rrule.endType === 'count' && ev.rrule.count > 0) {
      rule.count = ev.rrule.count;
    } else if (ev.rrule.endType === 'until' && ev.rrule.until) {
      rule.until = new Date(ev.rrule.until);
    }
    calEv.rrule = rule;
  }

  // Alarm
  if (ev.alarm && ev.alarm !== 'none') {
    calEv.alarms = [
      {
        trigger: ev.alarm,
        action: 'DISPLAY',
        description: 'Reminder',
      },
    ];
  }

  return calEv;
}

/** Build the ICS string from current state */
function buildCurrentICS() {
  const calendar = {
    calName: state.calName || 'My Calendar',
    events: state.events.map(stateEventToCalEvent),
  };
  return buildICS(calendar);
}

// ---------------------------------------------------------------------------
// DOM References (resolved after DOMContentLoaded)
// ---------------------------------------------------------------------------

let $eventsContainer;
let $preview;
let $downloadBtn;
let $addEventBtn;
let $calNameInput;
let $copyBtn;
let $pasteArea;
let $parseBtn;
let $themeBtn;
let $langBtn;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAll() {
  renderEvents();
  updatePreview();
  updateLabels();
}

function updateLabels() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(locale, key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(locale, el.dataset.i18nPlaceholder);
  });
  if ($themeBtn) {
    $themeBtn.textContent = darkMode ? t(locale, 'lightMode') : t(locale, 'darkMode');
  }
  if ($langBtn) {
    $langBtn.textContent = locale === 'ja' ? 'EN' : 'JA';
  }
}

function updatePreview() {
  if (!$preview) return;
  const ics = buildCurrentICS();
  $preview.textContent = ics;
}

function createEventForm(ev, index) {
  const section = document.createElement('section');
  section.className = 'event-card';
  section.dataset.eventId = ev.id;

  const header = document.createElement('div');
  header.className = 'event-card__header';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'event-card__title';
  titleSpan.textContent = t(locale, 'eventN', index + 1);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn--ghost btn--small';
  removeBtn.textContent = t(locale, 'removeEvent');
  removeBtn.addEventListener('click', () => {
    state.events = state.events.filter((e) => e.id !== ev.id);
    renderAll();
  });

  header.appendChild(titleSpan);
  header.appendChild(removeBtn);
  section.appendChild(header);

  // Fields
  section.appendChild(
    makeField('text', 'summary', ev.summary, t(locale, 'eventTitle'), ev, 'summary')
  );
  section.appendChild(
    makeTextareaField('description', ev.description, t(locale, 'description'), ev, 'description')
  );
  section.appendChild(
    makeField('text', 'location', ev.location, t(locale, 'location'), ev, 'location')
  );

  // All-day toggle
  const allDayRow = document.createElement('div');
  allDayRow.className = 'field field--inline';
  const allDayLabel = document.createElement('label');
  allDayLabel.className = 'field__label';
  allDayLabel.textContent = t(locale, 'allDay');
  const allDayCheck = document.createElement('input');
  allDayCheck.type = 'checkbox';
  allDayCheck.checked = ev.allDay;
  allDayCheck.className = 'field__checkbox';
  allDayCheck.addEventListener('change', () => {
    ev.allDay = allDayCheck.checked;
    // toggle time part visibility
    const timeParts = section.querySelectorAll('.time-part');
    timeParts.forEach((el) => {
      el.style.display = ev.allDay ? 'none' : '';
    });
    updatePreview();
  });
  allDayRow.appendChild(allDayLabel);
  allDayRow.appendChild(allDayCheck);
  section.appendChild(allDayRow);

  // Start / end date-time
  const dtRow = document.createElement('div');
  dtRow.className = 'field-row';

  const startField = makeDateTimeField(
    'dtstart',
    ev.dtstart,
    t(locale, 'startDateTime'),
    ev,
    'dtstart',
    ev.allDay
  );
  const endField = makeDateTimeField(
    'dtend',
    ev.dtend,
    t(locale, 'endDateTime'),
    ev,
    'dtend',
    ev.allDay
  );
  dtRow.appendChild(startField);
  dtRow.appendChild(endField);
  section.appendChild(dtRow);

  // Timezone
  section.appendChild(makeTimezoneField(ev));

  // Recurrence
  section.appendChild(makeRecurrenceFields(ev));

  // Alarm
  section.appendChild(makeAlarmField(ev));

  return section;
}

function makeField(type, name, value, label, ev, prop) {
  const div = document.createElement('div');
  div.className = 'field';
  const lbl = document.createElement('label');
  lbl.className = 'field__label';
  lbl.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.value = value || '';
  input.className = 'field__input';
  input.addEventListener('input', () => {
    ev[prop] = input.value;
    updatePreview();
  });
  div.appendChild(lbl);
  div.appendChild(input);
  return div;
}

function makeTextareaField(name, value, label, ev, prop) {
  const div = document.createElement('div');
  div.className = 'field';
  const lbl = document.createElement('label');
  lbl.className = 'field__label';
  lbl.textContent = label;
  const ta = document.createElement('textarea');
  ta.className = 'field__textarea';
  ta.value = value || '';
  ta.rows = 3;
  ta.addEventListener('input', () => {
    ev[prop] = ta.value;
    updatePreview();
  });
  div.appendChild(lbl);
  div.appendChild(ta);
  return div;
}

function makeDateTimeField(name, value, label, ev, prop, allDay) {
  const div = document.createElement('div');
  div.className = 'field';
  const lbl = document.createElement('label');
  lbl.className = 'field__label';
  lbl.textContent = label;

  const inputDate = document.createElement('input');
  inputDate.type = 'date';
  inputDate.className = 'field__input';
  inputDate.value = value ? value.slice(0, 10) : '';

  const inputTime = document.createElement('input');
  inputTime.type = 'time';
  inputTime.className = 'field__input time-part';
  inputTime.value = value ? value.slice(11, 16) : '';
  if (allDay) inputTime.style.display = 'none';

  const sync = () => {
    const d = inputDate.value;
    const ti = inputTime.value || '00:00';
    if (d) {
      ev[prop] = `${d}T${ti}`;
      updatePreview();
    }
  };

  inputDate.addEventListener('change', sync);
  inputTime.addEventListener('change', sync);

  div.appendChild(lbl);
  div.appendChild(inputDate);
  div.appendChild(inputTime);
  return div;
}

function makeTimezoneField(ev) {
  const div = document.createElement('div');
  div.className = 'field';
  const lbl = document.createElement('label');
  lbl.className = 'field__label';
  lbl.textContent = t(locale, 'timezone');
  const sel = document.createElement('select');
  sel.className = 'field__select';

  TIMEZONES.forEach((tz) => {
    const opt = document.createElement('option');
    opt.value = tz;
    opt.textContent = tz;
    if (tz === (ev.timezone || 'UTC')) opt.selected = true;
    sel.appendChild(opt);
  });

  sel.addEventListener('change', () => {
    ev.timezone = sel.value;
    updatePreview();
  });

  div.appendChild(lbl);
  div.appendChild(sel);
  return div;
}

function makeRecurrenceFields(ev) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field recurrence-wrapper';

  const lbl = document.createElement('label');
  lbl.className = 'field__label';
  lbl.textContent = t(locale, 'recurrence');
  wrapper.appendChild(lbl);

  const freqSel = document.createElement('select');
  freqSel.className = 'field__select';

  const freqOptions = [
    { value: 'NONE', label: t(locale, 'recurrenceNone') },
    { value: 'DAILY', label: t(locale, 'recurrenceDaily') },
    { value: 'WEEKLY', label: t(locale, 'recurrenceWeekly') },
    { value: 'MONTHLY', label: t(locale, 'recurrenceMonthly') },
    { value: 'YEARLY', label: t(locale, 'recurrenceYearly') },
  ];

  freqOptions.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if ((ev.rrule?.freq || 'NONE') === value) opt.selected = true;
    freqSel.appendChild(opt);
  });

  // Extra recurrence options container
  const extraDiv = document.createElement('div');
  extraDiv.className = 'recurrence-extra';

  const renderExtra = () => {
    extraDiv.innerHTML = '';
    const freq = freqSel.value;
    if (freq === 'NONE') {
      ev.rrule = null;
      return;
    }
    if (!ev.rrule) ev.rrule = { freq, interval: 1, endType: 'never', count: 1, until: '' };
    ev.rrule.freq = freq;

    // Interval
    const intervalRow = document.createElement('div');
    intervalRow.className = 'field field--inline';
    const intervalLbl = document.createElement('label');
    intervalLbl.textContent = t(locale, 'interval');
    intervalLbl.className = 'field__label';
    const intervalInput = document.createElement('input');
    intervalInput.type = 'number';
    intervalInput.min = '1';
    intervalInput.value = ev.rrule.interval || 1;
    intervalInput.className = 'field__input field__input--short';
    intervalInput.addEventListener('input', () => {
      ev.rrule.interval = parseInt(intervalInput.value, 10) || 1;
      updatePreview();
    });
    intervalRow.appendChild(intervalLbl);
    intervalRow.appendChild(intervalInput);
    extraDiv.appendChild(intervalRow);

    // End condition
    const endRow = document.createElement('div');
    endRow.className = 'field';
    const endLbl = document.createElement('label');
    endLbl.textContent = t(locale, 'endCondition');
    endLbl.className = 'field__label';
    endRow.appendChild(endLbl);

    const endSel = document.createElement('select');
    endSel.className = 'field__select';
    [
      { value: 'never', label: t(locale, 'endNever') },
      { value: 'count', label: t(locale, 'endAfter') },
      { value: 'until', label: t(locale, 'endOn') },
    ].forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if ((ev.rrule.endType || 'never') === value) opt.selected = true;
      endSel.appendChild(opt);
    });

    const endValueDiv = document.createElement('div');
    endValueDiv.className = 'recurrence-end-value';

    const renderEndValue = () => {
      endValueDiv.innerHTML = '';
      ev.rrule.endType = endSel.value;
      if (endSel.value === 'count') {
        const countInput = document.createElement('input');
        countInput.type = 'number';
        countInput.min = '1';
        countInput.value = ev.rrule.count || 1;
        countInput.className = 'field__input field__input--short';
        countInput.addEventListener('input', () => {
          ev.rrule.count = parseInt(countInput.value, 10) || 1;
          updatePreview();
        });
        endValueDiv.appendChild(countInput);
      } else if (endSel.value === 'until') {
        const untilInput = document.createElement('input');
        untilInput.type = 'date';
        untilInput.value = ev.rrule.until || '';
        untilInput.className = 'field__input';
        untilInput.addEventListener('change', () => {
          ev.rrule.until = untilInput.value;
          updatePreview();
        });
        endValueDiv.appendChild(untilInput);
      }
      updatePreview();
    };

    endSel.addEventListener('change', renderEndValue);
    renderEndValue();

    endRow.appendChild(endSel);
    endRow.appendChild(endValueDiv);
    extraDiv.appendChild(endRow);
  };

  freqSel.addEventListener('change', () => {
    renderExtra();
    updatePreview();
  });

  renderExtra();
  wrapper.appendChild(freqSel);
  wrapper.appendChild(extraDiv);
  return wrapper;
}

function makeAlarmField(ev) {
  const div = document.createElement('div');
  div.className = 'field';
  const lbl = document.createElement('label');
  lbl.className = 'field__label';
  lbl.textContent = t(locale, 'alarm');
  const sel = document.createElement('select');
  sel.className = 'field__select';

  const alarmOptions = [
    { value: 'none', label: t(locale, 'alarmNone') },
    { value: '-PT15M', label: t(locale, 'alarm15min') },
    { value: '-PT1H', label: t(locale, 'alarm1hour') },
    { value: '-P1D', label: t(locale, 'alarm1day') },
  ];
  alarmOptions.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if ((ev.alarm || 'none') === value) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    ev.alarm = sel.value;
    updatePreview();
  });

  div.appendChild(lbl);
  div.appendChild(sel);
  return div;
}

function renderEvents() {
  if (!$eventsContainer) return;
  $eventsContainer.innerHTML = '';

  if (state.events.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'events-empty';
    empty.textContent = t(locale, 'noEvents');
    $eventsContainer.appendChild(empty);
    return;
  }

  state.events.forEach((ev, i) => {
    $eventsContainer.appendChild(createEventForm(ev, i));
  });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function addEvent() {
  const now = new Date();
  const later = new Date(now.getTime() + 3600 * 1000);

  state.events.push({
    id: generateUID(),
    uid: generateUID(),
    summary: '',
    description: '',
    location: '',
    dtstart: localDateTimeValue(now),
    dtend: localDateTimeValue(later),
    allDay: false,
    timezone: 'UTC',
    rrule: null,
    alarm: 'none',
  });
  renderAll();
}

function downloadICS() {
  const ics = buildCurrentICS();
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (state.calName || 'calendar') + '.ics';
  a.click();
  URL.revokeObjectURL(url);
}

function copyToClipboard() {
  const ics = buildCurrentICS();
  navigator.clipboard.writeText(ics).then(() => {
    if ($copyBtn) {
      const original = $copyBtn.textContent;
      $copyBtn.textContent = t(locale, 'copied');
      setTimeout(() => {
        $copyBtn.textContent = original;
      }, 1500);
    }
  });
}

function parseAndLoad(icsStr) {
  try {
    const cal = parseICS(icsStr);
    state.calName = cal.calName || '';
    if ($calNameInput) $calNameInput.value = state.calName;

    state.events = cal.events.map((ev) => {
      const startLocal = ev.dtstart
        ? localDateTimeValue(ev.dtstart)
        : localDateTimeValue();
      const endLocal = ev.dtend ? localDateTimeValue(ev.dtend) : '';

      // Reverse-map alarms
      let alarm = 'none';
      if (ev.alarms && ev.alarms.length > 0) {
        const trigger = ev.alarms[0].trigger;
        if (trigger === '-PT15M') alarm = '-PT15M';
        else if (trigger === '-PT1H' || trigger === '-PT60M') alarm = '-PT1H';
        else if (trigger === '-P1D') alarm = '-P1D';
      }

      // Reverse-map rrule
      let rrule = null;
      if (ev.rrule && ev.rrule.freq) {
        rrule = {
          freq: ev.rrule.freq,
          interval: ev.rrule.interval || 1,
          endType: ev.rrule.count != null ? 'count' : ev.rrule.until ? 'until' : 'never',
          count: ev.rrule.count || 1,
          until: ev.rrule.until ? localDateTimeValue(ev.rrule.until).slice(0, 10) : '',
        };
      }

      return {
        id: generateUID(),
        uid: ev.uid || generateUID(),
        summary: ev.summary || '',
        description: ev.description || '',
        location: ev.location || '',
        dtstart: startLocal,
        dtend: endLocal,
        allDay: ev.allDay || false,
        timezone: ev.timezone || 'UTC',
        rrule,
        alarm,
      };
    });

    renderAll();
  } catch (e) {
    alert(t(locale, 'parseError'));
    console.error(e);
  }
}

function handleFileUpload(file) {
  const reader = new FileReader();
  reader.onload = (e) => parseAndLoad(e.target.result);
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function applyTheme() {
  document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
}

document.addEventListener('DOMContentLoaded', () => {
  $eventsContainer = document.getElementById('events-container');
  $preview = document.getElementById('ics-preview');
  $downloadBtn = document.getElementById('btn-download');
  $addEventBtn = document.getElementById('btn-add-event');
  $calNameInput = document.getElementById('cal-name');
  $copyBtn = document.getElementById('btn-copy');
  $pasteArea = document.getElementById('paste-area');
  $parseBtn = document.getElementById('btn-parse');
  $themeBtn = document.getElementById('btn-theme');
  $langBtn = document.getElementById('btn-lang');

  // Attach listeners
  $addEventBtn?.addEventListener('click', addEvent);
  $downloadBtn?.addEventListener('click', downloadICS);
  $copyBtn?.addEventListener('click', copyToClipboard);

  $calNameInput?.addEventListener('input', () => {
    state.calName = $calNameInput.value;
    updatePreview();
  });

  $parseBtn?.addEventListener('click', () => {
    const text = $pasteArea?.value?.trim();
    if (text) parseAndLoad(text);
  });

  $themeBtn?.addEventListener('click', () => {
    darkMode = !darkMode;
    applyTheme();
    updateLabels();
  });

  $langBtn?.addEventListener('click', () => {
    locale = locale === 'ja' ? 'en' : 'ja';
    renderAll();
  });

  // Drag & drop on paste area
  const dropZone = document.getElementById('drop-zone');
  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drop-zone--over');
  });
  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('drop-zone--over');
  });
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drop-zone--over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  });

  const fileInput = document.getElementById('file-input');
  fileInput?.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileUpload(fileInput.files[0]);
  });

  applyTheme();
  renderAll();
  // Start with one empty event
  addEvent();
});
