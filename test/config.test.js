const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('Ucitati .env i sacuvati prednost Render promenljivih', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'al-ai-env-'));
  try {
    const file = path.join(folder, '.env');
    fs.writeFileSync(file, 'DATABASE_URL="postgresql://test/test"\nAPI_KEY="fake#test key"\nAPP_ORIGIN=http://localhost:3000\n');
    const modulePath = path.resolve(__dirname, '../config.js');
    function run(environment, filePath = file) {
      const env = { ...process.env };
      for (const key of ['DATABASE_URL','API_KEY','DEEPSEEK_API_KEY','APP_ORIGIN']) delete env[key];
      Object.assign(env, environment);
      const script = 'require(' + JSON.stringify(modulePath) + ').loadEnvironment(' + JSON.stringify(filePath) + '); console.log(JSON.stringify([process.env.DATABASE_URL,process.env.DEEPSEEK_API_KEY]));';
      const child = spawnSync(process.execPath, ['-e',script], { cwd:folder, env, encoding:'utf8' });
      assert.equal(child.status,0);
      return JSON.parse(child.stdout);
    }
    assert.deepEqual(run({}),['postgresql://test/test','fake#test key']);
    assert.deepEqual(run({DATABASE_URL:'render-db',DEEPSEEK_API_KEY:'render-key'}),['render-db','render-key']);
    assert.deepEqual(run({API_KEY:'render-alias'}),['postgresql://test/test','render-alias']);
    assert.deepEqual(run({DATABASE_URL:'render-db',API_KEY:'render-key'},path.join(folder,'missing.env')),['render-db','render-key']);
  } finally {
    fs.unlinkSync(path.join(folder,'.env'));
    fs.rmdirSync(folder);
  }
});
