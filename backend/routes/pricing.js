const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Dicionário PT → EN de nomes de coleção (ajuda a busca na API) ──────
const SET_DICT_PT_EN = {
  'máscaras do crepúsculo': 'Twilight Masquerade',
  'crystal guardians': 'Crystal Guardians',
  'guardiões de cristal': 'Crystal Guardians',
  'dragon frontiers': 'Dragon Frontiers',
  'fronteira dos dragões': 'Dragon Frontiers',
  'evoluções prismáticas': 'Prismatic Evolutions',
  'forças temporais': 'Temporal Forces',
  'eletrizante': 'Paldea Evolved',
  'escarlate e violeta': 'Scarlet & Violet',
  'destinos paldeanos': 'Paldean Fates',
  'guerreiros paradoxo': 'Paradox Rift',
  'névoa branca': 'White Flare',
  'chama negra': 'Black Bolt',
};
function translateSetName(pt) {
  if (!pt) return pt;
  return SET_DICT_PT_EN[pt.trim().toLowerCase()] || pt;
}

// ── Cache simples em memória (evita bater na API a cada clique) ───────
const cardCache = new Map();   // query -> { at, data }
const CARD_TTL = 12 * 60 * 60 * 1000; // 12h — preço de carta não muda a cada minuto

let fxCache = { at: 0, rate: null };
const FX_TTL = 6 * 60 * 60 * 1000; // 6h

async function getUsdBrlRate() {
  if (fxCache.rate && Date.now() - fxCache.at < FX_TTL) return fxCache.rate;
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const j = await r.json();
    const rate = parseFloat(j.USDBRL.bid);
    if (!isNaN(rate)) fxCache = { at: Date.now(), rate };
    return fxCache.rate;
  } catch (e) {
    console.warn('[pricing] Falha ao buscar câmbio, usando último valor em cache:', e.message);
    return fxCache.rate; // pode ser null na primeira falha
  }
}

router.get('/lookup', requireAuth, async (req, res) => {
  const nome = (req.query.name || '').trim();
  const setPt = (req.query.set || '').trim();
  if (!nome) return res.status(400).json({ error: 'nome_obrigatorio' });

  const setEn = translateSetName(setPt);
  const cacheKey = `${nome.toLowerCase()}|${setEn.toLowerCase()}`;
  const cached = cardCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CARD_TTL) return res.json(cached.data);

  try {
    const headers = process.env.POKEMONTCG_API_KEY ? { 'X-Api-Key': process.env.POKEMONTCG_API_KEY } : {};

    let query = `name:"${nome}"`;
    if (setEn) query += ` set.name:"${setEn}"`;
    let url = 'https://api.pokemontcg.io/v2/cards?q=' + encodeURIComponent(query) + '&pageSize=1';
    let r = await fetch(url, { headers });
    let j = await r.json();

    if ((!j.data || !j.data.length) && setEn) {
      url = 'https://api.pokemontcg.io/v2/cards?q=' + encodeURIComponent(`name:"${nome}"`) + '&pageSize=1';
      r = await fetch(url, { headers });
      j = await r.json();
    }

    if (!j.data || !j.data.length) {
      const result = { found: false, message: 'Carta não encontrada na API — tente o nome em inglês.' };
      cardCache.set(cacheKey, { at: Date.now(), data: result });
      return res.json(result);
    }

    const card = j.data[0];
    const tcgPrices = card.tcgplayer && card.tcgplayer.prices ? Object.values(card.tcgplayer.prices) : [];
    const usd = tcgPrices.length ? (tcgPrices[0].market || tcgPrices[0].low || null) : null;

    let brl = null;
    if (usd) {
      const rate = await getUsdBrlRate();
      brl = rate ? usd * rate : null;
    }

    const result = {
      found: true,
      name: card.name,
      set: card.set ? card.set.name : null,
      year: card.set && card.set.releaseDate ? parseInt(card.set.releaseDate.slice(0, 4), 10) : null,
      usd,
      brl,
      source: 'TCGplayer (via pokemontcg.io) — referência internacional, confirme o valor local na Liga Pokémon',
      apiUrl: `https://api.pokemontcg.io/v2/cards/${card.id}`,
    };
    cardCache.set(cacheKey, { at: Date.now(), data: result });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: 'falha_api_externa', message: e.message });
  }
});

module.exports = router;
