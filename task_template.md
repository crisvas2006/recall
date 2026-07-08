# Task Spec Template

> Use this template for any task that meets the threshold in `CLAUDE.md` §3
> (multi-module, >~2h, or non-trivial mechanism). File the spec at
> `specs/task_<feature_name>.md`.

---

## Golden Rules

1. **Self-contained.** The spec must be executable from this file alone — no
   cross-references to chat logs, planning docs, or external artifacts.
   If something was designed during planning (prompts, schemas, configs, tool
   definitions), **embed it verbatim** here, not by reference.

2. **Deviation protocol.** If, during implementation, you discover that the
   spec is wrong, ambiguous, or contradicted by the codebase: **stop.**
   Surface the discrepancy, propose a spec amendment in §10.2, and wait for
   approval — do not silently re-interpret. The spec is a hypothesis; the
   codebase is truth.

3. **Surgical with eyes open.** Touch only what the spec requires, but record
   improvement and refactor opportunities you observe in §10.1 — do not
   silently discard them, and do not silently act on them.

---

## Section legend

- **[REQUIRED]** — must be filled for every spec.
- **[CONDITIONAL]** — fill only when the task touches that area.
- **[CLOSING]** — populated during and after implementation, not at planning time.

---

## 1. Problem Statement [REQUIRED]

One paragraph minimum (≥3 sentences). Cover:

- The user pain or technical gap that motivates this task.
- The current behavior and where it falls short.
- The strategic "why now" — what's unblocked, derisked, or enabled by doing it.

Avoid one-liners ("Add support for X"). A reviewer should understand from
this paragraph alone why the task exists, without reading anything else.

## 2. Goals & Non-Goals [REQUIRED]

- **Goals:** measurable outcomes — capabilities delivered, KPIs moved, bugs
  closed. State them in behavioral terms ("user can do X"), not implementation
  terms ("we add column Y").
- **Non-Goals:** explicitly out of scope. State the things a well-meaning
  agent might *assume* but shouldn't do. This is the safety rail against scope creep.

## 3. Acceptance Criteria [REQUIRED]

Numbered, independently testable list. Each item must be verifiable by a test
or a concrete manual check.

Example:

```
AC-1. POST /api/query with a valid query string returns HTTP 200 and a 
      JSON object matching the SynthesisResponse schema.
AC-2. When the user asks a completely off-corpus question (e.g., "how to build a rocket"),
      the response contains `isRefusal: true` and the passages array is empty.
AC-3. Running `npm run ingest` handles 429 rate limit errors from Gemini by 
      applying exponential backoff rather than crashing.
```

If you can't write a test or concrete check for an AC, it isn't a real AC —
rewrite it. Each AC maps to an entry in §8.

## 4. Files & Modules Touched [REQUIRED]

List the exact files you expect to create or modify, with absolute repo paths
and a `[create]` / `[modify]` / `[delete]` tag.

This is the surgical-changes anchor: at review, any file outside this list
is either a missed prediction (note it in §10.2) or scope creep (stop and
ask). Update this list when the deviation protocol triggers — don't quietly
edit extras.

Example:

```
src/app/api/query/route.ts                                      [modify]
src/lib/retrieval.ts                                            [modify]
eval/test_queries.ts                                            [create]
```

## 5. Constraints [REQUIRED]

What this change must **NOT** do. Equally important as goals.

Cover the relevant subset of:

- Hard "must not" rules (don't break public API X, don't change response shape Y, don't change embedding dimensionality).
- Performance ceilings (e.g., synthesis latency, LanceDB memory footprint).
- Backwards compatibility (existing LanceDB indices).
- Security boundaries (Prompt injection safeguards, secrets handling — per `CLAUDE.md` §7).
- Project-wide rules from `CLAUDE.md` §8 that apply to this task (no Postgres, no Docker, etc.).

## 6. Edge Cases [REQUIRED]

Enumerate the boundary conditions, partial failures, and adversarial inputs
this change must handle — or explicitly accept as out of scope (and say so).

Categories to walk through:

- **Inputs:** empty, null, oversized, non-UTF-8, whitespace-only, very long.
- **Concurrency:** multiple rapid searches.
- **External failures:** Gemini API 5xx, Cohere API unreachable, LanceDB file-lock issues.
- **Partial execution:** what if ingestion fails halfway through a book?
- **Malformed external payloads:** LLM JSON that doesn't parse to the requested schema.

For each: state the intended behavior and whether it has a test in §8.

## 7. Implementation Plan [REQUIRED]

Ordered steps. For each step include the action and a verification check
in the `[Step] → verify: [check]` format.

Embed designed artifacts **inline at the relevant step**:

- LLM system prompts — full text, not a summary.
- JSON schemas / output formats — exact schema.
- Tool / function definitions — full signature and docstring.
- Data models / config values — exact field names and types.
- Behavioral rules (personalization, routing, safety) — verbatim.

If a step depends on a conditional section (§9.x), reference it explicitly
in the step.

## 8. Testing Plan [REQUIRED]

- **Evaluation Harness:** which metrics (RAGAS) and test queries are being added to `golden.jsonl`?
- **Manual checks:** for UI changes, list the screens and viewports — mobile AND desktop (mobile is non-negotiable).
- **Sample inputs / expected outputs:** for any endpoint, include at least one canonical happy-path example and one error-path example with concrete payloads.

## 9. Conditional Sections — fill only if applicable

### 9.1 Data Model & Config [CONDITIONAL]
*Required if the task touches LanceDB schemas or Zod environment configs.*

- Schema diff (additive where possible).
- New config keys in `.env.example` and `src/lib/config.ts`.
- Data backfill / re-ingestion plan, if any (e.g., if changing chunking strategies).

### 9.2 LLM Considerations [CONDITIONAL]
*Required if the task adds or modifies an agent, prompt, or tool call.*

- **Model tier and rationale:** `gemini-3-flash` vs `gemini-embedding-2` per `CLAUDE.md` §5.
- **Prompt-injection surface:** identify every place untrusted user text enters the prompt; describe sanitization or out-of-band instructions.
- **Output handling:** if the output is rendered in any UI, describe escaping / sanitization.
- **JSON Schema / Structured Outputs:** define the strict parsing contract.

### 9.3 Observability [CONDITIONAL]
*Required if the task adds a code path that can fail in production.*

- **Logs to add:** events, structured fields. Include intent; exclude secrets per `CLAUDE.md` §7.
- **LangSmith Tracing:** identify the components receiving tracing wrappers.

## 10. Findings & Follow-ups [CLOSING]

Populated **during and after** implementation. This is the sanctioned place
to record what was noticed without violating surgical-changes.

### 10.1 Improvements observed (not done in this task)

Things noticed while working but intentionally left alone. For each:

- File and area.
- One-sentence description of the issue or improvement.
- Suggested priority (low / medium / high).
- Whether it warrants its own task spec, or is small enough to fix inline
  in a future related change.

This list is the input for future `simplify` / refactor / tech-debt passes.
Do not act on these items in the current task — record and move on.

### 10.2 Spec deviations

If the implementation diverged from any prior section, record what changed
and why. Examples:

- "§3 AC-2 reworded after discovering that Gemini SDK returns a specific error code rather than 429 on free tier quota exhaustion."
- "§4 added `src/lib/utils.ts` — required by the new chunking strategy and reused enough to justify extraction."

Every divergence here should have been preceded by a stop-and-flag per Golden Rule #2.

## 11. Definition of Done [REQUIRED]

A checklist the implementer self-verifies before claiming completion.

- [ ] All acceptance criteria in §3 pass (tests or manual checks).
- [ ] All §6 edge cases either covered by tests or explicitly deferred in §10.2.
- [ ] TypeScript compilation succeeds (`npx tsc --noEmit`).
- [ ] RAG metrics evaluation passes (if applicable).
- [ ] `npm run dev` builds successfully (frontend changes).
- [ ] Mobile + desktop both verified (UI changes).
- [ ] No file outside §4 was modified — or §10.2 explains why.
- [ ] `README.md` and `ARCHITECTURE.md` updated if behavior or setup changed.
- [ ] §10.1 reviewed — any high-priority items captured as follow-up tasks.
- [ ] No secrets or PII added to logs.

## 12. Open Questions [OPTIONAL]

If anything is genuinely unclear at write time, list it here rather than
guessing. Block implementation on any question whose answer would change §3
or §6 — surface and resolve before coding.
