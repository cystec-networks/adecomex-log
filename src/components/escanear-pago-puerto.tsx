import { useState } from "react";
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
import { guardarComprobantePuerto, type BorradorPagoPuerto } from "@/lib/pago-puerto-guardar";
import { validarNombreSiga } from "@/lib/codigo-siga";

const vacio: BorradorPagoPuerto = { tipo: "", monto: "", moneda: "", fecha: "", referencia: "", concepto: "" };
export function EscanearPagoPuerto({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const extraer = useServerFn(extractSolicitudFromDocument);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [borrador, setBorrador] = useState(vacio);
  const [analizado, setAnalizado] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [duplicado, setDuplicado] = useState(false);
  const [mensajeDuplicado, setMensajeDuplicado] = useState("");
  const reset = () => { setFile(null); setBorrador(vacio); setAnalizado(false); setConfirmado(false); setDuplicado(false); setMensajeDuplicado(""); };
  const analizar = useMutation({
    mutationFn: async () => {
      if (!file || !file.size || file.size > 15 * 1024 * 1024) throw new Error("Selecciona un PDF no vacío de hasta 15 MB.");
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Este comprobante solo acepta PDF.");
      const nombre = validarNombreSiga(file.name, "OTD");
      if (!nombre.ok) throw new Error(nombre.error);
      if (nombre.advertencia) toast.warning(nombre.advertencia);
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const res = await extraer({ data: { filename: file.name, mime: "application/pdf", base64: btoa(binary), pago_puerto: true } });
      if (!res.pago_puerto) throw new Error("No se obtuvieron datos del comprobante.");
      return res.pago_puerto;
    },
    onSuccess: (p) => {
      const tipo = p.confianza === "alta" ? p.tipo ?? "" : "";
      setBorrador({ tipo, monto: p.monto === null ? "" : String(p.monto), moneda: p.moneda ?? "", fecha: p.fecha ?? "", referencia: p.referencia ?? "", concepto: tipo ? conceptoPagoPuerto(tipo, p.referencia ?? "") : "" });
      setAnalizado(true);
    }, onError: (e) => toast.error(e.message),
  });
  const guardar = useMutation({
    mutationFn: async () => {
      if (!file || !confirmado) throw new Error("Revisa y confirma los datos antes de guardar.");
      return guardarComprobantePuerto(expedienteId, file, borrador, duplicado);
    },
    onSuccess: (r) => {
      for (const key of ["documentos", "costos_producto", "costos-producto-liq", "ecf-vinculada"]) qc.invalidateQueries({ queryKey: [key, expedienteId] });
      qc.invalidateQueries({ queryKey: ["facturas-ecf"] });
      qc.invalidateQueries({ queryKey: ["facturas-ecf-lite"] });
      qc.invalidateQueries({ queryKey: ["factura-ecf-edit"] });
      if (r.aviso) toast.warning(r.aviso, { duration: 12000 }); else toast.success(`Costo guardado y PDF vinculado · ${r.codigo}`);
      setOpen(false); reset();
    }, onError: (e) => { toast.error(e.message); if (e.message.includes("El archivo ya está cargado")) setMensajeDuplicado(e.message); },
  });
  const pendiente = analizar.isPending || guardar.isPending;
  const editar = (values: Partial<BorradorPagoPuerto>) => { setBorrador((p) => ({ ...p, ...values })); setConfirmado(false); };
  return <>
    <Button size="sm" variant="outline" onClick={() => { reset(); setOpen(true); }}><Sparkles className="h-4 w-4 mr-1" />Escanear pago</Button>
    <Dialog open={open} onOpenChange={(v) => { if (!pendiente) { setOpen(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Escanear pago de importación</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="pago-pdf">Comprobante PDF (máx. 15 MB)</Label><Input id="pago-pdf" type="file" accept="application/pdf,.pdf" disabled={pendiente} onChange={(e) => { reset(); setFile(e.target.files?.[0] ?? null); }} /></div>
          {!analizado && <Button disabled={!file || pendiente} onClick={() => analizar.mutate()}>{analizar.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}{analizar.isPending ? "Analizando…" : "Extraer datos"}</Button>}
          {analizado && <fieldset disabled={pendiente} className="grid gap-3">
            <div className="flex gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-4 w-4 shrink-0" />Verifica los datos sugeridos por IA antes de guardar.</div>
            {!borrador.tipo && <div className="text-sm text-destructive">No se determinó el tipo con certeza. Selecciona la casilla correcta.</div>}
            <div className="grid gap-1.5"><Label>Tipo de pago</Label><Select disabled={pendiente} value={borrador.tipo} onValueChange={(tipo: TipoPagoPuerto) => editar({ tipo, concepto: conceptoPagoPuerto(tipo, borrador.referencia) })}><SelectTrigger aria-label="Tipo de pago"><SelectValue placeholder="Seleccionar tipo de pago" /></SelectTrigger><SelectContent><SelectItem value="almacenaje">Almacenaje</SelectItem><SelectItem value="contenedor">Depósito / Pago de Contenedor</SelectItem><SelectItem value="gestion_aduanal">Factura de Gestión Aduanal</SelectItem><SelectItem value="cargos_locales">Pago de Cargos Locales</SelectItem></SelectContent></Select></div>
            <div className="grid gap-1.5"><Label htmlFor="pago-concepto">Concepto</Label><Input id="pago-concepto" value={borrador.concepto} onChange={(e) => editar({ concepto: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>{borrador.tipo === "gestion_aduanal" ? "Monto total facturado" : "Monto total pagado"}</Label><ImporteLiquidacionInput aria-label="Monto total pagado" value={borrador.monto} onValueChange={(monto) => editar({ monto })} /></div>
              <div className="grid gap-1.5"><Label>Moneda</Label><Select disabled={pendiente} value={borrador.moneda} onValueChange={(moneda) => editar({ moneda })}><SelectTrigger aria-label="Moneda del pago"><SelectValue placeholder="Confirmar moneda" /></SelectTrigger><SelectContent><SelectItem value="DOP">RD$</SelectItem><SelectItem value="USD">US$</SelectItem></SelectContent></Select></div>
              <div className="grid gap-1.5"><Label htmlFor="pago-fecha">{borrador.tipo === "gestion_aduanal" ? "Fecha de factura" : "Fecha de pago"}</Label><Input id="pago-fecha" type="date" value={borrador.fecha} onChange={(e) => editar({ fecha: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label htmlFor="pago-pin">{borrador.tipo === "gestion_aduanal" ? "N° de factura / NCF" : "PIN / Referencia"}</Label><Input id="pago-pin" value={borrador.referencia} onChange={(e) => editar({ referencia: e.target.value })} /></div>
            </div>
            {borrador.tipo && <div className="text-xs text-muted-foreground">{borrador.tipo === "gestion_aduanal" ? "PDF de Factura e-CF en Finanzas · Reemplaza el adjunto de la factura correspondiente; si no existe, se guardará solo el costo y se avisará." : `Documento recibido: ${documentoPagoPuerto(borrador.tipo)} · Reemplaza el PDF existente en esa casilla.`}</div>}
            {mensajeDuplicado && <label className="flex gap-2 text-xs"><Checkbox checked={duplicado} onCheckedChange={(v) => setDuplicado(v === true)} />{mensajeDuplicado}</label>}
            <label className="flex items-center gap-2 text-sm"><Checkbox aria-label="Confirmo el monto y los datos del pago" checked={confirmado} onCheckedChange={(v) => setConfirmado(v === true)} />Confirmo el monto y los datos del pago</label>
          </fieldset>}
        </div>
        <DialogFooter><Button variant="outline" disabled={pendiente} onClick={() => { setOpen(false); reset(); }}>Cancelar</Button>{analizado && <Button disabled={pendiente || !confirmado || !borrador.tipo || !borrador.moneda || !borrador.monto || (Boolean(mensajeDuplicado) && !duplicado)} onClick={() => guardar.mutate()}>{guardar.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Guardar costo y documento</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}