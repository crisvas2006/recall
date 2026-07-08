import * as lancedb from "@lancedb/lancedb";
import { env } from "../src/lib/config";

async function main() {
  console.log(`Connecting to LanceDB at ${env.LANCEDB_URI}...`);
  const db = await lancedb.connect(env.LANCEDB_URI);
  
  const tableNames = await db.tableNames();
  if (!tableNames.includes("documents")) {
    console.error("❌ 'documents' table not found. Run `npm run ingest` first.");
    process.exit(1);
  }

  const table = await db.openTable("documents");
  const count = await table.countRows();
  console.log(`\n📚 Database holds ${count} embedded chunks.\n`);

  const results = await table.query().select(["book_title", "book_author"]).toArray();
  
  const books = new Set<string>();
  const authors = new Set<string>();
  
  results.forEach(row => {
    if (row.book_title) books.add(row.book_title as string);
    if (row.book_author) authors.add(row.book_author as string);
  });

  console.log(`\n================================`);
  console.log(`📊 LANCEDB STATISTICS`);
  console.log(`================================`);
  console.log(`Total Embedded Chunks : ${count}`);
  console.log(`Unique Books          : ${books.size}`);
  console.log(`Unique Authors        : ${authors.size}`);
  console.log(`================================`);
  
  console.log(`\n📚 Books in Database:`);
  Array.from(books).sort().forEach(book => console.log(`   - ${book}`));

  console.log(`\n✍️ Authors in Database:`);
  Array.from(authors).sort().forEach(author => console.log(`   - ${author}`));
  console.log("\n");
}

main().catch(console.error);
