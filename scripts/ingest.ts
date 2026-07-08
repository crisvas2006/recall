import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";
import * as lancedb from "@lancedb/lancedb";
import { env } from "../src/lib/config";
import { parseGutenbergFile } from "../src/lib/gutenberg";
import { chunkDocument } from "../src/lib/chunking";
import { generateEmbedding } from "../src/lib/embeddings";

/**
 * ============================================================================
 * TECHNOLOGY FOCUS: LanceDB & Concurrency Limiting
 * ============================================================================
 * 1. LanceDB (Embedded DB)
 * Instead of spinning up a separate Postgres container, we use LanceDB. It runs 
 * directly in this Node.js process and saves its data to a folder (by default `./lancedb`). 
 * It's insanely fast for vector searches because it uses Apache Arrow under the hood.
 * 
 * 2. Concurrency Limiting (`p-limit`) & Rate Limit Handling
 * When we chunk a book, we might get 500 chunks. If we send 500 simultaneous requests 
 * to the Gemini Free Tier API, Google will block us with a 429 (Too Many Requests) error. 
 * We use `p-limit` to act as a funnel. It ensures that no matter how many chunks we have, 
 * only exactly N (e.g., 5) network requests happen at the same time. If a request still 
 * hits a 429, we use an exponential backoff loop to wait and retry automatically.
 * ============================================================================
 */

// Helper function: Sleep for X milliseconds
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function: Wrap the embedding call in an exponential backoff retry loop
async function generateEmbeddingWithRetry(text: string, maxRetries = 15): Promise<number[]> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await generateEmbedding(text);
    } catch (error: any) {
      if (error?.status === 429 || error?.message?.includes("429")) {
        attempt++;
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
        const backoffTime = Math.pow(2, attempt) * 500;
        console.warn(`⚠️ Rate limited (429). Retrying in ${backoffTime / 1000} seconds... (Attempt ${attempt}/${maxRetries})`);
        await sleep(backoffTime);
      } else {
        // If it's a different error (e.g., Network failure, Bad Request), throw it immediately
        throw error;
      }
    }
  }
  throw new Error(`Failed to generate embedding after ${maxRetries} attempts due to rate limiting.`);
}

async function main() {
  const corpusDir = path.join(process.cwd(), "corpus");
  if (!fs.existsSync(corpusDir)) {
    console.error("❌ Corpus directory not found. Please create a ./corpus folder and add .txt files.");
    process.exit(1);
  }

  const files = fs.readdirSync(corpusDir).filter(f => f.endsWith(".txt"));
  if (files.length === 0) {
    console.warn("⚠️ No .txt files found in the corpus directory.");
    process.exit(0);
  }

  console.log(`📚 Found ${files.length} book(s). Connecting to LanceDB at ${env.LANCEDB_URI}...`);
  const db = await lancedb.connect(env.LANCEDB_URI);

  // We define the schema for our table implicitly by passing an array of objects.
  // We'll collect all our rows in memory and then insert them in one batch.
  // Note: For massive corpora, you would insert in chunks, but for an MVP, memory is fine.
  const records: Array<{
    id: string; 
    book_title: string; 
    book_author: string; 
    chunk_index: number;
    text: string;
    vector: number[];
  }> = [];

  // Initialize our concurrency limiter. Max 1 request at a time for strict 15 RPM compliance.
  const limit = pLimit(1); 
  const embeddingPromises: Promise<void>[] = [];

  for (const file of files) {
    console.log(`\n📖 Processing: ${file}`);
    const filePath = path.join(corpusDir, file);
    
    // 1. Strip Boilerplate & Extract Metadata
    const doc = parseGutenbergFile(filePath);
    console.log(`   -> Parsed: "${doc.title}" by ${doc.author}`);

    // 2. Paragraph-Aware Chunking
    const chunks = chunkDocument(doc.content);
    console.log(`   -> Created ${chunks.length} chunks.`);

    // 3. Queue the embedding generation via the Concurrency Limiter
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const promise = limit(async () => {
        try {
          // Dynamic backoff handles rate limiting, so we only need a small stagger
          await sleep(200);
          const vector = await generateEmbeddingWithRetry(chunk.text);
          records.push({
            id: `${file}-chunk-${i}`,
            book_title: doc.title,
            book_author: doc.author,
            chunk_index: i,
            text: chunk.text,
            vector: vector,
          });
          
          if (records.length % 25 === 0 || records.length === embeddingPromises.length) {
            console.log(`   -> Embedded ${records.length} chunks...`);
          }
        } catch (e) {
          console.error(`❌ Fatal error embedding chunk ${i} in ${file}:`, e);
          process.exit(1); // Fail fast
        }
      });
      embeddingPromises.push(promise);
    }
  }

  console.log(`\n⏳ Generating embeddings for ${embeddingPromises.length} total chunks...`);
  await Promise.all(embeddingPromises);

  // 4. Upsert into LanceDB
  console.log(`\n💾 All embeddings generated! Saving to LanceDB...`);
  
  // If the table exists, we drop it to start fresh for this MVP ingest run.
  const tableNames = await db.tableNames();
  if (tableNames.includes("documents")) {
    await db.dropTable("documents");
  }

  // Creating the table automatically infers the schema from the data
  await db.createTable("documents", records);
  
  console.log(`✅ Successfully ingested ${records.length} chunks into LanceDB!`);
}

main().catch(console.error);
