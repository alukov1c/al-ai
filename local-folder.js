/* Local handles stay in this browser, separately for each account and project. */
(() => {
 const supported=/\.(pdf|docx|xlsx|pptx|txt|md|csv|json|log|png|jpe?g|webp|gif)$/i;
 const folderDialog=document.createElement('dialog');folderDialog.className='account-dialog';folderDialog.id='localFolderDialog';
 folderDialog.innerHTML='<div class="dialog-heading"><h2>Lokalni folder projekta</h2><button type="button" id="localFolderClose" aria-label="Zatvori">×</button></div><p id="localFolderName"></p><p>Izaberite datoteke za slanje u Biblioteku projekta. Za obradu ih zatim izaberite u Work režimu. Originali ostaju u folderu.</p><div class="folder-toolbar"><button type="button" id="localFolderConnect">Poveži folder</button><button type="button" id="localFolderScan">Osveži datoteke</button><button type="button" id="localFolderDisconnect">Odveži folder</button></div><input type="file" id="localFolderFallback" webkitdirectory multiple hidden><div id="localFolderFiles" class="local-folder-files"></div><button type="button" id="localFolderUpload">Uvezi izabrane datoteke</button><p id="localFolderStatus" role="status"></p>';
 const progressBox=document.createElement('div');progressBox.id='localFolderProgressBox';progressBox.hidden=true;progressBox.innerHTML='<label for="localFolderProgress">Napredak uvoza: <strong id="localFolderPercent">0%</strong></label><progress id="localFolderProgress" max="100" value="0"></progress><p id="localFolderProgressStage" role="status"></p>';folderDialog.insertBefore(progressBox,folderDialog.querySelector('#localFolderStatus'));
 document.body.append(folderDialog);
 const folderButton=document.createElement('button');folderButton.type='button';folderButton.textContent='Lokalni folder';folderButton.id='projectLocalFolder';$('#projectForm').insertBefore(folderButton,$('#projectStatus'));
 const importDialog=document.createElement('dialog');importDialog.className='account-dialog';importDialog.id='externalImportDialog';
 importDialog.innerHTML='<div class="dialog-heading"><h2>Uvoz razgovora</h2><button type="button" id="externalImportClose" aria-label="Zatvori">×</button></div><p>JSON izvoz: ChatGPT conversations.json, Claude ili razgovori sa title/messages (role/content). Najviše 3 MB, 100 razgovora i 5000 poruka. Prenosi se tekst; prilozi, tokeni i alatke se ne prenose. Kod ChatGPT izvoza koristi se izabrana grana razgovora.</p><label>Projekat<select id="externalImportProject"></select></label><label>JSON datoteka<input type="file" id="externalImportFile" accept=".json,application/json"></label><div id="externalImportPreview" class="local-folder-files"></div><button type="button" id="externalImportSave" disabled>Uvezi razgovore</button><p id="externalImportStatus" role="status"></p>';
 document.body.append(importDialog);
 const importButton=document.createElement('button');importButton.type='button';importButton.textContent='Uvezi razgovore iz AI aplikacije';importButton.id='externalImportOpen';$('#settings-library').insertBefore(importButton,$('#libraryStatus'));
 let folderContext=null,entries=[],record=null,importText='',busy=false,importBusy=false,folderVersion=0,importVersion=0;
 function contextValid(ctx){return ctx&&ctx.epoch===epoch&&ctx.user===currentUser?.id;}
 function key(ctx){return ctx.user+':'+ctx.project;}
 async function storage(ctx,value,remove=false){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('al-ai-local-folders',1);r.onupgradeneeded=()=>r.result.createObjectStore('folders');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise((resolve,reject)=>{const write=value!==undefined||remove,tx=db.transaction('folders',write?'readwrite':'readonly'),store=tx.objectStore('folders');const r=remove?store.delete(key(ctx)):write?store.put(value,key(ctx)):store.get(key(ctx));let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Čuvanje veze nije uspelo.'));});}finally{db.close();}
 }
 function folderControls(){for(const id of ['localFolderConnect','localFolderScan','localFolderDisconnect','localFolderUpload'])$('#'+id).disabled=busy;}
 function drawEntries(){const list=$('#localFolderFiles');list.replaceChildren();entries.forEach((entry,index)=>{const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=index;box.disabled=entry.size>attachmentSizeLimit(entry.name)||entry.size===0;label.append(box,document.createTextNode(entry.path+' · '+Math.ceil(entry.size/1024)+' KB'+(box.disabled?' (prazna ili preko '+attachmentSizeLimit(entry.name)/1000000+' MB)':'')));list.append(label);});$('#localFolderName').textContent=record?.name||'Folder nije povezan.';}
 async function permission(handle,mode){if(await handle.queryPermission({mode})==='granted')return;if(await handle.requestPermission({mode})!=='granted')throw new Error('Pristup folderu nije odobren.');}
 async function scan(ctx){
  const found=[];let visited=0,truncated=false;
  async function walk(handle,prefix='',depth=0){for await(const child of handle.values()){if(++visited>1000){truncated=true;return;}if(child.name.startsWith('.')||['node_modules','AL-AI-rezultati'].includes(child.name))continue;const path=prefix+child.name;if(child.kind==='directory'){if(depth<8)await walk(child,path+'/',depth+1);else truncated=true;}else if(supported.test(child.name)){const f=await child.getFile();found.push({path,name:f.name,size:f.size,handle:child});}if(!contextValid(ctx))return;}}
  await walk(record.handle);if(!contextValid(ctx))return;entries=found;drawEntries();$('#localFolderStatus').textContent='Datoteke: '+found.length+'.'+(truncated?' Pregled je ograničen na 1000 stavki i 8 nivoa podfoldera.':'');
 }
 async function folderOperation(work){if(busy)return;const ctx=folderContext;if(!contextValid(ctx))return;busy=true;folderControls();try{await work(ctx);}catch(e){if(contextValid(ctx)&&e.name!=='AbortError')$('#localFolderStatus').textContent=e.message;}finally{busy=false;folderControls();}}
 folderButton.addEventListener('click',async()=>{
  if(!editingProject){$('#projectStatus').textContent='Najpre sačuvajte projekat, pa povežite folder.';return;}
  const p=workspace.projects.find(p=>p.id===editingProject);if(!p){$('#projectStatus').textContent='Za povezivanje vratite projekat iz arhive.';return;}
  if(busy)return;const version=++folderVersion;folderContext={epoch,user:currentUser.id,project:editingProject};const ctx=folderContext;record=null;entries=[];$('#localFolderProgressBox').hidden=true;drawEntries();$('#localFolderStatus').textContent='Veza se čuva samo u ovom pregledaču. Bez podrške za direktan pristup možete izabrati folder za uvoz.';folderDialog.showModal();
  busy=true;folderControls();try{const saved=await storage(ctx);if(contextValid(ctx)&&version===folderVersion){record=saved||null;drawEntries();}}catch(e){if(contextValid(ctx))$('#localFolderStatus').textContent=e.message;}finally{busy=false;folderControls();}
 });
 $('#localFolderClose').addEventListener('click',()=>folderDialog.close());
 $('#localFolderConnect').addEventListener('click',()=>{
  if(!window.showDirectoryPicker){$('#localFolderFallback').click();return;}
  // Invoke the picker directly from the click to retain browser user activation.
  const pending=window.showDirectoryPicker({mode:'read'});
  folderOperation(async ctx=>{const handle=await pending;if(!contextValid(ctx))return;const same=record?.handle&&await handle.isSameEntry(record.handle);record={handle,name:handle.name,uploads:same?record.uploads:{}};await storage(ctx,record);await scan(ctx);});
 });
 $('#localFolderFallback').addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';if(!files.length)return;folderOperation(async ctx=>{await storage(ctx,undefined,true);if(!contextValid(ctx))return;record={name:files[0]?.webkitRelativePath.split('/')[0]||'Izabrani folder',uploads:{}};entries=files.slice(0,1000).filter(f=>supported.test(f.name)&&!f.webkitRelativePath.split('/').some(n=>n.startsWith('.')||n==='node_modules'||n==='AL-AI-rezultati')).map(file=>({path:file.webkitRelativePath,name:file.name,size:file.size,file}));drawEntries();$('#localFolderStatus').textContent='Izbor važi do zatvaranja stranice. Direktno čuvanje u folder zahteva Chrome/Edge sa podrškom za povezivanje.'+(files.length>1000?' Pregledano je prvih 1000 stavki.':'');});});
 $('#localFolderScan').addEventListener('click',()=>folderOperation(async ctx=>{if(!record?.handle)throw new Error('Ponovo izaberite folder za uvoz.');await permission(record.handle,'read');await scan(ctx);}));
 $('#localFolderDisconnect').addEventListener('click',()=>folderOperation(async ctx=>{await storage(ctx,undefined,true);if(!contextValid(ctx))return;record=null;entries=[];drawEntries();$('#localFolderStatus').textContent='Folder je odvezan. Uvezene kopije ostaju u Biblioteci.';}));
 function uploadWithProgress(ctx,payload,onProgress){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',/\.pdf$/i.test(payload.name)?'/api/pdf-imports':'/api/attachments/extract');xhr.setRequestHeader('Content-Type','application/json');xhr.setRequestHeader('X-CSRF-Token',csrfToken);xhr.timeout=600000;xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total);};xhr.upload.onload=()=>onProgress(1);xhr.onload=()=>{let data;try{data=parseApiPayload(xhr.responseText,xhr.status);}catch(error){if(xhr.status===401&&contextValid(ctx))signedOut(error.message);reject(error);return;}if(xhr.status>=200&&xhr.status<300)resolve(data);else{if(xhr.status===401&&contextValid(ctx))signedOut(data.error);reject(new Error(data.error||'Uvoz nije uspeo.'));}};xhr.onerror=()=>{const error=new Error('Veza je prekinuta tokom uvoza.');error.retryable=true;reject(error);};xhr.ontimeout=()=>{const error=new Error('Slanje PDF-a nije potvrđeno. Proverite Biblioteku; ne šaljite original ponovo pre provere.');error.retryable=true;reject(error);};xhr.send(JSON.stringify(payload));});}
 $('#localFolderUpload').addEventListener('click',()=>folderOperation(async ctx=>{
  const selected=[...$('#localFolderFiles').querySelectorAll('input:checked')].map(box=>entries[Number(box.value)]);if(!selected.length)throw new Error('Izaberite datoteke za uvoz.');if(selected.length>20)throw new Error('Izaberite najviše 20 datoteka po uvozu.');
  let index=0;function progress(part,stage){if(!contextValid(ctx))return;const percent=Math.min(100,Math.floor((index+part)/selected.length*100));$('#localFolderProgressBox').hidden=false;$('#localFolderProgress').value=percent;$('#localFolderPercent').textContent=percent+'%';$('#localFolderProgressStage').textContent=stage;}
  progress(0,'Priprema uvoza…');$('#localFolderStatus').textContent='';
  const existing=new Set((await api('/api/files')).files.filter(f=>f.project_id===ctx.project).map(f=>f.id));let imported=0,skipped=0;const errors=[];
  for(const entry of selected){if(!contextValid(ctx))return;try{
   progress(0,'Čitanje: '+entry.path);const f=entry.file||await entry.handle.getFile();validateAttachmentSize(f);if(!f.size)throw new Error('Datoteka je prazna.');
   const bytes=await new Promise((resolve,reject)=>{const r=new FileReader();r.onprogress=e=>{if(e.lengthComputable)progress(e.loaded/e.total*.4,'Čitanje: '+entry.path);};r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Datoteka nije pročitana.'));r.readAsArrayBuffer(f);});if(!contextValid(ctx))return;progress(.4,'Provera datoteke: '+entry.path);
   const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');const fingerprint=entry.path+':'+digest;
   if(existing.has(record.uploads[fingerprint])){skipped++;}else{
    const content=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(new Error('Datoteka nije pročitana.'));r.readAsDataURL(new Blob([bytes]));});if(!contextValid(ctx))return;
    const payload={name:entry.name,content,projectId:ctx.project};const upload=()=>uploadWithProgress(ctx,payload,fraction=>progress(.4+fraction*.5,fraction===1?'Original poslat; čeka potvrdu: '+entry.path:'Slanje: '+entry.path));const result=/\.pdf$/i.test(entry.name)?await window.importPdfFile(payload,{upload,onStage:stage=>progress(.9,entry.path+' · '+stage)}):await upload();if(!contextValid(ctx))return;record.uploads[fingerprint]=result.fileId;imported++;if(record.handle)await storage(ctx,record);
   }
  }catch(e){errors.push(entry.path+': '+e.message);}index++;if(!(errors.length&&imported===0&&skipped===0))progress(0,'Obrađene datoteke: '+index+'/'+selected.length);}
  if(!contextValid(ctx))return;if(errors.length&&imported===0&&skipped===0){$('#localFolderProgress').value=Math.min(99,$('#localFolderProgress').value);$('#localFolderPercent').textContent=$('#localFolderProgress').value+'%';$('#localFolderProgressStage').textContent='Obrada nije potvrđena; proverite Biblioteku.';}else progress(0,errors.length?'Uvoz završen uz greške.':'Uvoz završen.');$('#localFolderStatus').textContent='Uvezeno: '+imported+'. Već uvezeno: '+skipped+'. '+errors.join(' · ');await refreshWorkFiles();
 }));
 window.localFolderAccess={
  async get(projectId){const ctx={epoch,user:currentUser?.id,project:projectId};if(!ctx.user||!workspace.projects.some(p=>p.id===projectId))throw new Error('Izaberite aktivan projekat.');const linked=await storage(ctx);if(!contextValid(ctx))throw new Error('Sesija je promenjena.');return {...linked,ctx};},
  async connect(projectId){if(!window.showDirectoryPicker)throw new Error('Direktan pristup folderu nije podržan u ovom pregledaču.');if(!currentUser||!workspace.projects.some(p=>p.id===projectId))throw new Error('Izaberite projekat.');const ctx={epoch,user:currentUser.id,project:projectId};const handle=await window.showDirectoryPicker({mode:'read'});if(!contextValid(ctx))throw new Error('Sesija je promenjena.');const previous=await storage(ctx);if(!contextValid(ctx))throw new Error('Sesija je promenjena.');const same=previous?.handle&&await previous.handle.isSameEntry(handle);const linked={handle,name:handle.name,uploads:same?previous.uploads||{}:{}};await storage(ctx,linked);return {...linked,ctx};},
  uploadPdf:uploadWithProgress,
  async rememberUpload(linked,fingerprint,fileId){if(!contextValid(linked.ctx))throw new Error('Sesija je promenjena.');const saved=await storage(linked.ctx);if(!saved?.handle||!await saved.handle.isSameEntry(linked.handle))throw new Error('Povezani folder je promenjen. Pošaljite novo pitanje.');saved.uploads={...saved.uploads,[fingerprint]:fileId};await storage(linked.ctx,saved);},
  valid:contextValid,permission
 };
 const outputWrites=new Set();
 window.saveWorkToLocalFolder=async(fileId,projectId)=>{
  const ctx={epoch,user:currentUser?.id,project:projectId};if(!ctx.user||!ctx.project){notice('Work razgovor mora pripadati projektu sa povezanim folderom.');return;}
  const writeKey=key(ctx)+':'+fileId;if(outputWrites.has(writeKey))return;outputWrites.add(writeKey);
  try{
   const linked=await storage(ctx);if(!contextValid(ctx))return;if(!linked?.handle)throw new Error('Povežite lokalni folder u podešavanjima projekta.');
   await permission(linked.handle,'readwrite');if(!contextValid(ctx))return;
   const response=await fetch('/api/files/'+fileId);if(!response.ok)throw new Error('Work dokument nije dostupan.');const blob=await response.blob();if(!contextValid(ctx))return;
   const ext=({'application/pdf':'pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx'})[blob.type];if(!ext)throw new Error('Nepodržan Work dokument.');
   const dir=await linked.handle.getDirectoryHandle('AL-AI-rezultati',{create:true});if(!contextValid(ctx))return;
   const name='AL-AI-'+crypto.randomUUID()+'.'+ext;const output=await dir.getFileHandle(name,{create:true});const stream=await output.createWritable();try{if(!contextValid(ctx)){await stream.abort();return;}await stream.write(blob);await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}
   if(contextValid(ctx))notice('Sačuvano u '+linked.name+'/AL-AI-rezultati/'+name);
  }catch(e){if(contextValid(ctx)&&e.name!=='AbortError')notice(e.message);}finally{outputWrites.delete(writeKey);}
 };
 importButton.addEventListener('click',()=>{if(importBusy)return;importVersion++;importText='';$('#externalImportFile').value='';$('#externalImportPreview').replaceChildren();$('#externalImportStatus').textContent='';$('#externalImportSave').disabled=true;fillProjectSelect($('#externalImportProject'),'Bez projekta');$('#externalImportProject').value=activeProject||'';importDialog.showModal();});
 $('#externalImportClose').addEventListener('click',()=>importDialog.close());
 $('#externalImportFile').addEventListener('change',async event=>{
  const file=event.target.files[0],version=epoch,load=++importVersion;importText='';$('#externalImportSave').disabled=true;$('#externalImportPreview').replaceChildren();if(!file)return;
  try{if(file.size>3000000)throw new Error('JSON izvoz može imati najviše 3 MB.');const text=await file.text();if(version!==epoch||load!==importVersion)return;
   const result=await api('/api/conversations/import-external','POST',{text,preview:true});if(version!==epoch||load!==importVersion)return;importText=text;
   for(const item of result.items){const p=document.createElement('p');p.textContent=item.title+' · '+item.count+' poruka · '+item.source;$('#externalImportPreview').append(p);}
   $('#externalImportStatus').textContent=result.warnings.join(' ');$('#externalImportSave').disabled=false;
  }catch(e){if(version===epoch&&load===importVersion)$('#externalImportStatus').textContent=e.message;}
 });
 $('#externalImportSave').addEventListener('click',async()=>{
  if(!importText||importBusy)return;const version=epoch,text=importText,projectId=$('#externalImportProject').value||null;importBusy=true;$('#externalImportSave').disabled=true;$('#externalImportFile').disabled=true;
  try{const result=await api('/api/conversations/import-external','POST',{text,projectId});if(version!==epoch)return;importText='';$('#externalImportStatus').textContent='Uvezeno: '+result.imported+'. Već uvezeno: '+result.skipped+'. '+result.warnings.join(' ');await refreshList();}
  catch(e){if(version===epoch){$('#externalImportStatus').textContent=e.message;$('#externalImportSave').disabled=false;}}
  finally{importBusy=false;$('#externalImportFile').disabled=false;}
 });
 // Remove references and close file views as soon as an account changes.
 let visibleUser=currentUser?.id;
 const accountObserver=new MutationObserver(()=>{if(visibleUser!==currentUser?.id){visibleUser=currentUser?.id;folderVersion++;importVersion++;folderContext=null;record=null;entries=[];importText='';$('#localFolderProgressBox').hidden=true;$('#externalImportPreview').replaceChildren();$('#externalImportFile').value='';$('#externalImportSave').disabled=true;drawEntries();folderDialog.close();importDialog.close();}});
 accountObserver.observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden']});
})();
