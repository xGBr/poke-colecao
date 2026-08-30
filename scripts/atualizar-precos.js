// Roda dentro do GitHub Actions (Node 20+, já tem fetch global).
// Lê docs/data/cards.json, busca preço de referência para cada carta na
// pokemontcg.io, converte pra BRL e reescreve o arquivo só se algo mudou.

const fs = require('fs');
const path = require('path');

const CARDS_PATH = path.join(__dirname, '..', 'docs', 'data', 'cards.json');
const API_KEY = process.env.POKEMONTCG_API_KEY || null;

async function getUsdBrlRate() {
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const j = await r.json();
    return parseFloat(j.USDBRL.bid) || null;
  } catch (e) {
    console.warn('Falha ao buscar câmbio:', e.message);
    return null;
  }
}

async function lookupPrice(card, rate) {
  const headers = API_KEY ? { 'X-Api-Key': API_KEY } : {};
  const nameQuery = `name:"${card.name}"`;
  const url = 'https://api.pokemontcg.io/v2/cards?q=' + encodeURIComponent(nameQuery) + '&pageSize=1';
  const r = await fetch(url, { headers });
  const j = await r.json();
  if (!j.data || !j.data.length) return null;

  const found = j.data[0];
  const prices = found.tcgplayer && found.tcgplayer.prices ? Object.values(found.tcgplayer.prices) : [];
  const usd = prices.length ? (prices[0].market || prices[0].low) : null;
  if (!usd || !rate) return null;

  return 'R$ ' + (usd * rate).toFixed(2).replace('.', ',');
}

async function main() {
  const cards = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8'));
  const rate = await getUsdBrlRate();
  const changes = [];

  for (const card of cards) {
    if (card.espera) continue; // não teve motivo pra atualizar preço de algo que nem está ativo
    try {
      const novoPreco = await lookupPrice(card, rate);
      if (novoPreco && novoPreco !== card.preco) {
        changes.push(`${card.name}: ${card.preco || '(vazio)'} → ${novoPreco}`);
        card.preco = novoPreco;
        card.precoAtualizadoEm = new Date().toISOString();
      }
    } catch (e) {
      console.warn(`Falha ao buscar preço de ${card.name}:`, e.message);
    }
    // pequena pausa para não estourar limite de requisições da API gratuita
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  if (changes.length) {
    fs.writeFileSync(CARDS_PATH, JSON.stringify(cards, null, 2) + '\n');
    console.log('Preços atualizados:\n' + changes.join('\n'));
    fs.writeFileSync(path.join(__dirname, '..', '_price_changes.txt'), changes.join('\n'));
  } else {
    console.log('Nenhum preço mudou desde a última execução.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
