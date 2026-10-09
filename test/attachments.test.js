const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateDocument}=require('../document-export');
const {extractAttachment}=require('../attachments');
const {fixture}=require('./fixture');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const content='# Provera dokumenata\nČitanje: č ć š ž đ. Ћирилица.\n\n| Naziv | Broj |\n| --- | ---: |\n| Senzor | 12 |\n| Čvor | 24 |\n\nZaključak je sačuvan.';
test('Čitanje i izvoz četiri formata sa srpskim tekstom',async()=>{
 fs.mkdirSync('test-artifacts',{recursive:true});
 for(const format of ['pdf','docx','pptx','xlsx']){
   const buffer=await generateDocument({format,title:'Provera izvoza',content});
   assert(buffer.length>100);
   fs.writeFileSync('test-artifacts/document.'+format,buffer);
   const result=await extractAttachment({name:'provera.'+format,content:buffer.toString('base64')});
   assert.match(result.text,/Senzor/);assert.match(result.text,/Čvor/);assert.match(result.text,/Ћирилица/);
 }
 const txt=await extractAttachment({name:'test.txt',content:Buffer.from('Tekst dokumenta').toString('base64')});assert.equal(txt.text,'Tekst dokumenta');
 await assert.rejects(extractAttachment({name:'test.exe',content:'YWJj'}),/Podržani/);
 await assert.rejects(extractAttachment({name:'test.pdf',content:'YWJj'}),/ispravan PDF/);
 await assert.rejects(extractAttachment({name:'test.txt',content:Buffer.from('a'.repeat(40001)).toString('base64')}),/40.000/);
});
test('Prilozi i izvoz zahtevaju prijavu, CSRF i vlasništvo',async(t)=>{
 const app=await fixture();t.after(()=>app.close());
 const admin=app.client(),guest=app.client();
 assert.equal((await guest.request('/api/attachments/extract','POST',{})).status,401);
 await admin.login('admin','Admin-password-test-123');
 const file={name:'tekst.txt',content:Buffer.from('Sadržaj privatnog dokumenta').toString('base64')};
 assert.equal((await admin.request('/api/attachments/extract','POST',file,{'X-CSRF-Token':'wrong'})).status,403);
 assert.equal((await admin.request('/api/attachments/extract','POST',file)).status,200);
 const created=await admin.request('/api/conversations','POST',{model:'deepseek-flash'});
 const id=created.data.conversation.id;
 await admin.request('/api/chat','POST',{conversationId:id,requestId:randomUUID(),model:'deepseek-flash',prompt:'Privatni dokument'});
 const conversation=await admin.request('/api/conversations/'+id);
 const messageId=conversation.data.conversation.messages.find(m=>m.role==='assistant').id;
 assert.equal((await admin.request('/api/documents/export','POST',{conversationId:id,messageId,format:'docx'})).status,200);
 assert.equal((await admin.request('/api/documents/export','POST',{conversationId:id,messageId,format:'exe'})).status,400);
 const user=await admin.request('/api/admin/users','POST',{username:'reader',displayName:'Reader',password:'First-password-123'});
 const other=app.client();await other.login('reader','First-password-123');
 await other.request('/api/password','POST',{currentPassword:'First-password-123',password:'Changed-password-456'});await other.login('reader','Changed-password-456');
 assert.deepEqual((await other.request('/api/stats')).data,{conversations:0,userMessages:0,answers:0});
 assert.deepEqual((await admin.request('/api/stats')).data,{conversations:1,userMessages:1,answers:1});
 assert.equal((await other.request('/api/documents/export','POST',{conversationId:id,messageId,format:'pdf'})).status,404);
});

test('Podešavanja menjaju format izlaznih dokumenata',async()=>{
 const JSZip=require('jszip');
 const data={title:'Podešavanja',content:'Tekst za proveru.',settings:{page:'LETTER',font:14,slides:'standard',wrap:false}};
 const pdf=await generateDocument({...data,format:'pdf'});assert.match(pdf.toString('latin1'),/MediaBox \[0 0 612 792\]/);
 const docx=await JSZip.loadAsync(await generateDocument({...data,format:'docx'}));assert.match(await docx.file('word/document.xml').async('string'),/w:w="12240"/);
 const pptx=await JSZip.loadAsync(await generateDocument({...data,format:'pptx'}));assert.match(await pptx.file('ppt/presentation.xml').async('string'),/cx="9144000"/);
 const xlsx=new (require('exceljs').Workbook)();await xlsx.xlsx.load(await generateDocument({...data,format:'xlsx'}));assert.notEqual(xlsx.worksheets[0].getCell('A2').alignment.wrapText,true);
});
