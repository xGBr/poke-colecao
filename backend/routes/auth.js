const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { issueToken, clearToken, isAuthed } = require('../middleware/auth');

const router = express.Router();

// Limite simples de tentativas por IP (mitigação básica de força bruta).
// Para produção com mais tráfego, troque por 'express-rate-limit'.
const attempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function tooManyAttempts(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) { attempts.delete(ip); return false; }
  return rec.count >= MAX_ATTEMPTS;
}
function registerFailure(ip) {
  const rec = attempts.get(ip) || { count: 0, resetAt: Date.now() + WINDOW_MS };
  rec.count += 1;
  attempts.set(ip, rec);
}
function clearFailures(ip) { attempts.delete(ip); }

router.post('/login', async (req, res) => {
  const ip = req.ip;
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'too_many_attempts', message: 'Muitas tentativas. Aguarde alguns minutos.' });
  }

  const { password } = req.body || {};
  const admin = db.getAdmin();

  if (!admin || !admin.passwordHash) {
    return res.status(500).json({
      error: 'admin_not_configured',
      message: 'Nenhuma senha de admin configurada. Rode: node scripts/create-admin.js "sua-senha"',
    });
  }

  if (!password || !bcrypt.compareSync(password, admin.passwordHash)) {
    registerFailure(ip);
    return res.status(401).json({ error: 'invalid_password', message: 'Senha incorreta.' });
  }

  clearFailures(ip);
  issueToken(res);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (isAuthed(req)) return res.json({ admin: true });
  res.status(401).json({ admin: false });
});

module.exports = router;
