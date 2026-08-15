const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.PORT) || 3000;
const apiFilePath = path.join(__dirname, 'api.txt');
const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  || (fs.existsSync(apiFilePath) ? fs.readFileSync(apiFilePath, 'utf8').trim() : '');
const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/stil.css', ['stil.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function handleChat(request, response) {
  if (!apiKey) return sendJson(response, 500, { error: 'DEEPSEEK_API_KEY nije podešen na serveru.' });
  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) request.destroy();
  });
  request.on('end', async () => {
    try {
      const data = JSON.parse(body);
      const allowedModels = new Set(['deepseek-chat', 'deepseek-reasoner']);
      if (!Array.isArray(data.messages) || !data.messages.length) return sendJson(response, 400, { error: 'Poruke nisu prosleđene.' });
      const messages = data.messages.slice(-30).map(({ role, content }) => ({ role, content: String(content).slice(0, 12000) }));
      const apiResponse = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: allowedModels.has(data.model) ? data.model : 'deepseek-chat', messages, temperature: 0.7 })
      });
      const result = await apiResponse.json();
      if (!apiResponse.ok) return sendJson(response, apiResponse.status, { error: result.error?.message || 'Greška DeepSeek API-ja.' });
      return sendJson(response, 200, { message: result.choices?.[0]?.message?.content || 'Model nije vratio odgovor.' });
    } catch (error) {
      return sendJson(response, 500, { error: `Serverska greška: ${error.message}` });
    }
  });
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (request.method === 'POST' && pathname === '/api/chat') return handleChat(request, response);
  const file = publicFiles.get(pathname);
  if (request.method !== 'GET' || !file) return sendJson(response, 404, { error: 'Stranica nije pronađena.' });
  fs.readFile(path.join(__dirname, file[0]), (error, content) => {
    if (error) return sendJson(response, 500, { error: 'Datoteka ne može biti učitana.' });
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' });
    response.end(content);
  });
});

server.listen(port, () => console.log(`AL AI je pokrenut na http://localhost:${port}`));
