const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {chromium}=require('playwright');
const {fixture}=require('./fixture');
const {saveFile}=require('../files');
const {extractProfileMemories,parseMemoryImport}=require('../memory');

test('Profile extraction and memory import validation',()=>{
  assert.deepEqual(extractProfileMemories('Radim kao profesor. Koristim Node.js.\nPriloženi dokument:\nŽivim u Parizu.'),['Radim kao profesor.','Koristim Node.js.']);
  assert.deepEqual(extractProfileMemories('Da li koristim Node.js?\n'+String.fromCharCode(96).repeat(3)+'\nŽivim u Parizu.\n'+String.fromCharCode(96).repeat(3)),[]);
  assert.deepEqual(parseMemoryImport('{"memories":["Volim jasne odgovore."]}'),['Volim jasne odgovore.']);
  assert.deepEqual(parseMemoryImport('- Prva stavka\n2. Druga stavka'),['Prva stavka','Druga stavka']);
  for(const bad of ['', '{bad}', '{"memories":[{}]}', JSON.stringify(Array(51).fill('stavka')), 'x'.repeat(501)])assert.throws(()=>parseMemoryImport(bad));
});

test('Settings API and browser: private activity, file rename, profile and transferred memory',async t=>{
  const app=await fixture();let browser;
  t.after(async()=>{if(browser)await browser.close();await app.close();});
  const admin=app.client(),guest=app.client();await admin.login('admin','Admin-password-test-123');
  for(const route of ['/api/activity','/api/memory'])assert.equal((await guest.request(route)).status,401);
  const userId=(await admin.request('/api/me')).data.user.id;
  const conversationId=(await admin.request('/api/conversations','POST',{})).data.conversation.id;
  let attempt={conversationId,requestId:randomUUID(),model:'deepseek-flash',prompt:'Radim kao profesor. Koristim Node.js.'};
  const send=prompt=>admin.request('/api/chat','POST',{...attempt,requestId:randomUUID(),prompt});
  await admin.request('/api/chat','POST',attempt);
  assert.equal((await admin.request('/api/memory')).data.profileEntries.length,0);
  assert.equal((await admin.request('/api/memory/profile/history','POST',{})).status,409);
  await admin.request('/api/memory','PUT',{enabled:true,personalization:''});
  assert.equal((await admin.request('/api/memory/profile/history','POST',{})).status,200);
  let memory=(await admin.request('/api/memory')).data;
  assert.equal(memory.profileEntries.length,2);assert.equal(memory.profileEntries[0].conversationId,conversationId);
  await send('Bavim se IoT istraživanjem.');
  assert.match(app.calls.at(-1).messages.find(m=>m.role==='system').content,/IoT/);
  assert.equal((await admin.request('/api/memory/import','POST',{text:'{"memories":[{}]}'})).status,400);
  const importText='{"memories":["Preferiram kratke odgovore.","Koristim Node.js."]}';
  await admin.request('/api/memory/import','POST',{text:importText});await admin.request('/api/memory/import','POST',{text:importText});
  memory=(await admin.request('/api/memory')).data;
  assert.equal(memory.profileEntries.length,4);assert.equal(memory.profileEntries.filter(e=>e.source==='import').length,1);
  await send('Provera prenete memorije');assert.match(app.calls.at(-1).messages.find(m=>m.role==='system').content,/Preferiram kratke/);
  const before=(await admin.request('/api/activity')).data;
  assert.equal(before.days.length,365);assert.equal(before.days.at(-1).messages,3);assert.equal(before.days.at(-1).active,true);
  // Cached replies must not count the same message twice.
  await admin.request('/api/chat','POST',attempt);assert.equal((await admin.request('/api/activity')).data.days.at(-1).messages,3);
  await app.pool.query("INSERT INTO user_activity(user_id,day,messages) VALUES($1,(now() AT TIME ZONE 'Europe/Belgrade')::date-1,2),($1,(now() AT TIME ZONE 'Europe/Belgrade')::date-8,5)",[userId]);
  let activity=(await admin.request('/api/activity')).data;
  assert.equal(activity.totals.activeDays,3);assert.equal(activity.totals.messages,10);assert.equal(activity.days.at(-3).active,false);
  const content=Buffer.from('Tekst originala za proveru preimenovanja.');
  const files=[];for(const direction of ['import','export'])files.push(await saveFile(app.pool,userId,{name:direction+'.txt',kind:'document',mime:'text/plain',direction,content,conversationId}));
  const route='/api/files/'+files[0];
  assert.equal((await guest.request(route,'PATCH',{name:'novi.txt'})).status,401);
  assert.equal((await admin.request(route,'PATCH',{name:'novi.txt'},{'X-CSRF-Token':'bad'})).status,403);
  for(const name of ['../novi.txt','novi.pdf','', 'x'.repeat(181)+'.txt'])assert.equal((await admin.request(route,'PATCH',{name})).status,400);
  await admin.request('/api/admin/users','POST',{username:'settings-other',displayName:'Other',password:'Initial-password-123'});
  const other=app.client();await other.login('settings-other','Initial-password-123');await other.request('/api/password','POST',{currentPassword:'Initial-password-123',password:'Changed-password-456'});await other.login('settings-other','Changed-password-456');
  assert.equal((await other.request(route,'PATCH',{name:'foreign.txt'})).status,404);
  assert.equal((await other.request('/api/memory')).data.profileEntries.length,0);
  assert.equal((await other.request('/api/memory/profile','DELETE',{id:memory.profileEntries[0].id})).status,404);
  assert.equal((await other.request('/api/activity')).data.totals.messages,0);
  const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  browser=await chromium.launch({executablePath,headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://accounts.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await admin.request('/api/conversations/'+conversationId,'PATCH',{title:'Veoma dugačak naziv razgovora koji treba prikazati od početka odmah po prelasku pokazivača'});
  await page.goto(app.origin);await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('Admin-password-test-123');await page.locator('#loginSubmit').click();
  const title=page.locator('.history-item.title-overflow .history-title').first();await title.waitFor();await title.hover();
  const motion=await title.evaluate(e=>{const a=e.getAnimations()[0];a.pause();const x=t=>{a.currentTime=t;return new DOMMatrixReadOnly(getComputedStyle(e).transform).m41;};return {start:x(0),soon:x(100),later:x(500),delay:getComputedStyle(e).animationDelay};});
  assert.equal(motion.start,0);assert.ok(motion.soon<0);assert.ok(motion.later<motion.soon);assert.equal(motion.delay,'0s');
  await page.locator('#settingsButton').click();await page.locator('[data-settings="files"]').click();await page.locator('#documentLibrary .file-card').first().waitFor();
  assert.deepEqual(await page.locator('#documentLibrary .file-card').first().locator('.file-card-actions').evaluate(e=>[...e.children].map(c=>c.textContent)),['Preuzmi','Preimenuj','Prikaži','Obriši']);
  assert.ok(await page.locator('.files-filter').evaluate(e=>parseFloat(getComputedStyle(e).gap)>=10));
  for(const direction of ['import','export']){
    await page.locator('#filesFilter').selectOption(direction);await page.getByText(direction+'.txt',{exact:true}).waitFor();
    page.once('dialog',d=>d.accept(direction+'-preimenovano.txt'));await page.getByRole('button',{name:'Preimenuj',exact:true}).click();
    await page.getByText(direction+'-preimenovano.txt',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Prikaži',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#filePreviewStatus').textContent.startsWith('Učitavanje'));assert.equal(await page.locator('#filePreviewText').isVisible(),true,await page.locator('#filePreviewStatus').textContent());assert.equal(await page.locator('#filePreviewText').textContent(),content.toString());await page.locator('#filePreviewClose').click();
  }
  const downloaded=await admin.request(route);assert.equal(downloaded.data,content.toString());assert.match(downloaded.headers.get('content-disposition'),/import-preimenovano.txt/);
  await page.locator('[data-settings="memory"]').click();await page.locator('#profileMemoryList li').first().waitFor();
  await page.locator('#memoryPromptCopy').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/memories/);
  await page.locator('#memoryImportText').fill('{"memories":["Moj cilj je razvoj IoT aplikacija."]}');await page.locator('#memoryImportSave').click();await page.getByText('Moj cilj je razvoj IoT aplikacija.',{exact:false}).waitFor();
  assert.equal(await page.locator('#profileMemoryList li').count(),5);
  await page.locator('#profileMemoryList li').last().getByRole('button',{name:/Obriši/}).click();await page.waitForFunction(()=>document.querySelectorAll('#profileMemoryList li').length===4);
  await page.locator('[data-settings="activity"]').click();await page.locator('.activity-cell').first().waitFor();
  assert.equal(await page.locator('.activity-cell').count(),365);assert.equal(await page.locator('.activity-cell.active').count(),3);
  for(const view of ['daily','weekly','cumulative']){
    await page.locator('#activityView').selectOption(view);
    const values=await page.locator('.activity-cell').allTextContents();
    if(view!=='daily'){assert.ok(values.length>=52 && values.length<=54);if(view==='weekly')assert.equal(values.reduce((n,v)=>n+Number(v),0),3);else assert.equal(Number(values.at(-1)),3);}
    for(const width of [1440,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('#settingsDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.locator('.activity-scroll').scrollIntoViewIfNeeded();await page.screenshot({path:'test-artifacts/settings-'+view+'-'+width+'.png',animations:'disabled'});}
  }
  await page.locator('[data-settings="memory"]').click();await page.locator('#profileMemoryList li').first().waitFor();await page.locator('#profileMemoryList').scrollIntoViewIfNeeded();await page.screenshot({path:'test-artifacts/settings-memory-390.png',animations:'disabled'});await page.locator('#memoryImportSave').scrollIntoViewIfNeeded();await page.screenshot({path:'test-artifacts/settings-memory-import-390.png',animations:'disabled'});
  await page.locator('[data-settings="files"]').click();await page.locator('#documentLibrary .file-card').first().waitFor();await page.screenshot({path:'test-artifacts/settings-files-390.png',animations:'disabled'});
  await admin.request('/api/memory','PUT',{enabled:false,personalization:''});await send('Živim u Beogradu.');assert.equal(app.calls.at(-1).messages.some(m=>m.role==='system'),false);assert.equal((await admin.request('/api/memory')).data.profileEntries.length,4);
  await app.restart();assert.equal((await admin.request('/api/memory')).data.profileEntries.length,4);
  await admin.request('/api/conversations/'+conversationId,'DELETE',{});assert.equal((await admin.request('/api/activity')).data.totals.messages,11);
  await admin.request('/api/memory','DELETE',{});assert.equal((await admin.request('/api/memory')).data.profileEntries.length,0);
  assert.deepEqual(errors,[]);
});
