const $ = (selector) => document.querySelector(selector);
const messagesElement = $('#messages');
const welcomeElement = $('#welcome');
const form = $('#chatForm');
const input = $('#promptInput');
const sendButton = $('#sendButton');
const modelSelect = $('#modelSelect');
const modelName = $('#modelName');
const historyElement = $('#history');
const sidebar = $('#sidebar');
const appShell = $('.app-shell');
const sidebarToggle = $('#sidebarToggle');
const appMenu = $('#appMenu');
const appMenuToggle = $('#appMenuToggle');
const STORAGE_KEY = 'al-ai-conversations';
let conversations = [];
let activeId = null;
let current = null;
let currentUser = null;
let csrfToken = '';
let isSending = false;
let hasMore = false;
let epoch = 0;
let pollTimer;
let retryRequest = null;
let googleClientId = '';
let googleReady;
let googleVersion = 0;

function notice(message = '') { $('#appNotice').textContent = message; }
function setBusy(busy) {
  isSending = busy;
  document.querySelectorAll('[data-busy], .suggestion').forEach((element) => { element.disabled = busy; });
}
function signedOut(message = '') {
  epoch++;
  clearTimeout(pollTimer);
  currentUser = null;
  csrfToken = '';
  conversations = [];
  activeId = null;
  current = null;
  retryRequest = null;
  $('#retryButton').hidden = true;
  messagesElement.replaceChildren();
  historyElement.replaceChildren();
  input.value = '';
  notice('');
  $('#adminUsers').replaceChildren();
  $('#adminForm').reset();
  $('#passwordForm').reset();
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  appShell.hidden = true;
  $('#loginPanel').hidden = false;
  $('#pendingPanel').hidden = true;
  $('#googleLinkForm').reset();
  $('#googleLinkButton').replaceChildren();
  if (googleClientId) prepareGoogle().catch(() => {});
  $('#loginError').textContent = message;
  setBusy(false);
}
async function api(url, method = 'GET', body) {
  const response = await fetch(url, {
    method, credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && url !== '/api/login' && url !== '/api/google/login') signedOut(currentUser ? data.error : '');
    throw new Error(data.error || 'Zahtev nije uspeo.');
  }
  return data;
}
async function action(work) {
  if (isSending) return;
  setBusy(true);
  try { await work(); }
  catch (error) { notice(error.message); }
  finally { setBusy(false); }
}
function syncModelControls() {
  if (current) modelSelect.value = current.model;
  modelName.textContent = modelSelect.options[modelSelect.selectedIndex].text;
}
function renderHistory() {
  historyElement.replaceChildren();
  for (const conversation of conversations) {
    const entry = document.createElement('div');
    entry.className = 'history-entry' + (conversation.id === activeId ? ' active' : '');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'history-item';
    open.textContent = conversation.title;
    open.addEventListener('click', () => action(() => selectConversation(conversation.id)));
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'conversation-action rename-chat';
    rename.textContent = '✎';
    rename.setAttribute('aria-label', 'Promeni naziv: ' + conversation.title);
    rename.addEventListener('click', () => action(async () => {
      const title = window.prompt('Uneti novi naziv razgovora:', conversation.title)?.trim();
      if (!title) return;
      await api('/api/conversations/' + conversation.id, 'PATCH', { title });
      conversation.title = title;
      if (current?.id === conversation.id) current.title = title;
      renderHistory();
    }));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'conversation-action delete-chat';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Obriši razgovor: ' + conversation.title);
    remove.addEventListener('click', () => action(async () => {
      if (!window.confirm('Obrisati razgovor „' + conversation.title + '” iz naloga?')) return;
      await api('/api/conversations/' + conversation.id, 'DELETE', {});
      await refreshList();
      if (activeId === conversation.id) {
        if (conversations.length) await selectConversation(conversations[0].id);
        else { activeId = null; current = null; renderConversation(); }
      }
      renderHistory();
    }));
    entry.append(open, rename, remove);
    historyElement.append(entry);
  }
  $('#moreHistory').hidden = !hasMore;
}
async function refreshList(more = false) {
  const result = await api('/api/conversations?offset=' + (more ? conversations.length : 0));
  const combined = more ? [...conversations, ...result.conversations] : result.conversations;
  conversations = [...new Map(combined.map((item) => [item.id, item])).values()];
  hasMore = result.hasMore;
  renderHistory();
}
async function selectConversation(id) {
  clearTimeout(pollTimer);
  const version = epoch;
  const result = await api('/api/conversations/' + id);
  if (version !== epoch) return;
  activeId = id;
  current = result.conversation;
  notice('');
  syncModelControls();
  renderConversation();
  renderHistory();
  sidebar.classList.remove('open');
}
async function refreshCurrent() {
  if (!activeId) return;
  const id = activeId;
  const version = epoch;
  const result = await api('/api/conversations/' + id);
  if (version !== epoch || activeId !== id) return;
  current = result.conversation;
  renderConversation();
}
function addMessageElement(role, content) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (role === 'assistant') renderAssistantContent(bubble, content);
  else bubble.textContent = content;
  if (role === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'AL AI';
    row.append(avatar);
  }
  row.append(bubble);
  messagesElement.append(row);
  messagesElement.scrollTop = messagesElement.scrollHeight;
  return row;
}

function appendInlineFormatting(element, text) {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let position = 0;
  for (const match of text.matchAll(pattern)) {
    element.append(document.createTextNode(text.slice(position, match.index)));
    const token = match[0];
    const formatted = document.createElement(token.startsWith('**') ? 'strong' : 'code');
    formatted.textContent = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1);
    element.append(formatted);
    position = match.index + token.length;
  }
  element.append(document.createTextNode(text.slice(position)));
}

function renderAssistantContent(container, content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let codeBlock = null;
  let list = null;

  lines.forEach((line) => {
    if (line.trim().startsWith('```')) {
      if (codeBlock) {
        container.append(codeBlock);
        codeBlock = null;
      } else {
        codeBlock = document.createElement('pre');
      }
      list = null;
      return;
    }
    if (codeBlock) {
      const codeLine = document.createElement('code');
      codeLine.textContent = `${line}\n`;
      codeBlock.append(codeLine);
      return;
    }
    if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) {
      container.append(document.createElement('hr'));
      list = null;
      return;
    }
    const headingMatch = line.match(/^\s*#{1,6}\s+(.+)$/);
    if (headingMatch) {
      const heading = document.createElement('h3');
      appendInlineFormatting(heading, headingMatch[1]);
      container.append(heading);
      list = null;
      return;
    }
    const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (listMatch) {
      if (!list) {
        list = document.createElement('ul');
        container.append(list);
      }
      const item = document.createElement('li');
      appendInlineFormatting(item, listMatch[1]);
      list.append(item);
      return;
    }
    list = null;
    if (!line.trim()) {
      container.append(document.createElement('br'));
      return;
    }
    const paragraph = document.createElement('p');
    appendInlineFormatting(paragraph, line);
    container.append(paragraph);
  });

  if (codeBlock) container.append(codeBlock);
}


function renderConversation() {
  clearTimeout(pollTimer);
  messagesElement.replaceChildren();
  if (!current?.messages.length) messagesElement.append(welcomeElement);
  else current.messages.forEach(({ role, content }) => addMessageElement(role, content));
  retryRequest = current?.request || null;
  $('#retryButton').hidden = !retryRequest || retryRequest.status !== 'failed';
  if (retryRequest?.status === 'pending') {
    notice('Odgovor je u pripremi…');
    pollTimer = setTimeout(() => refreshCurrent().then(() => {
      if (!current?.request) notice('Odgovor je sačuvan.');
    }).catch((error) => notice(error.message)), 3000);
  }
}
async function startNewConversation() {
  await action(async () => {
    const result = await api('/api/conversations', 'POST', { model: modelSelect.value });
    current = result.conversation;
    activeId = current.id;
    await refreshList();
    syncModelControls();
    renderConversation();
    notice('');
    sidebar.classList.remove('open');
    input.focus();
  });
}
async function sendMessage(value, retry = null) {
  const prompt = value.trim();
  if (!prompt || isSending || !currentUser) return;
  const version = epoch;
  setBusy(true);
  notice('Odgovor je u pripremi…');
  let attempt;
  try {
    if (!current) {
      const result = await api('/api/conversations', 'POST', { model: modelSelect.value });
      current = result.conversation;
      activeId = current.id;
    }
    attempt = { conversationId: current.id, requestId: retry?.id || crypto.randomUUID(),
      prompt, model: retry?.model || modelSelect.value };
    clearTimeout(pollTimer);
    await api('/api/chat', 'POST', attempt);
    if (version !== epoch) return;
    input.value = '';
    input.style.height = 'auto';
    await refreshList();
    await refreshCurrent();
    notice('Razgovor je sačuvan.');
  } catch (error) {
    if (version !== epoch) return;
    notice(error.message);
    if (attempt) {
      try { await refreshCurrent(); } catch { /* Zadržati mogućnost ponavljanja posle prekida veze. */ }
      if (current && !current.request) {
        retryRequest = { id: attempt.requestId, prompt, model: attempt.model, status: 'failed' };
        $('#retryButton').hidden = false;
      }
    }
  } finally {
    setBusy(false);
    if (currentUser) input.focus();
  }
}
function localConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}
async function importHistory() {
  await action(async () => {
    const saved = localConversations();
    if (!saved.length) { notice('Nema lokalnih razgovora za uvoz.'); return; }
    if (!window.confirm('Uvesti ' + saved.length + ' lokalnih razgovora u nalog ' + currentUser.username + '? Uvezite samo svoju istoriju. Lokalni original ostaje sačuvan.')) return;
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    for (let index = 0; index < saved.length; index++) {
      if (!currentUser) break;
      notice('Uvoz razgovora ' + (index + 1) + ' od ' + saved.length + '…');
      try {
        const result = await api('/api/conversations/import', 'POST', { conversation: saved[index] });
        if (result.imported) imported++; else skipped++;
      } catch { failed++; }
    }
    if (!currentUser) return;
    await refreshList();
    notice('Uvezeno: ' + imported + '. Već uvezeno: ' + skipped + '. Neuspešno: ' + failed + '. Lokalni original je sačuvan.');
    if (!current && conversations.length) {
      const summary = $('#appNotice').textContent;
      await selectConversation(conversations[0].id);
      notice(summary);
    }
  });
}
async function enterApp(result) {
  epoch++;
  current = null;
  activeId = null;
  conversations = [];
  clearTimeout(pollTimer);
  currentUser = result.user;
  csrfToken = result.csrfToken;
  $('#loginPanel').hidden = true;
  $('#pendingPanel').hidden = result.user.approvalState !== 'pending';
  appShell.hidden = result.user.approvalState !== 'approved';
  $('#passwordButton').hidden = !result.user.hasPassword;
  $('#googleLinkOpen').hidden = !googleClientId || result.user.googleLinked || !result.user.hasPassword;
  $('#googleLinked').hidden = !result.user.googleLinked;
  if (result.user.approvalState === 'pending') return;
  $('#accountName').textContent = currentUser.displayName + ' (' + currentUser.username + ')';
  $('#adminButton').hidden = !currentUser.isAdmin;
  $('#importButton').hidden = localConversations().length === 0;
  if (currentUser.mustChangePassword) {
    $('#passwordHelp').textContent = 'Pre prvog razgovora promenite početnu lozinku.';
    $('#passwordClose').hidden = true;
    $('#passwordDialog').showModal();
    return;
  }
  await refreshList();
  if (conversations.length) await selectConversation(conversations[0].id);
  else renderConversation();
}
$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#loginSubmit');
  button.disabled = true;
  $('#loginError').textContent = '';
  try {
    const result = await api('/api/login', 'POST', { username: $('#loginUsername').value, password: $('#loginPassword').value });
    $('#loginPassword').value = '';
    await enterApp(result);
  } catch (error) {
    $('#loginError').textContent = error.message;
    if (currentUser) notice(error.message);
  } finally { button.disabled = false; }
});
$('#logoutButton').addEventListener('click', () => action(async () => {
  await api('/api/logout', 'POST', {});
  signedOut('Odjavljeni ste.');
}));
$('#passwordButton').addEventListener('click', () => {
  $('#passwordHelp').textContent = 'Posle promene lozinke prijavite se ponovo na svim uređajima.';
  $('#passwordClose').hidden = false;
  $('#passwordDialog').showModal();
});
$('#passwordClose').addEventListener('click', () => $('#passwordDialog').close());
$('#passwordDialog').addEventListener('cancel', (event) => { if (currentUser?.mustChangePassword) event.preventDefault(); });
$('#passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#passwordSubmit');
  button.disabled = true;
  $('#passwordError').textContent = '';
  try {
    if ($('#newPassword').value !== $('#confirmPassword').value) throw new Error('Nove lozinke se ne poklapaju.');
    await api('/api/password', 'POST', { currentPassword: $('#currentPassword').value, password: $('#newPassword').value });
    signedOut('Lozinka je promenjena. Prijavite se novom lozinkom.');
  } catch (error) { $('#passwordError').textContent = error.message; }
  finally { button.disabled = false; }
});
async function loadUsers() {
  const result = await api('/api/admin/users');
  $('#adminUsers').replaceChildren();
  for (const user of result.users) {
    const row = document.createElement('div');
    row.className = 'account-row';
    const label = document.createElement('span');
    label.textContent = user.displayName + ' · ' + user.username + (user.isAdmin ? ' · Administrator' : !user.isActive ? ' · Isključen' : user.approvalState === 'pending' ? ' · Čeka odobrenje' : ' · Aktivan');
    if (user.googleEmail) label.textContent += ' · Google: ' + user.googleEmail;
    row.append(label);
    if (!user.isAdmin) {
      if (user.approvalState === 'pending') {
        const approve = document.createElement('button');
        approve.type = 'button';
        approve.textContent = 'Odobri korisnika';
        approve.addEventListener('click', async () => {
          approve.disabled = true;
          try { await api('/api/admin/users/' + user.id, 'PATCH', { approve: true }); await loadUsers(); }
          catch (error) { $('#adminNotice').textContent = error.message; approve.disabled = false; }
        });
        row.append(approve);
      }
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = user.isActive ? 'Isključi pristup' : 'Uključi pristup';
      toggle.addEventListener('click', async () => {
        toggle.disabled = true;
        try {
          await api('/api/admin/users/' + user.id, 'PATCH', { isActive: !user.isActive });
          await loadUsers();
        } catch (error) { $('#adminNotice').textContent = error.message; toggle.disabled = false; }
      });
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = 'Nova lozinka';
      reset.addEventListener('click', () => {
        $('#resetUserId').value = user.id;
        $('#resetLabel').textContent = 'Nova početna lozinka za ' + user.username;
        $('#resetForm').hidden = false;
        $('#resetPassword').value = '';
        $('#resetPassword').focus();
      });
      row.append(toggle);
      if (user.hasPassword) row.append(reset);
    }
    $('#adminUsers').append(row);
  }
}
$('#adminButton').addEventListener('click', () => action(async () => {
  await loadUsers();
  $('#adminDialog').showModal();
}));
$('#adminClose').addEventListener('click', () => $('#adminDialog').close());
$('#adminForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#createUserButton').disabled = true;
  try {
    await api('/api/admin/users', 'POST', {
      username: $('#newUsername').value, displayName: $('#newDisplayName').value, password: $('#initialPassword').value
    });
    $('#adminForm').reset();
    $('#adminNotice').textContent = 'Nalog je kreiran. Korisniku dostavite ime i početnu lozinku; pri prvoj prijavi mora je promeniti.';
    await loadUsers();
  } catch (error) { $('#adminNotice').textContent = error.message; }
  finally { $('#createUserButton').disabled = false; }
});
$('#resetForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#resetSubmit').disabled = true;
  try {
    await api('/api/admin/users/' + $('#resetUserId').value, 'PATCH', { password: $('#resetPassword').value });
    $('#resetForm').reset();
    $('#resetForm').hidden = true;
    $('#adminNotice').textContent = 'Početna lozinka je postavljena. Postojeće sesije korisnika su odjavljene.';
  } catch (error) { $('#adminNotice').textContent = error.message; }
  finally { $('#resetSubmit').disabled = false; }
});
$('#resetCancel').addEventListener('click', () => { $('#resetForm').reset(); $('#resetForm').hidden = true; });
$('#importButton').addEventListener('click', importHistory);
$('#moreHistory').addEventListener('click', () => action(() => refreshList(true)));
$('#retryButton').addEventListener('click', () => { if (retryRequest) sendMessage(retryRequest.prompt, retryRequest); });
form.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(input.value); });
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; });
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => sendMessage(button.dataset.prompt)));
$('#newChatButton').addEventListener('click', startNewConversation);
$('#homeButton').addEventListener('click', startNewConversation);
$('#homeButton').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); startNewConversation(); }
});
function setSidebarState(open) {
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  if (isMobile) {
    sidebar.classList.toggle('open', open);
  } else {
    appShell.classList.toggle('sidebar-collapsed', !open);
  }
  sidebarToggle.setAttribute('aria-expanded', String(open));
  sidebarToggle.setAttribute('aria-label', open ? 'Sklopi bočni panel' : 'Otvori bočni panel');
}

function setAppMenuState(open) {
  appMenu.classList.toggle('open', open);
  appMenuToggle.setAttribute('aria-expanded', String(open));
  appMenuToggle.setAttribute('aria-label', open ? 'Zatvori meni aplikacija' : 'Otvori meni aplikacija');
}

appMenuToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  setAppMenuState(!appMenu.classList.contains('open'));
});
appMenu.addEventListener('click', (event) => event.stopPropagation());
document.addEventListener('click', () => setAppMenuState(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setAppMenuState(false);
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 700) setAppMenuState(false);
});

sidebarToggle.addEventListener('click', () => setSidebarState(false));
document.querySelector('#menuButton').addEventListener('click', () => {
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  const isOpen = isMobile ? sidebar.classList.contains('open') : !appShell.classList.contains('sidebar-collapsed');
  setSidebarState(!isOpen);
});

modelSelect.addEventListener('change', () => action(async () => {
  try {
    if (current) {
      await api('/api/conversations/' + current.id, 'PATCH', { model: modelSelect.value });
      current.model = modelSelect.value;
    }
  } finally { syncModelControls(); }
}));
syncModelControls();

async function loadGoogleScript() {
  if (window.google?.accounts?.id) return;
  if (!googleReady) googleReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => { googleReady = null; reject(new Error('Google prijava nije učitana. Možete se prijaviti lozinkom.')); };
    document.head.append(script);
  });
  await googleReady;
}
async function prepareGoogle(link = false, password) {
  if (!googleClientId) return;
  const version = ++googleVersion;
  const target = link ? $('#googleLinkButton') : $('#googleButton');
  const status = link ? $('#googleLinkNotice') : $('#googleNotice');
  status.textContent = 'Priprema Google prijave…';
  target.replaceChildren();
  try {
    await loadGoogleScript();
    const challenge = await api('/api/google/challenge', 'POST', { link, ...(link ? { password } : {}) });
    if (version !== googleVersion) return;
    google.accounts.id.initialize({
      client_id: googleClientId,
      nonce: challenge.nonce,
      auto_select: false,
      callback: async ({ credential }) => {
        status.textContent = 'Provera Google prijave…';
        try {
          const result = await api('/api/google/login', 'POST', { credential });
          if ($('#googleLinkDialog').open) $('#googleLinkDialog').close();
          $('#googleLinkForm').reset();
          await enterApp(result);
          if (link) notice('Google nalog je povezan. Razgovori su ostali u istom nalogu.');
        } catch (error) { status.textContent = error.message + ' Ponovo pripremite Google dugme.'; }
      }
    });
    google.accounts.id.renderButton(target, { theme: 'outline', size: 'large', type: 'standard', text: link ? 'continue_with' : 'signin_with', width: 260 });
    status.textContent = '';
  } catch (error) { status.textContent = error.message; }
}
$('#googleRefresh').addEventListener('click', () => prepareGoogle());
$('#pendingRefresh').addEventListener('click', async () => {
  try { await enterApp(await api('/api/me')); }
  catch (error) { $('#loginError').textContent = error.message; }
});
$('#pendingLogout').addEventListener('click', () => action(async () => { await api('/api/logout', 'POST', {}); signedOut(); }));
$('#passwordLogout').addEventListener('click', () => action(async () => { await api('/api/logout', 'POST', {}); signedOut(); }));
$('#googleLinkOpen').addEventListener('click', () => {
  $('#googleLinkNotice').textContent = '';
  $('#googleLinkButton').replaceChildren();
  $('#googleLinkDialog').showModal();
});
$('#googleLinkClose').addEventListener('click', () => { $('#googleLinkDialog').close(); $('#googleLinkForm').reset(); });
$('#googleLinkForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#googleLinkSubmit').disabled = true;
  try { await prepareGoogle(true, $('#googleLinkPassword').value); }
  finally { $('#googleLinkPassword').value = ''; $('#googleLinkSubmit').disabled = false; }
});
(async () => {
  try {
    const config = await api('/api/config');
    googleClientId = config.googleClientId;
    $('#googleSection').hidden = !googleClientId;
    try { await enterApp(await api('/api/me')); }
    catch (error) { if (currentUser) notice(error.message); }
    if (!currentUser && googleClientId && googleVersion === 0) await prepareGoogle();
  } catch { $('#loginError').textContent = 'Server nije dostupan. Osvežite stranicu i pokušajte ponovo.'; }
})();
