export interface WorkflowTemplate {
  /** Command name — file naming and the /midas:<name> invocation. */
  name: string;
  description: string;
  /** Hint for the command argument, when the command takes one. */
  argumentHint?: string;
  /** Markdown body instructing the agent to drive the workflow via `midas ... --json`. */
  body: string;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    name: 'spec',
    description: 'Write a SPEC.md for a new feature using the MidasSpec SDD workflow',
    argumentHint: '[feature-description]',
    body: `Write a functional spec (SPEC.md) for the feature the user described.
The argument is a free-form description of what the user wants — not a spec
name. Derive a short, human-readable spec name from it.

1. If the spec folder does not exist yet, run \`midas new "<spec-name>" --json\`
   with the derived name to scaffold it. The output includes the spec slug and
   folder path.
2. Run \`midas instructions spec --json\`. The payload contains the output path
   (\`relOutputPath\`), the expected markdown \`template\`, project \`context\`, and
   the project's \`rules\` for spec writing.
3. Ask the user clarifying questions about scope and behavior until the
   requirements are unambiguous.
4. Write SPEC.md at the returned path, following the returned template and
   every rule. Describe components and behaviors — not implementation.
5. Run \`midas validate <spec-slug> --json\` and fix any reported problems.
6. Tell the user the spec is ready and that the next step is
   \`/midas:break <spec-slug>\` to break it into issues — optionally preceded
   by \`/midas:analyze <spec-slug>\` to review the spec's quality first.`,
  },
  {
    name: 'analyze',
    description:
      'Analyze an existing SPEC.md for ambiguities, gaps, and risks before breaking it into issues (optional quality review)',
    argumentHint: '[spec-slug]',
    body: `Analyze an existing SPEC.md and produce a structured review of its quality
before it is broken into issues. This step is optional and read-only: it
reports findings and lets the user decide — it never edits the spec.

1. Run \`midas instructions analyze --spec <spec-slug> --json\`. The payload
   contains the spec's path (\`relOutputPath\`), the report \`template\`, project
   \`context\`, and the project's \`rules\` for spec analysis.
2. Run \`midas validate <spec-slug> --json\` and carry any reported problems
   into the findings.
3. Read the SPEC.md and analyze it against the project context, looking for:
   - ambiguous or contradictory behaviors;
   - missing edge cases, error paths, and empty/initial states;
   - implementation details leaking into what should stay functional;
   - behaviors that cannot be verified by a test;
   - unresolved Open Questions and hidden assumptions;
   - scope risks: pages or behaviors too large to break into small issues.
4. Report the findings in the chat following the returned \`template\` sections
   exactly, ordered by severity. Be specific — name the page, component, or
   behavior each finding refers to, and say so explicitly when a finding is a
   hypothesis rather than a fact. Do NOT rewrite or edit SPEC.md yourself.
5. Tell the user they can fix the spec (with your help or via
   \`/midas:spec\`), or proceed to \`/midas:break <spec-slug>\` if the findings
   are acceptable.`,
  },
  {
    name: 'break',
    description: 'Break a spec into implementable issues with a dependency graph',
    argumentHint: '[spec-slug]',
    body: `Break an existing SPEC.md into small, implementable issues.

1. Run \`midas instructions break --spec <spec-slug> --json\`. The payload
   contains the issue \`template\`, the spec content, and the project's \`rules\`
   for issue writing.
2. Read the spec and derive a set of issues, each independently verifiable and
   small enough to implement in one sitting.
3. Write one markdown file per issue under \`issues/\` and an \`issues/INDEX.md\`
   listing every issue with its \`blocked by\` dependencies, following the
   returned template and rules exactly.
4. Run \`midas validate <spec-slug> --json\` and fix any reported problems.
5. Tell the user the breakdown is ready and that the next step is
   \`/midas:implement <spec-slug>\` to start implementing.`,
  },
  {
    name: 'implement',
    description:
      "Implement a spec's ready issues — manual, autonomous (auto), or parallel multi-agent (ultracode) mode",
    argumentHint: '[spec-slug] [manual|auto|ultracode]',
    body: `Implement the ready issues of a spec, in the execution mode the user chose.

## Step 0 — Determine the execution mode (REQUIRED before touching any issue)

The second argument selects the mode: \`manual\`, \`auto\`, or \`ultracode\`.
If it is missing, ASK the user which mode to use and WAIT for the answer —
do not pick, start, or implement any issue before the mode is known.
Present the options with their trade-offs:

- \`manual\` — one issue per run; the user reviews between issues, and may
  plan an issue before implementing it. Slowest, full control.
- \`auto\` — implement every ready issue sequentially and autonomously until
  the spec is done, delegating each issue to subagents so the main context
  window stays clean. No questions in between.
- \`ultracode\` — like auto, but uses the agent's workflow/orchestration
  feature (when available) to also parallelize independent issues following
  the dependency graph. Fastest, but uses many agents and tokens; requires
  the user to have opted into ultracode. Falls back to \`auto\` when the
  agent has no workflow feature.

In every mode, each issue follows the same tracked lifecycle so that
\`midas status\` reflects reality: \`midas start <spec-slug> <NN> --json\` when
work on the issue begins (marks it \`[~]\` in progress), and
\`midas done <spec-slug> <NN> --json\` only when it is implemented, tested,
and reviewed (marks it \`[x]\`).

## manual mode

1. Run \`midas issues <spec-slug> --ready --json\` to list issues whose
   blockers are all done. If none are ready, report progress and stop.
2. Pick one ready issue (the lowest number unless the user asked for a
   specific one) and read its markdown file — it is the contract.
3. If there is no plan for this issue already approved in the current
   conversation, ASK the user whether to (a) create a plan first using the
   agent's native plan mode and run this command again afterwards to
   implement the approved plan — the recommended option — or (b) implement
   directly. WAIT for the answer.
   - If the user chooses to plan: enter the agent's native plan mode, build
     the plan from the issue file and the SPEC.md, and present it for
     approval. Do NOT implement in this run.
4. To implement (directly, or from a plan approved in this conversation):
   run \`midas start <spec-slug> <issue-number> --json\`, implement exactly
   what the issue describes, including the tests its Expected Result
   demands, and run the test suite until green.
5. Run \`midas done <spec-slug> <issue-number> --json\`.
6. Summarize what changed and which issues are now unblocked, then STOP and
   let the user review before the next issue. When no issues remain, suggest
   \`/midas:archive <spec-slug>\`.

## auto mode

Loop autonomously, without asking between issues, delegating all reading
and coding to subagents so the orchestrator's context window stays small —
the orchestrator only runs \`midas\` commands and passes plans and summaries
between subagents, never reading the code itself.

1. Run \`midas issues <spec-slug> --ready --json\` and pick the lowest-number
   ready issue.
2. Run \`midas start <spec-slug> <issue-number> --json\`.
3. Run the issue as a two-subagent chain: a read-only planner subagent
   (reads the issue file, the SPEC.md, and only the code it needs; returns a
   structured plan) feeding an implementer subagent (implements the plan,
   writes the tests the issue's Expected Result demands, and runs the test
   suite until green; never commits; never touches INDEX.md).
4. Run \`midas done <spec-slug> <issue-number> --json\`, re-run
   \`midas issues <spec-slug> --ready --json\`, and continue with the next
   ready issue until none remain.
5. Report a final summary of every issue implemented and the test-suite
   result, and suggest \`/midas:archive <spec-slug>\`.

## ultracode mode

If the agent has a workflow/orchestration feature, use it to build and run
a parallel workflow driven by the dependency graph — no fixed waves or
barriers: everything runs as early as its dependencies allow, and everything
that can run in parallel does. If the agent has NO workflow feature, fall
back to \`auto\` mode exactly as described above.

1. Read the full graph with \`midas issues <spec-slug> --json\`. Schedule by
   dependencies: each issue launches as soon as ALL of its \`blockedBy\`
   issues are done — never wait for an entire "batch" to finish.
2. Issues with no dependency between them but that touch the same files must
   run as one sequential chain; disjoint chains run concurrently.
3. Run each issue as a two-agent chain with its own isolated context: a
   read-only planner agent (reads the issue file, the SPEC.md, and only the
   code it needs; returns a structured plan) feeding an implementer agent
   (implements the plan and writes the tests the issue's Expected Result
   demands; runs ONLY its own targeted test files — never the full suite or
   the build, to avoid clashing with parallel agents; never commits; never
   touches INDEX.md). Both agents must inherit the user's current model —
   never override the model for planner or implementer agents.
4. ONLY the orchestrator writes to INDEX.md, always one call at a time
   (parallel calls race on the file and lose updates): run
   \`midas start <spec-slug> <NN> --json\` immediately before launching an
   issue's chain, and \`midas done <spec-slug> <NN> --json\` as soon as that
   issue's chain finishes green.
5. After all issues finish, run a single verifier agent that executes the
   FULL test suite and the build, fixes any integration conflicts between
   issues, and re-runs until green.
6. Verify independently with \`midas status <spec-slug> --json\` and the full
   test suite, then summarize what changed per issue and suggest
   \`/midas:archive <spec-slug>\`.`,
  },
  {
    name: 'archive',
    description: 'Validate and archive a finished spec',
    argumentHint: '[spec-slug]',
    body: `Close out a finished spec.

1. Run \`midas issues <spec-slug> --json\` and confirm every issue is done. If
   any are open, report them and stop.
2. Run \`midas validate <spec-slug> --json\` and fix any reported problems.
3. Run \`midas archive <spec-slug> --json\` to move the spec to the archive.
4. Report the archived location from the command output.`,
  },
];
