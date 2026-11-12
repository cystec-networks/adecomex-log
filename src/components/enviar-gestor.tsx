import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileBadge, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { fmtFechaHora } from "@/lib/documento-versiones";
import { descargarPortadaExpediente } from "@/components/portada-expediente-button";

type Envio = { id: string; gestor_nombre: string; enviado_en: string; enviado_por: string | null; notas: string | null };

/**
 * «Enviar al gestor»: solo registra el envío (fecha, hora, usuario y gestor del catálogo); no abre Gmail.
 * La base de datos deja constancia en Auditoría y completa el hito 7 la primera vez, sin pisar una fecha manual.
 */
export function EnviarGestor({ expedienteId, fechaManual, yaAutomatico }: { expedienteId: string; fechaManual: boolean; yaAutomatico: boolean }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [gestorId, setGestorId] = useState("");
  const [notas, setNotas] = useState("");
  const [portada, setPortada] = useState(false);

  const { data: gestores } = useQuery({
    queryKey: ["catalogo-gestores-activos"],
    enabled: abierto,
    queryFn: async () => {
      const { data, error } = await supabase.from("catalogo_gestores_honorarios").select("id, codigo, nombre").eq("estado", "activo").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: envios } = useQuery({
    queryKey: ["envios-gestor", expedienteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("expediente_envios_gestor")
        .select("id, gestor_nombre, enviado_en, enviado_por, notas")
        .eq("expediente_id", expedienteId).order("enviado_en", { ascending: false });
      if (error) throw error;
      const filas = (data ?? []) as Envio[];
      const ids = [...new Set(filas.map((f) => f.enviado_por).filter(Boolean))] as string[];
      const nombres: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nombre").in("id", ids);
        for (const p of profs ?? []) nombres[p.id] = p.nombre ?? "";
      }
      return filas.map((f) => ({ ...f, usuario: f.enviado_por ? nombres[f.enviado_por] || "—" : "—" }));
    },
  });

  const registrar = useMutation({
    mutationFn: async () => {
      if (!gestorId) throw new Error("Elige el gestor.");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Inicia sesión para registrar el envío.");
      const { error } = await supabase.from("expediente_envios_gestor").insert({
        expediente_id: expedienteId, gestor_id: gestorId, enviado_por: u.user.id, notas: notas.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(fechaManual
        ? "Envío registrado. El hito ya tenía una fecha puesta a mano y no se cambió."
        : yaAutomatico ? "Envío registrado. El hito conserva la fecha del primer envío." : "Envío registrado y hito completado.");
      setAbierto(false); setGestorId(""); setNotas("");
      qc.invalidateQueries({ queryKey: ["envios-gestor", expedienteId] });
      qc.invalidateQueries({ queryKey: ["expediente-hitos", expedienteId] });
      qc.invalidateQueries({ queryKey: ["auditoria"] });
      qc.invalidateQueries({ queryKey: ["reminders"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar el envío"),
  });

  const bajarPortada = async () => {
    setPortada(true);
    try { await descargarPortadaExpediente(expedienteId); toast.success("Portada descargada"); }
    catch (e: any) { toast.error(e?.message ?? "No se pudo generar la portada"); }
    finally { setPortada(false); }
  };

  const ultimo = envios?.[0];

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-normal">
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[12px]" onClick={() => setAbierto(true)}>
        <Send className="mr-1 h-3.5 w-3.5" />Enviar al gestor
      </Button>
      <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-60" onClick={bajarPortada} disabled={portada}>
        {portada ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileBadge className="h-3.5 w-3.5" />}Descargar Portada
      </button>
      {ultimo && <span className="text-[11px] text-muted-foreground">Último envío: {ultimo.gestor_nombre} · {fmtFechaHora(ultimo.enviado_en)}</span>}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar al gestor</DialogTitle>
            <DialogDescription>Registra la fecha, la hora, tu usuario y el gestor. No abre ningún correo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-[13px]">
            <div className="grid gap-1.5 min-w-0">
              <Label>Gestor</Label>
              <Select value={gestorId} onValueChange={setGestorId}>
                <SelectTrigger><SelectValue placeholder="Elige el gestor" /></SelectTrigger>
                <SelectContent>
                  {(gestores ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Notas (opcional)</Label>
              <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: entregado en físico con la portada" />
            </div>
            {fechaManual && <p className="text-[12px] text-muted-foreground">El hito ya tiene una fecha puesta a mano: se registrará el envío sin cambiarla.</p>}
            {(envios?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Envíos anteriores</p>
                <ul className="max-h-32 overflow-auto rounded border text-[12px]">
                  {envios!.map((e) => (
                    <li key={e.id} className="flex justify-between gap-2 border-b px-2 py-1 last:border-0">
                      <span>{e.gestor_nombre}</span>
                      <span className="text-muted-foreground">{fmtFechaHora(e.enviado_en)} · {e.usuario}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={() => registrar.mutate()} disabled={registrar.isPending || !gestorId}>
              {registrar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Registrar envío
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
