/* Read only the PDF selected for a content question; reuse the indexed copy by hash. */
(() => {
 const dialog=document.createElement('dialog');dialog.className='account-dialog';dialog.id='projectPdfDialog';
 dialog.innerHTML='<div class="dialog-heading"><h2>PDF za ovo pitanje</h2><button type="button" id="projectPdfClose" aria-label="Zatvori">×</button></div><p>Izaberite PDF iz povezanog foldera. Za čitanje će se pripremiti kopija u Biblioteci projekta.</p><label>Dokument<select id="projectPdfSelect"></select></label><button type="button" id="projectPdfRead">Pročitaj izabrani PDF</button>';
 document.body.append(dialog);let choosing=null;
 $('#projectPdfClose').addEventListener('click',()=>dialog.close());
 $('#projectPdfRead').addEventListener('click',()=>dialog.close('read'));
 dialog.addEventListener('close',()=>{if(choosing){const done=choosing;choosing=null;done(dialog.returnValue==='read'?$('#projectPdfSelect').value:null);}});
 new MutationObserver(()=>{if(choosing&&choosing.user!==currentUser?.id)dialog.close();}).observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden']});
 const fold=s=>s.normalize('NFKC').toLowerCase();
 window.prepareProjectPdfForQuestion=async(prompt,snapshot,onStage)=>{
  if(!snapshot||!['ready','partial'].includes(snapshot.status))return null;
  const pdfs=snapshot.entries.filter(e=>e.kind==='file'&&/\.pdf$/i.test(e.path));if(!pdfs.length)return null;
  const names=pdfs.filter(e=>fold(prompt).includes(fold(e.path))||fold(prompt).includes(fold(e.path.split('/').at(-1))));
  const asksContent=/(pdf|dokument|knjig|zadat|poglav|stranic|odlom|tekst|citir|pročitaj|procitaj|sažm|sazm|rezimir|analiz|exercise|chapter|summari|документ|књиг|задат|поглав|страниц|одлом|текст|прочитај|сажм|анализ)/i.test(prompt);
  const listsFiles=/(spisak|izlist|naziv|veličin|velicin|koliko.*(pdf|dokument)|koji.*(pdf|dokumenti).*folder|da li.*(ima|postoji|postoje))/i.test(prompt)&&!/(zadat|poglav|stranic|odlom|tekst|citir|pročitaj|procitaj|sažm|sazm|analiz)/i.test(prompt);
  const namesDocument=/(pdf|dokument|knjig|документ|књиг)/i.test(prompt)||names.length>0;
  const asksExisting=/(iz|na osnovu|u folderu|povezan).*(pdf|dokument|knjig)|(pdf|dokument|knjig).*(folder|projekt)/i.test(prompt);
  const createsOutput=/(napiši|napisi|kreiraj|napravi|generiši|generisi|izradi|create|generate).{0,60}(pdf|dokument|knjig)|(kao|formatu|format|u vidu)\s+(pdf|dokument)/i.test(prompt);
  if(listsFiles||!namesDocument||(!asksContent&&!names.length)||(createsOutput&&!asksExisting&&!names.length))return null;
  const version=epoch,user=currentUser?.id;let path=names.length===1?names[0].path:pdfs.length===1?pdfs[0].path:null;
  if(!path){$('#projectPdfSelect').replaceChildren();for(const entry of pdfs){const option=document.createElement('option');option.value=entry.path;option.textContent=entry.path;$('#projectPdfSelect').append(option);}dialog.returnValue='';path=await new Promise(resolve=>{choosing=resolve;choosing.user=user;dialog.showModal();});if(!path)throw new Error('Čitanje PDF-a je otkazano. Pitanje nije poslato.');}
  if(version!==epoch||user!==currentUser?.id)throw new Error('Sesija je promenjena.');
  const linked=await window.localFolderAccess.get(snapshot.projectId);if(!linked.handle||await linked.handle.queryPermission({mode:'read'})!=='granted')throw new Error('Omogućite čitanje povezanog foldera u AL AI eksploreru.');
  const parts=path.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||/[\\\x00-\x1f]/.test(p)))throw new Error('Neispravna putanja PDF-a.');
  let parent=linked.handle;for(const part of parts.slice(0,-1))parent=await parent.getDirectoryHandle(part);
  const file=await(await parent.getFileHandle(parts.at(-1))).getFile();validateAttachmentSize(file);if(!file.size)throw new Error('PDF je prazan.');
  onStage?.('Čitanje PDF-a: '+path);const bytes=await file.arrayBuffer();if(version!==epoch)throw new Error('Sesija je promenjena.');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join(''),fingerprint=path+':'+digest;
  if(version!==epoch||user!==currentUser?.id)throw new Error('Sesija je promenjena.');
  const files=(await api('/api/files')).files,cached=files.find(f=>f.id===linked.uploads?.[fingerprint]&&f.project_id===snapshot.projectId);
  let result;if(cached){onStage?.('Provera pripremljenog PDF-a: '+path);result=cached.book_pages?{fileId:cached.id}:await window.prepareExistingPdf(cached.id,onStage);}
  else{
   const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('PDF nije pročitan.'));reader.readAsDataURL(new Blob([bytes]));});
   if(version!==epoch)throw new Error('Sesija je promenjena.');
   const payload={name:file.name,content,projectId:snapshot.projectId};
   result=await window.importPdfFile(payload,{upload:()=>window.localFolderAccess.uploadPdf(linked.ctx,payload,f=>onStage?.('Slanje PDF-a: '+Math.floor(f*100)+'% · '+path)),onStage:stage=>onStage?.(path+' · '+stage)});
   await window.localFolderAccess.rememberUpload(linked,fingerprint,result.fileId);
  }
  if(version!==epoch)throw new Error('Sesija je promenjena.');
  const book=await api('/api/books/'+result.fileId);if(!book.book.readablePages)throw new Error('PDF nema čitljiv tekst. Za skenirane stranice potreban je OCR.');
  onStage?.('Pretraga PDF-a: '+path);return {fileId:result.fileId,path};
 };
})();
