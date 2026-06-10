# Language Configuration

## Overview

MidasSpec gains a project-level language setting so users can choose the language in which specs and issues are written and in which the AI assistant communicates with them. Initially two languages are supported: `en-US` (default) and `pt-BR`. The CLI's own human-readable output is always en-US, regardless of this setting.

The setting lives in `midas.config.yaml` as a `language` field. It is chosen interactively during `midas init` and can be edited by hand at any time. Structural markdown (template headings, INDEX.md format, checkbox/annotation syntax) stays in English regardless of the configured language, so parsing is never affected — only prose content, AI communication, and CLI messages follow the setting.

---

## Configuration

The `language` field in `midas.config.yaml` at the project root.

### Components

- **language field**: Optional top-level key in `midas.config.yaml`. Accepted values: `en-US`, `pt-BR`. When absent, the project behaves as `en-US`.

### Behaviors

- **default-language**: When `midas.config.yaml` has no `language` field (e.g., projects initialized before this feature), every consumer treats the language as `en-US`. No migration is required.
- **invalid-language-rejected**: When `language` holds a value other than `en-US` or `pt-BR`, commands that consume the setting fail with a clear error naming the invalid value and listing the supported ones, exiting non-zero (JSON mode reports it under the standard `{"error":{"message"}}` shape).

---

## midas init

The interactive project setup gains a language question.

### Components

- **language picker**: An interactive select prompt listing the supported languages (`en-US — English (United States)`, `pt-BR — Português (Brasil)`), with `en-US` preselected.

### Behaviors

- **init-asks-language**: During `midas init`, after the existing prompts, the user picks a language; the choice is written as `language: <value>` in the generated `midas.config.yaml`.
- **init-preserves-language-on-rerun**: When `midas init` runs in a project whose config already has a `language`, the picker preselects the current value, and confirming keeps it.

---

## midas instructions

The instructions payload tells the AI which language to use.

### Components

- **language in payload**: A `language` field in the JSON payload of `midas instructions <artifact>`, carrying the configured value.
- **language directive**: A human-readable rule included with the returned instructions telling the AI to write the artifact's prose content (titles, descriptions, behaviors) in the configured language and to converse with the user in that language, while keeping structural headings and INDEX.md syntax in English.

### Behaviors

- **instructions-carry-language**: Every `midas instructions <artifact>` invocation includes the `language` field and the language directive, derived from `midas.config.yaml` (or the `en-US` default).
- **structure-stays-english**: The templates returned by `midas instructions` keep their English headings (e.g., `## Overview`, `## All issues`) for both languages; only the directive changes what the AI writes inside those sections.

---

## CLI output

Human-readable command output is always en-US.

### Components

- **message catalog**: A single English catalog of human-output messages (status summaries, success/error messages).

### Behaviors

- **human-output-english**: Commands print their human-readable output (e.g., `status`, `done`, `validate` summaries and error messages) in English regardless of the configured `language`, which governs only spec/issue content and AI conversation.
- **json-output-unchanged**: Output under `--json` is never translated: keys, enum-like values, and payload structure stay identical across languages so automation and the generated AI skills keep working.

---

## Open Questions

- None
