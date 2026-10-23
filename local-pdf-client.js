/* Local-only PDF lookup: document bytes and extracted text stay in the browser. */
(() => {
 const dialog=document.createElement('dialog');dialog.className='account-dialog';dialog.id='projectPdfDialog';
 dialog.innerHTML='<div class="dialog-heading"><h2>PDF za ovo pitanje</h2><button type="button" id="projectPdfClose" aria-label="Zatvori">×</button></div><p>Izaberite PDF iz povezanog foldera. Pretraga i prikaz rade lokalno, bez slanja dokumenta serveru.</p><label>Dokument<select id="projectPdfSelect"></select></label><button type="button" id="projectPdfRead">Pročitaj izabrani PDF</button>';
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
  const handle=await parent.getFileHandle(parts.at(-1)),file=await handle.getFile();
  if(!file.size||file.size>100000000)throw new Error('Lokalni pregled podržava PDF do 100 MB.');
  const valid=()=>version===epoch&&user===currentUser?.id;
  const refs=[...prompt.matchAll(/(?<![\d.,])\d+\s*[.,]\s*\d+(?!\d)/g)].map(m=>m[0].replace(/\s/g,'').replace(',','.'));
  if(!refs.length){await window.localPdfViewer.open(handle,{user,project:snapshot.projectId},valid);return {localOnly:true};}
  onStage?.('Lokalna pretraga PDF-a: '+path);
  const pdfjs=await import('/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,enableXfa:false,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});
  const hits=[];let readable=0;
  try{
   const doc=await task.promise;
   for(let n=1;n<=doc.numPages;n++){
    if(!valid())throw new Error('Sesija je promenjena.');
    onStage?.('Lokalna pretraga: '+n+' / '+doc.numPages);
    const page=await doc.getPage(n),items=(await page.getTextContent()).items;
    const text=items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('');page.cleanup();if(text.trim())readable++;
    const found=refs.filter(ref=>{const [a,b]=ref.split('.');return new RegExp('(^|[^0-9])'+a+'\\s*[.,]\\s*'+b+'(?![0-9])').test(text);});
    if(found.length)hits.push({page:n,text,refs:found});
   }
  }finally{await task.destroy();}
  if(!valid())throw new Error('Sesija je promenjena.');
  const result=document.createElement('dialog');result.className='file-preview-dialog';result.setAttribute('aria-label','Rezultati lokalne pretrage');
  const heading=document.createElement('h2');heading.textContent='Lokalna pretraga: '+file.name;
  const close=document.createElement('button');close.type='button';close.textContent='Zatvori';close.onclick=()=>result.close();
  const content=document.createElement('div');content.className='file-preview-content';
  const summary=document.createElement('p'),missing=refs.filter(ref=>!hits.some(h=>h.refs.includes(ref)));
  summary.textContent=!readable?'PDF nema čitljiv tekst. Za skenirane stranice potreban je OCR.':hits.length?'Pronađene stranice: '+hits.length+'. Proverite tekst u originalu; formule i redosled teksta mogu biti nepotpuni.':'Traženi broj zadatka nije pronađen.';
  if(missing.length)summary.textContent+=' Nije pronađeno: '+missing.join(', ')+'.';content.append(summary);
  for(const hit of hits){const title=document.createElement('h3');title.textContent='PDF stranica '+hit.page+' · '+hit.refs.join(', ');const text=document.createElement('pre');text.style.whiteSpace='pre-wrap';text.textContent=hit.text;content.append(title,text);}
  const original=document.createElement('button');original.type='button';original.textContent='Prikaži originalni PDF';original.onclick=async()=>{result.close();try{await window.localPdfViewer.open(handle,{user,project:snapshot.projectId},valid);}catch(e){onStage?.(e.message);}};
  result.append(heading,close,content,original);document.body.append(result);
  const cleanup=new MutationObserver(()=>{if(!valid())result.close();});cleanup.observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden']});
  result.addEventListener('close',()=>{cleanup.disconnect();result.remove();},{once:true});result.showModal();
  return {localOnly:true};
 };
})();
