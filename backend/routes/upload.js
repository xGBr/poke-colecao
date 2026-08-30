const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB — foto de carta não precisa ser maior que isso

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('tipo_invalido'));
    cb(null, true);
  },
});

// sharp é uma dependência opcional (ver package.json). Em placas ARM mais
// antigas (Raspberry Pi Zero original / armv6) o binário pré-compilado pode
// não existir — nesse caso caímos de volta para salvar o arquivo original,
// sem redimensionar.
let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.warn('[upload] sharp indisponível — imagens serão salvas sem redimensionar.'); }

router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'arquivo_ausente' });

  const id = crypto.randomBytes(8).toString('hex');

  try {
    if (sharp) {
      const filename = `${id}.webp`;
      await sharp(req.file.buffer)
        .resize({ width: 900, height: 1260, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(UPLOAD_DIR, filename));
      return res.json({ url: `/uploads/${filename}` });
    }
  } catch (e) {
    console.warn('[upload] Falha ao processar com sharp, salvando original:', e.message);
  }

  const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
  res.json({ url: `/uploads/${filename}` });
});

module.exports = router;
