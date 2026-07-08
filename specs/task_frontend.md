# Task Spec: Frontend App (Chat UI & Trust Panel)

---

## 1. Problem Statement

We have built the underlying retrieval and synthesis RAG engine, but we currently lack a user interface to interact with it. To demonstrate the "visible trust" value proposition of `recall`, we need to build a frontend application that allows users to ask questions and view the synthesized answers alongside a "Trust Panel" that displays the exact passages used to generate the answer. 

## 2. Goals & Non-Goals

- **Goals:** 
  - User can submit a question via a chat interface.
  - User receives a markdown-rendered response.
  - User can view the citations (Trust Panel) that grounded the response.
  - The UI uses a "Warm & Editorial" theme (serif fonts, off-white backgrounds).
  - The layout is responsive: Split-pane on desktop (60/40), and a collapsible drawer on mobile for citations.
- **Non-Goals:** 
  - Chat history persistence across page reloads (stateless MVP).
  - Streaming generation (we wait for the full response per MVP rules).
  - Authentication or multi-user accounts.

## 3. Acceptance Criteria

1. **AC-1:** POSTing to `/api/query` with `{ "query": "..." }` returns HTTP 200 and a JSON object matching `SynthesisResponse`.
2. **AC-2:** The desktop UI displays the chat on the left (approx 60% width) and the Trust Panel on the right (approx 40% width).
3. **AC-3:** The mobile UI displays the chat full-width and hides the citations behind a "View Sources" button that toggles a drawer/modal.
4. **AC-4:** The Trust Panel displays a list of cards containing the Book Title, Author, Relevance Score, and passage text.
5. **AC-5:** The application successfully renders Markdown returned by the synthesis engine using a Warm & Editorial typography scheme.

## 4. Files & Modules Touched

```text
package.json                                    [modify] (add react-markdown)
src/app/api/query/route.ts                      [create]
src/app/page.tsx                                [modify]
src/app/layout.tsx                              [modify] (fonts)
src/app/globals.css                             [modify] (theme colors)
specs/task_frontend.md                          [create] (save this spec)
```

## 5. Constraints

- **No Streaming:** Stick to standard async/await fetch calls.
- **Node.js only:** Everything runs in the Next.js App Router context.
- **No external API calls from browser:** The React client must call `/api/query`, which then calls Gemini/LanceDB on the server.
- **Mobile-first:** Tailwind classes must use mobile-first breakpoints (e.g., `flex-col md:flex-row`).

## 6. Edge Cases

- **Empty query:** Submit button should be disabled, or the API should return a 400 Bad Request.
- **API Failure / 500 Error:** UI should display a graceful error message in the chat feed.
- **Refusal (isRefusal=true):** The UI should display the refusal message normally, but the Trust Panel might be empty. It should display a "No relevant passages found" placeholder.

## 7. Implementation Plan

- **Step 1: Setup Dependencies & Theme**
  - Install `react-markdown` and `lucide-react` (for icons like the drawer trigger).
  - Update `layout.tsx` to include a serif font (e.g., `Merriweather` or `Playfair Display` via `next/font/google`).
  - Update `globals.css` to use off-white background colors (e.g., `#fdfbf7`).
- **Step 2: Create API Route**
  - Implement `src/app/api/query/route.ts`. Parse JSON body for `query`.
  - Call `retrievePassages` and `synthesizeAnswer`. Return the result.
- **Step 3: Build the UI Component**
  - Replace `src/app/page.tsx` with a client component (`"use client"`).
  - Implement the split-pane layout using Tailwind (`flex flex-col md:flex-row`).
  - Build the Chat feed (mapping over a `messages` array).
  - Build the Trust Panel.
  - Implement the mobile drawer state (conditionally rendering the panel on mobile based on a boolean state).
- **Step 4: Wire State and Fetch Logic**
  - Implement the `onSubmit` handler to append the user message, set a loading state, fetch from `/api/query`, and append the assistant response + citations.

## 8. Testing Plan

- **Manual checks:** 
  - Test asking a valid question and verifying the citations populate on the right.
  - Test resizing the window to mobile width and verifying the "View Sources" button appears.
  - Test asking an off-corpus question to verify the refusal path handles an empty citation array gracefully.
