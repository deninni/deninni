"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { postJson } from "@/lib/client/usePoll";

type Msg = { role: "user" | "assistant"; text: string; kind?: string; sources?: string[] };

const CHIPS = ["Wie ist der Zustand?", "Warum ist FT-7 auffällig?", "OEE der Linie", "Ticket aus RCA", "Stecker TT-214", "Offene Tickets"];

export function CopilotChat() {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", text: "Ich beantworte Fragen zu den Anlagen in Werk Nord – aus Messwerten, Meldungen und Ursachenanalyse. Steuern kann ich nichts." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs]);

  async function send(q: string) {
    if (!q.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const r = await postJson<{ text: string; kind: string; sources: string[] }>("/api/ai/chat", { message: q });
      setMsgs((m) => [...m, { role: "assistant", text: r.text, kind: r.kind, sources: r.sources }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `Fehler: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex h-[min(70vh,640px)] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-[13px] leading-relaxed ${m.role === "user" ? "bg-accent-muted text-foreground" : m.kind === "control-refusal" ? "border border-status-fault/30 bg-status-fault/5" : m.kind === "refusal" ? "border border-hairline text-muted" : "border border-hairline bg-surface"}`}>
              {m.text}
              {m.sources && m.sources.length > 0 && <div className="mt-1.5 text-[10px] text-stainless-dim">Quelle: {m.sources.join(" · ")}</div>}
            </div>
          </div>
        ))}
        {busy && <div className="text-[12px] text-muted">…</div>}
        <div ref={end} />
      </div>
      <div className="border-t border-hairline p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => <button key={c} onClick={() => send(c)} className="focus-ring rounded-full border border-border px-2.5 py-1 text-[11px] text-muted hover:border-accent-border hover:text-foreground">{c}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="Frage zur Anlage …" className="input-industrial min-h-11 flex-1 text-[13px] sm:min-h-9" aria-label="Frage" />
          <button disabled={busy || !input.trim()} className="focus-ring grid min-h-11 w-11 place-items-center rounded-md bg-accent text-white disabled:opacity-50 sm:min-h-9 sm:w-9" aria-label="Senden"><Send size={15} /></button>
        </form>
      </div>
    </div>
  );
}
