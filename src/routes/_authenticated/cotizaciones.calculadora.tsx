import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcImpuestosLinea } from "@/lib/impuestos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Copy, X, FileDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cotizaciones/calculadora")({
  head: () => ({
    meta: [
      { title: "Calculadora Rápida de Pre-Liquidación — ADECOMEX" },
      { name: "description", content: "Calculadora rápida de pre-liquidación de impuestos por porcentajes, sin vinculación a clientes ni cotizaciones." },
      { property: "og:title", content: "Calculadora Rápida de Pre-Liquidación — ADECOMEX" },
      { property: "og:description", content: "Herramienta de cálculo referencial de impuestos de importación en USD y RD$." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalculadoraRapida,
});

const DISCLAIMER =
  "Estimación referencial — sujeta a la liquidación oficial de la Dirección General de Aduanas (DGA). " +
  "Este documento no constituye una declaración ni liquidación oficial.";

type TarifaServicio = { id: string; tipo_despacho: string; unidad: string; tarifa_usd: number };

const ETIQUETA_CANTIDAD: Record<string, string> = {
  kg: "Peso total (kg)",
  contenedor20: "N° de contenedores de 20'",
  contenedor4045: "N° de contenedores de 40-45'",
  vehiculo: "N° de vehículos",
  tm: "Toneladas métricas",
};

type Linea = { producto: string; fob: string; peso: string };

type Escenario = {
  lineas: Linea[];
  tasa: string;
  fleteReal: boolean;
  flete: string; // % o US$ según fleteReal
  seguroReal: boolean;
  seguro: string;
  pctGravamen: string;
  pctItbis: string;
  servicioId: string;
  servicioCantidad: string;
  pctGastos: string;
};

const LINEA_VACIA: Linea = { producto: "", fob: "", peso: "" };

const VACIO: Escenario = {
  lineas: [{ ...LINEA_VACIA }],
  tasa: "",
  fleteReal: false,
  flete: "",
  seguroReal: false,
  seguro: "",
  pctGravamen: "",
  pctItbis: "18",
  servicioId: "",
  servicioCantidad: "",
  pctGastos: "",
};

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

type LineaResultado = {
  producto: string;
  fob: number;
  cif: number;
  gravamen: number;
  itbis: number;
  servicio: number;
  gastos: number;
  total: number;
};

type Resultado = {
  totalFob: number;
  totalPeso: number;
  flete: number;
  seguro: number;
  cif: number;
  gravamen: number;
  itbis: number;
  gastos: number;
  servicio: number;
  lineas: LineaResultado[];
  totalImpuestos: number;
  costoTotal: number;
};

function calcular(e: Escenario, tarifa?: TarifaServicio): Resultado {
  const totalFob = e.lineas.reduce((a, l) => a + num(l.fob), 0);
  const totalPeso = e.lineas.reduce((a, l) => a + num(l.peso), 0);
  const flete = e.fleteReal ? num(e.flete) : totalFob * (num(e.flete) / 100);
  const seguro = e.seguroReal ? num(e.seguro) : totalFob * (num(e.seguro) / 100);
  const servicio = tarifa ? Number(tarifa.tarifa_usd) * num(e.servicioCantidad) : 0;

  const lineas: LineaResultado[] = e.lineas.map((l) => {
    const fob = num(l.fob);
    const share = totalFob > 0 ? fob / totalFob : 1 / Math.max(e.lineas.length, 1);
    const r = calcImpuestosLinea(fob, totalFob, seguro, flete, 0, num(e.pctGravamen), false, null, num(e.pctItbis));
    const gastos = r.cifLinea * (num(e.pctGastos) / 100);
    const servicioLinea = servicio * share;
    return {
      producto: l.producto,
      fob,
      cif: r.cifLinea,
      gravamen: r.gravamen,
      itbis: r.itbis,
      servicio: servicioLinea,
      gastos,
      total: r.cifLinea + r.gravamen + r.itbis + servicioLinea + gastos,
    };
  });

  const cif = lineas.reduce((a, l) => a + l.cif, 0);
  const gravamen = lineas.reduce((a, l) => a + l.gravamen, 0);
  const itbis = lineas.reduce((a, l) => a + l.itbis, 0);
  const gastos = lineas.reduce((a, l) => a + l.gastos, 0);
  const totalImpuestos = gravamen + itbis + gastos + servicio;

  return { totalFob, totalPeso, flete, seguro, cif, gravamen, itbis, gastos, servicio, lineas, totalImpuestos, costoTotal: cif + totalImpuestos };
}

const nf = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Estructura compartida de la tabla de resultados (pantalla + PDF)
export const COLUMNAS_RESULTADO = [
  "Producto",
  "CIF (US$)",
  "Gravamen (US$)",
  "ITBIS (US$)",
  "Servicio Aduanero (US$)",
  "Gastos (US$)",
  "Costo Total (RD$)",
  "Costo Total (US$)",
];

function filasResultado(r: Resultado, tasa: number): { body: string[][]; foot: string[] } {
  const rd = (n: number) => (tasa > 0 ? nf(n * tasa) : "—");
  const body = r.lineas.map((l, i) => [
    l.producto || `Línea ${i + 1}`,
    nf(l.cif),
    nf(l.gravamen),
    nf(l.itbis),
    nf(l.servicio),
    nf(l.gastos),
    rd(l.total),
    nf(l.total),
  ]);
  const foot = [
    "TOTALES",
    nf(r.cif),
    nf(r.gravamen),
    nf(r.itbis),
    nf(r.servicio),
    nf(r.gastos),
    rd(r.costoTotal),
    nf(r.costoTotal),
  ];
  return { body, foot };
}

function TablaResultado({ r, tasa }: { r: Resultado; tasa: number }) {
  const { body, foot } = filasResultado(r, tasa);
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {COLUMNAS_RESULTADO.map((c, i) => (
              <th key={c} className={`p-2 ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((fila, i) => (
            <tr key={i} className="border-t tabular-nums">
              {fila.map((v, j) => (
                <td key={j} className={`p-2 ${j === 0 ? "" : "text-right"}`}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/50 font-semibold tabular-nums">
            {foot.map((v, j) => (
              <td key={j} className={`p-2 ${j === 0 ? "" : "text-right"}`}>{v}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ColumnaEscenario({
  titulo, esc, tarifas, onChange, onQuitar,
}: {
  titulo: string;
  esc: Escenario;
  tarifas: TarifaServicio[];
  onChange: (e: Escenario) => void;
  onQuitar?: () => void;
}) {
  const tarifa = tarifas.find((t) => t.id === esc.servicioId);
  const r = calcular(esc, tarifa);
  const tasa = num(esc.tasa);
  const rd = (n: number) => (tasa > 0 ? nf(n * tasa) : "—");
  const set = (k: keyof Escenario, v: any) => onChange({ ...esc, [k]: v });

  const setLinea = (i: number, k: keyof Linea, v: string) => {
    const lineas = esc.lineas.map((l, idx) => (idx === i ? { ...l, [k]: v } : l));
    onChange({ ...esc, lineas });
  };

  const fila = (label: string, usd: number, bold = false) => (
    <div className={`flex items-baseline justify-between gap-2 py-1 ${bold ? "font-semibold border-t pt-2 mt-1" : ""}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-right tabular-nums">
        US$ {nf(usd)} <span className="text-xs text-muted-foreground">/ RD$ {rd(usd)}</span>
      </span>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {onQuitar && (
          <Button variant="ghost" size="icon" onClick={onQuitar} title="Quitar escenario">
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Productos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Productos</Label>
            <Button variant="outline" size="sm" onClick={() => onChange({ ...esc, lineas: [...esc.lineas, { ...LINEA_VACIA }] })}>
              <Plus className="h-3.5 w-3.5 mr-1" />Agregar producto
            </Button>
          </div>
          <div className="space-y-2">
            {esc.lineas.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_80px_auto] gap-2 items-center">
                <Input value={l.producto} placeholder="Producto" onChange={(ev) => setLinea(i, "producto", ev.target.value)} />
                <Input type="number" step="0.01" min="0" value={l.fob} placeholder="FOB US$" onChange={(ev) => setLinea(i, "fob", ev.target.value)} />
                <Input type="number" step="0.01" min="0" value={l.peso} placeholder="Peso kg" onChange={(ev) => setLinea(i, "peso", ev.target.value)} />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={esc.lineas.length === 1}
                  title="Eliminar"
                  onClick={() => onChange({ ...esc, lineas: esc.lineas.filter((_, idx) => idx !== i) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            Total FOB: US$ {nf(r.totalFob)} · Peso total: {nf(r.totalPeso)} kg
          </div>
        </div>

        {/* Flete y seguro */}
        <div className="grid grid-cols-2 gap-3">
          {(["flete", "seguro"] as const).map((campo) => {
            const real = campo === "flete" ? esc.fleteReal : esc.seguroReal;
            const keyReal = campo === "flete" ? "fleteReal" : "seguroReal";
            return (
              <div key={campo} className="grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs capitalize">{real ? `${campo} (US$)` : `% ${campo} estimado`}</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">Monto real</span>
                    <Switch checked={real} onCheckedChange={(v) => set(keyReal as keyof Escenario, v)} />
                  </div>
                </div>
                <Input type="number" step="0.01" min="0" value={esc[campo]} onChange={(ev) => set(campo, ev.target.value)} />
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Tasa de cambio (RD$/US$)</Label>
            <Input type="number" step="0.01" min="0" value={esc.tasa} onChange={(ev) => set("tasa", ev.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">% Gravamen</Label>
            <Input type="number" step="0.01" min="0" value={esc.pctGravamen} onChange={(ev) => set("pctGravamen", ev.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">% ITBIS</Label>
            <Input type="number" step="0.01" min="0" value={esc.pctItbis} onChange={(ev) => set("pctItbis", ev.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">% Gastos (otros)</Label>
            <Input type="number" step="0.01" min="0" value={esc.pctGastos} onChange={(ev) => set("pctGastos", ev.target.value)} />
          </div>
        </div>

        {/* Servicio aduanero */}
        <div className="grid gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">Tipo de despacho (Servicio Aduanero)</Label>
            <Select value={esc.servicioId} onValueChange={(v) => set("servicioId", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar tipo de despacho" /></SelectTrigger>
              <SelectContent>
                {tarifas.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.tipo_despacho} — US$ {nf(Number(t.tarifa_usd))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {tarifa && (
            <div className="grid gap-1">
              <Label className="text-xs">{ETIQUETA_CANTIDAD[tarifa.unidad] ?? "Cantidad"}</Label>
              <Input
                type="number"
                step={tarifa.unidad === "kg" || tarifa.unidad === "tm" ? "0.01" : "1"}
                min="0"
                value={esc.servicioCantidad}
                onChange={(ev) => set("servicioCantidad", ev.target.value)}
              />
            </div>
          )}
        </div>

        {/* Resultados */}
        <div className="rounded-md border bg-muted/30 p-3">
          {fila("Total FOB", r.totalFob)}
          {fila(esc.fleteReal ? "Flete (real)" : `Flete (${esc.flete || 0}%)`, r.flete)}
          {fila(esc.seguroReal ? "Seguro (real)" : `Seguro (${esc.seguro || 0}%)`, r.seguro)}
          {fila("Total Impuestos", r.totalImpuestos, true)}
        </div>

        <TablaResultado r={r} tasa={tasa} />
      </CardContent>
    </Card>
  );
}

async function generarPdf(escenarios: Escenario[], tarifas: TarifaServicio[], importador: string) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 32;

  doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text("ADECOMEX SRL — Gestión y Logística", M, 40);
  doc.setFontSize(11);
  doc.text("CALCULADORA RÁPIDA — PRE-LIQUIDACIÓN ESTIMADA", M, 58);
  doc.setFontSize(9);
  doc.text(`Importador: ${importador.trim() || "—"}`, M, 74);
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 60, 30);
  doc.text(doc.splitTextToSize(DISCLAIMER, pageW - M * 2), M, 88);
  doc.setTextColor(100);
  doc.text(`Generado: ${new Date().toLocaleString("es-DO")}  |  Cálculo referencial sin vinculación a cliente/cotización`, M, 108);
  doc.setTextColor(0);

  let y = 122;
  escenarios.forEach((e, i) => {
    const tarifa = tarifas.find((t) => t.id === e.servicioId);
    const r = calcular(e, tarifa);
    const tasa = num(e.tasa);
    const rd = (n: number) => (tasa > 0 ? nf(n * tasa) : "—");
    const fila = (label: string, usd: number) => [label, nf(usd), rd(usd)];

    if (y > pageH - 240) { doc.addPage(); y = 50; }

    // Detalle por renglón (misma estructura que la tabla en pantalla)
    const { body, foot } = filasResultado(r, tasa);
    if (escenarios.length > 1) {
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.text(`Escenario ${i + 1}`, M, y);
      doc.setFont("helvetica", "normal");
      y += 10;
    }
    autoTable(doc, {
      startY: y,
      head: [COLUMNAS_RESULTADO],
      body,
      foot: [foot],
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold", fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 160 },
        1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" },
        4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" },
      },
      margin: { left: M, right: M },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    autoTable(doc, {
      startY: y,
      head: [["Resumen", "US$", "RD$"]],
      body: [
        fila("Total FOB", r.totalFob),
        fila(e.fleteReal ? "Flete (monto real)" : `Flete estimado (${e.flete || 0}%)`, r.flete),
        fila(e.seguroReal ? "Seguro (monto real)" : `Seguro estimado (${e.seguro || 0}%)`, r.seguro),
        fila("CIF", r.cif),
        fila(`Gravamen (${e.pctGravamen || 0}%)`, r.gravamen),
        fila(`ITBIS (${e.pctItbis || 18}%)`, r.itbis),
        fila(`Gastos (${e.pctGastos || 0}%)`, r.gastos),
        fila(
          tarifa
            ? `Servicio Aduanero — ${tarifa.tipo_despacho} (${nf(num(e.servicioCantidad))} × US$ ${nf(Number(tarifa.tarifa_usd))})`
            : "Servicio Aduanero (no seleccionado)",
          r.servicio,
        ),
        fila("Total Impuestos Estimados", r.totalImpuestos),
        fila("Costo Total", r.costoTotal),
      ],
      foot: tasa > 0 ? [[`Tasa de cambio: RD$ ${nf(tasa)} por US$1.00`, "", ""]] : undefined,
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold", fontSize: 8 },
      columnStyles: { 0: { cellWidth: 300 }, 1: { halign: "right" }, 2: { halign: "right" } },
      margin: { left: M, right: M },
      didParseCell: (d: any) => {
        if (d.section === "body" && ["CIF", "Total Impuestos Estimados", "Costo Total"].includes(d.row.raw?.[0])) {
          d.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  });

  const notaY = y + 10;
  doc.setFontSize(7.5); doc.setTextColor(110);
  const lines = doc.splitTextToSize(DISCLAIMER, pageW - M * 2);
  if (notaY + lines.length * 10 > pageH - 40) { doc.addPage(); doc.text(lines, M, 50); }
  else doc.text(lines, M, notaY);
  doc.setTextColor(0);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Página ${i} de ${pages}`, pageW - M, pageH - 20, { align: "right" });
  }

  return doc;
}

function CalculadoraRapida() {
  const [escA, setEscA] = useState<Escenario>(VACIO);
  const [escB, setEscB] = useState<Escenario | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: tarifas = [] } = useQuery({
    queryKey: ["catalogo-tasa-servicio-aduanero"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_tasa_servicio_aduanero")
        .select("id, tipo_despacho, unidad, tarifa_usd")
        .eq("activo", true)
        .order("tipo_despacho");
      if (error) throw error;
      return (data ?? []) as TarifaServicio[];
    },
  });

  const descargarPdf = async () => {
    setPdfLoading(true);
    try {
      const lista = escB ? [escA, escB] : [escA];
      const doc = await generarPdf(lista, tarifas);
      doc.save(`Calculadora_Rapida_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF descargado");
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo generar el PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Calculator className="h-6 w-6 text-muted-foreground" />
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">Calculadora Rápida de Pre-Liquidación</h1>
          <p className="text-sm text-muted-foreground">
            Cálculo referencial por porcentajes — no se guarda nada en la base de datos.
          </p>
        </div>
        {!escB && (
          <Button variant="outline" onClick={() => setEscB({ ...escA, lineas: escA.lineas.map((l) => ({ ...l })) })}>
            <Copy className="h-4 w-4 mr-1" />Duplicar escenario
          </Button>
        )}
        <Button onClick={descargarPdf} disabled={pdfLoading}>
          <FileDown className="h-4 w-4 mr-1" />{pdfLoading ? "Generando…" : "Descargar PDF"}
        </Button>
      </div>

      <div className={`grid gap-4 ${escB ? "lg:grid-cols-2" : "max-w-2xl"}`}>
        <ColumnaEscenario
          titulo={escB ? "Escenario A" : "Escenario"}
          esc={escA}
          tarifas={tarifas}
          onChange={setEscA}
        />
        {escB && (
          <ColumnaEscenario
            titulo="Escenario B"
            esc={escB}
            tarifas={tarifas}
            onChange={setEscB}
            onQuitar={() => setEscB(null)}
          />
        )}
      </div>

      <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}
