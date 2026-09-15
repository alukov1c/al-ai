const { createPool, transaction } = require('../db');
const { username, hashPassword } = require('../auth');
(async () => {
  require('../config').loadEnvironment();
  const name = username(process.env.ADMIN_USERNAME);
  const passwordHash = await hashPassword(process.env.ADMIN_PASSWORD);
  const pool = createPool();
  try {
    await transaction(pool, async (client) => {
      const updated = await client.query('UPDATE users SET password_hash=$1,is_active=true,must_change_password=false WHERE username=$2 AND is_admin=true RETURNING id', [passwordHash, name]);
      if (!updated.rowCount) throw new Error();
      await client.query('DELETE FROM sessions WHERE user_id=$1', [updated.rows[0].id]);
    });
    console.log('Administratorska lozinka je promenjena; prethodne sesije su odjavljene.');
  } finally { await pool.end(); }
})().catch(() => { console.error('Reset nije uspeo. Proveriti ADMIN_USERNAME, ADMIN_PASSWORD i DATABASE_URL.'); process.exitCode = 1; });
