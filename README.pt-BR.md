[English](./README.md) | **Português (Brasil)**

# Draun

CLI de Spec-Driven Development (SDD). O `draun` cria a estrutura de specs, valida os arquivos markdown de SPEC/issues, acompanha o progresso das issues com um grafo de dependências — e instala o fluxo SDD nos seus agentes de IA (Claude Code, Cursor, Windsurf, opencode, Grok e qualquer agente que leia `AGENTS.md`).

O markdown é a única fonte de verdade: o CLI lê e edita `SPEC.md`, `issues/*.md` e `issues/INDEX.md` — nunca os substitui. Os agentes de IA fazem a escrita criativa; o CLI garante estrutura, consistência e acompanhamento.

## Instalação

```bash
npm install -g draun
```

Requer Node.js 18+. Verifique com `draun --version` (imprime `draun@x.y.z`).

## Configuração inicial

```bash
cd seu-projeto
draun init
```

O primeiro `init` na sua máquina executa um setup global único: escolha suas ferramentas de IA e o idioma (`en-US` ou `pt-BR`), salvos em `~/.draun/config.yaml`. Cada `init` de projeto então cria `.draun/specs/` e um `.draun/config.yaml` mínimo, e gera duas camadas de integração para as ferramentas configuradas:

- **Bloco gerenciado no `AGENTS.md`** — instruções SDD entre os marcadores `<!-- draun:begin -->` / `<!-- draun:end -->`; o seu conteúdo nunca é alterado.
- **Skills de agente** — `draun-spec`, `draun-analyze`, `draun-break`, `draun-implement`, `draun-archive` (`SKILL.md`) na pasta de skills de cada ferramenta.

Sem interação:

```bash
draun init --tools claude,cursor --language pt-BR   # seleção explícita
draun init --tools all                              # todas as ferramentas suportadas
draun init --force                                  # reusa a config global, sem prompt
```

## O fluxo

1. `draun-spec "fluxo de pagamento"` — seu agente cria `.draun/specs/fluxo-de-pagamento/` e escreve o `SPEC.md`
2. `draun-analyze` — *(opcional)* seu agente revisa a spec em busca de ambiguidades, lacunas e riscos antes do detalhamento
3. `draun-break` — seu agente quebra a spec em `issues/*.md` + `issues/INDEX.md` com dependências
4. `draun-implement` — seu agente implementa as issues prontas (modo `manual`, `auto` ou `ultracode` paralelo), registrando cada uma com `start`/`done`
5. `draun status` — acompanhe o progresso
6. `draun-archive` — valida e arquiva a spec concluída

Cada etapa também funciona sem agente, com os comandos abaixo.

## Comandos

Todo comando aceita `--json` para saída legível por máquina (é assim que as skills usam o CLI). Exit code 0 em sucesso, diferente de zero em erro.

| Comando | O que faz |
| --- | --- |
| `draun init [--tools <ids\|all>] [--language <lang>] [--force]` | Prepara o repositório: setup global na primeira execução, depois a estrutura `.draun/` e as integrações dos agentes. |
| `draun config [--tools <ids\|all>] [--language <lang>] [--scope global\|project]` | TUI de configuração: lista Settings (Tools, Spec language) → Enter para editar → Esc voltar → `s` uma vez para salvar. Busca filtra a lista. Flags pulam a UI. Cria config global se faltar; sincroniza skills ao salvar. |
| `draun update` | Regenera os arquivos globais de integração (skills) após atualizar o CLI. |
| `draun new <nome>` | Cria a pasta de uma nova spec com slug derivado do nome. |
| `draun status [slug]` | Sem slug: todas as specs agrupadas por ciclo de vida (em andamento / não iniciadas / não detalhadas / concluídas), cada uma com barra de progresso e a próxima issue acionável. Com slug: detalhe por issue. |
| `draun issues <slug> [--ready\|--blocked\|--done]` | Lista as issues de uma spec com filtros cientes das dependências. `--ready` = sem bloqueios pendentes. |
| `draun start <slug> <número>` | Marca uma issue como em andamento (`[~]` no INDEX.md). |
| `draun done <slug> <número>` | Marca uma issue como concluída (`[x]`) e informa as issues recém-desbloqueadas. |
| `draun reopen <slug> <número>` | Reabre uma issue concluída (`[ ]`). |
| `draun validate <slug>` | Valida o SPEC.md, os arquivos de issues e a consistência do INDEX.md. |
| `draun instructions <spec\|break\|analyze> [--spec <slug>]` | Emite as instruções de escrita do artefato (template) para as skills de IA. |
| `draun archive <slug> [--force]` | Move uma spec concluída para `.draun/specs/archive/`. |

## Skills

Geradas para cada ferramenta configurada; as skills são os mesmos cinco workflows:

| Workflow | O que o agente faz |
| --- | --- |
| `draun-spec [descrição-da-feature]` | Recebe uma descrição livre do que você quer, deriva o nome da spec, cria a estrutura, faz perguntas de esclarecimento, escreve o `SPEC.md` seguindo o template do projeto, e valida. |
| `draun-analyze [spec-slug]` | *(opcional)* Revisa o `SPEC.md` em busca de ambiguidades, casos de borda ausentes, comportamentos não testáveis e riscos de escopo, reportando os achados por severidade — somente leitura, nunca edita a spec. |
| `draun-break [spec-slug]` | Quebra o `SPEC.md` em issues pequenas e verificáveis de forma independente, com grafo de dependências `blocked by`, e valida. |
| `draun-implement [spec-slug] [manual\|auto\|ultracode]` | Implementa as issues prontas. `manual`: uma issue por vez, com etapa opcional de planejamento antes, você revisa entre elas. `auto`: todas as issues prontas em sequência via subagents (planner → implementer por issue). `ultracode`: workflow paralelo multi-agente seguindo o grafo de dependências; cai para `auto` se o agente não tiver a funcionalidade de workflow. |
| `draun-archive [spec-slug]` | Confirma que todas as issues estão concluídas, valida e arquiva a spec. |

## Configuração

Duas camadas; o projeto sobrescreve o global.

`~/.draun/config.yaml` (global, escrito pelo primeiro `init` ou por `draun config`):

```yaml
tools:            # ferramentas de IA para gerar as integrações
  - claude
language: en-US   # en-US | pt-BR — idioma das specs/issues e da conversa com a IA
```

`.draun/config.yaml` (por projeto):

```yaml
# specsRoot: .draun/specs   # onde as specs ficam (padrão)
# language: pt-BR           # sobrescreve o idioma global
```

Use `draun config` no terminal: escolha um item na lista, edite, volte, e **salve uma vez** com `s`. O idioma pode ser global ou só do projeto após `draun init`. Não interativo: `--tools` / `--language` / `--scope`. Inspecione: `draun config --json`.

A saída humana do CLI é sempre em inglês; `language` governa o conteúdo das specs/issues e a conversa com a IA.

## Ferramentas suportadas

Claude Code, Cursor, Windsurf, Codex CLI, opencode e Grok. Ferramentas sem convenção nativa de skills ainda recebem a camada universal do `AGENTS.md`.

## Licença

MIT
