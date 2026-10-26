import { useEffect, useRef, useState } from "react";
import { useEditorExpediente } from "@/components/expediente-guardado";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImporteLiquidacionInput } from "@/components/importe-liquidacion-input";
import { extractSolicitudFromDocument } from "@/lib/ai-ocr.functions";
import { conceptoPagoPuerto, documentoPagoPuerto, type TipoPagoPuerto } from "@/lib/pago-puerto";
import { guardarComprobantePuerto, guardarCostoDocumentoPuerto, type BorradorPagoPuerto } from "@/lib/pago-puerto-guardar";
import { validarNombreSiga } from "@/lib/codigo-siga";
import { supabase } from "@/integrations/supabase/client";
import { esPagoVuce, acumularPagoVuce, costoDelPermiso, permisosDelDocumento } from "@/lib/pago-vuce";

const vacio: BorradorPagoPuerto = { tipo: "", monto: "", moneda: "", fecha: "", referencia: "", concepto: "" };
export type DocumentoPagoSubido = { file: File; tipo: Exclude<TipoPagoPuerto, "gestion_aduanal">; codigo: string };
export function EscanearPagoPuerto({ expedienteId, documento, onDone }: { expedienteId: string; documento?: DocumentoPagoSubido; onDone?: () => void }) {
  const qc = useQueryClient();
  const extraer = useServerFn(extractSolicitudFromDocument);
  const [open, setOpenRaw] = useState(Boolean(documento));
  const setOpen = (v: boolean) => { setOpenRaw(v); if (!v) onDone?.(); };
  const [file, setFile] = useState<File | null>(documento?.file ?? null);
  const [borrador, setBorrador] = useState(vacio);
  const [analizado, setAnalizado] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [duplicado, setDuplicado] = useState(false);
  const [mensajeDuplicado, setMensajeDuplicado] = useState("");
  const [baseSinItbis, setBaseSinItbis] = useState<number | null>(null);
  const [permisos, setPermisos] = useState<{ id: string; numero: string | null; estado: string }[]>([]);
  const [costosVuce, setCostosVuce] = useState<{ monto_real: number | null; moneda: string | null; observaciones: string | null }[]>([]);
  const [avisoVuce, setAvisoVuce] = useState("");
  const reset = () => { setFile(null); setBorrador(vacio); setAnalizado(false); setConfirmado(false); setDuplicado(false); setMensajeDuplicado(""); };
  const analizar = useMutation({
    mutationFn: async () => {
      if (!file || !file.size || file.size > 15 * 1024 * 1024) throw new Error("Selecciona un PDF no vacío de hasta 15 MB.");
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Este comprobante solo acepta PDF.");
      if (!documento) {
        const nombre = validarNombreSiga(file.name, "OTD");
        if (!nombre.ok) throw new Error(nombre.error);
        if (nombre.advertencia) toast.warning(nombre.advertencia);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const res = await extraer({ data: { filename: file.name, mime: "application/pdf", base64: btoa(binary), pago_puerto: true } });
      if (!res.pago_puerto) throw new Error("No se obtuvieron datos del comprobante.");
      return res.pago_puerto;
    },
    onSuccess: async (p) => {
      setBaseSinItbis(p.monto_sin_itbis);
      const tipo = documento?.tipo ?? (p.confianza === "alta" ? p.tipo ?? "" : "");
      const nuevo = { tipo, monto: p.monto === null ? "" : String(p.monto), moneda: p.moneda ?? "", fecha: p.fecha ?? "", referencia: p.referencia ?? "", concepto: tipo ? conceptoPagoPuerto(tipo, p.referencia ?? "") : "", documentos_vuce: p.documentos_vuce ?? [] };
      const [ps, cs] = await Promise.all([
        supabase.from("permisos").select("id,numero,estado").eq("expediente_id", expedienteId),
        supabase.from("costos_producto").select("monto_real,moneda,observaciones").eq("expediente_id", expedienteId),
      ]);
      setPermisos(ps.data ?? []); setCostosVuce(cs.data ?? []);
      const matches = permisosDelDocumento(ps.data ?? [], nuevo.documentos_vuce);
      const numero = matches.length === 1 ? matches[0].numero ?? "" : "";
      setAvisoVuce(ps.error || cs.error ? "No se pudo consultar los permisos o costos; vuelve a leer antes de confirmar." : !nuevo.documentos_vuce.length ? "No se identificó el N.º de trámite en este documento. Selecciona el permiso correcto para vincularlo." : matches.length !== 1 ? "El No. Documento no coincide con un único Permiso VUCE de este expediente. Revisa y selecciona el permiso; no se asumió ningún vínculo." : "");
      setBorrador({ ...nuevo, permiso_numero: numero, ...(esPagoVuce(tipo) && numero ? acumularPagoVuce(tipo, nuevo, costoDelPermiso(cs.data ?? [], numero)) : {}) });
      setAnalizado(true);
    }, onError: (e) => toast.error(e.message),
  });
  const guardar = useMutation({
    mutationFn: async () => {
      if (!file || !confirmado) throw new Error("Revisa y confirma los datos antes de guardar.");
      if (documento) return guardarCostoDocumentoPuerto(expedienteId, documento.codigo, borrador);
      return guardarComprobantePuerto(expedienteId, file, borrador, duplicado);
    },
    onSuccess: (r) => {
      for (const key of ["documentos", "costos_producto", "costos-producto-liq", "ecf-vinculada", "costos-vuce-resumen"]) qc.invalidateQueries({ queryKey: [key, expedienteId] });
      qc.invalidateQueries({ queryKey: ["facturas-ecf"] });
      qc.invalidateQueries({ queryKey: ["facturas-ecf-lite"] });
      qc.invalidateQueries({ queryKey: ["factura-ecf-edit"] });
      if (r.aviso) toast.warning(r.aviso, { duration: 12000 }); else toast.success(`Costo guardado y PDF vinculado · ${r.codigo}`);
      setOpen(false); reset();
    }, onError: (e) => { toast.error(e.message); if (e.message.includes("El archivo ya está cargado")) setMensajeDuplicado(e.message); },
  });
  const iniciado = useRef(false);
  useEffect(() => { if (documento && !iniciado.current) { iniciado.current = true; analizar.mutate(); } }, [documento]);
  const pendiente = analizar.isPending || guardar.isPending;
  useEditorExpediente(analizado, pendiente, async () => { await guardar.mutateAsync(); });
  const editar = (values: Partial<BorradorPagoPuerto>) => { setBorrador((p) => ({ ...p, ...values })); setConfirmado(false); };
  return <>
    {!documento && <Button size="sm" variant="outline" onClick={() => { reset(); setOpen(true); }}><Sparkles className="h-4 w-4 mr-1" />Escanear pago</Button>}
    <Dialog modal={false} open={open} onOpenChange={(v) => { if (!pendiente) setOpen(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{documento ? `Costo desde documento · ${documento.codigo}` : "Escanear pago de importación"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          {documento ? <div className="text-xs text-muted-foreground">PDF ya guardado en Documentos ({documento.file.name}). Revisa y confirma el costo en Costo de Mercancía.</div> : <div className="grid gap-1.5"><Label htmlFor="pago-pdf">Comprobante PDF (máx. 15 MB)</Label><Input id="pago-pdf" type="file" accept="application/pdf,.pdf" disabled={pendiente} onChange={(e) => { reset(); setFile(e.target.files?.[0] ?? null); }} /></div>}
          {!analizado && analizar.isError && documento && <div className="text-xs text-destructive">No se pudo leer el PDF; puedes reintentar o capturar el costo en Costos.</div>}
          {!analizado && <Button disabled={!file || pendiente} onClick={() => analizar.mutate()}>{analizar.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}{analizar.isPending ? "Analizando…" : "Extraer datos"}</Button>}
          {analizado && <fieldset disabled={pendiente} className="grid gap-3">
            <div className="flex gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-4 w-4 shrink-0" />Verifica los datos sugeridos por IA antes de guardar.</div>
            {(!borrador.monto || !borrador.moneda || !borrador.fecha) && <div role="alert" className="grid gap-1 text-xs text-destructive">
              {!borrador.monto && <p>No se pudo determinar el monto automáticamente — verificar manualmente.</p>}
              {!borrador.moneda && <p>No se pudo determinar la moneda automáticamente — verificar manualmente.</p>}
              {!borrador.fecha && <p>No se pudo determinar la fecha automáticamente — verificar manualmente.</p>}
            </div>}
            {!borrador.tipo && <div className="text-sm text-destructive">No se determinó el tipo con certeza. Selecciona la casilla correcta.</div>}
            <div className="grid gap-1.5"><Label>Tipo de pago</Label><Select disabled={pendiente || Boolean(documento)} value={borrador.tipo} onValueChange={(tipo: TipoPagoPuerto) => editar({ tipo, concepto: conceptoPagoPuerto(tipo, borrador.referencia), ...(tipo === "gestion_aduanal" ? { monto: baseSinItbis === null ? "" : String(baseSinItbis) } : {}) })}><SelectTrigger aria-label="Tipo de pago"><SelectValue placeholder="Seleccionar tipo de pago" /></SelectTrigger><SelectContent><SelectItem value="almacenaje">Almacenaje</SelectItem><SelectItem value="contenedor">Depósito / Pago de Contenedor</SelectItem><SelectItem value="gestion_aduanal">Factura de Gestión Aduanal</SelectItem><SelectItem value="cargos_locales">Pago de Cargos Locales</SelectItem><SelectItem value="vuce_pin">PIN de Pago Permiso VUCE</SelectItem><SelectItem value="vuce_recibo">Recibo Pago Permiso VUCE</SelectItem></SelectContent></Select></div>
            {esPagoVuce(borrador.tipo) && <div className="grid gap-1.5">
              {avisoVuce && <p role="alert" className="text-xs text-destructive">{avisoVuce}</p>}
              {!!borrador.documentos_vuce?.length && <p className="text-xs text-muted-foreground">No. Documento: {borrador.documentos_vuce.join(", ")}</p>}
              <Label>Permiso VUCE vinculado</Label><Select value={borrador.permiso_numero ?? ""} onValueChange={(numero) => editar({ permiso_numero: numero, ...acumularPagoVuce(borrador.tipo, borrador, costoDelPermiso(costosVuce, numero)) })}><SelectTrigger aria-label="Permiso VUCE vinculado"><SelectValue placeholder="Seleccionar permiso del expediente" /></SelectTrigger><SelectContent>{permisos.filter(p => p.numero).map(p => <SelectItem key={p.id} value={p.numero ?? ""}>{p.numero} · {p.estado}</SelectItem>)}</SelectContent></Select>
            </div>}
            <div className="grid gap-1.5"><Label htmlFor="pago-concepto">Concepto</Label><Input id="pago-concepto" value={borrador.concepto} onChange={(e) => editar({ concepto: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>{borrador.tipo === "gestion_aduanal" ? "Precio sin ITBIS" : "Monto total pagado"}</Label><ImporteLiquidacionInput aria-label={borrador.tipo === "gestion_aduanal" ? "Precio sin ITBIS" : "Monto total pagado"} value={borrador.monto} onValueChange={(monto) => editar({ monto })} /></div>
              <div className="grid gap-1.5"><Label>Moneda</Label><Select disabled={pendiente} value={borrador.moneda} onValueChange={(moneda) => editar({ moneda })}><SelectTrigger aria-label="Moneda del pago"><SelectValue placeholder="Confirmar moneda" /></SelectTrigger><SelectContent><SelectItem value="DOP">RD$</SelectItem><SelectItem value="USD">US$</SelectItem></SelectContent></Select></div>
              <div className="grid gap-1.5"><Label htmlFor="pago-fecha">{borrador.tipo === "gestion_aduanal" ? "Fecha de factura" : "Fecha de pago"}</Label><Input id="pago-fecha" type="date" value={borrador.fecha} onChange={(e) => editar({ fecha: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label htmlFor="pago-pin">{borrador.tipo === "gestion_aduanal" ? "N° de factura / NCF" : "PIN / Referencia"}</Label><Input id="pago-pin" value={borrador.referencia} onChange={(e) => editar({ referencia: e.target.value })} /></div>
            </div>
            {borrador.tipo && !documento && <div className="text-xs text-muted-foreground">{borrador.tipo === "gestion_aduanal" ? "PDF de Factura e-CF en Finanzas · Reemplaza el adjunto de la factura correspondiente; si no existe, se guardará solo el costo y se avisará." : `Documento recibido: ${documentoPagoPuerto(borrador.tipo)} · Reemplaza el PDF existente en esa casilla.`}</div>}
            {mensajeDuplicado && <label className="flex gap-2 text-xs"><Checkbox checked={duplicado} onCheckedChange={(v) => setDuplicado(v === true)} />{mensajeDuplicado}</label>}
            <label className="flex items-center gap-2 text-sm"><Checkbox aria-label="Confirmo el monto y los datos del pago" checked={confirmado} onCheckedChange={(v) => setConfirmado(v === true)} />Confirmo el monto y los datos del pago</label>
          </fieldset>}
        </div>
        <DialogFooter><Button variant="outline" disabled={pendiente} onClick={() => { setOpen(false); reset(); }}>Cancelar</Button>{analizado && <Button disabled={pendiente || !confirmado || !borrador.tipo || !borrador.moneda || !borrador.monto || (esPagoVuce(borrador.tipo) && !borrador.permiso_numero) || (Boolean(mensajeDuplicado) && !duplicado)} onClick={() => guardar.mutate()}>{guardar.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Guardar costo y documento</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}