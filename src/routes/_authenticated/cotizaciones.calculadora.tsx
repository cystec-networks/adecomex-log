import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, Copy, X, FileDown } from "lucide-react";
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

type Escenario = {
  producto: string;
  fob: string;
  tasa: string;
  pctFlete: string;
  pctSeguro: string;
  pctGravamen: string;
  pctItbis: string;
  pctServicio: string;
  pctGastos: string;
};

const VACIO: Escenario = {
  producto: "",
  fob: "",
  tasa: "",
  pctFlete: "",
  pctSeguro: "",
  pctGravamen: "",
  pctItbis: "18",
  pctServicio: "",
  pctGastos: "",
};

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

type Resultado = {
  flete: number; seguro: number; cif: number; gravamen: number;
  servicio: number; gastos: number; itbis: number;
  totalImpuestos: number; costoTotal: number;
};

function calcular(e: Escenario): Resultado {
  const fob = num(e.fob);
  const flete = fob * (num(e.pctFlete) / 100);
  const seguro = fob * (num(e.pctSeguro) / 100);
  const cif = fob + flete + seguro;
  const gravamen = cif * (num(e.pctGravamen) / 100);
  const servicio = cif * (num(e.pctServicio) / 100);
  const gastos = cif * (num(e.pctGastos) / 100);
  const itbis = (cif + gravamen) * (num(e.pctItbis) / 100);
  const totalImpuestos = gravamen + servicio + gastos + itbis;
  return { flete, seguro, cif, gravamen, servicio, gastos, itbis, totalImpuestos, costoTotal: cif + totalImpuestos };
}

const nf = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ColumnaEscenario({
  titulo, esc, onChange, onQuitar,
}: {
  titulo: string;
  esc: Escenario;
  onChange: (k: keyof Escenario, v: string) => void;
  onQuitar?: () => void;
}) {
  const r = calcular(esc);
  const tasa = num(esc.tasa);
  const rd = (n: number) => (tasa > 0 ? nf(n * tasa) : "—");

  const campo = (label: string, key: keyof Escenario, placeholder = "") => (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" step="0.01" min="0" value={esc[key]} placeholder={placeholder} onChange={(e) => onChange(key, e.target.value)} />
    </div>
  );

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
        <div className="grid gap-1">
          <Label className="text-xs">Producto (referencia, opcional)</Label>
          <Input value={esc.producto} placeholder="Ej. Láminas de acero" onChange={(e) => onChange("producto", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {campo("FOB (US$)", "fob")}
          {campo("Tasa de cambio (RD$/US$)", "tasa")}
          {campo("% Flete estimado", "pctFlete")}
          {campo("% Seguro estimado", "pctSeguro")}
          {campo("% Gravamen", "pctGravamen")}
          {campo("% ITBIS", "pctItbis")}
          {campo("% Tasa Servicio Aduanero", "pctServicio")}
          {campo("% Gastos (otros)", "pctGastos")}
        </div>
        <div className="rounded-md border bg-muted/30 p-3">
          {fila("FOB", num(esc.fob))}
          {fila("Flete", r.flete)}
          {fila("Seguro", r.seguro)}
          {fila("CIF", r.cif, true)}
          {fila("Gravamen", r.gravamen)}
          {fila("Servicio Aduanero", r.servicio)}
          {fila("Gastos", r.gastos)}
          {fila("ITBIS", r.itbis)}
          {fila("Total Impuestos", r.totalImpuestos, true)}
          {fila("Costo Total", r.costoTotal, true)}
        </div>
      </CardContent>
    </Card>
  );
}

async function generarPdf(escenarios: Escenario[]) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 32;

  doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text("ADECOMEX SRL — Gestión y Logística", M, 40);
  doc.setFontSize(11);
  doc.text("CALCULADORA RÁPIDA — PRE-LIQUIDACIÓN POR PORCENTAJES", M, 58);
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 60, 30);
  doc.text(doc.splitTextToSize(DISCLAIMER, pageW - M * 2), M, 70);
  doc.setTextColor(100);
  doc.text(`Generado: ${new Date().toLocaleString("es-DO")}  |  Cálculo referencial sin vinculación a cliente/cotización`, M, 92);
  doc.setTextColor(0);

  let y = 106;
  escenarios.forEach((e, i) => {
    const r = calcular(e);
    const tasa = num(e.tasa);
    const rd = (n: number) => (tasa > 0 ? nf(n * tasa) : "—");
    const fila = (label: string, usd: number) => [label, nf(usd), rd(usd)];

    if (y > pageH - 220) { doc.addPage(); y = 50; }

    autoTable(doc, {
      startY: y,
      head: [[escenarios.length > 1 ? `Escenario ${i + 1}${e.producto ? ` — ${e.producto}` : ""}` : (e.producto || "Escenario"), "US$", "RD$"]],
      body: [
        ["FOB", nf(num(e.fob)), rd(num(e.fob))],
        fila(`Flete (${e.pctFlete || 0}%)`, r.flete),
        fila(`Seguro (${e.pctSeguro || 0}%)`, r.seguro),
        fila("CIF", r.cif),
        fila(`Gravamen (${e.pctGravamen || 0}%)`, r.gravamen),
        fila(`Servicio Aduanero (${e.pctServicio || 0}%)`, r.servicio),
        fila(`Gastos (${e.pctGastos || 0}%)`, r.gastos),
        fila(`ITBIS (${e.pctItbis || 18}%)`, r.itbis),
        fila("Total Impuestos Estimados", r.totalImpuestos),
        fila("Costo Total", r.costoTotal),
      ],
      foot: tasa > 0 ? [[`Tasa de cambio: RD$ ${nf(tasa)} por US$1.00`, "", ""]] : undefined,
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold", fontSize: 8 },
      columnStyles: { 0: { cellWidth: 220 }, 1: { halign: "right" }, 2: { halign: "right" } },
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

  const descargarPdf = async () => {
    setPdfLoading(true);
    try {
      const lista = escB ? [escA, escB] : [escA];
      const doc = await generarPdf(lista);
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
          <Button variant="outline" onClick={() => setEscB({ ...escA })}>
            <Copy className="h-4 w-4 mr-1" />Duplicar escenario
          </Button>
        )}
        <Button onClick={descargarPdf} disabled={pdfLoading}>
          <FileDown className="h-4 w-4 mr-1" />{pdfLoading ? "Generando…" : "Descargar PDF"}
        </Button>
      </div>

      <div className={`grid gap-4 ${escB ? "lg:grid-cols-2" : "max-w-xl"}`}>
        <ColumnaEscenario
          titulo={escB ? "Escenario A" : "Escenario"}
          esc={escA}
          onChange={(k, v) => setEscA({ ...escA, [k]: v })}
        />
        {escB && (
          <ColumnaEscenario
            titulo="Escenario B"
            esc={escB}
            onChange={(k, v) => setEscB({ ...escB, [k]: v })}
            onQuitar={() => setEscB(null)}
          />
        )}
      </div>

      <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}
