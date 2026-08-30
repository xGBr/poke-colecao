// ==========================================================================
// ColeçãoGBr — painel admin (frontend/js/admin.js)
// Toda chamada usa credentials:'include' para enviar o cookie httpOnly de
// sessão. Não existe nenhuma senha nem chave secreta neste arquivo.
// ==========================================================================

const API_BASE = window.API_BASE || '/api';

const RARITY_OPTIONS = [
  'Normal', 'Foil', 'Reverse Foil', 'Cosmo Holo', 'Pokeball Foil',
  'Master Ball', 'Play Pokemon', 'Play Pokemon Cosmo', 'World Championships', 'Staff',
];

let cards = [];
let leads = [];
let editingId = null;

async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 401) { showGate(); throw new Error('not_authenticated'); }
  return res;
}

// ── AUTENTICAÇÃO ─────────────────────────────────────────────────
async function checkAuth() {
  try {
    const res = await fetch(API_BASE + '/auth/me', { credentials: 'include' });
    if (res.ok) { showShell(); loadAll(); }
    else showGate();
  } catch (e) { showGate(); }
}

function showGate() {
  document.getElementById('adminGate').style.display = '';
  document.getElementById('adminShell').style.display = 'none';
}
function showShell() {
  document.getElementById('adminGate').style.display = 'none';
  document.getElementById('adminShell').style.display = '';
}

async function doLogin() {
  const password = document.getElementById('pwInput').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  if (!password) return;
  try {
    const res = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.message || 'Senha incorreta.';
      errEl.style.display = '';
      return;
    }
    showShell();
    loadAll();
  } catch (e) {
    errEl.textContent = 'Erro de conexão com o servidor.';
    errEl.style.display = '';
  }
}

async function doLogout() {
  await fetch(API_BASE + '/auth/logout', { method: 'POST', credentials: 'include' });
  showGate();
}

// ── CARREGAMENTO ─────────────────────────────────────────────────
async function loadAll() {
  await Promise.all([loadCards(), loadLeads()]);
  renderStats();
  renderTable();
  renderLeads();
}

async function loadCards() {
  const res = await api('/cards');
  cards = await res.json();
}
async function loadLeads() {
  try {
    const res = await api('/contact');
    leads = await res.json();
  } catch (e) { leads = []; }
}

function renderStats() {
  const total = cards.length;
  const espera = cards.filter(c => c.espera).length;
  const foilCount = cards.filter(c => Array.isArray(c.rarities) && c.rarities.some(r => r !== 'Normal')).length;
  document.getElementById('statsRow').innerHTML = `
    <div class="admin-stat"><div class="num">${total}</div><div class="lbl">Cartas procuradas</div></div>
    <div class="admin-stat"><div class="num">${espera}</div><div class="lbl">Em espera</div></div>
    <div class="admin-stat"><div class="num">${foilCount}</div><div class="lbl">Com variante foil</div></div>
    <div class="admin-stat"><div class="num">${leads.length}</div><div class="lbl">Contatos recebidos</div></div>
  `;
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

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
      <td>${c.preco ? esc(c.preco) : '—'}${c.espera ? ' <span class="badge-espera" style="width:auto;display:inline-flex;padding:2px 6px">⏳</span>' : ''}</td>
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

function renderLeads() {
  const wrap = document.getElementById('leadsList');
  if (!leads.length) {
    wrap.innerHTML = `<p style="color:var(--text-faint);font-size:13px">Nenhum contato recebido ainda.</p>`;
    return;
  }
  wrap.innerHTML = leads.slice(0, 30).map(l => `
    <div style="padding:.75rem 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <strong>${esc(l.cardName || ('#' + l.cardId))}</strong>
        <span style="color:var(--text-faint);font-size:11px">${new Date(l.createdAt).toLocaleString('pt-BR')}</span>
      </div>
      <div style="font-size:12.5px;color:var(--text-dim)">
        canal: <strong>${esc(l.channel)}</strong>${l.contact ? ' · contato: ' + esc(l.contact) : ''}
      </div>
      ${l.message ? `<div style="font-size:13px;margin-top:4px">${esc(l.message)}</div>` : ''}
    </div>
  `).join('');
}

// ── FORMULÁRIO DE CARTA (criar/editar) ──────────────────────────
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
  document.getElementById('fName').value = '';
  document.getElementById('fNum').value = '';
  document.getElementById('fCategory').value = 'Principal';
  document.getElementById('fYear').value = '';
  document.getElementById('fSet').value = '';
  document.getElementById('fLiga').value = '';
  document.getElementById('fPreco').value = '';
  document.getElementById('fImg').value = '';
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
  const fd = new FormData();
  fd.append('file', file);
  showToast('⏳ Enviando imagem...');
  try {
    const res = await fetch(API_BASE + '/upload', { method: 'POST', credentials: 'include', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'falha no upload');
    document.getElementById('fImg').value = data.url;
    showToast('✓ Imagem enviada');
  } catch (e) {
    showToast('Erro no upload: ' + e.message);
  }
}

async function lookupPrice() {
  const name = document.getElementById('fName').value.trim();
  const set = document.getElementById('fSet').value.trim();
  const hint = document.getElementById('priceHint');
  if (!name) { hint.textContent = 'Digite o nome da carta primeiro.'; return; }
  hint.textContent = 'Buscando referência de preço...';
  try {
    const res = await api(`/pricing/lookup?name=${encodeURIComponent(name)}&set=${encodeURIComponent(set)}`);
    const data = await res.json();
    if (!data.found) { hint.textContent = data.message || 'Não encontrado.'; return; }
    if (data.brl) document.getElementById('fPreco').value = 'R$ ' + data.brl.toFixed(2).replace('.', ',');
    if (data.year && !document.getElementById('fYear').value) document.getElementById('fYear').value = data.year;
    hint.textContent = `Referência: ${data.name} (USD ${data.usd?.toFixed(2)}) — confirme o preço real na Liga Pokémon antes de publicar.`;
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
    year: document.getElementById('fYear').value || null,
    set: document.getElementById('fSet').value.trim(),
    liga: document.getElementById('fLiga').value.trim() || null,
    preco: document.getElementById('fPreco').value.trim() || null,
    img: document.getElementById('fImg').value.trim() || null,
    espera: document.getElementById('fEspera').checked,
    rarities,
  };

  try {
    if (editingId) await api(`/cards/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api('/cards', { method: 'POST', body: JSON.stringify(payload) });
    closeModal('cardModal');
    showToast('✓ Salvo com sucesso');
    loadAll();
  } catch (e) {
    showToast('Erro ao salvar: ' + e.message);
  }
}

async function markFound(id) {
  if (!confirm('Marcar esta carta como encontrada? Ela será removida da lista pública.')) return;
  await api(`/cards/${id}`, { method: 'DELETE' });
  showToast('🎉 Carta removida da lista!');
  loadAll();
}

async function deleteCard(id) {
  if (!confirm('Excluir esta carta permanentemente?')) return;
  await api(`/cards/${id}`, { method: 'DELETE' });
  showToast('Carta excluída');
  loadAll();
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
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });
  document.getElementById('pwInput').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  checkAuth();
});
