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
   sentence-transformers, psycopg, FastAPI directly. Every decision must be
   defensible in the README.
2. **Build in layers, gated by eval.** Order:
   1. Schema + ingestion CLI (strip Gutenberg boilerplate → paragraph chunk →
      embed → upsert).
   2. Golden set (`eval/golden.jsonl`, incl. cross-book + off-corpus questions) +
      RAGAS harness — **before** feature polish.
   3. Retrieval: dense-only → +hybrid (RRF) → +rerank, measuring each step.
   4. Cross-book synthesis (merge, attribute per book, flag disagreements,
      refuse).
   5. Trust panel in the frontend from the trace data.
3. **Every model/param is config** (see `.env.example`), never hardcoded.
4. **Grounding first.** The synthesis prompt answers only from provided
   passages, attributes each claim to its book, and refuses below the relevance
   floor. Never let the model answer from parametric memory.
5. **Paragraph-aware chunking.** Pack whole paragraphs up to ~`CHUNK_TARGET_TOKENS`
   with overlap; never split a paragraph. Preserve `chunk_index` order.
6. **Dense is primary; lexical supports; rerank decides.** (Prose corpus — query
   vocabulary rarely matches source wording.)
7. **Instrument with OpenTelemetry** (not a vendor SDK).

## Stack

- Backend: Python 3.12, FastAPI, uvicorn.
- LLM/embeddings: `google-genai`. Embeddings `gemini-embedding-001` @ 768 dims,
  task types `RETRIEVAL_DOCUMENT` (docs) / `RETRIEVAL_QUERY` (queries).
  Generation `gemini-3-flash`, temp default.
- Reranker: `sentence-transformers` `CrossEncoder`,
  `cross-encoder/ms-marco-MiniLM-L-6-v2`, CPU.
- DB: Supabase Postgres + pgvector + FTS via psycopg; call `hybrid_search()`
  (joins book title/author). Pooled connection string in serverless.
- Frontend: Next.js (App Router), one `POST /query`, chat + trust panel with
  per-book attribution.
- Eval: `ragas` (or equivalent), Gemini 3 Flash as judge.
- Tracing: OpenTelemetry SDK + OTLP → Phoenix locally.

## Ingestion specifics

- Input: `./corpus/*.txt` (Project Gutenberg plain text, UTF-8).
- Strip everything outside the `*** START ... ***` / `*** END ... ***` markers.
- Title/author from the Gutenberg header or a `corpus/manifest.json` sidecar.
- Optionally capture chapter/section as `section_title` when detectable; it's
  nullable — don't over-engineer heading detection for prose.

## Do / Don't

- ✅ Small, typed functions; Pydantic models for API + config
  (`pydantic-settings`).
- ✅ Tests for chunking (paragraph integrity, boilerplate stripping), RRF
  fusion, and the refusal path.
- ✅ Return `{ answer, citations[] (book, author, passage, score),
  retrieved_passages[], faithfulness }`.
- ✅ Keep the request path free of batch work (ingestion is a CLI/Job).
- ❌ No auth, multi-user, streaming, caching, EPUB/PDF, context expansion, or
  multi-domain corpora in the MVP — deferred (note in comments where relevant).
- ❌ No secrets in the image or frontend. Service-role key is backend-only.
- ❌ Don't exceed 2 000 embedding dims (pgvector index cap) — use 768.
- ❌ Don't commit in-copyright books; corpus is public-domain only.

## Suggested layout

```
backend/
  main.py         # FastAPI, /query, CORS, tracing
  config.py       # pydantic-settings from env
  ingest.py       # CLI: strip → chunk → embed → upsert
  chunking.py     # paragraph-aware chunker
  gutenberg.py    # boilerplate stripping + metadata
  embeddings.py   # gemini embed wrappers (doc/query task types)
  retrieval.py    # hybrid_search() call + RRF params
  rerank.py       # CrossEncoder wrapper
  synthesize.py   # cross-book synthesis prompt, citations, refusal
  tracing.py      # OpenTelemetry setup
eval/
  golden.jsonl    # ~40 Q/A/source triples (incl. cross-book + off-corpus)
  run_eval.py     # RAGAS metrics + ablation table
corpus/           # .txt books (+ optional manifest.json)
frontend/         # Next.js
supabase/schema.sql
```

## First session checklist

1. Ingest 2–3 books; eyeball that boilerplate is stripped and paragraphs stay
   intact.
2. Stand up the golden set + eval harness (include cross-book & off-corpus Qs).
3. Only then wire retrieval layers, recording the ablation table as you go.
