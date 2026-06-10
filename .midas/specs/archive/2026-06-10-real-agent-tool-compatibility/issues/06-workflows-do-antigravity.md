# 06 — Antigravity: workflows globais

**Source:** Instalação para o Antigravity — Workflows do Antigravity, antigravity-instala-skills-e-workflows, antigravity-reinstalacao-idempotente; Geração e formatos de arquivo — Formato de workflow do Antigravity

**Summary:** Instalar os quatro workflows do Antigravity em `~/.gemini/antigravity/global_workflows/`, invocáveis como `/midas-spec` etc.

## Functional Specification

- Com o Antigravity selecionado, `midas init` escreve `midas-spec.md`, `midas-break.md`, `midas-implement.md` e `midas-archive.md` em `~/.gemini/antigravity/global_workflows/`.
- Cada arquivo é markdown com frontmatter YAML contendo `description`, seguido do corpo do workflow — gerado a partir do mesmo `WorkflowTemplate` dos demais formatos.
- Os workflows aparecem no relatório do init na camada de slash commands, junto dos commands das outras ferramentas.
- Rodar `midas init` novamente sobrescreve os arquivos com o conteúdo atual dos templates, sem duplicar nem deixar resíduo (idempotência).

## Preconditions

- Entrada `antigravity` no registro com skills funcionando (issue 05).
- Gerador de commands em `src/lib/commands-gen.ts` com o estilo de frontmatter YAML existente.

## Main Flow

1. Declarar na entrada do Antigravity um destino global de commands com `pathFor` → `.gemini/antigravity/global_workflows/midas-<nome>.md` e frontmatter YAML com `description` (avaliar se o estilo `yaml` atual atende ou se o `argument-hint` precisa ser omitido para o leitor de workflows do Antigravity).
2. Cobrir com testes: `midas init --tools antigravity` (home temporário) escreve os quatro workflows e os reporta na camada de commands; segunda execução regrava sem erro e sem arquivos extras.

## Expected Result

- Testes novos passam e a suíte completa permanece verde.
- `midas init --tools antigravity --json` com home isolado mostra os quatro caminhos `~/.gemini/antigravity/global_workflows/midas-*.md` na seção de commands, além das skills da issue 05.

## Blocked by

- [05 — Antigravity: entrada no registro, detecção e skills](05-antigravity-registro-e-skills.md)

## Open Questions

- None
