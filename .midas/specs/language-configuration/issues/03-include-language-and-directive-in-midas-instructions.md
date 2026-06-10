# 03 — Include language and directive in midas instructions

**Source:** midas instructions

**Summary:** Every `midas instructions <artifact>` payload carries the configured language and a directive telling the AI to write prose and converse in that language while keeping structural markdown in English.

## Functional Specification

- The JSON payload of `midas instructions <artifact>` includes a `language` field with the resolved value (`en-US` when unconfigured).
- The returned instructions include a language directive telling the AI to write the artifact's prose content (titles, descriptions, behaviors) in the configured language and to converse with the user in that language.
- The directive explicitly requires structural headings and INDEX.md syntax (e.g., `## Overview`, `## All issues`, checkbox lines, `blocked by:` annotations) to stay in English for both languages.
- The `template` returned for each artifact is identical regardless of the configured language.

## Preconditions

- Issue 01 (language parsing/validation) is done.
- The existing `midas instructions` command and payload shape are in place.

## Main Flow

1. The user runs `midas instructions spec --json` in a project with `language: pt-BR`.
2. The payload contains `"language": "pt-BR"` and a directive to write prose in Brazilian Portuguese with English structural headings.
3. The user runs the same command in a project with no `language` field.
4. The payload contains `"language": "en-US"` and the corresponding directive.

## Expected Result

- Tests assert the `language` field and directive presence for both languages and the default, and that the `template` string is byte-identical across languages.

## Blocked by

- [01 — Parse and validate the language setting](01-parse-and-validate-the-language-setting.md)

## Open Questions

- None
