// ==========================================================================
// ColeçãoGBr — painel admin da edição GitHub Pages (docs/js/admin-github.js)
//
// Como funciona a autenticação aqui:
//   Não existe senha nem servidor. Quem administra cola o próprio Personal
//   Access Token do GitHub (fine-grained, com permissão de leitura/escrita
//   SÓ neste repositório). O token fica em sessionStorage — some quando a
//   aba fecha, nunca é salvo no código-fonte nem em lugar nenhum do site.
//   Toda escrita vira um commit direto no repositório via API do GitHub.
// ==========================================================================

const CARDS_PATH = 'docs/data/cards.json';
const UPLOADS_PATH = 'docs/uploads';
const RARITY_OPTIONS = [
  'Normal', 'Foil', 'Reverse Foil', 'Cosmo Holo', 'Pokeball Foil',
  'Master Ball', 'Play Pokemon', 'Play Pokemon Cosmo', 'World Championships', 'Staff',
];

let settings = { owner: '', repo: '', branch: 'main', token: '' };
let cards = [];
let cardsSha = null;
let editingId = null;

// ── BASE64 SEGURO PARA UTF-8 / BINÁRIO ──────────────────────────
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function b64ToUtf8(b64) {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// ── CLIENTE DA API DO GITHUB ─────────────────────────────────────
async function gh(path, opts = {}) {
  const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${settings.token}`,
      'Accept': 'application/vnd.github+json',
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Token inválido, expirado ou sem permissão nesse repositório.');
  }
  return res;
}

async function ghGetFile(path) {
  const res = await gh(`contents/${path}?ref=${settings.branch}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao ler ' + path + ' (' + res.status + ')');
  return res.json(); // { content (base64), sha, ... }
}

async function ghPutFile(path, base64Content, message, sha) {
  const body = { message, content: base64Content, branch: settings.branch };
  if (sha) body.sha = sha;
  const res = await gh(`contents/${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 409) throw new Error('Conflito de versão — recarregue a página e tente de novo.');
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || 'Falha ao salvar ' + path); }
  return res.json();
}

// ── CONEXÃO / SESSÃO ─────────────────────────────────────────────
function loadSettingsFromStorage() {
  settings.owner = localStorage.getItem('cgbr_gh_owner') || '';
  settings.repo = localStorage.getItem('cgbr_gh_repo') || '';
  settings.branch = localStorage.getItem('cgbr_gh_branch') || 'main';
  settings.token = sessionStorage.getItem('cgbr_gh_token') || '';
}

async function connect() {
  settings.owner = document.getElementById('ghOwner').value.trim();
  settings.repo = document.getElementById('ghRepo').value.trim();
  settings.branch = document.getElementById('ghBranch').value.trim() || 'main';
  settings.token = document.getElementById('ghToken').value.trim();

  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (!settings.owner || !settings.repo || !settings.token) {
    errEl.textContent = 'Preencha usuário/organização, repositório e token.';
    errEl.style.display = '';
    return;
  }

  try {
    await loadCards(); // também serve como "teste de conexão"
    localStorage.setItem('cgbr_gh_owner', settings.owner);
    localStorage.setItem('cgbr_gh_repo', settings.repo);
    localStorage.setItem('cgbr_gh_branch', settings.branch);
    sessionStorage.setItem('cgbr_gh_token', settings.token); // só nesta sessão da aba
    showShell();
    renderAll();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = '';
  }
}

function disconnect() {
  sessionStorage.removeItem('cgbr_gh_token');
  settings.token = '';
  showGate();
}

function showGate() {
  document.getElementById('adminGate').style.display = '';
  document.getElementById('adminShell').style.display = 'none';
  document.getElementById('ghOwner').value = settings.owner;
  document.getElementById('ghRepo').value = settings.repo;
  document.getElementById('ghBranch').value = settings.branch;
}
function showShell() {
  document.getElementById('adminGate').style.display = 'none';
  document.getElementById('adminShell').style.display = '';
}

// ── DADOS ─────────────────────────────────────────────────────────
async function loadCards() {
  const file = await ghGetFile(CARDS_PATH);
  if (!file) { cards = []; cardsSha = null; return; }
  cards = JSON.parse(b64ToUtf8(file.content) || '[]');
  cardsSha = file.sha;
}

async function persistCards(message) {
  const base64 = utf8ToB64(JSON.stringify(cards, null, 2));
  const result = await ghPutFile(CARDS_PATH, base64, message, cardsSha);
  cardsSha = result.content.sha;
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function renderAll() { renderStats(); renderTable(); }

function renderStats() {
  const total = cards.length;
  const espera = cards.filter(c => c.espera).length;
  const foilCount = cards.filter(c => Array.isArray(c.rarities) && c.rarities.some(r => r !== 'Normal')).length;
  document.getElementById('statsRow').innerHTML = `
    <div class="admin-stat"><div class="num">${total}</div><div class="lbl">Cartas procuradas</div></div>
    <div class="admin-stat"><div class="num">${espera}</div><div class="lbl">Em espera</div></div>
    <div class="admin-stat"><div class="num">${foilCount}</div><div class="lbl">Com variante foil</div></div>
  `;
}

function renderTable() {
  const tbody = document.getElementById('cardsTableBody');
  if (!cards.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-faint);padding:2rem">Nenhuma carta cadastrada. Clique em "+ Nova carta".</td></tr>`;
    return;
  }
  tbody.innerHTML = [...cards].sort((a, b) => (a.year || 0) - (b.year || 0)).map(c => `
    <tr>
      <td>${c.img ? `<img src="${c.img}" alt="">` : '🎴'}</td>
      <td><strong>${esc(c.name)}</strong><br><span style="color:var(--text-faint);font-size:11px">${esc(c.num || '')}</span></td>
      <td>${esc(c.category || 'Principal')}</td>
      <td>${c.year || '—'}</td>
      <td>${(c.rarities || []).join(', ') || '—'}</td>
      <td>${c.preco ? esc(c.preco) : '—'}</td>
      <td>
        <div class="card-actions">
          <button class="btn-edit" onclick="openEditCard(${c.id})" title="Editar">✎</button>
          <button class="btn-found" onclick="markFound(${c.id})" title="Marcar como encontrada">Achei!</button>
          <button class="btn-delete" onclick="deleteCard(${c.id})" title="Excluir">✕</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ── FORMULÁRIO ────────────────────────────────────────────────────
function buildRarityChecks(selected = []) {
  return RARITY_OPTIONS.map(r => {
    const id = 'rar-' + r.replace(/\s/g, '-');
    const checked = selected.includes(r) ? 'checked' : '';
    return `<label class="rarity-check-item ${checked ? 'checked' : ''}" for="${id}">
      <input type="checkbox" id="${id}" value="${r}" ${checked} onchange="this.closest('.rarity-check-item').classList.toggle('checked', this.checked)">
      <span class="r-box">✓</span>${r}
    </label>`;
  }).join('');
}

function openAddCard() {
  editingId = null;
  document.getElementById('formTitle').textContent = 'Cadastrar carta';
  ['fName','fNum','fSet','fLiga','fPreco','fImg','fYear'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fCategory').value = 'Principal';
  document.getElementById('fEspera').checked = false;
  document.getElementById('rarityChecks').innerHTML = buildRarityChecks([]);
  document.getElementById('priceHint').textContent = '';
  openModal('cardModal');
}

function openEditCard(id) {
  const c = cards.find(x => x.id === id);
  if (!c) return;
  editingId = id;
  document.getElementById('formTitle').textContent = 'Editar carta';
  document.getElementById('fName').value = c.name || '';
  document.getElementById('fNum').value = c.num || '';
  document.getElementById('fCategory').value = c.category || 'Principal';
  document.getElementById('fYear').value = c.year || '';
  document.getElementById('fSet').value = c.set || '';
  document.getElementById('fLiga').value = c.liga || '';
  document.getElementById('fPreco').value = c.preco || '';
  document.getElementById('fImg').value = c.img || '';
  document.getElementById('fEspera').checked = !!c.espera;
  document.getElementById('rarityChecks').innerHTML = buildRarityChecks(c.rarities || []);
  document.getElementById('priceHint').textContent = '';
  openModal('cardModal');
}

async function uploadImageFile(input) {
  const file = input.files[0];
  if (!file) return;
  showToast('⏳ Enviando imagem (vira um commit no repositório)...');
  try {
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const filename = `${Date.now()}.${ext}`;
    const path = `${UPLOADS_PATH}/${filename}`;
    await ghPutFile(path, base64, `Adiciona imagem: ${filename}`, null);
    // caminho relativo à raiz do site publicado (docs/ vira a raiz do Pages)
    document.getElementById('fImg').value = `./uploads/${filename}`;
    showToast('✓ Imagem enviada — pode levar até 1 min para aparecer no site público.');
  } catch (e) {
    showToast('Erro no upload: ' + e.message);
  }
}

// Busca de preço: chamada direto do navegador do admin (sem segredo
// nenhum envolvido aqui, então não precisa de backend/proxy).
async function lookupPrice() {
  const name = document.getElementById('fName').value.trim();
  const hint = document.getElementById('priceHint');
  if (!name) { hint.textContent = 'Digite o nome da carta primeiro.'; return; }
  hint.textContent = 'Buscando referência de preço...';
  try {
    const r = await fetch('https://api.pokemontcg.io/v2/cards?q=' + encodeURIComponent(`name:"${name}"`) + '&pageSize=1');
    const j = await r.json();
    if (!j.data || !j.data.length) { hint.textContent = 'Carta não encontrada — tente o nome em inglês.'; return; }
    const card = j.data[0];
    const prices = card.tcgplayer && card.tcgplayer.prices ? Object.values(card.tcgplayer.prices) : [];
    const usd = prices.length ? (prices[0].market || prices[0].low) : null;
    if (usd) {
      const fx = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL').then(r => r.json()).catch(() => null);
      const rate = fx ? parseFloat(fx.USDBRL.bid) : null;
      if (rate) document.getElementById('fPreco').value = 'R$ ' + (usd * rate).toFixed(2).replace('.', ',');
    }
    if (card.set && card.set.releaseDate && !document.getElementById('fYear').value) {
      document.getElementById('fYear').value = parseInt(card.set.releaseDate.slice(0, 4), 10);
    }
    hint.textContent = `Referência: ${card.name} — ${card.set ? card.set.name : ''} (confirme o valor real na Liga Pokémon).`;
  } catch (e) {
    hint.textContent = 'Erro na busca: ' + e.message;
  }
}

async function saveCardForm() {
  const name = document.getElementById('fName').value.trim();
  if (!name) { document.getElementById('fName').focus(); return; }
  const rarities = [...document.querySelectorAll('#rarityChecks input:checked')].map(i => i.value);
  const payload = {
    name,
    num: document.getElementById('fNum').value.trim(),
    category: document.getElementById('fCategory').value,
    year: document.getElementById('fYear').value ? parseInt(document.getElementById('fYear').value, 10) : null,
    set: document.getElementById('fSet').value.trim(),
    liga: document.getElementById('fLiga').value.trim() || null,
    preco: document.getElementById('fPreco').value.trim() || null,
    img: document.getElementById('fImg').value.trim() || null,
    espera: document.getElementById('fEspera').checked,
    rarities,
  };

  try {
    if (editingId) {
      const idx = cards.findIndex(c => c.id === editingId);
      cards[idx] = { ...cards[idx], ...payload };
      await persistCards(`Edita carta: ${name}`);
    } else {
      payload.id = Date.now();
      cards.push(payload);
      await persistCards(`Adiciona carta: ${name}`);
    }
    closeModal('cardModal');
    showToast('✓ Commit feito — pode levar até 1 min para publicar.');
    renderAll();
  } catch (e) {
    showToast('Erro ao salvar: ' + e.message);
  }
}

async function markFound(id) {
  const card = cards.find(c => c.id === id);
  if (!card || !confirm(`Marcar "${card.name}" como encontrada? Ela sai da lista pública.`)) return;
  cards = cards.filter(c => c.id !== id);
  try {
    await persistCards(`Remove carta encontrada: ${card.name}`);
    showToast('🎉 Carta removida da lista!');
    renderAll();
  } catch (e) { showToast('Erro: ' + e.message); }
}

async function deleteCard(id) {
  const card = cards.find(c => c.id === id);
  if (!card || !confirm(`Excluir "${card.name}" permanentemente?`)) return;
  cards = cards.filter(c => c.id !== id);
  try {
    await persistCards(`Exclui carta: ${card.name}`);
    showToast('Carta excluída');
    renderAll();
  } catch (e) { showToast('Erro: ' + e.message); }
}

// ── HELPERS ───────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettingsFromStorage();
  document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));

  if (settings.owner && settings.repo && settings.token) {
    loadCards().then(() => { showShell(); renderAll(); }).catch(() => showGate());
  } else {
    showGate();
  }
});
