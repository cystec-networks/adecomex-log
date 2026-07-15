import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart3, ChevronRight, FileSpreadsheet, FileText, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { parseLocalDate, fmtLocalDate } from "@/lib/dates";
import { ESTADO_LABEL } from "@/lib/estados-expediente";

export const Route = createFileRoute("/_authenticated/reportes")({
  component: ReportesPage,
});

const REGIMENES = [
  "Consumo (importación definitiva)",
  "Admisión temporal",
  "Zona Franca",
  "Reexportación",
  "Tránsito",
  "Depósito Fiscal",
  "Exportación definitiva",
  "Reimportación",
  "Perfeccionamiento activo",
  "Otros",
];
const PREFERENCIAS = ["Ninguna", "DR-CAFTA", "EPA", "ALADI", "Otros"];
const ESTADOS = ["digitar", "presentar", "verificar", "facturar", "despachado"];
const AGRUPAR_POR = [
  { v: "cliente", l: "Cliente" },
  { v: "regimen", l: "Régimen Aduanero" },
  { v: "preferencia", l: "Preferencia Comercial" },
  { v: "periodo", l: "Período (mes)" },
  { v: "estado", l: "Estado" },
];

const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const fmtUSD = (n: number) => `US$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtDate = (d?: string | null) => fmtLocalDate(d);

const estadoBadge: Record<string, string> = {
  digitar: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  presentar: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  verificar: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  facturar: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  despachado: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
};

function ReportesPage() {
  const [cliente, setCliente] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [estado, setEstado] = useState("todos");
  const [regimen, setRegimen] = useState("todos");
  const [pref, setPref] = useState("todas");
  const [fechaBase, setFechaBase] = useState<"eta" | "creado">("eta");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [agrupar, setAgrupar] = useState("cliente");

  const { data: clientes } = useQuery({
    queryKey: ["clientes-list"],
    queryFn: async () =>
      (await supabase.from("clientes").select("id,nombre").is("eliminado_en", null).order("nombre")).data ?? [],
  });

  const { data: expedientes } = useQuery({
    queryKey: ["reporte-expedientes"],
    queryFn: async () =>
      (
        await supabase
          .from("expedientes")
          .select("*, clientes(nombre), solicitudes(tipo_operacion), mercancia_items(*)")
          .is("eliminado_en", null)
      ).data ?? [],
  });

  const detectTipo = (e: any) => {
    const t = norm(e.solicitudes?.tipo_operacion ?? "");
    if (t.includes("import")) return "importacion";
    if (t.includes("export")) return "exportacion";
    return "otros";
  };

  const filtered = useMemo(() => {
    if (!expedientes) return [];
    return expedientes.filter((e: any) => {
      if (cliente !== "todos" && e.cliente_id !== cliente) return false;
      if (tipo !== "todos" && detectTipo(e) !== tipo) return false;
      if (estado !== "todos" && e.estado !== estado) return false;
      if (regimen !== "todos" && (e.regimen_aduanero ?? "") !== regimen) return false;
      if (pref !== "todas" && (e.preferencia_comercial ?? "Ninguna") !== pref) return false;
      const dateField = fechaBase === "eta" ? e.fecha_compromiso : e.created_at;
      const parseField = (v: string) => fechaBase === "eta" ? parseLocalDate(v) : new Date(v);
      if (desde && dateField && parseField(dateField) < parseLocalDate(desde)) return false;
      if (hasta && dateField && parseField(dateField) > (fechaBase === "eta" ? parseLocalDate(hasta) : new Date(hasta + "T23:59:59"))) return false;
      return true;
    });
  }, [expedientes, cliente, tipo, estado, regimen, pref, fechaBase, desde, hasta]);

  const pesoDe = (e: any) =>
    (e.mercancia_items ?? []).filter((i: any) => !i.deleted_at).reduce((s: number, i: any) => s + (Number(i.peso) || 0), 0);

  const totales = useMemo(() => {
    return filtered.reduce(
      (acc, e: any) => {
        acc.count += 1;
        acc.fob += Number(e.total_fob) || 0;
        acc.cif += Number(e.total_cif) || 0;
        acc.peso += pesoDe(e);
        return acc;
      },
      { count: 0, fob: 0, cif: 0, peso: 0 },
    );
  }, [filtered]);

  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const e of filtered) {
      let key = "—";
      if (agrupar === "cliente") key = e.clientes?.nombre ?? "Sin cliente";
      else if (agrupar === "regimen") key = e.regimen_aduanero ?? "Sin régimen";
      else if (agrupar === "preferencia") key = e.preferencia_comercial ?? "Ninguna";
      else if (agrupar === "estado") key = e.estado ?? "—";
      else if (agrupar === "periodo") {
        const d = fechaBase === "eta" ? e.fecha_compromiso : e.created_at;
        if (d) {
          const dt = fechaBase === "eta" ? parseLocalDate(d) : new Date(d);
          key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        } else key = "Sin fecha";
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        items,
        count: items.length,
        fob: items.reduce((s, e) => s + (Number(e.total_fob) || 0), 0),
        cif: items.reduce((s, e) => s + (Number(e.total_cif) || 0), 0),
        peso: items.reduce((s, e) => s + pesoDe(e), 0),
      }))
      .sort((a, b) => b.cif - a.cif);
  }, [filtered, agrupar, fechaBase]);

  const agruparLabel = AGRUPAR_POR.find((a) => a.v === agrupar)?.l ?? agrupar;
  const timestamp = () => new Date().toISOString().slice(0, 10);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen por grupo
    const resumen: any[][] = [
      ["Reporte Resumen de Expedientes"],
      [`Generado: ${new Date().toLocaleString("es-DO")}`],
      [`Agrupado por: ${agruparLabel}`],
      [],
      [agruparLabel, "Expedientes", "Total FOB (US$)", "Total CIF (US$)", "Peso (kg)"],
    ];
    groups.forEach((g) => resumen.push([g.key, g.count, g.fob, g.cif, g.peso]));
    resumen.push([]);
    resumen.push(["TOTAL GENERAL", totales.count, totales.fob, totales.cif, totales.peso]);
    const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
    wsResumen["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

    // Hoja 2: Detalle expedientes
    const detHeader = [
      "Grupo", "Expediente", "Cliente", "BL/AWB", "Puerto Arribo", "País Origen", "ETA",
      "Régimen Aduanero", "Preferencia", "N° Cert. Origen", "Contenedores",
      "Total FOB", "Seguro", "Flete", "Otros", "Total CIF", "Peso (kg)", "Estado",
    ];
    const detalle: any[][] = [detHeader];
    groups.forEach((g) => {
      g.items.forEach((e: any) => {
        detalle.push([
          g.key, e.numero, e.clientes?.nombre ?? "", e.bl_awb ?? "",
          e.puerto_arribo ?? "", e.pais_origen ?? "",
          fmtLocalDate(e.fecha_compromiso, undefined, ""),
          e.regimen_aduanero ?? "", e.preferencia_comercial ?? "Ninguna",
          e.numero_certificado_origen ?? "", e.numeros_contenedores ?? "",
          Number(e.total_fob) || 0, Number(e.seguro) || 0, Number(e.flete) || 0,
          Number(e.otros) || 0, Number(e.total_cif) || 0, pesoDe(e), e.estado ?? "",
        ]);
      });
    });
    const wsDetalle = XLSX.utils.aoa_to_sheet(detalle);
    wsDetalle["!cols"] = detHeader.map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, wsDetalle, "Expedientes");

    // Hoja 3: Detalle de mercancía
    const mercHeader = ["Expediente", "Cliente", "#", "Cód. Arancel", "Producto", "Unidad", "Cantidad", "Peso (kg)", "Valor FOB"];
    const merc: any[][] = [mercHeader];
    filtered.forEach((e: any) => {
      const items = (e.mercancia_items ?? []).filter((i: any) => !i.deleted_at);
      items.forEach((it: any) => {
        merc.push([
          e.numero, e.clientes?.nombre ?? "", it.item_no,
          it.codigo_arancelario ?? "", it.detalle_producto ?? "", it.unidad_medida ?? "",
          Number(it.cantidad) || 0, Number(it.peso) || 0, Number(it.valor_fob) || 0,
        ]);
      });
    });
    const wsMerc = XLSX.utils.aoa_to_sheet(merc);
    wsMerc["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 6 }, { wch: 16 }, { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsMerc, "Mercancía");

    XLSX.writeFile(wb, `Reporte_Expedientes_${timestamp()}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Encabezado
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("Reporte Resumen de Expedientes", 40, 40);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`ADECOMEX SRL — Gestión y Logística`, 40, 56);
    doc.text(`Generado: ${new Date().toLocaleString("es-DO")}   |   Agrupado por: ${agruparLabel}`, 40, 70);
    doc.setTextColor(0);

    // Totales
    autoTable(doc, {
      startY: 84,
      head: [["Expedientes", "Total FOB", "Total CIF", "Peso Total"]],
      body: [[totales.count, fmtUSD(totales.fob), fmtUSD(totales.cif), `${fmtNum(totales.peso)} kg`]],
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138], fontSize: 9 },
      bodyStyles: { fontSize: 10, fontStyle: "bold" },
      margin: { left: 40, right: 40 },
    });

    // Resumen por grupo
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 14,
      head: [[agruparLabel, "Exp.", "FOB (US$)", "CIF (US$)", "Peso (kg)"]],
      body: groups.map((g) => [g.key, g.count, fmtNum(g.fob), fmtNum(g.cif), fmtNum(g.peso)]),
      foot: [["TOTAL", totales.count, fmtNum(totales.fob), fmtNum(totales.cif), fmtNum(totales.peso)]],
      theme: "striped",
      headStyles: { fillColor: [30, 58, 138], fontSize: 9 },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
      bodyStyles: { fontSize: 9 },
      margin: { left: 40, right: 40 },
    });

    // Detalle por grupo
    groups.forEach((g) => {
      doc.addPage();
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text(`${agruparLabel}: ${g.key}`, 40, 40);
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
      doc.text(`${g.count} expediente(s)  |  FOB ${fmtUSD(g.fob)}  |  CIF ${fmtUSD(g.cif)}  |  Peso ${fmtNum(g.peso)} kg`, 40, 56);
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 68,
        head: [["Expediente", "Cliente", "BL/AWB", "Puerto", "ETA", "Régimen", "Pref.", "FOB", "CIF", "Estado"]],
        body: g.items.map((e: any) => [
          e.numero,
          e.clientes?.nombre ?? "—",
          e.bl_awb ?? "—",
          e.puerto_arribo ?? "—",
          fmtLocalDate(e.fecha_compromiso),
          e.regimen_aduanero ?? "—",
          e.preferencia_comercial ?? "Ninguna",
          fmtNum(Number(e.total_fob) || 0),
          fmtNum(Number(e.total_cif) || 0),
          e.estado ?? "—",
        ]),
        theme: "grid",
        headStyles: { fillColor: [30, 58, 138], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 7: { halign: "right" }, 8: { halign: "right" } },
        margin: { left: 40, right: 40 },
      });
    });

    // Pie con paginación
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Página ${i} de ${pages}`, pageW - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
    }

    doc.save(`Reporte_Expedientes_${timestamp()}.pdf`);
  };

  const resetFilters = () => {
    setCliente("todos"); setTipo("todos"); setEstado("todos"); setRegimen("todos");
    setPref("todas"); setDesde(""); setHasta(""); setFechaBase("eta"); setAgrupar("cliente");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" /> Reporte Resumen de Expedientes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vista consolidada según estructura DUA. {filtered.length} expediente(s) filtrado(s).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={filtered.length === 0}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Cliente</Label>
              <Select value={cliente} onValueChange={setCliente}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(clientes ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="importacion">Importación</SelectItem>
                  <SelectItem value="exportacion">Exportación</SelectItem>
                  <SelectItem value="otros">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e[0].toUpperCase() + e.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Régimen Aduanero</Label>
              <Select value={regimen} onValueChange={setRegimen}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {REGIMENES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Preferencia Comercial</Label>
              <Select value={pref} onValueChange={setPref}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {PREFERENCIAS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fecha por</Label>
              <Select value={fechaBase} onValueChange={(v: any) => setFechaBase(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eta">ETA</SelectItem>
                  <SelectItem value="creado">Fecha de creación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Agrupar por</Label>
              <Select value={agrupar} onValueChange={setAgrupar}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGRUPAR_POR.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" size="sm" onClick={resetFilters} className="w-full">
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Limpiar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Totales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Expedientes" value={String(totales.count)} />
        <KpiCard label="Total FOB" value={fmtUSD(totales.fob)} />
        <KpiCard label="Total CIF" value={fmtUSD(totales.cif)} />
        <KpiCard label="Peso total" value={`${fmtNum(totales.peso)} kg`} />
      </div>

      {/* Agrupaciones */}
      <div className="space-y-2">
        {groups.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Sin resultados con los filtros aplicados.</CardContent></Card>
        )}
        {groups.map((g) => (
          <GroupCard key={g.key} group={g} agrupar={agrupar} />
        ))}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function GroupCard({ group, agrupar }: { group: any; agrupar: string }) {
  const [open, setOpen] = useState(true);
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
            <div className="flex items-center gap-2">
              <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
              <span className="font-semibold text-sm">{group.key}</span>
              <Badge variant="outline" className="text-[10px]">{group.count} exp.</Badge>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>FOB <b className="text-foreground">{fmtUSD(group.fob)}</b></span>
              <span>CIF <b className="text-foreground">{fmtUSD(group.cif)}</b></span>
              <span>Peso <b className="text-foreground">{fmtNum(group.peso)} kg</b></span>
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/30">
                <tr className="text-left">
                  <Th>Expediente</Th>
                  {agrupar !== "cliente" && <Th>Cliente</Th>}
                  <Th>BL/AWB</Th>
                  <Th>Puerto / País</Th>
                  <Th>ETA</Th>
                  <Th>Régimen</Th>
                  <Th>Preferencia</Th>
                  <Th>Contenedores</Th>
                  <Th className="text-right">FOB</Th>
                  <Th className="text-right">CIF</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((e: any) => {
                  const items = (e.mercancia_items ?? []).filter((i: any) => !i.deleted_at);
                  return (
                    <ExpedienteRow
                      key={e.id}
                      e={e}
                      items={items}
                      showCliente={agrupar !== "cliente"}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function ExpedienteRow({ e, items, showCliente }: { e: any; items: any[]; showCliente: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const pref = e.preferencia_comercial ?? "Ninguna";
  return (
    <>
      <tr className="border-t hover:bg-muted/20">
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button onClick={() => setExpanded((v) => !v)} className="text-muted-foreground hover:text-foreground">
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
              </button>
            )}
            <Link to="/expedientes/$id" params={{ id: e.id }} className="font-mono font-semibold text-primary hover:underline">
              {e.numero}
            </Link>
          </div>
        </td>
        {showCliente && <td className="px-3 py-2">{e.clientes?.nombre ?? "—"}</td>}
        <td className="px-3 py-2 font-mono text-xs">{e.bl_awb ?? "—"}</td>
        <td className="px-3 py-2 text-xs">
          <div>{e.puerto_arribo ?? "—"}</div>
          <div className="text-muted-foreground">{e.pais_origen ?? ""}</div>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.fecha_compromiso)}</td>
        <td className="px-3 py-2 text-xs">{e.regimen_aduanero ?? "—"}</td>
        <td className="px-3 py-2 text-xs">
          <div>{pref}</div>
          {pref !== "Ninguna" && e.numero_certificado_origen && (
            <div className="text-[10px] text-muted-foreground">CO: {e.numero_certificado_origen}</div>
          )}
        </td>
        <td className="px-3 py-2 font-mono text-xs max-w-[160px] truncate" title={e.numeros_contenedores ?? ""}>
          {e.numeros_contenedores ?? "—"}
        </td>
        <td className="px-3 py-2 text-right font-mono">{fmtNum(Number(e.total_fob) || 0)}</td>
        <td className="px-3 py-2 text-right font-mono font-semibold">{fmtNum(Number(e.total_cif) || 0)}</td>
        <td className="px-3 py-2">
          <Badge variant="outline" className={estadoBadge[e.estado] ?? ""}>
            {e.estado}
          </Badge>
        </td>
      </tr>
      {expanded && items.length > 0 && (
        <tr className="bg-muted/10">
          <td colSpan={showCliente ? 11 : 10} className="px-6 py-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Detalle de mercancía</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">#</th>
                  <th className="py-1 pr-3">Cód. Arancel</th>
                  <th className="py-1 pr-3">Producto</th>
                  <th className="py-1 pr-3">Unidad</th>
                  <th className="py-1 pr-3 text-right">Cantidad</th>
                  <th className="py-1 pr-3 text-right">Peso (kg)</th>
                  <th className="py-1 pr-3 text-right">FOB</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any) => (
                  <tr key={it.id} className="border-t border-border/50">
                    <td className="py-1 pr-3">{it.item_no}</td>
                    <td className="py-1 pr-3 font-mono">{it.codigo_arancelario ?? "—"}</td>
                    <td className="py-1 pr-3">{it.detalle_producto ?? "—"}</td>
                    <td className="py-1 pr-3">{it.unidad_medida ?? "—"}</td>
                    <td className="py-1 pr-3 text-right font-mono">{fmtNum(Number(it.cantidad) || 0)}</td>
                    <td className="py-1 pr-3 text-right font-mono">{fmtNum(Number(it.peso) || 0)}</td>
                    <td className="py-1 pr-3 text-right font-mono">{fmtNum(Number(it.valor_fob) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground ${className}`}>{children}</th>;
}
