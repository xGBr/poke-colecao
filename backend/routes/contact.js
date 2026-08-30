const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Limite bem simples por IP para não virar um formulário de spam aberto.
const recent = new Map(); // ip -> timestamps[]
const WINDOW_MS = 10 * 60 * 1000;
const MAX_IN_WINDOW = 10;

function isSpammy(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now);
  recent.set(ip, list);
  return list.length > MAX_IN_WINDOW;
}

router.post('/', async (req, res) => {
  if (isSpammy(req.ip)) return res.status(429).json({ error: 'rate_limited' });

  const { cardId, cardName, channel, contact, message } = req.body || {};
  if (!cardId || !channel) return res.status(400).json({ error: 'campos_obrigatorios' });

  const lead = await db.leads.insert({
    cardId,
    cardName: cardName ? String(cardName).slice(0, 120) : null,
    channel: String(channel).slice(0, 20),
    contact: contact ? String(contact).slice(0, 200) : null,
    message: message ? String(message).slice(0, 1000) : null,
  });

  // Encaminha para o n8n (opcional). Configure CONTACT_WEBHOOK_URL no .env
  // apontando para um "Webhook" trigger do seu fluxo — dali você pode mandar
  // uma notificação no Telegram, gravar numa planilha, etc.
  const webhookUrl = process.env.CONTACT_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    }).catch(e => console.warn('[contact] Falha ao notificar webhook do n8n:', e.message));
  }

  res.status(201).json({ ok: true });
});

router.get('/', requireAuth, (req, res) => {
  const leads = db.leads.all().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(leads);
});

module.exports = router;
