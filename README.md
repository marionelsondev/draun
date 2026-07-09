**English** | [Português (Brasil)](./README.pt-BR.md)

# Draun

Spec-Driven Development (SDD) CLI. `draun` scaffolds spec folders, validates SPEC/issue markdown files, tracks issue progress with a dependency graph — and installs the SDD workflow into your AI coding agents (Claude Code, Cursor, Windsurf, opencode, Grok, and any agent that reads `AGENTS.md`).

Markdown is the single source of truth: the CLI parses and edits `SPEC.md`, `issues/*.md`, and `issues/INDEX.md` — it never replaces them. AI agents do the creative writing; the CLI guarantees structure, consistency, and tracking.

## Install

```bash
npm install -g draun
```

Requires Node.js 18+. Check with `draun --version` (prints `draun@x.y.z`).

## Setup

```bash
cd your-project
draun init
```

The first `init` on your machine runs a one-time global setup: pick your AI tools and language (`en-US` or `pt-BR`), saved to `~/.draun/config.yaml`. Each project `init` then creates `.draun/specs/` and a minimal `.draun/config.yaml`, and generates two integration layers for the configured tools:

- **`AGENTS.md` managed block** — SDD instructions between `<!-- draun:begin -->` / `<!-- draun:end -->` markers; your own content is never touched.
- **Agent skills** — `draun-spec`, `draun-analyze`, `draun-break`, `draun-implement`, `draun-archive` (`SKILL.md`) under each tool's skills folder.

Non-interactive:

```bash
draun init --tools claude,cursor --language pt-BR   # explicit selection
draun init --tools all                              # every supported tool
draun init --force                                  # reuse the global config, no prompt
```

## The workflow

1. `draun-spec "payment flow"` — your agent scaffolds `.draun/specs/payment-flow/` and writes `SPEC.md`
2. `draun-analyze` — *(optional)* your agent reviews the spec for ambiguities, gaps, and risks before the breakdown
3. `draun-break` — your agent breaks the spec into `issues/*.md` + `issues/INDEX.md` with dependencies
4. `draun-implement` — your agent implements ready issues (`manual`, `auto`, or `ultracode` parallel mode), tracking each with `start`/`done`
5. `draun status` — follow progress
6. `draun-archive` — validate and archive the finished spec

Every step also works without an agent, via the commands below.

## Commands

Every command accepts `--json` for machine-readable output (that's how the skills drive the CLI). Exit code is 0 on success, non-zero on error.

| Command | What it does |
| --- | --- |
| `draun init [--tools <ids\|all>] [--language <lang>] [--force]` | Prepare the repo: global setup on first run, then `.draun/` scaffolding and agent integrations. |
| `draun update` | Regenerate the global integration files (skills) after upgrading the CLI. |
| `draun new <name>` | Scaffold a new spec folder with a slug derived from the name. |
| `draun status [slug]` | Without slug: all specs grouped by lifecycle (in progress / not started / not broken down / done), each with progress bar and next actionable issue. With slug: per-issue detail. |
| `draun issues <slug> [--ready\|--blocked\|--done]` | List a spec's issues with dependency-aware filters. `--ready` = no pending blockers. |
| `draun start <slug> <number>` | Mark an issue as in progress (`[~]` in INDEX.md). |
| `draun done <slug> <number>` | Mark an issue done (`[x]`) and report newly unblocked issues. |
| `draun reopen <slug> <number>` | Reopen a done issue (`[ ]`). |
| `draun validate <slug>` | Validate SPEC.md, issue files, and INDEX.md consistency. |
| `draun instructions <spec\|break\|analyze> [--spec <slug>]` | Emit artifact-writing instructions (template) for AI skills. |
| `draun archive <slug> [--force]` | Move a finished spec to `.draun/specs/archive/`. |

## Skills

Generated for each configured tool; the skills are the same five workflows:

| Workflow | What the agent does |
| --- | --- |
| `draun-spec [feature-description]` | Takes a free-form description of what you want, derives the spec name, scaffolds it, asks clarifying questions, writes `SPEC.md` following the project's template, validates. |
| `draun-analyze [spec-slug]` | *(optional)* Reviews `SPEC.md` for ambiguities, missing edge cases, untestable behaviors, and scope risks, reporting findings by severity — read-only, never edits the spec. |
| `draun-break [spec-slug]` | Breaks `SPEC.md` into small, independently verifiable issues with a `blocked by` dependency graph, validates. |
| `draun-implement [spec-slug] [manual\|auto\|ultracode]` | Implements ready issues. `manual`: one issue per run, with an optional plan-first step, you review between issues. `auto`: all ready issues sequentially via subagents (planner → implementer per issue). `ultracode`: parallel multi-agent workflow following the dependency graph; falls back to `auto` if the agent has no workflow feature. |
| `draun-archive [spec-slug]` | Confirms every issue is done, validates, and archives the spec. |

## Configuration

Two layers; project overrides global.

`~/.draun/config.yaml` (global, written by the first `init`):

```yaml
tools:            # AI tools to generate integrations for
  - claude
language: en-US   # en-US | pt-BR — language of specs/issues and AI conversation
```

`.draun/config.yaml` (per project):

```yaml
# specsRoot: .draun/specs   # where specs live (default)
# language: pt-BR           # override the global language
```

CLI human output is always English; `language` governs spec/issue content and the AI conversation.

## Supported tools

Claude Code, Cursor, Windsurf, Codex CLI, opencode, and Grok. Tools without a native skills convention still get the universal `AGENTS.md` layer.

## License

MIT
