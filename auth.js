const { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const { transaction } = require('./db');
const deriveKey = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function hashToken(value) { return createHash('sha256').update(value).digest('hex'); }
function username(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.@-]{3,80}$/.test(value.trim())) {
    throw new HttpError(400, 'Korisničko ime: 3–80 znakova (slova bez dijakritika, cifre, tačka, _, @ ili -).');
  }
  return value.trim().toLowerCase();
}
function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new HttpError(400, 'Lozinka mora imati 12–128 znakova.');
  }
}
async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64, options);
  return ['scrypt', salt, key.toString('hex')].join('$');
}
async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128 || typeof encoded !== 'string') return false;
  const [algorithm, salt, hex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = await deriveKey(password, salt, 64, options);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function publicUser(row) {
  return { id: row.id, username: row.username, displayName: row.display_name,
    isAdmin: row.is_admin, isActive: row.is_active, mustChangePassword: row.must_change_password,
    approvalState: row.approval_state, hasPassword: Boolean(row.password_hash), googleLinked: Boolean(row.google_sub), googleEmail: row.google_email || null };
}
async function bootstrapAdmin(pool, env = process.env) {
  if ((await pool.query('SELECT id FROM users WHERE is_admin=true LIMIT 1')).rowCount) return;
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    throw new Error('Za prvi start podesiti ADMIN_USERNAME i ADMIN_PASSWORD (najmanje 12 znakova).');
  }
  const name = username(env.ADMIN_USERNAME);
  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(74091402)');
    if (!(await client.query('SELECT id FROM users WHERE is_admin=true LIMIT 1')).rowCount) {
      await client.query('INSERT INTO users(id,username,display_name,password_hash,is_admin,must_change_password) VALUES($1,$2,$3,$4,true,false)',
        [randomUUID(), name, 'Administrator', passwordHash]);
    }
  });
}
async function limitLogin(pool, key, limit) {
  const result = await pool.query(`
    INSERT INTO login_limits(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes')
    ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN login_limits.expires_at < now() THEN 1 ELSE login_limits.attempts+1 END,
      expires_at=CASE WHEN login_limits.expires_at < now() THEN now()+interval '15 minutes' ELSE login_limits.expires_at END
    RETURNING attempts`, [hashToken(key)]);
  if (result.rows[0].attempts > limit) throw new HttpError(429, 'Previše pokušaja prijave. Pokušajte ponovo za 15 minuta.');
}
module.exports = { HttpError, hashToken, username, validatePassword, hashPassword, verifyPassword, publicUser, bootstrapAdmin, limitLogin };
