# recall

> A grounded, cited **synthesis engine** over a personal library of books. Ask a
> real question — *"how do I motivate myself to work out?"* — and `recall`
> retrieves the relevant passages across your whole corpus, **merges them into a
> single grounded answer**, and cites the exact book and passage behind every
> claim. When your library doesn't support an answer, it says so instead of
> guessing.

---

## What it does

Point it at a curated library (the MVP ships with a public-domain
"practical wisdom" corpus — Marcus Aurelius, Epictetus, Seneca, James Allen,
William Walker Atkinson). Ask a question, and get back:

1. A **synthesised answer** that merges complementary ideas from *multiple
   books*, not just the single closest paragraph.
2. **Citations per claim** — each point is attributed to the book and passage it
   came from, and you can open the source text.
3. **Where sources differ**, it says so rather than flattening them.
4. An honest **"your library doesn't cover this"** when retrieval finds no real
   support — instead of falling back on the model's own memory.
5. A **"why you're seeing this" panel** exposing the retrieved passages, their
   scores, and a faithfulness signal — trust made visible.

The single job-to-be-done: *"When I ask a question, I want a grounded answer
synthesised from **my** books — with receipts — so I can trust it came from my
library, not a language model's general memory."*

> **Why grounding is the whole point.** A capable LLM already "knows" these
> classics. `recall`'s value — and the thing a bare chatbot can't convincingly
> do — is proving the answer is drawn from *your* corpus by showing the actual
> passages it used, and by synthesising across several books with attribution.

---

## Architecture at a glance

```
Next.js (Vercel)  ──►  FastAPI (Docker / Cloud Run)  ──►  Gemini API
  chat + trust           ingest · semantic retrieval        embeddings + gen
  panel                  · rerank · cross-book synthesis
                                   │
                                   ├──►  Supabase (pgvector + Postgres FTS)
                                   └──►  OpenTelemetry ──► Phoenix (local)
```

Full detail and rationale in [`ARCHITECTURE.md`](./ARCHITECTURE.md). Deployment
across local / Cloud Run / Vercel is in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## Quick start (local)

Prerequisites: Docker + Docker Compose, Node 20+, a Supabase project, a Gemini
API key.

```bash
# 1. Configure
cp .env.example .env          # fill in GEMINI_API_KEY, DATABASE_URL, SUPABASE_*

# 2. Provision the database (once)
#    Run supabase/schema.sql against your Supabase project (see DEPLOYMENT.md)

# 3. Add books: drop Project Gutenberg plain-text files into ./corpus/
#    e.g. meditations.txt, enchiridion.txt, as-a-man-thinketh.txt ...

# 4. Bring up backend + Phoenix (observability)
docker compose up --build     # backend :8000, Phoenix :6006

# 5. Ingest the whole library (once)
docker compose run --rm backend python -m app.ingest --path ./corpus

# 6. Frontend
cd frontend && npm install && npm run dev   # :3000
```

Chat at `http://localhost:3000`; watch retrieve → rerank → synthesise in Phoenix
at `http://localhost:6006`.

---

## The corpus (public domain — legally shareable)

The demo uses [Project Gutenberg](https://www.gutenberg.org) plain-text books,
which are public domain in the US and free to redistribute. A coherent
single-domain corpus retrieves far better than a mixed pile, so the starter set
is "practical wisdom":

| Book | Author |
|---|---|
| *Meditations* | Marcus Aurelius |
| *The Enchiridion* | Epictetus |
| *Of a Happy Life / On Benefits* (collected works) | Seneca |
| *As a Man Thinketh* | James Allen |
| *Your Mind and How to Use It* | William Walker Atkinson |

Swap in any Gutenberg text. **Keep the shared corpus public-domain** — don't
commit modern in-copyright books to a public repo.

---

## RAG & LLM approach

| Concern               | Decision                                                                                    | Why (for a prose / idea corpus)                                                                                     |
| -----------------------| ---------------------------------------------------------------------------------------------| ---------------------------------------------------------------------------------------------------------------------|
| **Corpus / chunking** | Plain text, **paragraph-aware** chunks (~500 tokens, whole paragraphs, ~15% overlap)        | Prose has little heading structure; a chunk must read as a *complete idea*, not a stranded sentence                 |
| **Multi-book**        | **Supported** — one curated, single-domain library                                          | Cross-book synthesis is the product; storage/retrieval across books is supported in the schema                      |
| **Embeddings**        | `gemini-embedding-001` @ **768 dims**, task types `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`  | Semantic retrieval is the workhorse for conceptual queries; 768 stays under pgvector's 2 000-dim index cap          |
| **Retrieval**         | **Dense-primary** hybrid (dense + lexical, RRF) → **rerank** top-30 → top-6                 | Query vocabulary rarely matches prose wording, so dense leads; lexical rescues names/terms; rerank drives precision |
| **Reranker**          | Local CPU cross-encoder `ms-marco-MiniLM-L-6-v2`                                            | Highest-ROI step for semantic relevance; runs anywhere on CPU, no extra key                                         |
| **Generation**        | `gemini-3-flash` @ temp ~0.25, **cross-book synthesis** prompt                              | Merge complementary passages, attribute each to its book, flag disagreements, refuse if unsupported                 |
| **Orchestration**     | Thin / no heavy framework — direct SDK + library calls                                      | Every decision stays visible & defensible                                                                           |
| **Guardrails**        | Grounded-only + per-claim citation + refusal below a relevance floor                        | Credibility rests on proving the answer came from the corpus, not the model                                         |
| **Quality control**   | ~40-question golden set + RAGAS-style metrics; **ablation table** dense → +hybrid → +rerank | Honest measurement — expect hybrid to add *less* on prose than on technical text, and report that                   |
| **Observability**     | OpenTelemetry → self-hosted Phoenix locally; Cloud Trace in cloud                           | Vendor-neutral traces; same data feeds the in-app trust panel                                                       |

Retrieval is built **in layers, each gated by the eval harness** — every added
component is a measured decision.

---

## Productionisation

Three environments, one shared Supabase project:

- **Local** — `docker compose` (backend + Phoenix) + `npm run dev` frontend. The
  demo path, because it gives full observability.
- **Backend → GCP Cloud Run** — the container deploys scale-to-zero (cheap; the
  reranker is baked into the image to keep cold starts sane).
- **Frontend → Vercel** — standard Next.js, points at the Cloud Run URL.

Ingestion is an **offline batch job** (a CLI / Cloud Run Job), never on the
request path. See [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## ⟢ Sections written in my own voice and words

> My real experience.

- **How I used AI tools**
  - I started the project by asking Claude to help me come up with a plan for the project and brainstorm some ideas. I fed it with the assessment document containing the task requirements and constraints, then added my own requirements, initial thoughts about the direction and some architecture guidelines regarding the services I intended to use (Supabase, GCP, etc), and then asked Claude to iterate with me over how this might be implemented until we reached the final project plan which included architecture, tools and libraries, Readme.md file, Agentic Coder instructions (CLAUDE.md), DB schema and deployment steps.
  This part needed a few iterations and changes, and the desired outcome itself changed its nature as we went.
  
  - Next I used the agentic coder to implement elements step by step. I'd review each change and ask the agent to make adjustments as needed before moving to the next step.
  
    - what Claude Code wrote vs. what I designed/decided;
    - where I overrode its suggestions.
- **Engineering standards I followed — and what I consciously skipped**  
  - My goal here was to write a clean code project that achieved the MVP goals reliably and could serve as a base for future development. Things that would hinder this and complicate the project unecessarily, like auth, multi format files, multi-context, large corpus, were omitted. 
  - In order to produce a reliable and accurate system, testing was included as a high priority, and available at each step in the development process.
  - In order to verify outputs and ease the debugging process, I included tracing at a granular level so that an engineer can check how each step in a flow gets executed.
 
- **What I'd do differently / next** — the v2 roadmap below, plus anything the
  eval numbers made me reconsider.

---

## Known limitations (MVP)

- **Plain text only**, English, one curated single-domain library. EPUB/PDF are
  acknowledged as important and **not implemented**.
- **Chunk-level context.** Retrieval returns coherent-idea chunks but does not
  yet expand to the surrounding *whole idea* (parent section / neighbour window)
  — deferred; the schema is designed to make it a trivial add (see v2).
- **No cross-domain corpus.** Mixing wildly different domains hurts retrieval; the
  demo stays single-domain on purpose.
- **No auth / multi-user.** Single-tenant demo.

Scoping these out on purpose — a well-engineered basic solution over an
over-engineered complex one — is the design thesis, not an oversight.

## v2 roadmap

- **Whole-idea context expansion**: after reranking, fetch each winner's
  neighbours (`chunk_index ± N`, same book) and stitch for full context.
- **EPUB / PDF** ingestion.
- **Larger, multi-domain libraries** with per-book filtering.
- **Streaming** synthesis, answer caching.
- Multilingual evaluation (capability already present via the embedding model).

---

## Repo layout

```
recall/
├── README.md              ├── ARCHITECTURE.md      ├── DEPLOYMENT.md
├── CLAUDE.md              ├── .env.example         ├── docker-compose.yml
├── Dockerfile            ├── requirements.txt
├── supabase/schema.sql    # pgvector + FTS + hybrid_search()
├── corpus/                # Project Gutenberg .txt files (you provide)
├── app/                   # FastAPI backend (built with Claude Code)
├── frontend/              # Next.js app (built with Claude Code)
└── eval/                  # golden set + RAGAS harness
```
