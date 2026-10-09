const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./fixture');

(async () => {
  const app = await fixture();
  let browser;
  try {
    const executablePath = process.env.CHROME_PATH || [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
    ].find((file) => fs.existsSync(file));
    if (!executablePath) throw new Error('Podesiti CHROME_PATH za lokalni UI test.');
    browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width:1440,height:900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({
      contentType:'text/javascript',
      body:`window.google={accounts:{id:{initialize(config){this.config=config;},renderButton(target){
        const b=document.createElement('button'); b.textContent='Prijavi se preko Google-a';
        b.onclick=()=>this.config.callback({credential:JSON.stringify({sub:'browser-google',email:'browser-google@gmail.com',
          name:'Google Test',email_verified:true,aud:'test-client',iss:'https://accounts.google.com',
          exp:Math.floor(Date.now()/1000)+3600,nonce:this.config.nonce})});target.append(b);}}}};`
    }));
    await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({contentType:'text/css',body:''}));
    const output = path.join(__dirname,'../test-artifacts');
    fs.mkdirSync(output,{recursive:true});
    await page.goto(app.origin);
    await page.locator('#googleButton button').waitFor();
    for(const width of [1440,768,390]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Login overflow at '+width);
      await page.screenshot({animations:'disabled',path:path.join(output,'login-'+width+'.png')});
    }
    await page.setViewportSize({width:1440,height:900});
    await page.locator('#loginUsername').fill('admin');
    await page.locator('#loginPassword').fill('Admin-password-test-123');
    await page.locator('#loginSubmit').click();
    await page.locator('#adminButton').waitFor({state:'visible'});
    await page.locator('#adminButton').click();
    await page.locator('#adminDialog').waitFor({state:'visible'});
    await page.locator('#newDisplayName').fill('Probni korisnik');
    await page.locator('#newUsername').fill('ui-user');
    await page.locator('#initialPassword').fill('Initial-password-123');
    await page.locator('#createUserButton').click();
    await page.getByText('Nalog je kreiran.',{exact:false}).waitFor();
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:900});
      await page.screenshot({animations:'disabled',path:path.join(output,'admin-'+width+'.png')});
      const bounds=await page.locator('#adminDialog').boundingBox();
      assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width);
    }
    await page.locator('#adminClose').click();
    await page.setViewportSize({width:1440,height:900});
    await page.locator('#logoutButton').click();
    await page.locator('#loginPanel').waitFor({state:'visible'});
    await page.locator('#loginUsername').fill('ui-user');
    await page.locator('#loginPassword').fill('Initial-password-123');
    await page.locator('#loginSubmit').click();
    await page.locator('#passwordDialog').waitFor({state:'visible'});
    await page.locator('#currentPassword').fill('Initial-password-123');
    await page.locator('#newPassword').fill('Changed-password-456');
    await page.locator('#confirmPassword').fill('Changed-password-456');
    await page.locator('#passwordSubmit').click();
    await page.locator('#loginPanel').waitFor({state:'visible'});
    await page.locator('#loginPassword').fill('Changed-password-456');
    await page.locator('#loginSubmit').click();
    await page.locator('.app-shell').waitFor({state:'visible'});
    await page.locator('#promptInput').fill('Provera čuvanja razgovora');
    await page.locator('#sendButton').click();
    await page.getByText('Sačuvan test odgovor.',{exact:true}).waitFor();
    for(const width of [1440,768,390]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Chat overflow at '+width);
      await page.screenshot({animations:'disabled',path:path.join(output,'chat-'+width+'.png')});
      if (width <= 700) {
        const sidebar = await page.locator('#sidebar').boundingBox();
        assert.ok(sidebar.x + sidebar.width <= 1, 'Mobile sidebar must be off-screen when closed');
      }
    }
    await page.reload();
    await page.getByText('Sačuvan test odgovor.',{exact:true}).waitFor();
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(()=>localStorage.setItem('al-ai-conversations',JSON.stringify([{id:'ui-import',title:'Stari razgovor',model:'deepseek-chat',messages:[{role:'user',content:'Sačuvan original'}]}])));
    await page.reload();
    await page.locator('#importButton').waitFor({state:'visible'});
    page.on('dialog',(dialog)=>dialog.accept());
    await page.locator('#importButton').click();
    await page.getByText('Uvezeno: 1.',{exact:false}).waitFor();
    assert.ok(await page.evaluate(()=>localStorage.getItem('al-ai-conversations')),'Local original preserved');
    await page.locator('#importButton').click();
    await page.getByText('Već uvezeno: 1.',{exact:false}).waitFor();
    await page.locator('#googleLinkOpen').click();
    await page.locator('#googleLinkPassword').fill('Changed-password-456');
    await page.locator('#googleLinkSubmit').click();
    await page.locator('#googleLinkButton button').waitFor();
    await page.locator('#googleLinkButton button').click();
    await page.locator('#googleLinked').waitFor({state:'visible'});
    await page.locator('#logoutButton').click();
    await page.locator('#googleButton button').waitFor();
    await page.locator('#googleButton button').click();
    await page.locator('#googleLinked').waitFor({state:'visible'});
    await page.getByRole('button',{name:'Stari razgovor',exact:true}).waitFor();
    await page.locator('#logoutButton').click();
    await page.locator('#loginPanel').waitFor({state:'visible'});
    assert.equal(await page.locator('#messages').textContent(),'');
    assert.deepEqual(errors,[]);
    console.log('PASS UI: login, admin creation, first password, saved chat, import/reimport, Google linking, Google login, logout; 1440/768/390 px. Google and DeepSeek simulated.');
  } finally {
    if(browser) await browser.close();
    await app.close();
  }
})().catch((error)=>{console.error(error);process.exitCode=1;});
