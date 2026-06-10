# 02 — Instalar skills para o Codex CLI

**Source:** Instalação para o Codex CLI — codex-instala-skills, codex-sem-commands

**Summary:** Declarar o destino global de skills do Codex CLI para que o `midas init` instale as quatro skills em `~/.codex/skills/`.

## Functional Specification

- Com o Codex selecionado, `midas init` escreve `midas-spec/SKILL.md`, `midas-break/SKILL.md`, `midas-implement/SKILL.md` e `midas-archive/SKILL.md` em `~/.codex/skills/`, no mesmo formato Agent Skills já gerado para Claude Code e Windsurf (frontmatter YAML com `name` e `description` + corpo do workflow).
- O Codex deixa de constar como skipped na camada de skills do relatório do init; os caminhos escritos aparecem listados.
- O Codex não recebe arquivos de slash command (custom prompts deprecados): na camada de commands ele continua como skipped, sem erro.
- A detecção do Codex permanece inalterada (pasta `.codex/` na raiz).

## Preconditions

- Entrada `codex` existente no `TOOL_REGISTRY` (`src/lib/tools.ts`), hoje sem destinos de instalação.
- Gerador de skills (`src/lib/skills-gen.ts`) que já escreve em qualquer `global.skillsDir` declarado.

## Main Flow

1. Adicionar `global.skillsDir: '.codex/skills'` (e `skillsDir` de projeto, se aplicável ao padrão das demais entradas) à entrada do Codex.
2. Cobrir com teste: `midas init --tools codex` (home temporário) escreve as quatro skills e reporta o Codex em skills, mantendo-o skipped em commands.

## Expected Result

- Teste novo passa e a suíte completa permanece verde.
- `midas init --tools codex --json` com home isolado mostra os quatro caminhos `~/.codex/skills/midas-*/SKILL.md` na seção de skills.

## Blocked by

- None

## Open Questions

- None
