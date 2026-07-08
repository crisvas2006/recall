# Task Spec: Cohere Reranking Layer

---

## 1. Problem Statement

Our current retrieval pipeline in `recall` relies entirely on dense vector search (LanceDB + Gemini Embeddings). While fast, dense retrieval often surfaces passages that are topically similar but not perfectly semantically aligned with the user's intent. To maximize the relevancy of our synthesized answers, we need to introduce a Cross-Encoder Reranking phase using the Cohere Rerank API. 

## 2. Goals & Non-Goals

- **Goals:** 
  - Create a new module `src/lib/rerank.ts` that communicates with the Cohere API.
  - Update `retrieval.ts` to fetch a larger candidate pool (`RERANK_CANDIDATES` = ~30) and then rerank them down to the final working set (`RERANK_TOP_K` = 6).
  - Respect the `RERANK_ENABLED` feature flag in `config.ts` so the system can fallback to pure dense retrieval if disabled.
- **Non-Goals:** 
  - We will not implement local cross-encoders (e.g., ONNX/Transformers.js). We rely strictly on the Cohere API.
  - We will not implement multi-stage reranking (e.g. BM25 + Dense -> Reranker). LanceDB remains our sole initial retrieval layer.

## 3. Acceptance Criteria

1. **AC-1:** If `RERANK_ENABLED` is `true`, a query for "What does Marcus Aurelius say about waking up?" fetches 30 passages from LanceDB, sends them to Cohere, and returns the top 6.
2. **AC-2:** If `RERANK_ENABLED` is `false`, the system fetches exactly 6 passages from LanceDB and returns them immediately without calling Cohere.
3. **AC-3:** The `RetrievedPassage` objects returned by the reranker retain their original metadata (book title, author, text) but their `score` is updated to reflect the Cohere relevance score.

## 4. Files & Modules Touched

```text
package.json                                    [modify] (install cohere-ai if not present)
src/lib/rerank.ts                               [create]
src/lib/retrieval.ts                            [modify]
src/lib/config.ts                               [modify] (verify flags and API keys exist)
specs/task_reranker.md                          [create] (this file)
```

## 5. Constraints

- **Dependency Limits:** We can use the official `cohere-ai` Node SDK, or just a raw `fetch` to `https://api.cohere.ai/v1/rerank`. A raw `fetch` might be preferable to minimize dependencies for App Router compatibility.
- **Model Choice:** Use the `rerank-english-v3.0` model.
- **Type Safety:** The reranker must return a `Promise<RetrievedPassage[]>` matching the exact signature expected by the synthesis layer.

## 6. Edge Cases

- **Cohere API Outage / Rate Limits:** If the Cohere API throws an error (e.g. 429), the system should gracefully fallback to the original top-K dense results and log a warning, rather than crashing the user query.
- **Small Candidate Pool:** If LanceDB returns fewer than `RERANK_TOP_K` passages (e.g., due to corpus size), the reranker should still process them safely without out-of-bounds errors.
- **Missing API Key:** If `RERANK_ENABLED` is true but `COHERE_API_KEY` is undefined, throw an explicit initialization error early, or fallback to dense.

## 7. Implementation Plan

- **Step 1: Create Reranker Utility**
  - Implement `rerankPassages(query: string, passages: RetrievedPassage[], topN: number): Promise<RetrievedPassage[]>` in `src/lib/rerank.ts`.
  - Use `fetch` to POST to `https://api.cohere.v1/rerank`.
  - Map the Cohere results back to the original `RetrievedPassage` objects, sorting by `relevance_score`.
- **Step 2: Update Retrieval Pipeline**
  - In `src/lib/retrieval.ts`, check `env.RERANK_ENABLED`.
  - If true, `limit(env.RERANK_CANDIDATES)` on the LanceDB query. Await results.
  - Pass the results to `rerankPassages(query, results, env.RERANK_TOP_K)`.
  - Add a `try/catch` around the reranker to fallback to `results.slice(0, env.RERANK_TOP_K)` if Cohere fails.
- **Step 3: Verification**
  - Set `RERANK_ENABLED=true` in `.env`.
  - Ask a question in the UI. Check terminal logs to verify "Reranking 30 candidates..." appears and no crashes occur.

## 8. Testing Plan

- **Manual checks:** 
  - Submit a test query via the UI. Verify the Trust Panel citations populate and the scores reflect Cohere's 0.0 - 1.0 confidence scale (instead of LanceDB's L2 distance metric).
- **Automated / Harness:**
  - Run `npm run eval` to confirm that the pipeline successfully leverages the reranker during the golden dataset evaluation, and verify if Faithfulness/Relevancy scores improve against the baseline.
