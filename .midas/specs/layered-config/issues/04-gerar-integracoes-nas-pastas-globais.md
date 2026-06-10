# 04 — Gerar integrações nas pastas globais

**Source:** Instalação global das integrações — skills-instaladas-no-global, ferramenta-nao-instalada

**Summary:** A geração de skills e slash commands passa a escrever nos diretórios globais das ferramentas, deixando de gerar qualquer arquivo dentro dos repositórios.

## Functional Specification

- A geração de skills e commands escreve os arquivos do Midas nos diretórios globais de cada ferramenta selecionada (issue 03), criando os diretórios quando necessário.
- Arquivos alheios já existentes nas mesmas pastas globais são preservados; apenas os arquivos gerenciados pelo Midas são escritos/sobrescritos.
- Ferramentas cujo diretório global não pode ser determinado ou criado são reportadas como puladas no resultado da geração, sem abortar as demais.
- Nenhum caminho de geração escreve mais skills ou commands dentro do repo (`.claude/`, etc. na raiz do projeto deixam de ser alvos).

## Preconditions

- Destinos globais por ferramenta no registry (issue 03).
- Geradores existentes (`src/lib/skills-gen.ts`, `src/lib/commands-gen.ts`).

## Main Flow

1. Apontar os geradores de skills e commands para os destinos globais do descriptor da ferramenta.
2. Atualizar o relatório de geração (arquivos escritos por ferramenta, ferramentas puladas) para refletir os caminhos globais.
3. Atualizar os testes de geração para usarem um home temporário, cobrindo: geração em pasta nova, preservação de arquivos alheios, sobrescrita de arquivos do Midas e ferramenta pulada.

## Expected Result

- Testes demonstram skills/commands gerados sob o home temporário e nenhum arquivo gerado dentro do diretório do projeto.

## Blocked by

- [03 — Destinos globais por ferramenta no registry](03-destinos-globais-por-ferramenta-no-registry.md)

## Open Questions

- None
