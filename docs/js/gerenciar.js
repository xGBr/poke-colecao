// ==========================================================================
// ColeçãoGBr — página "Gerenciar faltantes" (docs/js/gerenciar.js)
//
// Fluxo: você mexe numa CÓPIA de trabalho na tela (cartas, preços, fotos…) e,
// quando terminar, "Salvar no GitHub" grava tudo num commit só. Nada vai para o
// repositório antes disso, e dá para descartar tudo.
//
// Liga Pokémon: a página NUNCA lê o site da Liga. Ela só monta links para você
// abrir lá (em outra aba), e você digita o preço que viu. Fotos oficiais vêm do
// CDN da pokemontcg.io (images.pokemontcg.io), não da Liga.
//
// A lógica pura (preços, links, pendências, diff/merge) está em colecao-utils.js
// e é testada à parte; o acesso ao GitHub está em gh-client.js.
// ==========================================================================
(function () {
  'use strict';

  const U = window.CGBR, G = window.CGBRGit;

  const RARITY_OPTIONS = ['Normal', 'Foil', 'Reverse Foil', 'Cosmo Holo', 'Pokeball Foil', 'Master Ball', 'Play Pokemon', 'Play Pokemon Cosmo', 'World Championships', 'Staff'];
  const FOIL = new Set(['Foil', 'Reverse Foil', 'Cosmo Holo', 'Master Ball', 'Play Pokemon Cosmo']);
  const SHOW_ISSUES = new Set(['sem-foto', 'sem-preco', 'ref-diverge', 'sem-link', 'numero-invalido', 'sem-ano', 'link-diverge', 'duplicada']); // etiquetas no cartão
  const PRIO_LABEL = ['', '★', '★★', '★★★'];

  const S = {
    settings: { owner: '', repo: '', branch: 'main', token: '' },
    client: null, readOnly: false,
    base: [], work: [], sets: {}, edMap: {}, issues: new Map(),
    view: 'cartas',
    f: { q: '', status: 'ativas', cat: '', year: '', set: '', issue: '', sort: 'ano', group: 'ano' },
    compact: false,
    sel: new Set(),
    q: { ids: [], i: 0, feitas: 0 },
    editing: null,
    lb: { ids: [], i: 0 },
    saving: false,
  };

  // ── utilidades de DOM ─────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const byId = id => S.work.find(c => c.id === id);
  const store = {
    get(k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
    set(k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (e) { /* ok */ } },
    del(k, s) { try { (s ? sessionStorage : localStorage).removeItem(k); } catch (e) { /* ok */ } },
  };
  let toastTimer;
  function toast(msg, ms) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms || 3200);
  }
  function showNotice(html) {
    let el = $('notice');
    if (!el) { el = document.createElement('div'); el.id = 'notice'; el.className = 'gz-banner'; $('shell').prepend(el); }
    el.innerHTML = html; el.hidden = !html;
  }

  // ── tema ───────────────────────────────────────────────────────
  function applyTheme(t) {
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
    $('themeBtn').textContent = t === 'light' ? '☀️' : '🌙';
    store.set('cgbr_theme', t);
  }

  // ── conexão ────────────────────────────────────────────────────
  function readSettings() {
    S.settings.owner = store.get('cgbr_gh_owner') || '';
    S.settings.repo = store.get('cgbr_gh_repo') || '';
    S.settings.branch = store.get('cgbr_gh_branch') || 'main';
    S.settings.token = store.get('cgbr_gh_token', true) || '';
  }
  function gateError(msg) { const e = $('gateError'); e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none'; }

  async function connect(silent) {
    if (!silent) {
      S.settings.owner = $('ghOwner').value.trim();
      S.settings.repo = $('ghRepo').value.trim();
      S.settings.branch = $('ghBranch').value.trim() || 'main';
      S.settings.token = $('ghToken').value.trim();
    }
    gateError('');
    if (!S.settings.owner || !S.settings.repo || !S.settings.token) { if (!silent) gateError('Preencha usuário, repositório e token.'); return; }
    const btn = $('btnConnect'); btn.disabled = true; btn.textContent = 'Conectando…';
    try {
      S.client = G.createClient(S.settings);
      const [{ cards }, sets] = await Promise.all([S.client.loadCards(), S.client.loadSets()]);
      store.set('cgbr_gh_owner', S.settings.owner); store.set('cgbr_gh_repo', S.settings.repo); store.set('cgbr_gh_branch', S.settings.branch);
      store.set('cgbr_gh_token', S.settings.token, true);
      enterShell(cards, sets, false);
    } catch (e) {
      S.client = null;
      gateError(e.message || 'Não consegui conectar.');
    } finally { btn.disabled = false; btn.textContent = 'Conectar'; }
  }

  async function demo() {
    gateError('');
    try {
      const [rc, rs] = await Promise.all([fetch('./data/cards.json?t=' + Date.now()), fetch('./data/sets.json?t=' + Date.now())]);
      if (!rc.ok) throw new Error('cards.json não encontrado (' + rc.status + ')');
      const cards = await rc.json();
      const erros = U.validateCards(cards);
      if (erros.length) throw new Error('cards.json com problemas: ' + erros.slice(0, 2).join(' '));
      const sets = rs.ok ? ((await rs.json()).sets || {}) : {};
      S.client = null;
      enterShell(cards, sets, true);
    } catch (e) { gateError(e.message); }
  }

  function enterShell(cards, sets, readOnly) {
    S.readOnly = readOnly;
    S.base = cards; S.work = U.clone(cards); S.sets = sets || {};
    S.sel.clear(); S.q = { ids: [], i: 0, feitas: 0 };
    $('gate').hidden = true; $('shell').hidden = false; $('gzTabs').hidden = false;
    $('roBanner').hidden = !readOnly; $('logoutBtn').hidden = readOnly;
    showNotice('');
    recompute(); buildQueue(); render();
  }

  function logout() {
    if (dirty() && !confirm('Há alterações não salvas. Sair mesmo assim?')) return;
    store.del('cgbr_gh_token', true); S.settings.token = ''; S.client = null;
    location.reload();
  }

  // ── estado derivado ────────────────────────────────────────────
  const dirtyDiff = () => U.diffCards(S.base, S.work);
  const dirty = () => !dirtyDiff().empty;
  function recompute() {
    S.issues = U.issuesMap(S.work);
    S.edMap = U.learnEdMap(S.work);
  }
  function mutate(id, fn) {
    const i = S.work.findIndex(c => c.id === id);
    if (i < 0) return;
    const out = fn(S.work[i]);
    if (out) S.work[i] = out;
  }
  function afterChange() { recompute(); render(); }

  // ── filtros ────────────────────────────────────────────────────
  function visible() {
    const f = S.f, q = norm(f.q);
    const list = S.work.filter(c => {
      const obt = !U.ativa(c), is = S.issues.get(c.id) || [];
      if (f.status === 'ativas' && obt) return false;
      if (f.status === 'procurando' && (obt || c.espera)) return false;
      if (f.status === 'espera' && (obt || !c.espera)) return false;
      if (f.status === 'obtidas' && !obt) return false;
      if (f.cat && (c.category || 'Principal') !== f.cat) return false;
      if (f.year && String(c.year || 'sem') !== f.year) return false;
      if (f.set && (c.set || '') !== f.set) return false;
      if (f.issue && !is.includes(f.issue)) return false;
      if (q && !(norm(c.name).includes(q) || norm(c.set).includes(q) || norm(c.num).includes(q) || norm(c.notas).includes(q))) return false;
      return true;
    });
    return list.sort(U.SORTS[f.sort] || U.SORTS.ano);
  }

  function fillSelect(el, first, values, current, fmt) {
    const opts = [`<option value="">${esc(first)}</option>`].concat(values.map(v => `<option value="${esc(v.v)}">${esc(fmt ? fmt(v) : v.t)}</option>`));
    el.innerHTML = opts.join('');
    el.value = values.some(v => String(v.v) === String(current)) ? current : '';
    return el.value;
  }
  function renderFilters() {
    const cats = [...new Set(S.work.map(c => c.category || 'Principal'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    S.f.cat = fillSelect($('fCat'), 'Todas as categorias', cats.map(v => ({ v, t: v })), S.f.cat);
    const years = [...new Set(S.work.map(c => c.year).filter(Boolean))].sort((a, b) => a - b).map(v => ({ v: String(v), t: String(v) }));
    if (S.work.some(c => !c.year)) years.push({ v: 'sem', t: 'Sem ano' });
    S.f.year = fillSelect($('fYear'), 'Todos os anos', years, S.f.year);
    const sets = [...new Set(S.work.map(c => c.set).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    S.f.set = fillSelect($('fSet'), 'Todas as coleções', sets.map(v => ({ v, t: v })), S.f.set);
  }

  // ── resumo e pendências ────────────────────────────────────────
  function renderStats() {
    const st = U.stats(S.work, S.issues);
    const aConferir = S.work.filter(c => U.ativa(c) && (S.issues.get(c.id) || []).some(i => i === 'preco-velho' || i === 'sem-preco')).length;
    $('stats').innerHTML = [
      ['procurando', st.procurando, 'Procurando', ''],
      ['valor', U.fmtBRL(st.valor), 'Valor estimado (Liga)', ''],
      ['espera', st.espera, 'Em espera', ''],
      ['obtidas', st.obtidas, 'Já consegui', ''],
      ['fila', aConferir, 'Preços a conferir', aConferir ? ' attn' : ''],
    ].map(([k, n, l, cls]) => `<button class="gz-stat${cls}" data-act="stat" data-k="${k}"><span class="num">${esc(n)}</span><span class="lbl">${l}</span></button>`).join('');
    $('tabFilaCount').textContent = aConferir || '';

    const chips = Object.keys(U.ISSUES).filter(k => st.porIssue[k]).map(k => {
      const on = S.f.issue === k ? ' on' : '', err = U.ISSUES[k].sev === 'err' ? ' err' : '';
      return `<button class="gz-chip${on}${err}" data-act="issue" data-issue="${k}">${esc(U.ISSUES[k].label)}<b>${st.porIssue[k]}</b></button>`;
    });
    $('issueChips').innerHTML = chips.join('');
  }

  // ── cartões ────────────────────────────────────────────────────
  const isFoil = c => Array.isArray(c.rarities) && c.rarities.some(r => FOIL.has(r));
  const PLACEHOLDER = '<div class="card-img-placeholder"><span>🎴</span><p>Sem foto</p></div>';
  function imgHTML(c, extra) {
    const u = safeUrl(c.img);
    return `<div class="card-img-wrap" data-act="zoom" data-id="${c.id}"${extra || ''}>${u ? `<img src="${esc(u)}" alt="${esc(c.name)}" loading="lazy" data-cardimg>` : PLACEHOLDER}<div class="foil-sheen"></div></div>`;
  }
  function ligaHref(c) { return safeUrl(c.liga) || U.buildLigaLink(c, S.edMap); }

  function priceHTML(c) {
    const n = U.parseBRL(c.preco);
    let main, meta = '';
    if (n != null) {
      main = `<span class="v">${esc(U.fmtBRL(n))}</span>`;
      const d = U.daysSince(c.precoEm);
      meta = d == null ? '<span class="m old">nunca conferido</span>'
        : `<span class="m${d > U.STALE_DAYS ? ' old' : ''}">conferido ${d === 0 ? 'hoje' : 'há ' + d + ' d'}</span>`;
      const dl = U.deltaPreco(c);
      if (dl && dl.diff) meta += `<span class="m ${dl.diff > 0 ? 'up' : 'down'}" title="era ${esc(U.fmtBRL(dl.de))}">${dl.diff > 0 ? '▲' : '▼'} ${esc(U.fmtBRL(Math.abs(dl.diff)))}</span>`;
    } else main = `<span class="v none">${c.preco ? esc(c.preco) : 'sem preço'}</span>`;
    const ref = typeof c.precoRef === 'number'
      ? `<div class="gref" title="Referência internacional (TCGplayer em dólar, convertida). Serve só de termômetro.">ref. ${esc(U.fmtBRL(c.precoRef))}${c.precoRefAtualizadoEm ? ' · ' + esc(U.fmtDate(c.precoRefAtualizadoEm)) : ''}</div>` : '';
    return `<div class="gprice">${main}${meta}</div>${ref}`;
  }

  function cardHTML(c) {
    const obt = !U.ativa(c), is = S.issues.get(c.id) || [];
    const tags = [];
    if (obt) tags.push('<span class="gtag state">✓ já consegui</span>');
    else if (c.espera) tags.push('<span class="gtag state">⏳ em espera</span>');
    for (const r of c.rarities || []) tags.push(`<span class="gtag">${esc(r)}</span>`);
    for (const i of is.filter(x => SHOW_ISSUES.has(x))) tags.push(`<span class="gtag ${U.ISSUES[i].sev}">${esc(U.ISSUES[i].label)}</span>`);
    const cls = ['gcard', isFoil(c) ? 'is-foil' : '', c.espera ? 'espera' : '', obt ? 'obtida' : '', S.sel.has(c.id) ? 'sel' : ''].join(' ');
    return `<article class="${cls}" data-id="${c.id}">
      <label class="gsel" title="Selecionar"><input type="checkbox" data-act="sel" data-id="${c.id}" ${S.sel.has(c.id) ? 'checked' : ''} aria-label="Selecionar ${esc(c.name)}"></label>
      ${c.prioridade ? `<span class="gprio" title="Prioridade">${PRIO_LABEL[c.prioridade] || ''}</span>` : ''}
      ${imgHTML(c)}
      <div class="gname"><span>${esc(c.name)}</span>${c.num ? `<span class="n">${esc(c.num)}</span>` : ''}</div>
      <div class="gset">${esc(c.set || 'Sem coleção')}${c.year ? ' · ' + c.year : ''}</div>
      ${priceHTML(c)}
      <div class="gtags">${tags.join('')}</div>
      ${c.notas ? `<div class="gnotas">${esc(c.notas)}</div>` : ''}
      <div class="gact">
        <button data-act="edit" data-id="${c.id}" title="Editar" aria-label="Editar">✎</button>
        <a href="${esc(ligaHref(c))}" target="_blank" rel="noopener noreferrer" title="Abrir na Liga Pokémon" aria-label="Abrir na Liga">↗</a>
        <button data-act="conferir" data-id="${c.id}" title="Conferir preço" aria-label="Conferir preço">＄</button>
        <button data-act="prio" data-id="${c.id}" class="${c.prioridade ? 'on' : ''}" title="Prioridade (clique para mudar)" aria-label="Prioridade">★</button>
        <button data-act="espera" data-id="${c.id}" class="${c.espera ? 'on' : ''}" title="${c.espera ? 'Tirar de espera' : 'Colocar em espera'}" aria-label="Em espera">⏳</button>
        <button data-act="obtida" data-id="${c.id}" class="${obt ? 'on' : ''}" title="${obt ? 'Voltar a procurar' : 'Já consegui esta carta'}" aria-label="Já consegui">✓</button>
      </div>
    </article>`;
  }

  function renderCartas() {
    const list = visible();
    const out = $('cardsOut');
    out.className = S.compact ? 'compact' : '';
    $('densityBtn').textContent = S.compact ? '▦ Em grade' : '▤ Compacta';
    if (!list.length) {
      out.innerHTML = `<div class="gz-empty"><div class="big">🎴</div><p>${S.work.length ? 'Nenhuma carta com esses filtros.' : 'Nenhuma carta cadastrada ainda.'}</p></div>`;
    } else {
      out.innerHTML = U.groupBy(list, S.f.group).map(g => {
        const soma = g.cards.reduce((s, c) => s + (U.parseBRL(c.preco) || 0), 0);
        const head = S.f.group === 'nenhum' ? '' :
          `<div class="gz-group-h"><span class="t">${esc(g.chave)}</span><span class="c">${g.cards.length} carta${g.cards.length !== 1 ? 's' : ''}${soma ? ' · ' + esc(U.fmtBRL(soma)) : ''}</span><span class="l"></span></div>`;
        return `<div class="gz-group">${head}<div class="gz-grid">${g.cards.map(cardHTML).join('')}</div></div>`;
      }).join('');
    }
    renderBulk(list);
    renderTools();
  }

  function renderBulk(list) {
    const n = S.sel.size, el = $('bulkBar');
    if (!n) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<strong>${n} selecionada${n > 1 ? 's' : ''}</strong>
      <button class="btn-ghost" data-act="bulk" data-op="espera">⏳ Em espera</button>
      <button class="btn-ghost" data-act="bulk" data-op="ativar">▶ Voltar a procurar</button>
      <button class="btn-ghost" data-act="bulk" data-op="obtida">✓ Já consegui</button>
      <button class="btn-ghost" data-act="bulk" data-op="foto">🖼 Foto oficial</button>
      <button class="btn-ghost" data-act="bulk" data-op="all">Selecionar as ${list.length} visíveis</button>
      <button class="btn-ghost" data-act="bulk" data-op="clear">Limpar seleção</button>`;
  }

  function renderTools() {
    const ativas = S.work.filter(U.ativa);
    const semFoto = ativas.filter(c => !c.img && U.officialImageUrl(c, S.sets));
    const semAno = ativas.filter(c => !c.year && S.sets[c.set] && S.sets[c.set].year);
    const links = ativas.filter(c => (!c.liga || !U.ligaEhExato(c.liga)) && S.edMap[c.set]);
    const row = (txt, n, op, label) => `<div class="gz-tool"><span>${txt} <strong>${n}</strong></span><button class="btn-ghost" data-act="tool" data-op="${op}" ${n ? '' : 'disabled'}>${label}</button></div>`;
    $('toolsBody').innerHTML =
      row('Cartas sem foto, mas com foto oficial disponível:', semFoto.length, 'fotos', 'Preencher fotos oficiais') +
      row('Cartas sem ano, mas com coleção conhecida:', semAno.length, 'anos', 'Preencher anos') +
      row('Links da Liga que dá para trocar por link com código de edição:', links.length, 'links', 'Gerar links') +
      `<div class="gz-hint">Os links gerados usam o código de edição (ed=) que você já tinha em outras cartas da mesma coleção. Abra alguns para conferir antes de salvar.</div>`;
  }

  // ── fila de conferência de preços ──────────────────────────────
  function buildQueue() {
    const mode = $('qMode').value, order = $('qOrder').value;
    const list = S.work.filter(c => {
      if (!U.ativa(c)) return false;
      const is = S.issues.get(c.id) || [];
      if (mode === 'velhos') return is.includes('preco-velho') || is.includes('sem-preco');
      if (mode === 'sempreco') return is.includes('sem-preco');
      if (mode === 'diverge') return is.includes('ref-diverge');
      return true;
    }).sort(U.SORTS[order] || U.SORTS['preco-desc']);
    S.q = { ids: list.map(c => c.id), i: 0, feitas: 0 };
  }
  function queueFirst(id) {
    if (!S.q.ids.includes(id)) S.q.ids.unshift(id);
    S.q.i = S.q.ids.indexOf(id);
  }

  function renderFila() {
    const out = $('queueOut'), q = S.q;
    if (!q.ids.length || q.i >= q.ids.length) {
      out.innerHTML = `<div class="gz-empty"><div class="big">🎉</div><p>${q.ids.length ? 'Fila concluída.' : 'Nada para conferir com esse critério.'}</p>
        ${q.feitas ? `<p style="margin-top:.5rem">${q.feitas} preço${q.feitas > 1 ? 's' : ''} conferido${q.feitas > 1 ? 's' : ''} nesta sessão. Não esqueça de <strong>Salvar no GitHub</strong>.</p>` : ''}</div>`;
      return;
    }
    const c = byId(q.ids[q.i]);
    if (!c) { q.i++; return renderFila(); }
    const n = U.parseBRL(c.preco), d = U.daysSince(c.precoEm), dl = U.deltaPreco(c);
    const exato = U.ligaEhExato(c.liga);
    const pct = Math.round((q.i / q.ids.length) * 100);
    out.innerHTML = `
      <div class="gz-qhead"><span>Carta ${q.i + 1} de ${q.ids.length}</span><span>${q.feitas} conferida${q.feitas !== 1 ? 's' : ''} agora</span></div>
      <div class="gz-prog"><i style="width:${pct}%"></i></div>
      <div class="gz-queue">
        <div class="${isFoil(c) ? 'is-foil' : ''}">${imgHTML(c)}</div>
        <div>
          <div class="gz-qname">${esc(c.name)} ${c.num ? `<small style="font-family:var(--font-mono);font-size:14px;color:var(--text-faint)">${esc(c.num)}</small>` : ''}</div>
          <div class="gz-qsub">${esc(c.set || 'Sem coleção')}${c.year ? ' · ' + c.year : ''}${(c.rarities || []).length ? ' · ' + esc(c.rarities.join(', ')) : ''}</div>
          <a class="gz-qliga" href="${esc(ligaHref(c))}" target="_blank" rel="noopener noreferrer">Abrir na Liga Pokémon ↗</a>
          <div class="gz-hint ${exato ? '' : 'warn'}">${exato ? 'Abre a página da carta.' : 'Este link é uma busca — confira se a edição e o número batem com a carta.'} Anote o valor que você usa como base (ex.: menor preço de uma carta em bom estado).</div>
          <div class="gz-qnow">
            <div class="gz-qbox"><div class="lbl">Preço atual</div><div class="val">${n != null ? esc(U.fmtBRL(n)) : '—'}</div><div class="sub">${n == null ? 'sem preço' : d == null ? 'nunca conferido' : 'conferido ' + (d === 0 ? 'hoje' : 'há ' + d + ' d')}</div></div>
            ${dl ? `<div class="gz-qbox"><div class="lbl">Antes</div><div class="val">${esc(U.fmtBRL(dl.de))}</div><div class="sub">${esc(U.fmtDate(dl.em))}</div></div>` : ''}
            ${typeof c.precoRef === 'number' ? `<div class="gz-qbox"><div class="lbl">Referência</div><div class="val">${esc(U.fmtBRL(c.precoRef))}</div><div class="sub">TCGplayer · só termômetro</div></div>` : ''}
          </div>
          <label for="qInput" class="gz-hint" style="display:block">Preço na Liga agora</label>
          <div class="gz-qinput"><input id="qInput" type="text" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off" aria-label="Preço na Liga"></div>
          <div class="gz-hint" id="qErr" style="color:var(--err)"></div>
          <div class="gz-qbtns">
            <button class="btn-primary" data-act="q-save">Salvar e próxima ⏎</button>
            <button class="btn-ghost" data-act="q-same" ${n == null ? 'disabled' : ''}>Continua o mesmo ✓</button>
            <button class="btn-ghost" data-act="q-skip">Pular →</button>
            <button class="btn-ghost" data-act="q-back" ${q.i ? '' : 'disabled'}>← Voltar</button>
            <button class="btn-ghost gz-danger" data-act="q-none" title="Limpa o preço (sem oferta na Liga)">Sem oferta</button>
          </div>
        </div>
      </div>`;
    const inp = $('qInput'); if (inp) inp.focus();
  }

  function queueApply(valor, tipo) {
    const q = S.q, id = q.ids[q.i], c = byId(id);
    if (!c) return;
    if (tipo === 'same') mutate(id, x => Object.assign({}, x, { precoEm: new Date().toISOString() }));
    else {
      if (tipo === 'val' && U.parseBRL(valor) == null) { $('qErr').textContent = 'Não entendi esse valor. Use algo como 12,50 ou R$ 1.250,00.'; return; }
      mutate(id, x => U.registrarPreco(x, tipo === 'none' ? '' : valor));
    }
    q.feitas++; q.i++;
    recompute(); renderStats(); renderSaveBar(); renderFila();
  }

  // ── ações em cartas ────────────────────────────────────────────
  function toggleEspera(id) { mutate(id, c => { const o = Object.assign({}, c); o.espera = !c.espera; return o; }); afterChange(); }
  function toggleObtida(id) {
    mutate(id, c => {
      const o = Object.assign({}, c);
      if (U.ativa(c)) { o.status = 'obtida'; o.obtidaEm = new Date().toISOString(); } else { delete o.status; delete o.obtidaEm; }
      return o;
    });
    afterChange();
  }
  function cyclePrio(id) { mutate(id, c => { const o = Object.assign({}, c), p = ((c.prioridade || 0) + 1) % 4; if (p) o.prioridade = p; else delete o.prioridade; return o; }); afterChange(); }

  function bulk(op) {
    if (op === 'clear') { S.sel.clear(); return renderCartas(); }
    if (op === 'all') { visible().forEach(c => S.sel.add(c.id)); return renderCartas(); }
    const ids = [...S.sel];
    let feitas = 0;
    for (const id of ids) mutate(id, c => {
      const o = Object.assign({}, c);
      if (op === 'espera') { o.espera = true; feitas++; }
      else if (op === 'ativar') { o.espera = false; delete o.status; delete o.obtidaEm; feitas++; }
      else if (op === 'obtida') { o.status = 'obtida'; o.obtidaEm = o.obtidaEm || new Date().toISOString(); feitas++; }
      else if (op === 'foto') { const u = U.officialImageUrl(c, S.sets); if (u) { o.img = u; feitas++; } }
      return o;
    });
    if (op === 'foto' && feitas < ids.length) toast(`${feitas} de ${ids.length} tinham foto oficial disponível.`);
    else toast(`${feitas} carta${feitas !== 1 ? 's' : ''} alterada${feitas !== 1 ? 's' : ''}.`);
    S.sel.clear(); afterChange();
  }

  function tool(op) {
    let n = 0;
    S.work = S.work.map(c => {
      if (!U.ativa(c)) return c;
      if (op === 'fotos' && !c.img) { const u = U.officialImageUrl(c, S.sets); if (u) { n++; return Object.assign({}, c, { img: u }); } }
      if (op === 'anos' && !c.year && S.sets[c.set] && S.sets[c.set].year) { n++; return Object.assign({}, c, { year: S.sets[c.set].year }); }
      if (op === 'links' && (!c.liga || !U.ligaEhExato(c.liga)) && S.edMap[c.set]) { n++; return Object.assign({}, c, { liga: U.buildLigaLink(c, S.edMap) }); }
      return c;
    });
    toast(`${n} carta${n !== 1 ? 's' : ''} atualizada${n !== 1 ? 's' : ''}. Revise e salve.`);
    afterChange();
  }

  // ── modal de edição ────────────────────────────────────────────
  function openEdit(id) {
    const novo = id == null;
    const c = novo ? { name: '', num: '', set: '', year: null, category: S.f.cat || 'Principal', rarities: [] } : byId(id);
    if (!c) return;
    S.editing = { id: novo ? null : id, orig: c };
    $('editTitle').textContent = novo ? 'Nova carta' : 'Editar carta';
    $('eDeleteBtn').hidden = novo;
    $('eName').value = c.name || ''; $('eNum').value = c.num || ''; $('eYear').value = c.year || '';
    $('eSet').value = c.set || ''; $('eCat').value = c.category || 'Principal'; $('ePrio').value = String(c.prioridade || 0);
    $('eImg').value = c.img || ''; $('eLiga').value = c.liga || '';
    $('ePreco').value = c.preco || ''; $('eNotas').value = c.notas || '';
    $('eEspera').checked = !!c.espera; $('eObtida').checked = !U.ativa(c);
    $('editError').style.display = 'none';
    const sets = [...new Set([...Object.keys(S.sets), ...S.work.map(x => x.set).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('setList').innerHTML = sets.map(s => `<option value="${esc(s)}">`).join('');
    const cats = [...new Set(['Principal', 'Treinadores', ...S.work.map(x => x.category).filter(Boolean)])];
    $('catList').innerHTML = cats.map(s => `<option value="${esc(s)}">`).join('');
    const rar = [...new Set([...RARITY_OPTIONS, ...(c.rarities || [])])];
    $('eRarities').innerHTML = rar.map(r => {
      const on = (c.rarities || []).includes(r);
      return `<label class="rarity-check-item${on ? ' checked' : ''}"><input type="checkbox" value="${esc(r)}" ${on ? 'checked' : ''}><span class="r-box">✓</span>${esc(r)}</label>`;
    }).join('');
    refreshEditHints(); refreshPreview();
    $('editModal').classList.add('open');
    $('eName').focus();
  }
  function closeModal() { $('editModal').classList.remove('open'); S.editing = null; }

  const eVals = () => ({ name: $('eName').value.trim(), num: $('eNum').value.trim(), set: $('eSet').value.trim() });
  function refreshPreview() {
    const u = safeUrl($('eImg').value.trim());
    const checked = [...$('eRarities').querySelectorAll('input:checked')].map(i => i.value);
    const box = $('ePreview');
    box.parentElement.classList.toggle('is-foil', checked.some(r => FOIL.has(r)));
    box.innerHTML = (u ? `<img src="${esc(u)}" alt="Prévia" data-cardimg>` : PLACEHOLDER) + '<div class="foil-sheen"></div>';
  }
  function refreshEditHints() {
    const v = eVals(), s = S.sets[v.set];
    const h = $('eSetHint');
    if (!v.set) h.textContent = '';
    else if (s) h.textContent = `Reconhecida: ${s.en}${s.year ? ' · ' + s.year : ' · ano varia por carta'}${s.total ? ' · ' + s.total + ' cartas' : ''}.`;
    else h.textContent = 'Coleção fora do dicionário (sets.json): preencha o ano e a foto à mão.';
    const lh = $('eLigaHint'), liga = $('eLiga').value.trim();
    const issues = U.detectIssues({ name: v.name, num: v.num, liga, img: 'x', preco: 'R$ 1,00', precoEm: new Date().toISOString(), year: 1 });
    lh.classList.remove('warn');
    if (!liga) lh.textContent = 'Sem link. “Gerar” monta um (exato se esta coleção já tem código de edição em outra carta).';
    else if (issues.includes('link-diverge')) { lh.textContent = '⚠ O número deste link não bate com o número da carta.'; lh.classList.add('warn'); }
    else lh.textContent = U.ligaEhExato(liga) ? 'Link da página da carta.' : 'Link de busca — confira a edição e o número.';
    const ph = $('ePrecoHint'), p = $('ePreco').value.trim(), cur = S.editing && S.editing.orig;
    if (p && U.parseBRL(p) == null) ph.textContent = 'Valor não reconhecido.';
    else if (cur && U.parseBRL(p) != null && U.parseBRL(p) !== U.parseBRL(cur.preco)) ph.textContent = 'Ao aplicar, conta como conferido hoje.';
    else ph.textContent = cur && cur.precoEm ? 'Conferido em ' + U.fmtDate(cur.precoEm) + '.' : '';
    const nv = U.numeroValido(v.num);
    if (v.num && !nv) $('eNum').style.borderColor = 'var(--err)'; else $('eNum').style.borderColor = '';
  }

  // ao escolher/digitar a coleção, sugere o ano (só se o campo estiver vazio)
  function autofillYear() {
    const s = S.sets[eVals().set];
    if (s && s.year && !$('eYear').value) $('eYear').value = s.year;
    refreshEditHints();
  }

  function applyEdit() {
    const v = eVals(), err = $('editError');
    const fail = m => { err.textContent = m; err.style.display = 'block'; };
    if (!v.name) return fail('Dê um nome para a carta.');
    const orig = S.editing.orig, novo = S.editing.id == null;
    let c = Object.assign({}, orig, { name: v.name, num: v.num, set: v.set });
    c.category = $('eCat').value.trim() || 'Principal';
    const yr = parseInt($('eYear').value, 10);
    c.year = isFinite(yr) && yr > 1995 ? yr : null;
    c.rarities = [...$('eRarities').querySelectorAll('input:checked')].map(i => i.value);
    c.img = $('eImg').value.trim() || '';
    c.liga = $('eLiga').value.trim() || '';
    if (c.img && !safeUrl(c.img)) return fail('A foto precisa ser um endereço http(s).');
    if (c.liga && !safeUrl(c.liga)) return fail('O link da Liga precisa começar com http(s).');
    if (novo) {
      if (!c.img) c.img = U.officialImageUrl(c, S.sets) || '';
      if (!c.liga) c.liga = U.buildLigaLink(c, S.edMap);
    }
    // preço
    const p = $('ePreco').value.trim();
    if (p !== (orig.preco || '')) {
      if (p && U.parseBRL(p) == null) return fail('Preço não reconhecido. Use algo como 12,50.');
      c = U.registrarPreco(c, p);
    }
    const pr = parseInt($('ePrio').value, 10);
    if (pr) c.prioridade = pr; else delete c.prioridade;
    const nt = $('eNotas').value.trim();
    if (nt) c.notas = nt; else delete c.notas;
    c.espera = $('eEspera').checked;
    if ($('eObtida').checked) { c.status = 'obtida'; c.obtidaEm = orig.obtidaEm || new Date().toISOString(); } else { delete c.status; delete c.obtidaEm; }

    if (novo) {
      c.id = U.newId(S.work);
      const dup = S.work.find(x => U.cardKey(x) === U.cardKey(c));
      if (dup && !confirm(`Já existe "${dup.name} ${dup.num}" em ${dup.set}. Cadastrar mesmo assim?`)) return;
      S.work.push(c);
    } else S.work[S.work.findIndex(x => x.id === S.editing.id)] = c;
    closeModal(); afterChange();
    toast(novo ? 'Carta adicionada (falta salvar).' : 'Alteração aplicada (falta salvar).');
  }

  function deleteEditing() {
    const c = S.editing && byId(S.editing.id);
    if (!c) return;
    if (!confirm(`Excluir "${c.name} ${c.num || ''}"? Se só conseguiu a carta, use “Já consegui” — assim fica o histórico.`)) return;
    S.work = S.work.filter(x => x.id !== c.id); S.sel.delete(c.id);
    closeModal(); afterChange();
  }

  // ── tela cheia ─────────────────────────────────────────────────
  const hires = c => (U.ehFotoOficial(c.img) && /\.png$/.test(c.img) && !/_hires\.png$/.test(c.img)) ? c.img.replace(/\.png$/, '_hires.png') : c.img;
  function openLightbox(id) {
    const ctx = S.view === 'fila' ? [byId(S.q.ids[S.q.i])].filter(Boolean) : visible();
    const ids = ctx.filter(c => c.img).map(c => c.id);
    const i = ids.indexOf(id);
    if (i < 0) return;
    S.lb = { ids, i };
    showLightbox();
    $('lightbox').classList.add('open');
  }
  function showLightbox() {
    const c = byId(S.lb.ids[S.lb.i]); if (!c) return;
    const img = $('lbImg'), alto = hires(c);
    img.onerror = () => { img.onerror = null; img.src = c.img; };
    img.src = alto; img.alt = c.name;
    $('lbCaption').textContent = `${c.name}${c.num ? ' — ' + c.num : ''}${c.set ? ' · ' + c.set : ''}`;
  }
  function lbStep(d) { if (!S.lb.ids.length) return; S.lb.i = (S.lb.i + d + S.lb.ids.length) % S.lb.ids.length; showLightbox(); }
  function closeLightbox() { $('lightbox').classList.remove('open'); }

  // ── salvar ─────────────────────────────────────────────────────
  function renderSaveBar() {
    const d = dirtyDiff(), bar = $('saveBar');
    bar.hidden = d.empty;
    if (d.empty) return;
    const parts = [];
    if (d.added.length) parts.push(`${d.added.length} nova${d.added.length > 1 ? 's' : ''}`);
    if (d.modified.length) parts.push(`${d.modified.length} editada${d.modified.length > 1 ? 's' : ''}`);
    if (d.removed.length) parts.push(`${d.removed.length} excluída${d.removed.length > 1 ? 's' : ''}`);
    $('saveInfo').innerHTML = `<b>●</b> Não salvo: ${parts.join(', ')}`;
    const b = $('btnSave');
    b.textContent = S.readOnly ? 'Conectar para salvar' : (S.saving ? 'Salvando…' : 'Salvar no GitHub');
    b.disabled = S.saving;
  }

  async function save() {
    if (S.readOnly || !S.client) { toast('Para salvar, volte e conecte com o token.'); return; }
    if (S.saving) return;
    S.saving = true; renderSaveBar();
    try {
      const r = await S.client.saveCards(S.base, S.work);
      if (r.saved) {
        S.base = r.cards; S.work = U.clone(r.cards);
        S.sel.clear();
        recompute(); S.q.ids = S.q.ids.filter(id => byId(id)); render();
        toast('✓ Salvo no GitHub. O site público atualiza em cerca de 1 minuto.', 4500);
        showNotice(r.avisos.length ? '⚠ Salvei, mas:<ul style="margin:6px 0 0 18px">' + r.avisos.map(a => `<li>${esc(a)}</li>`).join('') + '</ul>' : '');
      }
    } catch (e) {
      showNotice('✖ Não consegui salvar: ' + esc(e.message) + ' Suas alterações continuam na tela.');
      toast('Falha ao salvar.', 4000);
    } finally { S.saving = false; renderSaveBar(); }
  }

  function discard() {
    if (!confirm('Descartar todas as alterações não salvas?')) return;
    S.work = U.clone(S.base); S.sel.clear(); afterChange();
  }
  function exportJson() {
    const blob = new Blob([U.serialize(S.work.map(U.semUI))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `cards-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ── render geral e vistas ──────────────────────────────────────
  function setView(v) {
    S.view = v;
    $('viewCartas').hidden = v !== 'cartas'; $('viewFila').hidden = v !== 'fila';
    document.querySelectorAll('.gz-tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
    render();
  }
  function render() {
    renderFilters(); renderStats(); renderSaveBar();
    // na fila de preços o foco é a carta da vez: o resumo some para não empurrar o conteúdo
    $('stats').hidden = $('issueChips').hidden = S.view === 'fila';
    if (S.view === 'cartas') renderCartas(); else renderFila();
  }

  // ── eventos ────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act, id = t.dataset.id ? Number(t.dataset.id) : null;
    switch (act) {
      case 'connect': connect(); break;
      case 'demo': demo(); break;
      case 'logout': logout(); break;
      case 'theme': applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); break;
      case 'view': setView(t.dataset.view); break;
      case 'stat': {
        const k = t.dataset.k;
        if (k === 'fila') { setView('fila'); break; }
        if (k === 'valor') { S.f.sort = 'preco-desc'; $('fSort').value = 'preco-desc'; }
        else S.f.status = k; // procurando | espera | obtidas
        $('fStatus').value = S.f.status; if (S.view !== 'cartas') setView('cartas'); else render();
        break;
      }
      case 'issue': S.f.issue = S.f.issue === t.dataset.issue ? '' : t.dataset.issue; if (S.view !== 'cartas') setView('cartas'); else render(); break;
      case 'density': S.compact = !S.compact; renderCartas(); break;
      case 'new': openEdit(null); break;
      case 'edit': openEdit(id); break;
      case 'espera': toggleEspera(id); break;
      case 'obtida': toggleObtida(id); break;
      case 'prio': cyclePrio(id); break;
      case 'conferir': queueFirst(id); setView('fila'); break;
      case 'zoom': openLightbox(id); break;
      case 'bulk': bulk(t.dataset.op); break;
      case 'tool': tool(t.dataset.op); break;
      case 'close-modal': closeModal(); break;
      case 'e-save': applyEdit(); break;
      case 'e-delete': deleteEditing(); break;
      case 'e-official': {
        const u = U.officialImageUrl(eVals(), S.sets);
        if (u) { $('eImg').value = u; refreshPreview(); } else toast('Sem foto oficial automática para esta coleção/número.');
        break;
      }
      case 'e-noimg': $('eImg').value = ''; refreshPreview(); break;
      case 'e-genlink': $('eLiga').value = U.buildLigaLink(eVals(), S.edMap); refreshEditHints(); break;
      case 'e-openliga': {
        const href = safeUrl($('eLiga').value.trim()) || U.buildLigaLink(eVals(), S.edMap);
        window.open(href, '_blank', 'noopener,noreferrer'); break;
      }
      case 'lb-prev': lbStep(-1); break;
      case 'lb-next': lbStep(1); break;
      case 'lb-close': closeLightbox(); break;
      case 'q-save': queueApply($('qInput').value, 'val'); break;
      case 'q-same': queueApply(null, 'same'); break;
      case 'q-none': queueApply('', 'none'); break;
      case 'q-skip': S.q.i++; renderFila(); break;
      case 'q-back': S.q.i = Math.max(0, S.q.i - 1); renderFila(); break;
      case 'queue-restart': buildQueue(); renderFila(); break;
      case 'save': save(); break;
      case 'discard': discard(); break;
      case 'export': exportJson(); break;
      default: break;
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches && t.matches('input[data-act="sel"]')) {
      const id = Number(t.dataset.id);
      if (t.checked) S.sel.add(id); else S.sel.delete(id);
      t.closest('.gcard').classList.toggle('sel', t.checked); renderBulk(visible());
    } else if (t.id === 'fStatus') { S.f.status = t.value; render(); }
    else if (t.id === 'fCat') { S.f.cat = t.value; render(); }
    else if (t.id === 'fYear') { S.f.year = t.value; render(); }
    else if (t.id === 'fSet') { S.f.set = t.value; render(); }
    else if (t.id === 'fSort') { S.f.sort = t.value; render(); }
    else if (t.id === 'fGroup') { S.f.group = t.value; render(); }
    else if (t.id === 'qMode' || t.id === 'qOrder') { buildQueue(); renderFila(); }
    else if (t.closest && t.closest('#eRarities')) {
      t.closest('label').classList.toggle('checked', t.checked); refreshPreview();
    } else if (t.id === 'eSet') autofillYear();
  });

  document.addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'fSearch') { S.f.q = e.target.value; renderCartas(); }
    else if (id === 'eSet') autofillYear();
    else if (['eName', 'eNum', 'eYear', 'eLiga', 'ePreco'].includes(id)) refreshEditHints();
    else if (id === 'eImg') refreshPreview();
    else if (id === 'qInput') $('qErr').textContent = '';
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeLightbox(); closeModal(); }
    if ($('lightbox').classList.contains('open')) { if (e.key === 'ArrowRight') lbStep(1); if (e.key === 'ArrowLeft') lbStep(-1); }
    if (e.key === 'Enter' && e.target && e.target.id === 'qInput') { e.preventDefault(); queueApply($('qInput').value, 'val'); }
    if (e.key === 'Enter' && e.target && e.target.id === 'ghToken') connect();
  });

  // foto que não carrega vira "Sem foto" (só visual — não altera os dados)
  document.addEventListener('error', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-cardimg')) {
      const wrap = t.parentElement; t.remove();
      wrap.insertAdjacentHTML('afterbegin', '<div class="card-img-placeholder"><span>⚠️</span><p>Foto não carregou</p></div>');
    }
  }, true);

  // brilho foil acompanhando o mouse (mesmo efeito do site público)
  const canHover = window.matchMedia('(hover: hover)').matches, reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (canHover && !reduce) {
    document.addEventListener('mousemove', e => {
      const w = e.target.closest && e.target.closest('.is-foil .card-img-wrap');
      if (!w) return;
      const r = w.getBoundingClientRect();
      w.style.setProperty('--fx', ((e.clientX - r.left) / r.width) * 100 + '%');
      w.style.setProperty('--fy', ((e.clientY - r.top) / r.height) * 100 + '%');
    });
  }

  window.addEventListener('beforeunload', e => { if (S.work.length && dirty() && !S.readOnly) { e.preventDefault(); e.returnValue = ''; } });
  document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) closeModal(); }));
  $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) closeLightbox(); });

  // ── início ─────────────────────────────────────────────────────
  applyTheme(store.get('cgbr_theme') || 'dark');
  readSettings();
  $('ghOwner').value = S.settings.owner; $('ghRepo').value = S.settings.repo; $('ghBranch').value = S.settings.branch;
  if (S.settings.token && S.settings.owner && S.settings.repo) connect(true); // token ainda na sessão desta aba
})();
