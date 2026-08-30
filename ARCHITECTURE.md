# Arquitetura e decisões — ColeçãoGBr v2

## 0. Ação imediata (não espere o resto do projeto para fazer isso)

O site atual tem dois problemas de segurança que valem uma correção **hoje**,
independente de quando você migrar para o resto deste projeto:

1. **A "master key" de escrita do JSONBin está no código-fonte do site**
   (`JB_WRITE` em `index.html`). Qualquer pessoa que abrir "ver código-fonte"
   no navegador consegue copiar essa chave e apagar ou reescrever sua lista
   de cartas inteira, mesmo sem saber a senha de admin. Isso não é uma falha
   teórica — é uma chave de API válida, pública, para quem quiser usar.
2. **O login de admin é só visual.** O JavaScript decide se mostra os botões
   de admin, mas nada no servidor confere isso — qualquer pessoa com
   conhecimento básico de DevTools consegue chamar `isAdmin = true` no console
   e liberar os botões de edição/exclusão na hora, sem saber a senha.

**O que fazer agora, mesmo antes de migrar:** gire (crie uma nova) a master
key do JSONBin no painel deles e, se possível, deixe o bin como somente
leitura pública. Isso não resolve o problema de raiz (que é arquitetural:
dado sensível não pode viver em JS que roda no navegador de qualquer
visitante) — mas reduz o risco enquanto você migra com calma para o backend
novo, que resolve os dois pontos de vez (autenticação real no servidor,
nenhuma chave de escrita exposta).

## 1. APIs de Pokémon TCG — o que existe hoje e o que eu recomendo

O cenário mudou bastante desde que a TCGplayer fechou o cadastro público de
desenvolvedores em 2024 (hoje o acesso à API deles é só para parceiros já
existentes). O que sobrou de relevante para um projeto pessoal:

| API | Imagens | Dados de carta | Preço | Observações |
|---|---|---|---|---|
| **pokemontcg.io (v2)** — já usada no seu site | Sim (alta e baixa resolução) | Sim, completo (raridade, set, ano) | Sim — TCGplayer (USD) e Cardmarket (EUR) | Gratuita, endpoint continua no ar; a marca foi incorporada à **Scrydex**, que oferece um plano pago com mais cobertura se um dia você precisar de volume alto. Para uma coleção pessoal, a v2 gratuita é suficiente. |
| **TCGdex** | Sim | Sim (13+ idiomas, incluindo PT) | Não tem preço | Open source, dá para auto-hospedar via Docker. Boa alternativa/backup se a pokemontcg.io sair do ar um dia, mas você precisaria de uma segunda fonte só para preço. |
| Agregadoras de preço multi-fonte (ex. tcgapi.dev) | — | — | Sim, multi-fonte | Foco em preço multi-jogo; mais uma opção caso o pokemontcg.io fique instável no futuro, mas normalmente com limite diário baixo no plano grátis. |

**Recomendação:** continue com a **pokemontcg.io v2** como fonte principal
(é o que o backend deste projeto já usa em `routes/pricing.js`), mas
**nunca chame essa API direto do navegador do visitante** como o site atual
fazia — isso expõe seu volume de uso a qualquer robô e trava a UX quando a
API está lenta. A arquitetura nova resolve isso: o **backend** consulta a
API, guarda o resultado em cache por 12h (preço de carta física não muda a
cada minuto) e devolve pronto pro front. Se quiser mais tranquilidade de
limite, crie uma chave gratuita no site da Scrydex/pokemontcg.io e coloque
em `POKEMONTCG_API_KEY` no `.env`.

## 2. LigaPokemon — o que dá para automatizar (e o que não dá)

Pesquisei os Termos de Uso da LigaPokemon: eles **não oferecem uma API
pública para desenvolvedores**, e a cláusula 17 do contrato deles proíbe
expressamente "o uso indevido e a reprodução total ou parcial" do conteúdo
do site sem autorização. Ou seja, montar um robô para raspar preços de lá
em produção é uma zona de risco real de ToS — mesmo sendo tecnicamente
simples de fazer, eu não recomendo (e por isso não incluí esse robô no
projeto). Não sou advogado e isto não é aconselhamento jurídico, mas é bom
você saber o cenário antes de decidir.

O que o projeto faz em vez disso — e que cobre praticamente a mesma
necessidade prática:

- **Preço de referência internacional automático** (TCGplayer/Cardmarket
  convertido para BRL) — dá uma ideia de ordem de grandeza na hora de
  cadastrar a carta.
- **Link direto para a página da carta na Liga** (`btn-liga`, já existia no
  seu site e mantive) — um clique e você vê o preço real e atualizado deles,
  sem o site precisar reproduzir o dado deles.
- Fica a seu critério, manualmente, copiar o preço da Liga pro campo
  "Preço sugerido" quando quiser — o botão "Buscar referência" só preenche
  um ponto de partida.

Se algum dia você quiser uma integração oficial, a via legítima é entrar em
contato com a LigaPokemon e perguntar sobre um programa de parceiros/afiliados
— vale a pena tentar, já que eles são a maior referência de preço do Brasil.

## 3. Onde hospedar (você tem um Raspberry Pi Zero)

Três caminhos, do mais simples ao mais robusto. Não são mutuamente
exclusivos — dá pra começar num e migrar depois.

### A. Tudo no Raspberry Pi + Cloudflare Tunnel
Um único processo Node (este projeto) rodando no Pi com `pm2` ou um serviço
`systemd`, e um **Cloudflare Tunnel** na frente para dar HTTPS e expor o site
sem abrir porta nenhuma no seu roteador (evita o risco de configurar
port-forwarding em casa). Prós: tudo sob seu controle, sem custo mensal.
Contras: se o Pi ficar sem energia/internet, o site cai; cartão SD é o elo
mais fraco (pode corromper com quedas de energia — vale um SD de boa
qualidade e backups frequentes de `backend/data/`).

Se o seu Pi Zero for o **original/W (armv6, um núcleo)**: ele aguenta esse
Node tranquilamente para tráfego pessoal, mas o pacote `sharp` (usado para
otimizar imagem) pode não ter binário pré-compilado para armv6 — o projeto
já trata isso (cai para salvar a imagem original sem redimensionar). Se for
um **Pi Zero 2 W (armv7/aarch64, quatro núcleos)**, tudo roda com folga.

### B. Backend num VPS/PaaS barato + Pi só para automação
O Node roda numa VPS pequena ou PaaS (ex.: um plano de entrada de qualquer
provedor) e o Raspberry Pi fica livre para rodar o **n8n**, cron jobs de
backup e processamento de imagem — sem depender da sua internet residencial
para o site ficar no ar. É o caminho que eu escolheria se o site vai ser
usado por outras pessoas de fato (mais previsível que depender do seu link
de casa).

### C. WordPress
Puxou o assunto, então vale o contraponto honesto: WordPress te dá um
CMS pronto (posts, mídia, usuários) e uma comunidade enorme de plugins, mas
para o que você quer — cartas com efeito foil, filtro por ano/raridade,
integração com API externa de preço — você acabaria escrevendo um plugin ou
tema customizado do zero mesmo, perdendo boa parte do ganho "sem código" do
WordPress. Some a isso o footprint de PHP + MySQL/MariaDB (mais pesado que
este backend Node+JSON, especialmente no Pi Zero original) e a manutenção
constante de plugins por segurança. Minha recomendação é não usar
WordPress aqui — mas se você já curte o wp-admin no dia a dia e prefere
esse ecossistema, é uma opção viável rodando numa VPS (não no Pi Zero
original).

### D. GitHub Pages + Git como banco de dados (o que construímos primeiro)

Depois de conversarmos, essa acabou sendo a opção de partida: **zero
servidor**. O site público e o painel administrativo são arquivos estáticos
servidos pelo GitHub Pages; os dados (`cards.json`) moram dentro do próprio
repositório e cada alteração feita pelo painel vira um commit, via API do
GitHub, autenticado por um Personal Access Token que você mesmo cola na
hora de administrar (nunca fica salvo no código-fonte). GitHub Actions
assume o papel de "cron job" para atualizar preços periodicamente.

Prós: nada para manter no ar, $0 de custo, histórico de versão gratuito da
sua coleção, deploy automático a cada push. Contras: pequeno atraso (até
~1 min) entre salvar e o site público atualizar; e como não existe servidor,
não dá pra registrar automaticamente quem visitou/clicou em contato — isso
foi resolvido plugando no seu n8n (ver seção 6). Guia passo a passo
completo em `GITHUB-EDITION.md`.

É perfeitamente possível começar por aqui e, mais pra frente, adotar a
opção A ou B só se/quando sentir necessidade real de um servidor (por
exemplo, para a coleção `owned` da seção 4, com relatórios mais pesados).

## 4. Modelo de dados — de "lista de desejos" para "coleção"

Hoje o site só guarda o que **falta**. Um upgrade natural, para quando fizer
sentido, é separar duas coisas:

- **`wanted`** (o que já existe): cartas que faltam, com preço de referência.
- **`owned`** (novo): cartas que você já tem — com quantidade, condição
  (Mint/NM/LP/etc.), quanto pagou e data de aquisição.

Isso abre a porta para um painel de "valor total da coleção" e um gráfico de
evolução de preço ao longo do tempo — não implementei isso ainda no v0.1
para não inflar o escopo, mas o `db.js` já foi desenhado como coleções
independentes (`cards`, `leads`) justamente para você adicionar uma
coleção `owned` depois sem reescrever nada.

## 5. Segurança — o que mudou do site antigo para este

| Antes | Agora |
|---|---|
| Senha verificada em JavaScript no navegador | Senha com hash bcrypt, comparada só no servidor |
| `isAdmin` era uma variável JS (qualquer um muda no console) | Sessão via cookie httpOnly + JWT — o navegador nem consegue ler o cookie |
| Chave de escrita do banco exposta no HTML | Nenhuma chave de escrita chega ao navegador; todas as rotas de escrita exigem sessão válida |
| Sem limite de tentativas de login | Bloqueio temporário após várias tentativas erradas |
| Preço buscado direto do navegador (rate limit exposto) | Backend faz cache e protege sua cota de requisições |

## 6. Automação com n8n — ideias concretas

Você já tem n8n rodando, então isso é praticamente plug-and-play com as
rotas que este backend já expõe:

- **Notificação instantânea de contato**: configure `CONTACT_WEBHOOK_URL`
  no `.env` apontando para um node "Webhook" no n8n. Toda vez que alguém
  clicar em "Tenho essa carta!" ou usar o formulário alternativo, o n8n
  recebe o evento e você manda pra si mesmo no Telegram (mais confiável que
  depender só do histórico do WhatsApp).
- **Backup noturno**: um workflow agendado que copia `backend/data/*.json`
  e `backend/uploads/` para o Google Drive/Dropbox. Cartão SD falha — não
  deixe seus dados dependerem só dele.
- **Atualização periódica de preços**: workflow semanal que percorre as
  cartas cadastradas, chama `/api/pricing/lookup` para cada uma e atualiza
  o campo `preco`, avisando você se algum preço subiu muito (bom gatilho
  para revisar se ainda vale a pena esperar por aquela carta).
- **Cotação do dólar em cache**: já implementei isso no próprio backend
  (6h de cache), mas se preferir centralizar no n8n, dá pra ele atualizar
  um valor fixo uma vez por dia e o backend só ler esse valor.
- **Post automático em rede social**: quando uma carta é marcada como
  "encontrada" ou uma nova é cadastrada, o n8n publica no Instagram/Discord
  — bom para engajar a comunidade que acompanha sua busca.

## 7. Roteiro sugerido (vá no seu ritmo)

1. **Hoje**: gire a master key do JSONBin do site atual (seção 0).
2. **Fase 1**: suba este backend localmente, rode `create-admin`, migre os
   dados (`README.md`), confirme que o CRUD funciona no `admin.html`.
3. **Fase 2**: coloque no ar no Pi (opção A ou B da seção 3) com HTTPS.
4. **Fase 3**: conecte o webhook de contato ao n8n + configure backup noturno.
5. **Fase 4**: ajuste o visual (cores, textos, categorias) para bater 100%
   com o que você já tinha, e importe as fotos que já tem no Imgur/Drive.
6. **Fase 5 (opcional)**: implemente a coleção `owned` (seção 4) para virar
   um gerenciador de coleção completo, não só uma lista de procuradas.

Não precisa ser tudo de uma vez — este projeto foi montado para você (e eu,
nas próximas conversas) irmos abrindo cada peça por vez.
