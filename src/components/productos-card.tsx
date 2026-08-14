import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CatalogCombobox } from "@/components/catalog-combobox";
import { DgaProductoSearch } from "@/components/dga-producto-search";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type ProductosTabla = "cotizacion_productos" | "orden_productos" | "solicitud_productos";

const PARENT_COL: Record<ProductosTabla, string> = {
  cotizacion_productos: "cotizacion_id",
  orden_productos: "orden_id",
  solicitud_productos: "solicitud_id",
};

const emptyForm = {
  codigo_arancelario: "", detalle_producto: "", unidad_medida: "", unidad_codigo: "",
  cantidad: "", peso: "", valor_fob: "",
  product_code: "", cod_marca: "", marca: "", cod_modelo: "", modelo: "", especificaciones: "",
};

export function ProductosCard({
  tabla,
  parentId,
  readOnly = false,
  items: itemsProp,
  onItemsChange,
}: {
  tabla: ProductosTabla;
  parentId?: string;
  readOnly?: boolean;
  /** Modo borrador: líneas en memoria (aún sin registro padre en la base). */
  items?: any[];
  onItemsChange?: (items: any[]) => void;
}) {
  const local = !!onItemsChange;
  const qc = useQueryClient();
  const parentCol = PARENT_COL[tabla];
  const queryKey = [tabla, parentId];

  const { data: remoteItems } = useQuery({
    queryKey,
    enabled: !local && !!parentId,
    queryFn: async () =>
      (await (supabase.from(tabla) as any).select("*").eq(parentCol, parentId).is("deleted_at", null).order("item_no")).data ?? [],
  });

  const items = local ? (itemsProp ?? []) : (remoteItems ?? []);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [f, setF] = useState(emptyForm);

  const invalidate = () => qc.invalidateQueries({ queryKey });
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalFob = (items as any[]).reduce((s, it) => s + (Number(it.valor_fob) || 0), 0);

  const buildPayload = () => ({
    codigo_arancelario: f.codigo_arancelario.trim() || null,
    detalle_producto: f.detalle_producto || null,
    unidad_medida: f.unidad_medida || null,
    unidad_codigo: f.unidad_codigo || null,
    cantidad: f.cantidad === "" ? 0 : Number(f.cantidad),
    peso: f.peso === "" ? 0 : Number(f.peso),
    valor_fob: f.valor_fob === "" ? 0 : Number(f.valor_fob),
    product_code: f.product_code?.trim() || null,
    cod_marca: f.cod_marca?.trim() || null,
    marca: f.marca?.trim() || null,
    cod_modelo: f.cod_modelo?.trim() || null,
    modelo: f.modelo?.trim() || null,
    especificaciones: f.especificaciones?.trim() || null,
  });

  const renumerar = (arr: any[]) => arr.map((it, i) => ({ ...it, item_no: i + 1 }));

  const guardar = useMutation({
    mutationFn: async () => {
      const payload: any = buildPayload();
      if (local) {
        const arr = items as any[];
        const next = editingId
          ? arr.map((it) => (it.id === editingId ? { ...it, ...payload } : it))
          : [...arr, { ...payload, id: crypto.randomUUID() }];
        onItemsChange!(renumerar(next));
        return;
      }
      if (editingId) {
        const { error } = await (supabase.from(tabla) as any).update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const nextNo = (items as any[]).reduce((m, it) => Math.max(m, it.item_no || 0), 0) + 1;
        const { error } = await (supabase.from(tabla) as any).insert({ ...payload, [parentCol]: parentId, item_no: nextNo });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Producto actualizado" : "Producto agregado");
      setOpen(false); setEditingId(null); setF(emptyForm);
      if (!local) invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      if (local) {
        onItemsChange!(renumerar((items as any[]).filter((it) => it.id !== id)));
        return;
      }
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await (supabase.from(tabla) as any)
        .update({ deleted_at: new Date().toISOString(), deleted_by: userRes.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Producto eliminado"); if (!local) invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });


  const startNew = () => { setEditingId(null); setF(emptyForm); setOpen(true); };
  const startEdit = (it: any) => {
    setEditingId(it.id);
    setF({
      codigo_arancelario: it.codigo_arancelario ?? "",
      detalle_producto: it.detalle_producto ?? "",
      unidad_medida: it.unidad_medida ?? "",
      unidad_codigo: it.unidad_codigo ?? "",
      cantidad: it.cantidad != null ? String(it.cantidad) : "",
      peso: it.peso != null ? String(it.peso) : "",
      valor_fob: it.valor_fob != null ? String(it.valor_fob) : "",
      product_code: it.product_code ?? "",
      cod_marca: it.cod_marca ?? "",
      marca: it.marca ?? "",
      cod_modelo: it.cod_modelo ?? "",
      modelo: it.modelo ?? "",
      especificaciones: it.especificaciones ?? "",
    });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Detalle de Productos</CardTitle>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={startNew}><Plus className="h-4 w-4 mr-1" />Agregar producto</Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/50 text-[10.5px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left w-10">No.</th>
                <th className="px-2 py-2 text-left">Cód. Arancelario</th>
                <th className="px-2 py-2 text-left">Detalle</th>
                <th className="px-2 py-2 text-left">Unidad</th>
                <th className="px-2 py-2 text-right">Cantidad</th>
                <th className="px-2 py-2 text-right">Peso</th>
                <th className="px-2 py-2 text-right">Valor FOB</th>
                <th className="px-2 py-2 text-left">Marca</th>
                <th className="px-2 py-2 text-left">Modelo</th>
                {!readOnly && <th className="px-2 py-2 w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {((items ?? []) as any[]).length === 0 ? (
                <tr><td colSpan={readOnly ? 9 : 10} className="px-3 py-6 text-center text-xs text-muted-foreground">Sin productos.</td></tr>
              ) : ((items ?? []) as any[]).map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="px-2 py-2 tabular-nums text-muted-foreground">{it.item_no}</td>
                  <td className="px-2 py-2 font-mono text-xs">{it.codigo_arancelario || "—"}</td>
                  <td className="px-2 py-2 max-w-[240px] truncate" title={it.detalle_producto || ""}>{it.detalle_producto || "—"}</td>
                  <td className="px-2 py-2 text-xs">{it.unidad_medida || "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(it.cantidad || 0).toLocaleString("en-US")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(it.peso || 0).toLocaleString("en-US")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(Number(it.valor_fob || 0))}</td>
                  <td className="px-2 py-2 text-xs">{it.marca || "—"}</td>
                  <td className="px-2 py-2 text-xs">{it.modelo || "—"}</td>
                  {!readOnly && (
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => eliminar.mutate(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {((items ?? []) as any[]).length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={6} className="px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Total FOB</td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold">{fmt(totalFob)}</td>
                  <td colSpan={readOnly ? 2 : 3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(emptyForm); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Editar producto" : "Nuevo producto"}</DialogTitle></DialogHeader>
          <div className="rounded-md border bg-muted/30 p-3">
            <DgaProductoSearch
              onSelect={(p, reusarCodigo) => {
                setF((prev) => ({
                  ...prev,
                  product_code: reusarCodigo ? (p.codigo_producto ?? "") : "",
                  codigo_arancelario: prev.codigo_arancelario || (p.partida_arancelaria ?? ""),
                  detalle_producto: prev.detalle_producto || (p.nombre_producto ?? ""),
                  cod_marca: p.cod_marca ?? "",
                  marca: p.marca ?? "",
                  cod_modelo: p.cod_modelo ?? "",
                  modelo: p.modelo ?? "",
                  especificaciones: p.especificaciones ?? "",
                  unidad_medida: prev.unidad_medida || (p.unidad ?? ""),
                }));
                toast.success(reusarCodigo ? "Producto copiado con su ProductCode" : "Datos copiados del histórico");
              }}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Código Arancelario</Label>
              <Input value={f.codigo_arancelario} onChange={(e) => setF({ ...f, codigo_arancelario: e.target.value })} placeholder="0402.10.90" />
            </div>
            <div className="grid gap-1.5">
              <Label>Unidad de Medida</Label>
              <CatalogCombobox
                table="catalogo_unidades"
                value={f.unidad_medida}
                codigo={f.unidad_codigo}
                onChange={(nombre, codigo) => setF({ ...f, unidad_medida: nombre, unidad_codigo: codigo })}
                placeholder="Selecciona unidad (catálogo DGA)"
              />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Detalle del Producto</Label>
              <Textarea rows={2} value={f.detalle_producto} onChange={(e) => setF({ ...f, detalle_producto: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Cantidad</Label>
              <Input type="text" inputMode="decimal" value={f.cantidad} onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, cantidad: v }); }} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label>Peso</Label>
              <Input type="text" inputMode="decimal" value={f.peso} onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, peso: v }); }} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label>Valor FOB (US$)</Label>
              <Input type="text" inputMode="decimal" value={f.valor_fob}
                onChange={(e) => { const v = e.target.value.replace(/,/g, ""); if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) setF({ ...f, valor_fob: v }); }}
                onBlur={(e) => { const v = e.target.value; if (v !== "" && !isNaN(Number(v))) setF({ ...f, valor_fob: Number(v).toFixed(2) }); }}
                placeholder="0.00" />
            </div>
            <div className="md:col-span-2 border-t pt-3 mt-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Datos del producto (SIGA)</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5"><Label>ProductCode</Label><Input value={f.product_code} onChange={(e) => setF({ ...f, product_code: e.target.value })} placeholder="Vacío = SIGA asigna uno nuevo" /></div>
                <div className="grid gap-1.5"><Label>Cód. Marca</Label><Input value={f.cod_marca} onChange={(e) => setF({ ...f, cod_marca: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Marca</Label><Input value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Cód. Modelo</Label><Input value={f.cod_modelo} onChange={(e) => setF({ ...f, cod_modelo: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Modelo</Label><Input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} /></div>
                <div className="grid gap-1.5 md:col-span-2"><Label>Especificaciones</Label><Textarea rows={2} value={f.especificaciones} onChange={(e) => setF({ ...f, especificaciones: e.target.value })} /></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>{guardar.isPending ? "Guardando…" : (editingId ? "Actualizar" : "Agregar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
