import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileText, Plus, Trash2, Pencil } from "lucide-react";
import { fmtLocalDate } from "@/lib/dates";
import { useMyRoles } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/admin/cotizaciones-servicios")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Cotizaciones de Servicios | ADECOMEX" },
      { name: "description", content: "Tarifario y cotizaciones de servicios propios: honorarios aduanales, permisos y transporte terrestre." },
      { property: "og:title", content: "Cotizaciones de Servicios | ADECOMEX" },
      { property: "og:description", content: "Gestiona el tarifario de servicios y emite cotizaciones de honorarios en PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CotizacionesServiciosPage,
});

const MONEDAS = ["DOP", "USD", "EUR"];
const ESTADOS = ["borrador", "enviada", "aceptada", "rechazada", "vencida"] as const;
const ESTADO_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  borrador: "outline",
  enviada: "secondary",
  aceptada: "default",
  rechazada: "destructive",
  vencida: "outline",
};

const nf = (n: number) =>
  (Number(n) || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Tarifa = {
  id: string;
  codigo: string | null;
  servicio: string;
  categoria: string | null;
  tarifa: number;
  moneda: string;
  unidad: string;
  descripcion: string | null;
  activo: boolean;
};

type Linea = {
  id?: string;
  orden: number;
  codigo: string;
  servicio: string;
  descripcion: string;
  cantidad: number;
  tarifa_unitaria: number;
  moneda: string;
  gravado: boolean;
};

const ITBIS_PCT = 0.18;

function CotizacionesServiciosPage() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Cotizaciones de Servicios</h1>
        <p className="text-sm text-muted-foreground">
          Tarifario y cotizaciones de los servicios propios de ADECOMEX (honorarios, permisos, transporte).
        </p>
      </div>
      <Tabs defaultValue="cotizaciones">
        <TabsList>
          <TabsTrigger value="cotizaciones">Cotizaciones</TabsTrigger>
          <TabsTrigger value="tarifario">Tarifario</TabsTrigger>
        </TabsList>
        <TabsContent value="cotizaciones" className="mt-4">
          <CotizacionesTab />
        </TabsContent>
        <TabsContent value="tarifario" className="mt-4">
          <TarifarioTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────────── Tarifario ───────────────────────── */

function TarifarioTab() {
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const puedeEditar = !!roles?.some((r) => r === "admin" || r === "finanzas");
  const [cat, setCat] = useState("__all__");
  const [soloActivos, setSoloActivos] = useState(true);
  const [edit, setEdit] = useState<Partial<Tarifa> | null>(null);

  const { data: tarifas } = useQuery({
    queryKey: ["tarifas-servicios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_tarifas_servicios").select("*").order("servicio");
      if (error) throw error;
      return (data ?? []) as Tarifa[];
    },
  });

  const categorias = useMemo(
    () => Array.from(new Set((tarifas ?? []).map((t) => t.categoria).filter(Boolean) as string[])).sort(),
    [tarifas],
  );

  const filas = (tarifas ?? []).filter(
    (t) => (cat === "__all__" || t.categoria === cat) && (!soloActivos || t.activo),
  );

  const guardar = useMutation({
    mutationFn: async (t: Partial<Tarifa>) => {
      const payload = {
        codigo: t.codigo || null,
        servicio: (t.servicio ?? "").trim(),
        categoria: t.categoria || null,
        tarifa: Number(t.tarifa) || 0,
        moneda: t.moneda ?? "DOP",
        unidad: t.unidad || "Por gestión",
        descripcion: t.descripcion || null,
        activo: t.activo ?? true,
      };
      if (!payload.servicio) throw new Error("El servicio es obligatorio");
      const { error } = t.id
        ? await supabase.from("catalogo_tarifas_servicios").update(payload).eq("id", t.id)
        : await supabase.from("catalogo_tarifas_servicios").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarifa guardada");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["tarifas-servicios"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });

  const toggleActivo = useMutation({
    mutationFn: async (t: Tarifa) => {
      const { error } = await supabase
        .from("catalogo_tarifas_servicios").update({ activo: !t.activo }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarifas-servicios"] }),
    onError: (e: any) => toast.error(e.message ?? "No se pudo actualizar"),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-base">Tarifario de servicios</CardTitle>
        <div className="flex items-end gap-3 flex-wrap">
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las categorías</SelectItem>
              {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="solo-activos" checked={soloActivos} onCheckedChange={setSoloActivos} />
            <Label htmlFor="solo-activos" className="text-xs">Solo activos</Label>
          </div>
          {puedeEditar && (
            <Button size="sm" onClick={() => setEdit({ moneda: "DOP", unidad: "Por gestión", activo: true, tarifa: 0 })}>
              <Plus className="h-4 w-4 mr-1" /> Nueva tarifa
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Código</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Tarifa</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Estado</TableHead>
              {puedeEditar && <TableHead className="w-28" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin tarifas</TableCell></TableRow>
            )}
            {filas.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.servicio}</TableCell>
                <TableCell>{t.categoria ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{nf(t.tarifa)}</TableCell>
                <TableCell>{t.moneda}</TableCell>
                <TableCell>{t.unidad}</TableCell>
                <TableCell>
                  <Badge variant={t.activo ? "default" : "outline"}>{t.activo ? "Activo" : "Inactivo"}</Badge>
                </TableCell>
                {puedeEditar && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActivo.mutate(t)}>
                      {t.activo ? "Desactivar" : "Activar"}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar tarifa" : "Nueva tarifa"}</DialogTitle>
            <DialogDescription>Define el servicio y su tarifa de referencia.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Servicio</Label>
                <Input value={edit.servicio ?? ""} onChange={(e) => setEdit({ ...edit, servicio: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Categoría</Label>
                  <Input value={edit.categoria ?? ""} onChange={(e) => setEdit({ ...edit, categoria: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Unidad</Label>
                  <Input value={edit.unidad ?? ""} onChange={(e) => setEdit({ ...edit, unidad: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Tarifa</Label>
                  <Input type="number" step="0.01" value={edit.tarifa ?? 0}
                    onChange={(e) => setEdit({ ...edit, tarifa: Number(e.target.value) })} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Moneda</Label>
                  <Select value={edit.moneda ?? "DOP"} onValueChange={(v) => setEdit({ ...edit, moneda: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONEDAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Descripción</Label>
                <Textarea rows={2} value={edit.descripcion ?? ""} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={() => edit && guardar.mutate(edit)} disabled={guardar.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ───────────────────────── Cotizaciones ───────────────────────── */

function CotizacionesTab() {
  const qc = useQueryClient();
  const [nueva, setNueva] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const docRef = useRef<any>(null);
  const fileNameRef = useRef("Cotizacion.pdf");

  const { data: clientes } = useQuery({
    queryKey: ["clientes-lite-cotserv"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre,rnc").order("nombre")).data ?? [],
  });

  const { data: cotizaciones } = useQuery({
    queryKey: ["cotizaciones-servicios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cotizaciones_servicios")
        .select("*, cotizaciones_servicios_lineas(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: string }) => {
      const { error } = await supabase.from("cotizaciones_servicios").update({ estado }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado actualizado");
      qc.invalidateQueries({ queryKey: ["cotizaciones-servicios"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo actualizar"),
  });

  const totalPorMoneda = (lineas: any[]) => {
    const acc: Record<string, number> = {};
    for (const l of lineas ?? []) acc[l.moneda] = (acc[l.moneda] ?? 0) + Number(l.subtotal || 0);
    return acc;
  };

  const cerrarPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    docRef.current = null;
  };

  const generarPdf = async (c: any) => {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const cliente = (clientes ?? []).find((x: any) => x.id === c.cliente_id);
    const lineas = [...(c.cotizaciones_servicios_lineas ?? [])].sort((a: any, b: any) => a.orden - b.orden);

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 32;

    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("ADECOMEX SRL — Gestión y Logística", M, 40);
    doc.setFontSize(11);
    doc.text("COTIZACIÓN DE SERVICIOS", M, 58);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
    doc.text(`No. ${c.numero}   |   Fecha: ${fmtLocalDate(c.fecha)}`, M, 72);
    doc.text(
      `Cliente: ${cliente?.nombre ?? "—"}${cliente?.rnc ? `   |   RNC: ${cliente.rnc}` : ""}`,
      M, 84,
    );
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 98,
      head: [["Servicio", "Descripción", "Cant.", "Tarifa", "Moneda", "Subtotal"]],
      body: lineas.map((l: any) => [
        l.servicio, l.descripcion ?? "—", nf(l.cantidad), nf(l.tarifa_unitaria), l.moneda, nf(l.subtotal),
      ]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 5: { halign: "right" } },
      margin: { left: M, right: M },
    });

    let y = (doc as any).lastAutoTable.finalY + 14;
    const totales = totalPorMoneda(lineas);
    autoTable(doc, {
      startY: y,
      head: [["Total", "Monto"]],
      body: Object.entries(totales).map(([m, v]) => [m, nf(v)]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4, fontStyle: "bold" },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      columnStyles: { 0: { cellWidth: 120 }, 1: { halign: "right" } },
      tableWidth: 260,
      margin: { left: pageW - M - 260, right: M },
    });

    y = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(8); doc.setTextColor(60);
    doc.text(`Vigencia: ${c.fecha_vigencia ? fmtLocalDate(c.fecha_vigencia) : "—"}`, M, y);
    if (c.notas) { y += 12; doc.text(`Notas: ${c.notas}`, M, y, { maxWidth: pageW - M * 2 }); }
    y += 22;
    doc.setFontSize(7.5); doc.setTextColor(110);
    doc.text(
      "Tarifas sujetas a cambio sin previo aviso. Cotización válida hasta la fecha de vigencia indicada.",
      M, Math.min(y, pageH - 40), { maxWidth: pageW - M * 2 },
    );
    doc.setTextColor(0);

    fileNameRef.current = `${c.numero}.pdf`;
    docRef.current = doc;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(doc.output("bloburl").toString());
  };

  const editando = (cotizaciones ?? []).find((c: any) => c.id === editId) ?? null;

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="text-base">Cotizaciones emitidas</CardTitle>
        <Button size="sm" onClick={() => { setEditId(null); setNueva(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nueva cotización
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-56" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(cotizaciones ?? []).length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin cotizaciones</TableCell></TableRow>
            )}
            {(cotizaciones ?? []).map((c: any) => {
              const tot = totalPorMoneda(c.cotizaciones_servicios_lineas ?? []);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.numero}</TableCell>
                  <TableCell>{(clientes ?? []).find((x: any) => x.id === c.cliente_id)?.nombre ?? "—"}</TableCell>
                  <TableCell>{fmtLocalDate(c.fecha)}</TableCell>
                  <TableCell>{c.fecha_vigencia ? fmtLocalDate(c.fecha_vigencia) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Object.keys(tot).length === 0
                      ? "—"
                      : Object.entries(tot).map(([m, v]) => <div key={m}>{m} {nf(v)}</div>)}
                  </TableCell>
                  <TableCell>
                    <Select value={c.estado} onValueChange={(v) => cambiarEstado.mutate({ id: c.id, estado: v })}>
                      <SelectTrigger className="w-36 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => { setEditId(c.id); setNueva(true); }}>
                      <Pencil className="h-4 w-4 mr-1" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => generarPdf(c)}>
                      <FileText className="h-4 w-4 mr-1" /> PDF
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      {nueva && (
        <CotizacionDialog
          open={nueva}
          cotizacion={editando}
          clientes={clientes ?? []}
          onClose={() => { setNueva(false); setEditId(null); }}
        />
      )}

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) cerrarPreview(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="text-base">Vista previa — Cotización de Servicios</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {previewUrl && <iframe src={previewUrl} title="Cotización de Servicios" className="w-full h-full border-0" />}
          </div>
          <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => docRef.current?.save(fileNameRef.current)}>
              <FileText className="h-4 w-4 mr-1" /> Descargar
            </Button>
            <Button size="sm" onClick={cerrarPreview}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function CotizacionDialog({
  open, cotizacion, clientes, onClose,
}: { open: boolean; cotizacion: any | null; clientes: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [clienteId, setClienteId] = useState<string>(cotizacion?.cliente_id ?? "");
  const [fecha, setFecha] = useState<string>(cotizacion?.fecha ?? new Date().toISOString().slice(0, 10));
  const [vigencia, setVigencia] = useState<string>(cotizacion?.fecha_vigencia ?? addDays(15));
  const [notas, setNotas] = useState<string>(cotizacion?.notas ?? "");
  const [lineas, setLineas] = useState<Linea[]>(
    (cotizacion?.cotizaciones_servicios_lineas ?? [])
      .slice()
      .sort((a: any, b: any) => a.orden - b.orden)
      .map((l: any) => ({
        orden: l.orden,
        codigo: l.codigo ?? "",
        servicio: l.servicio,
        descripcion: l.descripcion ?? "",
        cantidad: Number(l.cantidad),
        tarifa_unitaria: Number(l.tarifa_unitaria),
        moneda: l.moneda,
        gravado: l.gravado ?? true,
      })),
  );

  const { data: tarifas } = useQuery({
    queryKey: ["tarifas-servicios-activas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_tarifas_servicios").select("*").eq("activo", true).order("servicio");
      if (error) throw error;
      return (data ?? []) as Tarifa[];
    },
  });

  const agregarDesdeTarifa = (id: string) => {
    const t = (tarifas ?? []).find((x) => x.id === id);
    if (!t) return;
    setLineas((prev) => [...prev, {
      orden: prev.length + 1,
      codigo: t.codigo ?? "",
      servicio: t.servicio,
      descripcion: t.descripcion ?? "",
      cantidad: 1,
      tarifa_unitaria: Number(t.tarifa) || 0,
      moneda: t.moneda,
      gravado: true,
    }]);
  };

  const setLinea = (i: number, patch: Partial<Linea>) =>
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const totales = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const l of lineas) {
      const sub = (Number(l.cantidad) || 0) * (Number(l.tarifa_unitaria) || 0);
      acc[l.moneda] = (acc[l.moneda] ?? 0) + sub;
    }
    return acc;
  }, [lineas]);

  const guardar = useMutation({
    mutationFn: async () => {
      if (lineas.length === 0) throw new Error("Agrega al menos un servicio");
      const cab = {
        cliente_id: clienteId || null,
        fecha,
        fecha_vigencia: vigencia || null,
        notas: notas || null,
      };
      let id = cotizacion?.id as string | undefined;
      if (id) {
        const { error } = await supabase.from("cotizaciones_servicios").update(cab).eq("id", id);
        if (error) throw error;
        const { error: delErr } = await supabase
          .from("cotizaciones_servicios_lineas").delete().eq("cotizacion_id", id);
        if (delErr) throw delErr;
      } else {
        const { data: user } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("cotizaciones_servicios")
          .insert({ ...cab, numero: "", estado: "borrador", creado_por: user.user?.id ?? null })
          .select("id").single();
        if (error) throw error;
        id = data.id;
      }
      const rows = lineas.map((l, i) => ({
        cotizacion_id: id!,
        orden: i + 1,
        codigo: l.codigo || null,
        gravado: l.gravado,
        servicio: l.servicio,
        descripcion: l.descripcion || null,
        cantidad: Number(l.cantidad) || 0,
        tarifa_unitaria: Number(l.tarifa_unitaria) || 0,
        moneda: l.moneda,
        subtotal: (Number(l.cantidad) || 0) * (Number(l.tarifa_unitaria) || 0),
      }));
      const { error: insErr } = await supabase.from("cotizaciones_servicios_lineas").insert(rows);
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success("Cotización guardada");
      qc.invalidateQueries({ queryKey: ["cotizaciones-servicios"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cotizacion ? `Editar ${cotizacion.numero}` : "Nueva cotización de servicios"}</DialogTitle>
          <DialogDescription>Selecciona el cliente y agrega los servicios a cotizar.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Cliente</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Fecha de vigencia</Label>
              <Input type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Notas</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <div className="flex items-end gap-2">
            <div className="grid gap-1.5 flex-1">
              <Label className="text-xs">Agregar servicio</Label>
              <Select value="" onValueChange={agregarDesdeTarifa}>
                <SelectTrigger><SelectValue placeholder="Busca en el tarifario…" /></SelectTrigger>
                <SelectContent>
                  {(tarifas ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.servicio} — {t.moneda} {nf(t.tarifa)} ({t.unidad})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => setLineas((p) => [...p, { orden: p.length + 1, codigo: "", servicio: "", descripcion: "", cantidad: 1, tarifa_unitaria: 0, moneda: "DOP", gravado: true }])}
            >
              <Plus className="h-4 w-4 mr-1" /> Línea libre
            </Button>
          </div>

          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Código</TableHead>
                  <TableHead className="min-w-48">Servicio</TableHead>
                  <TableHead className="min-w-48">Descripción</TableHead>
                  <TableHead className="w-24">Cant.</TableHead>
                  <TableHead className="w-32">Tarifa</TableHead>
                  <TableHead className="w-24">Moneda</TableHead>
                  <TableHead className="w-20">ITBIS</TableHead>
                  <TableHead className="w-28 text-right">Subtotal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Sin servicios</TableCell></TableRow>
                )}
                {lineas.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell><Input value={l.codigo} onChange={(e) => setLinea(i, { codigo: e.target.value })} /></TableCell>
                    <TableCell><Input value={l.servicio} onChange={(e) => setLinea(i, { servicio: e.target.value })} /></TableCell>
                    <TableCell><Input value={l.descripcion} onChange={(e) => setLinea(i, { descripcion: e.target.value })} /></TableCell>
                    <TableCell><Input type="number" step="0.01" value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: Number(e.target.value) })} /></TableCell>
                    <TableCell><Input type="number" step="0.01" value={l.tarifa_unitaria} onChange={(e) => setLinea(i, { tarifa_unitaria: Number(e.target.value) })} /></TableCell>
                    <TableCell>
                      <Select value={l.moneda} onValueChange={(v) => setLinea(i, { moneda: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{MONEDAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch checked={l.gravado} onCheckedChange={(v) => setLinea(i, { gravado: v })} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {nf((Number(l.cantidad) || 0) * (Number(l.tarifa_unitaria) || 0))}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setLineas((p) => p.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-4 text-sm">
            {Object.entries(totales).map(([m, v]) => (
              <div key={m} className="font-semibold">Total {m}: <span className="tabular-nums">{nf(v)}</span></div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>Guardar borrador</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
