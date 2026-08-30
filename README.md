# ColeçãoGBr v2 — projeto base

Fundação nova para o site de cartas de Pokémon TCG, pensada para você ir
evoluindo aos poucos. Leia também o `ARCHITECTURE.md` — lá está o raciocínio
completo por trás de cada decisão (APIs, LigaPokemon, hospedagem, segurança,
automações no n8n) e o roteiro de próximos passos.

## Duas edições, um só design

Este projeto vem em duas versões, com o mesmo visual (`style.css`
compartilhado) e o mesmo conjunto de funcionalidades — a diferença é só
onde os dados moram e como a escrita é autenticada:

- **`docs/` — edição GitHub Pages** (recomendada se você quer depender só
  do GitHub por enquanto): sem servidor nenhum, dados versionados no
  próprio repositório, autenticação por token pessoal colado no painel.
  Guia completo em **`GITHUB-EDITION.md`**.
- **`frontend/` + `backend/` — edição com servidor Node**: pensada para
  quando você quiser rodar no Raspberry Pi (ou numa VPS), com banco de
  dados, upload de imagem otimizado e login por senha de verdade. É a
  edição descrita no restante deste arquivo.

Comece pela edição GitHub Pages — é mais rápida de colocar no ar — e migre
para a edição Node quando (e se) sentir falta de algo que só um servidor
próprio resolve (ex: mais controle sobre uploads pesados, relatórios).

## O que já está pronto (v0.1 — edição Node)


- **Frontend separado**: `frontend/index.html` (site público) + `frontend/admin.html`
  (painel administrativo) + `frontend/css/style.css` + `frontend/js/*.js`.
- **Backend em Node/Express**: API própria com autenticação de verdade
  (a senha do admin nunca mais fica no código do navegador).
- **Upload de imagem** para o próprio servidor (com otimização automática
  quando possível).
- **Busca de preço de referência** via Pokémon TCG API, convertido para BRL,
  cacheada no servidor.
- **Registro de contatos** (WhatsApp e formulário alternativo) num painel
  que você pode consultar mesmo se perder a conversa do WhatsApp.
- **Efeito foil** nas cartas com raridade especial (CSS + leve tracking do mouse).
- **Organização por ano de lançamento**, além dos filtros de categoria já existentes.

## Rodando localmente

```bash
cd backend
cp .env.example .env
# edite o .env: gere um JWT_SECRET (comando sugerido está dentro do arquivo)

npm install
npm run create-admin -- "sua-senha-forte-aqui"   # define a senha do painel
npm start
```

Abra `http://localhost:3000` (site público) e `http://localhost:3000/admin.html`
(painel — entre com a senha que você definiu).

> Se quiser só olhar o visual sem instalar nada, abra `preview.html` direto
> no navegador — é uma versão autocontida com dados de exemplo.

## Estrutura

```
pokedex-tcg-v2/
├── frontend/
│   ├── index.html        # site público
│   ├── admin.html        # painel administrativo (separado, como você pediu)
│   ├── css/style.css     # design system único, compartilhado pelos dois
│   └── js/
│       ├── app.js        # lógica do site público (sem nada de admin aqui)
│       └── admin.js      # lógica do painel (login, CRUD, upload, preços)
├── backend/
│   ├── server.js         # ponto de entrada — serve site + API + uploads
│   ├── db.js             # camada de dados (JSON hoje, troca fácil por SQLite)
│   ├── middleware/auth.js
│   ├── routes/{auth,cards,upload,contact,pricing}.js
│   └── scripts/create-admin.js
├── preview.html           # demo autocontido (não usa isso em produção)
├── ARCHITECTURE.md         # decisões, comparação de APIs, roadmap
└── README.md               # este arquivo
```

## Antes de colocar no ar: checklist de segurança

1. Rode `npm run create-admin` com uma senha forte — nunca reaproveite senha
   de outro serviço.
2. Confira se `backend/.env` **não** foi commitado (já está no `.gitignore`).
3. Coloque HTTPS na frente do Node (veja opções no `ARCHITECTURE.md`) antes
   de expor o painel admin na internet — sem isso a senha viaja sem criptografia.
4. Troque o número de WhatsApp em `frontend/js/app.js` (`WHATSAPP_NUMBER`) e
   em `preview.html`.
5. Faça backup regular de `backend/data/` e `backend/uploads/` — são os únicos
   lugares onde seus dados realmente moram agora.

## Migrando os dados do site antigo

Seu site atual guarda tudo num JSONBin público. Para trazer as cartas:

1. Abra a URL do seu bin (`https://api.jsonbin.io/v3/b/<ID>/latest`) com o
   header `X-Access-Key` que já está no `index.html` atual, e copie o array.
2. Salve esse array em `backend/data/cards.json` (crie a pasta `data/` se
   não existir) — o formato de campo é o mesmo (`name`, `num`, `category`,
   `rarities`, `set`, `img`, `liga`, `preco`, `espera`), só adicionei o
   campo opcional `year`.
3. **Importante**: depois de migrar, revogue/apague aquele JSONBin ou pelo
   menos gire a "master key" dele — ela ficou exposta publicamente no código
   do site atual (mais detalhes no `ARCHITECTURE.md`, seção "ação imediata").
