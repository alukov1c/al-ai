const { PGlite } = require('@electric-sql/pglite');
const { migrate } = require('../db');
const { bootstrapAdmin } = require('../auth');
const { createApp } = require('../server');

async function fixture(options = {}) {
  const db = new PGlite();
  let queue = Promise.resolve();
  async function lock() {
    let release;
    const next = new Promise((resolve) => { release = resolve; });
    const previous = queue;
    queue = next;
    await previous;
    return release;
  }
  async function query(sql, values) {
    const result = values ? await db.query(sql, values) : (await db.exec(sql)).at(-1);
    return { rows: result?.rows || [], rowCount: result?.affectedRows || result?.rows?.length || 0 };
  }
  const pool = {
    async query(sql, values) { const release = await lock(); try { return await query(sql, values); } finally { release(); } },
    async connect() { const release = await lock(); return { query, release }; },
    async end() { await db.close(); }
  };
  await migrate(pool);
  await migrate(pool);
  await bootstrapAdmin(pool, { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'Admin-password-test-123' });
  await bootstrapAdmin(pool, {});
  let calls = [];
  let upstream = async (url, request) => {
    calls.push(JSON.parse(request.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Sačuvan test odgovor.' }, finish_reason: 'stop' }] }) };
  };
  let origin;
  const makeApp = () => createApp({ pool, apiKey: 'test-key', appOrigin: origin, googleClientId: 'test-client',
    fetchImpl: (...args) => upstream(...args),
    verifyGoogleToken: async (credential) => { if (credential === 'invalid') throw new Error(); return JSON.parse(credential); }
  });
  let server = makeApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  await new Promise((resolve) => server.close(resolve));
  server = makeApp();
  await new Promise((resolve) => server.listen(Number(new URL(origin).port), '127.0.0.1', resolve));

  function client() {
    const cookies = new Map();
    let csrf = '';
    return {
      cookies,
      async request(route, method = 'GET', body, overrides = {}) {
        const headers = { Connection: 'close', Cookie: [...cookies].map(([k,v]) => k + '=' + v).join('; '),
          ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }),
          ...overrides };
        const response = await fetch(origin + route, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        for (const cookie of response.headers.getSetCookie()) {
          const [key, value] = cookie.split(';')[0].split('=');
          cookies.set(key, value);
        }
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('json') ? await response.json() : await response.text();
        if (data.csrfToken) csrf = data.csrfToken;
        return { status: response.status, data, headers: response.headers };
      },
      async login(name, password) { return this.request('/api/login', 'POST', { username: name, password }); },
      async google(sub, extra = {}, link = false, password) {
        const challenge = await this.request('/api/google/challenge', 'POST', { link, password });
        if (challenge.status !== 200) return challenge;
        return this.request('/api/google/login', 'POST', { credential: JSON.stringify({
          sub, email: sub + '@gmail.com', name: 'Google Test', email_verified: true, aud: 'test-client',
          iss: 'https://accounts.google.com', exp: Math.floor(Date.now()/1000)+3600, nonce: challenge.data.nonce, ...extra
        }) });
      }
    };
  }
  return { pool, origin, client, calls,
    setUpstream(fn) { upstream = fn; },
    async restart() { await new Promise((resolve) => server.close(resolve)); server = makeApp(); await new Promise((resolve) => server.listen(Number(new URL(origin).port), '127.0.0.1', resolve)); },
    async close() { await new Promise((resolve) => server.close(resolve)); await pool.end(); }
  };
}
module.exports = { fixture };
