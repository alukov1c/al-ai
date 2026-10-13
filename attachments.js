const { prepareImage } = require('./images');
﻿const { fork } = require('node:child_process');
const path = require('node:path');
const { HttpError } = require('./auth');
let active = 0;
async function extractAttachment(data) {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const extension = path.extname(name).toLowerCase();
  if (!name || name.length > 180 || /[\x00-\x1f/\\]/.test(name)) throw new HttpError(400, 'Neispravan naziv datoteke.');
  if (!['.pdf','.docx','.txt','.md','.csv','.json','.log','.xlsx','.pptx','.png','.jpg','.jpeg','.webp','.gif'].includes(extension)) throw new HttpError(415, 'Podržani su PDF, DOCX, TXT, MD, CSV, JSON, LOG, XLSX, PPTX i slike PNG/JPG/WebP/GIF.');
  const maxBytes=extension==='.pdf'?30_000_000:3_000_000;
  if (typeof data.content !== 'string' || data.content.length > 4*Math.ceil(maxBytes/3) || (data.content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.content))) throw new HttpError(413, 'Datoteka može imati najviše '+(maxBytes/1000000)+' MB.');
  const buffer = Buffer.from(data.content, 'base64');
  if (!buffer.length || buffer.length > maxBytes) throw new HttpError(400, 'Datoteka je prazna ili prevelika.');
  if (active >= 2) throw new HttpError(429, 'Obrada dokumenata je zauzeta. Pokušajte ponovo.');
  active++;
  try {
    if (['.png','.jpg','.jpeg','.webp','.gif'].includes(extension)) { const image=await prepareImage(name,buffer); return {name:image.name,kind:'image',image}; }
    return await new Promise((resolve, reject) => {
      const worker = fork(path.join(__dirname, 'attachment-worker.js'), [], { execArgv:[extension==='.pdf'?'--max-old-space-size=256':'--max-old-space-size=128'], stdio:['ignore','ignore','ignore','ipc'] });
      let done = false;
      const finish = (error, result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.kill(); if (error) reject(error); else resolve({ name, ...(typeof result==='object'?result:{text:result}) });
      };
      const timer = setTimeout(() => finish(new HttpError(422, 'Obrada traje predugo. Pokušajte sa manjim dokumentom.')), extension==='.pdf'?300000:20000);
      worker.once('message', (result) => result.error ? finish(new HttpError(422, result.error)) : finish(null, extension==='.pdf'?result:result.text));
      worker.once('error', () => finish(new HttpError(422, 'Dokument nije moguće pročitati. Proverite format i veličinu.')));
      worker.send({ buffer: buffer.toString('base64'), extension,book:extension==='.pdf' });
      worker.once('exit', () => { if (!done) finish(new HttpError(422, 'Obrada dokumenta je prekinuta.')); });
    });
  } finally { active--; }
}
module.exports = { extractAttachment };
