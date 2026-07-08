import { GoogleGenAI } from "@google/genai";
import { env } from "./config";

/**
 * ============================================================================
 * TECHNOLOGY FOCUS: Google Gen AI Embeddings & Matryoshka Truncation
 * ============================================================================
 * What is an embedding? 
 * It's a way to convert text into an array of floating-point numbers (a vector) 
 * such that text with similar *semantic meaning* ends up close together in mathematical space.
 * 
 * Why `gemini-embedding-2` and what is Matryoshka?
 * Historically, high-quality embeddings required huge vectors (e.g., 2048 or 3072 dimensions). 
 * Storing millions of these in a database becomes extremely expensive. 
 * Matryoshka models (named after Russian nesting dolls) are trained so that the most 
 * important semantic information is packed into the very first numbers of the array.
 * 
 * By explicitly setting `outputDimensionality: 768`, we tell Google's API to truncate 
 * the massive vector down to just 768 dimensions. We save massive amounts of database storage 
 * and speed up search queries, while losing almost zero retrieval quality.
 * ============================================================================
 */

// Initialize the Gemini SDK client. It will automatically pick up process.env.GEMINI_API_KEY
// but we explicitly pass it from our validated `env` object for safety.
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// The taskType tells the model *why* we are embedding the text.
// RETRIEVAL_DOCUMENT means "I am embedding a piece of knowledge to be stored in a database."
// (Later, when the user asks a question, we will embed the question using RETRIEVAL_QUERY).
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-2",
    contents: text,
    config: {
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 768, // <-- The Matryoshka magic
    },
  });

  if (!response.embeddings || response.embeddings.length === 0 || !response.embeddings[0].values) {
    throw new Error("Failed to generate embedding: API returned an empty response.");
  }

  return response.embeddings[0].values;
}
