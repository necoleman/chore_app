// ─── FCM push reminders ───────────────────────────────────────────────────────

function runReminderPush() {
  var now = new Date();
  var reminderHour = parseInt(
    PropertiesService.getScriptProperties().getProperty('REMINDER_HOUR') || '18',
    10
  );

  // Only send reminders after the configured hour
  if (now.getHours() < reminderHour) return;

  var todayISO = todayStr();
  var assignments = getRows('Assignments');
  var people = getRows('People');
  var chores = getRows('Chores');

  var personMap = {};
  people.forEach(function(p) { personMap[p.person_id] = p; });
  var choreMap = {};
  chores.forEach(function(c) { choreMap[c.chore_id] = c; });

  var openToday = assignments.filter(function(a) {
    return a.due_date === todayISO && a.status === 'open' && a.person_id;
  });

  openToday.forEach(function(assignment) {
    var person = personMap[assignment.person_id];
    if (!person || !person.fcm_token) return;
    var choreName = (choreMap[assignment.chore_id] || {}).name || 'a chore';
    sendPush(person.fcm_token, "Don't forget!", 'You still need to: ' + choreName);
  });

  // Admin digest: count pending_review items and notify admins
  var pendingCount = assignments.filter(function(a) {
    return a.due_date === todayISO && a.status === 'pending_review';
  }).length;

  if (pendingCount > 0) {
    people.forEach(function(person) {
      var isAdmin = person.is_admin === true || person.is_admin === 'TRUE';
      if (!isAdmin || !person.fcm_token) return;
      sendPush(
        person.fcm_token,
        'Chores need review',
        pendingCount + ' chore' + (pendingCount === 1 ? '' : 's') + ' waiting for your approval'
      );
    });
  }
}

/**
 * Sends an immediate notification to `personId` about a specific assignment.
 * Called from reassign/bump/generator flows.
 */
function sendAssignmentNotification(assignmentId, personId) {
  var people = getRows('People');
  var person = people.find(function(p) { return p.person_id === personId; });
  if (!person || !person.fcm_token) return;

  var assignments = getRows('Assignments');
  var assignment = assignments.find(function(a) { return a.assignment_id === assignmentId; });
  if (!assignment) return;

  var chores = getRows('Chores');
  var chore = chores.find(function(c) { return c.chore_id === assignment.chore_id; });
  var choreName = chore ? chore.name : 'a chore';

  sendPush(person.fcm_token, 'New chore assigned', 'You have a new task: ' + choreName);
}

/**
 * Sends a bump notification: "X has been rescheduled to <date>".
 */
function sendBumpNotification(personId, choreId, newDate) {
  var people = getRows('People');
  var person = people.find(function(p) { return p.person_id === personId; });
  if (!person || !person.fcm_token) return;

  var chores = getRows('Chores');
  var chore = chores.find(function(c) { return c.chore_id === choreId; });
  var choreName = chore ? chore.name : 'A chore';

  sendPush(person.fcm_token, 'Chore rescheduled', choreName + ' moved to ' + newDate);
}

// ─── FCM HTTP v1 ──────────────────────────────────────────────────────────────

function sendPush(fcmToken, title, body) {
  try {
    var accessToken = getFCMAccessToken();
    var projectId = PropertiesService.getScriptProperties().getProperty('FCM_PROJECT_ID');
    var url = 'https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send';

    var payload = JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title: title, body: body },
      },
    });

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + accessToken },
      payload: payload,
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('FCM error: ' + response.getContentText());
    }
  } catch (e) {
    Logger.log('sendPush failed: ' + e.message);
  }
}

/**
 * Gets a short-lived OAuth2 access token for FCM using a service account JWT,
 * with no external library. Tokens are cached for 50 minutes (they last 60).
 *
 * Required Script Properties: FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY.
 */
function getFCMAccessToken() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('fcm_access_token');
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var clientEmail = props.getProperty('FCM_CLIENT_EMAIL');
  var privateKey  = props.getProperty('FCM_PRIVATE_KEY');

  if (!clientEmail || !privateKey) {
    throw new Error('FCM_CLIENT_EMAIL or FCM_PRIVATE_KEY not set in Script Properties');
  }

  var now = Math.floor(Date.now() / 1000);
  var claim = {
    iss:   clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  };

  // Build and sign the JWT using Apps Script's built-in RSA-SHA256 support.
  var header  = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify(claim));
  var unsigned = header + '.' + payload;

  var signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(unsigned, privateKey)
  );

  var jwt = unsigned + '.' + signature;

  var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
    muteHttpExceptions: true,
  });

  var result = JSON.parse(response.getContentText());
  if (!result.access_token) {
    throw new Error('FCM token exchange failed: ' + JSON.stringify(result));
  }

  // Cache for 50 minutes (token expires in 60, giving 10 min headroom).
  cache.put('fcm_access_token', result.access_token, 3000);
  return result.access_token;
}
