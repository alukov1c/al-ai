const { Pool } = require('pg');
const fs = require('node:fs/promises');
const path = require('node:path');

function createPool() {
  if (!process.env.DATABASE_URL) throw new Error('Podesiti DATABASE_URL pre pokretanja servera.');
  const databaseUrl = new URL(process.env.DATABASE_URL);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: databaseUrl.hostname.endsWith('.render.com') ? { rejectUnauthorized: true } : undefined,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  pool.on('error', () => console.error('Prekinuta je veza sa bazom podataka.'));
  return pool;
}

async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function migrate(pool) {
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(74091401)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await fs.readdir(path.join(__dirname, 'migrations'))).filter((name) => name.endsWith('.sql')).sort();
    for (const name of files) {
      const existing = await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name]);
      if (!existing.rowCount) {
        await client.query(await fs.readFile(path.join(__dirname, 'migrations', name), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
      }
    }
  });
}

module.exports = { createPool, transaction, migrate };
