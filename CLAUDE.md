# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Draun — a Spec-Driven Development CLI (npm package `draun`, binary `draun`). It scaffolds spec folders, validates SPEC/issue markdown files, tracks issue progress, and resolves issue dependency graphs. The markdown files (`SPEC.md`, `issues/*.md`, `issues/INDEX.md`) are the single source of truth — the CLI parses and edits them, never replaces them. The full functional spec lives in `.draun/specs/draun-cli/SPEC.md` (this repo is itself developed with the SDD workflow it implements).

## Commands

- Build: `npm run build` (tsup → `dist/index.js`, ESM, node18 target, shebang banner)
- Run from source: `npm run dev -- <args>` (e.g. `npm run dev -- status --json`)
- All tests: `npm test` (vitest run)
- Single test file: `npx vitest run tests/status.test.ts`
- Single test by name: `npx vitest run -t "test name"`

## Architecture

Two-layer structure, one file per CLI command:

- `src/index.ts` — `buildProgram()` assembles all Commander commands; `runCli(argv, io?)` is the testable entry point that catches errors and returns an exit code instead of calling `process.exit`.
- `src/commands/*.ts` — thin Commander wiring. Each exports a `make<Name>Command(): Command` factory plus pure `render*` functions for human output. Actions read the global `--json` flag via `cmd.optsWithGlobals()`.
- `src/lib/*.ts` — all real logic (filesystem, markdown parsing, config). Commands call lib functions and format the result.

Cross-cutting conventions:

- Errors: throw `CliError` (`src/lib/output.ts`) with a message and exit code; `runCli` renders it (as `{"error":{"message"}}` under `--json`) and returns the code. Exit 0 on success, non-zero on any error.
- Output: every command supports `--json` (single structured JSON object) vs human text, via `printResult(payload, humanText, json)`.
- Config: `draun.config.yaml` at repo root (`src/lib/init.ts`) holds optional `specsRoot` (default `.draun/specs`), `context`, and per-artifact `rules` consumed by `draun instructions`.
- `INDEX.md` parsing (`src/lib/index-parser.ts`) is the backbone of `status`, `issues`, `done`/`reopen`: issue lines under the `## All issues` heading are `- [x] [NN — Title](file.md) — blocked by: NN, NN` (or `none`). Done state and the dependency graph are derived entirely from these checkboxes and annotations.
- ESM throughout: relative imports use `.js` extensions even in `.ts` files.

## Tests

Tests live in `tests/*.test.ts`, one per command. They exercise lib functions directly and full CLI runs via `runCli` with injected stdout/stderr, using temp dirs (`mkdtemp`) for filesystem fixtures — no mocking of fs.
