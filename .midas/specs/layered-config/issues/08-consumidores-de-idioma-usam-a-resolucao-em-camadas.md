# 08 — Consumidores de idioma usam a resolução em camadas

**Source:** Idioma nas duas camadas — idioma-resolvido-em-camadas, init-nao-pergunta-idioma-no-repo

**Summary:** `midas instructions` e a saída humana dos comandos passam a usar o idioma resolvido pelas camadas (projeto > global > `en-US`), e o init do repo não grava mais `language`.

## Functional Specification

- Todos os consumidores do idioma (`midas instructions` — campo `language` e directive — e o catálogo de mensagens da saída humana) usam o valor resolvido conforme a precedência projeto > global > default `en-US`.
- Um `language` no config do projeto sobrescreve o global apenas naquele repo; sem override, vale o global; sem global, vale `en-US`.
- A validação de valores de idioma existente (`en-US`/`pt-BR`, erro claro para valor inválido) se aplica ao valor de qualquer camada.
- O init do repo não pergunta idioma nem escreve `language` no config do projeto (o override é edição manual).

## Preconditions

- Resolução de config em camadas (issue 01).
- Feature de idioma existente (`src/lib/language.ts`, `src/lib/messages.ts`, payload do `instructions`).

## Main Flow

1. Trocar a fonte do idioma nos consumidores (`instructions`, mensagens humanas) pela resolução em camadas.
2. Garantir que a validação de idioma inválido cubra o valor vindo de qualquer camada, nomeando o valor e os suportados.
3. Testar as combinações: só global, só projeto, override do projeto sobre o global, nenhuma camada (default), valor inválido em cada camada.

## Expected Result

- Testes mostram `midas instructions` e a saída humana respeitando o idioma resolvido em cada combinação de camadas, com erro claro para valores inválidos.

## Blocked by

- [01 — Resolver config em camadas](01-resolver-config-em-camadas.md)

## Open Questions

- None
