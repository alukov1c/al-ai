const {chromium}=require('playwright');
const fs=require('fs');
const assert=require('node:assert/strict');
const {fixture}=require('./fixture');
(async()=>{
 const app=await fixture();let browser;
 try {
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
 browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://accounts.google.com/**',r=>r.abort());
 await page.goto(app.origin);await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('Admin-password-test-123');await page.locator('#loginSubmit').click();
 await page.locator('#settingsButton').click();await page.locator('[data-settings="memory"]').click();
 await page.locator('#personalization').fill('Odgovaraj SRB ekavicom.');await page.locator('#memoryEnabled').check();await page.locator('#memoryForm button').click();await page.getByText('Podešavanja su sačuvana.',{exact:true}).waitFor();
 await page.reload();await page.locator('#settingsButton').click();await page.locator('[data-settings="memory"]').click();
 await page.waitForFunction(()=>document.querySelector('#personalization').value==='Odgovaraj SRB ekavicom.');assert.equal(await page.locator('#memoryEnabled').isChecked(),true);
 for(const width of [1440,768,390]) {await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const box=await page.locator('#settingsDialog').boundingBox();assert.ok(box.x>=0 && box.x+box.width<=width);await page.screenshot({path:'test-artifacts/memory-'+width+'.png'});}
 assert.deepEqual(errors,[]);console.log('Memory UI passed: save, reload, 1440 / 768 / 390 px.');
 }finally{await browser?.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
