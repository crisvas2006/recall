# Task Spec: LangSmith Observability Integration

---

## 1. Problem Statement

While our retrieval and synthesis pipeline is functioning, we are experiencing unexplained latency spikes (e.g., `POST /api/query` taking up to 15-20 seconds). Without proper tracing, it is impossible to definitively pinpoint whether the bottleneck is LanceDB's vector search, network latency to the Gemini API, or Gemini's inference time for the synthesis prompt. Since the `LANGSMITH_API_KEY` is already present in `.env`, we need to implement LangSmith tracing to get a waterfall breakdown of our RAG pipeline's latency and diagnose these issues.

## 2. Goals & Non-Goals

- **Goals:** 
  - Install the `langsmith` SDK.
  - Wrap the main `/api/query` execution flow in a LangSmith `RunTree` to capture the end-to-end latency.
  - Create child traces for `embedQuery`, `retrievePassages`, and `synthesizeAnswer` to break down the timings of each critical step.
  - Ensure the tracing captures the inputs (the prompt/query) and the outputs (the generated text) for qualitative debugging.
- **Non-Goals:** 
  - We will not migrate our underlying SDK from `@google/genai` to LangChain. We will manually trace our existing custom pipeline using the bare `langsmith` `RunTree` API.

## 3. Acceptance Criteria

1. **AC-1:** When a user asks a question in the UI, a trace is successfully logged to the LangSmith dashboard under the project specified by `LANGCHAIN_PROJECT`.
2. **AC-2:** The LangSmith trace shows a clear parent-child waterfall consisting of the overall Query route, the LanceDB retrieval step, and the Gemini synthesis step, complete with millisecond latencies.
3. **AC-3:** The inputs (user question) and outputs (LLM answer) are visible in the LangSmith trace payload.
4. **AC-4:** If LangSmith API keys are missing or tracing fails, it does not crash the application (tracing should fail gracefully).

## 4. Files & Modules Touched

```text
package.json                                    [modify] (install langsmith)
src/app/api/query/route.ts                      [modify] (initialize parent trace)
src/lib/retrieval.ts                            [modify] (attach child traces)
src/lib/synthesize.ts                           [modify] (attach child traces)
specs/task_langsmith.md                         [create] (this file)
```

## 5. Constraints

- **Dependency Limits:** Use the official `langsmith` Node.js SDK (not `@langchain/core` unless necessary, to keep the bundle size small).
- **Environment Checks:** The tracing logic must explicitly check if `LANGCHAIN_TRACING_V2 === "true"` before attempting to initialize a `RunTree`.

## 6. Edge Cases

- **Rate Limits during Tracing:** If the Gemini API throws a 429 inside the synthesis step, the trace must accurately capture the Error state and the stack trace before propagating it to the UI.
- **Concurrent Requests:** The `RunTree` implementation must be stateless and isolated per request so that concurrent users do not overwrite or mix up each other's trace IDs.

## 7. Implementation Plan

- **Step 1: Setup Dependencies**
  - Install `langsmith`. 
  - Validate `LANGSMITH_API_KEY` and `LANGCHAIN_PROJECT` in `src/lib/config.ts`.
- **Step 2: Instrument the API Route**
  - In `src/app/api/query/route.ts`, initialize a `RunTree({ name: "RAG_Query", run_type: "chain", inputs: { query } })`.
  - Call `.postRun()` before beginning work.
- **Step 3: Instrument Retrieval and Synthesis**
  - Pass the parent `RunTree` object (or its ID) down to `retrievePassages` and `synthesizeAnswer`.
  - Create child runs for `RunTree({ name: "LanceDB_Retrieval", run_type: "retriever", parent_run: parentRun })` and `RunTree({ name: "Gemini_Synthesis", run_type: "llm" })`.
  - Call `.end()` and `.patchRun()` on all branches when they complete or error out.
- **Step 4: Verification**
  - Submit a test query and open the LangSmith UI. Ensure the latency bottleneck (whether it is `Gemini_Synthesis` taking 15s or something else) is clearly visible.

## 8. Testing Plan

- **Manual checks:** 
  - Perform a query through the frontend and verify the exact timing breakdown matches the ~15-20s latency experienced in the Next.js console logs.
- **Automated checks:** 
  - Ensure `npm run dev` and `npm run build` still succeed with the tracing SDK integrated.
