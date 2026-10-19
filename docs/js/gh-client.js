// ==========================================================================
// ColeçãoGBr — cliente da API do GitHub para a página "Gerenciar faltantes"
// (docs/js/gh-client.js)
//
// Mesma conexão do admin.html: o token fica em sessionStorage (some quando a
// aba fecha) e usuário/repositório/branch em localStorage. Nada é gravado em
// arquivo do site.
//
// Salvar = UM commit só, com todas as alterações da sessão. Antes de gravar, o
// arquivo remoto é lido de novo e as suas mudanças são aplicadas por cima
// (CGBR.applyDiff) — assim a Action semanal de preços e edições feitas em
// outro lugar não são sobrescritas.
// ==========================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./colecao-utils.js'));
  else root.CGBRGit = factory(root.CGBR);
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const CARDS_PATH = 'docs/data/cards.json';
  const SETS_PATH = 'docs/data/sets.json';

  // UTF-8 seguro (acentos, emojis) em base64
  function utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }

  // settings: { owner, repo, branch, token } | fetchFn: injetável para testes
  function createClient(settings, fetchFn) {
    const f = fetchFn || ((...a) => fetch(...a));

    async function gh(path, opts) {
      opts = opts || {};
      const res = await f(`https://api.github.com/repos/${settings.owner}/${settings.repo}/${path}`, Object.assign({}, opts, {
        headers: Object.assign({
          'Authorization': `Bearer ${settings.token}`,
          'Accept': 'application/vnd.github+json',
        }, opts.headers || {}),
      }));
      if (res.status === 401) throw new Error('Token inválido ou expirado. Gere outro e conecte de novo.');
      if (res.status === 403) throw new Error('Sem permissão (ou limite de requisições). O token precisa de "Contents: Read and write" neste repositório.');
      return res;
    }

    async function getFile(path) {
      const res = await gh(`contents/${path}?ref=${encodeURIComponent(settings.branch)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Falha ao ler ${path} (${res.status}).`);
      return res.json();
    }

    async function putFile(path, text, message, sha) {
      const body = { message, content: utf8ToB64(text), branch: settings.branch };
      if (sha) body.sha = sha;
      const res = await gh(`contents/${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 409 || res.status === 422) { const e = new Error('Conflito de versão'); e.conflict = true; throw e; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || `Falha ao salvar ${path} (${res.status}).`); }
      return res.json();
    }

    async function loadCards() {
      const file = await getFile(CARDS_PATH);
      if (!file) return { cards: [], sha: null };
      const cards = JSON.parse(b64ToUtf8(file.content) || '[]');
      const erros = U.validateCards(cards);
      if (erros.length) throw new Error('cards.json no repositório tem problemas: ' + erros.slice(0, 3).join(' '));
      return { cards, sha: file.sha };
    }

    // base: cartas como estavam quando carregou | work: cartas na tela agora
    async function saveCards(base, work, tentativas) {
      const diff = U.diffCards(base, work);
      if (diff.empty) return { saved: false, cards: base, diff, avisos: [] };
      let ultimoErro;
      for (let i = 0; i < (tentativas || 3); i++) {
        const remote = await loadCards();                       // sempre a versão mais nova
        const { cards, avisos } = U.applyDiff(remote.cards, diff);
        const erros = U.validateCards(cards);
        if (erros.length) throw new Error('Não salvei: ' + erros.slice(0, 3).join(' '));
        try {
          const r = await putFile(CARDS_PATH, U.serialize(cards), U.commitMessage(diff), remote.sha);
          return { saved: true, cards, sha: r.content.sha, diff, avisos, commitUrl: r.commit && r.commit.html_url };
        } catch (e) {
          if (!e.conflict) throw e;
          ultimoErro = e;                                       // alguém commitou no meio: lê de novo e tenta outra vez
        }
      }
      throw new Error('O repositório mudou várias vezes enquanto eu salvava. Tente de novo. (' + ultimoErro.message + ')');
    }

    // sets.json é opcional: sem ele a página só perde autopreenchimento de ano/foto
    async function loadSets() {
      try {
        const file = await getFile(SETS_PATH);
        return file ? (JSON.parse(b64ToUtf8(file.content)).sets || {}) : {};
      } catch (e) { return {}; }
    }

    return { getFile, putFile, loadCards, saveCards, loadSets };
  }

  return { createClient, utf8ToB64, b64ToUtf8, CARDS_PATH, SETS_PATH };
});
