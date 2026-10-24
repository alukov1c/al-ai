const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {shouldSearchWeb,clockAnswer,localDate,latinText,cleanSearchUrl,allowedSource,marketAssets,publicUrl,normalizeWeb,createWebTools}=require('../web-tools');
const {fixture}=require('./fixture');
const {chromium}=require('playwright');
test('web validation and source ownership',async()=>{
 for(const url of ['file:///x','http://localhost/x','http://127.0.0.1','https://a:b@example.com','http://192.168.1.1'])assert.throws(()=>publicUrl(url));
 assert.equal(normalizeWeb({enabled:false}),null);assert.equal(allowedSource('https://www.coingecko.com/en/coins/bitcoin'),true);assert.equal(allowedSource('https://unselected.example/news'),false);assert.throws(()=>normalizeWeb({enabled:true,query:'a'.repeat(129)}));
 const web=createWebTools({apiKey:'key',fetchImpl:async()=>({ok:true,json:async()=>({title:'Page',content:'Text'})})});
 const source=await web.fetchPage('user-a','https://www.coingecko.com/en/coins/bitcoin');assert.equal(web.getSnapshot('user-a',source.token).content,'Text');assert.throws(()=>web.getSnapshot('user-b',source.token));
});
test('market queries cover every asset and prefer known sources without hiding dates',async()=>{
 const calls=[];const web=createWebTools({apiKey:'key',fetchImpl:async(url,request)=>{const body=JSON.parse(request.body);calls.push({endpoint:url,...body});if(url.endsWith('/fetch'))return {ok:true,json:async()=>({title:'Quote page',content:'Refreshed quote page.'})};const asset=body.query.split(' ')[0];return {ok:true,json:async()=>({results:[{url:'https://www.investing.com/',title:'Homepage',content:'Old homepage ticker',authority:4,rerank_score:3},{url:'https://www.investing.com/news/article',title:'Old analysis',content:'Article price',authority:4,rerank_score:3},{url:'https://unknown.example/'+asset,title:'Unknown',summary:'Old data',authority:0},{url:(asset==='XAU'?'https://www.investing.com/':'https://www.coingecko.com/')+asset,title:asset,content:'Quote page',authority:3,rerank_score:2,date:new Date().toISOString()}]})};}});
 const sources=await web.retrieve('user',{enabled:true,query:'',url:''},'Pretraga interneta i tabelarni prikaz cene BTC, ETH i XAU na osnovu najnovijih podataka uz procentualnu 24-casovnu promenu.');
 assert.equal(calls.filter(c=>c.endpoint.endsWith('/search')).length,3);assert.equal(calls.filter(c=>c.endpoint.endsWith('/fetch')).length,3);assert.ok(sources.every(s=>s.refreshStatus==='fetched_now'));assert.deepEqual(sources.slice(0,3).map(s=>s.asset),['BTC','ETH','XAU']);assert.ok(sources.slice(0,3).every(s=>s.publishedAt&&s.authority===3));assert.ok(calls.filter(c=>c.query).every(c=>c.query.length<=128&&c.query.includes(localDate())&&c.query.includes('site:')));assert.deepEqual(marketAssets('Objasni programiranje.'),[]);
});
test('enabled source filter excludes unselected sites and OFF retains them',async()=>{
 const web=createWebTools({apiKey:'key',fetchImpl:async()=>({ok:true,json:async()=>({results:[{url:'https://unselected.example/news',title:'Other',content:'Text'},{url:'https://www.coingecko.com/en/coins/bitcoin',title:'Selected',content:'Text'}]})})});
 assert.equal((await web.retrieve('u',{enabled:true,query:'test',filterSources:true},'test')).length,1);
 assert.equal((await web.retrieve('u',{enabled:true,query:'test',filterSources:false},'test')).length,2);
});
test('clock and source normalization use Belgrade date and exclude regional scripts',async()=>{
 assert.equal(localDate(new Date('2026-10-24T23:30:00Z')),'2026-10-25');assert.match(clockAnswer('Koji je današnji datum?',new Date('2026-10-24T08:30:00Z')),/24/);
 assert.equal(latinText('č ć š đ ž Bitcoin'),true);assert.equal(latinText('سعر الذهب الآن'),false);assert.equal(allowedSource('https://sa.investing.com/news/x'),false);assert.equal(allowedSource('https://in.tradingview.com/chart/XAUUSD/x'),false);assert.equal(allowedSource('https://m.th.investing.com/currencies/xau-usd'),false);
 assert.equal(cleanSearchUrl('https://coinmarketcap.com/currencies/bitcoin/?period=7d%22%22'),'https://coinmarketcap.com/currencies/bitcoin/');
 const web=createWebTools({apiKey:'key',fetchImpl:async()=>{throw Error('Unexpected call');}});assert.deepEqual(await web.retrieve('u',{enabled:true,filterSources:true},'Koji je današnji datum?'),[]);
});
test('failed market refresh removes indexed prices instead of presenting them as current',async()=>{
 const web=createWebTools({apiKey:'key',fetchImpl:async(url)=>url.endsWith('/search')?{ok:true,json:async()=>({results:[{url:'https://coinmarketcap.com/currencies/bitcoin/',title:'BTC price',content:'Outdated BTC price 100 USD'}]})}:{ok:false,status:504}});
 const sources=await web.retrieve('u',{enabled:true,query:'',filterSources:true},'Najnovija cena BTC');assert.equal(sources[0].refreshStatus,'failed');assert.ok(!sources[0].content.includes('100 USD'));
});
test('internet ON is permission rather than mandatory search',()=>{
 const options={enabled:true,query:'',url:''};
 for(const q of ['Zdravo','Objasni Pitagorinu teoremu','Sažmi naš razgovor','Napiši funkciju za sortiranje','Koji je današnji datum?'])assert.equal(shouldSearchWeb(q,options),false,q);
 for(const q of ['Pretraži internet o ovoj temi','Najnovija cena BTC','Aktuelni kurs evra','Pročitaj https://example.com'])assert.equal(shouldSearchWeb(q,options),true,q);
 assert.equal(shouldSearchWeb('Pretraži internet',null),false);
});
test('search, citations, retry recovery, source save and browser flow',async t=>{
 const app=await fixture();let browser;t.after(async()=>{await browser?.close();await app.close();});
 const client=app.client();await client.login('admin','Admin-password-test-123');assert.equal((await client.request('/api/internet','PUT',{enabled:'true'})).status,400);assert.equal((await client.request('/api/settings/internet')).data.enabled,true);assert.equal((await client.request('/api/settings/internet','PUT',{enabled:false,filterSources:false})).status,200);assert.equal((await client.request('/api/internet')).data.enabled,false);assert.equal((await client.request('/api/settings/internet','PUT',{enabled:true,filterSources:true})).status,200);const project=(await client.request('/api/projects','POST',{name:'Web project'})).data.id;
 const calls=[];let failSearch=false;
 app.setUpstream(async(url,request)=>{const body=JSON.parse(request.body);calls.push({url,body});
 if(url.endsWith('/tools/search'))return failSearch?{ok:false,status:402}:{ok:true,json:async()=>({results:[{title:'Official source',url:'https://www.coingecko.com/en/coins/bitcoin',summary:'Verified source text.'}]})};
 if(url.endsWith('/tools/fetch'))return {ok:true,json:async()=>({title:'Official source',content:'# Source\nVerified source text.'})};
 return {ok:true,json:async()=>({choices:[{message:{content:'Pregled podataka [Veb 1].\n\n| Aktiva | Cena | Promena 24h |\n| --- | ---: | ---: |\n| BTC | 100 USD | +0.06% |\n| ETH | 10 USD | -1.29% |'},finish_reason:'stop'}]})};});
 const conversation=(await client.request('/api/conversations','POST',{projectId:project,model:'deepseek-flash'})).data.conversation.id;
 const base={conversationId:conversation,requestId:randomUUID(),prompt:'Obicno pitanje',model:'deepseek-flash'};
 assert.equal((await client.request('/api/chat','POST',base)).status,200);assert.equal(calls.filter(c=>c.url.includes('/tools/')).length,0);
 const beforePlain=calls.filter(c=>c.url.includes('/tools/')).length;assert.equal((await client.request('/api/chat','POST',{...base,requestId:randomUUID(),prompt:'Objasni sabiranje',web:{enabled:true}})).status,200);assert.equal(calls.filter(c=>c.url.includes('/tools/')).length,beforePlain);
 const beforeClock=calls.length;const clockResult=await client.request('/api/chat','POST',{...base,requestId:randomUUID(),prompt:'Koji je današnji datum?',web:{enabled:true,filterSources:true}});assert.equal(clockResult.status,200);assert.match(clockResult.data.message,/Danas je/);assert.equal(calls.length,beforeClock);
 const question={...base,requestId:randomUUID(),prompt:'Proveri izvor',web:{enabled:true,query:'test source',url:''}};
 const response=await client.request('/api/chat','POST',question);assert.equal(response.status,200,JSON.stringify(response.data));assert.match(response.data.message,/Konsultovani veb izvori/);assert.match(response.data.message,/https:\/\/www.coingecko.com\/en\/coins\/bitcoin/);
 assert.ok(calls.at(-1).body.messages.some(m=>m.content.includes('Verified source text.')));const count=calls.length;
 assert.equal((await client.request('/api/chat','POST',question)).status,200);assert.equal(calls.length,count);
 assert.equal((await client.request('/api/chat','POST',{...question,web:null})).status,409);
 failSearch=true;const failed={...question,requestId:randomUUID()};assert.equal((await client.request('/api/chat','POST',failed)).status,502);
 const recovery=(await client.request('/api/conversations/'+conversation)).data.conversation.request;assert.deepEqual(recovery.web,normalizeWeb(question.web));failSearch=false;assert.equal((await client.request('/api/chat','POST',failed)).status,200);
 const source=(await client.request('/api/web/fetch','POST',{url:'https://www.coingecko.com/en/coins/bitcoin'})).data.source;
 const saved=await client.request('/api/web/save','POST',{token:source.token,projectId:project});assert.equal(saved.status,200,JSON.stringify(saved.data));
 const row=(await app.pool.query('SELECT * FROM user_files WHERE id=$1',[saved.data.fileId])).rows[0];assert.equal(row.project_id,project);assert.match(Buffer.from(row.content).toString(),/Izvor: https:\/\/www.coingecko.com\/en\/coins\/bitcoin/);
 assert.equal((await client.request('/api/web/save','POST',{token:source.token,projectId:randomUUID()})).status,404);
 assert.equal((await client.request('/api/web/fetch','POST',{url:'http://localhost/private'})).status,400);
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://accounts.google.com/**',r=>r.abort());await page.goto(app.origin);await page.locator('#loginUsername').fill('admin');await page.locator('#loginPassword').fill('Admin-password-test-123');await page.locator('#loginSubmit').click();await page.waitForFunction(()=>currentUser&&workspace.projects.length===1);
 await page.locator('#projectList .workspace-item').filter({hasText:'Web project'}).click();assert.equal(await page.locator('#webEnabled').isChecked(),true);await page.locator('#webEnabled').uncheck();await page.waitForFunction(()=>currentUser.internetEnabled===false);await page.locator('#webEnabled').check();await page.waitForFunction(()=>currentUser.internetEnabled===true);await page.reload();await page.waitForFunction(()=>currentUser?.internetEnabled===true);assert.equal(await page.locator('#webEnabled').isChecked(),true);await page.locator('#projectList .workspace-item').filter({hasText:'Web project'}).click();await page.locator('#settingsButton').click();await page.locator('[data-settings=internet]').click();assert.equal(await page.locator('#internetDefault').isChecked(),true);await page.locator('#internetDefault').uncheck();await page.waitForFunction(()=>currentUser.internetEnabled===false);assert.equal(await page.locator('#webEnabled').isChecked(),false);await page.locator('#internetDefault').check();await page.waitForFunction(()=>currentUser.internetEnabled===true);assert.equal(await page.locator('#internetFilter').isChecked(),true);await page.locator('#internetFilter').uncheck();await page.waitForFunction(()=>currentUser.internetFilterEnabled===false);await page.locator('#internetFilter').check();await page.waitForFunction(()=>currentUser.internetFilterEnabled===true);await page.locator('#webQuery').fill('test source');await page.screenshot({path:'test-artifacts/internet-settings.png'});await page.locator('#settingsClose').click();await page.locator('#promptInput').fill('Proveri javne izvore.');await page.locator('#sendButton').click();await page.waitForFunction(()=>!isSending&&current?.messages.some(m=>m.role==='assistant'));assert.equal(await page.locator('.message-actions').evaluateAll(rows=>rows.every(row=>row.querySelector('.copy-message')?.nextElementSibling?.classList.contains('delete-message'))),true);assert.ok(await page.locator('.answer-sources').count());assert.ok(await page.locator('.change-positive').count());assert.ok(await page.locator('.change-negative').count());await page.screenshot({path:'test-artifacts/web-answer-sources.png'});await page.getByRole('button',{name:'Pročitaj / Sačuvaj',exact:true}).last().click();await page.locator('#webSourceFetch').click();await page.waitForFunction(()=>!document.querySelector('#webSourceSave').disabled);await page.locator('#webSourceSave').click();await page.waitForFunction(()=>document.querySelector('#webSourceStatus').textContent.includes('sačuvan'));assert.deepEqual(errors,[]);
 await page.screenshot({path:'test-artifacts/web-source-dialog.png'});
});
