# 02 — Descobrir a raiz do projeto pela pasta .midas

**Source:** midas init no repositório — descoberta-da-raiz; Configuração em camadas — config-do-projeto-opcional

**Summary:** Comandos localizam a raiz do projeto subindo a árvore até encontrar a pasta `.midas/`, em vez de procurar `midas.config.yaml`.

## Functional Specification

- Comandos executados em qualquer subdiretório de um projeto inicializado encontram a raiz subindo a árvore de diretórios até o primeiro diretório que contém uma pasta `.midas/`.
- Quando nenhuma pasta `.midas/` é encontrada até a raiz do filesystem, os comandos que exigem projeto falham com o erro padrão de projeto não inicializado (exit não-zero; em `--json`, o shape `{"error":{"message"}}`).
- Um projeto cujo `.midas/` não contém `config.yaml` é válido: os comandos funcionam usando global + defaults.
- Nenhum comando procura mais `midas.config.yaml` na raiz do repo para nenhum fim.

## Preconditions

- Resolução de config em camadas (issue 01) disponível, para que a raiz encontrada alimente o caminho do config do projeto.

## Main Flow

1. Trocar a lógica atual de descoberta de raiz (baseada no arquivo de config na raiz) pela busca ascendente da pasta `.midas/`.
2. Atualizar todos os comandos que dependem da raiz (`status`, `issues`, `done`, `reopen`, `new`, `validate`, `instructions`, `archive`) para usarem a nova descoberta.
3. Atualizar os testes de comandos para fixtures com `.midas/` (com e sem `config.yaml`), incluindo execução a partir de subdiretório e o caso de projeto não inicializado.

## Expected Result

- Rodar um comando num subdiretório de um projeto com `.midas/` funciona; rodar fora de qualquer projeto retorna o erro padrão.
- Testes cobrem projeto sem `config.yaml` no `.midas/`.

## Blocked by

- [01 — Resolver config em camadas](01-resolver-config-em-camadas.md)

## Open Questions

- None
