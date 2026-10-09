const {fork}=require('node:child_process');
const path=require('node:path');
const {HttpError}=require('./auth');
let active=0;
async function previewFile(file,page=1){
 if(!Number.isSafeInteger(page)||page<1)throw new HttpError(400,'Neispravna stranica.');
 if(active>=2)throw new HttpError(429,'Pregled je zauzet. Pokušajte ponovo.');
 if(file.content.length>20000000)throw new HttpError(413,'Dokument je prevelik za pregled.');
 active++;
 try{return await new Promise((resolve,reject)=>{
  const child=fork(path.join(__dirname,'attachment-worker.js'),[],{execArgv:['--max-old-space-size=192'],stdio:['ignore','ignore','ignore','ipc']});
  let done=false;
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);child.kill();error?reject(error):resolve(result);};
  const timer=setTimeout(()=>finish(new HttpError(422,'Pregled traje predugo. Pokušajte sa manjim dokumentom.')),20000);
  child.once('message',result=>result.error?finish(new HttpError(422,result.error)):finish(null,result.kind?result:{kind:'text',text:result.text}));
  child.once('error',()=>finish(new HttpError(422,'Pregled nije dostupan.')));
  child.once('exit',()=>finish(new HttpError(422,'Obrada pregleda je prekinuta.')));
  child.send({buffer:Buffer.from(file.content).toString('base64'),extension:path.extname(file.name).toLowerCase(),preview:true,page});
 });}finally{active--;}
}
module.exports={previewFile};
