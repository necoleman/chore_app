const BASE = import.meta.env.VITE_API_URL;

if (!BASE) {
  console.warn('VITE_API_URL is not set — API calls will fail.');
}

// credentials: 'omit' prevents Chrome from attaching Google session cookies to
// requests going to *.google.com. Without it, Chrome's stricter credentialed-
// request CORS check fires on the 302 redirect and the request fails before
// Apps Script can respond.
const FETCH_OPTS = { redirect: 'follow', credentials: 'omit' };

export async function get(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${BASE}?${qs}`, FETCH_OPTS);
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  return data;
}

// Apps Script rejects CORS preflights triggered by Content-Type: application/json.
// Omitting Content-Type causes the browser to default to text/plain for the
// fetch, which avoids the preflight while still sending a JSON-parseable body.
export async function post(action, body) {
  const res = await fetch(`${BASE}?action=${encodeURIComponent(action)}`, {
    ...FETCH_OPTS,
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  return data;
}
