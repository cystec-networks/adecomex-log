import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  TIPOS_COMPROBANTE, type LineaInput, calcLinea, calcTotales, fmtRD,
} from "@/lib/facturas-ecf";

export type FacturaEcfFormPreload = {
  cliente_id?: string | null;
  encf?: string;
  monto_total?: number;
  tipo_comprobante?: string;
};

/**
 * Diálogo de creación de Factura e-CF.
 * Registra un comprobante que YA fue timbrado en la Oficina Virtual de la DGII.
 */
export function FacturaEcfFormDialog({
  open,
  onOpenChange,
  onCreated,
  preload,
  title = "Registrar Factura e-CF",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
  preload?: FacturaEcfFormPreload;
  title?: string;
}) {
  const qc = useQueryClient();
  const { data: clientes } = useQuery({
    queryKey: ["clientes-lite-ecf"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre,rnc").order("nombre")).data ?? [],
  });

  const [encf, setEncf] = useState(preload?.encf ?? "");
  const [tipo, setTipo] = useState(preload?.tipo_comprobante ?? "31");
  const [fechaEmision, setFechaEmision] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fechaVenc, setFechaVenc] = useState<string>("");
  const [codigoSeguridad, setCodigoSeguridad] = useState("");
  const [fechaFirma, setFechaFirma] = useState<string>("");
  const [clienteId, setClienteId] = useState<string>(preload?.cliente_id ?? "");
  const [notas, setNotas] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [itbisRetenidoTerceros, setItbisRetenidoTerceros] = useState<string>("");
  const [itbisPercibidoVenta, setItbisPercibidoVenta] = useState<string>("");
  const [retencionRentaTerceros, setRetencionRentaTerceros] = useState<string>("");
  const [isrPercibidoVenta, setIsrPercibidoVenta] = useState<string>("");

  const [lineas, setLineas] = useState<LineaInput[]>(() => {
    if (preload?.monto_total && preload.monto_total > 0) {
      const bruto = preload.monto_total / 1.18;
      const itbis = preload.monto_total - bruto;
      return [{
        cantidad: 1, descripcion: "Servicios de gestión aduanal",
        unidad: "UND", precio: +bruto.toFixed(2), itbis: +itbis.toFixed(2),
        descuento: 0, recargo: 0, gravado: true,
      }];
    }
    return [{ cantidad: 1, descripcion: "", unidad: "UND", precio: 0, itbis: 0, descuento: 0, recargo: 0, gravado: true }];
  });

  const totales = useMemo(() => calcTotales(lineas), [lineas]);

  const cliente = (clientes ?? []).find((c) => c.id === clienteId);

  const save = useMutation({
    mutationFn: async () => {
      if (!encf.trim()) throw new Error("El e-NCF es obligatorio");
      if (!clienteId) throw new Error("Selecciona el cliente");
      const { data: u } = await supabase.auth.getUser();
      let pdf_url: string | null = null;
      const { data, error } = await supabase.from("facturas_ecf").insert({
        encf: encf.trim().toUpperCase(),
        tipo_comprobante: tipo,
        fecha_emision: fechaEmision,
        fecha_vencimiento_ncf: fechaVenc || null,
        codigo_seguridad: codigoSeguridad || null,
        fecha_firma: fechaFirma ? new Date(fechaFirma).toISOString() : null,
        cliente_id: clienteId,
        cliente_razon_social: cliente?.nombre ?? null,
        cliente_rnc: cliente?.rnc ?? null,
        subtotal_gravado: totales.subtotal_gravado,
        subtotal_exento: totales.subtotal_exento,
        total_itbis: totales.total_itbis,
        monto_total: totales.monto_total,
        notas: notas || null,
        pdf_url,
        itbis_retenido_terceros: Number(itbisRetenidoTerceros) || 0,
        itbis_percibido_venta: Number(itbisPercibidoVenta) || 0,
        retencion_renta_terceros: Number(retencionRentaTerceros) || 0,
        isr_percibido_venta: Number(isrPercibidoVenta) || 0,
        created_by: u.user?.id ?? null,
      }).select().single();
      if (error) throw error;

      if (pdfFile) {
        const path = `facturas-ecf/${data.id}/${pdfFile.name}`;
        const { error: upErr } = await supabase.storage.from("documentos").upload(path, pdfFile, { upsert: true });
        if (!upErr) {
          await supabase.from("facturas_ecf").update({ pdf_url: path }).eq("id", data.id);
        }
      }

      const lineasPayload = lineas.map((l, i) => ({
        factura_id: data.id,
        orden: i + 1,
        cantidad: l.cantidad,
        descripcion: l.descripcion || "—",
        unidad: l.unidad || null,
        precio: l.precio,
        itbis: l.itbis,
        descuento: l.descuento,
        recargo: l.recargo,
        valor: calcLinea(l),
        gravado: l.gravado,
      }));
      const { error: lErr } = await supabase.from("facturas_ecf_lineas").insert(lineasPayload);
      if (lErr) throw lErr;

      return data;
    },
    onSuccess: (row) => {
      toast.success("Factura e-CF registrada");
      qc.invalidateQueries({ queryKey: ["facturas-ecf"] });
      qc.invalidateQueries({ queryKey: ["facturas-ecf-lite"] });
      qc.invalidateQueries({ queryKey: ["ecf-pendientes"] });
      onOpenChange(false);
      onCreated?.(row.id);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo registrar la factura"),
  });

  const setLinea = (i: number, patch: Partial<LineaInput>) =>
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLinea = () =>
    setLineas((prev) => [...prev, { cantidad: 1, descripcion: "", unidad: "UND", precio: 0, itbis: 0, descuento: 0, recargo: 0, gravado: true }]);
  const removeLinea = (i: number) =>
    setLineas((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Este registro es solo para control interno. El e-NCF, la firma digital y el código de seguridad deben provenir de un comprobante ya validado por la Oficina Virtual de la DGII.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            En caso de discrepancia con el comprobante emitido por la DGII, el documento oficial prevalece.
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>e-NCF *</Label>
            <Input value={encf} onChange={(e) => setEncf(e.target.value)} placeholder="E310000000001" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de Comprobante *</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_COMPROBANTE.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de Emisión *</Label>
            <Input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Vencimiento del NCF</Label>
            <Input type="date" value={fechaVenc} onChange={(e) => setFechaVenc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Código de Seguridad</Label>
            <Input value={codigoSeguridad} onChange={(e) => setCodigoSeguridad(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha/Hora de Firma Digital</Label>
            <Input type="datetime-local" value={fechaFirma} onChange={(e) => setFechaFirma(e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Cliente *</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger>
              <SelectContent>
                {(clientes ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre} {c.rnc ? `— RNC ${c.rnc}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>PDF (opcional)</Label>
            <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Líneas de Factura</h3>
            <Button size="sm" variant="outline" onClick={addLinea}><Plus className="h-3.5 w-3.5" /> Agregar</Button>
          </div>
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1.5">Cant.</th>
                  <th className="text-left px-2">Descripción</th>
                  <th className="text-left px-2">Unidad</th>
                  <th className="text-right px-2">Precio</th>
                  <th className="text-right px-2">ITBIS</th>
                  <th className="text-right px-2">Desc.</th>
                  <th className="text-right px-2">Recargo</th>
                  <th className="text-center px-2">Grav.</th>
                  <th className="text-right px-2">Valor</th>
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1"><Input className="h-8 w-16" type="number" value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: +e.target.value || 0 })} /></td>
                    <td className="p-1"><Input className="h-8" value={l.descripcion} onChange={(e) => setLinea(i, { descripcion: e.target.value })} /></td>
                    <td className="p-1"><Input className="h-8 w-20" value={l.unidad} onChange={(e) => setLinea(i, { unidad: e.target.value })} /></td>
                    <td className="p-1"><Input className="h-8 w-24 text-right" type="number" value={l.precio} onChange={(e) => setLinea(i, { precio: +e.target.value || 0 })} /></td>
                    <td className="p-1"><Input className="h-8 w-24 text-right" type="number" value={l.itbis} onChange={(e) => setLinea(i, { itbis: +e.target.value || 0 })} /></td>
                    <td className="p-1"><Input className="h-8 w-20 text-right" type="number" value={l.descuento} onChange={(e) => setLinea(i, { descuento: +e.target.value || 0 })} /></td>
                    <td className="p-1"><Input className="h-8 w-20 text-right" type="number" value={l.recargo} onChange={(e) => setLinea(i, { recargo: +e.target.value || 0 })} /></td>
                    <td className="p-1 text-center">
                      <input type="checkbox" checked={l.gravado} onChange={(e) => setLinea(i, { gravado: e.target.checked })} />
                    </td>
                    <td className="p-1 text-right font-medium">{fmtRD(calcLinea(l))}</td>
                    <td className="p-1">
                      <button className="text-muted-foreground hover:text-destructive" onClick={() => removeLinea(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
          <div className="text-sm">
            <div className="text-muted-foreground">Subtotal gravado</div>
            <div className="font-semibold">{fmtRD(totales.subtotal_gravado)}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground">Subtotal exento</div>
            <div className="font-semibold">{fmtRD(totales.subtotal_exento)}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground">ITBIS</div>
            <div className="font-semibold">{fmtRD(totales.total_itbis)}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground">MONTO TOTAL</div>
            <div className="font-bold text-lg text-primary">{fmtRD(totales.monto_total)}</div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Notas</Label>
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Guardando…" : "Registrar factura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Selector de e-CF con opción de crear una nueva al vuelo.
 */
export function FacturaEcfSelector({
  value,
  onChange,
  preload,
  className,
}: {
  value: string | null | undefined;
  onChange: (id: string | null, factura?: any) => void;
  preload?: FacturaEcfFormPreload;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: facturas } = useQuery({
    queryKey: ["facturas-ecf-lite"],
    queryFn: async () => (await supabase
      .from("facturas_ecf")
      .select("id,encf,cliente_razon_social,monto_total,fecha_emision,tipo_comprobante,cliente_id")
      .is("eliminado_en", null)
      .order("fecha_emision", { ascending: false })
      .limit(500)
    ).data ?? [],
  });

  const selected = (facturas ?? []).find((f) => f.id === value);

  return (
    <div className={`flex gap-1 items-center ${className ?? ""}`}>
      <Select
        value={value ?? "__none__"}
        onValueChange={(v) => {
          if (v === "__none__") return onChange(null);
          const f = (facturas ?? []).find((x) => x.id === v);
          onChange(v, f);
        }}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Vincular factura e-CF…">
            {selected
              ? `${selected.encf} · ${selected.cliente_razon_social ?? ""} · ${fmtRD(selected.monto_total)}`
              : "Vincular factura e-CF…"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Sin vincular —</SelectItem>
          {(facturas ?? []).map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.encf} · {f.cliente_razon_social ?? "—"} · {fmtRD(f.monto_total)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Nueva
      </Button>
      <FacturaEcfFormDialog
        open={open}
        onOpenChange={setOpen}
        preload={preload}
        onCreated={(id) => onChange(id)}
      />
      {selected && (
        <Badge variant="outline" className="text-[10px]">{selected.tipo_comprobante}</Badge>
      )}
    </div>
  );
}
