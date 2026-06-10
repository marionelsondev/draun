# 06 — Init do repo mínimo e sem perguntas

**Source:** midas init no repositório — init-cria-estrutura, init-idempotente

**Summary:** `midas init` num repo cria `.midas/specs/`, o `.midas/config.yaml` mínimo (só `context` e `rules`) e o bloco gerenciado do `AGENTS.md`, sem nenhuma pergunta.

## Functional Specification

- Com o config global já existente, `midas init` num repo não faz nenhuma pergunta: cria `.midas/specs/`, escreve `.midas/config.yaml` a partir de um template comentado contendo apenas `context` e `rules` (sem `tools`, sem `specsRoot`, sem `language`) e cria ou atualiza o bloco gerenciado do `AGENTS.md`.
- Rodar `midas init` num repo já inicializado é idempotente: preserva o `config.yaml` existente e o conteúdo do `AGENTS.md` fora do bloco gerenciado, recriando apenas o que faltar (pasta de specs, config ausente, bloco ausente).
- O relatório do init (humano e `--json`) informa o que foi criado, atualizado ou já existia.
- O template antigo `midas.config.yaml` na raiz não é mais criado em nenhuma circunstância.

## Preconditions

- Descoberta da raiz pela pasta `.midas/` (issue 02).
- Setup global no primeiro init (issue 05), para o init delegar ao fluxo global quando for a primeira execução.
- Gerador do bloco do `AGENTS.md` existente (`src/lib/agents-md.ts`).

## Main Flow

1. Reescrever `initProject` para criar `.midas/specs/` e `.midas/config.yaml` com o novo template mínimo.
2. Encadear: setup global (se necessário) → estrutura do repo → bloco do `AGENTS.md`, sem prompts na fase do repo.
3. Atualizar `midas init` (comando) e o relatório de saída para o novo fluxo.
4. Testar: init em repo virgem (com global existente), re-execução idempotente preservando config e AGENTS.md, e relatório correto em ambos os modos.

## Expected Result

- Em um repo virgem com global configurado, `midas init` termina sem nenhum prompt e deixa `.midas/specs/`, `.midas/config.yaml` mínimo e o bloco do `AGENTS.md`; rodar de novo não altera nada e reporta isso.

## Blocked by

- [02 — Descobrir a raiz do projeto pela pasta .midas](02-descobrir-a-raiz-do-projeto-pela-pasta-midas.md)
- [05 — Setup global no primeiro init](05-setup-global-no-primeiro-init.md)

## Open Questions

- None
