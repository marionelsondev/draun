# 04 — Instalar comandos TOML para o Gemini CLI

**Source:** Instalação para o Gemini CLI — gemini-instala-commands, gemini-argumentos, gemini-sem-skills

**Summary:** Declarar o destino global de comandos do Gemini CLI para que o `midas init` instale os quatro comandos TOML em `~/.gemini/commands/midas/`.

## Functional Specification

- Com o Gemini CLI selecionado, `midas init` escreve `spec.toml`, `break.toml`, `implement.toml` e `archive.toml` em `~/.gemini/commands/midas/`, invocáveis como `/midas:spec`, `/midas:break`, `/midas:implement` e `/midas:archive`.
- Cada arquivo usa o formato TOML da issue 03, com `description` e `prompt`.
- O `prompt` referencia o argumento do usuário via placeholder `{{args}}` do Gemini CLI, de modo que o texto digitado após o comando chegue ao prompt (equivalente ao `ARGUMENTS` dos commands do Claude Code).
- O Gemini deixa de constar como skipped na camada de commands; na camada de skills continua skipped, sem erro.
- A detecção do Gemini permanece inalterada (pasta `.gemini/` ou `GEMINI.md`).

## Preconditions

- Formato TOML disponível no gerador de commands (issue 03).
- Entrada `gemini` existente no `TOOL_REGISTRY`, hoje sem destinos de instalação.

## Main Flow

1. Adicionar à entrada do Gemini um destino global de commands com `pathFor` → `.gemini/commands/midas/<nome>.toml` e formato `toml`.
2. Garantir que a renderização TOML inclua a referência `{{args}}` ao argumento (apenas para comandos com `argumentHint`).
3. Cobrir com teste: `midas init --tools gemini` (home temporário) escreve os quatro `.toml`, reporta o Gemini em commands e o mantém skipped em skills; conteúdo contém `{{args}}` quando há argumento.

## Expected Result

- Testes novos passam e a suíte completa permanece verde.
- `midas init --tools gemini --json` com home isolado mostra os quatro caminhos `~/.gemini/commands/midas/*.toml` na seção de commands.

## Blocked by

- [03 — Formato de comando TOML](03-formato-de-comando-toml.md)

## Open Questions

- None
