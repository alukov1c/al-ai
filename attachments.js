const { fork } = require('node:child_process');
const path = require('node:path');
const { HttpError } = require('./auth');
let active = 0;
async function extractAttachment(data) {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const extension = path.extname(name).toLowerCase();
  if (!name || name.length > 180 || /[\x00-\x1f/\\]/.test(name)) throw new HttpError(400, 'Neispravan naziv datoteke.');
  if (!['.pdf','.docx','.txt','.md','.csv','.json','.log','.xlsx','.pptx'].includes(extension)) throw new HttpError(415, 'Podržani su PDF, DOCX, TXT, MD, CSV, JSON, LOG, XLSX i PPTX.');
  if (typeof data.content !== 'string' || data.content.length > 4_000_000 || (data.content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.content))) throw new HttpError(413, 'Datoteka može imati najviše 3 MB.');
  const buffer = Buffer.from(data.content, 'base64');
  if (!buffer.length || buffer.length > 3_000_000) throw new HttpError(400, 'Datoteka je prazna ili prevelika.');
  if (active >= 2) throw new HttpError(429, 'Obrada dokumenata je zauzeta. Pokušajte ponovo.');
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const worker = fork(path.join(__dirname, 'attachment-worker.js'), [], { execArgv:['--max-old-space-size=128'], stdio:['ignore','ignore','ignore','ipc'] });
      let done = false;
      const finish = (error, result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.kill(); if (error) reject(error); else resolve({ name, text: result });
      };
      const timer = setTimeout(() => finish(new HttpError(422, 'Obrada traje predugo. Pokušajte sa manjim dokumentom.')), 20000);
      worker.once('message', (result) => result.error ? finish(new HttpError(422, result.error)) : finish(null, result.text));
      worker.once('error', () => finish(new HttpError(422, 'Dokument nije moguće pročitati. Proverite format i veličinu.')));
      worker.send({ buffer: buffer.toString('base64'), extension });
      worker.once('exit', () => { if (!done) finish(new HttpError(422, 'Obrada dokumenta je prekinuta.')); });
    });
  } finally { active--; }
}
module.exports = { extractAttachment };
