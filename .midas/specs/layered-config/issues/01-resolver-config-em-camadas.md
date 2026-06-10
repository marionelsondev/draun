# 01 — Resolver config em camadas

**Source:** Configuração em camadas — config-precedence, specs-root-fixa, campos-fora-de-escopo-ignorados, config-do-projeto-opcional

**Summary:** Criar a resolução de configuração que combina `~/.midas/config.yaml` (global) e `<repo>/.midas/config.yaml` (projeto) com precedência projeto > global > defaults.

## Functional Specification

- Uma função de lib carrega o config global do diretório home do usuário (`~/.midas/config.yaml`) e o config do projeto (`<repo>/.midas/config.yaml`) e devolve a configuração efetiva por campo: `language`, `tools`, `context`, `rules`.
- Precedência por campo: valor do projeto > valor global > default embutido (`language: en-US`, `tools` vazio, `context`/`rules` ausentes). Campo ausente numa camada cai para a seguinte.
- `tools` só é lido do config global; uma chave `tools` no config do projeto é ignorada.
- A chave `specsRoot` é ignorada em qualquer camada; o caminho das specs é sempre `<repo>/.midas/specs`, fixo.
- A ausência de qualquer um dos dois arquivos (ou de ambos) não é erro: a resolução segue com as camadas existentes e os defaults.
- YAML malformado em uma camada é tratado como camada ausente (mesmo comportamento tolerante do parser atual).

## Preconditions

- Parser YAML (`js-yaml`) e helpers de leitura de config existentes em `src/lib/init.ts`.

## Main Flow

1. Implementar a resolução em camadas na lib, com o caminho global derivado do home do usuário e o caminho do projeto derivado da raiz do repo.
2. Substituir as leituras diretas de `midas.config.yaml` na lib pela nova resolução (os consumidores de idioma ficam para a issue 08).
3. Remover `specsRoot` da superfície de configuração: o caminho das specs vira constante fixa `.midas/specs`.
4. Cobrir com testes em diretórios temporários: só global, só projeto, ambos (override), nenhum, `tools` no projeto ignorado, `specsRoot` ignorado, YAML malformado.

## Expected Result

- Testes de lib demonstram a precedência por campo e os casos de camada ausente/ignorada.
- Nenhum código de lib lê mais `midas.config.yaml` da raiz do repo.

## Blocked by

- None

## Open Questions

- None
