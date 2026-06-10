# Layered Config

## Overview

A configuração do MidasSpec passa a ter duas camadas: um config global por usuário em `~/.midas/config.yaml` (preferências pessoais — agentes de IA e idioma) e um config por projeto em `<repo>/.midas/config.yaml` (dados do projeto — `context`, `rules` e override opcional de idioma). O arquivo `midas.config.yaml` na raiz do repositório deixa de existir e a opção `specsRoot` é removida: as specs vivem sempre em `.midas/specs`, por convenção fixa. Como o pacote ainda não foi publicado, não há retrocompatibilidade com o caminho antigo.

Com isso, a seleção de agentes de IA e de idioma acontece uma única vez por máquina, no primeiro `midas init`: as skills e os slash commands dos agentes passam a ser instalados nas pastas globais de cada ferramenta (ex.: `~/.claude`) e funcionam em qualquer projeto. O `midas init` num repositório já configurado não faz nenhuma pergunta — apenas cria a estrutura do projeto e o bloco gerenciado do `AGENTS.md`.

---

## Configuração em camadas

Os dois arquivos de config e a regra de precedência entre eles.

### Components

- **Config global**: `~/.midas/config.yaml` (resolvido a partir do diretório home do usuário do sistema operacional). Guarda as preferências pessoais: `tools` (ids dos agentes de IA selecionados) e `language` (idioma default).
- **Config do projeto**: `<repo>/.midas/config.yaml`. Guarda o que pertence ao projeto: `context` (background mostrado às skills de IA), `rules` (regras por artefato) e, opcionalmente, `language` como override do global. Não contém `tools` nem `specsRoot`.
- **Raiz do projeto**: a presença da pasta `.midas/` identifica a raiz de um projeto inicializado; o config do projeto é opcional dentro dela.

### Behaviors

- **config-precedence**: Para cada campo, o valor efetivo é resolvido na ordem: config do projeto > config global > default embutido (`language: en-US`, `tools` vazio, `context`/`rules` ausentes). Campos ausentes numa camada caem para a camada seguinte.
- **specs-root-fixa**: As specs vivem sempre em `<repo>/.midas/specs`. Nenhum config aceita `specsRoot`; se a chave aparecer num config, ela é ignorada.
- **campos-fora-de-escopo-ignorados**: Uma chave `tools` no config do projeto não tem efeito — a seleção de agentes é exclusivamente global.
- **config-do-projeto-opcional**: Comandos que leem config funcionam num projeto cujo `.midas/` não contém `config.yaml`, usando apenas o global e os defaults.

---

## Setup global (primeira execução)

O fluxo interativo que cria `~/.midas/config.yaml`, executado uma única vez por máquina.

### Components

- **Detecção de primeira execução**: A ausência de `~/.midas/config.yaml` indica que o setup global ainda não foi feito.
- **Seletor de agentes**: O picker interativo existente de ferramentas de IA, agora alimentando o config global.
- **Seletor de idioma**: O picker interativo existente de idioma (`en-US`, `pt-BR`), agora alimentando o config global.

### Behaviors

- **primeiro-init-faz-setup-global**: Quando `midas init` roda e `~/.midas/config.yaml` não existe, o setup global acontece antes da inicialização do repo: o usuário escolhe agentes e idioma, o arquivo global é criado com `tools` e `language`, e as integrações globais são instaladas. Em seguida, na mesma execução, o repo é inicializado.
- **init-sem-perguntas-quando-global-existe**: Quando `~/.midas/config.yaml` já existe, `midas init` não faz nenhuma pergunta — pula direto para a inicialização do repo usando as preferências globais.
- **setup-global-nao-interativo**: Em modo não interativo (flags ou `--json` sem TTY), o setup global aceita as escolhas via opções de linha de comando; sem elas, falha com erro claro pedindo as flags, em vez de travar esperando input.

---

## Instalação global das integrações

Skills e slash commands dos agentes passam a ser instalados nas pastas globais de cada ferramenta, valendo para todos os projetos.

### Components

- **Destino global por ferramenta**: Cada ferramenta do registry ganha, além dos caminhos por projeto, o caminho global onde suas skills e commands devem ser instalados (ex.: `~/.claude/skills` e `~/.claude/commands` para o Claude Code).

### Behaviors

- **skills-instaladas-no-global**: Durante o setup global, as skills e os slash commands do Midas são gerados nas pastas globais de cada ferramenta selecionada em `tools`. Nada de skills ou commands é gerado dentro dos repositórios.
- **regeneracao-pelo-update**: `midas update` relê o `tools` do config global e regenera as integrações globais (skills, commands), sobrescrevendo os arquivos gerenciados pelo Midas e preservando arquivos alheios nas mesmas pastas.
- **ferramenta-nao-instalada**: Ferramentas selecionadas cujo diretório global não pode ser determinado ou criado são reportadas como puladas, sem abortar o restante da geração.

---

## midas init no repositório

A inicialização por projeto, agora mínima e sem interação.

### Components

- **Estrutura do projeto**: A pasta `.midas/specs/` e o arquivo `.midas/config.yaml` com o template comentado contendo apenas `context` e `rules`.
- **Bloco do AGENTS.md**: O bloco gerenciado pelo Midas no `AGENTS.md` da raiz do repo, como já existe hoje.

### Behaviors

- **init-cria-estrutura**: `midas init` num repo cria `.midas/specs/`, escreve `.midas/config.yaml` a partir do template do projeto (sem `tools`, sem `specsRoot`, sem `language`) e cria ou atualiza o bloco gerenciado do `AGENTS.md`. Nenhuma pergunta é feita (assumindo o global já configurado).
- **init-idempotente**: Rodar `midas init` num repo já inicializado preserva o `config.yaml` existente e o conteúdo fora do bloco gerenciado do `AGENTS.md`, recriando apenas o que estiver faltando.
- **descoberta-da-raiz**: Comandos executados em subdiretórios localizam a raiz do projeto subindo a árvore de diretórios até encontrar a pasta `.midas/`; quando nenhuma é encontrada, falham com o erro padrão de projeto não inicializado.

---

## Idioma nas duas camadas

Ajuste da feature de idioma existente para o modelo em camadas.

### Components

- **language global**: Campo `language` em `~/.midas/config.yaml`, escolhido no setup global. Default pessoal para todos os projetos.
- **language do projeto**: Campo `language` opcional em `<repo>/.midas/config.yaml`, editado à mão, que sobrescreve o global naquele repo (ex.: projeto de time com specs em inglês).

### Behaviors

- **idioma-resolvido-em-camadas**: Todos os consumidores do idioma (`midas instructions`, saída humana dos comandos) usam o valor resolvido conforme **config-precedence**; o comportamento de cada consumidor permanece o já especificado na spec de configuração de idioma.
- **init-nao-pergunta-idioma-no-repo**: O `midas init` por projeto não pergunta idioma nem grava `language` no config do projeto; o override é manual.

---

## Open Questions

- None
