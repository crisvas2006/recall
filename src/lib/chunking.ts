import { env } from "./config";

/**
 * ============================================================================
 * TECHNOLOGY FOCUS: Paragraph-Aware Chunking
 * ============================================================================
 * When feeding text into an AI, we must split it into "chunks" because 
 * models have finite context windows. 
 * 
 * A naive chunker simply cuts the text every 500 words. But what if that cut 
 * happens in the middle of a sentence? "He decided to... [CUT]" -> "[CUT] ...do it." 
 * The AI loses the subject of the sentence, degrading the quality of the vector 
 * embedding and the final generated answer.
 * 
 * Our Paragraph-Aware Chunker respects the natural structure of human writing. 
 * It splits the text on double-newlines (`\n\n`), which represent paragraphs. 
 * It then packs these intact paragraphs together until they approach the target 
 * token limit. It also implements an "overlap" (keeping the last paragraph of 
 * the previous chunk) so context seamlessly flows from one chunk to the next.
 * ============================================================================
 */

export interface Chunk {
  text: string;
  tokenCount: number;
}

// A highly reliable heuristic for English text is that 1 token is roughly 4 characters.
// Using this avoids importing heavy tokenizer libraries (like tiktoken) for our lean MVP.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkDocument(text: string): Chunk[] {
  // 1. Split the raw text strictly by paragraph breaks.
  // We use regex to handle varying amounts of whitespace (e.g., Windows \r\n vs Linux \n).
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  
  const chunks: Chunk[] = [];
  let currentChunkParagraphs: string[] = [];
  let currentTokenCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const paragraphTokens = estimateTokens(paragraph);

    // If adding this paragraph exceeds our target size (and the chunk isn't empty)
    if (currentTokenCount + paragraphTokens > env.CHUNK_TARGET_TOKENS && currentChunkParagraphs.length > 0) {
      // Finalize the current chunk and push it to our array
      chunks.push({
        text: currentChunkParagraphs.join("\n\n"),
        tokenCount: currentTokenCount,
      });

      // Implement Overlap:
      // We carry over the very last paragraph of the old chunk into the new chunk.
      // This ensures the semantic meaning "bridges" the gap between database entries.
      const overlapParagraph = currentChunkParagraphs[currentChunkParagraphs.length - 1];
      currentChunkParagraphs = [overlapParagraph, paragraph];
      currentTokenCount = estimateTokens(overlapParagraph) + paragraphTokens;
    } else {
      // Otherwise, keep packing paragraphs into the current chunk
      currentChunkParagraphs.push(paragraph);
      currentTokenCount += paragraphTokens;
    }
  }

  // Don't forget to push the final chunk if it contains leftover text!
  if (currentChunkParagraphs.length > 0) {
    chunks.push({
      text: currentChunkParagraphs.join("\n\n"),
      tokenCount: currentTokenCount,
    });
  }

  return chunks;
}
