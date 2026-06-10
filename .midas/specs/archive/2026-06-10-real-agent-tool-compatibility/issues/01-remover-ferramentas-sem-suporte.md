# 01 — Remover ferramentas sem suporte do registro

**Source:** Registro de ferramentas — Registro enxuto, picker-so-com-suportadas, tools-flag-rejeita-removidas, config-global-com-id-removido

**Summary:** Remover do registro as oito ferramentas sem convenção de instalação, de modo que o setup inicial liste apenas ferramentas funcionais.

## Functional Specification

- O registro de ferramentas contém apenas Claude Code, Cursor, Windsurf, Codex CLI e Gemini CLI (o Antigravity entra em issue própria); as entradas de GitHub Copilot, OpenCode, Cline, Roo Code, Kilo Code, Aider, Amazon Q e Zed são removidas.
- O picker interativo do `midas init` lista somente as ferramentas do registro — nenhuma opção sem suporte é oferecida.
- `midas init --tools <id>` com um id removido (ex.: `aider`, `zed`) falha com o erro padrão de ferramenta desconhecida, listando os ids válidos.
- `midas init --tools all` resolve apenas as ferramentas restantes do registro.
- Um config global existente que liste ids removidos não quebra o `midas init`: ids desconhecidos vindos do config são ignorados silenciosamente e apenas as ferramentas suportadas são instaladas.

## Preconditions

- Registro atual em `src/lib/tools.ts` com 13 ferramentas.
- Resolução de seleção via config global em `src/commands/init.ts` (filtra o registro pelos ids configurados, o que já ignora ids ausentes — confirmar com teste).

## Main Flow

1. Remover as oito entradas sem `commands`/`skillsDir` do `TOOL_REGISTRY`.
2. Confirmar que picker, `--tools` e `--tools all` derivam tudo do registro (sem listas duplicadas em outros pontos).
3. Cobrir com testes: erro para id removido, `all` retornando só as suportadas, e config global com id antigo sendo ignorado sem erro.

## Expected Result

- Testes novos passam e a suíte completa permanece verde.
- `midas init --tools aider` retorna erro com a lista de ids válidos; `midas init --tools all --json` lista apenas as ferramentas suportadas.

## Blocked by

- None

## Open Questions

- None
