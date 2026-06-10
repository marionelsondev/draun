# 07 — Update regenera as integrações globais

**Source:** Instalação global das integrações — regeneracao-pelo-update

**Summary:** `midas update` relê o `tools` do config global e regenera as skills e commands globais, preservando arquivos alheios.

## Functional Specification

- `midas update` lê `tools` de `~/.midas/config.yaml` e regenera as integrações globais (skills e commands) para essas ferramentas.
- Arquivos gerenciados pelo Midas são sobrescritos; arquivos alheios nas mesmas pastas são preservados.
- Ferramentas puladas (destino global indeterminável) são reportadas sem abortar as demais.
- Quando o config global não existe, o comando falha com erro claro orientando a rodar `midas init` primeiro.
- O comando não depende de estar dentro de um projeto e não escreve nada no repo.

## Preconditions

- Resolução de config em camadas (issue 01).
- Geração de integrações nas pastas globais (issue 04).

## Main Flow

1. Apontar o `midas update` para o config global como fonte do `tools`.
2. Remover do update qualquer escrita dentro do repo (skills/commands por projeto).
3. Testar com home temporário: regeneração sobrescrevendo arquivos do Midas, preservação de arquivos alheios, erro quando o global não existe.

## Expected Result

- `midas update` fora de qualquer repo regenera as skills/commands globais conforme o `tools` global; com global ausente, retorna o erro orientando o init.

## Blocked by

- [01 — Resolver config em camadas](01-resolver-config-em-camadas.md)
- [04 — Gerar integrações nas pastas globais](04-gerar-integracoes-nas-pastas-globais.md)

## Open Questions

- None
