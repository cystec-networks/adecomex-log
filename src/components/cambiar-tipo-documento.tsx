// «Cambiar tipo de documento»: mueve el mismo archivo a otra casilla del Expediente sin volver a subirlo,
// sin versión nueva y con línea en Auditoría (RPC documento_cambiar_tipo). Después lo relee con el lector del
// nuevo tipo mostrando primero lo que completaría; solo se aplican los campos marcados (siempre en vacío).
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Repeat2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProcesarLecturaDua, avisarLecturaDua } from "@/components/lectura-dua";
import { useProcesarLecturaRecibo, avisarLecturaRecibo } from "@/components/recibo-dga-lectura";
import { useLeerAhoraSiga } from "@/components/seguimiento-siga";
import { nombreArchivo, siguienteCodigoSiga } from "@/lib/codigo-siga";
import { TIPO_DUA, TIPO_LIQUIDACION } from "@/lib/declaracion-dua";
import { LABEL_CAMPO_RELECTURA, casillaOcupada, codigoParaNuevoTipo, lectorDeTipo } from "@/lib/documentos-papelera";

type DocMovible = { id: string; tipo: string; codigo_siga?: string | null; storage_path?: string | null };
type Relectura = { lector: "dua" | "recibo"; doc: DocMovible & { tipo: string }; propuestos: Record<string, unknown>; avisos: string[]; motivo: string | null };

const mensaje = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e));
const valorVisible = (v: unknown) => {
  if (typeof v === "number") return v.toLocaleString("es-DO", { maximumFractionDigits: 3 });
  const s = String(v ?? "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}` : s;
};

export function CambiarTipoDocumentoDialog({ expedienteId, doc, tipos, etiquetas = {}, casillasUnicas, tiposConDocumento, onClose }: {
  expedienteId: string; doc: DocMovible | null; tipos: string[]; etiquetas?: Record<string, string>;
  casillasUnicas: ReadonlySet<string>; tiposConDocumento: ReadonlySet<string>; onClose: () => void;
}) {
  const qc = useQueryClient();
  const procesarDua = useProcesarLecturaDua();
  const procesarRecibo = useProcesarLecturaRecibo();
  const siga = useLeerAhoraSiga(expedienteId);
  const [tipo, setTipo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [paso, setPaso] = useState<"elegir" | "moviendo" | "leyendo" | "revisar" | "aplicando">("elegir");
  const [relectura, setRelectura] = useState<Relectura | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const ocupada = !!tipo && casillaOcupada(tipo, casillasUnicas, tiposConDocumento);
  const codigo = doc && tipo ? codigoParaNuevoTipo(doc.codigo_siga, tipo) : null;
  const ocupadoPaso = paso === "moviendo" || paso === "leyendo" || paso === "aplicando";
  const reiniciar = () => { setTipo(""); setMotivo(""); setPaso("elegir"); setRelectura(null); onClose(); };
  const cerrar = () => { if (!ocupadoPaso) reiniciar(); };
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
    qc.invalidateQueries({ queryKey: ["auditoria", expedienteId] });
    qc.invalidateQueries({ queryKey: ["expediente", expedienteId] });
  };
  const descargar = async (path: string) => {
    const { data: blob, error } = await supabase.storage.from("documentos").download(path);
    if (error || !blob) throw new Error(error?.message ?? "no se pudo descargar el PDF");
    return blob;
  };

  const releer = async (movido: DocMovible & { tipo: string }) => {
    const lector = lectorDeTipo(movido.tipo);
    if (!lector || !movido.storage_path) { toast.info("Este tipo de documento no tiene lectura automática."); reiniciar(); return; }
    if (lector === "siga") { reiniciar(); await siga.leerAhora({ id: movido.id, storage_path: movido.storage_path }); return; }
    setPaso("leyendo");
    try {
      const blob = await descargar(movido.storage_path);
      const nombre = movido.storage_path.split("/").pop() ?? "documento.pdf";
      const r = lector === "dua"
        ? await procesarDua({ expedienteId, documentoId: movido.id, archivo: movido.storage_path, blob, nombre, tipo: movido.tipo === TIPO_DUA ? TIPO_DUA : TIPO_LIQUIDACION, origen: "cambio_tipo", simular: true })
        : await procesarRecibo({ expedienteId, documentoId: movido.id, archivo: movido.storage_path, blob, nombre, origen: "cambio_tipo", simular: true });
      const motivoLectura = lector === "dua"
        ? ((r.lectura as { estado?: string; motivo?: string | null }).estado === "sin_numero" || (r.lectura as { estado?: string }).estado === "rechazado" ? (r.lectura as { motivo?: string | null }).motivo ?? null : null)
        : (r.lectura as { motivo?: string | null }).motivo ?? null;
      const alertas = lector === "dua" ? (r.lectura as { alertas: string[] }).alertas : r.avisos;
      setRelectura({ lector, doc: movido, propuestos: r.propuestos, avisos: alertas, motivo: motivoLectura });
      setMarcados(new Set(Object.keys(r.propuestos)));
      setPaso("revisar");
    } catch (e) {
      toast.error(`El documento se movió, pero no se pudo releer: ${mensaje(e)}. Usa «Leer ahora» en su fila.`, { duration: 10000 });
      reiniciar();
    }
  };

  const mover = async () => {
    if (!doc || !tipo || ocupada) return;
    setPaso("moviendo");
    try {
      const c = codigoParaNuevoTipo(doc.codigo_siga, tipo);
      const nuevoCodigo = c.conservar ? undefined : await siguienteCodigoSiga(expedienteId, c.prefijo);
      const { error } = await supabase.rpc("documento_cambiar_tipo", { _documento_id: doc.id, _tipo: tipo, _codigo_siga: nuevoCodigo, _motivo: motivo.trim() || undefined });
      if (error) throw error;
      toast.success(`Documento movido a «${etiquetas[tipo] ?? tipo}»${nuevoCodigo ? ` con el código ${nuevoCodigo}` : ""}. No se creó versión nueva.`);
      invalidar();
      await releer({ ...doc, tipo, codigo_siga: nuevoCodigo ?? doc.codigo_siga });
    } catch (e) {
      toast.error(`No se pudo cambiar el tipo: ${mensaje(e)}`);
      setPaso("elegir");
    }
  };

  const aplicar = async () => {
    if (!relectura) return;
    const campos = [...marcados];
    setPaso("aplicando");
    try {
      const d = relectura.doc;
      const blob = await descargar(d.storage_path!);
      const nombre = d.storage_path!.split("/").pop() ?? "documento.pdf";
      if (relectura.lector === "dua") {
        avisarLecturaDua(await procesarDua({ expedienteId, documentoId: d.id, archivo: d.storage_path!, blob, nombre, tipo: d.tipo === TIPO_DUA ? TIPO_DUA : TIPO_LIQUIDACION, origen: "cambio_tipo", soloCampos: campos }));
      } else {
        avisarLecturaRecibo(await procesarRecibo({ expedienteId, documentoId: d.id, archivo: d.storage_path!, blob, nombre, origen: "cambio_tipo", soloCampos: campos }));
      }
      invalidar();
      reiniciar();
    } catch (e) {
      toast.error(`No se pudo aplicar: ${mensaje(e)}`);
      setPaso("revisar");
    }
  };

  const opciones = tipos.filter((t) => t !== doc?.tipo);
  const camposPropuestos = relectura ? Object.entries(relectura.propuestos) : [];
  return (
    <>
      {siga.dialogo}
      <Dialog open={!!doc} onOpenChange={(o) => { if (!o) cerrar(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{paso === "revisar" || paso === "aplicando" ? "Releer con el nuevo tipo" : "Cambiar tipo de documento"}</DialogTitle>
            <DialogDescription>
              {paso === "revisar" || paso === "aplicando"
                ? "Esto es lo que la lectura completaría en campos vacíos del Expediente. Nada se guarda hasta que pulses Aplicar; desmarca lo que prefieras revisar tú."
                : "El mismo archivo pasa a otra casilla de este Expediente: no se vuelve a subir, no se crea versión nueva y queda una línea en Auditoría."}
            </DialogDescription>
          </DialogHeader>
          {doc && (paso === "elegir" || paso === "moviendo" || paso === "leyendo") && (
            <div className="grid gap-3">
              <div className="grid gap-1 rounded-md border bg-muted/30 p-2 text-[13px]">
                <div><span className="text-muted-foreground">Tipo actual:</span> {etiquetas[doc.tipo] ?? doc.tipo}{doc.codigo_siga ? ` (${doc.codigo_siga})` : ""}</div>
                <div className="break-all"><span className="text-muted-foreground">Archivo:</span> {doc.storage_path ? nombreArchivo(doc.storage_path) : "(sin archivo)"}</div>
              </div>
              <div className="grid gap-1.5">
                <Label>Nuevo tipo</Label>
                <Select value={tipo} onValueChange={setTipo} disabled={paso !== "elegir"}>
                  <SelectTrigger aria-label="Nuevo tipo"><SelectValue placeholder="Elige la casilla de destino" /></SelectTrigger>
                  <SelectContent>{opciones.map((t) => <SelectItem key={t} value={t}>{etiquetas[t] ?? t}</SelectItem>)}</SelectContent>
                </Select>
                {ocupada && <p className="text-[12px] text-destructive">La casilla «{etiquetas[tipo] ?? tipo}» ya tiene un archivo. Elimínalo o muévelo primero.</p>}
                {codigo && !ocupada && (
                  <p className="text-[12px] text-muted-foreground">
                    {codigo.conservar ? (doc.codigo_siga ? `Conserva el código ${doc.codigo_siga}.` : "Sin código SIGA.") : `Recibirá el siguiente código ${codigo.prefijo}- del Expediente.`}
                    {lectorDeTipo(tipo) ? " Después se releerá con el lector de este tipo." : " Este tipo no tiene lectura automática."}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="motivo-cambio-tipo">Motivo (opcional)</Label>
                <Textarea id="motivo-cambio-tipo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={paso !== "elegir"} />
              </div>
            </div>
          )}
          {relectura && (paso === "revisar" || paso === "aplicando") && (
            <div className="grid gap-2 text-[13px]">
              {relectura.motivo && <p className="text-destructive">{relectura.motivo}</p>}
              {camposPropuestos.length === 0
                ? <p className="text-muted-foreground">No hay campos vacíos que completar con este documento.</p>
                : (
                  <div className="grid gap-1 rounded-md border p-2">
                    {camposPropuestos.map(([campo, valor]) => {
                      const fijo = campo === "numero_dua";
                      return (
                        <label key={campo} className="flex items-start gap-2">
                          <input type="checkbox" className="mt-1" checked={fijo || marcados.has(campo)} disabled={fijo || paso === "aplicando"}
                            aria-label={LABEL_CAMPO_RELECTURA[campo] ?? campo}
                            onChange={(e) => setMarcados((s) => { const n = new Set(s); if (e.target.checked) n.add(campo); else n.delete(campo); return n; })} />
                          <span className="min-w-0"><span className="font-medium">{LABEL_CAMPO_RELECTURA[campo] ?? campo}:</span> <span className="break-all">{valorVisible(valor)}</span>
                            {fijo && <span className="block text-[11px] text-muted-foreground">La Declaración DUA sigue su regla propia (solo si está vacía).</span>}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              {relectura.avisos.map((a) => <p key={a} className="text-[12px] text-amber-700 dark:text-amber-400">{a}</p>)}
            </div>
          )}
          <DialogFooter>
            {(paso === "elegir" || paso === "moviendo" || paso === "leyendo") ? (
              <>
                <Button variant="outline" onClick={cerrar} disabled={ocupadoPaso}>Cancelar</Button>
                <Button onClick={mover} disabled={!tipo || ocupada || paso !== "elegir"}><Repeat2 className="mr-1 h-4 w-4" />{paso === "moviendo" ? "Moviendo…" : paso === "leyendo" ? "Releyendo…" : "Mover"}</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={cerrar} disabled={paso === "aplicando"}>No aplicar nada</Button>
                <Button onClick={aplicar} disabled={paso === "aplicando"}>{paso === "aplicando" ? "Aplicando…" : camposPropuestos.length ? "Aplicar seleccionados" : "Guardar lectura"}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
