const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'cgbr_session';
const SECRET = process.env.JWT_SECRET;

if (!SECRET || SECRET.length < 16) {
  console.error('\n[ERRO] Defina JWT_SECRET no arquivo .env com pelo menos 16 caracteres aleatórios.');
  console.error('       Gere um com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
  process.exit(1);
}

function issueToken(res) {
  const token = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '12h' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,          // JS do navegador não consegue ler este cookie
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearToken(res) {
  res.clearCookie(COOKIE_NAME);
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'not_authenticated' });
  try {
    jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_session' });
  }
}

function isAuthed(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return false;
  try { jwt.verify(token, SECRET); return true; } catch (e) { return false; }
}

module.exports = { requireAuth, issueToken, clearToken, isAuthed, COOKIE_NAME };
