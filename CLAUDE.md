# CLAUDE.md — grounding context for Claude Code

Read this before implementing anything. `ARCHITECTURE.md` is the full design;
this is the working contract.

## What we're building

`recall`: a grounded, cited **synthesis engine** over a personal library of
plain-text books. It retrieves passages across the whole corpus, **merges them
into one answer that attributes each point to its source book**, and refuses
("your library doesn't cover this") when there's no real support. Trust is the
visible product feature — because the LLM already "knows" these public-domain
classics, credibility comes from showing the actual retrieved passages.

## Golden rules

1. **Thin over framework.** No LangChain / LlamaIndex. Use the Gemini SDK,
   Cohere SDK, LanceDB, and Vercel AI SDK directly. Every decision must be
   defensible in the README.
2. **Build in layers, gated by eval.** Order:
   1. Schema + ingestion script (strip Gutenberg boilerplate → paragraph chunk →
      embed → upsert to LanceDB).
   2. Golden set (`eval/golden.jsonl`, incl. cross-book + off-corpus questions) +
      RAGAS harness — **before** feature polish.
   3. Retrieval: pure dense → +rerank, measuring each step.
   4. Cross-book synthesis (merge, attribute per book, flag disagreements,
      refuse).
   5. Trust panel in the frontend from the trace data.
3. **Every model/param is config** (see `.env.example`), never hardcoded.
4. **Grounding first.** The synthesis prompt answers only from provided
   passages, attributes each claim to its book, and refuses below the relevance
   floor. Never let the model answer from parametric memory.
5. **Paragraph-aware chunking.** Pack whole paragraphs up to ~`CHUNK_TARGET_TOKENS`
   with overlap; never split a paragraph. Preserve `chunk_index` order.
6. **Pure dense is primary; rerank decides.** We do not use FTS/Hybrid search. Modern embeddings (`text-embedding-004`) capture semantics perfectly.
7. **Instrument with LangSmith.**

## Stack

- Runtime: Node.js 20+ (Next.js App Router).
- LLM/embeddings: `@google/genai` (or standard Gemini API). Embeddings `text-embedding-004` @ 768 dims,
  task types `RETRIEVAL_DOCUMENT` (docs) / `RETRIEVAL_QUERY` (queries).
  Generation `gemini-3-flash`, default temperature.
- Reranker: `cohere-ai` SDK (`rerank-english-v3.0` or latest).
- DB: `lancedb` (embedded file system database).
- Eval: `ragas` (or equivalent typescript libraries), Gemini 3 Flash as judge.
- Tracing: LangSmith (`langchain` or native LangSmith SDK).

## Ingestion specifics

- Input: `./corpus/*.txt` (Project Gutenberg plain text, UTF-8).
- Strip everything outside the `*** START ... ***` / `*** END ... ***` markers.
- Title/author from the Gutenberg header or a `corpus/manifest.json` sidecar.
- Optionally capture chapter/section as `section_title` when detectable.

## Do / Don't

- ✅ Small, typed functions; Zod models for API + config.
- ✅ Tests for chunking (paragraph integrity, boilerplate stripping) and the refusal path.
- ✅ Return `{ answer, citations[] (book, author, passage, score),
  retrieved_passages[], faithfulness }`.
- ✅ Keep the request path free of batch work (ingestion is an npm script).
- ❌ No Python, No Docker, No Postgres/Supabase. Everything runs in the Node context.
- ❌ No auth, multi-user, streaming, caching, EPUB/PDF, context expansion, or
  multi-domain corpora in the MVP.
- ❌ Don't exceed 768 embedding dims — use Matryoshka truncation natively supported by text-embedding-004.
- ❌ Don't commit in-copyright books; corpus is public-domain only.

## Suggested layout

```
src/
  app/
    api/query/route.ts  # /api/query endpoint
    page.tsx            # Chat UI + Trust Panel
  lib/
    config.ts           # Zod config from env
    chunking.ts         # paragraph-aware chunker
    gutenberg.ts        # boilerplate stripping + metadata
    embeddings.ts       # gemini embed wrappers
    retrieval.ts        # LanceDB queries
    rerank.ts           # Cohere API wrapper
    synthesize.ts       # cross-book synthesis prompt
scripts/
  ingest.ts             # CLI: strip → chunk → embed → upsert
eval/
  golden.jsonl          # ~40 Q/A/source triples
  run_eval.ts           # RAGAS metrics + ablation table
corpus/                 # .txt books (+ optional manifest.json)
```

## First session checklist

1. Ingest 2–3 books into local LanceDB; eyeball that boilerplate is stripped and paragraphs stay intact.
2. Stand up the golden set + eval harness (include cross-book & off-corpus Qs).
3. Only then wire retrieval layers, recording the ablation table as you go.
