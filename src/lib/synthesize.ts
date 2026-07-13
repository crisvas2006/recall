import { GoogleGenAI } from "@google/genai";
import { env } from "./config";
import { RetrievedPassage } from "./retrieval";
import { RunTree } from "langsmith";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export interface SynthesisResponse {
  answer: string;
  citations: RetrievedPassage[];
  isRefusal: boolean;
}

const SYSTEM_PROMPT = `
You are a precision-focused synthesis engine for a personal library of public-domain books.
Your goal is to answer the user's question using ONLY the provided passages.

RULES:
1. GROUNDING: Every single claim you make MUST be directly supported by one of the provided passages. NEVER hallucinate information or answer from your general knowledge.
2. CITATION: You must explicitly attribute claims to the author and book title provided in the passage metadata.
3. REFUSAL: If the provided passages do not contain enough information to answer the question, or if the question is entirely unrelated (off-corpus), you MUST set "isRefusal" to true and provide a polite refusal message in the "answer" field indicating that your library doesn't cover this topic.
4. SYNTHESIS: If multiple passages from different authors cover the topic, synthesize their perspectives, highlighting agreements or disagreements.
5. JSON OUTPUT: You must respond in valid JSON matching the schema requested.
`;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateContentWithRetry(prompt: string, maxRetries = 5) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { role: "user", parts: [{ text: prompt }] }
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          // Force the output structure to easily parse `answer` and `isRefusal`
          responseSchema: {
            type: "OBJECT",
            properties: {
              answer: { type: "STRING", description: "The synthesized answer or the polite refusal message." },
              isRefusal: { type: "BOOLEAN", description: "True if the context does not contain the answer, False otherwise." }
            },
            required: ["answer", "isRefusal"]
          }
        }
      });
    } catch (error: any) {
      if (error?.status === 429 || error?.status === 503 || error?.message?.includes("429") || error?.message?.includes("503")) {
        attempt++;
        const backoffTime = Math.pow(2, attempt) * 500;
        const statusCode = error?.status || (error?.message?.match(/(429|503)/)?.[0] ?? "Unknown");
        console.warn(`⚠️ Gemini API error (${statusCode}): ${error?.message || 'No error message provided'}. Retrying synthesis in ${backoffTime / 1000}s... (Attempt ${attempt}/${maxRetries})`);
        await sleep(backoffTime);
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Failed to generate synthesis response after ${maxRetries} attempts.`);
}

export async function synthesizeAnswer(query: string, passages: RetrievedPassage[], parentRun?: RunTree): Promise<SynthesisResponse> {
  let run: RunTree | undefined;
  if (parentRun && env.LANGCHAIN_TRACING_V2) {
    run = new RunTree({
      name: "Gemini_Synthesis",
      run_type: "llm",
      parent_run: parentRun,
      inputs: { query, passages }
    });
    await run.postRun();
  }

  try {
    // If we didn't retrieve anything, short-circuit to a refusal.
    if (passages.length === 0) {
      const response = {
        answer: "I'm sorry, but my library does not contain any information regarding your question.",
        citations: [],
        isRefusal: true,
      };
      if (run) {
        await run.end({ outputs: { synthesis: response } });
        await run.patchRun();
      }
      return response;
    }

    // Format the passages for the LLM
    let contextString = "=== RETRIEVED PASSAGES ===\n\n";
    passages.forEach((p, idx) => {
      contextString += `[Passage ${idx + 1}]\n`;
      contextString += `Book: "${p.book_title}"\n`;
      contextString += `Author: ${p.book_author}\n`;
      contextString += `Text: ${p.text}\n\n`;
    });

    const prompt = `${contextString}\n=== USER QUERY ===\n${query}\n\nBased ONLY on the retrieved passages above, answer the query according to your system rules.`;

    const response = await generateContentWithRetry(prompt);

    if (!response.text) {
      throw new Error("Failed to generate synthesis response.");
    }

    const parsed = JSON.parse(response.text);

    const result = {
      answer: parsed.answer,
      citations: passages,
      isRefusal: parsed.isRefusal
    };

    if (run) {
      await run.end({ outputs: { synthesis: result } });
      await run.patchRun();
    }
    return result;
  } catch (error: any) {
    if (run) {
      await run.end({ error: error.message });
      await run.patchRun();
    }
    throw error;
  }
}
