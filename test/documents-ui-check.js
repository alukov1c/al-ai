const {chromium}=require('playwright');
const {fixture}=require('./fixture');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const app=await fixture();let browser;
 try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://accounts.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.goto(app.origin);await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('Admin-password-test-123');await page.locator('#loginSubmit').click();await page.locator('.app-shell').waitFor({state:'visible'});
 await page.locator('#attachmentInput').setInputFiles({name:'proba.txt',mimeType:'text/plain',buffer:Buffer.from('Privatni dokument za proveru: temperatura je 24 stepena.')});
 await page.locator('#attachmentPreview').waitFor({state:'visible'});await page.locator('#promptInput').fill('Sažmi dokument');await page.locator('#sendButton').click();
 await page.locator('.document-actions button').first().waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#sendButton').disabled);
 assert(app.calls.at(-1).messages.some(m=>m.content.includes('temperatura je 24')));
 assert(await page.locator('#attachmentPreview').isHidden());
 for(const format of ['PDF','DOCX','PPTX','XLSX']){const download=page.waitForEvent('download');await page.getByRole('button',{name:format,exact:true}).click();const file=await download;assert.equal(await file.failure(),null);await page.waitForFunction(()=>!document.querySelector('#sendButton').disabled);}
 await page.locator('#settingsButton').click();await page.locator('[data-settings="analytics"]').click();await page.waitForFunction(()=>document.querySelector('#statConversations').textContent==='1');assert.equal(await page.locator('#statAnswers').textContent(),'1');
 await page.locator('[data-settings="documents"]').click();await page.locator('#documentFormat').selectOption('docx');await page.locator('#documentPage').selectOption('LETTER');await page.locator('#documentSlides').selectOption('standard');await page.locator('#documentSettingsForm button[type=submit]').click();
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);assert(await page.locator('#settingsDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'dialog overflow '+width);await page.screenshot({path:'test-artifacts/settings-'+width+'.png',animations:'disabled'});}
 await page.locator('#settingsClose').click();await page.screenshot({path:'test-artifacts/attachments-chat-390.png',animations:'disabled'});
 await page.locator('#settingsButton').click();await page.locator('#settingsPassword').click();await page.locator('#passwordDialog').waitFor({state:'visible'});await page.locator('#passwordClose').click();
 assert.deepEqual(errors,[]);console.log('PASS: attachment to AI, four downloads, statistics, preferences, password action and desktop/tablet/mobile layout.');
 }finally{await browser?.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
