const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {chromium}=require('playwright');const fs=require('node:fs');const {fixture}=require('./fixture');
test('Prvi paket: privatni projekti, pinovanje, potrošnja, moduli, biblioteka i Work',async t=>{
 const app=await fixture();let browser; t.after(async()=>{if(browser)await browser.close();await app.close();});
 const admin=app.client(),guest=app.client();await admin.login('admin','Admin-password-test-123');
 for(const route of ['/api/workspace','/api/usage','/api/work/runs'])assert.equal((await guest.request(route)).status,401);
 const project=(await admin.request('/api/projects','POST',{name:'IoT projekat'})).data.id;
 assert.equal((await admin.request('/api/projects/'+project,'PATCH',{instructions:'Koristi jasne tabele i srpski jezik.',pinned:true})).status,200);
 const conversationId=(await admin.request('/api/conversations','POST',{projectId:project})).data.conversation.id;
 await admin.request('/api/conversations/'+conversationId,'PATCH',{pinned:true});
 let state=(await admin.request('/api/workspace')).data;assert.equal(state.projects.length,1);assert.equal(state.pins.length,2);
 const order=state.pins.map(({id,kind})=>({id,kind})).reverse();assert.equal((await admin.request('/api/pins/order','PUT',{items:order})).status,200);assert.deepEqual((await admin.request('/api/workspace')).data.pins.map(({id,kind})=>({id,kind})),order);
 assert.equal((await admin.request('/api/pins/order','PUT',{items:[order[0],order[0]]})).status,409);
 const response=(usage={prompt_tokens:10,completion_tokens:5,total_tokens:15},reason='stop')=>({ok:true,json:async()=>({choices:[{message:{content:'**„Kliknite na dugme *Sačuvaj*."**\n\n| Parametar | Vrednost |\n|---|---|\n| Temperatura | 25 |'},finish_reason:reason}],usage})});
 app.setUpstream(async(url,request)=>{app.calls.push(JSON.parse(request.body));return response();});
 const attempt={conversationId,requestId:randomUUID(),prompt:'Provera projekta',model:'deepseek-flash'};
 assert.equal((await admin.request('/api/chat','POST',attempt)).status,200);assert.match(app.calls.at(-1).messages.find(m=>m.role==='system').content,/jasne tabele/);
 assert.equal((await admin.request('/api/chat','POST',attempt)).status,200);let usage=(await admin.request('/api/usage')).data;assert.equal(usage.calls,1);assert.equal(Number(usage.total),15);
 app.setUpstream(async()=>response({prompt_tokens:12,completion_tokens:8,total_tokens:20},'length'));
 assert.equal((await admin.request('/api/chat','POST',{...attempt,requestId:randomUUID(),prompt:'Nezavršen odgovor'})).status,502);assert.equal(Number((await admin.request('/api/usage')).data.total),35);
 app.setUpstream(async()=>response(undefined));
 const imported=(await admin.request('/api/attachments/extract','POST',{name:'merenje.txt',content:Buffer.from('Temperatura senzora: 25 stepeni.').toString('base64'),projectId:project})).data.fileId;
 assert.ok(imported);assert.equal((await admin.request('/api/files')).data.files[0].project_id,project);
 await admin.request('/api/admin/users','POST',{username:'workspace-other',displayName:'Other',password:'Initial-password-123'});
 const other=app.client();await other.login('workspace-other','Initial-password-123');await other.request('/api/password','POST',{currentPassword:'Initial-password-123',password:'Changed-password-456'});await other.login('workspace-other','Changed-password-456');
 assert.equal((await other.request('/api/workspace')).data.projects.length,0);
 assert.equal((await other.request('/api/projects/'+project,'PATCH',{name:'Tuđi'})).status,404);
 assert.equal((await other.request('/api/conversations','POST',{projectId:project})).status,404);
 assert.equal((await other.request('/api/library/assign','PUT',{fileId:imported,projectId:null})).status,404);
 assert.equal((await other.request('/api/usage?projectId='+project)).status,404);
 const work={conversationId,requestId:randomUUID(),prompt:'Napravi izveštaj senzora',model:'deepseek-flash',format:'docx',fileIds:[imported]};
 let result=await admin.request('/api/work','POST',work);assert.equal(result.status,200,JSON.stringify(result.data));assert.ok(result.data.fileId);
 const artifact=result.data.fileId;const before=(await admin.request('/api/usage')).data.calls;
 result=await admin.request('/api/work','POST',work);assert.equal(result.data.cached,true);assert.equal(result.data.fileId,artifact);assert.equal((await admin.request('/api/usage')).data.calls,before);
 assert.equal((await admin.request('/api/files')).data.files.filter(f=>f.direction==='export').length,1);
 assert.equal((await app.pool.query('SELECT content FROM user_files WHERE id=$1',[artifact])).rows[0].content[0],80);
 const messages=(await admin.request('/api/conversations/'+conversationId)).data.conversation.messages;assert.equal(messages.at(-1).workFileId,artifact);assert.equal(Number(messages.at(-1).totalTokens),15);
 // Potrošnja bez prijavljenih podataka ne sme da se izmišlja.
 app.setUpstream(async()=>response({}));await admin.request('/api/chat','POST',{...attempt,requestId:randomUUID(),prompt:'Odgovor bez usage podataka'});
 assert.equal((await admin.request('/api/usage')).data.unknown,1);
 // Modul može biti promenjen iz druge sesije dok je model u toku: ponavljanje izvoza ne troši nove tokene.
 const exportRetry={...work,requestId:randomUUID(),prompt:'Provera ponavljanja izvoza'};
 app.setUpstream(async()=>{await admin.request('/api/plugins','PUT',{plugins:{pdf:true,docx:false,xlsx:true,pptx:true}});return response();});
 assert.equal((await admin.request('/api/work','POST',exportRetry)).status,403);
 const paidCalls=(await admin.request('/api/usage')).data.calls;
 await admin.request('/api/plugins','PUT',{plugins:{pdf:true,docx:true,xlsx:true,pptx:true}});
 app.setUpstream(async()=>response());assert.equal((await admin.request('/api/work','POST',exportRetry)).status,200);
 assert.equal((await admin.request('/api/usage')).data.calls,paidCalls);
 const plugins={pdf:false,docx:true,xlsx:true,pptx:true};await admin.request('/api/plugins','PUT',{plugins});
 assert.equal((await admin.request('/api/documents/export','POST',{conversationId,format:'pdf'})).status,403);
 assert.equal((await admin.request('/api/work','POST',{...work,requestId:randomUUID(),format:'pdf'})).status,403);
 assert.equal((await admin.request('/api/attachments/extract','POST',{name:'test.pdf',content:Buffer.from('%PDF-').toString('base64')})).status,403);
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://accounts.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.goto(app.origin);
 await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('Admin-password-test-123');await page.locator('#loginSubmit').click();await page.locator('#projectList button').first().waitFor();
 assert.equal(await page.locator('#pinnedList .workspace-row').count(),2);
 await page.locator('#projectList .workspace-item').first().click();await page.locator('#newChatButton').click();await page.locator('#chatMode').selectOption('work');await page.locator('#workFiles input').first().waitFor();await page.locator('#workFiles input').first().check();await page.locator('#workFormat').selectOption('docx');await page.locator('#promptInput').fill('Napravi novi Work dokument');await page.locator('#sendButton').click();
 await page.getByRole('link',{name:'Preuzmi Work dokument'}).waitFor();assert.equal(await page.locator('.assistant strong em').first().textContent(),'Sačuvaj');
 assert.ok((await page.locator('.assistant .message-actions').last().textContent()).includes('Tokeni: 15'));
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-artifacts/workspace-chat-'+width+'.png',animations:'disabled'});}
 await page.locator('#settingsButton').click();await page.locator('[data-settings="library"]').click();await page.locator('#libraryCards .file-card').first().waitFor();
 await page.locator('#librarySearch').fill('merenje');await page.waitForFunction(()=>document.querySelectorAll('#libraryCards .file-card').length===1);
 assert.match(await page.locator('#libraryCards .file-card').textContent(),/merenje.txt/);
 await page.locator('#librarySearch').fill('');await page.locator('#libraryType').selectOption('document');await page.locator('#libraryDirection').selectOption('export');await page.waitForFunction(()=>document.querySelectorAll('#libraryCards .file-card').length===3);
 await page.screenshot({path:'test-artifacts/workspace-library-390.png',animations:'disabled'});
 await page.locator('[data-settings="plugins"]').click();await page.waitForFunction(()=>!document.querySelector('#pluginPdf').checked);await page.locator('#pluginDocx').uncheck();await page.locator('#pluginsForm button').click();await page.getByText('Moduli su sačuvani.',{exact:true}).waitFor();
 assert.equal((await admin.request('/api/work','POST',{...work,requestId:randomUUID()})).status,403);
 await page.locator('[data-settings="usage"]').click();await page.locator('#usageCalls table').waitFor();await page.screenshot({path:'test-artifacts/workspace-usage-390.png',animations:'disabled'});
 assert.ok((await page.locator('#usageTotals').textContent()).includes('Prijavljeni tokeni'));
 assert.ok(await page.locator('#settingsDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 await page.locator('#settingsClose').click();await page.reload();await page.locator('#projectList button').first().waitFor();assert.equal(await page.locator('#pinnedList .workspace-row').count(),2);
 const sharp=require('sharp');const png=await sharp({create:{width:64,height:64,channels:3,background:'#2563eb'}}).png().toBuffer();const photo=(await admin.request('/api/attachments/extract','POST',{name:'work-photo.png',content:png.toString('base64'),projectId:project})).data.fileId;
 const photoJob={...work,requestId:randomUUID(),prompt:'Opiši fotografiju u tabeli',format:'xlsx',fileIds:[photo]};
 const photoResult=await admin.request('/api/work','POST',photoJob);assert.equal(photoResult.status,200,JSON.stringify(photoResult.data));assert.ok((await admin.request('/api/conversations/'+conversationId)).data.conversation.messages.some(m=>m.image));
 assert.equal((await admin.request('/api/files/'+photo,'DELETE',{})).status,200);assert.equal((await admin.request('/api/conversations/'+conversationId)).data.conversation.messages.some(m=>m.image),false);
 const allCalls=(await admin.request('/api/usage')).data.calls;await admin.request('/api/projects/'+project,'DELETE',{});assert.equal((await admin.request('/api/conversations/'+conversationId)).data.conversation.projectId,null);assert.equal((await admin.request('/api/usage')).data.calls,allCalls);
 await app.restart();assert.equal((await admin.request('/api/workspace')).data.plugins.docx,false);assert.equal((await admin.request('/api/usage')).data.calls,allCalls);
 assert.deepEqual(errors,[]);
});
test('Prevlačenje: redosled razgovora, projekti, Pinned i datoteke',async t=>{
 const app=await fixture();let browser;t.after(async()=>{if(browser)await browser.close();await app.close();});const admin=app.client();await admin.login('admin','Admin-password-test-123');
 const project=(await admin.request('/api/projects','POST',{name:'Projekat za prevlačenje'})).data.id;
 const ids=[];for(const title of ['Alfa','Beta','Gama']){const id=(await admin.request('/api/conversations','POST',{})).data.conversation.id;ids.push(id);await admin.request('/api/conversations/'+id,'PATCH',{title});}
 assert.equal((await admin.request('/api/conversations/order','PUT',{ids,projectId:null})).status,200);
 assert.deepEqual((await admin.request('/api/conversations')).data.conversations.map(c=>c.id),ids);
 assert.equal((await admin.request('/api/conversations/order','PUT',{ids:[ids[0],ids[0]]})).status,400);
 const file=(await admin.request('/api/attachments/extract','POST',{name:'prevlacenje.txt',content:Buffer.from('Probni sadržaj za projekat.').toString('base64')})).data.fileId;
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://accounts.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.goto(app.origin);await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('Admin-password-test-123');await page.locator('#loginSubmit').click();await page.locator('#history .history-item').first().waitFor();
 const conversation=id=>page.locator('#history [data-drag-id="'+id+'"] .history-item');
 await conversation(ids[1]).dragTo(conversation(ids[0]));await page.waitForFunction(()=>document.querySelector('#history .history-item').title==='Beta');assert.equal((await admin.request('/api/conversations')).data.conversations[0].id,ids[1]);
 await conversation(ids[0]).dragTo(page.locator('#projectList [data-drag-id="'+project+'"]'));await page.waitForFunction(()=>document.querySelector('#appNotice').textContent.includes('premešten'));assert.equal((await admin.request('/api/conversations/'+ids[0])).data.conversation.projectId,project);
 await conversation(ids[2]).dragTo(page.locator('#pinnedList'));await page.locator('#pinnedList [data-drag-id="'+ids[2]+'"]').waitFor();assert.equal((await admin.request('/api/conversations/'+ids[2])).data.conversation.pinned,true);
 await page.locator('#history [data-drag-id="'+ids[1]+'"] .item-more').click();await page.locator('#itemMenu [data-action="pin"]').click();await page.locator('#pinnedList [data-drag-id="'+ids[1]+'"]').waitFor();
 await page.locator('#pinnedList [data-drag-id="'+ids[1]+'"] .workspace-item').dragTo(page.locator('#pinnedList [data-drag-id="'+ids[2]+'"]'));await page.waitForFunction(id=>document.querySelector('#pinnedList .workspace-row').dataset.dragId===id,ids[1]);
 assert.equal((await admin.request('/api/workspace')).data.pins[0].id,ids[1]);
 await page.locator('#pinnedList [data-drag-id="'+ids[2]+'"] .workspace-item').dragTo(conversation(ids[0]));await conversation(ids[2]).waitFor();assert.equal((await admin.request('/api/conversations/'+ids[2])).data.conversation.pinned,false);
 await page.reload();await page.locator('#projectList button').first().waitFor();assert.equal((await admin.request('/api/workspace')).data.pins[0].id,ids[1]);assert.deepEqual((await admin.request('/api/conversations')).data.conversations.map(c=>c.id),[ids[1],ids[0],ids[2]]);
 await page.locator('#workspaceLibrary').click();await page.locator('#libraryCards .file-card strong').first().waitFor();await page.locator('#libraryCards .file-card strong').first().dragTo(page.locator('#libraryDropTargets [data-project-drop="'+project+'"]'));await page.waitForFunction(id=>document.querySelector('#libraryCards .file-card select')?.value===id,project);assert.equal((await admin.request('/api/files')).data.files.find(f=>f.id===file).project_id,project);
 await page.screenshot({path:'test-artifacts/workspace-drag-library.png',animations:'disabled'});await page.locator('#settingsClose').click();await page.locator('#settingsButton').click();await page.locator('[data-settings="usage"]').click();await page.locator('#usageCalls table').waitFor();await page.setViewportSize({width:390,height:900});await page.screenshot({path:'test-artifacts/workspace-spacing-usage-390.png',animations:'disabled'});assert.equal(await page.locator('.usage-filters label').first().evaluate(e=>getComputedStyle(e).gap),'12px');assert.ok(await page.locator('#settingsDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.locator('#settingsClose').click();await page.locator('#chatMode').selectOption('work');await page.locator('#workFormat').waitFor({state:'visible'});assert.equal(await page.locator('#workInputs > label').evaluate(e=>getComputedStyle(e).gap),'12px');await page.screenshot({path:'test-artifacts/workspace-spacing-work-390.png',animations:'disabled'});
 assert.deepEqual(errors,[]);
});
test('Meni sa tri tačke, sačuvane konverzacije i arhiviranje',async t=>{
 const app=await fixture();let browser;t.after(async()=>{if(browser)await browser.close();await app.close();});const admin=app.client();await admin.login('admin','Admin-password-test-123');
 const project=(await admin.request('/api/projects','POST',{name:'Vrlo dugačak naziv projekta za proveru animacije celog naslova'})).data.id;
 const id=(await admin.request('/api/conversations','POST',{projectId:project})).data.conversation.id;
 await admin.request('/api/chat','POST',{conversationId:id,requestId:randomUUID(),prompt:'Kratak tekst za čuvanje u memoriju',model:'deepseek-flash'});
 await admin.request('/api/admin/users','POST',{username:'archive-other',displayName:'Other',password:'Initial-password-123'});const other=app.client();await other.login('archive-other','Initial-password-123');await other.request('/api/password','POST',{currentPassword:'Initial-password-123',password:'Changed-password-456'});await other.login('archive-other','Changed-password-456');
 assert.equal((await other.request('/api/saved-conversations','POST',{conversationId:id})).status,404);
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://accounts.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.goto(app.origin);await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('Admin-password-test-123');await page.locator('#loginSubmit').click();await page.locator('#history .item-more').first().waitFor();
 assert.equal(await page.locator('#history .history-entry').first().evaluate(e=>e.children.length),2);
 assert.equal(await page.locator('#workspaceLibrary').textContent(),'Biblioteka');assert.equal(await page.locator('#workspaceLibrary').evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');
 const projectTitle=page.locator('#projectList .history-item').first();await projectTitle.hover();assert.equal(await projectTitle.locator('.history-title').evaluate(e=>getComputedStyle(e).animationName),'history-title-scroll');assert.equal(await projectTitle.evaluate(e=>getComputedStyle(e).textOverflow),'clip');assert.equal(await projectTitle.locator('.history-title').evaluate(e=>getComputedStyle(e).textOverflow),'clip');
 await page.locator('#history .item-more').first().click();await page.locator('#itemMenu [data-action="memory"]').click();await page.getByText('Razgovor je sačuvan u Memorija → Sačuvane konverzacije.',{exact:true}).waitFor();
 let saved=(await admin.request('/api/saved-conversations')).data.items;assert.equal(saved.length,1);const savedId=saved[0].id;assert.equal((await other.request('/api/saved-conversations/'+savedId)).status,404);
 await admin.request('/api/saved-conversations','POST',{conversationId:id});assert.equal((await admin.request('/api/saved-conversations')).data.items.length,1);
 await page.locator('#history .item-more').first().click();await page.locator('#itemMenu [data-action="pin"]').click();await page.locator('#pinnedList .item-more').first().waitFor();
 await page.locator('#pinnedList .item-more').first().click();await page.screenshot({path:'test-artifacts/workspace-menu-1440.png',animations:'disabled'});await page.locator('#itemMenu [data-action="archive"]').click();await page.waitForFunction(()=>document.querySelector('#pinnedList').children.length===0);
 assert.equal((await admin.request('/api/conversations')).data.conversations.length,0);assert.equal((await admin.request('/api/archived')).data.conversations.length,1);
 assert.equal((await admin.request('/api/chat','POST',{conversationId:id,requestId:randomUUID(),prompt:'Arhiviran razgovor',model:'deepseek-flash'})).status,409);
 await page.locator('#settingsButton').click();await page.locator('[data-settings="archived"]').click();await page.locator('#archivedList .item-more').first().waitFor();await page.locator('#archivedList .item-more').first().click();await page.locator('#itemMenu [data-action="archive"]').click();await page.waitForFunction(()=>document.querySelector('#archivedStatus').textContent==='Arhiva je prazna.');assert.equal((await admin.request('/api/conversations')).data.conversations.length,1);
 await page.locator('[data-settings="memory"]').click();await page.locator('#savedList .file-card').first().waitFor();await page.locator('#savedList .file-card button').first().click();await page.locator('#savedMessages .bubble').last().waitFor();assert.match(await page.locator('#savedMessages').textContent(),/Sačuvan test odgovor/);await page.locator('#savedClose').click();
 await page.locator('#settingsClose').click();await page.locator('#projectList .item-more').first().click();await page.locator('#itemMenu [data-action="archive"]').click();await page.waitForFunction(()=>document.querySelector('#projectList').children.length===0);assert.equal((await admin.request('/api/conversations')).data.conversations.length,0);
 assert.equal((await admin.request('/api/archived')).data.projects.length,1);assert.equal((await other.request('/api/archived/restore','POST',{kind:'conversation',id})).status,404);await admin.request('/api/archived/restore','POST',{kind:'conversation',id});assert.equal((await admin.request('/api/conversations')).data.conversations.length,1);assert.equal((await admin.request('/api/conversations/'+id)).data.conversation.projectId,project);assert.equal((await admin.request('/api/archived')).data.projects.length,0);
 // Stored text survives deletion of the original conversation.
 await admin.request('/api/conversations/'+id,'DELETE',{});const snapshot=(await admin.request('/api/saved-conversations/'+savedId)).data.item;assert.equal(snapshot.source_exists,false);assert.equal(snapshot.messages.length,2);
 await page.reload();await page.locator('#settingsButton').click();await page.locator('[data-settings="memory"]').click();await page.locator('#savedList .file-card').first().waitFor();await page.setViewportSize({width:390,height:900});await page.locator('#savedList').scrollIntoViewIfNeeded();await page.screenshot({path:'test-artifacts/workspace-saved-390.png',animations:'disabled'});assert.ok(await page.locator('#settingsDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 assert.equal((await other.request('/api/saved-conversations/'+savedId,'DELETE',{})).status,404);assert.equal((await admin.request('/api/saved-conversations/'+savedId,'DELETE',{})).status,200);assert.equal((await admin.request('/api/saved-conversations')).data.items.length,0);
 assert.deepEqual(errors,[]);
});
test('Topic conversations receive per-user sequential titles',async t=>{
 const app=await fixture();t.after(()=>app.close());const admin=app.client();await admin.login('admin','Admin-password-test-123');
 async function create(client,prompt,projectId=null){
  const created=await client.request('/api/conversations','POST',{projectId});assert.equal(created.status,201);const id=created.data.conversation.id;
  const attempt={conversationId:id,requestId:randomUUID(),model:'deepseek-flash',prompt};assert.equal((await client.request('/api/chat','POST',attempt)).status,200);
  const conversation=(await client.request('/api/conversations/'+id)).data.conversation;return {id,title:conversation.title,attempt};
 }
 const topics=['Telekomunikacije','IKT','Primenjena i kompjuterska fizika','Programiranje','AI','JavaScript','Veb','Investicioni menadžment','Preduzetništvo','Šta god'];
 const project=(await admin.request('/api/projects','POST',{name:'Numbered topics'})).data.id;
 for(const topic of topics){
  // Keep fixture requests outside the production per-minute message limit.
  await app.pool.query("UPDATE chat_requests SET started_at=now()-interval '2 minutes'");
  const first=await create(admin,topic);assert.equal(first.title,topic);
  if(topic==='Programiranje')await admin.request('/api/conversations/'+first.id,'PATCH',{archived:true});
  const second=await create(admin,topic,project),third=await create(admin,topic);assert.equal(second.title,topic+'(1)');assert.equal(third.title,topic+'(2)');
  assert.equal((await admin.request('/api/chat','POST',second.attempt)).status,200);
  assert.equal((await admin.request('/api/chat','POST',{...second.attempt,requestId:randomUUID()})).status,200);
  assert.equal((await admin.request('/api/conversations/'+second.id)).data.conversation.title,topic+'(1)');
 }
 const parallel=await Promise.all([create(admin,'Programiranje'),create(admin,'Programiranje')]);assert.deepEqual(parallel.map(c=>c.title).sort(),['Programiranje(3)','Programiranje(4)']);
 await admin.request('/api/conversations/'+parallel[1].id,'PATCH',{title:'Programiranje(7)'});assert.equal((await create(admin,'Programiranje')).title,'Programiranje(8)');
 await admin.request('/api/admin/users','POST',{username:'number-other',displayName:'Other',password:'Initial-password-123'});const other=app.client();await other.login('number-other','Initial-password-123');await other.request('/api/password','POST',{currentPassword:'Initial-password-123',password:'Changed-password-456'});await other.login('number-other','Changed-password-456');assert.equal((await create(other,'Programiranje')).title,'Programiranje');
 assert.equal((await create(admin,'A different ordinary prompt')).title,'A different ordinary prompt');
});

test('Conversation transfer copies latest exchange and refreshes all destinations',async t=>{
 const app=await fixture();let browser;t.after(async()=>{await browser?.close();await app.close();});
 const admin=app.client();await admin.login('admin','Admin-password-test-123');const user=(await admin.request('/api/me')).data.user.id;
 app.setUpstream(async(url,request)=>{app.calls.push(JSON.parse(request.body));return {ok:true,json:async()=>({choices:[{message:{content:'Transfer answer'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:2,total_tokens:12}})};});
 async function conversation(title,projectId=null){const c=(await admin.request('/api/conversations','POST',{projectId})).data.conversation;await admin.request('/api/conversations/'+c.id,'PATCH',{title});return c;}
 async function send(id,prompt,fileId){const r=await admin.request('/api/chat','POST',{conversationId:id,requestId:randomUUID(),model:'deepseek-flash',prompt,fileId});assert.equal(r.status,200);}
 const project=(await admin.request('/api/projects','POST',{name:'Transfer project'})).data.id;
 const source=await conversation('Transfer source'),target=await conversation('Transfer target',project),archived=await conversation('Hidden archived');await admin.request('/api/conversations/'+archived.id,'PATCH',{archived:true});await admin.request('/api/conversations/'+target.id,'PATCH',{pinned:true});
 await send(target.id,'Original destination');await send(source.id,'Earlier source message');
 const imported=(await admin.request('/api/attachments/extract','POST',{name:'source.txt',content:Buffer.from('Attached content').toString('base64')})).data.fileId;
 await send(source.id,'Latest source message',imported);
 const sourceData=(await admin.request('/api/conversations/'+source.id)).data.conversation,pair=sourceData.messages.slice(-2),workId=randomUUID();
 await app.pool.query("INSERT INTO user_files(id,user_id,conversation_id,name,mime,kind,direction,content) VALUES($1,$2,$3,'output.txt','text/plain','document','export',$4)",[workId,user,source.id,Buffer.from('Generated output')]);
 await app.pool.query("INSERT INTO work_runs(user_id,request_id,conversation_id,payload,status,file_id,assistant_message_id) VALUES($1,$2,$3,'{}','complete',$4,$5)",[user,randomUUID(),source.id,workId,pair[1].id]);
 const payload={targetId:target.id,messageIds:pair.map(m=>m.id)};
 assert.equal((await admin.request('/api/conversations/'+source.id+'/transfer','POST',{...payload,targetId:source.id})).status,400);
 assert.equal((await admin.request('/api/conversations/'+source.id+'/transfer','POST',{...payload,targetId:archived.id})).status,409);
 assert.equal((await admin.request('/api/conversations/'+source.id+'/transfer','POST',{...payload,messageIds:sourceData.messages.slice(0,2).map(m=>m.id)})).status,409);
 await app.pool.query("UPDATE chat_requests SET status='pending',started_at=now() WHERE conversation_id=$1",[source.id]);assert.equal((await admin.request('/api/conversations/'+source.id+'/transfer','POST',payload)).status,409);await app.pool.query("UPDATE chat_requests SET status='complete' WHERE conversation_id=$1",[source.id]);
 await admin.request('/api/admin/users','POST',{username:'transfer-other',displayName:'Other',password:'Initial-password-123'});const other=app.client();await other.login('transfer-other','Initial-password-123');await other.request('/api/password','POST',{currentPassword:'Initial-password-123',password:'Changed-password-456'});await other.login('transfer-other','Changed-password-456');assert.equal((await other.request('/api/conversations/'+source.id+'/transfer','POST',payload)).status,404);
 const extras=Array.from({length:105},(_,i)=>({id:randomUUID(),title:'Extra target '+i}));await app.pool.query("INSERT INTO conversations(id,user_id,title,model) SELECT id,$1,title,'deepseek-flash' FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,title text)",[user,JSON.stringify(extras)]);
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:390,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://accounts.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await page.goto(app.origin,{waitUntil:'domcontentloaded'});await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('Admin-password-test-123');await page.locator('#loginSubmit').click();await page.locator('#welcome').waitFor({state:'visible'});await page.evaluate(id=>selectConversation(id),source.id);
 await page.locator('#conversationTopics summary').click();await page.locator('[data-transfer-id="'+target.id+'"]').waitFor();await page.waitForFunction(()=>document.querySelectorAll('[data-transfer-id]').length===106);assert.equal(await page.locator('.conversation-topic-options>strong').textContent(),'Prenesite razgovor u: ');assert.equal(await page.locator('#conversationTopics summary').textContent(),'Prenos razgovora');assert.equal(await page.locator('[data-transfer-id="'+source.id+'"]').count(),0);assert.equal(await page.locator('[data-transfer-id="'+archived.id+'"]').count(),0);
 const bounds=await page.locator('.conversation-topic-options').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);const menuScroll=await page.locator('.conversation-topic-options').evaluate(e=>{e.scrollTop=400;return e.scrollTop;});await admin.request('/api/conversations/'+target.id,'PATCH',{title:'Renamed transfer target'});await page.locator('[data-transfer-id="'+target.id+'"]').filter({hasText:'Renamed transfer target'}).waitFor({timeout:12000});assert.equal(await page.locator('.conversation-topic-options').evaluate(e=>e.scrollTop),menuScroll);fs.mkdirSync('test-artifacts',{recursive:true});await page.screenshot({path:'test-artifacts/conversation-transfer-390.png',animations:'disabled'});
 await page.locator('[data-transfer-id="'+target.id+'"]').click();await page.waitForFunction(()=>document.querySelector('#appNotice').textContent.includes('Renamed transfer target')&&!document.querySelector('#newChatButton').disabled);
 const transferred=(await admin.request('/api/conversations/'+target.id)).data.conversation;assert.equal(transferred.messages.length,4);assert.deepEqual(transferred.messages.slice(-2).map(m=>m.content),pair.map(m=>m.content));assert.equal(Number(transferred.messages.at(-1).totalTokens),12);assert.equal(transferred.messages.at(-1).generationMs,pair[1].generationMs);const copiedWork=transferred.messages.at(-1).workFileId;assert.ok(copiedWork&&copiedWork!==workId);assert.equal(app.calls.length,3);
 assert.equal((await admin.request('/api/conversations/'+source.id+'/transfer','POST',payload)).data.copied,0);assert.equal((await admin.request('/api/conversations/'+target.id)).data.conversation.messages.length,4);assert.equal((await admin.request('/api/conversations/'+source.id)).data.conversation.messages.length,4);
 assert.equal((await admin.request('/api/conversations/'+source.id,'DELETE',{})).status,200);assert.equal((await admin.request('/api/files/'+copiedWork)).status,200);const copiedImport=(await app.pool.query("SELECT file_id FROM messages WHERE conversation_id=$1 AND role='user' ORDER BY id DESC LIMIT 1",[target.id])).rows[0].file_id;assert.ok(copiedImport&&copiedImport!==imported);assert.equal((await admin.request('/api/files/'+copiedImport)).status,200);assert.equal((await admin.request('/api/usage')).data.calls,3);assert.deepEqual(errors,[]);
});
