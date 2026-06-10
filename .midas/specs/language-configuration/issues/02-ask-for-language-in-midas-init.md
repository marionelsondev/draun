# 02 — Ask for language in midas init

**Source:** midas init

**Summary:** `midas init` asks the user to pick a language interactively and writes the choice to `midas.config.yaml`.

## Functional Specification

- During interactive `midas init`, after the existing prompts, a select prompt offers `en-US — English (United States)` and `pt-BR — Português (Brasil)`, with `en-US` preselected.
- The chosen value is written as `language: <value>` in the generated `midas.config.yaml`.
- When `midas init` runs in a project whose config already has a `language`, the picker preselects the current value, and confirming keeps it unchanged in the config.

## Preconditions

- Issue 01 (language parsing/validation and the supported-language list) is done.
- The existing interactive `midas init` flow (tool picker) is in place.

## Main Flow

1. The user runs `midas init` in a fresh project.
2. After the existing prompts, the language picker appears with `en-US` preselected.
3. The user selects `pt-BR`.
4. The generated `midas.config.yaml` contains `language: pt-BR`.
5. The user reruns `midas init`; the picker preselects `pt-BR`, and confirming leaves `language: pt-BR` in place.

## Expected Result

- Tests verify that init writes the selected language to the config and that a rerun with an existing `language` preserves it (prompt interaction stubbed/injected the same way the existing tool picker is tested).

## Blocked by

- [01 — Parse and validate the language setting](01-parse-and-validate-the-language-setting.md)

## Open Questions

- None
