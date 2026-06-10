# Compatibilidade real com agentes de IA (Codex, Antigravity e Gemini CLI)

## Overview

Hoje o `midas init` anuncia suporte a 13 ferramentas de IA, mas só instala
commands/skills de verdade para Claude Code, Cursor e Windsurf. As demais —
incluindo o Codex CLI — aparecem no relatório como "skipped (not supported)" e
nenhum arquivo é criado, o que quebra a promessa de compatibilidade do
framework (um usuário selecionou o Codex e nada foi instalado). Este spec
corrige isso para o Codex CLI, adiciona suporte à nova ferramenta Google
Antigravity e aproveita para suportar o Gemini CLI, já que ele compartilha o
diretório `~/.gemini` com o Antigravity. As demais ferramentas — que não têm
nenhuma convenção de instalação implementada (GitHub Copilot, OpenCode, Cline,
Roo Code, Kilo Code, Aider, Amazon Q e Zed) — são removidas do registro e
deixam de aparecer no setup inicial: a lista do `midas init` passa a conter
apenas ferramentas para as quais a instalação realmente funciona.

As convenções de instalação seguem a documentação oficial vigente de cada
ferramenta (junho/2026):

- **Codex CLI**: skills no padrão aberto Agent Skills em
  `~/.codex/skills/<nome>/SKILL.md`. Os custom prompts (`~/.codex/prompts/`)
  foram deprecados pela OpenAI e não serão instalados.
- **Antigravity**: skills (mesmo padrão Agent Skills) em
  `~/.gemini/antigravity/skills/<nome>/SKILL.md` e workflows (equivalentes a
  slash commands) em `~/.gemini/antigravity/global_workflows/<nome>.md`.
- **Gemini CLI**: comandos customizados em TOML em
  `~/.gemini/commands/midas/<nome>.toml`, invocados como `/midas:<nome>`.

Todas as instalações seguem o modelo atual do MidasSpec: escopo global (home
do usuário), uma skill/comando por workflow (`spec`, `break`, `implement`,
`archive`), conteúdo gerado a partir dos templates de workflow existentes.

---

## Registro de ferramentas

O catálogo de ferramentas suportadas, com os destinos de instalação e as
regras de detecção de cada uma.

### Components

- **Entrada do Codex CLI**: ferramenta já existente no registro, que passa a
  declarar um destino global de skills (`~/.codex/skills`). A detecção
  continua pela pasta `.codex/` na raiz do repositório.
- **Entrada do Antigravity**: nova ferramenta no registro, com id
  `antigravity` e nome "Antigravity". Declara destino global de skills
  (`~/.gemini/antigravity/skills`) e de workflows
  (`~/.gemini/antigravity/global_workflows`).
- **Entrada do Gemini CLI**: ferramenta já existente no registro, que passa a
  declarar um destino global de comandos em formato TOML
  (`~/.gemini/commands/midas/<nome>.toml`). A detecção continua pela pasta
  `.gemini/` ou pelo arquivo `GEMINI.md`.
- **Registro enxuto**: o registro contém apenas ferramentas com instalação
  funcional — Claude Code, Cursor, Windsurf, Codex CLI, Antigravity e Gemini
  CLI. As entradas de GitHub Copilot, OpenCode, Cline, Roo Code, Kilo Code,
  Aider, Amazon Q e Zed são removidas.

### Behaviors

- **deteccao-antigravity**: o Antigravity é detectado quando existe a pasta
  `.agents/` (convenção atual) ou `.agent/` (convenção antiga, ainda aceita)
  na raiz do repositório. Qualquer uma das duas marca a ferramenta como
  presente no picker do `midas init`.
- **selecao-por-flag**: `midas init --tools antigravity` (isolado ou em lista,
  e incluído em `--tools all`) seleciona o Antigravity sem prompt, igual às
  demais ferramentas.
- **picker-so-com-suportadas**: o picker interativo do `midas init` lista
  somente as seis ferramentas suportadas; nenhuma opção "skipped (not
  supported)" é oferecida ao usuário no setup inicial.
- **tools-flag-rejeita-removidas**: `midas init --tools <id>` com o id de uma
  ferramenta removida (ex.: `aider`, `zed`) falha com o erro padrão de
  ferramenta desconhecida, listando os ids válidos; `--tools all` passa a
  resolver apenas as seis ferramentas suportadas.
- **config-global-com-id-removido**: um config global existente que ainda
  liste ids de ferramentas removidas não quebra o `midas init`: esses ids são
  ignorados silenciosamente e apenas as ferramentas suportadas são instaladas.
- **antigravity-e-gemini-independentes**: Antigravity e Gemini CLI são
  entradas independentes no registro, mesmo compartilhando o diretório
  `~/.gemini`. Selecionar um não instala os arquivos do outro, e instalar os
  dois no mesmo ambiente não gera conflito (os destinos não se sobrepõem).

---

## Instalação para o Codex CLI

O que o `midas init` gera quando o Codex CLI está selecionado.

### Components

- **Skills do Codex**: quatro pastas `midas-spec/`, `midas-break/`,
  `midas-implement/` e `midas-archive/` em `~/.codex/skills/`, cada uma com um
  `SKILL.md` no padrão Agent Skills (frontmatter YAML com `name` e
  `description`, seguido do corpo do workflow) — o mesmo formato já gerado
  hoje para Claude Code e Windsurf.

### Behaviors

- **codex-instala-skills**: ao rodar `midas init` com o Codex selecionado, as
  quatro skills são escritas em `~/.codex/skills/` e os caminhos aparecem no
  relatório do init na seção de skills — o Codex deixa de constar em
  "skipped".
- **codex-sem-commands**: o Codex não recebe arquivos de slash command (o
  mecanismo de custom prompts foi deprecado pela OpenAI); na camada de
  comandos do relatório ele consta como não suportado, sem ser tratado como
  erro.

---

## Instalação para o Antigravity

O que o `midas init` gera quando o Antigravity está selecionado.

### Components

- **Skills do Antigravity**: quatro pastas `midas-spec/`, `midas-break/`,
  `midas-implement/` e `midas-archive/` em `~/.gemini/antigravity/skills/`,
  cada uma com um `SKILL.md` no padrão Agent Skills, idêntico ao gerado para
  as demais ferramentas com skills.
- **Workflows do Antigravity**: quatro arquivos markdown
  `midas-spec.md`, `midas-break.md`, `midas-implement.md` e
  `midas-archive.md` em `~/.gemini/antigravity/global_workflows/`, cada um com
  frontmatter YAML (`description`) seguido do corpo do workflow, invocáveis no
  Antigravity como `/midas-spec`, `/midas-break`, `/midas-implement` e
  `/midas-archive`.

### Behaviors

- **antigravity-instala-skills-e-workflows**: ao rodar `midas init` com o
  Antigravity selecionado, skills e workflows são escritos nos destinos
  globais acima e os caminhos aparecem no relatório do init (workflows na
  camada de slash commands, skills na camada de skills).
- **antigravity-reinstalacao-idempotente**: rodar `midas init` novamente
  sobrescreve os arquivos gerados com o conteúdo atual dos templates, sem
  duplicar nem deixar resíduo.

---

## Instalação para o Gemini CLI

O que o `midas init` gera quando o Gemini CLI está selecionado.

### Components

- **Comandos TOML do Gemini**: quatro arquivos `spec.toml`, `break.toml`,
  `implement.toml` e `archive.toml` em `~/.gemini/commands/midas/`, invocáveis
  como `/midas:spec`, `/midas:break`, `/midas:implement` e `/midas:archive`.
  Cada arquivo contém os campos `description` (a descrição do workflow) e
  `prompt` (o corpo do workflow), no formato de custom commands do Gemini CLI.

### Behaviors

- **gemini-instala-commands**: ao rodar `midas init` com o Gemini CLI
  selecionado, os quatro comandos TOML são escritos e os caminhos aparecem no
  relatório do init na camada de slash commands — o Gemini deixa de constar em
  "skipped".
- **gemini-argumentos**: nos comandos TOML, a menção ao argumento do workflow
  usa o placeholder de argumentos do Gemini CLI (`{{args}}`), de modo que o
  texto digitado após `/midas:spec` chegue ao prompt como a descrição da
  feature (e equivalente nos demais comandos).
- **gemini-sem-skills**: o Gemini CLI não recebe skills (não há convenção de
  skills suportada); na camada de skills do relatório ele consta como não
  suportado, sem ser tratado como erro.

---

## Geração e formatos de arquivo

Regras transversais de geração que os novos destinos exigem.

### Components

- **Formato de comando TOML**: novo formato de renderização de slash command,
  além dos formatos markdown já existentes (com e sem frontmatter YAML),
  produzindo TOML válido com `description` e `prompt` (strings multilinha
  escapadas corretamente).
- **Formato de workflow do Antigravity**: renderização de slash command em
  markdown com frontmatter YAML contendo `description`, compatível com o
  leitor de workflows do Antigravity.

### Behaviors

- **conteudo-unico-por-workflow**: todos os formatos (SKILL.md, command
  markdown, workflow markdown, command TOML) são gerados a partir do mesmo
  template de workflow — mudar o texto de um workflow atualiza todas as
  ferramentas na próxima execução do `midas init`.
- **toml-valido**: os arquivos TOML gerados são parseáveis por um parser TOML
  padrão, mesmo quando o corpo do workflow contém aspas, crases ou múltiplas
  linhas.
- **falha-isolada-por-ferramenta**: se a escrita para uma ferramenta falhar
  (ex.: permissão negada no diretório), as demais ferramentas selecionadas
  continuam sendo instaladas e a ferramenta com falha é reportada como
  skipped, como já ocorre hoje.

---

## Relatório do init

Como o resultado da instalação é comunicado ao usuário.

### Components

- **Seções por camada**: o relatório humano do `midas init` continua com as
  camadas "Slash commands" e "Skills", listando por ferramenta os arquivos
  escritos; o payload `--json` continua refletindo as mesmas informações.

### Behaviors

- **skipped-significa-sem-camada**: ferramentas selecionadas que não têm
  destino numa camada aparecem como skipped apenas naquela camada (ex.: Codex
  em commands, Gemini CLI em skills). Como o registro só contém ferramentas
  suportadas, nenhuma ferramenta aparece como skipped nas duas camadas ao
  mesmo tempo.
- **relatorio-lista-novos-caminhos**: após este spec, uma execução de
  `midas init --tools codex,antigravity,gemini` lista no relatório os caminhos
  reais escritos em `~/.codex/skills/`, `~/.gemini/antigravity/` e
  `~/.gemini/commands/midas/`.

---

## Open Questions

- None
