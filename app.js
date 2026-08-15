const messagesElement = document.querySelector('#messages');
const welcomeElement = document.querySelector('#welcome');
const form = document.querySelector('#chatForm');
const input = document.querySelector('#promptInput');
const sendButton = document.querySelector('#sendButton');
const modelSelect = document.querySelector('#modelSelect');
const modelName = document.querySelector('#modelName');
const historyElement = document.querySelector('#history');
const sidebar = document.querySelector('#sidebar');
const appShell = document.querySelector('.app-shell');
const sidebarToggle = document.querySelector('#sidebarToggle');
const appMenu = document.querySelector('#appMenu');
const appMenuToggle = document.querySelector('#appMenuToggle');

const STORAGE_KEY = 'al-ai-conversations';
let conversations = loadConversations();
let activeId = conversations[0]?.id || createConversation();
let isSending = false;

function loadConversations() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

function createConversation() {
  const conversation = { id: crypto.randomUUID(), title: 'Novi razgovor', model: modelSelect.value, messages: [] };
  conversations.unshift(conversation);
  saveConversations();
  return conversation.id;
}

function activeConversation() {
  return conversations.find((item) => item.id === activeId);
}

function syncModelControls() {
  const conversation = activeConversation();
  if (conversation?.model) modelSelect.value = conversation.model;
  modelName.textContent = modelSelect.options[modelSelect.selectedIndex].text;
}

function renderHistory() {
  historyElement.replaceChildren();
  conversations.forEach((conversation) => {
    const item = document.createElement('div');
    item.className = `history-entry${conversation.id === activeId ? ' active' : ''}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    button.textContent = conversation.title;
    button.addEventListener('click', () => {
      activeId = conversation.id;
      syncModelControls();
      renderConversation();
      renderHistory();
      sidebar.classList.remove('open');
    });
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.className = 'conversation-action rename-chat';
    renameButton.setAttribute('aria-label', `Promeni naziv razgovora: ${conversation.title}`);
    renameButton.title = 'Promeni naziv razgovora';
    renameButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4M4 20h16"/></svg>';
    renameButton.addEventListener('click', () => renameConversation(conversation.id));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'conversation-action delete-chat';
    deleteButton.setAttribute('aria-label', `Obriši razgovor: ${conversation.title}`);
    deleteButton.title = 'Obriši razgovor';
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16.5 3.5 4 4a2 2 0 0 1 0 2.8l-8.8 8.8a3 3 0 0 1-2.1.9H5.8a2 2 0 0 1-1.4-.6l-.8-.8a2 2 0 0 1 0-2.8L13.7 5.6a2 2 0 0 1 2.8-2.1Z"/><path d="m8 11 5 5M7 20h13"/></svg>';
    deleteButton.addEventListener('click', () => deleteConversation(conversation.id));
    item.append(button, renameButton, deleteButton);
    historyElement.append(item);
  });
}

function renameConversation(id) {
  const conversation = conversations.find((item) => item.id === id);
  if (!conversation) return;
  const newTitle = window.prompt('Uneti novi naziv razgovora:', conversation.title)?.trim();
  if (!newTitle) return;
  conversation.title = newTitle.slice(0, 80);
  saveConversations();
  renderHistory();
}

function deleteConversation(id) {
  const deletingActiveConversation = id === activeId;
  conversations = conversations.filter((conversation) => conversation.id !== id);
  if (!conversations.length) {
    activeId = createConversation();
  } else {
    if (deletingActiveConversation) activeId = conversations[0].id;
    saveConversations();
  }
  renderConversation();
  renderHistory();
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
  messagesElement.replaceChildren();
  const conversation = activeConversation();
  if (!conversation || !conversation.messages.length) {
    messagesElement.append(welcomeElement);
  } else {
    conversation.messages.forEach(({ role, content }) => addMessageElement(role, content));
  }
}

function showTyping() {
  const row = addMessageElement('assistant', '');
  row.querySelector('.bubble').innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  return row;
}

async function sendMessage(text) {
  if (!text.trim() || isSending) return;
  isSending = true;
  sendButton.disabled = true;
  if (!activeConversation()) activeId = createConversation();
  const conversation = activeConversation();
  conversation.model = modelSelect.value;
  if (!conversation.messages.length) conversation.title = text.trim().slice(0, 42);
  conversation.messages.push({ role: 'user', content: text.trim() });
  saveConversations();
  renderConversation();
  renderHistory();
  const typingRow = showTyping();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: conversation.model, messages: conversation.messages })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'DeepSeek servis trenutno nije dostupan.');
    conversation.messages.push({ role: 'assistant', content: data.message });
    document.querySelector('#connectionStatus').textContent = 'Povezan';
  } catch (error) {
    conversation.messages.push({ role: 'assistant', content: `Greška: ${error.message}` });
    document.querySelector('#connectionStatus').textContent = 'Greška pri povezivanju';
  } finally {
    typingRow.remove();
    saveConversations();
    renderConversation();
    isSending = false;
    sendButton.disabled = false;
    input.focus();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value;
  input.value = '';
  input.style.height = 'auto';
  sendMessage(text);
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
});
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => sendMessage(button.dataset.prompt)));
function startNewConversation() {
  activeId = createConversation();
  syncModelControls();
  renderConversation();
  renderHistory();
  sidebar.classList.remove('open');
  input.focus();
}

document.querySelector('#newChatButton').addEventListener('click', startNewConversation);
const homeButton = document.querySelector('#homeButton');
homeButton.addEventListener('click', startNewConversation);
homeButton.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    startNewConversation();
  }
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
  if (window.innerWidth > 820) setAppMenuState(false);
});

sidebarToggle.addEventListener('click', () => setSidebarState(false));
document.querySelector('#menuButton').addEventListener('click', () => {
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  const isOpen = isMobile ? sidebar.classList.contains('open') : !appShell.classList.contains('sidebar-collapsed');
  setSidebarState(!isOpen);
});
modelSelect.addEventListener('change', () => {
  modelName.textContent = modelSelect.options[modelSelect.selectedIndex].text;
  const conversation = activeConversation();
  if (conversation) {
    conversation.model = modelSelect.value;
    saveConversations();
  }
  document.querySelector('#connectionStatus').textContent = `Izabran ${modelSelect.options[modelSelect.selectedIndex].text}`;
});

syncModelControls();
renderConversation();
renderHistory();
