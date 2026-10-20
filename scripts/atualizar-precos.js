// Roda dentro do GitHub Actions (Node 20+, já tem fetch global).
//
// O que faz: para cada carta de docs/data/cards.json, procura a mesma carta na
// pokemontcg.io (casando por coleção + número, nunca só pelo nome), converte o
// preço de referência internacional para BRL e grava em `precoRef`.
//
// O que NÃO faz: nunca mexe em `preco`. `preco` é o valor da Liga Pokémon que
// você confere e digita; `precoRef` é só um termômetro automático (TCGplayer,
// em dólar) para a página "Gerenciar faltantes" avisar quando o preço da Liga
// parece desatualizado. Os dois campos convivem lado a lado.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CARDS_PATH = path.join(ROOT, 'docs', 'data', 'cards.json');
const SETS_PATH = path.join(ROOT, 'docs', 'data', 'sets.json');
const API_KEY = process.env.POKEMONTCG_API_KEY || null;
const API = 'https://api.pokemontcg.io/v2/cards';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// A pokemontcg.io às vezes demora ou devolve 5xx. Sem limite de tempo, um pedido
// travado seguraria o job por horas; aqui cada pedido tem prazo e 1 nova tentativa.
const NET = { timeoutMs: 20000, retries: 1, backoffMs: 2000 };
const MAX_FALHAS_SEGUIDAS = 5; // API fora do ar: para e tenta de novo na próxima semana

async function fetchComPrazo(url, opts, fetchFn = fetch, net = NET) {
  let ultimo;
  for (let i = 0; i <= net.retries; i++) {
    try {
      const r = await fetchFn(url, Object.assign({}, opts, { signal: AbortSignal.timeout(net.timeoutMs) }));
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      return r;
    } catch (e) {
      ultimo = e;
      if (i < net.retries) await sleep(net.backoffMs);
    }
  }
  throw ultimo;
}
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// "24/40" -> { numero: '24', total: '40' } ; "SWSH123" -> { numero: 'SWSH123', total: null }
function parseNum(num) {
  const m = String(num || '').trim().match(/^([A-Za-z]*\d+[A-Za-z]?)\s*(?:\/\s*([A-Za-z]*\d+))?$/);
  if (!m) return null;
  return { numero: m[1], total: m[2] || null };
}

// Monta a consulta mais específica possível. Retorna null se não dá para ser
// específico (melhor não ter preço de referência do que ter o de outra carta).
function buildQuery(card, sets) {
  const n = parseNum(card.num);
  if (!n || /^0+$/.test(n.numero)) return null;
  const set = sets[card.set];
  if (set && set.id) return { q: `set.id:${set.id} number:${n.numero}`, how: 'set+numero' };
  if (n.total) return { q: `number:${n.numero} set.printedTotal:${n.total.replace(/^0+/, '')}`, how: 'numero+total' };
  return null;
}

// Do resultado da API, escolhe o preço em USD e diz de onde veio.
function pickUsd(apiCard) {
  const prices = apiCard.tcgplayer && apiCard.tcgplayer.prices;
  if (!prices) return null;
  // ordem de preferência conforme o acabamento que a pessoa procura
  const order = ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', 'unlimitedHolofoil'];
  for (const k of order.concat(Object.keys(prices))) {
    const p = prices[k];
    const v = p && (p.market || p.mid || p.low);
    if (v) return { usd: v, tipo: k };
  }
  return null;
}

// Só aceita o resultado se o nome bater com o da carta cadastrada.
function nameMatches(card, apiCard) {
  const a = norm(card.name), b = norm(apiCard.name);
  return a === b || b.includes(a) || a.includes(b);
}

// Câmbio USD→BRL: tenta as fontes em ordem. As duas primeiras não pedem chave.
// (A AwesomeAPI passou a oferecer chave gratuita; se você criar uma, guarde em
// AWESOMEAPI_KEY nos secrets do repositório e ela também funciona como reserva.)
const FX_FONTES = [
  { nome: 'frankfurter', url: 'https://api.frankfurter.dev/v2/rate/usd/brl', taxa: j => j.rate },
  { nome: 'open.er-api', url: 'https://open.er-api.com/v6/latest/USD', taxa: j => j.rates && j.rates.BRL },
  { nome: 'awesomeapi', url: 'https://economia.awesomeapi.com.br/json/last/USD-BRL', taxa: j => j.USDBRL && j.USDBRL.bid,
    headers: process.env.AWESOMEAPI_KEY ? { 'x-api-key': process.env.AWESOMEAPI_KEY } : {} },
];

async function getUsdBrlRate(fetchFn = fetch, net = NET, fontes = FX_FONTES) {
  for (const f of fontes) {
    try {
      const r = await fetchComPrazo(f.url, { headers: f.headers || {} }, fetchFn, net);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const taxa = Number(f.taxa(await r.json()));
      if (!isFinite(taxa) || taxa < 0.5 || taxa > 100) throw new Error('resposta sem taxa válida');
      console.log(`Câmbio USD-BRL: ${taxa} (via ${f.nome})`);
      return taxa;
    } catch (e) {
      console.warn(`Câmbio via ${f.nome} falhou: ${e.message}`);
    }
  }
  return null;
}

async function lookup(card, sets, rate, fetchFn = fetch, net = NET) {
  const query = buildQuery(card, sets);
  if (!query) return { skip: 'sem coleção/número confiável' };
  const headers = API_KEY ? { 'X-Api-Key': API_KEY } : {};
  const url = `${API}?q=${encodeURIComponent(query.q)}&pageSize=5&select=id,name,number,set,images,tcgplayer`;
  const r = await fetchComPrazo(url, { headers }, fetchFn, net);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const hit = (j.data || []).find(c => nameMatches(card, c));
  if (!hit) return { skip: 'não encontrada (' + query.how + ')' };
  const px = pickUsd(hit);
  if (!px) return { skip: 'sem preço na API', apiId: hit.id };
  return {
    apiId: hit.id,
    usd: px.usd,
    tipo: px.tipo,
    brl: rate ? Math.round(px.usd * rate * 100) / 100 : null,
    how: query.how,
  };
}

async function main() {
  const cards = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8'));
  let sets = {};
  try { sets = JSON.parse(fs.readFileSync(SETS_PATH, 'utf8')).sets || {}; } catch { /* sem dicionário: usa número+total */ }
  const rate = await getUsdBrlRate();
  if (!rate) {
    // falha VISÍVEL: a Action fica vermelha (e o GitHub avisa por e-mail) em vez de "passar" sem fazer nada
    console.error('Não consegui o câmbio USD-BRL em nenhuma fonte; nada foi gravado.');
    process.exit(1);
  }

  const agora = new Date().toISOString();
  const linhas = [];
  let semMatch = 0, falhasSeguidas = 0, consultasOk = 0;

  for (const card of cards) {
    if (card.status === 'obtida') continue;
    if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) {
      console.warn(`API sem resposta ${MAX_FALHAS_SEGUIDAS} vezes seguidas: parei por aqui; o resto fica para a próxima execução.`);
      break;
    }
    try {
      const res = await lookup(card, sets, rate);
      falhasSeguidas = 0; consultasOk++; // a API respondeu (mesmo que sem a carta)
      if (res.skip) { semMatch++; console.log(`· ${card.name} ${card.num || ''}: ${res.skip}`); }
      else if (res.brl != null && res.brl !== card.precoRef) {
        linhas.push(`${card.name} ${card.num || ''}: ref ${card.precoRef != null ? 'R$ ' + card.precoRef : '(vazio)'} → R$ ${res.brl} (US$ ${res.usd}, ${res.tipo})`);
        card.precoRef = res.brl;
        card.precoRefFonte = `TCGplayer/${res.tipo} · ${res.apiId}`;
        card.precoRefAtualizadoEm = agora;
        if (res.apiId) card.apiId = res.apiId; // ajuda a página a achar a foto/ref depois
      }
    } catch (e) {
      falhasSeguidas++;
      console.warn(`Falha em ${card.name}:`, e.message);
    }
    await sleep(300); // gentil com a API gratuita
  }

  const ativas = cards.filter(c => c.status !== 'obtida').length;
  if (ativas && !consultasOk) {
    console.error('A pokemontcg.io não respondeu a nenhuma consulta; nada foi gravado.');
    process.exit(1);
  }

  if (linhas.length) {
    fs.writeFileSync(CARDS_PATH, JSON.stringify(cards, null, 2) + '\n');
    fs.writeFileSync(path.join(ROOT, '_price_changes.txt'), linhas.join('\n'));
    console.log(`Referências atualizadas (${linhas.length}); sem correspondência: ${semMatch}\n` + linhas.join('\n'));
  } else {
    console.log(`Nenhuma referência mudou. Sem correspondência: ${semMatch}.`);
  }
}

module.exports = { parseNum, buildQuery, pickUsd, nameMatches, lookup, fetchComPrazo, getUsdBrlRate };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
