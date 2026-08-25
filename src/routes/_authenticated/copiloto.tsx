import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { classifyArancel } from "@/lib/ai-arancel.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Send, Loader2, User, Bot } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { lazy, Suspense } from "react";

const ReactMarkdown = lazy(() => import("react-markdown"));

export const Route = createFileRoute("/_authenticated/copiloto")({
  component: Copiloto,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGERENCIAS = [
  "Clasifica: cascos de bicicleta para adultos, plástico ABS.",
  "Partida para aceite de oliva virgen extra en botellas de 500ml.",
  "Zapatos deportivos de cuero natural para hombre.",
  "Panel solar fotovoltaico monocristalino 450W.",
];

function Copiloto() {
  const fn = useServerFn(classifyArancel);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ask = useMutation({
    mutationFn: async (text: string) => {
      const next: Msg[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      const res = await fn({ data: { messages: next } });
      return res.reply;
    },
    onSuccess: (reply) => setMessages((m) => [...m, { role: "assistant", content: reply }]),
    onError: (e: any) => toast.error(e.message),
  });

  const send = (text: string) => {
    const t = text.trim();
    if (!t || ask.isPending) return;
    setInput("");
    ask.mutate(t);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4 h-full flex flex-col">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" /> Copiloto arancelario
        </h1>
        <p className="text-sm text-muted-foreground">
          Sugiere partidas a 10 dígitos según el Arancel de Aduanas de República Dominicana. Clasificación referencial — validación final por la DGA.
        </p>
      </div>

      <Card className="flex-1 flex flex-col min-h-[500px]">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm text-muted-foreground">Conversación</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-4 space-y-4" ref={scrollRef as any}>
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-4">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Describe la mercancía a clasificar.</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGERENCIAS.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="text-xs" onClick={() => send(s)}>{s}</Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`h-8 w-8 rounded-full grid place-items-center shrink-0 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}>
                {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className={`rounded-lg px-4 py-2 max-w-[80%] text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.role === "assistant"
                  ? <div className="prose prose-sm dark:prose-invert max-w-none"><Suspense fallback={<p className="whitespace-pre-wrap">{m.content}</p>}><ReactMarkdown>{m.content}</ReactMarkdown></Suspense></div>
                  : <p className="whitespace-pre-wrap">{m.content}</p>}
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full grid place-items-center bg-accent text-accent-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-lg px-4 py-2 bg-muted text-sm flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Analizando…
              </div>
            </div>
          )}
        </CardContent>
        <div className="border-t p-3 flex gap-2">
          <Textarea
            rows={2}
            placeholder="Describe la mercancía (material, uso, presentación, composición…)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            className="resize-none"
          />
          <Button onClick={() => send(input)} disabled={!input.trim() || ask.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
