// Vista previa «Datos detectados» al subir el BL/AWB o la Factura comercial a un Expediente
// ya creado, y etiqueta «Automático» sobre los campos que vinieron del documento.
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
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
import { leerDocumentoOperativo } from "@/lib/autocompletar-operativo.functions";
import type { LecturaOperativaGuardada } from "@/lib/autocompletar-operativo";

export type LecturaOperativaPendiente = {
  documentoId: string;
  archivo: string | null;
  tipo: string;
  datos: Partial<OcrExtraction> & Record<string, unknown>;
  /** Cómo llegó la lectura: subida en Expediente nuevo, «Leer ahora» o correo. */
  origen?: "manual" | "leer_ahora" | "correo";
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
        datos: lectura.datos, fuente: ev.fuente, origen: lectura.origen ?? "manual", archivo: lectura.archivo,
      }, decision);
      const r = await aplicarAutocompletadoOperativo(supabase, {
        expedienteId, documentoId: lectura.documentoId, origen: lectura.origen ?? "manual", evaluacion, lectura: lecturaGuardada,
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
        datos: lectura.datos, fuente: ev.fuente, origen: lectura.origen ?? "manual", archivo: lectura.archivo,
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
                    <span className="min-w-0 break-all">{etiquetaCampoOperativo(campo)}: el documento dice lo mismo que el Expediente.</span>
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

            {ev.decision.notas.length > 0 && (
              <div className="grid gap-1 rounded-md bg-muted/50 p-3 text-[12px] text-muted-foreground">
                <div className="font-medium">Notas informativas ({ev.decision.notas.length})</div>
                {ev.decision.notas.map((n, i) => (
                  <div key={i} className="flex items-start gap-2"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span className="min-w-0 break-words">{n}</span></div>
                ))}
                <div className="text-[11px]">Diferencias de texto: no requieren acción; se conserva lo del Expediente.</div>
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

type DocOperativo = { id: string; tipo: string; storage_path?: string | null; lectura_operativa?: unknown };

/**
 * Línea bajo el BL/AWB o la Factura comercial: «Leer ahora» (uno por uno, también en Expedientes
 * anteriores), «Revisar datos detectados» cuando la lectura espera la vista previa, o el resultado.
 */
export function LecturaOperativaDocumento({ doc, onRevisar }: { doc: DocOperativo; onRevisar: (l: LecturaOperativaPendiente) => void }) {
  const qc = useQueryClient();
  const leer = useServerFn(leerDocumentoOperativo);
  const [leyendo, setLeyendo] = useState(false);
  if (!doc.storage_path || !tipoOperativo(doc.tipo)) return null;
  const l = doc.lectura_operativa as (LecturaOperativaGuardada & { estado?: string }) | null | undefined;
  const vigente = !!l && l.archivo === doc.storage_path;

  const leerAhora = async () => {
    setLeyendo(true);
    try {
      const r = await leer({ data: { documentoId: doc.id, origen: "leer_ahora" } });
      qc.invalidateQueries({ queryKey: ["documentos"] });
      onRevisar({ documentoId: doc.id, archivo: r.archivo, tipo: r.tipo, datos: JSON.parse(r.datos), origen: "leer_ahora" });
    } catch (e) {
      toast.error(`No se pudo leer el documento: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setLeyendo(false); }
  };
  const boton = (
    <Button size="sm" variant="outline" className="h-5 px-1.5 text-[11px]" onClick={() => void leerAhora()} disabled={leyendo}>
      {leyendo ? "Leyendo…" : "Leer ahora"}
    </Button>
  );

  let linea: ReactNode;
  if (!vigente || !l) {
    linea = <><span className="text-muted-foreground">Datos del documento sin leer.</span>{boton}</>;
  } else if (l.estado === "pendiente") {
    linea = (
      <>
        <span className="text-amber-700">Datos detectados sin revisar{l.origen === "correo" ? " (llegó por correo)" : ""}.</span>
        <Button size="sm" variant="outline" className="h-5 px-1.5 text-[11px]"
          onClick={() => onRevisar({ documentoId: doc.id, archivo: doc.storage_path ?? null, tipo: doc.tipo, datos: (l.datos ?? {}) as LecturaOperativaPendiente["datos"], origen: l.origen === "correo" ? "correo" : l.origen === "leer_ahora" ? "leer_ahora" : "manual" })}>
          Revisar datos detectados
        </Button>
      </>
    );
  } else if (l.estado === "rechazado") {
    linea = <span className="text-destructive">Datos no aplicados: el documento no corresponde a este Expediente.</span>;
  } else {
    const n = l.completados?.length ?? 0;
    linea = <span className="text-muted-foreground">Datos detectados revisados: {n ? `${n} campo(s) completado(s)` : "sin campos vacíos que completar"}{l.alertas?.length ? ` · ${l.alertas.length} diferencia(s)` : ""}.</span>;
  }
  return <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] whitespace-normal break-words">{linea}</div>;
}
