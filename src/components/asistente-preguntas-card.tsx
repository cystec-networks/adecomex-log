import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, MessageCircleQuestion, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Pregunta = { id: string; pregunta: string; respuesta: string | null; orden: number; activo: boolean };

const CLAVE = ["asistente_preguntas_frecuentes"];

/** Catálogo editable de las «Preguntas frecuentes» que muestra el asistente virtual. */
export function AsistentePreguntasCard() {
  const qc = useQueryClient();
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState<{ id: string; texto: string; respuesta: string } | null>(null);

  const { data: preguntas = [], isLoading } = useQuery({
    queryKey: [...CLAVE, "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asistente_preguntas_frecuentes")
        .select("id, pregunta, respuesta, orden, activo")
        .order("orden", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Pregunta[];
    },
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: CLAVE });
  const fallo = (e: Error) => toast.error(e.message || "No se pudo guardar");

  const crear = useMutation({
    mutationFn: async (texto: string) => {
      const orden = preguntas.reduce((max, p) => Math.max(max, p.orden), 0) + 1;
      const { error } = await supabase.from("asistente_preguntas_frecuentes").insert({ pregunta: texto, orden });
      if (error) throw error;
    },
    onSuccess: () => {
      setNueva("");
      toast.success("Pregunta agregada");
      refrescar();
    },
    onError: fallo,
  });

  const actualizar = useMutation({
    mutationFn: async ({ id, cambios }: { id: string; cambios: Partial<Pregunta> }) => {
      const { error } = await supabase.from("asistente_preguntas_frecuentes").update(cambios).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refrescar,
    onError: fallo,
  });

  const mover = useMutation({
    mutationFn: async ({ a, b }: { a: Pregunta; b: Pregunta }) => {
      // Intercambia posiciones; si comparten número, se separan para que el orden sea estable.
      const ordenA = a.orden === b.orden ? b.orden + (preguntas.indexOf(a) < preguntas.indexOf(b) ? 1 : -1) : b.orden;
      const r1 = await supabase.from("asistente_preguntas_frecuentes").update({ orden: ordenA }).eq("id", a.id);
      if (r1.error) throw r1.error;
      const r2 = await supabase.from("asistente_preguntas_frecuentes").update({ orden: a.orden }).eq("id", b.id);
      if (r2.error) throw r2.error;
    },
    onSuccess: refrescar,
    onError: fallo,
  });

  const borrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("asistente_preguntas_frecuentes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pregunta eliminada");
      refrescar();
    },
    onError: fallo,
  });

  const agregar = () => {
    const texto = nueva.trim();
    if (texto.length < 3) return toast.error("Escribe la pregunta (mínimo 3 caracteres)");
    crear.mutate(texto);
  };

  const guardarEdicion = () => {
    if (!editando) return;
    const texto = editando.texto.trim();
    if (texto.length < 3) return toast.error("Escribe la pregunta (mínimo 3 caracteres)");
    const respuesta = editando.respuesta.trim();
    actualizar.mutate({ id: editando.id, cambios: { pregunta: texto, respuesta: respuesta || null } }, { onSuccess: () => setEditando(null) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircleQuestion className="h-4 w-4" /> Preguntas frecuentes del asistente virtual
        </CardTitle>
        <CardDescription>
          Botones que aparecen al abrir el asistente. Solo se muestran las activas, en este orden. Las que tienen
          respuesta fija se contestan al instante, sin usar IA.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
            placeholder="Nueva pregunta frecuente…"
            maxLength={300}
            className="text-[13px]"
          />
          <Button onClick={agregar} disabled={crear.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Agregar
          </Button>
        </div>

        {isLoading ? (
          <p className="text-[12px] text-muted-foreground">Cargando…</p>
        ) : preguntas.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Aún no hay preguntas frecuentes.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {preguntas.map((p, i) => (
              <li key={p.id} className="flex items-start gap-2 px-3 py-2">
                <div className="flex flex-col">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={i === 0 || mover.isPending}
                    onClick={() => mover.mutate({ a: p, b: preguntas[i - 1] })}
                    aria-label="Subir"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={i === preguntas.length - 1 || mover.isPending}
                    onClick={() => mover.mutate({ a: p, b: preguntas[i + 1] })}
                    aria-label="Bajar"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="min-w-0 flex-1">
                  {editando?.id === p.id ? (
                    <div className="space-y-2">
                      <Input
                        autoFocus
                        value={editando.texto}
                        maxLength={300}
                        onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") guardarEdicion();
                          if (e.key === "Escape") setEditando(null);
                        }}
                        className="text-[13px]"
                      />
                      <Textarea
                        value={editando.respuesta}
                        maxLength={4000}
                        rows={4}
                        onChange={(e) => setEditando({ ...editando, respuesta: e.target.value })}
                        placeholder="Respuesta fija (opcional). Si la dejas vacía, la responde la IA."
                        className="text-[13px]"
                      />
                    </div>
                  ) : (
                    <>
                      <p className={`text-[13px] ${p.activo ? "" : "text-muted-foreground line-through"}`}>{p.pregunta}</p>
                      <p className="line-clamp-2 text-[11px] text-muted-foreground" title={p.respuesta ?? undefined}>
                        {p.respuesta ? `Respuesta fija: ${p.respuesta}` : "Sin respuesta fija: la responde la IA"}
                      </p>
                    </>
                  )}
                </div>
                {editando?.id === p.id ? (
                  <>
                    <Button size="icon-sm" variant="ghost" onClick={guardarEdicion} aria-label="Guardar">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditando(null)} aria-label="Cancelar">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Switch
                        checked={p.activo}
                        onCheckedChange={(v) => actualizar.mutate({ id: p.id, cambios: { activo: v } })}
                        aria-label="Activa"
                      />
                      {p.activo ? "Activa" : "Oculta"}
                    </label>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditando({ id: p.id, texto: p.pregunta, respuesta: p.respuesta ?? "" })}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("¿Eliminar esta pregunta frecuente?")) borrar.mutate(p.id);
                      }}
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
