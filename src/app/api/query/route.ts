import { NextResponse } from "next/server";
import { retrievePassages } from "@/lib/retrieval";
import { synthesizeAnswer } from "@/lib/synthesize";
import { RunTree } from "langsmith";
import { env } from "@/lib/config";

export async function POST(request: Request) {
  let runTree: RunTree | undefined;
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Invalid query provided." }, { status: 400 });
    }

    if (env.LANGCHAIN_TRACING_V2) {
      runTree = new RunTree({
        name: "RAG_Query",
        run_type: "chain",
        inputs: { query },
        project_name: env.LANGCHAIN_PROJECT
      });
      await runTree.postRun();
    }

    // 1. Retrieve the most relevant passages from LanceDB
    const passages = await retrievePassages(query, runTree);
    
    // 2. Synthesize an answer grounded ONLY in the retrieved passages
    const synthesis = await synthesizeAnswer(query, passages, runTree);

    if (runTree) {
      await runTree.end({ outputs: { synthesis } });
      await runTree.patchRun();
    }

    return NextResponse.json(synthesis);
  } catch (error: any) {
    console.error("Error processing query:", error);
    if (runTree) {
      await runTree.end({ error: error.message });
      await runTree.patchRun();
    }
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
