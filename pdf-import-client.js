(() => {
 const pause=()=>new Promise(resolve=>setTimeout(resolve,2000));
 function valid(version){if(version!==epoch||!currentUser)throw new Error('Sesija je promenjena. Obradu proverite u Biblioteci.');}
 async function statusRequest(route,onStage,version){
  for(let n=0;;n++){valid(version);try{return await api(route);}catch(error){if(!error.retryable||n>=4)throw error;onStage?.('Veza sa hostingom je prekinuta; ponovna provera obrade…');await pause();}}
 }
 async function wait(job,onStage,version){
  while(job.status!=='complete'){
   valid(version);
   if(job.status==='failed')throw new Error((job.error||'Obrada nije završena.')+(job.fileId?' Original je sačuvan u Biblioteci.':' Original nije više dostupan.'));
   onStage?.(job.stage||'PDF čeka obradu');await pause();
   try{job=await statusRequest('/api/pdf-imports/'+job.id,onStage,version);}catch(error){throw new Error(error.message+' Obrada može biti nastavljena; proverite Biblioteku pre ponovnog uvoza.');}
  }
  valid(version);return job.result;
 }
 async function fingerprint(payload){const prefix=new TextEncoder().encode(payload.name.trim()+'\0'),decoded=atob(payload.content),bytes=new Uint8Array(prefix.length+decoded.length);bytes.set(prefix);for(let n=0;n<decoded.length;n++)bytes[prefix.length+n]=decoded.charCodeAt(n);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
 window.importPdfFile=async(payload,options={})=>{
  const version=epoch,hash=await fingerprint(payload);valid(version);let job;
  try{job=options.upload?await options.upload():await api('/api/pdf-imports','POST',payload);}catch(error){
   if(!error.retryable)throw error;
   for(let n=0;n<5;n++){valid(version);options.onStage?.('Provera da li je hosting sačuvao PDF…');try{const found=await api('/api/pdf-imports/find','POST',{projectId:payload.projectId||null,fingerprint:hash});if(found.job){job=found.job;break;}}catch(check){if(!check.retryable)throw check;}if(n<4)await pause();}
   if(!job)throw new Error(error.message+' Slanje nije potvrđeno. Proverite Biblioteku pre ponovnog uvoza.');
  }
  return wait(job,options.onStage,version);
 };
 window.resumePdfImport=async(jobId,onStage)=>{const version=epoch;const job=await api('/api/pdf-imports/'+jobId+'/retry','POST',{});return wait(job,onStage,version);};
 window.prepareExistingPdf=async(fileId,onStage)=>{const version=epoch;const job=await api('/api/pdf-imports/from-file/'+fileId,'POST',{});return wait(job,onStage,version);};
})();
