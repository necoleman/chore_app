// ─── Sheet helpers ───────────────────────────────────────────────────────────

var SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

/**
 * Returns all data rows as an array of objects keyed by the header row.
 * Filters out completely empty rows.
 */
function getRows(sheetName) {
  var sheet = getSheet(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var empty = row.every(function(cell) { return cell === '' || cell === null || cell === undefined; });
    if (empty) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      // Convert Google Sheets Date objects to strings.
      // Sheets stores date-only cells (due_date, last_generated_date, etc.) as
      // Date objects with a midnight time component. Return those as yyyy-MM-dd
      // so they match what the frontend and generator write as plain strings.
      // Actual datetimes (completed_at, reviewed_at) have non-zero time and
      // come back with the full ISO timestamp.
      if (val instanceof Date && !isNaN(val.getTime())) {
        var formatted = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
        obj[headers[j]] = formatted.endsWith('T00:00:00') ? formatted.slice(0, 10) : formatted;
      } else {
        obj[headers[j]] = val;
      }
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * Appends a single row. Only columns present in `obj` are set; others are blank.
 */
function appendRow(sheetName, obj) {
  var sheet = getSheet(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
  sheet.appendRow(row);
}

/**
 * Finds the first row where column `keyCol` equals `keyVal`, then updates
 * only the columns present in the `updates` object.
 * Returns true if the row was found and updated.
 */
function updateRow(sheetName, keyCol, keyVal, updates) {
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var keyIdx = headers.indexOf(keyCol);
  if (keyIdx === -1) throw new Error('Column not found: ' + keyCol + ' in ' + sheetName);

  // Read ONLY the key column to locate the row. This was
  // `getDataRange().getValues()` — every column of every row — on every call,
  // and the nightly generator calls updateRow roughly three times per chore. On
  // an Assignments tab with a couple of thousand rows that is tens of thousands
  // of cells fetched per call, dozens of times a run, which is what pushed the
  // run past Apps Script's six-minute ceiling: chores late in the sheet were
  // never reached and silently stopped generating (#59).
  //
  // Behaviour is unchanged — same signature, same return values, same
  // first-match-wins, same "skip columns that don't exist" — so every one of the
  // 30-odd callers is unaffected.
  var keys = sheet.getRange(2, keyIdx + 1, lastRow - 1, 1).getValues();
  var target = String(keyVal);

  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === target) {
      var rowNum = i + 2; // +1 for the header, +1 because ranges are 1-based
      for (var col in updates) {
        var colIdx = headers.indexOf(col);
        if (colIdx !== -1) {
          sheet.getRange(rowNum, colIdx + 1).setValue(updates[col]);
        }
      }
      return true;
    }
  }
  return false;
}

/**
 * Deletes the first row where column `keyCol` equals `keyVal`.
 * Returns true if a row was found and deleted.
 */
function deleteRow(sheetName, keyCol, keyVal) {
  var sheet = getSheet(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return false;
  var headers = values[0];
  var keyIdx = headers.indexOf(keyCol);
  if (keyIdx === -1) throw new Error('Column not found: ' + keyCol + ' in ' + sheetName);

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][keyIdx]) === String(keyVal)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

/**
 * Simple short unique id: prefix + 8 hex chars.
 */
function generateId(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

/**
 * Returns today's date as yyyy-MM-dd in the script timezone.
 */
function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Formats any Date as yyyy-MM-dd.
 */
function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Current timestamp as an ISO datetime string in the SCRIPT timezone (not UTC),
 * so its date portion (slice(0,10)) matches todayStr()/formatDate(). This is what
 * `completed_at`/`reviewed_at` are stored with; the Today filter compares that
 * date portion against a local "today". Using UTC here caused evening
 * completions in behind-UTC timezones to read as "completed tomorrow", leaving
 * done cards on Today an extra day (issues #31/#32).
 */
function nowIso() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Cached getRows — used only for the `today` endpoint to avoid triple reads.
 * Cache TTL is 20 seconds.
 */
function getCachedRows(sheetName) {
  var cache = CacheService.getScriptCache();
  var key = 'rows_' + sheetName;
  var cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  var rows = getRows(sheetName);
  try {
    cache.put(key, JSON.stringify(rows), 20);
  } catch(e) {
    // Payload too large for cache — just skip caching
  }
  return rows;
}

/**
 * Invalidates cached rows for a given sheet (call after writes).
 */
function invalidateCache(sheetName) {
  CacheService.getScriptCache().remove('rows_' + sheetName);
}
