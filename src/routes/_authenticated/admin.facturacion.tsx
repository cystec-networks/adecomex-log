import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ClipboardList, Plus, Trash2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtLocalDate } from "@/lib/dates";
import { FacturaEcfFormDialog } from "@/components/factura-ecf-selector";
import { TIPOS_COMPROBANTE, tipoLabel, tipoBadgeClass, fmtRD } from "@/lib/facturas-ecf";
import { DocumentoPreviewButton } from "@/components/documento-preview-dialog";
import { buildDocumentoComercialPdf } from "@/lib/pdf-documento-comercial";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/facturacion")({
  ssr: false,
  validateSearch: z.object({ editar: z.string().optional() }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "contabilidad"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: FacturacionPage,
});

function FacturacionPage() {
  const qc = useQueryClient();
  const { editar } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [openNew, setOpenNew] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (editar) setEditId(editar);
  }, [editar]);

  const [clienteFiltro, setClienteFiltro] = useState<string>("__all__");
  const [tipoFiltro, setTipoFiltro] = useState<string>("__all__");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");
  const [q, setQ] = useState("");

  const { data: clientes } = useQuery({
    queryKey: ["clientes-lite-fac"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  const { data: facturas, isLoading } = useQuery({
    queryKey: ["facturas-ecf"],
    queryFn: async () => {
      const { data } = await supabase
        .from("facturas_ecf")
        .select("*, facturas_ecf_lineas(*), expedientes:expedientes!expedientes_factura_ecf_id_fkey(id,numero), transportes:transportes!transportes_factura_ecf_id_fkey(id,numero_viaje)")
        .is("eliminado_en", null)
        .order("fecha_emision", { ascending: false });
      return data ?? [];
    },
  });

  const { data: pendientesCount } = useQuery({
    queryKey: ["ecf-pendientes-count"],
    queryFn: async () => {
      const [e, t] = await Promise.all([
        supabase.from("expedientes")
          .select("id", { count: "exact", head: true })
          .is("eliminado_en", null)
          .is("factura_ecf_id", null)
          .not("factura_comercial", "is", null),
        supabase.from("transportes")
          .select("id", { count: "exact", head: true })
          .is("eliminado_en", null)
          .is("factura_ecf_id", null)
          .not("factura_numero", "is", null),
      ]);
      return (e.count ?? 0) + (t.count ?? 0);
    },
  });

  const filtered = useMemo(() => {
    const list = facturas ?? [];
    return list.filter((f: any) => {
      if (clienteFiltro !== "__all__" && f.cliente_id !== clienteFiltro) return false;
      if (tipoFiltro !== "__all__" && f.tipo_comprobante !== tipoFiltro) return false;
      if (desde && f.fecha_emision < desde) return false;
      if (hasta && f.fecha_emision > hasta) return false;
      if (q) {
        const s = q.toLowerCase();
        if (
          !(f.encf ?? "").toLowerCase().includes(s) &&
          !(f.cliente_razon_social ?? "").toLowerCase().includes(s) &&
          !(f.cliente_rnc ?? "").toLowerCase().includes(s)
        ) return false;
      }
      return true;
    });
  }, [facturas, clienteFiltro, tipoFiltro, desde, hasta, q]);

  const enviarPapelera = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("facturas_ecf").update({
        eliminado_en: new Date().toISOString(),
        eliminado_por: u.user?.id ?? null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Factura enviada a papelera");
      qc.invalidateQueries({ queryKey: ["facturas-ecf"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const docRef = useRef<any>(null);
  const fileNameRef = useRef("Factura.pdf");
  const cerrarPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    docRef.current = null;
  };

  const generarFacturaPdf = async (f: any) => {
    const cliente = (clientes ?? []).find((x: any) => x.id === f.cliente_id) as any;
    const lineas = [...(f.facturas_ecf_lineas ?? [])].sort((a: any, b: any) => a.orden - b.orden);
    const doc = await buildDocumentoComercialPdf({
      tipo: "factura",
      titulo: "Factura de Crédito Fiscal",
      numero: f.encf || "—",
      fecha: f.fecha_emision,
      fechaSecundaria: f.fecha_vencimiento_pago ?? null,
      cliente: {
        nombre: f.cliente_razon_social ?? cliente?.nombre,
        direccion: cliente?.direccion,
        rnc: f.cliente_rnc ?? cliente?.rnc,
      },
      lineas: lineas.map((l: any) => ({
        codigo: l.codigo,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        precio: Number(l.precio),
        gravado: !!l.gravado,
        monto: Number(l.valor || 0) - Number(l.itbis || 0),
      })),
      notas: f.notas,
      subtotal: Number(f.subtotal_gravado || 0) + Number(f.subtotal_exento || 0),
      impuesto: Number(f.total_itbis || 0),
      total: Number(f.monto_total || 0),
      saldoPendiente: Number(f.monto_total || 0),
    });
    fileNameRef.current = `${f.encf || "Factura"}.pdf`;
    docRef.current = doc;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(doc.output("bloburl").toString());
  };

  const totalMonto = filtered.reduce((s: number, f: any) => s + Number(f.monto_total || 0), 0);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">Facturación (e-CF)</h1>
          <p className="text-sm text-muted-foreground">
            Registro interno de Comprobantes Fiscales Electrónicos ya emitidos y timbrados en la Oficina Virtual de la DGII.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(pendientesCount ?? 0) > 0 && (
            <Button variant="outline" asChild className="border-amber-300 text-amber-700 hover:bg-amber-50">
              <Link to="/admin/facturacion/pendientes">
                <ClipboardList className="h-4 w-4" /> {pendientesCount} pendientes de vincular
              </Link>
            </Button>
          )}
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="h-4 w-4" /> Nueva Factura e-CF
          </Button>
        </div>
      </div>

      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>
          Este módulo NO genera, firma ni timbra comprobantes fiscales — únicamente registra facturas ya validadas por la DGII para consulta,
          reportes y vinculación con Expedientes/Transportes.
        </span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Buscar</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e-NCF, cliente, RNC…" className="w-56" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Select value={clienteFiltro} onValueChange={setClienteFiltro}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos los clientes</SelectItem>
                  {(clientes ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {TIPOS_COMPROBANTE.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-muted-foreground">{filtered.length} facturas</div>
              <div className="text-lg font-bold text-primary">{fmtRD(totalMonto)}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b bg-muted/30">
                <tr>
                  <th className="text-left px-3 py-2">e-NCF</th>
                  <th className="text-left">Tipo</th>
                  <th className="text-left">Cliente</th>
                  <th className="text-left">Emisión</th>
                  <th className="text-right">Monto Total</th>
                  <th className="text-left">Vinculado a</th>
                  <th className="text-right px-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td></tr>}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sin facturas registradas.</td></tr>
                )}
                {filtered.map((f: any) => {
                  const exps = f.expedientes as { id: string; numero: string }[] | null;
                  const trs = f.transportes as { id: string; numero_viaje: string }[] | null;
                  return (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono font-medium">
                        <button
                          className="text-primary hover:underline"
                          onClick={() => setEditId(f.id)}
                          title="Editar factura"
                        >
                          {f.encf}
                        </button>
                      </td>

                      <td>
                        <Badge variant="outline" className={tipoBadgeClass(f.tipo_comprobante)}>
                          {f.tipo_comprobante}
                        </Badge>
                      </td>
                      <td>
                        <div className="font-medium">{f.cliente_razon_social ?? "—"}</div>
                        {f.cliente_rnc && <div className="text-xs text-muted-foreground">RNC {f.cliente_rnc}</div>}
                      </td>
                      <td className="text-muted-foreground">{fmtLocalDate(f.fecha_emision)}</td>
                      <td className="text-right font-semibold">{fmtRD(f.monto_total)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(exps ?? []).map((e) => (
                            <Link key={e.id} to="/expedientes/$id" params={{ id: e.id }}>
                              <Badge variant="secondary" className="hover:bg-primary/20">
                                <ExternalLink className="h-3 w-3 mr-1" />{e.numero}
                              </Badge>
                            </Link>
                          ))}
                          {(trs ?? []).map((t) => (
                            <Link key={t.id} to="/transportes/$id" params={{ id: t.id }}>
                              <Badge variant="secondary" className="hover:bg-primary/20">
                                <ExternalLink className="h-3 w-3 mr-1" />{t.numero_viaje}
                              </Badge>
                            </Link>
                          ))}
                          {(exps ?? []).length === 0 && (trs ?? []).length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {(f.facturas_ecf_lineas ?? []).length > 0 && (
                          <Button
                            size="sm" variant="ghost" className="h-7"
                            onClick={() => generarFacturaPdf(f)}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" /> PDF
                          </Button>
                        )}
                        {f.pdf_url && (
                          <DocumentoPreviewButton
                            path={f.pdf_url as string}
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            label="PDF"
                          />
                        )}
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`¿Enviar la factura ${f.encf} a papelera?`)) enviarPapelera.mutate(f.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Los totales calculados en este módulo son de referencia interna; el documento oficial de la DGII siempre prevalece.
      </div>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) cerrarPreview(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="text-base">Vista previa — Factura</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {previewUrl && <iframe src={previewUrl} title="Factura" className="w-full h-full border-0" />}
          </div>
          <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => docRef.current?.save(fileNameRef.current)}>
              <FileText className="h-4 w-4 mr-1" /> Descargar
            </Button>
            <Button size="sm" onClick={cerrarPreview}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FacturaEcfFormDialog open={openNew} onOpenChange={setOpenNew} />
      {editId && (
        <FacturaEcfFormDialog
          key={editId}
          open
          editId={editId}
          onOpenChange={(v) => {
            if (!v) {
              setEditId(undefined);
              if (editar) navigate({ search: {} as any, replace: true });
            }
          }}
        />
      )}

    </div>
  );
}

export default FacturacionPage;
export { tipoLabel };
