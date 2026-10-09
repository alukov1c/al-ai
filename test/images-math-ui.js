const {chromium}=require('playwright');const sharp=require('sharp');const assert=require('node:assert/strict');const {fixture}=require('./fixture');
(async()=>{
 const app=await fixture();let browser;
 const answer=String.raw`## Metod najmanjih kvadrata
$$\Delta = N\sum x^2 - (\sum x)^2$$
$$a = \frac{\sum x^2 \sum y - \sum x \sum xy}{\Delta}, \qquad b = \frac{N\sum xy - \sum x\sum y}{\Delta}$$
Težine: $w_i = 1/\sigma_i^2$.
\[
\sigma_a = \sqrt{S_{xx}/\Delta}
\]
U tekstu: \( E=mc^2 \).
`+'\n```\n$not_math$\n```';
 app.setUpstream(async()=>({ok:true,json:async()=>({choices:[{message:{content:answer},finish_reason:'stop'}]})}));
 try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://accounts.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.goto(app.origin);await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('Admin-password-test-123');await page.locator('#loginSubmit').click();await page.locator('.app-shell').waitFor({state:'visible'});
 const png=await sharp({create:{width:240,height:160,channels:3,background:'#dbeafe'}}).composite([{input:Buffer.from('<svg width="240" height="160"><text x="30" y="85" font-size="26" fill="#1e40af">E = mc²</text></svg>')}]).png().toBuffer();
 await page.locator('#attachmentInput').setInputFiles({name:'formula.png',mimeType:'image/png',buffer:png});await page.locator('#attachmentImage').waitFor({state:'visible'});await page.locator('#sendButton').click();await page.locator('.katex').first().waitFor();await page.waitForFunction(()=>!document.querySelector('#sendButton').disabled);
 assert.equal(await page.locator('.katex').count(),5);assert.equal(await page.locator('pre .katex').count(),0);assert.equal(await page.locator('.message-image').count(),1);
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);await page.screenshot({path:'test-artifacts/math-'+width+'.png',animations:'disabled'});}
 await page.reload();await page.locator('.message-image').waitFor();assert.equal(await page.locator('.katex').count(),5);
 await page.locator('#settingsButton').click();await page.locator('[data-settings="images"]').click();await page.locator('#imageGallery .file-card').waitFor();await page.screenshot({path:'test-artifacts/image-gallery-390.png',animations:'disabled'});
 await page.locator('#imageGallery').getByRole('button',{name:'Prikaži',exact:true}).click();await page.locator('#filePreviewImage').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#filePreviewImage').naturalWidth>0);await page.screenshot({path:'test-artifacts/preview-image-390.png'});await page.locator('#filePreviewClose').click();
 const download=page.waitForEvent('download');await page.locator('#imageGallery a').click();assert.equal(await (await download).failure(),null);
 page.on('dialog',d=>d.accept());await page.locator('#imageGallery').getByRole('button',{name:'Obriši',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#imagesStatus').textContent.includes('Nema'));await page.locator('.message-image').waitFor({state:'detached'});await page.locator('#settingsClose').click();
 await page.locator('#attachmentInput').setInputFiles({name:'document.txt',mimeType:'text/plain',buffer:Buffer.from('Tekst dokumenta')});await page.locator('#attachmentPreview').waitFor({state:'visible'});
 const exported=page.waitForEvent('download');await page.getByRole('button',{name:'DOCX',exact:true}).click();await exported;await page.waitForFunction(()=>!document.querySelector('#sendButton').disabled);
 await page.locator('#settingsButton').click();await page.locator('[data-settings="files"]').click();await page.locator('#documentLibrary .file-card').first().waitFor();assert.equal(await page.locator('#documentLibrary .file-card').count(),2);
 await page.locator('#filesFilter').selectOption('export');await page.waitForFunction(()=>document.querySelectorAll('#documentLibrary .file-card').length===1);await page.screenshot({path:'test-artifacts/document-library-390.png',animations:'disabled'});
 await page.locator('#documentLibrary').getByRole('button',{name:'Prikaži',exact:true}).click();await page.locator('#filePreviewText').waitFor({state:'visible'});assert((await page.locator('#filePreviewText').textContent()).includes('Metod'));await page.locator('#filePreviewClose').click();
 const savedExport=page.waitForEvent('download');await page.locator('#documentLibrary a').click();assert.equal(await (await savedExport).failure(),null);
 await page.locator('#documentLibrary').getByRole('button',{name:'Obriši',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#filesStatus').textContent.includes('Nema'));
 await page.locator('#settingsClose').click();const pdfDownload=page.waitForEvent('download');await page.getByRole('button',{name:'PDF',exact:true}).click();await pdfDownload;await page.waitForFunction(()=>!document.querySelector('#sendButton').disabled);
 await page.locator('#settingsButton').click();await page.locator('[data-settings="files"]').click();await page.locator('#documentLibrary').getByRole('button',{name:'Prikaži',exact:true}).click();await page.locator('#filePreviewImage').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#filePreviewImage').naturalWidth>0);assert((await page.locator('#filePreviewPage').textContent()).includes('1 /'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-artifacts/preview-pdf-390.png'});await page.locator('#filePreviewClose').click();
 assert.deepEqual(errors,[]);console.log('PASS: image preview/send/reload/gallery/download/delete; five LaTeX formulas, code exclusion, widths 1440/768/390.');
 }finally{await browser?.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
