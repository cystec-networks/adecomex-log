import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import { FileText, Minus, X, MessageCircleQuestion, RotateCcw, Square, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  ASISTENTE_MAX_CARACTERES,
  ASISTENTE_NOMBRE,
  borrarHistorialSesion,
  guardarHistorialSesion,
  leerHistorialSesion,
} from "@/lib/asistente-virtual";
import { ASISTENTE_CLAVE_MODO_VOZ } from "@/lib/asistente-voz";
import { useLecturaVoz } from "@/hooks/use-lectura-voz";
import avatar from "@/assets/asistente-avatar.png";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { defaultComponents, type Components } from "streamdown";
import { VisorNormativaDialog } from "@/components/normativa/visor-normativa-dialog";
import { parsearEnlaceCita, type CitaNormativa } from "@/lib/normativa-visor";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { Shimmer } from "@/components/ai-elements/shimmer";

const SALUDO =
  "¡Hola! Soy el asistente virtual de ADECOMEX. Puedo orientarte sobre procedimientos aduaneros, comercio exterior, documentación de importación y exportación, y sobre cómo usar la plataforma. No consulto datos de Expedientes, clientes ni facturas: para eso usa la pantalla correspondiente del sistema.";

function textoError(error: Error | undefined): string {
  if (!error?.message) return "No se pudo obtener respuesta del asistente. Inténtalo de nuevo.";
  try {
    const datos = JSON.parse(error.message) as { error?: string };
    if (datos?.error) return datos.error;
  } catch {
    /* no es JSON: se muestra tal cual */
  }
  if (/failed to fetch|network/i.test(error.message)) return "Sin conexión con el asistente. Revisa tu conexión a internet.";
  return error.message;
}

function textoMensaje(m: UIMessage) {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function AsistenteVirtual() {
  const [abierto, setAbierto] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mensajesIniciales] = useState<UIMessage[]>(() => leerHistorialSesion());

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/asistente",
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages, error, clearError } = useChat({
    id: "asistente-adecomex",
    messages: mensajesIniciales,
    transport,
    onError: (e) => toast.error(textoError(e)),
  });

  const ocupado = status === "submitted" || status === "streaming";

  // Citas de la Base normativa: abren el visor integrado en la página citada.
  const [cita, setCita] = useState<CitaNormativa | null>(null);
  const componentesRespuesta = useMemo<Components>(() => {
    const EnlaceDefecto = defaultComponents.a as unknown as React.ComponentType<Record<string, unknown>>;
    return {
      a: (props) => {
        const datos = parsearEnlaceCita(
          props.href,
          typeof window !== "undefined" ? window.location.origin : undefined,
        );
        if (!datos) return <EnlaceDefecto {...(props as Record<string, unknown>)} />;
        return (
          <button
            type="button"
            onClick={() => setCita(datos)}
            className="inline-flex items-baseline gap-0.5 text-left font-medium text-primary underline underline-offset-2"
            title={datos.pagina ? `Abrir el documento en la página ${datos.pagina}` : "Abrir el documento"}
          >
            <FileText className="h-3 w-3 shrink-0 self-center" aria-hidden />
            {props.children}
          </button>
        );
      },
    };
  }, []);

  // Lectura en voz alta (síntesis nativa del navegador, en español).
  const { soportado: vozSoportada, hablandoId, leer, detener } = useLecturaVoz({
    onFallo: (mensaje) => toast.error(mensaje),
  });
  const [modoVoz, setModoVoz] = useState(false);
  useEffect(() => {
    try {
      setModoVoz(window.localStorage.getItem(ASISTENTE_CLAVE_MODO_VOZ) === "1");
    } catch {
      /* sin acceso a localStorage */
    }
  }, []);
  const alternarModoVoz = () => {
    const activo = !modoVoz;
    setModoVoz(activo);
    // Confirmación audible dentro del clic: habilita el audio en navegadores que
    // exigen un gesto del usuario y comprueba al momento que la voz funciona.
    if (activo) leer("modo-voz", "Modo voz activado.");
    else detener();
    try {
      window.localStorage.setItem(ASISTENTE_CLAVE_MODO_VOZ, activo ? "1" : "0");
    } catch {
      /* sin acceso a localStorage */
    }
  };

  // Modo voz: leer cada respuesta nueva en cuanto termina de llegar.
  const estadoAnterior = useRef(status);
  useEffect(() => {
    const antes = estadoAnterior.current;
    estadoAnterior.current = status;
    if (!(antes === "streaming" || antes === "submitted") || status !== "ready") return;
    if (!modoVoz || !abierto || !vozSoportada) return;
    const final = messages[messages.length - 1];
    if (final?.role !== "assistant") return;
    const texto = textoMensaje(final);
    if (texto) leer(final.id, texto);
  }, [status, messages, modoVoz, abierto, vozSoportada, leer]);

  // Historial solo durante la sesión de esta pestaña.
  useEffect(() => {
    if (!ocupado) guardarHistorialSesion(messages);
  }, [messages, ocupado]);

  useEffect(() => {
    if (abierto && !ocupado) textareaRef.current?.focus();
  }, [abierto, ocupado]);

  const { data: preguntas = [] } = useQuery({
    queryKey: ["asistente_preguntas_frecuentes", "activas"],
    enabled: abierto,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asistente_preguntas_frecuentes")
        .select("id, pregunta")
        .eq("activo", true)
        .order("orden", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const preguntar = (texto: string) => {
    const limpio = texto.trim().slice(0, ASISTENTE_MAX_CARACTERES);
    if (!limpio || ocupado) return;
    detener();
    clearError();
    void sendMessage({ text: limpio });
  };

  const onSubmit = (m: PromptInputMessage) => preguntar(m.text ?? "");

  const nuevaConversacion = () => {
    if (ocupado) void stop();
    detener();
    setMessages([]);
    clearError();
    borrarHistorialSesion();
  };

  const cerrar = () => {
    nuevaConversacion();
    setAbierto(false);
  };

  const minimizar = () => {
    detener();
    setAbierto(false);
  };

  const botonLectura = (id: string, texto: string) => {
    if (!vozSoportada) return null;
    const leyendo = hablandoId === id;
    return (
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        className="-mt-1 self-start text-muted-foreground hover:text-foreground"
        onClick={() => (leyendo ? detener() : leer(id, texto))}
        title={leyendo ? "Detener lectura" : "Escuchar respuesta"}
        aria-label={leyendo ? "Detener lectura" : "Escuchar respuesta"}
        aria-pressed={leyendo}
      >
        {leyendo ? <Square className="h-3.5 w-3.5 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
      </Button>
    );
  };

  const ultimo = messages[messages.length - 1];
  const esperando = ocupado && (!ultimo || ultimo.role === "user" || !textoMensaje(ultimo));

  return (
    <>
      {abierto && (
        <section
          role="dialog"
          aria-label={ASISTENTE_NOMBRE}
          className="fixed bottom-24 right-4 z-50 flex h-[min(620px,calc(100dvh-8rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl"
        >
          <header className="flex items-center gap-3 bg-primary px-3 py-2.5 text-primary-foreground">
            <img src={avatar} alt="" width={36} height={36} className="h-9 w-9 rounded-full bg-card object-contain p-0.5" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold leading-tight">{ASISTENTE_NOMBRE}</p>
              <p className="truncate text-[11px] opacity-80">Orientación general · uso interno</p>
            </div>
            {vozSoportada && (
              <Button
                size="icon-sm"
                variant="ghost"
                className={cn(
                  "text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground",
                  modoVoz && "bg-primary-foreground/20",
                )}
                onClick={alternarModoVoz}
                aria-pressed={modoVoz}
                title={modoVoz ? "Modo voz activado: lee cada respuesta nueva" : "Activar modo voz"}
                aria-label="Modo voz"
              >
                {modoVoz ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
            )}
            {messages.length > 0 && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
                onClick={nuevaConversacion}
                title="Nueva conversación"
                aria-label="Nueva conversación"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              onClick={minimizar}
              title="Minimizar"
              aria-label="Minimizar asistente"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              onClick={cerrar}
              title="Cerrar y borrar la conversación"
              aria-label="Cerrar asistente"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="gap-4 p-3">
              <Message from="assistant">
                <MessageContent className="text-[13px] leading-relaxed">{SALUDO}</MessageContent>
                {botonLectura("saludo", SALUDO)}
              </Message>

              {preguntas.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <MessageCircleQuestion className="h-3.5 w-3.5" /> Preguntas frecuentes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {preguntas.map((p) => (
                      <Suggestion
                        key={p.id}
                        suggestion={p.pregunta}
                        onClick={preguntar}
                        disabled={ocupado}
                        className="h-auto whitespace-normal py-1.5 text-left text-[12px] leading-snug"
                      />
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => {
                const texto = textoMensaje(m);
                if (!texto) return null;
                return (
                  <Message from={m.role} key={m.id}>
                    <MessageContent
                      className={cn(
                        "text-[13px] leading-relaxed",
                        "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground group-[.is-user]:py-2",
                      )}
                    >
                      {m.role === "assistant" ? (
                        <MessageResponse isAnimating={ocupado && m.id === ultimo?.id} components={componentesRespuesta}>
                          {texto}
                        </MessageResponse>
                      ) : (
                        <p className="whitespace-pre-wrap">{texto}</p>
                      )}
                    </MessageContent>
                    {m.role === "assistant" && !(ocupado && m.id === ultimo?.id) && botonLectura(m.id, texto)}
                  </Message>
                );
              })}

              {esperando && (
                <Message from="assistant">
                  <MessageContent className="text-[13px]">
                    <Shimmer>Pensando…</Shimmer>
                  </MessageContent>
                </Message>
              )}

              {status === "error" && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                  {textoError(error)}
                </p>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="border-t p-2">
            <PromptInput onSubmit={onSubmit}>
              <PromptInputTextarea
                ref={textareaRef}
                placeholder="Escribe tu pregunta…"
                maxLength={ASISTENTE_MAX_CARACTERES}
                className="min-h-10 text-[13px]"
              />
              <PromptInputFooter className="justify-between">
                <span className="px-1 text-[11px] text-muted-foreground">
                  {modoVoz && vozSoportada ? "Modo voz activo · No consulta datos del sistema" : "No consulta datos del sistema"}
                </span>
                <PromptInputSubmit status={status} onStop={() => void stop()} />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => {
          if (abierto) detener();
          setAbierto((v) => !v);
        }}
        aria-label={abierto ? "Minimizar asistente" : `Abrir ${ASISTENTE_NOMBRE}`}
        title={abierto ? "Minimizar asistente" : ASISTENTE_NOMBRE}
        className="fixed bottom-4 right-4 z-50 flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary bg-card shadow-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <img src={avatar} alt="" width={56} height={56} className="h-14 w-14 object-contain" />
        {!abierto && messages.length > 0 && (
          <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-card bg-brand-red" />
        )}
      </button>

      <VisorNormativaDialog
        abierto={!!cita}
        onCerrar={() => setCita(null)}
        documentoId={cita?.documentoId ?? null}
        pagina={cita?.pagina ?? null}
      />
    </>
  );
}
