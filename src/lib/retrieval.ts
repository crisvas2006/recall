import * as lancedb from "@lancedb/lancedb";
import { GoogleGenAI } from "@google/genai";
import { env } from "./config";

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
async function embedQuery(query: string): Promise<number[]> {
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
}

/**
 * Phase 3: Pure Dense Retrieval
 * Retrieves the most semantically relevant passages from the local LanceDB database.
 */
export async function retrievePassages(query: string): Promise<RetrievedPassage[]> {
  // 1. Embed the user's query
  const queryVector = await embedQuery(query);

  // 2. Connect to the local LanceDB instance
  const db = await lancedb.connect(env.LANCEDB_URI);
  
  // We expect the table to be named "documents" as defined in our ingestion script
  const tableNames = await db.tableNames();
  if (!tableNames.includes("documents")) {
    console.warn("⚠️ 'documents' table not found in LanceDB. Have you run `npm run ingest`?");
    return [];
  }
  const table = await db.openTable("documents");

  // 3. Perform the Dense Vector Search
  // If we had Cohere Rerank enabled, we would fetch RERANK_CANDIDATES (e.g., 30)
  // and pass them to Cohere. Since we are doing Pure Dense MVP, we just fetch
  // the top K directly (e.g., 6) and return them!
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

  // If RERANK_ENABLED was true, we would call Cohere here and slice to RERANK_TOP_K.
  // For now, we skip it and just return the top Dense results.
  if (env.RERANK_ENABLED) {
    console.warn("Reranker is enabled in config, but not yet implemented. Returning dense results.");
    passages = passages.slice(0, env.RERANK_TOP_K);
  }

  return passages;
}
