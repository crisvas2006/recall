export interface RetrievedPassage {
  id: string;
  book_title: string;
  book_author: string;
  text: string;
  score: number;
}

/**
 * MOCK FOR PHASE 2 EVAL HARNESS
 * This will be fully implemented in Phase 3 with LanceDB and Cohere Rerank.
 */
export async function retrievePassages(query: string): Promise<RetrievedPassage[]> {
  // Returns empty for now to test the refusal path in the Eval Harness
  return [];
}
