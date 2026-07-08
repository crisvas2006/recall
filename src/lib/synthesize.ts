import { RetrievedPassage } from "./retrieval";

export interface SynthesisResponse {
  answer: string;
  citations: RetrievedPassage[];
  isRefusal: boolean;
}

/**
 * MOCK FOR PHASE 2 EVAL HARNESS
 * This will be fully implemented in Phase 3 with Gemini cross-book synthesis.
 */
export async function synthesizeAnswer(query: string, passages: RetrievedPassage[]): Promise<SynthesisResponse> {
  // If no passages, or if we mock a refusal
  if (passages.length === 0) {
    return {
      answer: "I'm sorry, but your library doesn't contain information to answer this question.",
      citations: [],
      isRefusal: true,
    };
  }

  return {
    answer: "This is a mocked answer for the eval harness.",
    citations: passages,
    isRefusal: false,
  };
}
