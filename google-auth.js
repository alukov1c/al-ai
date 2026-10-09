const { OAuth2Client } = require('google-auth-library');
const { randomBytes, randomUUID } = require('node:crypto');
const { transaction } = require('./db');
const { HttpError, hashToken, verifyPassword, publicUser, limitLogin } = require('./auth');

function createGoogleAuth({ pool, clientId, authenticate, secureCookies, setSessionCookie, verifyToken }) {
  const client = new OAuth2Client(clientId);
  const verify = verifyToken || (async (credential) => {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    return ticket.getPayload();
  });
  const challengeCookie = secureCookies ? '__Host-al_ai_google' : 'al_ai_google';
  function cookie(response, token, age) {
    const value = challengeCookie + '=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + age + (secureCookies ? '; Secure' : '');
    const existing = response.getHeader('Set-Cookie');
    response.setHeader('Set-Cookie', [...(existing ? [].concat(existing) : []), value]);
  }
  return async (pathname, request, response, data) => {
    if (!clientId) throw new HttpError(503, 'Google prijava još nije podešena. Koristite korisničko ime i lozinku.');
    if (request.method !== 'POST') throw new HttpError(405, 'Metoda nije dozvoljena.');
    if (pathname === '/api/google/challenge') {
      let user = null;
      if (data.link === true) {
        user = await authenticate(request);
        if (request.headers['x-csrf-token'] !== user.csrf_token) throw new HttpError(403, 'Osvežite stranicu.');
        if (user.must_change_password || user.approval_state !== 'approved') throw new HttpError(403, 'Nalog još nije spreman za povezivanje.');
        if (user.google_sub) throw new HttpError(409, 'Google nalog je već povezan.');
        await limitLogin(pool, 'link:' + user.id, 10);
        if (!await verifyPassword(data.password, user.password_hash)) throw new HttpError(400, 'Potvrdite svoju trenutnu lozinku.');
      }
      const token = randomBytes(32).toString('hex');
      const nonce = randomBytes(32).toString('hex');
      await pool.query('DELETE FROM google_challenges WHERE expires_at<now()');
      await pool.query(`INSERT INTO google_challenges(token_hash,nonce_hash,user_id,session_hash,expires_at)
        VALUES($1,$2,$3,$4,now()+interval '5 minutes')`, [hashToken(token), hashToken(nonce), user?.id || null, user?.token_hash || null]);
      cookie(response, token, 300);
      return { nonce };
    }
    if (pathname !== '/api/google/login') throw new HttpError(404, 'Operacija nije pronađena.');
    const token = (request.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(challengeCookie + '='))?.slice(challengeCookie.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(403, 'Osvežite Google dugme i pokušajte ponovo.');
    if (typeof data.credential !== 'string' || data.credential.length > 16000) throw new HttpError(400, 'Neispravna Google potvrda.');
    const challenge = (await pool.query('SELECT * FROM google_challenges WHERE token_hash=$1 AND expires_at>now()', [hashToken(token)])).rows[0];
    if (!challenge) throw new HttpError(403, 'Google prijava je istekla. Osvežite dugme.');
    let claims;
    try { claims = await verify(data.credential); } catch { throw new HttpError(401, 'Google potvrda nije važeća. Pokušajte ponovo.'); }
    if (!claims || !claims.sub || !claims.email || claims.email_verified !== true ||
      claims.aud !== clientId || !['accounts.google.com','https://accounts.google.com'].includes(claims.iss) ||
      !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now() ||
      typeof claims.nonce !== 'string' || hashToken(claims.nonce) !== challenge.nonce_hash) {
      throw new HttpError(401, 'Google potvrda nije važeća za ovu prijavu.');
    }
    let linkingUser;
    if (challenge.user_id) {
      linkingUser = await authenticate(request);
      if (linkingUser.id !== challenge.user_id || linkingUser.token_hash !== challenge.session_hash ||
        request.headers['x-csrf-token'] !== linkingUser.csrf_token) throw new HttpError(403, 'Ponovite povezivanje iz svog naloga.');
    }
    const sessionToken = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    const user = await transaction(pool, async (db) => {
      const used = await db.query('DELETE FROM google_challenges WHERE token_hash=$1 AND expires_at>now() RETURNING token_hash', [hashToken(token)]);
      if (!used.rowCount) throw new HttpError(403, 'Ova Google potvrda je već iskorišćena.');
      // Serijalizovati prvo povezivanje istog Google identiteta.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['google:' + claims.sub]);
      let row = (await db.query('SELECT * FROM users WHERE google_sub=$1 FOR UPDATE', [claims.sub])).rows[0];
      if (challenge.user_id) {
        if (row && row.id !== challenge.user_id) throw new HttpError(409, 'Google nalog već pripada drugom nalogu aplikacije. Automatsko spajanje razgovora nije dozvoljeno.');
        const existing = (await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [challenge.user_id])).rows[0];
        const session = await db.query('SELECT token_hash FROM sessions WHERE token_hash=$1 AND expires_at>now()', [challenge.session_hash]);
        if (!existing?.is_active || !session.rowCount || existing.must_change_password || existing.approval_state !== 'approved') throw new HttpError(403, 'Ponovite prijavu pre povezivanja.');
        if (existing.google_sub && existing.google_sub !== claims.sub) throw new HttpError(409, 'Nalog već ima drugu Google prijavu.');
        row = (await db.query('UPDATE users SET google_sub=$1,google_email=$2 WHERE id=$3 RETURNING *', [claims.sub, claims.email, existing.id])).rows[0];
      } else if (!row) {
        row = (await db.query(`INSERT INTO users(id,username,display_name,google_sub,google_email,approval_state,must_change_password)
          VALUES($1,$2,$3,$4,$5,'pending',false) RETURNING *`,
          [randomUUID(), 'google_' + randomBytes(12).toString('hex'), String(claims.name || claims.email).slice(0,80), claims.sub, claims.email])).rows[0];
      }
      if (!row.is_active) throw new HttpError(403, 'Pristup nalogu je isključen. Obratite se administratoru.');
      await db.query(`INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '7 days')`, [hashToken(sessionToken), row.id, csrfToken]);
      if (linkingUser) await db.query('DELETE FROM sessions WHERE token_hash=$1', [linkingUser.token_hash]);
      return row;
    });
    cookie(response, '', 0);
    setSessionCookie(response, sessionToken, 7 * 86400);
    return { user: publicUser(user), csrfToken };
  };
}
module.exports = { createGoogleAuth };
