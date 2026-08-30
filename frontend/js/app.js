// ==========================================================================
// ColeçãoGBr — site público (frontend/js/app.js)
// Este arquivo NÃO contém nenhuma lógica de admin, senha ou chave de escrita.
// Toda operação que altera dados acontece no backend, autenticada.
// ==========================================================================

const API_BASE = window.API_BASE || '/api';
const WHATSAPP_NUMBER = '5519981061966'; // troque pelo seu número

const FOIL_RARITIES = new Set([
  'Foil', 'Reverse Foil', 'Cosmo Holo', 'Master Ball', 'Play Pokemon Cosmo'
]);

// Dados de exemplo — usados só se o backend ainda não estiver rodando,
// para que este arquivo sempre possa ser aberto e visualizado sozinho.
const SAMPLE_CARDS = [
  { id: 1, name: 'Aerodactyl', num: '1/62', category: 'Principal', year: 1999, set: 'Fossil', rarities: ['Normal'], img: 'https://images.pokemontcg.io/base3/1.png', preco: 'R$ 45,00', liga: null, espera: false },
  { id: 2, name: 'Alakazam', num: '1/130', category: 'Principal', year: 2000, set: 'Base Set 2', rarities: ['Foil'], img: 'https://images.pokemontcg.io/base4/1.png', preco: 'R$ 210,00', liga: null, espera: false },
  { id: 3, name: "Blaine's Moltres", num: '1/132', category: 'Principal', year: 2000, set: 'Gym Heroes', rarities: ['Reverse Foil'], img: 'https://images.pokemontcg.io/gym1/1.png', preco: 'R$ 380,00', liga: null, espera: true },
  { id: 4, name: 'Beedrill δ', num: '1/113', category: 'Delta Species', year: 2005, set: 'Delta Species', rarities: ['Foil','Reverse Foil'], img: 'https://images.pokemontcg.io/ex11/1.png', preco: 'R$ 95,00', liga: null, espera: false },
  { id: 5, name: 'Aggron', num: '1/102', category: 'Principal', year: 2010, set: 'HS—Triumphant', rarities: ['Normal'], img: 'https://images.pokemontcg.io/hgss4/1.png', preco: 'R$ 38,00', liga: null, espera: false },
  { id: 6, name: 'Celebi & Venusaur-GX', num: '1/181', category: 'Cartas da Cintia', year: 2019, set: 'Team Up', rarities: ['Master Ball'], img: 'https://images.pokemontcg.io/sm9/1.png', preco: 'R$ 260,00', liga: null, espera: false },
  { id: 7, name: 'Venusaur V', num: '1/73', category: 'Principal', year: 2020, set: "Champion's Path", rarities: ['Cosmo Holo'], img: 'https://images.pokemontcg.io/swsh35/1.png', preco: 'R$ 55,00', liga: null, espera: false },
  { id: 8, name: 'Machamp', num: '64/091', category: 'Treinadores', year: 2010, set: 'HS—Undaunted', rarities: ['Pokeball Foil'], img: null, preco: null, liga: null, espera: false },
];

let cards = [];
let usingSampleData = false;
let currentFilter = 'all';
let currentYear = 'all';
let visibleList = [];
let lightboxIndex = -1;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasHover = window.matchMedia('(hover: hover)').matches;

// ── THEME ─────────────────────────────────────────────────────────
function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('themeBtn').textContent = '☀️';
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('themeBtn').textContent = '🌙';
  }
  localStorage.setItem('cgbr_theme', theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
}

// ── CARREGAMENTO ─────────────────────────────────────────────────
async function loadCards() {
  try {
    const res = await fetch(`${API_BASE}/cards`);
    if (!res.ok) throw new Error('status ' + res.status);
    cards = await res.json();
    usingSampleData = false;
  } catch (e) {
    console.warn('Backend indisponível, usando dados de exemplo:', e.message);
    cards = SAMPLE_CARDS;
    usingSampleData = true;
  }
  buildYearFilters();
  renderCards();
  updateHeroSub();
}

function updateHeroSub() {
  const el = document.getElementById('heroSub');
  if (usingSampleData) {
    el.textContent = 'Modo de visualização (exemplo) — conecte o backend para ver seus dados reais.';
  } else {
    el.textContent = 'Se você tiver alguma dessas cartas, entre em contato!';
  }
}

// ── FILTROS ──────────────────────────────────────────────────────
function setFilter(cat, el) {
  currentFilter = cat;
  document.querySelectorAll('#categoryChips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderCards();
}

function buildYearFilters() {
  const years = [...new Set(cards.map(c => c.year).filter(Boolean))].sort((a, b) => a - b);
  const wrap = document.getElementById('yearChips');
  wrap.innerHTML = '<button class="chip active" data-year="all" onclick="setYear(\'all\', this)">Todos os anos</button>'
    + years.map(y => `<button class="chip" data-year="${y}" onclick="setYear(${y}, this)">${y}</button>`).join('');
}

function setYear(year, el) {
  currentYear = year;
  document.querySelectorAll('#yearChips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderCards();
}

// ── RENDER ───────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isFoil(card) {
  return Array.isArray(card.rarities) && card.rarities.some(r => FOIL_RARITIES.has(r));
}

function buildWhatsAppLink(card) {
  const parts = [
    'Olá! Tenho uma carta que você está procurando:', '',
    '🃏 *' + card.name + '*',
  ];
  if (card.num) parts.push('📋 Número: ' + card.num);
  if (card.set) parts.push('📦 Coleção: ' + card.set);
  if (Array.isArray(card.rarities) && card.rarities.length) parts.push('⭐ Raridade(s): ' + card.rarities.join(', '));
  parts.push('', 'Vi no site ColeçãoGBr!');
  return `https://wa.me/${WHATSAPP_NUMBER}?text=` + encodeURIComponent(parts.join('\n'));
}

// Registra a intenção de contato no backend (não bloqueia a abertura do WhatsApp)
// — assim você tem um histórico mesmo que a conversa se perca.
function logContact(card, channel) {
  fetch(`${API_BASE}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId: card.id, cardName: card.name, channel }),
  }).catch(() => { /* silencioso: log é best-effort, nunca deve travar a UX */ });
}

function onWhatsAppClick(cardId) {
  const card = cards.find(c => c.id === cardId);
  if (!card) return;
  logContact(card, 'whatsapp');
}

function buildCardHTML(card, indexInVisible) {
  const foilClass = isFoil(card) ? ' is-foil' : '';
  const esperaClass = card.espera ? ' card-espera' : '';

  const imgBlock = card.img
    ? `<div class="card-img-wrap" onclick="openLightbox(${indexInVisible})">
         <img src="${card.img}" alt="${esc(card.name)}" loading="lazy">
         <div class="foil-sheen"></div>
       </div>`
    : `<div class="card-img-wrap"><div class="card-img-placeholder"><span>🎴</span><p>Sem foto</p></div></div>`;

  const rarityTagsHTML = Array.isArray(card.rarities) && card.rarities.length
    ? '<div class="rarity-tags">' + card.rarities.map(r => `<span class="rarity-tag r-${String(r).replace(/\s/g, '-')}">${esc(r)}</span>`).join('') + '</div>'
    : '';

  const ligaBtn = card.liga
    ? `<a class="btn-liga" href="${card.liga}" target="_blank" rel="noopener"><img src="https://i.imgur.com/6Qreh4P.png" alt=""> Ver na Liga</a>`
    : '';

  const priceBlock = card.preco
    ? `<div style="margin-bottom:6px"><span class="card-price">${esc(card.preco)}</span>${card.precoFonte ? `<span class="price-source">${esc(card.precoFonte)}</span>` : ''}</div>`
    : '';

  const bottomBlock = card.espera
    ? `<div class="badge-espera">⏳ Em espera</div>`
    : `<div style="display:flex;gap:6px;width:100%">
         <a class="btn-whatsapp" style="flex:1" href="${buildWhatsAppLink(card)}" target="_blank" rel="noopener" onclick="onWhatsAppClick(${card.id})">
           <img src="https://i.imgur.com/ZbmGBZx.png" alt="" style="width:18px;height:18px"> Tenho essa carta!
         </a>
         <button class="btn-icon" title="Falar sem WhatsApp" onclick="openContactForm(${card.id})">✉️</button>
       </div>`;

  return `<div class="poke-card${foilClass}${esperaClass}">
    ${imgBlock}
    <div class="card-top">
      <span class="card-name">${esc(card.name)}</span>
      ${card.num ? `<span class="card-number">${esc(card.num)}</span>` : ''}
    </div>
    ${card.set ? `<div class="card-collection"><span class="collection-dot"></span>${esc(card.set)}</div>` : ''}
    ${priceBlock}
    ${rarityTagsHTML}
    <div class="card-footer">
      <div class="card-footer-row"><span class="category-badge">${esc(card.category || 'Principal')}</span>${ligaBtn}</div>
      <div class="card-footer-row">${bottomBlock}</div>
    </div>
  </div>`;
}

function renderCards() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();

  let filtered = cards;
  if (currentFilter !== 'all') filtered = filtered.filter(c => (c.category || 'Principal') === currentFilter);
  if (currentYear !== 'all') filtered = filtered.filter(c => c.year === currentYear);
  if (query) {
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(query) ||
      (c.set && c.set.toLowerCase().includes(query)) ||
      (c.num && c.num.toLowerCase().includes(query))
    );
  }

  visibleList = filtered;
  document.getElementById('countDisplay').textContent = cards.length;

  const main = document.getElementById('cardsMain');
  if (filtered.length === 0) {
    main.innerHTML = `<div class="cards-grid"><div class="empty"><div class="empty-icon">🎴</div><p>${
      cards.length === 0 ? 'Nenhuma carta cadastrada ainda.' : 'Nenhuma carta encontrada com esse filtro.'
    }</p></div></div>`;
    return;
  }

  // Agrupa por ano (do mais antigo para o mais novo) para a linha do tempo
  const byYear = new Map();
  filtered.forEach(c => {
    const y = c.year || 'Sem ano';
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(c);
  });
  const years = [...byYear.keys()].sort((a, b) => {
    if (a === 'Sem ano') return 1;
    if (b === 'Sem ano') return -1;
    return a - b;
  });

  main.innerHTML = years.map(y => {
    const list = byYear.get(y);
    const cardsHTML = list.map(c => buildCardHTML(c, visibleList.indexOf(c))).join('');
    return `<div class="year-group">
      <div class="year-divider">
        <span class="year-num">${y}</span>
        <span class="year-count">${list.length} carta${list.length !== 1 ? 's' : ''}</span>
        <span class="year-line"></span>
      </div>
      <div class="cards-grid">${cardsHTML}</div>
    </div>`;
  }).join('');

  attachFoilTracking();
}

// ── EFEITO FOIL (glare que segue o mouse) ───────────────────────
function attachFoilTracking() {
  if (!hasHover || prefersReducedMotion) return; // toque/reduced-motion: mantém o brilho estático do CSS
  document.querySelectorAll('.poke-card.is-foil .card-img-wrap').forEach(wrap => {
    wrap.addEventListener('mousemove', e => {
      const rect = wrap.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      wrap.style.setProperty('--fx', x + '%');
      wrap.style.setProperty('--fy', y + '%');
    });
    wrap.addEventListener('mouseleave', () => {
      wrap.style.setProperty('--fx', '50%');
      wrap.style.setProperty('--fy', '30%');
    });
  });
}

// ── LIGHTBOX COM NAVEGAÇÃO ───────────────────────────────────────
function openLightbox(index) {
  const card = visibleList[index];
  if (!card || !card.img) return;
  lightboxIndex = index;
  renderLightbox();
  document.getElementById('lightbox').classList.add('open');
}
function renderLightbox() {
  const card = visibleList[lightboxIndex];
  document.getElementById('lightboxImg').src = card.img;
  document.getElementById('lightboxCaption').textContent = `${card.name}${card.num ? ' — ' + card.num : ''}`;
}
function lightboxStep(dir) {
  const withImg = visibleList.map((c, i) => ({ c, i })).filter(x => x.c.img);
  if (!withImg.length) return;
  const pos = withImg.findIndex(x => x.i === lightboxIndex);
  const next = (pos + dir + withImg.length) % withImg.length;
  lightboxIndex = withImg[next].i;
  renderLightbox();
}
function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }

// ── CONTATO ALTERNATIVO (para quem não usa WhatsApp) ────────────
let contactCardId = null;
function openContactForm(cardId) {
  contactCardId = cardId;
  document.getElementById('contactMsg').value = '';
  document.getElementById('contactWay').value = '';
  openModal('contactModal');
}
async function sendContactForm() {
  const way = document.getElementById('contactWay').value.trim();
  const msg = document.getElementById('contactMsg').value.trim();
  if (!way) { document.getElementById('contactWay').focus(); return; }
  const card = cards.find(c => c.id === contactCardId);
  try {
    await fetch(`${API_BASE}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: contactCardId, cardName: card ? card.name : null, channel: 'form', contact: way, message: msg }),
    });
    showToast('✓ Mensagem enviada, obrigado!');
  } catch (e) {
    showToast('Não foi possível enviar agora — tente pelo WhatsApp.');
  }
  closeModal('contactModal');
}

// ── MODAL / TOAST HELPERS ────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(localStorage.getItem('cgbr_theme') || 'dark');
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeLightbox(); document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open')); }
    if (document.getElementById('lightbox').classList.contains('open')) {
      if (e.key === 'ArrowRight') lightboxStep(1);
      if (e.key === 'ArrowLeft') lightboxStep(-1);
    }
  });
  document.getElementById('searchInput').addEventListener('input', renderCards);
  loadCards();
});
