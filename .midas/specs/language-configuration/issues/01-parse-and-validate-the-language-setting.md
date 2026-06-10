# 01 — Parse and validate the language setting

**Source:** Configuration

**Summary:** The config loader reads an optional `language` field from `midas.config.yaml`, defaulting to `en-US` and rejecting unsupported values.

## Functional Specification

- The loaded config exposes a `language` value of `en-US` or `pt-BR`.
- When `midas.config.yaml` has no `language` field (or the file does not exist), the resolved language is `en-US`.
- When `language` holds any other value, consumers fail with a `CliError` (non-zero exit) whose message names the invalid value and lists the supported ones; under `--json` it surfaces as `{"error":{"message"}}`.
- The list of supported languages is defined in one place so init, instructions, and CLI output all consume the same source.

## Preconditions

- The existing config loader for `midas.config.yaml` (`src/lib/init.ts`) is in place.

## Main Flow

1. Code loads config from a project whose `midas.config.yaml` contains `language: pt-BR`.
2. The resolved config reports `pt-BR`.
3. Code loads config from a project with no `language` field.
4. The resolved config reports `en-US`.
5. Code loads config containing `language: fr-FR` and a consumer resolves the language.
6. A `CliError` is thrown naming `fr-FR` and listing `en-US` and `pt-BR`.

## Expected Result

- Unit tests with temp-dir fixtures cover: explicit `en-US`, explicit `pt-BR`, missing field (default), and an invalid value (error message content and exit code).

## Blocked by

- None

## Open Questions

- None
