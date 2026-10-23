/* Local-only PDF lookup: document bytes and extracted text stay in the browser. */
(() => {
 const dialog=document.createElement('dialog');dialog.className='account-dialog';dialog.id='projectPdfDialog';
 dialog.innerHTML='<div class="dialog-heading"><h2>PDF za ovo pitanje</h2><button type="button" id="projectPdfClose" aria-label="Zatvori">×</button></div><p>Izaberite PDF iz povezanog foldera. Pretraga i prikaz rade lokalno, bez slanja dokumenta serveru.</p><label>Dokument<select id="projectPdfSelect"></select></label><button type="button" id="projectPdfRead">Pročitaj izabrani PDF</button>';
 document.body.append(dialog);let choosing=null;
 $('#projectPdfClose').addEventListener('click',()=>dialog.close());
 $('#projectPdfRead').addEventListener('click',()=>dialog.close('read'));
 dialog.addEventListener('close',()=>{if(choosing){const done=choosing;choosing=null;done(dialog.returnValue==='read'?$('#projectPdfSelect').value:null);}});
 new MutationObserver(()=>{if(choosing&&choosing.user!==currentUser?.id)dialog.close();}).observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden']});
 function repairText(text){
  return text.normalize('NFC').replace(/([dD])[\u0335\u0336]/g,(_,d)=>d==='D'?'Đ':'đ').replace(/([´ˊ])\s*([cC])/g,(_,a,c)=>c==='C'?'Ć':'ć').replace(/([ˇ̌])\s*([cCsSzZ])/g,(_,a,c)=>({'c':'č','C':'Č','s':'š','S':'Š','z':'ž','Z':'Ž'}[c])).replace(/([cC])\s*[´ˊ]/g,(_,c)=>c==='C'?'Ć':'ć').replace(/([cCsSzZ])\s*ˇ/g,(_,c)=>({'c':'č','C':'Č','s':'š','S':'Š','z':'ž','Z':'Ž'}[c]));
 }
 function renderExtract(target,source){
  target.replaceChildren();
  const lines=source.split('\n');let table=null;
  for(let line of lines){
   if(!/[$\\]/.test(line)&&/[=<>≤≥]/.test(line)&&/^[\s\dA-Za-zα-ωΑ-Ω=<>≤≥+*/^_().,{}−-]+$/u.test(line)&&line.trim().split(/\s+/).every(w=>!/[A-Za-z]{4,}/.test(w)))line='\\('+line+'\\)';
   const cells=line.includes(' | ')?line.split(/\s*\|\s*/).filter(Boolean):line.trim().split(/\t+| {3,}/);
   if(cells.length>1){if(!table){table=document.createElement('table');target.append(table);}const row=table.insertRow();for(const cell of cells)row.insertCell().textContent=cell;continue;}table=null;
   const paragraph=document.createElement('p');
   // Preserve explicit LaTeX; typeset isolated numbers without guessing missing formulas.
   const parts=line.split(/(\$\$[\s\S]*?\$\$|\$[^$]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g);
   const formatted=parts.map((part,i)=>i%2?part:part.replace(/(?<![\p{L}\d])[-+]?\d+(?:[.,]\d+)?(?![\p{L}\d])/gu,'\\($&\\)')).join('');
   const tokens=formatted.split(/(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|<u>[^<]+<\/u>)/g);
   for(const token of tokens){let tag=null,value=token;if(token.startsWith('**')&&token.endsWith('**')){tag='strong';value=token.slice(2,-2);}else if(token.startsWith('*')&&token.endsWith('*')){tag='em';value=token.slice(1,-1);}else if(token.startsWith('~~')&&token.endsWith('~~')){tag='s';value=token.slice(2,-2);}else if(token.startsWith('<u>')&&token.endsWith('</u>')){tag='u';value=token.slice(3,-4);}const node=tag?document.createElement(tag):document.createTextNode(value);if(tag)node.textContent=value;paragraph.append(node);}target.append(paragraph);
  }
  window.renderMathInElement?.(target,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],throwOnError:false,trust:false,strict:'ignore',maxExpand:200,maxSize:20});
 }
 const fold=s=>s.normalize('NFKC').toLowerCase();
 window.prepareProjectPdfForQuestion=async(prompt,snapshot,onStage)=>{
  if(window.localPdfPrompt&&prompt.includes(window.localPdfPrompt.split('\n')[0]))return null;
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
    const text=repairText(items.map(i=>i.str+(i.hasEOL?'\n':' ')).join(''));page.cleanup();if(text.trim())readable++;
    const found=refs.filter(ref=>{const [a,b]=ref.split('.');return new RegExp('(^|[^0-9])'+a+'\\s*[.,]\\s*'+b+'(?![0-9])').test(text);});
    if(found.length)hits.push({page:n,text,refs:found});
   }
  }finally{await task.destroy();}
  if(!valid())throw new Error('Sesija je promenjena.');
  const result=document.createElement('dialog');result.className='file-preview-dialog local-extract-dialog';result.setAttribute('aria-label','Rezultati lokalne pretrage');
  const heading=document.createElement('h2');heading.textContent='Lokalna pretraga: '+file.name;
  const top=document.createElement('div');top.className='local-extract-menu';top.setAttribute('role','toolbar');top.setAttribute('aria-label','Uređivanje i prozor');
  const content=document.createElement('div');content.className='file-preview-content local-extract-content';
  const summary=document.createElement('p'),missing=refs.filter(ref=>!hits.some(h=>h.refs.includes(ref)));
  summary.textContent=!readable?'PDF nema čitljiv tekst. Za skenirane stranice potreban je OCR.':hits.length?'Pronađene stranice: '+hits.length+'. Proverite formule i tabele u originalu.':'Traženi broj zadatka nije pronađen.';
  if(missing.length)summary.textContent+=' Nije pronađeno: '+missing.join(', ')+'.';content.append(summary);
  const sections=hits.map(hit=>{const title=document.createElement('h3');title.textContent='PDF stranica '+hit.page+' · '+hit.refs.join(', ');const body=document.createElement('div');body.className='local-extract-text';content.append(title,body);return {hit,body,source:hit.text};});
  const bottom=document.createElement('div');bottom.className='local-extract-menu';bottom.setAttribute('role','toolbar');bottom.setAttribute('aria-label','Rad sa izdvojenim tekstom');
  function button(bar,label,icon,action){const b=document.createElement('button');b.type='button';const glyph=document.createElement('span');glyph.setAttribute('aria-hidden','true');glyph.textContent=icon;b.append(glyph,document.createTextNode(' '+label));b.onclick=action;bar.append(b);return b;}
  let editing=false,minimized=false;const formatting=[];
  function draw(){for(const item of sections)renderExtract(item.body,item.source);}
  const edit=button(top,'Izmeni tekst','✎',()=>{editing=true;for(const item of sections){item.body.textContent=item.source;item.body.contentEditable='true';item.body.setAttribute('role','textbox');item.body.setAttribute('aria-label','Izmena teksta sa PDF stranice '+item.hit.page);}formatting.forEach(b=>b.hidden=false);edit.hidden=true;save.hidden=false;transfer.disabled=true;sections[0]?.body.focus();});
  for(const [label,icon,command] of [['Bold','B','bold'],['Italik','𝑰','italic'],['Podvučeno','U̲','underline'],['Precrtano','S̶','strikeThrough']]){const b=button(top,label,icon,()=>document.execCommand(command,false));b.onmousedown=e=>e.preventDefault();b.hidden=true;formatting.push(b);}
  function serialize(node){if(node.nodeType===3)return node.textContent;if(node.nodeType!==1)return '';const inner=[...node.childNodes].map(serialize).join('');switch(node.tagName){case 'B':case 'STRONG':return '**'+inner+'**';case 'I':case 'EM':return '*'+inner+'*';case 'U':return '<u>'+inner+'</u>';case 'S':case 'STRIKE':return '~~'+inner+'~~';case 'BR':return '\n';case 'DIV':case 'P':return inner+'\n';default:return inner;}}
  const save=button(top,'Sačuvaj','✓',()=>{for(const item of sections){item.source=repairText([...item.body.childNodes].map(serialize).join('').trim());item.body.contentEditable='false';item.body.removeAttribute('role');}editing=false;formatting.forEach(b=>b.hidden=true);edit.hidden=false;save.hidden=true;transfer.disabled=false;draw();content.scrollTop=0;});save.hidden=true;edit.disabled=!sections.length;
  const dock=button(document.body,'Vrati izdvojeni tekst','▣',()=>{if(valid()){minimized=false;dock.hidden=true;result.showModal();}else dispose();});dock.className='local-extract-dock';dock.hidden=true;
  button(top,'Umanji','−',()=>{minimized=true;result.close();dock.hidden=false;});
  button(top,'Zatvori','×',()=>{minimized=false;result.close();});
  const transfer=button(bottom,'Tekst → Prompt','↗',()=>{if(editing||!valid())return;const field=$('#promptInput');const extracted=sections.map(item=>'[PDF stranica '+item.hit.page+']\n'+item.source).join('\n\n');const value='Izdvojeni tekst iz '+file.name+':\n\n'+extracted;field.value=value;window.localPdfPrompt=value;field.dispatchEvent(new Event('input',{bubbles:true}));minimized=false;result.close();field.focus();onStage?.('Tekst je prenet u prompt. Dopunite zahtev i kliknite Pošalji.');});transfer.disabled=!sections.length;
  button(bottom,'Prikaži originalni PDF','▤',async()=>{minimized=false;result.close();try{await window.localPdfViewer.open(handle,{user,project:snapshot.projectId},valid);}catch(e){onStage?.(e.message);}});
  result.append(heading,top,content,bottom);document.body.append(result);draw();
  const cleanup=new MutationObserver(()=>{if(!valid())dispose();});cleanup.observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden']});
  function dispose(){cleanup.disconnect();dock.remove();result.remove();}
  result.addEventListener('close',()=>{if(!minimized)dispose();});result.showModal();
  return {localOnly:true};
 };
})();
