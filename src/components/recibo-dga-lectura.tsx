// Panel del «Recibo Pago de Impuestos»: lee el comprobante con reglas fijas (sin IA), lo compara con
// la Liquidación del Expediente y completa solo los campos vacíos, con etiqueta «Automático» y línea
// en Auditoría. El cruce con el banco es informativo; la diferencia se acepta con motivo obligatorio.
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Bot, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLiquidacionDga } from "@/components/liquidacion-dga-context";
import { useMyRoles } from "@/lib/auth-hooks";
import { leerBalanceLiquidacionDocumento, leerReciboDgaDocumento } from "@/lib/recibo-dga.functions";
import {
  ETIQUETA_AUTO_RECIBO, TIPO_RECIBO_DGA, estadoPagoTardio, validarReciboDga, decidirGuardadoRecibo,
  type LecturaReciboGuardada, type ReciboDga, type ValidacionRecibo,
} from "@/lib/recibo-dga";
import { cn } from "@/lib/utils";

const TIPO_LIQUIDACION = "Reporte de Liquidación de Impuestos";
const LIMITE_LECTURA = 15 * 1024 * 1024;

const bytesABase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const base64DeBlob = async (blob: Blob) => bytesABase64(new Uint8Array(await blob.arrayBuffer()));
const dinero = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = (v: string | null | undefined) => {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : v;
};

const ICONO_ESTADO = {
  ok: <CheckCircle2 className="h-3 w-3 text-emerald-600" />,
  difiere: <XCircle className="h-3 w-3 text-destructive" />,
  parcial: <AlertTriangle className="h-3 w-3 text-amber-600" />,
  sin_datos: null,
} as const;

export type ResultadoLecturaRecibo = { lectura: LecturaReciboGuardada; completados: string[]; avisos: string[] };

/**
 * Lee el comprobante, lo compara con la Liquidación del Expediente y completa solo lo vacío.
 * Un solo UPDATE con guarda optimista: si alguien editó el Expediente mientras, no se escribe nada.
 */
export function useProcesarLecturaRecibo() {
  const qc = useQueryClient();
  const editor = useLiquidacionDga();
  const leerRecibo = useServerFn(leerReciboDgaDocumento);
  const leerBalance = useServerFn(leerBalanceLiquidacionDocumento);
  return async (p: {
    expedienteId: string; documentoId: string; archivo: string | null;
    blob: Blob; nombre: string; origen: "manual" | "leer_ahora"; previa?: LecturaReciboGuardada | null;
  }): Promise<ResultadoLecturaRecibo> => {
    if (p.blob.size > LIMITE_LECTURA) throw new Error("el archivo supera 15 MB para lectura automática; captura la fecha de pago manualmente");
    const base64 = await base64DeBlob(p.blob);
    const res = await leerRecibo({ data: { filename: p.nombre, base64 } });
    let validacion: ValidacionRecibo | null = null;
    if (res.recibo) {
      const { data: liqDoc } = await supabase.from("documentos")
        .select("storage_path").eq("expediente_id", p.expedienteId).eq("tipo", TIPO_LIQUIDACION)
        .not("storage_path", "is", null).order("fecha_recepcion", { ascending: false }).limit(1).maybeSingle();
      if (liqDoc?.storage_path) {
        const { data: lb, error: le } = await supabase.storage.from("documentos").download(liqDoc.storage_path);
        if (!le && lb) {
          const r = await leerBalance({ data: { filename: liqDoc.storage_path.split("/").pop() ?? "liquidacion.pdf", base64: await base64DeBlob(lb) } });
          if (r.balance) validacion = validarReciboDga(res.recibo, [r.balance]);
        }
      }
      if (!validacion) validacion = validarReciboDga(res.recibo, []);
    }
    const lectura: LecturaReciboGuardada = {
      archivo: p.archivo, leido_en: new Date().toISOString(), origen: p.origen,
      recibo: res.recibo, motivo: res.motivo ?? null, validacion,
      completados: [], diferencia_aceptada: p.previa?.diferencia_aceptada ?? null,
    };
    let completados: string[] = [];
    const avisos: string[] = [];
    if (res.recibo && validacion) {
      const { data: actual, error: readError } = await supabase.from("expedientes").select("*").eq("id", p.expedienteId).single();
      if (readError || !actual) throw readError ?? new Error("Expediente no encontrado");
      const decision = decidirGuardadoRecibo(actual as Record<string, unknown>, res.recibo, validacion);
      completados = Object.keys(decision.cambios);
      avisos.push(...decision.avisos);
      const tardio = estadoPagoTardio(res.recibo, actual.liq_siga_termino_at);
      if (tardio === "tardio") avisos.push("El pago se registró después del vencimiento del PIN.");
      if (completados.length) {
        const dga_auto = { ...((actual as Record<string, unknown>).dga_auto as Record<string, unknown> ?? {}) };
        for (const campo of completados) {
          dga_auto[campo] = { valor: decision.cambios[campo], documento_id: p.documentoId, tipo_documento: TIPO_RECIBO_DGA, fecha: new Date().toISOString(), origen: p.origen };
        }
        let query = supabase.from("expedientes").update({ ...decision.cambios, dga_auto } as never).eq("id", p.expedienteId);
        for (const campo of completados) {
          const previo = (actual as Record<string, unknown>)[campo];
          query = previo == null ? query.is(campo, null) : query.eq(campo, previo as string);
        }
        const { data: updated, error } = await query.select("id");
        if (error) throw error;
        if (!updated?.length) throw new Error("el expediente cambió durante la lectura; no se guardó ningún campo parcial");
        editor?.current?.aplicar(decision.cambios as never);
      }
      await supabase.from("auditoria").insert({
        entidad: "expedientes", entidad_id: p.expedienteId,
        accion: completados.length ? "recibo_automatico" : "recibo_leido",
        cambios: {
          recibo: res.recibo.recibo, fecha_pago: res.recibo.fecha_pago, total: res.recibo.total,
          completados, alertas: avisos, estado_validacion: validacion.estado,
          documento_id: p.documentoId, origen: p.origen,
        } as never,
      });
      lectura.completados = completados;
    }
    const { error: upErr } = await supabase.from("documentos").update({ lectura_recibo: lectura as never }).eq("id", p.documentoId);
    if (upErr) toast.warning(`No se pudo guardar la lectura del recibo: ${upErr.message}`);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["expediente", p.expedienteId] }),
      qc.invalidateQueries({ queryKey: ["documentos", p.expedienteId] }),
      qc.invalidateQueries({ queryKey: ["auditoria", p.expedienteId] }),
    ]);
    qc.invalidateQueries({ queryKey: ["expedientes"] });
    return { lectura, completados, avisos };
  };
}

/** Avisos breves tras leer: lo que se llenó, por qué no y las diferencias. */
export function avisarLecturaRecibo({ lectura, completados, avisos }: ResultadoLecturaRecibo) {
  if (lectura.motivo) toast.warning(lectura.motivo, { duration: 12000 });
  else if (completados.length) toast.success(`Recibo aplicado: ${completados.length} campo(s) completados; los existentes se conservaron.`);
  else toast.success("Recibo leído; no hay nuevos campos vacíos que completar.");
  for (const a of avisos) toast.warning(a, { duration: 12000 });
}

function TablaValidacion({ validacion }: { validacion: ValidacionRecibo }) {
  return (
    <div className="mt-1 overflow-x-auto">
      <table className="w-full min-w-[26rem] border-collapse text-[11px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-0.5 pr-2 font-medium">Concepto</th>
            <th className="py-0.5 pr-2 text-right font-medium">Recibo</th>
            <th className="py-0.5 pr-2 text-right font-medium">Liquidación</th>
            <th className="py-0.5 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {validacion.filas.map((f) => (
            <tr key={f.clave} className={cn("border-t", f.clave === "total" && "font-medium")}>
              <td className="py-0.5 pr-2">{f.etiqueta}</td>
              <td className="py-0.5 pr-2 text-right tabular-nums">{dinero(f.recibo)}</td>
              <td className="py-0.5 pr-2 text-right tabular-nums">{dinero(f.liquidacion)}</td>
              <td className="py-0.5">
                <span className="inline-flex items-center gap-1">
                  {ICONO_ESTADO[f.estado]}
                  {f.estado === "ok" ? "Coincide" : f.estado === "difiere" ? `Difiere ${dinero(Math.abs(f.diferencia ?? 0))}` : f.estado === "parcial" ? "Parcial" : "Sin comparación"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Informativo: busca en los movimientos del banco el N.º de transacción del recibo. No concilia nada. */
function CruceBancario({ transaccion }: { transaccion: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["recibo-cruce-bancario", transaccion],
    queryFn: async () => {
      const { data, error } = await supabase.from("banco_movimientos")
        .select("fecha, monto, descripcion").ilike("descripcion", `%${transaccion}%`)
        .order("fecha", { ascending: false }).limit(2);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <div className="mt-0.5 text-muted-foreground">Cruzando con los movimientos del banco…</div>;
  if (!data?.length) return <div className="mt-0.5 text-muted-foreground">Débito con el N.º de transacción {transaccion}: no encontrado en los movimientos importados.</div>;
  const m = data[0];
  return (
    <div className="mt-0.5 text-muted-foreground">
      Débito encontrado: {fechaCorta(String(m.fecha))} · {dinero(Number(m.monto))} · {String(m.descripcion ?? "")}
    </div>
  );
}

/** Estado bajo la casilla «Recibo Pago de Impuestos»: lectura, comparación, cruce bancario y diferencia aceptada. */
export function LecturaReciboDocumento({ expedienteId, doc }: {
  expedienteId: string;
  doc: { id: string; tipo: string; storage_path: string | null; lectura_recibo?: unknown };
}) {
  const qc = useQueryClient();
  const procesar = useProcesarLecturaRecibo();
  const { data: roles } = useMyRoles();
  const puedeAceptar = (roles ?? []).some((r) => ["admin", "finanzas", "operaciones"].includes(r));
  const [leyendo, setLeyendo] = useState(false);
  const [aceptar, setAceptar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const lectura = doc.lectura_recibo as LecturaReciboGuardada | null | undefined;
  const vigente = !!lectura && lectura.archivo === doc.storage_path;
  const validacion = vigente ? lectura?.validacion ?? null : null;
  const recibo = vigente ? lectura?.recibo ?? null : null;
  const transaccion = recibo?.formas[0]?.transaccion ?? null;

  const leerAhora = async () => {
    setLeyendo(true);
    try {
      if (!doc.storage_path) throw new Error("no hay archivo en la casilla");
      const { data: blob, error } = await supabase.storage.from("documentos").download(doc.storage_path);
      if (error || !blob) throw new Error(error?.message ?? "no se pudo descargar el PDF");
      avisarLecturaRecibo(await procesar({
        expedienteId, documentoId: doc.id, archivo: doc.storage_path, blob,
        nombre: doc.storage_path.split("/").pop() ?? "recibo.pdf", origen: "leer_ahora", previa: lectura ?? null,
      }));
    } catch (e) {
      toast.error(`Lectura del recibo no disponible: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setLeyendo(false); }
  };

  const confirmarDiferencia = async () => {
    const motivoLimpio = motivo.trim();
    if (!motivoLimpio) return toast.error("Escribe el motivo para aceptar la diferencia.");
    setGuardando(true);
    try {
      const { data: sesion } = await supabase.auth.getUser();
      const { data: perfil } = await supabase.from("profiles").select("full_name, email").eq("id", sesion.user?.id ?? "").maybeSingle();
      const nombre = String((perfil as Record<string, unknown> | null)?.full_name || (perfil as Record<string, unknown> | null)?.email || "usuario");
      const nueva: LecturaReciboGuardada = {
        ...(lectura as LecturaReciboGuardada),
        diferencia_aceptada: { motivo: motivoLimpio, usuario: nombre, fecha: new Date().toISOString() },
      };
      const { error } = await supabase.from("documentos").update({ lectura_recibo: nueva as never }).eq("id", doc.id);
      if (error) throw error;
      await supabase.from("auditoria").insert({
        entidad: "expedientes", entidad_id: expedienteId, accion: "recibo_diferencia_aceptada",
        cambios: {
          recibo: recibo?.recibo ?? null, motivo: motivoLimpio, usuario: nombre,
          diferencias: validacion?.filas.filter((f) => f.estado === "difiere").map((f) => f.etiqueta) ?? [],
        } as never,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["documentos", expedienteId] }),
        qc.invalidateQueries({ queryKey: ["auditoria", expedienteId] }),
      ]);
      toast.success("Diferencia aceptada y registrada en Auditoría.");
      setAceptar(false); setMotivo("");
    } catch (e) {
      toast.error(`No se pudo aceptar la diferencia: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setGuardando(false); }
  };

  const boton = <Button size="sm" variant="outline" className="h-5 px-1.5 text-[11px]" onClick={leerAhora} disabled={leyendo}>{leyendo ? "Leyendo…" : "Leer ahora"}</Button>;

  let linea: ReactNode = <span>Recibo sin leer.</span>;
  if (!vigente && lectura) linea = <><span className="text-destructive">Lectura de un archivo anterior.</span>{boton}</>;
  else if (!vigente) linea = <>{linea}{boton}</>;
  else if (lectura?.motivo) linea = <><span className="text-destructive">{lectura.motivo}</span>{boton}</>;
  else if (recibo) linea = <span>Recibo {recibo.recibo ?? "—"} · pago {fechaCorta(recibo.fecha_pago)} · total {dinero(recibo.total)}</span>;

  return (
    <div className="text-[11px] whitespace-normal break-words">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {linea}
        {vigente && recibo && (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0 font-medium text-primary"
            title="Los campos del Expediente que estaban vacíos se completaron desde este recibo. Si los cambias a mano, la etiqueta desaparece.">
            <Bot className="h-3 w-3" />{ETIQUETA_AUTO_RECIBO}
          </span>
        )}
      </div>
      {vigente && validacion && <TablaValidacion validacion={validacion} />}
      {vigente && validacion?.avisos.map((a) => <div key={a} className="text-destructive">{a}</div>)}
      {vigente && transaccion && <CruceBancario transaccion={transaccion} />}
      {vigente && validacion?.estado === "difiere" && !lectura?.diferencia_aceptada && puedeAceptar && (
        <div className="mt-1">
          <Button size="sm" variant="outline" className="h-5 px-1.5 text-[11px]" onClick={() => setAceptar(true)}>Aceptar diferencia</Button>
        </div>
      )}
      {lectura?.diferencia_aceptada && (
        <div className="mt-0.5 text-muted-foreground">
          Diferencia aceptada por {lectura.diferencia_aceptada.usuario} · {fechaCorta(lectura.diferencia_aceptada.fecha)} · {lectura.diferencia_aceptada.motivo}
        </div>
      )}
      <Dialog open={aceptar} onOpenChange={setAceptar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aceptar la diferencia con la Liquidación</DialogTitle>
            <DialogDescription>
              Queda registrada en Auditoría con tu nombre y el motivo. Los importes del Expediente no se cambian.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="motivo-recibo">Motivo</Label>
            <Textarea id="motivo-recibo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. la DGA aplicó un descuento no reflejado en la Liquidación" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAceptar(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={confirmarDiferencia} disabled={guardando || !motivo.trim()}>{guardando ? "Guardando…" : "Aceptar diferencia"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
