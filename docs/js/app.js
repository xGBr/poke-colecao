// ==========================================================================
// ColeçãoGBr — edição GitHub Pages (docs/js/app.js)
// As cartas vêm de "./data/cards.json", versionado no próprio repositório.
// Não existe nenhum backend aqui — só leitura estática.
// ==========================================================================

const DATA_URL = './data/cards.json';

// Opcional: cole aqui a URL do webhook do seu n8n para receber, em tempo
// real, quem clicou em "Tenho essa carta!" ou usou o formulário alternativo.
// Deixe null para desativar (o site funciona normalmente sem isso).
const CONTACT_WEBHOOK_URL = null; // ex: 'https://seu-n8n.exemplo.com/webhook/colecaogbr-contato'

const WHATSAPP_NUMBER = '5519981061966'; // troque pelo seu número

const FOIL_RARITIES = new Set([
  'Foil', 'Reverse Foil', 'Cosmo Holo', 'Master Ball', 'Play Pokemon Cosmo'
]);

const SAMPLE_CARDS = [
  { id: 1, name: 'Aerodactyl', num: '1/62', category: 'Principal', year: 1999, set: 'Fossil', rarities: ['Normal'], img: 'https://images.pokemontcg.io/base3/1.png', preco: 'R$ 45,00', liga: null, espera: false },
  { id: 2, name: 'Alakazam', num: '1/130', category: 'Principal', year: 2000, set: 'Base Set 2', rarities: ['Foil'], img: 'https://images.pokemontcg.io/base4/1.png', preco: 'R$ 210,00', liga: null, espera: false },
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
  if (theme === 'light') { document.documentElement.setAttribute('data-theme', 'light'); document.getElementById('themeBtn').textContent = '☀️'; }
  else { document.documentElement.removeAttribute('data-theme'); document.getElementById('themeBtn').textContent = '🌙'; }
  localStorage.setItem('cgbr_theme', theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
}

// ── CARREGAMENTO ─────────────────────────────────────────────────
async function loadCards() {
  try {
    // cache-buster simples: evita ver uma versão antiga em cache do navegador
    // logo depois de você salvar uma alteração no painel admin.
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`);
    if (!res.ok) throw new Error('status ' + res.status);
    cards = await res.json();
    usingSampleData = false;
  } catch (e) {
    console.warn('Não consegui ler data/cards.json, usando exemplo:', e.message);
    cards = SAMPLE_CARDS;
    usingSampleData = true;
  }
  buildYearFilters();
  renderCards();
  updateHeroSub();
}

function updateHeroSub() {
  const el = document.getElementById('heroSub');
  el.textContent = usingSampleData
    ? 'Modo de visualização (exemplo) — cadastre cartas de verdade pelo painel admin.'
    : 'Se você tiver alguma dessas cartas, entre em contato!';
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
  document.getElementById('yearChips').innerHTML = '<button class="chip active" data-year="all" onclick="setYear(\'all\', this)">Todos os anos</button>'
    + years.map(y => `<button class="chip" data-year="${y}" onclick="setYear(${y}, this)">${y}</button>`).join('');
}
function setYear(year, el) {
  currentYear = year;
  document.querySelectorAll('#yearChips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderCards();
}

// ── RENDER ───────────────────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function isFoil(card) { return Array.isArray(card.rarities) && card.rarities.some(r => FOIL_RARITIES.has(r)); }

function buildWhatsAppLink(card) {
  const parts = ['Olá! Tenho uma carta que você está procurando:', '', '🃏 *' + card.name + '*'];
  if (card.num) parts.push('📋 Número: ' + card.num);
  if (card.set) parts.push('📦 Coleção: ' + card.set);
  if (Array.isArray(card.rarities) && card.rarities.length) parts.push('⭐ Raridade(s): ' + card.rarities.join(', '));
  parts.push('', 'Vi no site ColeçãoGBr!');
  return `https://wa.me/${WHATSAPP_NUMBER}?text=` + encodeURIComponent(parts.join('\n'));
}

function notifyWebhook(payload) {
  if (!CONTACT_WEBHOOK_URL) return;
  fetch(CONTACT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => { /* best-effort — nunca deve travar a UX do visitante */ });
}

function onWhatsAppClick(cardId) {
  const card = cards.find(c => c.id === cardId);
  if (card) notifyWebhook({ cardId: card.id, cardName: card.name, channel: 'whatsapp', at: new Date().toISOString() });
}

function buildCardHTML(card, indexInVisible) {
  const foilClass = isFoil(card) ? ' is-foil' : '';
  const esperaClass = card.espera ? ' card-espera' : '';
  const imgBlock = card.img
    ? `<div class="card-img-wrap" onclick="openLightbox(${indexInVisible})"><img src="${card.img}" alt="${esc(card.name)}" loading="lazy"><div class="foil-sheen"></div></div>`
    : `<div class="card-img-wrap"><div class="card-img-placeholder"><span>🎴</span><p>Sem foto</p></div></div>`;
  const rarityTagsHTML = Array.isArray(card.rarities) && card.rarities.length
    ? '<div class="rarity-tags">' + card.rarities.map(r => `<span class="rarity-tag r-${String(r).replace(/\s/g, '-')}">${esc(r)}</span>`).join('') + '</div>' : '';
  const ligaBtn = card.liga ? `<a class="btn-liga" href="${card.liga}" target="_blank" rel="noopener"><img src="https://i.imgur.com/6Qreh4P.png" alt=""> Ver na Liga</a>` : '';
  const priceBlock = card.preco ? `<div style="margin-bottom:6px"><span class="card-price">${esc(card.preco)}</span></div>` : '';
  const bottomBlock = card.espera
    ? `<div class="badge-espera">⏳ Em espera</div>`
    : `<div style="display:flex;gap:6px;width:100%">
         <a class="btn-whatsapp" style="flex:1" href="${buildWhatsAppLink(card)}" target="_blank" rel="noopener" onclick="onWhatsAppClick(${card.id})"><img src="https://i.imgur.com/ZbmGBZx.png" alt="" style="width:18px;height:18px"> Tenho essa carta!</a>
         <button class="btn-icon" title="Falar sem WhatsApp" onclick="openContactForm(${card.id})">✉️</button>
       </div>`;
  return `<div class="poke-card${foilClass}${esperaClass}">
    ${imgBlock}
    <div class="card-top"><span class="card-name">${esc(card.name)}</span>${card.num ? `<span class="card-number">${esc(card.num)}</span>` : ''}</div>
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
  if (query) filtered = filtered.filter(c => c.name.toLowerCase().includes(query) || (c.set && c.set.toLowerCase().includes(query)) || (c.num && c.num.toLowerCase().includes(query)));
  visibleList = filtered;
  document.getElementById('countDisplay').textContent = cards.length;
  const main = document.getElementById('cardsMain');
  if (filtered.length === 0) {
    main.innerHTML = `<div class="cards-grid"><div class="empty"><div class="empty-icon">🎴</div><p>${cards.length === 0 ? 'Nenhuma carta cadastrada ainda.' : 'Nenhuma carta encontrada com esse filtro.'}</p></div></div>`;
    return;
  }
  const byYear = new Map();
  filtered.forEach(c => { const y = c.year || 'Sem ano'; if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(c); });
  const years = [...byYear.keys()].sort((a, b) => a === 'Sem ano' ? 1 : b === 'Sem ano' ? -1 : a - b);
  main.innerHTML = years.map(y => {
    const list = byYear.get(y);
    return `<div class="year-group">
      <div class="year-divider"><span class="year-num">${y}</span><span class="year-count">${list.length} carta${list.length !== 1 ? 's' : ''}</span><span class="year-line"></span></div>
      <div class="cards-grid">${list.map(c => buildCardHTML(c, visibleList.indexOf(c))).join('')}</div>
    </div>`;
  }).join('');
  attachFoilTracking();
}

function attachFoilTracking() {
  if (!hasHover || prefersReducedMotion) return;
  document.querySelectorAll('.poke-card.is-foil .card-img-wrap').forEach(wrap => {
    wrap.addEventListener('mousemove', e => {
      const rect = wrap.getBoundingClientRect();
      wrap.style.setProperty('--fx', ((e.clientX - rect.left) / rect.width) * 100 + '%');
      wrap.style.setProperty('--fy', ((e.clientY - rect.top) / rect.height) * 100 + '%');
    });
    wrap.addEventListener('mouseleave', () => { wrap.style.setProperty('--fx', '50%'); wrap.style.setProperty('--fy', '30%'); });
  });
}

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

let contactCardId = null;
function openContactForm(cardId) {
  contactCardId = cardId;
  document.getElementById('contactMsg').value = '';
  document.getElementById('contactWay').value = '';
  openModal('contactModal');
}
function sendContactForm() {
  const way = document.getElementById('contactWay').value.trim();
  const msg = document.getElementById('contactMsg').value.trim();
  if (!way) { document.getElementById('contactWay').focus(); return; }
  const card = cards.find(c => c.id === contactCardId);
  notifyWebhook({ cardId: contactCardId, cardName: card ? card.name : null, channel: 'form', contact: way, message: msg, at: new Date().toISOString() });
  closeModal('contactModal');
  showToast(CONTACT_WEBHOOK_URL ? '✓ Mensagem enviada, obrigado!' : 'Configure CONTACT_WEBHOOK_URL em app.js para receber isso de verdade.');
}

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
  applyTheme(localStorage.getItem('cgbr_theme') || 'dark');
  document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));
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
