# Deployment — recall

Three environments, one shared Supabase project:

| Environment | Runs what | Purpose |
|---|---|---|
| **Local** (Docker Compose) | Backend + Phoenix + local frontend | The demo path — full observability |
| **GCP Cloud Run** | Backend container | Cheap, scale-to-zero serverless API |
| **Vercel** | Next.js frontend | Public UI, points at the Cloud Run URL |
| **Supabase** | Postgres + pgvector + FTS | Shared vector store for all of the above |

---

## 1. Supabase (do this first — everything depends on it)

Create a **dedicated project** for `recall` (separate from any other work).

1. **Create the project** in the Supabase dashboard. Pick a region close to
   where the backend runs (Cloud Run region) to keep query latency low. Save the
   database password.
2. **Enable pgvector**: it ships with Supabase; `schema.sql` runs
   `create extension if not exists vector;` for you.
3. **Apply the schema**: open the SQL Editor and run the contents of
   [`supabase/schema.sql`](./supabase/schema.sql). This creates `documents`,
   `chunks` (with a `vector(768)` column and a generated `fts` tsvector), the
   HNSW + GIN indexes, and the `hybrid_search()` function.
4. **Grab credentials** (Project Settings → API and → Database):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only — never ship to the frontend)
   - `DATABASE_URL` — **use the connection pooler** (Transaction mode, port
     `6543`), not the direct `5432` connection. Serverless backends (Cloud Run)
     open many short-lived connections; the pooler prevents exhausting Postgres.

   ```
   # Pooled (use this for Cloud Run):
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   # Direct (fine for local ingestion / migrations):
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

> Note on dimensions: the schema uses `vector(768)` because pgvector's HNSW
> index caps at 2 000 dimensions. If you ever change `EMBEDDING_DIMS`, change the
> column type and re-ingest — embeddings aren't portable across dimensions.

---

## 2. Local (the demo environment)

Gives you Phoenix for live tracing — this is what you screen-record for the
submission.

```bash
cp .env.example .env
# Fill: GEMINI_API_KEY, DATABASE_URL (direct 5432 is fine locally),
#       SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Leave OTEL_EXPORTER_OTLP_ENDPOINT pointed at Phoenix (http://phoenix:6006 in
# compose, http://localhost:6006 from the host).

docker compose up --build            # backend :8000, Phoenix :6006

# Add books: drop Project Gutenberg .txt files into ./corpus (public domain only).
# Ingest the whole library once:
docker compose run --rm backend python -m app.ingest --path ./corpus

# Frontend (separate terminal):
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev                          # :3000
```

- Chat: `http://localhost:3000`
- Traces: `http://localhost:6006` (watch retrieve → rerank → generate per query)

---

## 3. GCP Cloud Run (backend)

Cloud Run runs the **container** as-is — unlike Vercel's function runtime, it
happily hosts FastAPI plus the CPU cross-encoder. Scale-to-zero keeps it cheap.

### 3.1 One-time GCP setup

```bash
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
    secretmanager.googleapis.com cloudbuild.googleapis.com

# Artifact Registry repo for the image
gcloud artifacts repositories create recall \
    --repository-format=docker --location=<REGION>
```

### 3.2 Secrets (don't bake keys into the image)

```bash
printf '%s' "$GEMINI_API_KEY"            | gcloud secrets create gemini-api-key --data-file=-
printf '%s' "$DATABASE_URL"              | gcloud secrets create database-url --data-file=-
printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets create supabase-service-key --data-file=-
```

### 3.3 Build, push, deploy

```bash
REGION=<REGION>; PROJECT=<PROJECT_ID>
IMAGE="$REGION-docker.pkg.dev/$PROJECT/recall/backend:latest"

gcloud builds submit --tag "$IMAGE"      # builds the Dockerfile (reranker pre-baked)

gcloud run deploy recall-backend \
    --image "$IMAGE" \
    --region "$REGION" \
    --allow-unauthenticated \
    --memory 2Gi --cpu 1 \
    --min-instances 0 --max-instances 3 \
    --concurrency 8 \
    --cpu-boost \
    --set-env-vars "EMBEDDING_MODEL=gemini-embedding-001,EMBEDDING_DIMS=768,GENERATION_MODEL=gemini-3-flash-preview,GENERATION_TEMPERATURE=0.1,RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2,RETRIEVAL_MODE=hybrid,RERANK_ENABLED=true,OTEL_ENABLED=false,CORS_ALLOW_ORIGINS=https://<your-vercel-app>.vercel.app" \
    --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,DATABASE_URL=database-url:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-key:latest"
```

Notes that matter:

- **Memory 2 Gi, CPU 1** — comfortable for torch + the MiniLM cross-encoder.
- **Reranker pre-baked** in the image (see `Dockerfile`) so cold starts don't
  fetch from HuggingFace. `--cpu-boost` further softens the first-request
  latency of model load.
- **`--min-instances 0`** = cheapest (scale to zero) but cold starts on the
  first request after idle. Set to `1` if you want the demo always warm (costs a
  bit of idle CPU/memory).
- **`--concurrency 8`** — the cross-encoder is CPU-bound; keep concurrency
  modest so requests don't contend on CPU. Tune with `max-instances`.
- **Pooled `DATABASE_URL`** (port 6543) — serverless + direct Postgres
  connections exhaust the pool; the Supabase transaction pooler fixes this.
- **`OTEL_ENABLED=false`** in cloud (Phoenix is local-only), or point it at
  Google Cloud Trace if you want cloud tracing.

### 3.4 Ingestion in the cloud

Ingestion is a batch job, not part of the service. Either:

- Run it locally against the same Supabase project (simplest), or
- Run it as a **Cloud Run Job**:

  ```bash
  gcloud run jobs create recall-ingest --image "$IMAGE" --region "$REGION" \
      --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,DATABASE_URL=database-url:latest" \
      --command python --args "-m,app.ingest,--path,./corpus"
  gcloud run jobs execute recall-ingest --region "$REGION"
  ```

---

## 4. Vercel (frontend)

Standard Next.js — no special adaptation.

1. Import the repo in Vercel; set the **root directory** to `frontend/`.
2. Environment variable:
   - `NEXT_PUBLIC_API_URL = https://recall-backend-xxxx-<region>.run.app`
     (the Cloud Run URL from step 3.3)
3. Deploy. Then set the backend's `CORS_ALLOW_ORIGINS` to the resulting Vercel
   domain (redeploy the Cloud Run service if you hardcoded it above).

Keep the `SUPABASE_SERVICE_ROLE_KEY` **out** of the frontend — all privileged DB
access goes through the backend.

---

## 5. Cost notes

Everything here fits comfortably in demo/hobby budgets:

- **Gemini** — embeddings `gemini-embedding-001` ≈ $0.15 / 1M input tokens
  (the five-book starter library is well under 1M tokens combined → cents to
  ingest, re-runs included). Generation `gemini-3-flash` ≈ $0.50 in / $3.00 out
  per 1M tokens → roughly **$0.003–0.01 / query** (synthesis queries send more
  context — several passages across books — than a single-source lookup).
  Flash tier also has a free dev tier.
- **Cloud Run** — scale-to-zero; you pay only while serving requests. A demo
  costs pennies/month unless you pin `min-instances 1`.
- **Supabase** — free tier is sufficient for one small corpus.
- **Vercel** — hobby tier hosts the Next.js frontend free.

> Prices drift — re-check Google/GCP/Supabase/Vercel current pricing before
> quoting these in your submission.

---

## 6. Environment matrix

| Var | Local | Cloud Run | Vercel |
|---|---|---|---|
| `GEMINI_API_KEY` | `.env` | Secret Manager | — |
| `DATABASE_URL` | direct `5432` | pooled `6543` (secret) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` | Secret Manager | — |
| `NEXT_PUBLIC_API_URL` | `localhost:8000` | — | Cloud Run URL |
| `OTEL_ENABLED` | `true` → Phoenix | `false` / Cloud Trace | — |
| `CORS_ALLOW_ORIGINS` | `localhost:3000` | Vercel domain | — |
