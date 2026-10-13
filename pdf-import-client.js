(() => {
 async function wait(job,onStage,version){
  while(job.status!=='complete'){
   if(version!==epoch||!currentUser)throw new Error('Sesija je promenjena. Obradu proverite u Biblioteci.');
   if(job.status==='failed')throw new Error((job.error||'Obrada nije završena.')+(job.fileId?' Original je sačuvan u Biblioteci.':' Original nije više dostupan.'));
   onStage?.(job.stage||'PDF čeka obradu');await new Promise(resolve=>setTimeout(resolve,2000));
   try{job=await api('/api/pdf-imports/'+job.id);}catch(e){throw new Error(e.message+' Obrada može biti nastavljena; proverite Biblioteku pre ponovnog uvoza.');}
  }
  if(version!==epoch)throw new Error('Sesija je promenjena.');return job.result;
 }
 window.importPdfFile=async(payload,options={})=>{
  const version=epoch;const job=options.upload?await options.upload():await api('/api/pdf-imports','POST',payload);
  return wait(job,options.onStage,version);
 };
 window.resumePdfImport=async(jobId,onStage)=>{const version=epoch;const job=await api('/api/pdf-imports/'+jobId+'/retry','POST',{});return wait(job,onStage,version);};
 window.prepareExistingPdf=async(fileId,onStage)=>{const version=epoch;const job=await api('/api/pdf-imports/from-file/'+fileId,'POST',{});return wait(job,onStage,version);};
})();
