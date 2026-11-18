// Vista previa «Datos detectados» al subir el BL/AWB o la Factura comercial a un Expediente
// ya creado, y etiqueta «Automático» sobre los campos que vinieron del documento.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ETIQUETA_AUTO_OPERATIVO, TIPOS_OPERATIVOS, esAutomaticoOperativo, esDocumentoOperativo,
  etiquetaCampoOperativo, type DecisionOperativa, type FuenteOperativa,
} from "@/lib/autocompletar-operativo";
import {
  aplicarAutocompletadoOperativo, evaluarAutocompletadoOperativo, lecturaOperativaParaGuardar,
  type EvaluacionOperativa,
} from "@/lib/autocompletar-operativo-evaluar";
import type { OcrExtraction } from "@/lib/ai-ocr.functions";

export type LecturaOperativaPendiente = {
  documentoId: string;
  archivo: string | null;
  tipo: string;
  datos: Partial<OcrExtraction> & Record<string, unknown>;
};

export { esDocumentoOperativo, TIPOS_OPERATIVOS };

const fmt = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString("en-US", { maximumFractionDigits: 3 });
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
};

const Icono = ({ estado }: { estado: "se_llena" | "coincide" | "difiere" | "aviso" }) =>
  estado === "coincide" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
    : estado === "difiere" ? <XCircle className="h-4 w-4 shrink-0 text-destructive" />
    : estado === "aviso" ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
    : <Bot className="h-4 w-4 shrink-0 text-primary" />;

export function EtiquetaAutoOperativo({ exp, campo, valor }: { exp: Record<string, unknown> | null | undefined; campo: string; valor?: unknown }) {
  if (!esAutomaticoOperativo(exp, campo, valor)) return null;
  const reg = ((exp?.auto_documento ?? {}) as Record<string, { fecha?: string; origen?: string; fuente?: string }>)[campo];
  const cuando = reg?.fecha ? new Date(reg.fecha).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" }) : "";
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary"
      title={`Completado desde ${reg?.fuente === "factura" ? "la Factura comercial" : "el BL/AWB"}${reg?.origen === "correo" ? " (correo automático)" : ""}${cuando ? ` el ${cuando}` : ""}. Si lo cambias a mano, la etiqueta desaparece.`}>
      <Bot className="h-3 w-3" />{ETIQUETA_AUTO_OPERATIVO}
    </span>
  );
}

/**
 * Vista previa antes de guardar: qué se llenaría, qué coincide y qué difiere.
 * Solo se completan campos vacíos; nada toca un valor manual.
 */
export function RevisionAutocompletado({ expedienteId, lectura, onClose }: {
  expedienteId: string; lectura: LecturaOperativaPendiente | null; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [ev, setEv] = useState<EvaluacionOperativa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    setEv(null); setError(null); setExcluidos(new Set());
    if (!lectura) return;
    let vivo = true;
    evaluarAutocompletadoOperativo(supabase, { expedienteId, tipo: lectura.tipo, datos: lectura.datos })
      .then((r) => vivo && setEv(r)).catch((e) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => { vivo = false; };
  }, [lectura, expedienteId]);

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["expediente", expedienteId] });
    qc.invalidateQueries({ queryKey: ["expedientes"] });
    qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
    qc.invalidateQueries({ queryKey: ["auditoria", expedienteId] });
    qc.invalidateQueries({ queryKey: ["expediente-contenedores", expedienteId] });
  };

  const aplicar = async () => {
    if (!lectura || !ev) return;
    setGuardando(true);
    try {
      const decision: DecisionOperativa = { ...ev.decision };
      if (excluidos.size) {
        const cambios = { ...decision.cambios };
        for (const k of excluidos) delete cambios[k];
        if (excluidos.has("contenedores")) delete cambios.contenedores;
        decision.cambios = cambios;
        decision.completados = decision.completados.filter((k) => !excluidos.has(k));
      }
      const evaluacion: EvaluacionOperativa = { ...ev, decision };
      const lecturaGuardada = lecturaOperativaParaGuardar({
        datos: lectura.datos, fuente: ev.fuente, origen: "manual", archivo: lectura.archivo,
      }, decision);
      const r = await aplicarAutocompletadoOperativo(supabase, {
        expedienteId, documentoId: lectura.documentoId, origen: "manual", evaluacion, lectura: lecturaGuardada,
      });
      if (ev.validacion.ok) {
        toast.success(r.completados.length || r.contenedores
          ? `Datos detectados aplicados: ${r.completados.length} campo(s) completado(s)${r.contenedores ? ` y ${r.contenedores} contenedor(es)` : ""}.`
          : "No había campos vacíos que completar.");
        if (decision.alertas.length) toast.warning(`${decision.alertas.length} diferencia(s) con el documento; se conservaron los datos del Expediente.`, { duration: 10000 });
      } else {
        toast.warning("Documento guardado sin aplicar datos: no corresponde a este Expediente. Quedó el aviso y el registro en Auditoría.", { duration: 10000 });
      }
      refrescar(); onClose();
    } catch (e) {
      toast.error(`No se pudieron aplicar los datos detectados: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setGuardando(false); }
  };

  const dejarPendiente = async () => {
    if (lectura && ev) {
      const lecturaGuardada = lecturaOperativaParaGuardar({
        datos: lectura.datos, fuente: ev.fuente, origen: "manual", archivo: lectura.archivo,
      }, ev.decision);
      await supabase.from("documentos")
        .update({ lectura_operativa: { ...lecturaGuardada, estado: "pendiente" } as never })
        .eq("id", lectura.documentoId);
      refrescar();
    }
    onClose();
  };

  const cambios = ev ? Object.entries(ev.decision.cambios).filter(([k]) => k !== "contenedores") : [];
  const contenedores = Array.isArray(ev?.decision.cambios.contenedores) ? (ev!.decision.cambios.contenedores as NonNullable<OcrExtraction["contenedores"]>) : [];
  const ok = !!ev?.validacion.ok;
  const fuente: FuenteOperativa = ev?.fuente ?? "bl";
  const nombreDocumento = lectura?.tipo ?? (fuente === "factura" ? "Factura comercial" : "Bill of Lading");

  return (
    <Dialog open={!!lectura} onOpenChange={(o) => { if (!o && !guardando) void (ok ? dejarPendiente() : aplicar()); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Datos detectados · {nombreDocumento}</DialogTitle>
          <DialogDescription>
            Nada se guarda en el Expediente hasta que presiones «Aplicar». Solo se completan campos
            vacíos; lo que ya escribiste no se cambia. Las diferencias se avisan, nunca se corrigen.
          </DialogDescription>
        </DialogHeader>
        {!ev && !error && <div className="text-sm text-muted-foreground">Comparando con el Expediente…</div>}
        {error && <div className="text-sm text-destructive">{error}</div>}
        {ev && (
          <div className="space-y-4 text-[13px]">
            {!ok && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <div className="flex items-start gap-2 font-semibold text-destructive">
                  <XCircle className="h-4 w-4 shrink-0" />El documento no corresponde a este Expediente
                </div>
                <ul className="mt-1 space-y-0.5 pl-6">
                  {ev.validacion.errores.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
                <div className="mt-1 pl-6 text-[11px] text-muted-foreground">No se llenará ningún campo. Puedes guardar el PDF igualmente.</div>
              </div>
            )}

            {ok && cambios.length > 0 && (
              <div className="grid gap-1.5 rounded-md border p-3">
                <div className="font-semibold">Se llenará ({cambios.length})</div>
                {cambios.map(([campo, valor]) => (
                    <label key={campo} className="flex items-start gap-2">
                      <Checkbox
                        checked={!excluidos.has(campo)}
                        onCheckedChange={(c) => setExcluidos((prev) => {
                          const s = new Set(prev);
                          if (c === true) s.delete(campo); else s.add(campo);
                          return s;
                        })}
                      />
                      <span className="flex items-start gap-2 min-w-0">
                        <Icono estado="se_llena" />
                        <span className="min-w-0">
                          <span className="font-medium">{etiquetaCampoOperativo(campo)}</span>
                          <span className="text-muted-foreground"> → </span>
                          <span className="break-all">{fmt(valor)}</span>
                        </span>
                      </span>
                    </label>
                ))}
                {contenedores.length > 0 && (
                  <label className="flex items-start gap-2">
                    <Checkbox
                      checked={!excluidos.has("contenedores")}
                      onCheckedChange={(c) => setExcluidos((prev) => {
                        const s = new Set(prev);
                        if (c === true) s.delete("contenedores"); else s.add("contenedores");
                        return s;
                      })}
                    />
                    <span className="flex items-start gap-2 min-w-0">
                      <Icono estado="se_llena" />
                      <span className="min-w-0">
                        <span className="font-medium">Contenedores</span>
                        <span className="text-muted-foreground"> → </span>
                        <span className="break-all">{contenedores.length} contenedor(es) con sus sellos</span>
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}

            {ok && cambios.length === 0 && contenedores.length === 0 && (
              <div className="rounded-md border p-3 text-muted-foreground">
                No hay campos vacíos que completar con este documento.
              </div>
            )}

            {ev.decision.coincidencias.length > 0 && (
              <div className="grid gap-1.5 rounded-md border p-3">
                <div className="font-semibold">Coincide ({ev.decision.coincidencias.length})</div>
                {ev.decision.coincidencias.map((campo) => (
                  <div key={campo} className="flex items-start gap-2">
                    <Icono estado="coincide" />
                    <span className="min-w-0 break-all">{campo}: el documento dice lo mismo que el Expediente.</span>
                  </div>
                ))}
              </div>
            )}

            {ev.decision.alertas.length > 0 && (
              <div className="grid gap-1.5 rounded-md border border-destructive/40 p-3">
                <div className="font-semibold text-destructive">Difiere ({ev.decision.alertas.length})</div>
                {ev.decision.alertas.map((a, i) => (
                  <div key={i} className="flex items-start gap-2"><Icono estado="difiere" /><span className="min-w-0 break-words">{a}</span></div>
                ))}
                <div className="text-[11px] text-muted-foreground">Se conserva lo del Expediente; corrígelo a mano si hace falta.</div>
              </div>
            )}

            {ev.validacion.avisos.length > 0 && (
              <div className="grid gap-1.5 rounded-md border border-amber-500/40 p-3">
                <div className="font-semibold">Avisos</div>
                {ev.validacion.avisos.map((a, i) => (
                  <div key={i} className="flex items-start gap-2"><Icono estado="aviso" /><span className="min-w-0 break-words">{a}</span></div>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => void dejarPendiente()} disabled={guardando}>Guardar sin aplicar</Button>
          <Button onClick={() => void aplicar()} disabled={guardando || !ev}>
            {guardando ? "Aplicando…" : ok ? `Aplicar${cambios.length + contenedores.length ? ` (${cambios.length + (contenedores.length ? 1 : 0)})` : ""}` : "Registrar el aviso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Rutas de archivo que aún no tienen lectura guardada (para no volver a leer la misma versión). */
export function necesitaLecturaOperativa(doc: { storage_path?: string | null; lectura_operativa?: { archivo?: string | null } | null } | null | undefined): boolean {
  if (!doc?.storage_path) return false;
  return doc.lectura_operativa?.archivo !== doc.storage_path;
}

/** Devuelve el tipo si el documento autocompleta campos, o null. */
export function tipoOperativo(tipo: string | null | undefined): string | null {
  return (TIPOS_OPERATIVOS as readonly string[]).includes(tipo ?? "") ? (tipo as string) : null;
}
