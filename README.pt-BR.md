[English](./README.md) | **Português (Brasil)**

# MidasSpec

CLI de Spec-Driven Development (SDD). O `midas` cria a estrutura de specs, valida os arquivos markdown de SPEC/issues, acompanha o progresso das issues com um grafo de dependências — e instala o fluxo SDD nos seus agentes de IA (Claude Code, Cursor, Windsurf e qualquer agente que leia `AGENTS.md`).

O markdown é a única fonte de verdade: o CLI lê e edita `SPEC.md`, `issues/*.md` e `issues/INDEX.md` — nunca os substitui. Os agentes de IA fazem a escrita criativa; o CLI garante estrutura, consistência e acompanhamento.

## Instalação

```bash
npm install -g midasspec
```

Requer Node.js 18+. Verifique com `midas --version` (imprime `midasspec@x.y.z`).

## Configuração inicial

```bash
cd seu-projeto
midas init
```

O primeiro `init` na sua máquina executa um setup global único: escolha suas ferramentas de IA e o idioma (`en-US` ou `pt-BR`), salvos em `~/.midas/config.yaml`. Cada `init` de projeto então cria `.midas/specs/` e um `.midas/config.yaml` mínimo, e gera três camadas de integração para as ferramentas configuradas:

- **Bloco gerenciado no `AGENTS.md`** — instruções SDD entre os marcadores `<!-- midas:begin -->` / `<!-- midas:end -->`; o seu conteúdo nunca é alterado.
- **Slash commands** — `/midas:spec`, `/midas:analyze`, `/midas:break`, `/midas:implement`, `/midas:archive` no formato nativo de cada ferramenta.
- **Skills de agente** — `midas-spec`, `midas-analyze`, `midas-break`, `midas-implement`, `midas-archive` (`SKILL.md`) na pasta de skills de cada ferramenta.

Sem interação:

```bash
midas init --tools claude,cursor --language pt-BR   # seleção explícita
midas init --tools all                              # todas as ferramentas suportadas
midas init --force                                  # reusa a config global, sem prompt
```

## O fluxo

1. `/midas:spec "fluxo de pagamento"` — seu agente cria `.midas/specs/fluxo-de-pagamento/` e escreve o `SPEC.md`
2. `/midas:analyze` — *(opcional)* seu agente revisa a spec em busca de ambiguidades, lacunas e riscos antes do detalhamento
3. `/midas:break` — seu agente quebra a spec em `issues/*.md` + `issues/INDEX.md` com dependências
4. `/midas:implement` — seu agente implementa as issues prontas (modo `manual`, `auto` ou `ultracode` paralelo), registrando cada uma com `start`/`done`
5. `midas status` — acompanhe o progresso
6. `/midas:archive` — valida e arquiva a spec concluída

Cada etapa também funciona sem agente, com os comandos abaixo.

## Comandos

Todo comando aceita `--json` para saída legível por máquina (é assim que os slash commands e skills usam o CLI). Exit code 0 em sucesso, diferente de zero em erro.

| Comando | O que faz |
| --- | --- |
| `midas init [--tools <ids\|all>] [--language <lang>] [--force]` | Prepara o repositório: setup global na primeira execução, depois a estrutura `.midas/` e as integrações dos agentes. |
| `midas update` | Regenera os arquivos globais de integração (commands/skills) após atualizar o CLI. |
| `midas new <nome>` | Cria a pasta de uma nova spec com slug derivado do nome. |
| `midas status [slug]` | Sem slug: todas as specs agrupadas por ciclo de vida (em andamento / não iniciadas / não detalhadas / concluídas), cada uma com barra de progresso e a próxima issue acionável. Com slug: detalhe por issue. |
| `midas issues <slug> [--ready\|--blocked\|--done]` | Lista as issues de uma spec com filtros cientes das dependências. `--ready` = sem bloqueios pendentes. |
| `midas start <slug> <número>` | Marca uma issue como em andamento (`[~]` no INDEX.md). |
| `midas done <slug> <número>` | Marca uma issue como concluída (`[x]`) e informa as issues recém-desbloqueadas. |
| `midas reopen <slug> <número>` | Reabre uma issue concluída (`[ ]`). |
| `midas validate <slug>` | Valida o SPEC.md, os arquivos de issues e a consistência do INDEX.md. |
| `midas instructions <spec\|break\|analyze> [--spec <slug>]` | Emite as instruções de escrita do artefato (template, contexto, regras) para as skills de IA. |
| `midas archive <slug> [--force]` | Move uma spec concluída para `.midas/specs/archive/`. |

## Slash commands / skills

Gerados para cada ferramenta configurada; commands e skills são os mesmos cinco workflows:

| Workflow | O que o agente faz |
| --- | --- |
| `/midas:spec [descrição-da-feature]` | Recebe uma descrição livre do que você quer, deriva o nome da spec, cria a estrutura, faz perguntas de esclarecimento, escreve o `SPEC.md` seguindo o template e as regras do projeto, e valida. |
| `/midas:analyze [spec-slug]` | *(opcional)* Revisa o `SPEC.md` em busca de ambiguidades, casos de borda ausentes, comportamentos não testáveis e riscos de escopo, reportando os achados por severidade — somente leitura, nunca edita a spec. |
| `/midas:break [spec-slug]` | Quebra o `SPEC.md` em issues pequenas e verificáveis de forma independente, com grafo de dependências `blocked by`, e valida. |
| `/midas:implement [spec-slug] [manual\|auto\|ultracode]` | Implementa as issues prontas. `manual`: uma issue por vez, com etapa opcional de planejamento antes, você revisa entre elas. `auto`: todas as issues prontas em sequência via subagents (planner → implementer por issue). `ultracode`: workflow paralelo multi-agente seguindo o grafo de dependências; cai para `auto` se o agente não tiver a funcionalidade de workflow. |
| `/midas:archive [spec-slug]` | Confirma que todas as issues estão concluídas, valida e arquiva a spec. |

## Configuração

Duas camadas; o projeto sobrescreve o global.

`~/.midas/config.yaml` (global, escrito pelo primeiro `init`):

```yaml
tools:            # ferramentas de IA para gerar as integrações
  - claude
language: en-US   # en-US | pt-BR — idioma das specs/issues e da conversa com a IA
```

`.midas/config.yaml` (por projeto):

```yaml
# specsRoot: .midas/specs   # onde as specs ficam (padrão)
# language: pt-BR           # sobrescreve o idioma global
# context: |                # contexto do projeto mostrado às skills de IA
# rules:                    # regras por artefato para `midas instructions`
#   spec: []
#   break: []
#   analyze: []
```

A saída humana do CLI é sempre em inglês; `language` governa o conteúdo das specs/issues e a conversa com a IA.

## Ferramentas suportadas

Claude Code, Cursor, Windsurf, Codex CLI e Gemini CLI. Ferramentas sem convenção nativa de slash command ou skills ainda recebem a camada universal do `AGENTS.md`.

## Licença

MIT
