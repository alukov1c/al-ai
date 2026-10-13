const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./fixture');
const {extractAttachment}=require('../attachments');
const {previewFile}=require('../file-preview');
const {chromium}=require('playwright');

// A valid PDF with a small readable page and a large unreferenced stream.
function sizedPdf(total){
 const text='BT /F1 12 Tf 30 100 Td (PDF limit test) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${text.length} >>\nstream\n${text}\nendstream`];
 const prefix='%PDF-1.4\n'+objects.map((s,i)=>`${i+1} 0 obj\n${s}\nendobj\n`).join('');
 const offsets=[0];let pos=9;for(let i=0;i<objects.length;i++){offsets.push(pos);pos+=Buffer.byteLength(`${i+1} 0 obj\n${objects[i]}\nendobj\n`);}offsets.push(Buffer.byteLength(prefix));
 let padding=total-1000,head,tail;
 for(let i=0;i<10;i++){head=prefix+`6 0 obj\n<< /Length ${padding} >>\nstream\n`;const end='\nendstream\nendobj\n';const xref=Buffer.byteLength(head)+padding+Buffer.byteLength(end);tail=end+'xref\n0 7\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;const next=total-Buffer.byteLength(head)-Buffer.byteLength(tail);if(next===padding)break;padding=next;}
 const result=Buffer.concat([Buffer.from(head),Buffer.alloc(padding,32),Buffer.from(tail)]);assert.equal(result.length,total);return result;
}
test('30 MB PDF imports, previews, works and passes all three browser upload gates',async t=>{
 const pdf=sizedPdf(30000000),content=pdf.toString('base64');
 await assert.rejects(extractAttachment({name:'too-big.PDF',content:sizedPdf(30000001).toString('base64')}),/30 MB/);
 await assert.rejects(extractAttachment({name:'too-big.txt',content:Buffer.alloc(3000001,97).toString('base64')}),/3 MB/);
 const app=await fixture();let browser;t.after(async()=>{await browser?.close();await app.close();});const client=app.client();await client.login('admin','Admin-password-test-123');
 const projectId=(await client.request('/api/projects','POST',{name:'PDF 30 MB'})).data.id;
 const result=await client.request('/api/attachments/extract','POST',{name:'maximum.PDF',content,projectId});assert.equal(result.status,200,JSON.stringify(result.data));assert.match(result.data.text,/PDF limit test/);
 const saved=(await app.pool.query('SELECT octet_length(content) AS bytes,project_id FROM user_files WHERE id=$1',[result.data.fileId])).rows[0];assert.equal(saved.bytes,30000000);assert.equal(saved.project_id,projectId);
 const preview=await previewFile({name:'maximum.PDF',content:pdf});assert.equal(preview.kind,'pdf');assert.equal(preview.pages,1);assert.match(preview.image,/^data:image\/png;base64,/);
 // Use a smaller PDF above the former limit for Work; avoid repeated 30 MB bytea decoding in PGlite.
 const workSource=await client.request('/api/attachments/extract','POST',{name:'work.PDF',content:sizedPdf(3100000).toString('base64'),projectId});assert.equal(workSource.status,200);
 const conversationId=(await client.request('/api/conversations','POST',{projectId})).data.conversation.id;const work=await client.request('/api/work','POST',{conversationId,requestId:randomUUID(),model:'deepseek-flash',format:'docx',prompt:'Read PDF',fileIds:[workSource.data.fileId]});assert.equal(work.status,200,JSON.stringify(work.data));assert.ok(app.calls.at(-1).messages.some(m=>m.content?.includes('PDF limit test')));
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage();await page.route('https://accounts.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await page.goto(app.origin);await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('Admin-password-test-123');await page.locator('#loginSubmit').click();await page.waitForFunction(()=>currentUser&&workspace.projects.length===1);
 let uploads=0;await page.route('**/api/pdf-imports',async route=>{uploads++;await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'complete',result:{name:'browser.PDF',text:'PDF limit test',fileId:result.data.fileId}})});});
 const file={name:'browser.PDF',mimeType:'application/pdf',buffer:sizedPdf(3100000)};
 await page.locator('#attachmentInput').setInputFiles(file);await page.locator('#attachmentPreview').waitFor({state:'visible'});assert.equal(uploads,1);
 await page.evaluate(()=>{settingsSection('library');document.querySelector('#settingsDialog').showModal();});await page.locator('#libraryInput').setInputFiles(file);await page.waitForFunction(()=>document.querySelector('#libraryStatus').textContent.includes('Uvezeno: 1'));assert.equal(uploads,2);await page.locator('#settingsDialog').evaluate(d=>d.close());
  await page.evaluate(()=>openProject(workspace.projects[0]));await page.locator('#projectLocalFolder').click();await page.waitForFunction(()=>!document.querySelector('#localFolderConnect').disabled);await page.evaluate(()=>{const file=new File([new Uint8Array(3100000)],'folder.PDF');Object.defineProperty(file,'webkitRelativePath',{value:'folder/folder.PDF'});const dt=new DataTransfer();dt.items.add(file);const input=document.querySelector('#localFolderFallback');input.files=dt.files;input.dispatchEvent(new Event('change'));});await page.waitForFunction(()=>document.querySelectorAll('#localFolderFiles input').length===1);assert.equal(await page.locator('#localFolderFiles input').isEnabled(),true);await page.locator('#localFolderFiles input').check();await page.locator('#localFolderUpload').click();await page.waitForFunction(()=>document.querySelector('#localFolderStatus').textContent.includes('Uvezeno: 1'));assert.equal(uploads,3);
 assert.equal(await page.evaluate(()=>attachmentSizeLimit('file.PDF')),30000000);assert.equal(await page.evaluate(()=>attachmentSizeLimit('file.docx')),3000000);
});
