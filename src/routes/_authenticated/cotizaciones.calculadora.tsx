import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcImpuestosLinea } from "@/lib/impuestos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Copy, X, FileDown, Plus, Trash2, Save, Pencil, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DgaProductoSearch } from "@/components/dga-producto-search";
import { toast } from "sonner";
import {
  ServicioAduaneroFields,
  totalServicioUsd,
  subtotalFila,
  type FilaServicio,
} from "@/lib/servicio-aduanero";


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


type Linea = {
  producto: string;
  fob: string;
  peso: string;
  pais?: string;
  codigo?: string; // código arancelario
  unidad?: string;
  cantidad?: string;
  pctGravamen?: string; // vacío = usa el % por defecto del escenario
  pctIsc?: string;
  pctItbis?: string;
  pctGravPref?: string; // tasa preferencial registrada para el código
  acuerdoPref?: string; // acuerdo al que corresponde esa tasa preferencial
};

type Regimen = { codigo: string; nombre: string; suspensivo_impuestos: boolean };
type Acuerdo = { codigo: string; nombre: string };

type Escenario = {
  lineas: Linea[];
  tasa: string;
  fleteReal: boolean;
  flete: string; // % o US$ según fleteReal
  seguroReal: boolean;
  seguro: string;
  pctGravamen: string;
  pctItbis: string;
  servicioFilas: FilaServicio[];
  pctGastos: string;
  regimen?: string;
  regimenSuspensivo?: boolean;
  acuerdo?: string;
  certificado?: boolean;
};

const LINEA_VACIA: Linea = { producto: "", fob: "", peso: "", pais: "" };

const VACIO: Escenario = {
  lineas: [{ ...LINEA_VACIA }],
  tasa: "",
  fleteReal: false,
  flete: "",
  seguroReal: false,
  seguro: "",
  pctGravamen: "",
  pctItbis: "18",
  servicioFilas: [],
  pctGastos: "",
  regimen: "Despacho a Consumo",
  regimenSuspensivo: false,
  acuerdo: "",
  certificado: false,
};

const normTxt = (s?: string | null) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toUpperCase();

/** Indica si la tasa preferencial de la línea corresponde al acuerdo elegido (o no especifica acuerdo). */
function prefCorresponde(l: Linea, acuerdo?: string) {
  if (!acuerdo || !(l.pctGravPref ?? "").trim()) return false;
  if (!(l.acuerdoPref ?? "").trim()) return true;
  return normTxt(l.acuerdoPref).includes(normTxt(acuerdo)) || normTxt(acuerdo).includes(normTxt(l.acuerdoPref));
}


const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

type LineaResultado = {
  producto: string;
  codigo: string;
  pctGravamen: number;
  preferencial: boolean;
  sinTasaPref: boolean;
  selectivo: number;
  pais: string;
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
  selectivo: number;
  itbis: number;
  gastos: number;
  servicio: number;
  lineas: LineaResultado[];
  totalImpuestos: number;
  costoTotal: number;
};

function calcular(e: Escenario, tarifas: TarifaServicio[] = []): Resultado {
  e = { ...e, lineas: e.lineas.filter((l) => l.producto.trim() || num(l.fob) > 0) };
  const totalFob = e.lineas.reduce((a, l) => a + num(l.fob), 0);
  const totalPeso = e.lineas.reduce((a, l) => a + num(l.peso), 0);
  const flete = e.fleteReal ? num(e.flete) : totalFob * (num(e.flete) / 100);
  const seguro = e.seguroReal ? num(e.seguro) : totalFob * (num(e.seguro) / 100);
  const servicio = totalServicioUsd(e.servicioFilas, tarifas);


  const lineas: LineaResultado[] = e.lineas.map((l) => {
    const fob = num(l.fob);
    const share = totalFob > 0 ? fob / totalFob : 1 / Math.max(e.lineas.length, 1);
    const gravGeneral = (l.pctGravamen ?? "").trim() ? num(l.pctGravamen!) : num(e.pctGravamen);
    const conAcuerdo = !!e.acuerdo && !!e.certificado;
    const preferencial = conAcuerdo && prefCorresponde(l, e.acuerdo);
    const pctGrav = preferencial ? num(l.pctGravPref!) : gravGeneral;
    const pctIsc = (l.pctIsc ?? "").trim() ? num(l.pctIsc!) : 0;
    const pctItbis = (l.pctItbis ?? "").trim() ? num(l.pctItbis!) : num(e.pctItbis);
    const r = calcImpuestosLinea(fob, totalFob, seguro, flete, 0, pctGrav, pctIsc > 0, pctIsc, pctItbis, !!e.regimenSuspensivo);
    const gastos = r.cifLinea * (num(e.pctGastos) / 100);
    const servicioLinea = servicio * share;
    return {
      producto: l.producto,
      codigo: l.codigo ?? "",
      pctGravamen: e.regimenSuspensivo ? 0 : pctGrav,
      preferencial,
      sinTasaPref: conAcuerdo && !preferencial && !e.regimenSuspensivo,
      selectivo: r.selectivo,
      pais: l.pais ?? "",
      fob,
      cif: r.cifLinea,
      gravamen: r.gravamen,
      itbis: r.itbis,
      servicio: servicioLinea,
      gastos,
      total: r.cifLinea + r.gravamen + r.selectivo + r.itbis + servicioLinea + gastos,
    };
  });

  const cif = lineas.reduce((a, l) => a + l.cif, 0);
  const gravamen = lineas.reduce((a, l) => a + l.gravamen, 0);
  const selectivo = lineas.reduce((a, l) => a + l.selectivo, 0);
  const itbis = lineas.reduce((a, l) => a + l.itbis, 0);
  const gastos = lineas.reduce((a, l) => a + l.gastos, 0);
  const totalImpuestos = gravamen + selectivo + itbis + gastos + servicio;

  return { totalFob, totalPeso, flete, seguro, cif, gravamen, selectivo, itbis, gastos, servicio, lineas, totalImpuestos, costoTotal: cif + totalImpuestos };
}

const nf = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Estructura compartida de la tabla de resultados (pantalla + PDF)
export const COLUMNAS_RESULTADO = [
  "Producto",
  "Código Arancelario",
  "País de Origen",
  "CIF (US$)",
  "% Grav.",
  "Gravamen (US$)",
  "Selectivo (US$)",
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
    l.codigo || "—",
    l.pais || "—",
    nf(l.cif),
    `${nf(l.pctGravamen)}%${l.preferencial ? " (pref.)" : ""}`,
    nf(l.gravamen),
    nf(l.selectivo),
    nf(l.itbis),
    nf(l.servicio),
    nf(l.gastos),
    rd(l.total),
    nf(l.total),
  ]);
  const foot = [
    "TOTALES",
    "",
    "",
    nf(r.cif),
    "",
    nf(r.gravamen),
    nf(r.selectivo),
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
    <div className="rounded-md border overflow-auto max-h-[70vh]">
      <table className="w-full text-xs">
        <thead className="sticky-table-header bg-muted/50">
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
  titulo, esc, tarifas, regimenes, acuerdos, onChange, onQuitar,
}: {
  titulo: string;
  esc: Escenario;
  tarifas: TarifaServicio[];
  regimenes: Regimen[];
  acuerdos: Acuerdo[];
  onChange: (e: Escenario) => void;
  onQuitar?: () => void;
}) {
  const r = calcular(esc, tarifas);

  const tasa = num(esc.tasa);
  const rd = (n: number) => (tasa > 0 ? nf(n * tasa) : "—");
  const set = (k: keyof Escenario, v: any) => onChange({ ...esc, [k]: v });

  const [borrador, setBorrador] = useState<Linea>({ ...LINEA_VACIA });
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [searchKey, setSearchKey] = useState(0);
  const setB = (k: keyof Linea, v: string) => setBorrador((b) => ({ ...b, [k]: v }));
  // Líneas reales (se ignoran filas vacías heredadas del formato anterior)
  const lineasReales = esc.lineas.filter((l) => l.producto.trim() || num(l.fob) > 0);

  const limpiarBorrador = () => { setBorrador({ ...LINEA_VACIA }); setEditIdx(null); setSearchKey((k) => k + 1); };

  const guardarLinea = () => {
    if (!borrador.producto.trim() && !(borrador.codigo ?? "").trim()) { toast.error("Indica el producto o el código arancelario"); return; }
    if (num(borrador.fob) <= 0) { toast.error("Indica el valor FOB de la línea"); return; }
    const linea = { ...borrador, producto: borrador.producto.trim() || borrador.codigo!.trim() };
    const lineas = editIdx != null
      ? lineasReales.map((l, i) => (i === editIdx ? linea : l))
      : [...lineasReales, linea];
    onChange({ ...esc, lineas });
    limpiarBorrador();
  };

  const modificar = (i: number) => { setBorrador({ ...LINEA_VACIA, ...lineasReales[i] }); setEditIdx(i); };
  const borrar = (i: number) => {
    const lineas = lineasReales.filter((_, idx) => idx !== i);
    onChange({ ...esc, lineas: lineas.length ? lineas : [{ ...LINEA_VACIA }] });
    if (editIdx === i) limpiarBorrador();
  };

  const elegirProducto = async (p: import("@/lib/dga-productos").DgaProducto) => {
    const partida = (p.partida_arancelaria ?? "").trim();
    const str = (n: number | null | undefined) => (n != null ? String(n) : "");
    setBorrador((b) => ({
      ...b,
      producto: p.nombre_producto ?? b.producto,
      codigo: partida || b.codigo,
      unidad: p.unidad ?? b.unidad,
      pais: b.pais || (p.pais ?? ""),
      pctGravamen: str(p.pct_gravamen),
      pctIsc: p.aplica_isc ? str(p.pct_isc) : "",
      pctItbis: str(p.pct_itbis),
      pctGravPref: "",
      acuerdoPref: "",
    }));
    if (!partida) return;
    const { data } = await supabase
      .from("catalogo_tasas_arancelarias")
      .select("pct_gravamen, pct_gravamen_preferencial, acuerdo_preferencial, aplica_isc, pct_isc, pct_itbis")
      .eq("codigo_arancelario", partida)
      .maybeSingle();
    if (!data) return;
    setBorrador((b) => ({
      ...b,
      pctGravamen: b.pctGravamen || str(data.pct_gravamen),
      pctIsc: b.pctIsc || (data.aplica_isc ? str(data.pct_isc) : ""),
      pctItbis: b.pctItbis || str(data.pct_itbis),
      pctGravPref: str(data.pct_gravamen_preferencial),
      acuerdoPref: data.acuerdo_preferencial ?? "",
    }));
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
        {/* Régimen y acuerdo comercial */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Régimen Aduanero</Label>
            <Select
              value={esc.regimen || undefined}
              onValueChange={(v) => {
                const r = regimenes.find((x) => x.nombre === v);
                onChange({ ...esc, regimen: v, regimenSuspensivo: !!r?.suspensivo_impuestos });
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona régimen" /></SelectTrigger>
              <SelectContent>
                {regimenes.map((r) => (
                  <SelectItem key={r.codigo + r.nombre} value={r.nombre}>{r.codigo} — {r.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {esc.regimenSuspensivo && (
              <span className="text-[11px] text-muted-foreground">Régimen suspensivo: impuestos en 0.</span>
            )}
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Acuerdo Comercial</Label>
            <Select
              value={esc.acuerdo || "__ninguno"}
              onValueChange={(v) => onChange({ ...esc, acuerdo: v === "__ninguno" ? "" : v, certificado: v === "__ninguno" ? false : esc.certificado })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ninguno">Ninguno</SelectItem>
                {acuerdos.map((a) => (
                  <SelectItem key={a.codigo} value={a.nombre}>{a.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-xs mt-1">
              <Checkbox
                checked={!!esc.certificado}
                disabled={!esc.acuerdo}
                onCheckedChange={(v) => onChange({ ...esc, certificado: v === true })}
              />
              Certificado de Origen
            </label>
          </div>
        </div>

        {/* Productos */}
        <div className="space-y-2">
          <Label className="text-xs">Productos</Label>
          <div className="rounded-md border p-3 space-y-2 bg-muted/20">
            <DgaProductoSearch key={searchKey} onSelect={(p) => elegirProducto(p)} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="grid gap-1 col-span-2"><Label className="text-[11px]">Producto</Label>
                <Input value={borrador.producto} onChange={(ev) => setB("producto", ev.target.value)} /></div>
              <div className="grid gap-1"><Label className="text-[11px]">Código arancelario</Label>
                <Input value={borrador.codigo ?? ""} onChange={(ev) => setB("codigo", ev.target.value)} /></div>
              <div className="grid gap-1"><Label className="text-[11px]">País origen</Label>
                <Input value={borrador.pais ?? ""} onChange={(ev) => setB("pais", ev.target.value)} /></div>
              <div className="grid gap-1"><Label className="text-[11px]">Cantidad</Label>
                <Input type="number" step="0.01" min="0" value={borrador.cantidad ?? ""} onChange={(ev) => setB("cantidad", ev.target.value)} /></div>
              <div className="grid gap-1"><Label className="text-[11px]">Unidad</Label>
                <Input value={borrador.unidad ?? ""} onChange={(ev) => setB("unidad", ev.target.value)} /></div>
              <div className="grid gap-1"><Label className="text-[11px]">FOB US$</Label>
                <Input type="number" step="0.01" min="0" value={borrador.fob} onChange={(ev) => setB("fob", ev.target.value)} /></div>
              <div className="grid gap-1"><Label className="text-[11px]">Peso kg</Label>
                <Input type="number" step="0.01" min="0" value={borrador.peso} onChange={(ev) => setB("peso", ev.target.value)} /></div>
              <div className="grid gap-1"><Label className="text-[11px]">% Gravamen</Label>
                <Input type="number" step="0.01" min="0" value={borrador.pctGravamen ?? ""} placeholder={esc.pctGravamen || "0"} onChange={(ev) => setB("pctGravamen", ev.target.value)} /></div>
              <div className="grid gap-1"><Label className="text-[11px]">% Selectivo (ISC)</Label>
                <Input type="number" step="0.01" min="0" value={borrador.pctIsc ?? ""} placeholder="0" onChange={(ev) => setB("pctIsc", ev.target.value)} /></div>
              <div className="grid gap-1"><Label className="text-[11px]">% ITBIS</Label>
                <Input type="number" step="0.01" min="0" value={borrador.pctItbis ?? ""} placeholder={esc.pctItbis || "18"} onChange={(ev) => setB("pctItbis", ev.target.value)} /></div>
              <div className="grid gap-1"><Label className="text-[11px]">% Grav. preferencial</Label>
                <Input type="number" step="0.01" min="0" value={borrador.pctGravPref ?? ""} placeholder="Sin registrar" onChange={(ev) => setB("pctGravPref", ev.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-2">
              {editIdx != null && <Button variant="ghost" size="sm" onClick={limpiarBorrador}>Cancelar</Button>}
              <Button size="sm" onClick={guardarLinea}>
                {editIdx != null ? <><Check className="h-3.5 w-3.5 mr-1" />Guardar cambios</> : <><Plus className="h-3.5 w-3.5 mr-1" />Agregar</>}
              </Button>
            </div>
          </div>

          {lineasReales.length > 0 && (
            <div className="rounded-md border overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">Producto</th>
                    <th className="p-2 text-left">Código</th>
                    <th className="p-2 text-right">Cant.</th>
                    <th className="p-2 text-right">FOB US$</th>
                    <th className="p-2 text-right">% Grav.</th>
                    <th className="p-2 text-right">% ISC</th>
                    <th className="p-2 text-right">% ITBIS</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineasReales.map((l, i) => {
                    const res = r.lineas[i];
                    return (
                      <tr key={i} className={`border-t tabular-nums ${editIdx === i ? "bg-accent/40" : ""}`}>
                        <td className="p-2">{l.producto}</td>
                        <td className="p-2">{l.codigo || "—"}</td>
                        <td className="p-2 text-right">{l.cantidad ? `${l.cantidad} ${l.unidad ?? ""}` : "—"}</td>
                        <td className="p-2 text-right">{nf(num(l.fob))}</td>
                        <td className="p-2 text-right">
                          {res ? `${nf(res.pctGravamen)}%` : "—"}
                          {res?.preferencial && <Badge variant="secondary" className="ml-1 text-[10px]">Pref.</Badge>}
                          {res?.sinTasaPref && <span className="ml-1 text-[10px] text-muted-foreground" title="No hay tasa preferencial registrada para este código y acuerdo; se usa el gravamen general.">(sin pref.)</span>}
                        </td>
                        <td className="p-2 text-right">{(l.pctIsc ?? "").trim() ? `${l.pctIsc}%` : "—"}</td>
                        <td className="p-2 text-right">{(l.pctItbis ?? "").trim() ? l.pctItbis : esc.pctItbis || 18}%</td>
                        <td className="p-2 text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" title="Modificar" onClick={() => modificar(i)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Borrar" onClick={() => borrar(i)}><Trash2 className="h-4 w-4" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
            <Label className="text-xs">% Gravamen por defecto</Label>
            <Input type="number" step="0.01" min="0" value={esc.pctGravamen} onChange={(ev) => set("pctGravamen", ev.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">% ITBIS por defecto</Label>
            <Input type="number" step="0.01" min="0" value={esc.pctItbis} onChange={(ev) => set("pctItbis", ev.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">% Gastos (otros)</Label>
            <Input type="number" step="0.01" min="0" value={esc.pctGastos} onChange={(ev) => set("pctGastos", ev.target.value)} />
          </div>
        </div>

        {/* Servicio aduanero */}
        <div className="grid gap-2">
          <ServicioAduaneroFields
            filas={esc.servicioFilas}
            onChange={(filas) => set("servicioFilas", filas)}
          />
        </div>


        {/* Resultados */}
        <div className="rounded-md border bg-muted/30 p-3">
          {fila("Total FOB", r.totalFob)}
          {fila(esc.fleteReal ? "Flete (real)" : `Flete (${esc.flete || 0}%)`, r.flete)}
          {fila(esc.seguroReal ? "Seguro (real)" : `Seguro (${esc.seguro || 0}%)`, r.seguro)}
          {fila("Gravamen", r.gravamen)}
          {fila("Selectivo (ISC)", r.selectivo)}
          {fila("ITBIS", r.itbis)}
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
    const r = calcular(e, tarifas);

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
        0: { cellWidth: 120 }, 1: { cellWidth: 62 }, 2: { cellWidth: 50 },
        3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
        7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" }, 11: { halign: "right" },
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
        [`Régimen: ${e.regimen || "—"}${e.regimenSuspensivo ? " (suspensivo)" : ""}`, "", ""],
        [`Acuerdo comercial: ${e.acuerdo || "Ninguno"}${e.acuerdo ? (e.certificado ? " — con Certificado de Origen" : " — sin Certificado de Origen") : ""}`, "", ""],
        fila("Gravamen", r.gravamen),
        fila("Selectivo (ISC)", r.selectivo ?? 0),
        fila("ITBIS", r.itbis),
        fila(`Gastos (${e.pctGastos || 0}%)`, r.gastos),
        ...(e.servicioFilas.length
          ? e.servicioFilas.map((f) => {
              const t = tarifas.find((x) => x.unidad === f.tipo_despacho);
              return fila(
                t
                  ? `Servicio Aduanero — ${t.tipo_despacho} (${nf(num(String(f.cantidad)))} × US$ ${nf(Number(t.tarifa_usd))})`
                  : "Servicio Aduanero (tipo no reconocido)",
                subtotalFila(f, tarifas),
              );
            })
          : [fila("Servicio Aduanero (no seleccionado)", 0)]),
        ...(e.servicioFilas.length > 1 ? [fila("Total Servicio Aduanero", r.servicio)] : []),

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
  const [importador, setImportador] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const qc = useQueryClient();

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

  const { data: regimenes = [] } = useQuery({
    queryKey: ["calc-regimenes-importacion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_regimenes")
        .select("codigo, nombre, suspensivo_impuestos")
        .eq("tipo_operacion", "importacion")
        .order("nombre");
      if (error) throw error;
      return ((data ?? []) as Regimen[]).sort((a, b) => Number(a.codigo) - Number(b.codigo));
    },
  });

  const { data: acuerdos = [] } = useQuery({
    queryKey: ["calc-acuerdos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("catalogo_acuerdos").select("codigo, nombre").order("nombre");
      if (error) throw error;
      return (data ?? []) as Acuerdo[];
    },
  });

  const { data: guardados = [] } = useQuery({
    queryKey: ["calculos-pre-liquidacion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calculos_pre_liquidacion")
        .select("id, nombre_importador, tasa_cambio, datos_entrada, resultado, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const descargarPdf = async () => {
    setPdfLoading(true);
    try {
      const lista = escB ? [escA, escB] : [escA];
      const doc = await generarPdf(lista, tarifas, importador);
      doc.save(`Calculadora_Rapida_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF descargado");
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo generar el PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const resultado = {
        escenarioA: calcular(escA, tarifas),
        escenarioB: escB ? calcular(escB, tarifas) : null,

      };
      const { error } = await supabase.from("calculos_pre_liquidacion").insert({
        nombre_importador: importador.trim() || null,
        tasa_cambio: num(escA.tasa) || null,
        datos_entrada: { importador, escenarioA: escA, escenarioB: escB } as any,
        resultado: resultado as any,
        creado_por: userData.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Cálculo guardado");
      qc.invalidateQueries({ queryKey: ["calculos-pre-liquidacion"] });
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo guardar el cálculo");
    } finally {
      setGuardando(false);
    }
  };

  const abrir = (row: any) => {
    const d = row.datos_entrada ?? {};
    if (!d.escenarioA) { toast.error("El cálculo guardado no tiene datos válidos"); return; }
    setImportador(d.importador ?? row.nombre_importador ?? "");
    const norm = (x: any): Escenario => ({ ...VACIO, regimen: "", ...x });
    setEscA(norm(d.escenarioA));
    setEscB(d.escenarioB ? norm(d.escenarioB) : null);
    toast.success("Cálculo cargado");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminar = async (id: string) => {
    const { error } = await supabase.from("calculos_pre_liquidacion").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cálculo eliminado");
    qc.invalidateQueries({ queryKey: ["calculos-pre-liquidacion"] });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Calculator className="h-6 w-6 text-muted-foreground" />
        <div className="flex-1 min-w-[240px]">
          <h1 className="font-display text-2xl font-bold">Calculadora Rápida de Pre-Liquidación</h1>
          <p className="text-sm text-muted-foreground">
            Cálculo referencial por porcentajes — puedes guardarlo y reabrirlo cuando lo necesites.
          </p>
        </div>
        {!escB && (
          <Button variant="outline" onClick={() => setEscB({ ...escA, lineas: escA.lineas.map((l) => ({ ...l })) })}>
            <Copy className="h-4 w-4 mr-1" />Duplicar escenario
          </Button>
        )}
        <Button variant="outline" onClick={guardar} disabled={guardando}>
          <Save className="h-4 w-4 mr-1" />{guardando ? "Guardando…" : "Guardar cálculo"}
        </Button>
        <Button onClick={descargarPdf} disabled={pdfLoading}>
          <FileDown className="h-4 w-4 mr-1" />{pdfLoading ? "Generando…" : "Descargar PDF"}
        </Button>
      </div>

      <div className="grid gap-1 max-w-md">
        <Label className="text-xs">Nombre del Importador</Label>
        <Input value={importador} placeholder="Opcional" onChange={(e) => setImportador(e.target.value)} />
      </div>

      <div className={`grid gap-4 ${escB ? "xl:grid-cols-2" : ""}`}>
        <ColumnaEscenario
          titulo={escB ? "Escenario A" : "Escenario"}
          esc={escA}
          tarifas={tarifas}
          regimenes={regimenes}
          acuerdos={acuerdos}
          onChange={setEscA}
        />
        {escB && (
          <ColumnaEscenario
            titulo="Escenario B"
            esc={escB}
            tarifas={tarifas}
            regimenes={regimenes}
            acuerdos={acuerdos}
            onChange={setEscB}
            onQuitar={() => setEscB(null)}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cálculos guardados</CardTitle>
        </CardHeader>
        <CardContent>
          {guardados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay cálculos guardados.</p>
          ) : (
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="sticky-table-header bg-muted/50">
                  <tr>
                    <th className="text-left p-2">Fecha</th>
                    <th className="text-left p-2">Importador</th>
                    <th className="text-right p-2">Costo Total (US$)</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {guardados.map((row: any) => {
                    const costo =
                      (row.resultado?.escenarioA?.costoTotal ?? 0) + (row.resultado?.escenarioB?.costoTotal ?? 0);
                    return (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">{new Date(row.created_at).toLocaleString("es-DO")}</td>
                        <td className="p-2">{row.nombre_importador || "—"}</td>
                        <td className="p-2 text-right tabular-nums">{nf(costo)}</td>
                        <td className="p-2 text-right whitespace-nowrap">
                          <Button variant="outline" size="sm" onClick={() => abrir(row)}>Abrir</Button>
                          <Button variant="ghost" size="icon" className="ml-1" title="Eliminar" onClick={() => eliminar(row.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}
