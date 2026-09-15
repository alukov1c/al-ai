const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fixture } = require('./fixture');
const { hashPassword, verifyPassword } = require('../auth');

test('Nalozi, privatni razgovori i Google identiteti', async (t) => {
  const app = await fixture();
  t.after(() => app.close());
  const admin = app.client(), alice = app.client(), bob = app.client(), guest = app.client();
  let aliceId, bobId, conversationId;
  await t.test('Migracije su ponovljive; tajne i anonimni API nisu dostupni', async () => {
    assert.equal((await app.pool.query('SELECT * FROM schema_migrations')).rowCount, 1);
    assert.equal((await guest.request('/healthz')).status, 200);
    for (const file of ['/api.txt','/.env','/db.js','/migrations/001_accounts_conversations.sql']) assert.equal((await guest.request(file)).status, 404);
    assert.equal((await guest.request('/api/conversations')).status, 401);
    assert.equal((await guest.request('/api/chat','POST',{})).status, 401);
    assert.equal((await guest.request('/api/login','POST',{}, { Origin:'https://other.example' })).status, 403);
    assert.equal((await guest.request('/api/register','POST',{})).status, 401);
    const hash = await hashPassword('A-strong-test-password');
    assert.notEqual(hash, 'A-strong-test-password');
    assert.equal(await verifyPassword('A-strong-test-password',hash),true);
    assert.equal(await verifyPassword('wrong',hash),false);
  });
  await t.test('Administrator kreira naloge; prva lozinka mora da se promeni', async () => {
    assert.equal((await admin.login('admin','incorrect')).status,401);
    const login = await admin.login('admin','Admin-password-test-123');
    assert.equal(login.status,200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
    assert.equal(login.data.user.password_hash,undefined);
    for (const [name,client] of [['alice',alice],['bob',bob]]) {
      const created=await admin.request('/api/admin/users','POST',{username:name,displayName:name,password:'Initial-password-123'});
      assert.equal(created.status,201);
      if(name==='alice') aliceId=created.data.user.id; else bobId=created.data.user.id;
      assert.equal((await client.login(name,'Initial-password-123')).status,200);
      assert.equal((await client.request('/api/conversations')).status,403);
      assert.equal((await client.request('/api/password','POST',{currentPassword:'Initial-password-123',password:'Changed-password-456'})).status,200);
      assert.equal((await client.request('/api/me')).status,401);
      assert.equal((await client.login(name,'Changed-password-456')).status,200);
    }
    assert.equal((await alice.request('/api/admin/users')).status,403);
    assert.equal((await admin.request('/api/admin/users','POST',{username:'alice',displayName:'Duplicate',password:'Initial-password-123'})).status,409);
    assert.equal((await alice.request('/api/conversations','POST',{}, {'X-CSRF-Token':'wrong'})).status,403);
  });
  await t.test('Vlasništvo važi za čitanje, preimenovanje, brisanje i DeepSeek pozive', async () => {
    const created=await alice.request('/api/conversations','POST',{model:'deepseek-flash'});
    assert.equal(created.status,201);
    conversationId=created.data.conversation.id;
    assert.equal((await bob.request('/api/conversations')).data.conversations.length,0);
    for(const [method,body] of [['GET',undefined],['PATCH',{title:'Stolen'}],['DELETE',{}]]) {
      assert.equal((await bob.request('/api/conversations/'+conversationId,method,body)).status,404);
    }
    assert.equal((await bob.request('/api/chat','POST',{conversationId,requestId:randomUUID(),prompt:'Steal',model:'deepseek-flash'})).status,404);
    assert.equal(app.calls.length,0);
    assert.equal((await alice.request('/api/conversations/'+conversationId,'PATCH',{title:'Privatni razgovor'})).status,200);
  });
  await t.test('Slanje koristi sačuvanu istoriju; ponavljanje ne duplira poruke ni API poziv', async () => {
    const payload={conversationId,requestId:randomUUID(),prompt:'Prvo pitanje',model:'deepseek-flash'};
    assert.equal((await alice.request('/api/chat','POST',payload)).status,200);
    assert.equal((await alice.request('/api/chat','POST',payload)).status,200);
    assert.equal(app.calls.length,1);
    assert.equal(app.calls[0].thinking.type,'disabled');
    assert.equal(app.calls[0].temperature,0.7);
    assert.equal((await alice.request('/api/chat','POST',{...payload,prompt:'Drugo pitanje'})).status,409);
    assert.equal((await alice.request('/api/conversations/'+conversationId)).data.conversation.messages.length,2);
    assert.equal((await alice.request('/api/chat','POST',{...payload,requestId:randomUUID(),prompt:'Nastavak',model:'deepseek-flash-thinking'})).status,200);
    assert.equal(app.calls[1].messages.length,3);
    assert.equal(app.calls[1].thinking.type,'enabled');
    assert.equal(app.calls[1].temperature,undefined);
    assert.equal(app.calls[1].reasoning_effort,'high');
  });
  await t.test('Neuspešan odgovor može se ponoviti bez dupliranja pitanja', async () => {
    app.setUpstream(async()=>({ok:false,status:402}));
    const payload={conversationId,requestId:randomUUID(),prompt:'Ponovi pitanje',model:'deepseek-flash'};
    assert.equal((await alice.request('/api/chat','POST',payload)).status,502);
    const failed=(await alice.request('/api/conversations/'+conversationId)).data.conversation;
    assert.equal(failed.request.status,'failed');
    assert.equal(failed.messages.length,5);
    app.setUpstream(async()=>({ok:true,json:async()=>({choices:[{message:{content:'Uspešan ponovljeni odgovor'}}]})}));
    assert.equal((await alice.request('/api/chat','POST',payload)).status,200);
    const success=(await alice.request('/api/conversations/'+conversationId)).data.conversation;
    assert.equal(success.messages.length,6);
    assert.equal(success.request,null);
  });
  await t.test('Uvoz je izolovan po korisniku i ne pravi duplikate', async () => {
    const conversation={id:'legacy-1',title:'Stara istorija',model:'deepseek-reasoner',messages:[{role:'user',content:'Staro pitanje'},{role:'assistant',content:'Stari odgovor'}]};
    assert.equal((await alice.request('/api/conversations/import','POST',{conversation})).data.imported,true);
    assert.equal((await alice.request('/api/conversations/import','POST',{conversation})).data.imported,false);
    assert.equal((await bob.request('/api/conversations/import','POST',{conversation})).data.imported,true);
    const invalid={...conversation,id:'invalid',messages:[...conversation.messages,{role:'system',content:'invalid'}]};
    assert.equal((await alice.request('/api/conversations/import','POST',{conversation:invalid})).status,400);
    assert.equal((await alice.request('/api/conversations')).data.conversations.length,2);
    const list=(await bob.request('/api/conversations')).data.conversations;
    assert.equal(list.length,1);
    assert.equal(list[0].model,'deepseek-flash-thinking');
    assert.equal((await bob.request('/api/conversations/'+list[0].id,'DELETE',{})).status,200);
    assert.equal((await app.pool.query('SELECT * FROM messages WHERE conversation_id=$1',[list[0].id])).rowCount,0);
  });
  await t.test('Restart servera zadržava sesiju i istoriju', async () => {
    await app.restart();
    assert.equal((await alice.request('/api/me')).status,200);
    assert.equal((await alice.request('/api/conversations/'+conversationId)).data.conversation.messages.length,6);
  });
  const google=app.client();
  let googleId;
  await t.test('Google provera odbija pogrešan audience, nonce i istek; novi korisnik čeka', async () => {
    for(const extra of [{aud:'other-client'},{nonce:'wrong'},{exp:1},{email_verified:false},{iss:'https://evil.example'}]) {
      assert.equal((await google.google('new-google',extra)).status,401);
    }
    const login=await google.google('new-google');
    assert.equal(login.status,200);
    googleId=login.data.user.id;
    assert.equal(login.data.user.approvalState,'pending');
    assert.equal(login.data.user.hasPassword,false);
    assert.equal((await google.request('/api/me')).status,200);
    assert.equal((await google.request('/api/conversations')).status,403);
    assert.equal((await google.request('/api/conversations/import','POST',{})).status,403);
    assert.equal((await google.request('/api/chat','POST',{})).status,403);
    assert.equal((await google.request('/api/admin/users')).status,403);
    assert.equal((await google.request('/api/google/login','POST',{credential:'invalid'})).status,403);
    assert.equal((await admin.request('/api/admin/users/'+googleId,'PATCH',{approve:true})).status,200);
    assert.equal((await google.google('new-google')).data.user.approvalState,'approved');
    assert.equal((await google.request('/api/conversations','POST',{})).status,201);
  });
  await t.test('Povezivanje zahteva lozinku i čuva identitet/razgovore; nema spajanja po imejlu', async () => {
    assert.equal((await alice.google('alice-google',{},true,'wrong')).status,400);
    const linked=await alice.google('alice-google',{},true,'Changed-password-456');
    assert.equal(linked.status,200);
    assert.equal(linked.data.user.id,aliceId);
    assert.equal(linked.data.user.googleLinked,true);
    assert.equal((await alice.request('/api/conversations/'+conversationId)).status,200);
    assert.equal((await bob.google('alice-google',{},true,'Changed-password-456')).status,409);
    const fresh=app.client();
    assert.equal((await fresh.google('alice-google')).data.user.id,aliceId);
    const sameEmail=app.client();
    const separate=await sameEmail.google('different-sub',{email:'alice-google@gmail.com'});
    assert.equal(separate.status,200);
    assert.notEqual(separate.data.user.id,aliceId);
    assert.equal(separate.data.user.approvalState,'pending');
  });
  await t.test('Isključivanje i reset odmah opozivaju sesije', async () => {
    assert.equal((await admin.request('/api/admin/users/'+googleId,'PATCH',{isActive:false})).status,200);
    assert.equal((await google.request('/api/me')).status,401);
    assert.equal((await google.google('new-google')).status,403);
    assert.equal((await admin.request('/api/admin/users/'+bobId,'PATCH',{password:'Reset-password-789'})).status,200);
    assert.equal((await bob.request('/api/me')).status,401);
    assert.equal((await bob.login('bob','Changed-password-456')).status,401);
    assert.equal((await bob.login('bob','Reset-password-789')).data.user.mustChangePassword,true);
    const adminId=(await admin.request('/api/me')).data.user.id;
    assert.equal((await admin.request('/api/admin/users/'+adminId,'PATCH',{isActive:false})).status,400);
  });
  await t.test('Pokušaji pogađanja lozinke su ograničeni u bazi', async () => {
    const attacker=app.client();
    for(let i=0;i<10;i++) assert.equal((await attacker.login('unknown-user','wrong')).status,401);
    assert.equal((await attacker.login('unknown-user','wrong')).status,429);
  });
});
