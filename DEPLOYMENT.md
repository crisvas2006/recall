# Deployment & Productionisation

`recall` is designed to run locally out-of-the-box using an embedded database (LanceDB) and a single monolithic Next.js application. This ensures reviewers can instantly run and evaluate the assignment without provisioning cloud infrastructure.

However, moving this architecture to a production environment requires only a few configuration changes. 

## The Production Architecture

```
                   Vercel (Serverless Edge)
                     (Next.js App / API)
                              │
     ┌────────────────────────┼────────────────────────┐
     │                        │                        │
     ▼                        ▼                        ▼
 Hosted Vector DB         Gemini API              Cohere API
 (e.g. LanceDB Cloud)   (Embeddings/Gen)          (Reranker)
```

### 1. Hosted Vector Database
Vercel serverless functions do not support a persistent writable filesystem, meaning an embedded LanceDB stored in `./lancedb` will not persist across function invocations in production.

**Solution**: 
Switch the LanceDB connection string from a local path to an object storage path (e.g., AWS S3, Google Cloud Storage) or connect to a fully managed vector database like **LanceDB Cloud**, **Pinecone**, or **Weaviate**. 
- *Code Change*: Change `lancedb.connect("./lancedb")` to `lancedb.connect("s3://your-bucket-name")` or use the respective cloud provider SDK.

### 2. Deployment on Vercel
Deploying the Next.js application to a hyper-scaler or serverless platform like Vercel is trivial once the database is externalized.
1. Connect the GitHub repository to a new Vercel project.
2. Add the required Environment Variables in the Vercel dashboard:
   - `GEMINI_API_KEY`
   - `COHERE_API_KEY`
   - `LANGSMITH_API_KEY` (and `LANGCHAIN_PROJECT` / `LANGCHAIN_TRACING_V2`)
   - `DATABASE_URL` (for the hosted vector DB)
3. Vercel automatically builds and deploys the application.

### 3. Scaling & Caching
To truly productionize the app for thousands of users:
- **Vercel Edge Functions**: Move the `/api/query` route to Vercel's Edge runtime for lower latency, provided the DB client supports edge execution.
- **Answer Caching**: Implement semantic caching (e.g., Redis or a dedicated semantic cache layer) to intercept repeated queries and return cached answers without hitting the Gemini/Cohere APIs.
- **Streaming**: Use the Vercel AI SDK to stream the synthesis generation to the client, greatly improving perceived performance (TTFB).

### 4. Background Ingestion
In a local environment, ingestion is a manual CLI script (`npm run ingest`). In production, ingestion should be decoupled from the core application.
- **Solution**: Move ingestion into an asynchronous workflow using an event-driven architecture (e.g., AWS SQS + Lambda, or Google Cloud Pub/Sub + Cloud Run). When a new book is uploaded to an S3 bucket, it triggers the ingestion worker, which chunks, embeds, and upserts the data into the hosted vector database without blocking the user-facing API.
