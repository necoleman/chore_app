// ─── Web App entry points ────────────────────────────────────────────────────

function doGet(e) {
  var action = e.parameter.action;
  try {
    var result = dispatchGet(action, e.parameter);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  var action = e.parameter.action;
  var body = {};
  try {
    body = JSON.parse(e.postData.contents || '{}');
  } catch (_) {}

  // Serialize all write operations to prevent concurrent-write corruption.
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(8000);
  if (!acquired) {
    return jsonResponse({ error: 'Server busy — try again' });
  }

  try {
    var result = dispatchPost(action, body);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── GET dispatcher ──────────────────────────────────────────────────────────

function dispatchGet(action, params) {
  switch (action) {
    case 'today':   return actionToday(params);
    case 'people':  return actionPeople(params);
    case 'chores':  return actionChores(params);
    case 'history': return actionHistory(params);
    default:        throw new Error('Unknown action: ' + action);
  }
}

// ─── POST dispatcher ─────────────────────────────────────────────────────────

function dispatchPost(action, body) {
  switch (action) {
    case 'complete':       return actionComplete(body);
    case 'approve':        return actionApprove(body);
    case 'reject':         return actionReject(body);
    case 'skip':           return actionSkip(body);
    case 'claim':          return actionClaim(body);
    case 'assign':         return actionAssign(body);
    case 'reassign':       return actionReassign(body);
    case 'bump':           return actionBump(body);
    case 'add_chore':      return actionAddChore(body);
    case 'update_chore':   return actionUpdateChore(body);
    case 'register_token': return actionRegisterToken(body);
    default:               throw new Error('Unknown action: ' + action);
  }
}

// ─── One-time setup (run manually from GAS editor) ──────────────────────────

function setup() {
  var props = PropertiesService.getScriptProperties();

  // ── Spread this out manually ──
  // props.setProperty('SPREADSHEET_ID', 'YOUR_SHEET_ID_HERE');
  // props.setProperty('FCM_PROJECT_ID', 'YOUR_FCM_PROJECT_ID');
  // props.setProperty('FCM_CLIENT_EMAIL', 'YOUR_SERVICE_ACCOUNT_EMAIL');
  // props.setProperty('FCM_PRIVATE_KEY', 'YOUR_SERVICE_ACCOUNT_PRIVATE_KEY');
  // props.setProperty('REMINDER_HOUR', '18');  // 6pm local time

  // Delete existing triggers then recreate to avoid duplicates.
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('runNightlyGenerator')
    .timeBased().atHour(0).everyDays(1).create();

  ScriptApp.newTrigger('runStreakMaintenance')
    .timeBased().atHour(23).everyDays(1).create();

  ScriptApp.newTrigger('runReminderPush')
    .timeBased().everyMinutes(30).create();

  Logger.log('Setup complete — triggers created.');
}
