import * as fs from "fs";

/**
 * ============================================================================
 * TECHNOLOGY FOCUS: Regular Expressions & Data Cleaning
 * ============================================================================
 * When ingesting public domain books from Project Gutenberg, the text files 
 * always contain a massive legal boilerplate at the top and bottom. 
 * If we embed this boilerplate into our vector database, searches for "legal" 
 * or "copyright" will return garbage chunks instead of the philosophy we want.
 * 
 * We use simple string matching and Regular Expressions (Regex) to slice the 
 * document exactly where the actual book begins and ends, and to extract the 
 * metadata (Title and Author) so we can cite the book properly later.
 * ============================================================================
 */

export interface GutenbergDocument {
  title: string;
  author: string;
  content: string;
}

export function parseGutenbergFile(filePath: string): GutenbergDocument {
  const rawText = fs.readFileSync(filePath, "utf-8");

  // 1. Strip the Boilerplate
  // Gutenberg books consistently use these markers. We find their indices 
  // and slice the string to keep only the middle section.
  const startMarker = "*** START OF THE PROJECT GUTENBERG EBOOK";
  const endMarker = "*** END OF THE PROJECT GUTENBERG EBOOK";

  let startIndex = rawText.indexOf(startMarker);
  let endIndex = rawText.indexOf(endMarker);

  if (startIndex === -1) {
    console.warn(`Warning: Could not find start marker in ${filePath}`);
    startIndex = 0;
  } else {
    // Move the index to the END of the marker line
    const endOfStartLine = rawText.indexOf("\n", startIndex);
    startIndex = endOfStartLine !== -1 ? endOfStartLine : startIndex;
  }

  if (endIndex === -1) {
    console.warn(`Warning: Could not find end marker in ${filePath}`);
    endIndex = rawText.length;
  }

  const content = rawText.slice(startIndex, endIndex).trim();

  // 2. Extract Metadata
  // We search the top header (before the start marker) for Title and Author.
  // The 'm' flag in regex means "multiline", allowing ^ to match the start of a line.
  // The 'i' flag means case-insensitive.
  const headerText = rawText.slice(0, startIndex);
  
  const titleMatch = headerText.match(/^Title:\s*(.+)/im);
  const authorMatch = headerText.match(/^Author:\s*(.+)/im);

  // If we can't find them in the text, we fallback to "Unknown"
  const title = titleMatch ? titleMatch[1].trim() : "Unknown Title";
  const author = authorMatch ? authorMatch[1].trim() : "Unknown Author";

  return {
    title,
    author,
    content,
  };
}
