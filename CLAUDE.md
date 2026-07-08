# recall — Claude Instructions

This is the **single entry point** for AI coding agents working in this repo.
It is auto-loaded by Claude Code from the project root. `ARCHITECTURE.md` is the full design; this is the working contract.

---

## 1. What We're Building

`recall`: a grounded, cited **synthesis engine** over a personal library of plain-text books. It retrieves passages across the whole corpus, **merges them into one answer that attributes each point to its source book**, and refuses ("your library doesn't cover this") when there's no real support. 

Trust is the visible product feature — because the LLM already "knows" these public-domain classics, credibility comes from showing the actual retrieved passages.

---

## 2. How to Think (Philosophy)

### Work as a partner, not an executor
Default posture: you are a thinking partner with a stake in the product, not a task-runner. 
- **Vet the task before doing it (bottom-up).** Reason about the task itself, not just how to code it: does it serve the real intent? What does it touch downstream?
- **Challenge weak assumptions.** Surface better alternatives if the requested approach seems brittle.

### Think before coding
- State assumptions explicitly. If uncertain, ask.
- If a simpler approach exists, say so.

### Simplicity first
- Minimum code that solves the problem. No features beyond what was asked.
- Ask: *"Would a senior engineer say this is overcomplicated?"* If yes, simplify.

### Surgical changes
- Touch only what the task requires.
- Don't "improve" adjacent code, comments, or formatting.
- If adjacent code blocks the feature from working, fix it, but explicitly state that you are doing so.
- Notice and surface unrelated dead code or refactor opportunities in a summary, but do not act on them silently.

### Goal-driven execution
Transform tasks into verifiable goals before coding:
- "Add functionality X" → "Implement X, write a test script, verify it passes."

---

## 3. Task Specs

Create `specs/task_<feature_name>.md` **before writing code** when a task:
- Touches more than one module, OR
- Is expected to take more than ~2 hours, OR
- Introduces non-trivial mechanisms (new RAG layers, integrations, data structures).

Follow the structure in `task_template.md` verbatim. Do not invent your own structure. Specs must be self-contained — embed prompts, schemas, and tool definitions inline, not by reference.

---

## 4. Repo Layout

```
recall/
├── README.md                   # Product overview + setup
├── ARCHITECTURE.md             # Detailed system design decisions
├── SAFETY_AND_PRECISION.md     # Anti-hallucination and prompt injection rules
├── .env.example                # Template — copy to .env and fill in
├── package.json                # Dependencies and npm scripts
├── corpus/                     # Project Gutenberg .txt books (you provide)
├── src/                        # Next.js App (Node 20+)
│   ├── app/
│   │   ├── api/query/route.ts  # Main API endpoint for chat
│   │   └── page.tsx            # Chat UI + Trust Panel
│   └── lib/
│       ├── config.ts           # Zod config from env variables
│       ├── chunking.ts         # Paragraph-aware chunker logic
│       ├── gutenberg.ts        # Boilerplate stripping + metadata extraction
│       ├── embeddings.ts       # Gemini embedding wrappers
│       ├── retrieval.ts        # LanceDB queries and dense search
│       ├── rerank.ts           # Cohere API wrapper
│       └── synthesize.ts       # Cross-book synthesis generation prompt
├── scripts/
│   └── ingest.ts               # CLI: strip → chunk → embed → upsert to DB
└── eval/
    ├── golden.jsonl            # ~40 Q/A/source triples for evaluation
    └── run_eval.ts             # RAGAS metrics + ablation table harness
```

---

## 5. Build, Run, Test — Verification Gates

All commands assume a standard terminal (Node.js 20+).

```bash
# 1. Install dependencies
npm install

# 2. Run ingestion (Required after modifying chunking/embedding logic or adding books)
npm run ingest

# 3. Run the evaluation harness (Required before marking RAG changes as complete)
# This tests the retrieval and synthesis quality against golden.jsonl
npx tsx eval/run_eval.ts

# 4. Run the frontend application
npm run dev
```

### Required gates before marking any task done
1. TypeScript compilation succeeds (`npx tsc --noEmit`).
2. Evaluation harness passes (if RAG logic was modified).
3. `npm run dev` builds successfully without crashing.
4. `README.md` and `ARCHITECTURE.md` updated if behavior, architecture, or setup changed.

---

## 6. Tech Stack & Conventions

| Layer         | Stack                                                                                   |
|---------------|-----------------------------------------------------------------------------------------|
| Runtime       | Node.js 20+ (Next.js App Router)                                                        |
| Embeddings    | `@google/genai` (`gemini-embedding-2` @ 768 dims, Matryoshka natively supported)        |
| Generation    | `@google/genai` (`gemini-3-flash`, default temperature)                                 |
| Database      | `lancedb` (embedded file system database)                                               |
| UI            | React, Tailwind CSS (Mobile-first responsive design is non-negotiable)                  |
| Configuration | `zod` for robust fallback defaults in `src/lib/config.ts`                               |
| Tracing       | LangSmith SDK (`@langchain/core/tracers` or native)                                     |

- **Zod Config:** The app should run smoothly even if `.env` only contains API keys. Always provide safe fallbacks (e.g. `CHUNK_TARGET_TOKENS=500`).
- **Small, typed functions:** Maintain strong TypeScript boundaries for all functions.

---

## 7. RAG Architecture & Golden Rules

1. **Thin over framework:** No LangChain / LlamaIndex for orchestration. Use the SDKs directly.
2. **Build in layers, gated by eval:** Always measure changes to chunking or retrieval against `run_eval.ts` before committing to them.
3. **Grounding first:** The synthesis prompt answers only from provided passages, attributes each claim to its book, and refuses below the relevance floor. NEVER let the model answer from parametric memory.
4. **Paragraph-aware chunking:** Pack whole paragraphs up to ~`CHUNK_TARGET_TOKENS` with overlap; **never** split a paragraph. Preserve `chunk_index` order.
5. **Pure dense is primary:** We do not use FTS/Hybrid search. Modern embeddings capture semantics perfectly.
6. **Rate Limiting:** We use the Gemini free tier. Scripts like `ingest.ts` and `run_eval.ts` must gracefully handle 429s (exponential backoff).

---

## 8. Documentation & Security

- **MANDATORY:** When you add or change a feature, update `README.md` and `ARCHITECTURE.md` in the same task. There must never be discrepancies between the codebase and documentation.
- **Safety and Precision:** For any work related to prompts, generation, or outputs, review [`SAFETY_AND_PRECISION.md`](./SAFETY_AND_PRECISION.md) to ensure we maintain our anti-hallucination and prompt injection constraints.
- **Secrets:** Never hardcode API keys. Always use `.env` and `config.ts`.

---

## 9. Things to NEVER Do in This Repo

- **Never use Python, Docker, Postgres, or Supabase.** Everything runs strictly in the local Node.js + embedded LanceDB context.
- **Never exceed 768 embedding dims.** `gemini-embedding-2` supports Matryoshka truncation natively; use it to keep the DB tiny.
- **Never commit in-copyright books.** The `corpus/` folder must contain public-domain text only.
- **Never build Auth, multi-user, or EPUB/PDF support.** These are explicitly out of scope for the MVP.
- **Never run modifying git commands** (such as `git add`, `git commit`, `git restore`). The agent must never modify git state or stage/unstage files; only read-only operations are allowed.
- **Never call external APIs from the browser.** Client → Next.js Route Handler → External API.
