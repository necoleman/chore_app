// In-memory test harness for the Google Apps Script backend.
//
// Loads the real .gs source (apps-script/*.gs) into a Node `vm` context with
// fake Google services backed by in-memory sheets, so the pure logic can be
// unit-tested. Reminders.gs (FCM/crypto) is NOT loaded; its notifier functions
// are provided as no-ops.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPS_DIR = path.resolve(__dirname, '../../../apps-script');

// Files loaded into the context, in dependency order. (Code.gs/Reminders.gs are
// excluded — they need ScriptApp/ContentService/UrlFetchApp + crypto.)
const FILES = ['SheetUtils.gs', 'DateUtils.gs', 'Streaks.gs', 'Endpoints.gs', 'Generator.gs'];

// Canonical column order per sheet (matches the README schema).
export const HEADERS = {
  People: ['person_id', 'name', 'color', 'fcm_token', 'points_total', 'streak_current', 'streak_best', 'is_admin'],
  Chores: ['chore_id', 'name', 'location', 'description', 'points', 'frequency', 'custom_days', 'monthly_day', 'interval_days', 'once_date', 'start_date', 'last_generated_date', 'default_assignee', 'requires_approval', 'active'],
  Assignments: ['assignment_id', 'chore_id', 'person_id', 'due_date', 'status', 'completed_at', 'assigned_by', 'points_awarded', 'reviewed_by', 'reviewed_at', 'review_note', 'last_modified_by', 'last_modified_at'],
  Locations: ['location'],
};

function objectsToGrid(name, rows) {
  const headers = HEADERS[name];
  const grid = [headers.slice()];
  for (const obj of rows ?? []) {
    grid.push(headers.map((h) => (obj[h] === undefined ? '' : obj[h])));
  }
  return grid;
}

function gridToObjects(grid) {
  const headers = grid[0];
  return grid.slice(1).map((row) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = row[i]; });
    return o;
  });
}

function pad(n) { return String(n).padStart(2, '0'); }

// Build a fresh backend instance with the given initial sheet data.
// initial: { People: [...objs], Chores: [...], Assignments: [...], Locations: [...] }
export function loadBackend(initial = {}) {
  const store = {};
  for (const name of Object.keys(HEADERS)) {
    store[name] = objectsToGrid(name, initial[name] || []);
  }

  function makeSheet(name) {
    return {
      getDataRange() {
        return { getValues() { return store[name].map((r) => r.slice()); } };
      },
      getLastColumn() { return store[name][0].length; },
      getRange(row, col, numRows, numCols) {
        return {
          getValues() {
            const out = [];
            const rows = numRows || 1;
            const cols = numCols || store[name][0].length;
            for (let r = 0; r < rows; r++) {
              const src = store[name][row - 1 + r] || [];
              out.push(src.slice(col - 1, col - 1 + cols));
            }
            return out;
          },
          setValue(v) { store[name][row - 1][col - 1] = v; },
        };
      },
      appendRow(arr) { store[name].push(arr.slice()); },
    };
  }

  const cache = new Map();
  let uuidCounter = 0;

  const sandbox = {
    // Host built-ins (share Date so vi.setSystemTime works inside the vm).
    Date, JSON, Math, parseInt, parseFloat, String, Number, Boolean,
    Object, Array, isNaN, isFinite, Error, RegExp, Map, Set, Symbol, console,

    // ── Google service stubs ──
    SpreadsheetApp: {
      openById() { return { getSheetByName: (name) => makeSheet(name) }; },
    },
    CacheService: {
      getScriptCache() {
        return {
          get: (k) => (cache.has(k) ? cache.get(k) : null),
          put: (k, v) => { cache.set(k, v); },
          remove: (k) => { cache.delete(k); },
        };
      },
    },
    PropertiesService: {
      getScriptProperties() {
        const props = { SPREADSHEET_ID: 'TEST_SHEET' };
        return { getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } };
      },
    },
    Utilities: {
      getUuid() {
        uuidCounter += 1;
        const n = String(uuidCounter).padStart(8, '0');
        return `${n}-0000-4000-8000-000000000000`;
      },
      formatDate(date, _tz, pattern) {
        const y = date.getFullYear();
        const parts = `${y}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        if (pattern === "yyyy-MM-dd'T'HH:mm:ss") {
          return `${parts}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        }
        return parts;
      },
    },
    Session: { getScriptTimeZone: () => 'America/Chicago' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Logger: { log: () => {} },

    // Notifier functions live in Reminders.gs (not loaded) — stub as no-ops and
    // record calls so the generator's default-assignee path can be asserted.
    __notifications: [],
  };
  sandbox.sendAssignmentNotification = (...args) => { sandbox.__notifications.push(['assign', ...args]); };
  sandbox.sendBumpNotification = (...args) => { sandbox.__notifications.push(['bump', ...args]); };

  const ctx = vm.createContext(sandbox);
  for (const file of FILES) {
    const src = fs.readFileSync(path.join(APPS_DIR, file), 'utf8');
    vm.runInContext(src, ctx, { filename: file });
  }

  return {
    ctx,
    // Read current sheet state as objects (raw values, not date-normalized).
    read(name) { return gridToObjects(store[name]); },
    notifications: sandbox.__notifications,
  };
}
