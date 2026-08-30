const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_FIELDS = [
  'name', 'num', 'category', 'year', 'rarities', 'set',
  'img', 'liga', 'preco', 'precoFonte', 'espera',
];

function sanitize(body) {
  const out = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  if (out.name) out.name = String(out.name).trim().slice(0, 120);
  if (out.num) out.num = String(out.num).trim().slice(0, 40);
  if (out.year !== undefined && out.year !== null && out.year !== '') out.year = parseInt(out.year, 10) || null;
  if (out.rarities && !Array.isArray(out.rarities)) out.rarities = [];
  out.espera = !!out.espera;
  return out;
}

// Público — lista de cartas (sem nenhum campo sensível, já que não há nenhum aqui)
router.get('/', (req, res) => {
  const cards = db.cards.all().sort((a, b) => (a.year || 0) - (b.year || 0));
  res.json(cards);
});

router.post('/', requireAuth, async (req, res) => {
  const data = sanitize(req.body || {});
  if (!data.name) return res.status(400).json({ error: 'name_required' });
  const created = await db.cards.insert(data);
  res.status(201).json(created);
});

router.put('/:id', requireAuth, async (req, res) => {
  const data = sanitize(req.body || {});
  const updated = await db.cards.update(req.params.id, data);
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json(updated);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const removed = await db.cards.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

module.exports = router;
