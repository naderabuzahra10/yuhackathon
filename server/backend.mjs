// Calls to the UniJourney API from this server, plus small shared helpers for the handlers.

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

export function readJson(req, limit = 200_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(fail(413, 'too_large', 'Request too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(fail(400, 'bad_json', 'Body is not JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** Refuse writes that come from a page on another origin. */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const STAFF_ROLES = ['operator', 'student_affairs', 'club_advisor', 'security', 'reviewer', 'registrar', 'admission_officer'];
export const isStaff = (user) => !!user?.roles?.some((r) => STAFF_ROLES.includes(r));
export const isStudent = (user) => !!user?.roles?.includes('student');

export function createBackend(env = process.env) {
  const origin = (env.UNIJOURNEY_API || 'https://unijourney-yu-a12fda.fly.dev').replace(/\/+$/, '');

  async function request(path, { cookie, method = 'GET', body } = {}) {
    const res = await fetch(`${origin}/api${path}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = await res.json().catch(() => null);
    if (!json?.ok) throw fail(res.status === 200 ? 502 : res.status, json?.error?.code ?? 'backend', json?.error?.message ?? `The UniJourney API answered ${res.status}`);
    return { data: json.data, setCookie: res.headers.getSetCookie?.() ?? [] };
  }

  const get = async (path, cookie) => (await request(path, { cookie })).data;

  // Who is asking: the browser's own session cookie, checked with the API. Cached briefly per cookie.
  const known = new Map();
  async function userOf(req) {
    const cookie = req.headers.cookie ?? '';
    if (!/uj_session=/.test(cookie)) throw fail(401, 'no_session', 'Open the app first so a session exists');
    const hit = known.get(cookie);
    if (hit && Date.now() - hit.at < 15_000) return hit.user;
    const data = await get('/session/me', cookie);
    const user = data.user ?? data;
    known.set(cookie, { at: Date.now(), user });
    if (known.size > 500) known.delete(known.keys().next().value);
    return user;
  }

  // In demo mode the API lets anyone act as any synthetic persona. Insights use that to read the
  // student personas' own records; outside demo mode this returns null and insights say so.
  const personaCookies = new Map();
  async function cookieFor(personaId) {
    const hit = personaCookies.get(personaId);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.cookie;
    try {
      const first = await request('/session/me');
      let cookie = first.setCookie.map((c) => c.split(';')[0]).join('; ');
      const switched = await request('/session/switch', { cookie, method: 'POST', body: { personaId } });
      if (switched.setCookie.length) cookie = switched.setCookie.map((c) => c.split(';')[0]).join('; ');
      personaCookies.set(personaId, { at: Date.now(), cookie });
      return cookie;
    } catch {
      return null;
    }
  }

  let clock = { at: 0, value: null };
  /** "Now" on the demo clock when the API runs in demo mode, so stamps match what the app shows. */
  async function now() {
    if (Date.now() - clock.at > 30_000) {
      const status = await get('/demo/status').catch(() => null);
      clock = { at: Date.now(), value: status?.demoMode && status.clock ? status.clock : null };
    }
    return clock.value ?? new Date().toISOString();
  }

  return { origin, get, request, userOf, cookieFor, now };
}
