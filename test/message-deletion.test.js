const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {chromium}=require('playwright');const {fixture}=require('./fixture');
test('Brisanje pojedinačnih poruka i zaštita istorije',async t=>{
 const app=await fixture();t.after(()=>app.close());const admin=app.client();await admin.login('admin','Admin-password-test-123');
 const conv=(await admin.request('/api/conversations','POST',{model:'deepseek-flash'})).data.conversation;
 const attempt={conversationId:conv.id,requestId:randomUUID(),model:'deepseek-flash',prompt:'Poruka za brisanje'};await admin.request('/api/chat','POST',attempt);
 const history=(await admin.request('/api/conversations/'+conv.id)).data.conversation.messages;
 const route='/api/conversations/'+conv.id+'/messages/'+history[0].id;
 assert.equal((await app.client().request(route,'DELETE',{})).status,401);
 assert.equal((await admin.request(route,'DELETE',{}, {'X-CSRF-Token':'wrong'})).status,403);
 const otherId=randomUUID(),foreign=randomUUID();await app.pool.query("INSERT INTO users(id,username,display_name) VALUES($1,'other','Other')",[otherId]);await app.pool.query("INSERT INTO conversations(id,user_id,title,model) VALUES($1,$2,'Other','deepseek-flash')",[foreign,otherId]);assert.equal((await admin.request('/api/conversations/'+foreign+'/messages/'+history[0].id,'DELETE',{})).status,404);
 await app.pool.query("UPDATE chat_requests SET status='pending' WHERE conversation_id=$1",[conv.id]);assert.equal((await admin.request(route,'DELETE',{})).status,409);await app.pool.query("UPDATE chat_requests SET status='complete' WHERE conversation_id=$1",[conv.id]);
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:900}});await page.route('https://accounts.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.goto(app.origin);await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('Admin-password-test-123');await page.locator('#loginSubmit').click();await page.locator('.delete-message').first().waitFor();
 assert.equal(await page.locator('.delete-message').count(),2);
 page.once('dialog',d=>d.dismiss());await page.locator('.user .delete-message').click();assert.equal(await page.locator('.message-row').count(),2);
 await page.screenshot({path:'test-artifacts/delete-message-390.png',animations:'disabled'});
 page.once('dialog',d=>d.accept());await page.locator('.user .delete-message').click();await page.waitForFunction(()=>document.querySelectorAll('.message-row').length===1);
 assert.equal(await page.locator('.assistant .delete-message').count(),1);
 assert.equal((await admin.request('/api/chat','POST',attempt)).status,409);
 await page.reload();await page.locator('.assistant .delete-message').waitFor();assert.equal(await page.locator('.user').count(),0);
 page.once('dialog',d=>d.accept());await page.locator('.assistant .delete-message').click();await page.locator('#welcome').waitFor({state:'visible'});
 assert.equal((await admin.request('/api/conversations/'+conv.id)).data.conversation.messages.length,0);
 const fresh={...attempt,requestId:randomUUID(),prompt:'Novo pitanje'};assert.equal((await admin.request('/api/chat','POST',fresh)).status,200);assert.equal(app.calls.at(-1).messages.length,1);assert.equal(app.calls.at(-1).messages[0].content,'Novo pitanje');
 }finally{await browser.close();}
});
