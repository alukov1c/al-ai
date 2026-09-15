const { createPool, migrate } = require('../db');
(async () => {
  require('../config').loadEnvironment();
  const pool = createPool();
  try { await migrate(pool); console.log('Migracije su završene.'); }
  finally { await pool.end(); }
})().catch(() => { console.error('Migracije nisu uspele. Proveriti DATABASE_URL i pristup bazi.'); process.exitCode = 1; });
