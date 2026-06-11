**English** | [Português (Brasil)](./README.pt-BR.md)

# MidasSpec

Spec-Driven Development (SDD) CLI. `midas` scaffolds spec folders, validates SPEC/issue markdown files, tracks issue progress with a dependency graph — and installs the SDD workflow into your AI coding agents (Claude Code, Cursor, Windsurf, and any agent that reads `AGENTS.md`).

Markdown is the single source of truth: the CLI parses and edits `SPEC.md`, `issues/*.md`, and `issues/INDEX.md` — it never replaces them. AI agents do the creative writing; the CLI guarantees structure, consistency, and tracking.

## Install

```bash
npm install -g midasspec
```

Requires Node.js 18+. Check with `midas --version` (prints `midasspec@x.y.z`).

## Setup

```bash
cd your-project
midas init
```

The first `init` on your machine runs a one-time global setup: pick your AI tools and language (`en-US` or `pt-BR`), saved to `~/.midas/config.yaml`. Each project `init` then creates `.midas/specs/` and a minimal `.midas/config.yaml`, and generates three integration layers for the configured tools:

- **`AGENTS.md` managed block** — SDD instructions between `<!-- midas:begin -->` / `<!-- midas:end -->` markers; your own content is never touched.
- **Slash commands** — `/midas:spec`, `/midas:analyze`, `/midas:break`, `/midas:implement`, `/midas:archive` in each tool's native format.
- **Agent skills** — `midas-spec`, `midas-analyze`, `midas-break`, `midas-implement`, `midas-archive` (`SKILL.md`) under each tool's skills folder.

Non-interactive:

```bash
midas init --tools claude,cursor --language pt-BR   # explicit selection
midas init --tools all                              # every supported tool
midas init --force                                  # reuse the global config, no prompt
```

## The workflow

1. `/midas:spec "payment flow"` — your agent scaffolds `.midas/specs/payment-flow/` and writes `SPEC.md`
2. `/midas:analyze` — *(optional)* your agent reviews the spec for ambiguities, gaps, and risks before the breakdown
3. `/midas:break` — your agent breaks the spec into `issues/*.md` + `issues/INDEX.md` with dependencies
4. `/midas:implement` — your agent implements ready issues (`manual`, `auto`, or `ultracode` parallel mode), tracking each with `start`/`done`
5. `midas status` — follow progress
6. `/midas:archive` — validate and archive the finished spec

Every step also works without an agent, via the commands below.

## Commands

Every command accepts `--json` for machine-readable output (that's how the slash commands and skills drive the CLI). Exit code is 0 on success, non-zero on error.

| Command | What it does |
| --- | --- |
| `midas init [--tools <ids\|all>] [--language <lang>] [--force]` | Prepare the repo: global setup on first run, then `.midas/` scaffolding and agent integrations. |
| `midas update` | Regenerate the global integration files (commands/skills) after upgrading the CLI. |
| `midas new <name>` | Scaffold a new spec folder with a slug derived from the name. |
| `midas status [slug]` | Without slug: all specs grouped by lifecycle (in progress / not started / not broken down / done), each with progress bar and next actionable issue. With slug: per-issue detail. |
| `midas issues <slug> [--ready\|--blocked\|--done]` | List a spec's issues with dependency-aware filters. `--ready` = no pending blockers. |
| `midas start <slug> <number>` | Mark an issue as in progress (`[~]` in INDEX.md). |
| `midas done <slug> <number>` | Mark an issue done (`[x]`) and report newly unblocked issues. |
| `midas reopen <slug> <number>` | Reopen a done issue (`[ ]`). |
| `midas validate <slug>` | Validate SPEC.md, issue files, and INDEX.md consistency. |
| `midas instructions <spec\|break\|analyze> [--spec <slug>]` | Emit artifact-writing instructions (template, context, rules) for AI skills. |
| `midas archive <slug> [--force]` | Move a finished spec to `.midas/specs/archive/`. |

## Slash commands / skills

Generated for each configured tool; commands and skills are the same five workflows:

| Workflow | What the agent does |
| --- | --- |
| `/midas:spec [feature-description]` | Takes a free-form description of what you want, derives the spec name, scaffolds it, asks clarifying questions, writes `SPEC.md` following the project's template and rules, validates. |
| `/midas:analyze [spec-slug]` | *(optional)* Reviews `SPEC.md` for ambiguities, missing edge cases, untestable behaviors, and scope risks, reporting findings by severity — read-only, never edits the spec. |
| `/midas:break [spec-slug]` | Breaks `SPEC.md` into small, independently verifiable issues with a `blocked by` dependency graph, validates. |
| `/midas:implement [spec-slug] [manual\|auto\|ultracode]` | Implements ready issues. `manual`: one issue per run, with an optional plan-first step, you review between issues. `auto`: all ready issues sequentially via subagents (planner → implementer per issue). `ultracode`: parallel multi-agent workflow following the dependency graph; falls back to `auto` if the agent has no workflow feature. |
| `/midas:archive [spec-slug]` | Confirms every issue is done, validates, and archives the spec. |

## Configuration

Two layers; project overrides global.

`~/.midas/config.yaml` (global, written by the first `init`):

```yaml
tools:            # AI tools to generate integrations for
  - claude
language: en-US   # en-US | pt-BR — language of specs/issues and AI conversation
```

`.midas/config.yaml` (per project):

```yaml
# specsRoot: .midas/specs   # where specs live (default)
# language: pt-BR           # override the global language
# context: |                # project background shown to AI skills
# rules:                    # per-artifact rules for `midas instructions`
#   spec: []
#   break: []
#   analyze: []
```

CLI human output is always English; `language` governs spec/issue content and the AI conversation.

## Supported tools

Claude Code, Cursor, Windsurf, Codex CLI, and Gemini CLI. Tools without a native slash-command or skills convention still get the universal `AGENTS.md` layer.

## License

MIT
