# 05 — Antigravity: entrada no registro, detecção e skills

**Source:** Registro de ferramentas — Entrada do Antigravity, deteccao-antigravity, selecao-por-flag, antigravity-e-gemini-independentes; Instalação para o Antigravity — antigravity-instala-skills-e-workflows (parte de skills)

**Summary:** Adicionar o Antigravity ao registro com detecção por `.agents/`/`.agent/` e instalação das quatro skills globais em `~/.gemini/antigravity/skills/`.

## Functional Specification

- Nova entrada no registro com id `antigravity` e nome "Antigravity".
- Detecção: a presença da pasta `.agents/` (convenção atual) OU `.agent/` (convenção antiga) na raiz do repositório marca o Antigravity como detectado no picker do `midas init`.
- `midas init --tools antigravity` (isolado, em lista ou via `--tools all`) seleciona a ferramenta sem prompt.
- Com o Antigravity selecionado, `midas init` escreve as quatro skills (`midas-spec`, `midas-break`, `midas-implement`, `midas-archive`, cada uma com `SKILL.md` no padrão Agent Skills) em `~/.gemini/antigravity/skills/`, listadas no relatório na camada de skills.
- Antigravity e Gemini CLI são entradas independentes: selecionar um não instala arquivos do outro, e instalar os dois não gera conflito (destinos sob `~/.gemini` não se sobrepõem).

## Preconditions

- Registro e detecção em `src/lib/tools.ts` (`TOOL_REGISTRY`, `detectTools`), gerador de skills em `src/lib/skills-gen.ts`.
- Issue 01 concluída (registro já enxuto, evitando edições conflitantes no mesmo arquivo).

## Main Flow

1. Adicionar a entrada `antigravity` com `global.skillsDir: '.gemini/antigravity/skills'` e detecção pelas pastas `.agents/` e `.agent/`.
2. Cobrir com testes: detecção com `.agents/`, detecção com `.agent/`, não-detecção sem nenhuma das duas; `midas init --tools antigravity` (home temporário) escreve as quatro skills; instalar `antigravity,gemini` juntos não colide.

## Expected Result

- Testes novos passam e a suíte completa permanece verde.
- `midas init --tools antigravity --json` com home isolado mostra os quatro caminhos `~/.gemini/antigravity/skills/midas-*/SKILL.md` na seção de skills.

## Blocked by

- [01 — Remover ferramentas sem suporte do registro](01-remover-ferramentas-sem-suporte.md)

## Open Questions

- None
