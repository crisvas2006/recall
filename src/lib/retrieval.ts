import * as lancedb from "@lancedb/lancedb";
import { GoogleGenAI } from "@google/genai";
import { env } from "./config";
import { RunTree } from "langsmith";

// Initialize Gemini for generating the Query Embedding
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export interface RetrievedPassage {
  id: string;
  book_title: string;
  book_author: string;
  text: string;
  score: number;
}

/**
 * Generates an embedding for the user's query.
 * Note the taskType: "RETRIEVAL_QUERY", which perfectly aligns with 
 * the "RETRIEVAL_DOCUMENT" taskType we used during ingestion.
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function embedQueryWithRetry(query: string, maxRetries = 5): Promise<number[]> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await ai.models.embedContent({
        model: "gemini-embedding-2",
        contents: query,
        config: {
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: 768
        }
      });
      
      const values = response.embeddings?.[0]?.values;
      if (!values) {
        throw new Error("Failed to generate query embedding.");
      }
      return values;
    } catch (error: any) {
      if (error?.status === 429 || error?.status === 503 || error?.message?.includes("429") || error?.message?.includes("503")) {
        attempt++;
        const backoffTime = Math.pow(2, attempt) * 500;
        const statusCode = error?.status || (error?.message?.match(/(429|503)/)?.[0] ?? "Unknown");
        console.warn(`⚠️ Gemini API error (${statusCode}): ${error?.message || 'No error message provided'}. Retrying query embedding in ${backoffTime / 1000}s... (Attempt ${attempt}/${maxRetries})`);
        await sleep(backoffTime);
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Failed to generate query embedding after ${maxRetries} attempts.`);
}

/**
 * Phase 3: Pure Dense Retrieval
 * Retrieves the most semantically relevant passages from the local LanceDB database.
 */
export async function retrievePassages(query: string, parentRun?: RunTree): Promise<RetrievedPassage[]> {
  let run: RunTree | undefined;
  if (parentRun && env.LANGCHAIN_TRACING_V2) {
    run = new RunTree({
      name: "LanceDB_Retrieval",
      run_type: "retriever",
      parent_run: parentRun,
      inputs: { query }
    });
    await run.postRun();
  }

  try {
    // 1. Embed the user's query
    const queryVector = await embedQueryWithRetry(query);

    // 2. Connect to the local LanceDB instance
    const db = await lancedb.connect(env.LANCEDB_URI);
    
    // We expect the table to be named "documents" as defined in our ingestion script
    const tableNames = await db.tableNames();
    if (!tableNames.includes("documents")) {
      console.warn("⚠️ 'documents' table not found in LanceDB. Have you run `npm run ingest`?");
      if (run) {
        await run.end({ outputs: { passages: [] } });
        await run.patchRun();
      }
      return [];
    }
    const table = await db.openTable("documents");

    // 3. Perform the Dense Vector Search
    const limit = env.RERANK_ENABLED ? env.RERANK_CANDIDATES : env.RERANK_TOP_K;

    const results = await table.vectorSearch(queryVector)
      .limit(limit)
      .toArray();

    // 4. Transform to our expected interface
    let passages: RetrievedPassage[] = results.map((row: any) => ({
      id: row.id,
      book_title: row.book_title,
      book_author: row.book_author,
      text: row.text,
      score: row._distance // LanceDB returns L2 distance by default
    }));

    if (env.RERANK_ENABLED) {
      console.warn("Reranker is enabled in config, but not yet implemented. Returning dense results.");
      passages = passages.slice(0, env.RERANK_TOP_K);
    }

    if (run) {
      await run.end({ outputs: { passages } });
      await run.patchRun();
    }
    return passages;
  } catch (error: any) {
    if (run) {
      await run.end({ error: error.message });
      await run.patchRun();
    }
    throw error;
  }
}
