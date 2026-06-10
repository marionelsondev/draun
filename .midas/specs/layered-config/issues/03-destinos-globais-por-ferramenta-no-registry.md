# 03 — Destinos globais por ferramenta no registry

**Source:** Instalação global das integrações — Destino global por ferramenta

**Summary:** Cada ferramenta do registry de agentes passa a declarar os caminhos globais (na home do usuário) onde suas skills e slash commands devem ser instalados.

## Functional Specification

- O registry de ferramentas (`src/lib/tools.ts`) expõe, para cada ferramenta, os diretórios globais de skills e de commands (ex.: `~/.claude/skills` e `~/.claude/commands` para o Claude Code), resolvidos a partir do home do usuário.
- Ferramentas para as quais um destino global não se aplica ou não pode ser determinado são identificáveis como tal (para serem reportadas como puladas na geração).
- A detecção de ferramenta instalada continua funcionando como hoje; esta issue só adiciona os destinos globais.

## Preconditions

- Registry de ferramentas existente com os caminhos por projeto.

## Main Flow

1. Estender o descriptor de cada ferramenta com os caminhos globais de skills e commands.
2. Resolver os caminhos a partir do home do usuário em tempo de execução (sem hardcode de path absoluto).
3. Cobrir com testes unitários a resolução dos destinos globais por ferramenta.

## Expected Result

- Testes mostram que cada ferramenta do registry resolve seus diretórios globais corretamente a partir de um home injetável/controlável.

## Blocked by

- None

## Open Questions

- None
