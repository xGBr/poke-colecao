// ==========================================================================
// ColeçãoGBr — lógica pura da página "Gerenciar faltantes" (docs/js/colecao-utils.js)
//
// Nada aqui toca em DOM, rede ou storage — por isso roda igual no navegador
// (window.CGBR) e no Node (require), e é testado fora do navegador.
//
// Convenções de dados (cards.json):
//   preco              texto "R$ 1.250,00" — valor da Liga Pokémon, conferido por você
//   precoEm            ISO — quando você conferiu esse preço pela última vez
//   precoHist          [[ISO, número], ...] — últimas conferências (máx. 12)
//   precoRef           número em BRL — referência internacional automática (Actions)
//   precoRefAtualizadoEm  ISO
//   status             'obtida' tira a carta do site público; ausente = procurando
//   obtidaEm           ISO
//   prioridade         1..3 (3 = mais urgente)
//   notas              texto livre
// ==========================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CGBR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const STALE_DAYS = 30;          // preço conferido há mais que isso = "desatualizado"
  const REF_RATIO = 2.5;          // Liga × referência diferem mais que isso = suspeito
  const HIST_MAX = 12;

  // ── números e dinheiro ─────────────────────────────────────────
  // "24/40" -> {numero:'24', total:'40'}; "SWSH123" -> {numero:'SWSH123', total:null}; lixo -> null
  function parseNum(num) {
    const m = String(num == null ? '' : num).trim().match(/^([A-Za-z]*\d+[A-Za-z]?)\s*(?:\/\s*([A-Za-z]*\d+))?$/);
    return m ? { numero: m[1], total: m[2] || null } : null;
  }
  function numeroValido(num) {
    const n = parseNum(num);
    return !!n && !/^0+$/.test(n.numero);
  }

  // Aceita "R$ 1.250,00", "1250", "1.250", "12,5", "12.50", 12.5. Retorna número ou null.
  function parseBRL(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
    let s = String(v).replace(/R\$|\s/g, '');
    if (!/^[\d.,]+$/.test(s)) return null;
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {           // os dois: o último é o decimal
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma > -1) {                    // só vírgula: decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > -1) {                      // só ponto: milhar se grupos de 3, senão decimal
      s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
    }
    const n = parseFloat(s);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }
  function fmtBRL(n) {
    if (n == null || !isFinite(n)) return '';
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // ── datas ──────────────────────────────────────────────────────
  function daysSince(iso, now) {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (isNaN(t)) return null;
    return Math.floor(((now || Date.now()) - t) / DAY);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  // ── Liga Pokémon: só LINKS (nunca lemos o site) ────────────────
  // Aprende "nome da coleção -> código ed=" a partir dos links que você já salvou.
  function learnEdMap(cards) {
    const map = {};
    for (const c of cards) {
      const ed = ligaParam(c.liga, 'ed');
      if (ed && c.set && !map[c.set]) map[c.set] = ed;
    }
    return map;
  }
  function ligaParam(url, key) {
    if (!url) return null;
    const m = String(url).match(new RegExp('[?&]' + key + '=([^&#]*)'));
    if (!m) return null;
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1]; }
  }
  const LIGA = 'https://www.ligapokemon.com.br/';
  // Mesmo formato dos links que o próprio site da Liga gera: a barra do número fica literal.
  const enc = s => encodeURIComponent(s).replace(/%2F/gi, '/');
  // Link "exato" quando sabemos o código da edição; senão, link de busca.
  function buildLigaLink(card, edMap) {
    const n = parseNum(card.num);
    const nome = (card.name || '').trim();
    const ed = edMap && card.set ? edMap[card.set] : null;
    if (ed && n && nome) {
      const numeroLimpo = n.numero.replace(/^0+(?=\d)/, '');
      return `${LIGA}?view=cards/card&card=${enc(nome + ' (' + card.num.trim() + ')')}&ed=${encodeURIComponent(ed)}&num=${encodeURIComponent(numeroLimpo)}`;
    }
    return buildLigaSearch(card);
  }
  function buildLigaSearch(card) {
    const q = [card.name, card.num].filter(Boolean).join(' ').trim();
    return `${LIGA}?view=cards/search&card=${enc(q)}`;
  }
  const ligaEhExato = url => !!ligaParam(url, 'ed');

  // ── foto oficial (CDN da pokemontcg.io — não é a Liga) ─────────
  // Só gera quando a coleção tem id conhecido em sets.json e o número é válido.
  function officialImageUrl(card, sets, hires) {
    const s = sets && sets[card.set];
    const n = parseNum(card.num);
    if (!s || !s.id || !n || /^0+$/.test(n.numero)) return null;
    const numero = /^\d+$/.test(n.numero) ? String(parseInt(n.numero, 10)) : n.numero;
    return `https://images.pokemontcg.io/${s.id}/${numero}${hires ? '_hires' : ''}.png`;
  }
  const ehFotoOficial = url => /^https:\/\/images\.pokemontcg\.io\//.test(url || '');

  // ── chaves e identificação ─────────────────────────────────────
  const cardKey = c => [c.name, c.num, c.set].map(x => String(x || '').trim().toLowerCase()).join('|');
  function newId(cards) {
    let id = Date.now();
    const used = new Set(cards.map(c => c.id));
    while (used.has(id)) id++;
    return id;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const ativa = c => c.status !== 'obtida';

  // ── preço: registrar uma conferência ───────────────────────────
  // Atualiza preco/precoEm/precoHist; devolve o novo objeto (não muta o original).
  function registrarPreco(card, valor, agoraIso) {
    const n = parseBRL(valor);
    const agora = agoraIso || new Date().toISOString();
    const out = Object.assign({}, card);
    if (n == null) { // campo vazio: remove o preço (carta sem oferta)
      delete out.preco; delete out.precoEm;
      return out;
    }
    const antes = parseBRL(card.preco);
    out.preco = fmtBRL(n);
    out.precoEm = agora;
    if (antes !== n) {
      const hist = Array.isArray(card.precoHist) ? card.precoHist.slice() : [];
      if (antes != null && card.precoEm && !hist.length) hist.push([card.precoEm, antes]); // semente
      hist.push([agora, n]);
      out.precoHist = hist.slice(-HIST_MAX);
    }
    return out;
  }
  // diferença em relação à conferência anterior (para mostrar ▲/▼)
  function deltaPreco(card) {
    const h = card.precoHist;
    if (!Array.isArray(h) || h.length < 2) return null;
    const [dAnt, vAnt] = h[h.length - 2], [, vAtual] = h[h.length - 1];
    return { de: vAnt, para: vAtual, diff: Math.round((vAtual - vAnt) * 100) / 100, em: dAnt };
  }

  // ── pendências (o que falta organizar em cada carta) ───────────
  const ISSUES = {
    'sem-foto':       { label: 'Sem foto',                 sev: 'warn' },
    'sem-preco':      { label: 'Sem preço',                sev: 'warn' },
    'preco-velho':    { label: 'Preço desatualizado',      sev: 'info' },
    'ref-diverge':    { label: 'Liga × referência divergem', sev: 'warn' },
    'sem-link':       { label: 'Sem link da Liga',         sev: 'warn' },
    'link-busca':     { label: 'Link da Liga é só busca',  sev: 'info' },
    'numero-invalido':{ label: 'Número inválido',          sev: 'err' },
    'sem-ano':        { label: 'Sem ano',                  sev: 'warn' },
    'link-diverge':   { label: 'Número ≠ link da Liga',    sev: 'err' },
    'duplicada':      { label: 'Possível duplicada',       sev: 'err' },
  };

  function detectIssues(card, ctx) {
    ctx = ctx || {};
    const now = ctx.now || Date.now();
    const out = [];
    if (!card.img) out.push('sem-foto');
    const preco = parseBRL(card.preco);
    if (preco == null) out.push('sem-preco');
    else {
      const d = daysSince(card.precoEm, now);
      if (d == null || d > STALE_DAYS) out.push('preco-velho');
      if (typeof card.precoRef === 'number' && card.precoRef > 0 && preco > 0) {
        const r = preco / card.precoRef;
        if (r > REF_RATIO || r < 1 / REF_RATIO) out.push('ref-diverge');
      }
    }
    if (!card.liga) out.push('sem-link');
    else if (!ligaEhExato(card.liga)) out.push('link-busca');
    if (!numeroValido(card.num)) out.push('numero-invalido');
    if (!card.year) out.push('sem-ano');
    // número digitado × número que o link da Liga aponta
    const n = parseNum(card.num), linkNum = ligaParam(card.liga, 'num');
    if (n && linkNum && /^\d+$/.test(n.numero) && /^\d+$/.test(linkNum) && parseInt(n.numero, 10) !== parseInt(linkNum, 10)) out.push('link-diverge');
    // número do "card=" do link (n/total) × número digitado
    const cardParam = ligaParam(card.liga, 'card');
    // dois formatos: "Nome (n/total)" e busca só por número "n/total"
    const mc = cardParam && (cardParam.match(/\((\d+)\s*\/\s*(\d+)\)\s*$/) || cardParam.trim().match(/^(\d+)\s*\/\s*(\d+)$/));
    if (mc && n && n.total && /^\d+$/.test(n.numero) && !out.includes('link-diverge')) {
      if (parseInt(mc[2], 10) !== parseInt(n.total, 10) || parseInt(mc[1], 10) !== parseInt(n.numero, 10)) out.push('link-diverge');
    }
    if (ctx.dupKeys && ctx.dupKeys.has(cardKey(card))) out.push('duplicada');
    return out;
  }
  function dupKeys(cards) {
    const seen = new Map(), dup = new Set();
    for (const c of cards.filter(ativa)) {
      const k = cardKey(c);
      if (seen.has(k)) dup.add(k); else seen.set(k, 1);
    }
    return dup;
  }
  function issuesMap(cards, now) {
    const dk = dupKeys(cards), m = new Map();
    for (const c of cards) m.set(c.id, detectIssues(c, { now, dupKeys: dk }));
    return m;
  }

  // ── estatísticas ───────────────────────────────────────────────
  function stats(cards, issues) {
    const ativas = cards.filter(ativa);
    const valor = ativas.filter(c => !c.espera).reduce((s, c) => s + (parseBRL(c.preco) || 0), 0);
    const porIssue = {};
    for (const c of ativas) for (const i of (issues && issues.get(c.id)) || []) porIssue[i] = (porIssue[i] || 0) + 1;
    return {
      procurando: ativas.filter(c => !c.espera).length,
      espera: ativas.filter(c => c.espera).length,
      obtidas: cards.length - ativas.length,
      valor, porIssue,
    };
  }

  // ── ordenação / agrupamento ────────────────────────────────────
  const SORTS = {
    ano:       (a, b) => (a.year || 9999) - (b.year || 9999) || cmpStr(a.set, b.set) || cmpNum(a, b),
    nome:      (a, b) => cmpStr(a.name, b.name) || cmpNum(a, b),
    'preco-desc': (a, b) => (parseBRL(b.preco) || -1) - (parseBRL(a.preco) || -1),
    'preco-asc':  (a, b) => (parseBRL(a.preco) ?? 1e12) - (parseBRL(b.preco) ?? 1e12),
    conferido: (a, b) => (Date.parse(a.precoEm) || 0) - (Date.parse(b.precoEm) || 0),
    prioridade: (a, b) => (b.prioridade || 0) - (a.prioridade || 0) || (parseBRL(b.preco) || 0) - (parseBRL(a.preco) || 0),
    recentes:  (a, b) => b.id - a.id,
  };
  function cmpStr(a, b) { return String(a || '').localeCompare(String(b || ''), 'pt-BR'); }
  function cmpNum(a, b) {
    const x = parseNum(a.num), y = parseNum(b.num);
    return (x ? parseInt(x.numero.replace(/\D/g, ''), 10) || 0 : 0) - (y ? parseInt(y.numero.replace(/\D/g, ''), 10) || 0 : 0);
  }
  function groupBy(cards, by) {
    if (by === 'nenhum') return [{ chave: '', cards }];
    const keyFn = { ano: c => c.year || 'Sem ano', colecao: c => c.set || 'Sem coleção', categoria: c => c.category || 'Sem categoria' }[by] || (() => '');
    const map = new Map();
    for (const c of cards) { const k = keyFn(c); if (!map.has(k)) map.set(k, []); map.get(k).push(c); }
    const keys = [...map.keys()];
    if (by === 'ano') keys.sort((a, b) => typeof a !== 'number' ? 1 : typeof b !== 'number' ? -1 : a - b);
    return keys.map(k => ({ chave: k, cards: map.get(k) }));
  }

  // ── salvar: diff e merge de 3 vias ─────────────────────────────
  const stable = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((a, kk) => (a[kk] = v[kk], a), {}) : v);
  const semUI = c => { const o = {}; for (const k of Object.keys(c)) if (k[0] !== '_') o[k] = c[k]; return o; };

  // base = como estava quando carregou; work = como está agora na tela.
  function diffCards(base, work) {
    const b = new Map(base.map(c => [c.id, c])), w = new Map(work.map(c => [c.id, semUI(c)]));
    const added = [], modified = [], removed = [];
    for (const [id, c] of w) {
      if (!b.has(id)) added.push(c);
      else if (stable(semUI(b.get(id))) !== stable(c)) modified.push({ before: semUI(b.get(id)), after: c });
    }
    for (const [id, c] of b) if (!w.has(id)) removed.push(semUI(c));
    return { added, modified, removed, empty: !added.length && !modified.length && !removed.length };
  }

  // Aplica o diff sobre a versão que está AGORA no repositório (pode ter mudado
  // enquanto você editava — ex.: a Action semanal gravando precoRef).
  // Campo a campo: o que você mudou vence; o que você não tocou fica como está lá.
  function applyDiff(remote, diff) {
    const cards = clone(remote);
    const idx = new Map(cards.map((c, i) => [c.id, i]));
    const avisos = [];
    for (const c of diff.added) {
      if (idx.has(c.id)) { avisos.push(`"${c.name}" já existia no repositório com o mesmo id; mantive a versão remota.`); continue; }
      idx.set(c.id, cards.push(clone(c)) - 1);
    }
    for (const { before, after } of diff.modified) {
      if (!idx.has(after.id)) { // foi apagada lá enquanto você editava: recria com a sua versão
        avisos.push(`"${after.name}" tinha sido removida no repositório; recriei com a sua edição.`);
        idx.set(after.id, cards.push(clone(after)) - 1);
        continue;
      }
      const tgt = cards[idx.get(after.id)];
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const k of keys) {
        if (stable(before[k]) === stable(after[k])) continue; // você não mexeu nesse campo
        if (stable(tgt[k]) !== stable(before[k]) && stable(tgt[k]) !== stable(after[k])) {
          avisos.push(`"${after.name}": o campo "${k}" também mudou no repositório; prevaleceu a sua edição.`);
        }
        if (after[k] === undefined) delete tgt[k]; else tgt[k] = clone(after[k]);
      }
    }
    const gone = new Set(diff.removed.map(c => c.id));
    return { cards: cards.filter(c => !gone.has(c.id)), avisos };
  }

  function validateCards(cards) {
    if (!Array.isArray(cards)) return ['cards.json precisa ser uma lista.'];
    const erros = [], ids = new Set();
    cards.forEach((c, i) => {
      if (!c || typeof c !== 'object') return erros.push(`Item ${i}: não é um objeto.`);
      if (!c.name || !String(c.name).trim()) erros.push(`Item ${i}: sem nome.`);
      if (c.id == null) erros.push(`Item ${i} (${c.name}): sem id.`);
      else if (ids.has(c.id)) erros.push(`Item ${i} (${c.name}): id repetido.`);
      ids.add(c.id);
    });
    return erros;
  }

  function commitMessage(diff) {
    const partes = [];
    if (diff.added.length) partes.push(`+${diff.added.length}`);
    if (diff.modified.length) partes.push(`~${diff.modified.length}`);
    if (diff.removed.length) partes.push(`-${diff.removed.length}`);
    const nomes = [...diff.added, ...diff.modified.map(m => m.after), ...diff.removed].map(c => c.name);
    const uniq = [...new Set(nomes)];
    const lista = uniq.slice(0, 4).join(', ') + (uniq.length > 4 ? ` e mais ${uniq.length - 4}` : '');
    return `gerenciar: ${partes.join(' ')} (${lista})`;
  }
  const serialize = cards => JSON.stringify(cards, null, 2) + '\n';

  return {
    STALE_DAYS, REF_RATIO, HIST_MAX, ISSUES, SORTS,
    parseNum, numeroValido, parseBRL, fmtBRL, daysSince, fmtDate,
    learnEdMap, ligaParam, buildLigaLink, buildLigaSearch, ligaEhExato,
    officialImageUrl, ehFotoOficial,
    cardKey, newId, clone, ativa, registrarPreco, deltaPreco,
    detectIssues, dupKeys, issuesMap, stats, groupBy,
    diffCards, applyDiff, validateCards, commitMessage, serialize, semUI,
  };
});
