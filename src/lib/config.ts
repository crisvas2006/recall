import { z } from "zod";
import * as dotenv from "dotenv";

// 1. Load environment variables from .env file into process.env
// In a Next.js environment, this happens automatically for files on the server side,
// but explicitly calling dotenv.config() ensures this file works in standalone scripts
// (like our offline ingestion script: `npm run ingest`).
dotenv.config();

// ============================================================================
// TECHNOLOGY FOCUS: Zod for Configuration
// ============================================================================
// Why Zod? 
// As an engineer, passing around `process.env.MY_VAR` is dangerous. It types everything
// as `string | undefined`, meaning you have to manually parse numbers and check for
// undefined everywhere in your codebase. If a required API key is missing, you want
// the application to fail immediately on startup (fail-fast), not deep inside a route
// when a user clicks a button.
//
// Zod provides runtime schema validation. We define the exact shape of our configuration,
// attach fallback defaults for optional tuning parameters, and export a strictly typed
// singleton object (`env`). If the required keys are missing, Zod throws a descriptive error.
// ============================================================================

const envSchema = z.object({
  // -- APIs --
  // We use `.min(1)` to ensure the string isn't empty.
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is missing in .env"),
  COHERE_API_KEY: z.string().min(1, "COHERE_API_KEY is missing in .env"),

  // -- Chunking --
  // We use `coerce.number()` because environment variables always arrive as strings
  // (e.g., "500"). Zod will automatically cast it to a number.
  // `.default(500)` ensures that if this variable is entirely absent from the .env file,
  // the app still runs smoothly using this sensible fallback.
  CHUNK_TARGET_TOKENS: z.coerce.number().default(500),
  CHUNK_OVERLAP_TOKENS: z.coerce.number().default(80),

  // -- Retrieval & Reranking --
  // `coerce.boolean()` translates "true" / "false" strings to boolean types.
  RERANK_ENABLED: z.coerce.boolean().default(false),
  RERANK_CANDIDATES: z.coerce.number().default(30),
  RERANK_TOP_K: z.coerce.number().default(6),
  
  // Relevance floor is a float (e.g., 0.5) that determines the cutoff for when the app
  // should confidently state "I don't know" rather than hallucinate an answer.
  RELEVANCE_FLOOR: z.coerce.number().default(0.5),

  // -- Database --
  LANCEDB_URI: z.string().default("./lancedb"),

  // -- Observability (LangSmith) --
  LANGCHAIN_TRACING_V2: z.coerce.boolean().default(false),
  LANGCHAIN_API_KEY: z.string().optional(),
  LANGCHAIN_PROJECT: z.string().default("recall"),
});

// We run `safeParse` to catch validation errors gracefully.
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // If parsing fails (e.g., missing GEMINI_API_KEY), we log the precise errors
  // and exit the process. This is the "fail-fast" principle in action.
  console.error("❌ Invalid environment variables:", parsedEnv.error.format());
  process.exit(1);
}

// Export the strictly-typed, guaranteed-safe configuration object.
// Everywhere else in the codebase, we import this `env` object instead of using `process.env`.
export const env = parsedEnv.data;
