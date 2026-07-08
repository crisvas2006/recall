import { NextResponse } from "next/server";
import { retrievePassages } from "@/lib/retrieval";
import { synthesizeAnswer } from "@/lib/synthesize";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Invalid query provided." }, { status: 400 });
    }

    // 1. Retrieve the most relevant passages from LanceDB
    const passages = await retrievePassages(query);
    
    // 2. Synthesize an answer grounded ONLY in the retrieved passages
    const synthesis = await synthesizeAnswer(query, passages);

    return NextResponse.json(synthesis);
  } catch (error: any) {
    console.error("Error processing query:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
