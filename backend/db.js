// ==========================================================================
// db.js — armazenamento em arquivos JSON dentro de /backend/data
//
// Por quê JSON e não SQLite/Postgres logo de cara?
//   - Zero dependências nativas para compilar (importante em Raspberry Pi
//     Zero / armv6, onde módulos como better-sqlite3 podem falhar o build).
//   - Para uma coleção pessoal (algumas centenas/poucos milhares de cartas)
//     o desempenho é mais que suficiente.
//   - Cada "coleção" exportada aqui (cards, leads, admin) tem uma interface
//     pequena (list/insert/update/remove) — trocar por SQLite depois é
//     só reescrever este arquivo, sem tocar nas rotas.
// ==========================================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function filePath(name) { return path.join(DATA_DIR, name + '.json'); }

function readJSON(name, fallback) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    console.error(`[db] Falha ao ler ${name}.json, usando valor padrão:`, e.message);
    return fallback;
  }
}

// Fila simples de escrita para evitar duas escritas simultâneas corromperem
// o arquivo (suficiente para o volume de um site pessoal).
let writeQueue = Promise.resolve();
function writeJSON(name, data) {
  writeQueue = writeQueue.then(() => new Promise((resolve, reject) => {
    const fp = filePath(name);
    const tmp = fp + '.tmp';
    fs.writeFile(tmp, JSON.stringify(data, null, 2), (err) => {
      if (err) return reject(err);
      fs.rename(tmp, fp, (err2) => (err2 ? reject(err2) : resolve()));
    });
  }));
  return writeQueue;
}

function makeCollection(name) {
  return {
    all() { return readJSON(name, []); },
    find(id) { return this.all().find(x => String(x.id) === String(id)); },
    insert(item) {
      const list = this.all();
      const id = item.id || Date.now();
      const record = { ...item, id, createdAt: item.createdAt || new Date().toISOString() };
      list.push(record);
      return writeJSON(name, list).then(() => record);
    },
    update(id, patch) {
      const list = this.all();
      const idx = list.findIndex(x => String(x.id) === String(id));
      if (idx === -1) return Promise.resolve(null);
      list[idx] = { ...list[idx], ...patch, id: list[idx].id, updatedAt: new Date().toISOString() };
      return writeJSON(name, list).then(() => list[idx]);
    },
    remove(id) {
      const list = this.all();
      const next = list.filter(x => String(x.id) !== String(id));
      const removed = next.length !== list.length;
      return writeJSON(name, next).then(() => removed);
    },
  };
}

module.exports = {
  cards: makeCollection('cards'),
  leads: makeCollection('leads'),
  // "admin" guarda um único documento (hash da senha), não uma lista
  getAdmin() { return readJSON('admin', null); },
  setAdmin(doc) { return writeJSON('admin', doc); },
};
