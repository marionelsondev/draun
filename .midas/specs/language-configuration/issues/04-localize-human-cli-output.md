# 04 — Localize human CLI output

**Source:** CLI output

**Summary:** Human-readable command output follows the configured language via a message catalog, while `--json` output stays untranslated.

## Functional Specification

- A message catalog provides the human-output strings (status summaries, success/error messages for commands such as `status`, `done`, `validate`) in `en-US` and `pt-BR`.
- When `language` is `pt-BR`, commands print their human-readable output in Brazilian Portuguese; with `en-US` or no setting, output is in English.
- `CliError` messages rendered to humans follow the configured language.
- Output under `--json` is never translated: keys, enum-like values, and payload structure are identical across languages.

## Preconditions

- Issue 01 (language parsing/validation) is done.
- The existing `render*` functions and `printResult` flow are in place.

## Main Flow

1. The user runs `midas status` in a project with `language: pt-BR`.
2. The human summary prints in Brazilian Portuguese.
3. The user runs `midas status --json` in the same project.
4. The JSON payload is identical (keys and values) to the one produced under `en-US`.
5. The user runs a failing command (e.g., `midas validate missing-spec`) with `language: pt-BR`.
6. The human error message prints in Portuguese; with `--json`, the error shape `{"error":{"message"}}` is unchanged.

## Expected Result

- Tests cover at least one command's human output in both languages, error message localization, and byte-identical `--json` payloads across languages.

## Blocked by

- [01 — Parse and validate the language setting](01-parse-and-validate-the-language-setting.md)

## Open Questions

- None
