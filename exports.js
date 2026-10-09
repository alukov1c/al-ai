const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { HttpError } = require('./auth');
let active=0;
const types={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
async function exportDocument(data) {
  if(!Object.hasOwn(types,data.format))throw new HttpError(400,'Nepodržan format izvoza.');
  if(!data.content || data.content.length>100000)throw new HttpError(400,'Za izvoz izaberite odgovor do 100.000 znakova.');
  if(active>=2)throw new HttpError(429,'Izvoz je zauzet. Pokušajte ponovo.');
  active++;
  try{return await new Promise((resolve,reject)=>{
    const worker=new Worker(path.join(__dirname,'export-worker.js'),{workerData:data,resourceLimits:{maxOldGenerationSizeMb:192}});
    let done=false;
    const finish=(error,buffer)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate().finally(()=>error?reject(error):resolve({buffer:Buffer.from(buffer),mime:types[data.format]}));};
    const timer=setTimeout(()=>finish(new HttpError(422,'Izvoz traje predugo. Izaberite kraći odgovor.')),30000);
    worker.once('message',result=>result.error?finish(new HttpError(422,'Izvoz dokumenta nije uspeo.')):finish(null,result.buffer));
    worker.once('error',()=>finish(new HttpError(422,'Izvoz dokumenta nije uspeo.')));
    worker.once('exit',()=>{if(!done)finish(new HttpError(422,'Izvoz dokumenta je prekinut.'));});
  });}finally{active--;}
}
module.exports={exportDocument};
