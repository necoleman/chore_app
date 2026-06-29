// E2E helpers: seed the logged-in user and mock the Apps Script backend.

// Local YYYY-MM-DD offset from today (the app compares against the local date).
export function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const USERS = {
  admin: { person_id: 'me', name: 'Me', color: '#2563eb', is_admin: true },
  kid: { person_id: 'kid', name: 'Kid', color: '#16a34a', is_admin: false },
};

// A "today response"-shaped assignment (already joined, as actionToday returns).
export function assignment(over = {}) {
  return {
    assignment_id: 'a_' + Math.random().toString(36).slice(2, 8),
    chore_id: 'c1',
    chore_name: 'Sweep kitchen',
    location: '',
    description: '',
    points: 3,
    requires_approval: false,
    person_id: null,
    person_name: null,
    person_color: null,
    due_date: localDate(0),
    status: 'open',
    completed_at: null,
    points_awarded: null,
    assigned_by: 'auto',
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    ...over,
  };
}

export function defaultState() {
  return {
    people: [USERS.admin, USERS.kid, { person_id: 'dad', name: 'Dad', color: '#111827', is_admin: true }],
    chores: [
      { chore_id: 'c1', name: 'Sweep kitchen', location: 'Kitchen', description: '', points: 3, frequency: 'daily', default_assignee: 'me', requires_approval: 'FALSE', active: 'TRUE' },
      { chore_id: 'c2', name: 'Vacuum', location: 'Living Room', description: '', points: 2, frequency: 'weekly', custom_days: '2', default_assignee: '', requires_approval: 'FALSE', active: 'TRUE' },
    ],
    locations: [{ location: 'Kitchen' }, { location: 'Living Room' }, { location: 'Garage' }],
    assignments: [],
  };
}

export async function seedUser(page, user) {
  await page.addInitScript((u) => {
    localStorage.setItem('chore_current_user', JSON.stringify(u));
  }, user);
}

// Intercepts every Apps Script request and serves from / mutates `state`.
export async function mockApi(page, state) {
  await page.route('**/macros/s/**', async (route) => {
    const req = route.request();
    const action = new URL(req.url()).searchParams.get('action');
    const method = req.method();
    let body = {};
    if (method === 'POST') { try { body = JSON.parse(req.postData() || '{}'); } catch { /* ignore */ } }
    const find = (id) => state.assignments.find((a) => a.assignment_id === id);

    let result = {};
    if (method === 'GET') {
      if (action === 'today') result = { assignments: state.assignments, people: state.people };
      else if (action === 'people') result = { people: state.people };
      else if (action === 'chores') result = { chores: state.chores };
      else if (action === 'locations') result = { locations: state.locations };
    } else {
      const a = find(body.assignment_id);
      switch (action) {
        case 'complete':
          if (a) { a.status = 'done'; a.person_id = body.person_id; a.points_awarded = a.points || 1; a.completed_at = 'now'; }
          result = { status: 'done', points_awarded: a ? a.points_awarded : 1, completed_at: 'now' };
          break;
        case 'claim': {
          const p = state.people.find((x) => x.person_id === body.person_id);
          if (a) { a.person_id = body.person_id; a.person_name = p && p.name; a.person_color = p && p.color; }
          result = { success: true };
          break;
        }
        case 'uncomplete':
          if (a) { a.status = 'open'; a.points_awarded = null; a.completed_at = null; }
          result = { status: 'open' };
          break;
        case 'approve':
          if (a) { a.status = 'done'; a.reviewed_by = body.admin_person_id; }
          result = { status: 'done' };
          break;
        case 'reject':
          if (a) { a.status = 'open'; a.review_note = body.review_note; a.reviewed_by = body.admin_person_id; }
          result = { status: 'open', review_note: body.review_note };
          break;
        case 'skip':
          if (a) a.status = 'skipped';
          result = { status: 'skipped' };
          break;
        case 'add_chore': result = { chore_id: 'c_new', success: true }; break;
        default: result = { success: true };
      }
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
}
