require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const cardsRoutes = require('./routes/cards');
const uploadRoutes = require('./routes/upload');
const contactRoutes = require('./routes/contact');
const pricingRoutes = require('./routes/pricing');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Confia no proxy (Nginx/Caddy/Cloudflare Tunnel) para IP real e cookies "secure"
app.set('trust proxy', 1);

app.use('/api/auth', authRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/pricing', pricingRoutes);

// Imagens enviadas pelo admin
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Site estático (público + admin.html) — um único processo cuida de tudo
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use((err, req, res, next) => {
  console.error('[erro]', err);
  res.status(500).json({ error: 'erro_interno' });
});

app.listen(PORT, () => {
  console.log(`ColeçãoGBr rodando em http://localhost:${PORT}`);
  if (!require('./db').getAdmin()) {
    console.log('\n⚠ Nenhuma senha de admin configurada ainda. Rode:');
    console.log('  node scripts/create-admin.js "sua-senha-forte"\n');
  }
});
