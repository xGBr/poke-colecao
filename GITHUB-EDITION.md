# Edição GitHub Pages — rodando quase tudo no GitHub

Esta é a versão do projeto pensada pra depender só do GitHub (mais um
webhook opcional do seu n8n para o formulário de contato). Sem Node, sem
banco de dados separado, sem servidor pra manter no ar.

## Como as peças se encaixam

| Peça | Onde roda | Custo |
|---|---|---|
| Site público + painel admin | **GitHub Pages** | Grátis |
| Banco de dados (`docs/data/cards.json`) | **Dentro do próprio repositório**, versionado a cada alteração | Grátis |
| Autenticação de escrita | Personal Access Token colado por você no painel, sessão a sessão | Grátis |
| Imagens enviadas pelo painel | `docs/uploads/`, também dentro do repositório | Grátis |
| Atualização automática de preços | **GitHub Actions**, semanal ou sob demanda | Grátis (dentro do limite generoso do plano gratuito) |
| Recebimento de contato de visitantes | Webhook do **seu n8n** (opcional) | Você já tem isso rodando |

## Passo a passo

### 1. Publicar o repositório e ativar o Pages
1. Crie (ou reutilize) um repositório no GitHub e suba a pasta `docs/`
   deste projeto na raiz do repositório (junto com `.github/` e `scripts/`
   se quiser a automação de preços).
2. Nas configurações do repositório: **Settings → Pages → Build and
   deployment → Source: "Deploy from a branch"** → branch `main`, pasta
   `/docs`. Salve.
3. Em alguns minutos seu site estará em
   `https://<seu-usuario>.github.io/<seu-repositorio>/`.

### 2. Criar o token de administração
1. Acesse
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
2. Em "Repository access", escolha **"Only select repositories"** e marque
   só este repositório.
3. Em "Permissions → Repository permissions", defina **Contents: Read and
   write**. Não marque mais nada.
4. Defina uma expiração (ex: 90 dias) — você vai gerar um novo token
   quando expirar, é rápido e mantém o risco baixo.
5. Copie o token (começa com `github_pat_...`) — o GitHub só mostra uma vez.

### 3. Conectar o painel
Abra `/admin.html` no seu site publicado, preencha usuário, repositório,
branch (`main`) e cole o token. Ele fica guardado só na sessão da aba
(`sessionStorage`) — feche a aba e some, sem precisar "deslogar" de nada.

### 4. (Opcional) Automação de preços
1. Em **Settings → Secrets and variables → Actions**, adicione (se quiser):
   - `POKEMONTCG_API_KEY` — chave gratuita da pokemontcg.io/Scrydex, opcional.
   - `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` — se quiser ser avisado
     quando um preço mudar. Crie um bot em minutos conversando com o
     [@BotFather](https://t.me/BotFather) no Telegram.
2. O workflow `.github/workflows/atualizar-precos.yml` já está configurado
   para rodar toda segunda-feira e também pode ser disparado manualmente
   na aba **Actions** do repositório (botão "Run workflow").

### 5. (Opcional) Contato de visitantes via n8n
Em `docs/js/app.js`, defina `CONTACT_WEBHOOK_URL` com a URL de um node
"Webhook" do seu n8n. A partir daí, todo clique em "Tenho essa carta!" ou
envio do formulário alternativo chega lá — você decide o que fazer
(mandar pra você no Telegram, gravar numa planilha, etc.).

## Limitações desta edição (comparado à edição com backend Node)

- **Atraso de publicação**: depois de salvar no painel, o GitHub Pages
  leva de alguns segundos a ~1 minuto pra republicar o site. Normal.
- **Sem histórico de "quem entrou em contato"** dentro do próprio site —
  isso passa a viver no seu n8n (ou em nenhum lugar, se você não configurar
  o webhook), já que não há servidor aqui pra guardar esse registro.
- **Token do admin fica na memória do navegador durante a sessão** — mais
  seguro que uma chave fixa exposta no código (o problema do site antigo),
  mas ainda vale usar um token com escopo mínimo (só este repositório,
  só "Contents") e trocar periodicamente, exatamente como configurado acima.
- **Muitas imagens grandes** deixam o repositório pesado com o tempo (Git
  não é ótimo pra armazenar binários que mudam). Para uma coleção pessoal
  de algumas centenas de cartas, com imagens otimizadas (poucas centenas de
  KB cada), isso não deve ser um problema por muito tempo — mas se um dia
  incomodar, dá pra migrar as imagens pra um host externo (Imgur, como no
  site antigo) mantendo só os dados (`cards.json`) no Git.

## Combinando as duas edições

Nada impede de usar as duas ao mesmo tempo, se um dia fizer sentido: o
site público em GitHub Pages (rápido, gratuito, sem manutenção) e o
backend Node (`frontend/` + `backend/`) rodando no seu Raspberry Pi só
para funcionalidades que exigem mesmo um servidor — por exemplo, se você
implementar a coleção `owned` com relatórios mais pesados, ou quiser
histórico de leads sem depender do n8n.
