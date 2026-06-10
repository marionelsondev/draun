# 03 — Formato de comando TOML

**Source:** Geração e formatos de arquivo — Formato de comando TOML, toml-valido, conteudo-unico-por-workflow

**Summary:** Adicionar ao gerador de slash commands um formato TOML que produza arquivos válidos com `description` e `prompt` a partir dos templates de workflow.

## Functional Specification

- O renderizador de arquivos de comando suporta um novo formato `toml`, além dos formatos markdown existentes (`yaml` e `none`).
- O arquivo gerado contém os campos `description` (descrição do workflow) e `prompt` (corpo do workflow), em TOML parseável por um parser padrão.
- O escape é correto mesmo quando o corpo contém aspas duplas, crases, barras invertidas ou múltiplas linhas (usar string multilinha TOML com escaping adequado).
- O conteúdo é gerado a partir do mesmo `WorkflowTemplate` usado pelos demais formatos — nenhum texto duplicado.

## Preconditions

- Renderizador atual em `src/lib/commands-gen.ts` (`renderCommandFile`) com os estilos `yaml` e `none` definidos em `src/lib/tools.ts` (`FrontmatterStyle`).

## Main Flow

1. Estender o tipo de formato de comando para incluir `toml`.
2. Implementar a renderização TOML com escaping de strings multilinha.
3. Cobrir com testes: saída parseável (validar com um parser TOML nos testes ou asserções de escaping), campos `description` e `prompt` corretos, corpo com aspas/crases/quebras de linha preservado.

## Expected Result

- Testes novos passam e a suíte completa permanece verde.
- Para cada um dos quatro templates de workflow, a renderização TOML produz um documento válido cujos campos batem com `description` e `body` do template.

## Blocked by

- None

## Open Questions

- None
