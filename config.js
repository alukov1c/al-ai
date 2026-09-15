const fs = require('node:fs');
const path = require('node:path');

function loadEnvironment(filename = path.join(__dirname, '.env')) {
  const inheritedKey = process.env.DEEPSEEK_API_KEY?.trim() || process.env.API_KEY?.trim();
  if (fs.existsSync(filename)) {
    if (typeof process.loadEnvFile !== 'function') throw new Error('Potreban je Node.js 20.12 ili noviji za ucitavanje .env.');
    process.loadEnvFile(filename);
  }
  // Dati prednost vrednostima okruzenja i podrzati oba naziva API kljuca.
  const apiKey = inheritedKey || process.env.DEEPSEEK_API_KEY?.trim() || process.env.API_KEY?.trim();
  if (apiKey) process.env.DEEPSEEK_API_KEY = apiKey;
}

module.exports = { loadEnvironment };
