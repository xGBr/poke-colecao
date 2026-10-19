# Gerenciar faltantes — guia rápido

Página: `https://SEU-USUARIO.github.io/poke-colecao/gerenciar.html` (também há um botão no `admin.html`).

Entra com o **mesmo token** do admin (fine-grained, só este repositório, *Contents: Read and write*).
O token fica só na aba aberta. Sem token dá para entrar em **modo leitura** e baixar um backup.

## Como o salvamento funciona

Você mexe numa cópia na tela. Nada vai para o GitHub até clicar em **Salvar no GitHub**, que grava
**um commit só** com tudo. Antes de gravar, a página relê o `cards.json` do repositório e aplica as suas
mudanças por cima, campo a campo. Por isso a Action semanal (que grava `precoRef`) e edições feitas
em outro lugar não são perdidas. Se o mesmo campo mudou nos dois lados, prevalece a sua edição e a
página avisa. **Descartar** volta tudo ao que está no repositório.

## Preços: a Liga é a fonte, você é a ponte

A Liga Pokémon não tem API pública e o contrato de uso proíbe reproduzir o conteúdo sem autorização,
então **a página nunca lê o site da Liga**. O fluxo é:

1. Aba **Conferir preços** → mostra uma carta por vez, começando pelas mais caras (ou por prioridade).
2. **Abrir na Liga Pokémon ↗** abre a carta em outra aba.
3. Digite o valor que você usa como base (ex.: menor preço de uma carta em bom estado) e dê **Enter**.
   Aceita `12,50`, `1.250`, `R$ 1.250,00`.
4. Outras opções: *Continua o mesmo* (só renova a data), *Pular*, *Sem oferta* (limpa o preço).
5. Salve no fim.

Cada conferência grava `precoEm` (data) e `precoHist` (últimas 12 conferências). O cartão mostra
“conferido há N d”, ▲/▼ em relação à conferência anterior, e fica marcado como **desatualizado**
depois de 30 dias.

`precoRef` (referência em R$, TCGplayer convertida) é só um **termômetro**: a Action semanal grava
esse campo e **nunca** mexe em `preco`. Se Liga e referência divergem muito (mais de 2,5×), a carta
ganha a pendência “Liga × referência divergem” — normalmente é preço velho ou carta errada.

## Fotos

Vêm do CDN da pokemontcg.io (`images.pokemontcg.io/<id-da-coleção>/<número>.png`), não da Liga.
O botão **Usar foto oficial** (e a ferramenta em lote) só funciona para coleções com `id` em
`docs/data/sets.json`. Promos e kits ficam sem `id` — use uma URL à mão. Clique na foto para ver em
**tela cheia** (usa a versão `_hires` quando é foto oficial; setas ← → navegam).

## Pendências (chips acima da lista)

Sem foto · Sem preço · Preço desatualizado · Liga × referência divergem · Sem link da Liga ·
Link da Liga é só busca · Número inválido · Sem ano · Número ≠ link da Liga · Possível duplicada.
Clique num chip para filtrar. **Ferramentas em lote** (rodapé da lista) preenche fotos oficiais, anos
e links com código de edição (`ed=`) onde dá.

## Outros campos novos (todos opcionais, o site público ignora)

| Campo | Para quê |
|---|---|
| `status: "obtida"` + `obtidaEm` | botão ✓ “já consegui”: sai do site público, fica no histórico |
| `prioridade` 1–3 | botão ★ |
| `notas` | texto livre (ex.: “aceito LP”) |
| `espera` | já existia: tira o botão “Tenho essa carta!” |

> O `admin.html` antigo continua funcionando, mas mostra também as cartas obtidas.

## Arquivos

```
docs/gerenciar.html           a página
docs/css/gerenciar.css
docs/js/colecao-utils.js      preços, links, pendências, diff/merge (puro, testado)
docs/js/gh-client.js          leitura/escrita via API do GitHub
docs/js/gerenciar.js          interface
docs/data/sets.json           dicionário coleção → id, nome em inglês, ano, total
docs/data/cards.json          unificado (91 cartas)
scripts/atualizar-precos.js   grava só precoRef, casa por coleção+número
.github/workflows/atualizar-precos.yml
```

## Para acrescentar uma coleção nova

Edite `docs/data/sets.json`: a chave é o nome como você digita no site; `id` é o da pokemontcg.io
(https://api.pokemontcg.io/v2/sets), `year` e `total` conferidos lá. Sem isso a página funciona, só
não preenche ano/foto sozinha.
