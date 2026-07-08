"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Send, BookOpen, ChevronRight, X, Loader2 } from "lucide-react";

export interface RetrievedPassage {
  id: string;
  book_title: string;
  book_author: string;
  text: string;
  score: number;
}

export interface SynthesisResponse {
  answer: string;
  citations: RetrievedPassage[];
  isRefusal: boolean;
}

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: RetrievedPassage[];
  isRefusal?: boolean;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeCitations, setActiveCitations] = useState<RetrievedPassage[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg.content }),
      });

      if (!res.ok) throw new Error("Failed to fetch response");
      
      const data: SynthesisResponse = await res.json();
      
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        citations: data.citations,
        isRefusal: data.isRefusal,
      };
      
      setMessages((prev) => [...prev, assistantMsg]);
      setActiveCitations(data.citations);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", content: "Sorry, an error occurred while processing your request." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const TrustPanel = () => (
    <div className="flex flex-col h-full bg-[#f4f1ea] border-l border-[#e8e4db] p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2 font-sans">
          <BookOpen className="w-5 h-5" /> Trust Panel
        </h2>
        {isDrawerOpen && (
          <button onClick={() => setIsDrawerOpen(false)} className="md:hidden p-2 text-gray-500 hover:text-black">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      
      {activeCitations.length === 0 ? (
        <div className="text-[#8c887d] italic">No sources currently active. Ask a question to see citations.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {activeCitations.map((cit, idx) => (
            <div key={idx} className="bg-white p-5 rounded-lg shadow-sm border border-[#e8e4db]">
              <div className="text-xs uppercase tracking-wide text-[#8c887d] mb-2 font-sans font-semibold">
                Relevance Score: {cit.score.toFixed(3)}
              </div>
              <h3 className="font-bold text-lg leading-tight mb-1 font-serif">{cit.book_title}</h3>
              <div className="text-sm italic text-[#5c5a56] mb-4 font-serif">{cit.book_author}</div>
              <div className="text-sm leading-relaxed border-l-[3px] border-[#d4d0c5] pl-4 text-[#2c2b29] font-serif">
                "{cit.text}"
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F9F7F3]">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">
        <div className="flex-1 overflow-y-auto p-6 md:p-12">
          <div className="max-w-3xl mx-auto flex flex-col gap-8 pb-10">
            {messages.length === 0 && (
              <div className="text-center mt-32">
                <h1 className="text-5xl font-bold mb-6 font-serif">recall</h1>
                <p className="text-xl text-[#5c5a56] italic font-serif">A grounded, cited synthesis engine over a personal library of books.</p>
              </div>
            )}
            
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-6 py-5 ${
                  msg.role === "user" 
                    ? "bg-[#2c2b29] text-[#f9f7f3] font-sans" 
                    : "bg-white border border-[#e8e4db] shadow-sm"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-stone font-serif prose-lg max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-lg">{msg.content}</div>
                  )}
                </div>
                {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                  <button 
                    onClick={() => {
                      setActiveCitations(msg.citations!);
                      setIsDrawerOpen(true);
                    }}
                    className="md:hidden mt-3 text-sm text-[#5c5a56] flex items-center gap-1 hover:text-black font-sans font-medium bg-white px-3 py-1.5 rounded-full shadow-sm border border-[#e8e4db]"
                  >
                    <BookOpen className="w-4 h-4" /> View {msg.citations.length} Sources
                  </button>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start">
                <div className="bg-white border border-[#e8e4db] shadow-sm rounded-2xl px-6 py-5 flex items-center gap-3 text-[#5c5a56] font-sans">
                  <Loader2 className="w-5 h-5 animate-spin" /> Synthesizing answer...
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-gradient-to-t from-[#F9F7F3] via-[#F9F7F3] to-transparent shrink-0">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your library..."
              className="w-full bg-white border border-[#d4d0c5] rounded-full pl-6 pr-16 py-4 font-sans text-lg focus:outline-none focus:ring-2 focus:ring-[#2c2b29] shadow-sm"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-[#2c2b29] text-white rounded-full hover:bg-black disabled:opacity-50 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      {/* Desktop Trust Panel (Side-by-side) */}
      <div className="hidden md:block w-[40%] max-w-md h-full shrink-0">
        <TrustPanel />
      </div>

      {/* Mobile Trust Panel (Drawer) */}
      {isDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)} />
          <div className="relative w-full h-[85vh] bg-[#F9F7F3] rounded-t-3xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-full">
            <TrustPanel />
          </div>
        </div>
      )}
    </div>
  );
}
