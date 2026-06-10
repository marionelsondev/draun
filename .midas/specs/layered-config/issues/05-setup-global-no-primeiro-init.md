# 05 — Setup global no primeiro init

**Source:** Setup global (primeira execução) — primeiro-init-faz-setup-global, setup-global-nao-interativo

**Summary:** Quando `~/.midas/config.yaml` não existe, `midas init` executa o setup global: pergunta agentes e idioma, grava o config global e instala as integrações globais.

## Functional Specification

- A ausência de `~/.midas/config.yaml` dispara o setup global no início do `midas init`, antes da inicialização do repo.
- No setup global, o usuário escolhe agentes de IA (picker existente) e idioma (picker existente); as escolhas são gravadas em `~/.midas/config.yaml` como `tools` e `language`.
- Após gravar o config global, as integrações globais (skills e commands) são geradas para as ferramentas selecionadas, reportando ferramentas puladas.
- Em modo não interativo (sem TTY ou com `--json`), o setup global aceita as escolhas via flags de linha de comando (ferramentas e idioma); sem as flags necessárias, falha com erro claro nomeando as flags esperadas, em vez de travar esperando input.
- Quando `~/.midas/config.yaml` já existe, nada do setup global roda e nenhuma pergunta é feita.

## Preconditions

- Resolução de config em camadas (issue 01) para leitura/escrita do config global.
- Geração de integrações nas pastas globais (issue 04).
- Pickers interativos de ferramentas e idioma existentes.

## Main Flow

1. Detectar a primeira execução pela ausência do config global.
2. Conduzir os pickers (ou ler as flags em modo não interativo) e gravar `tools` e `language` em `~/.midas/config.yaml`.
3. Invocar a geração das integrações globais e incluir o resultado no relatório do init (humano e `--json`).
4. Testar com home temporário: primeira execução interativa simulada via flags, modo não interativo sem flags (erro claro), segunda execução sem perguntas.

## Expected Result

- Num home limpo, `midas init` com flags cria `~/.midas/config.yaml` com `tools` e `language` e gera as integrações globais; numa segunda execução, nada é perguntado nem regravado no global.

## Blocked by

- [01 — Resolver config em camadas](01-resolver-config-em-camadas.md)
- [04 — Gerar integrações nas pastas globais](04-gerar-integracoes-nas-pastas-globais.md)

## Open Questions

- None
