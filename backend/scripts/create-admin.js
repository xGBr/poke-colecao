// Uso: node scripts/create-admin.js "sua-senha-forte-aqui"
// Gera o hash bcrypt e salva em backend/data/admin.json.
// A senha em texto puro NUNCA é salva em lugar nenhum, nem trafega pro front-end.

const bcrypt = require('bcryptjs');
const db = require('../db');

const senha = process.argv[2];

if (!senha || senha.length < 8) {
  console.error('Uso: node scripts/create-admin.js "senha-com-pelo-menos-8-caracteres"');
  process.exit(1);
}

const hash = bcrypt.hashSync(senha, 12);
db.setAdmin({ passwordHash: hash, updatedAt: new Date().toISOString() }).then(() => {
  console.log('✓ Senha de admin definida com sucesso.');
  console.log('  O hash foi salvo em backend/data/admin.json — pode versionar esse arquivo');
  console.log('  fora do git (ele já está no .gitignore) e fazer backup dele separadamente.');
});
