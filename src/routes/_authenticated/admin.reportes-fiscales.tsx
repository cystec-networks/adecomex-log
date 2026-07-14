import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileText, Download, CheckCircle2, AlertTriangle, History, Save } from "lucide-react";
import { toast } from "sonner";
import { useMyRoles, useCurrentUser } from "@/lib/auth-hooks";
import { fmtLocalDate } from "@/lib/dates";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/reportes-fiscales")({
  component: ReportesFiscalesPage,
});

const MESES = [
  { v: "01", l: "Enero" }, { v: "02", l: "Febrero" }, { v: "03", l: "Marzo" },
  { v: "04", l: "Abril" }, { v: "05", l: "Mayo" }, { v: "06", l: "Junio" },
  { v: "07", l: "Julio" }, { v: "08", l: "Agosto" }, { v: "09", l: "Septiembre" },
  { v: "10", l: "Octubre" }, { v: "11", l: "Noviembre" }, { v: "12", l: "Diciembre" },
];

const TIPOS_ID = [
  { v: "RNC", l: "RNC" }, { v: "CEDULA", l: "Cédula" }, { v: "PASAPORTE", l: "Pasaporte" },
];
const TIPOS_NCF = ["01","02","03","04","11","12","13","14","15","16","17"];

const RNC_RE = /^\d{9}$|^\d{11}$/;
const NCF_RE = /^[A-Za-z0-9]{11}$|^[A-Za-z0-9]{13}$/;

type Origen = "gasto" | "gasto_operativo";
type Row = {
  key: string;
  id: string;
  origen: Origen;
  fecha: string | null;
  proveedor: string | null;
  concepto: string;
  rnc_cedula_proveedor: string | null;
  tipo_id_proveedor: string | null;
  ncf_proveedor: string | null;
  tipo_ncf_proveedor: string | null;
  ncf_modificado: string | null;
  monto_facturado: number;
  itbis_facturado: number;
  itbis_retenido: number;
  isr_retenido: number;
  forma_pago: string | null;
};

function fmtRD(n: number) {
  return `RD$ ${(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function download(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function periodoLabel(p: string) {
  const y = p.slice(0, 4), m = p.slice(4, 6);
  return `${MESES.find(x => x.v === m)?.l ?? m} ${y}`;
}

function validateRow(r: Row): string[] {
  const errs: string[] = [];
  if (!r.rnc_cedula_proveedor) errs.push("RNC/Cédula vacío");
  else if (!RNC_RE.test(r.rnc_cedula_proveedor)) errs.push("RNC/Cédula debe tener 9 u 11 dígitos numéricos");
  if (!r.ncf_proveedor) errs.push("NCF vacío");
  else if (!NCF_RE.test(r.ncf_proveedor)) errs.push("NCF debe tener 11 o 13 caracteres alfanuméricos");
  if (!r.tipo_ncf_proveedor) errs.push("Tipo NCF vacío");
  if (!r.monto_facturado || r.monto_facturado <= 0) errs.push("Monto facturado vacío o cero");
  return errs;
}

function ReportesFiscalesPage() {
  const { user, loading: userLoading } = useCurrentUser();
  const { data: roles, isPending: rolesPending, fetchStatus } = useMyRoles();
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [tab, setTab] = useState("606");
  const periodo = `${year}${month}`;

  if (userLoading || (user && rolesPending && fetchStatus !== "idle")) {
    return <div className="p-6">Cargando…</div>;
  }
  if (!user) return <Navigate to="/auth" />;
  const allowed = roles?.some(r => r === "admin" || r === "finanzas");
  if (!allowed) return <Navigate to="/dashboard" />;



  const years = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - i));

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Reportes Fiscales DGII</h1>
          <p className="text-sm text-muted-foreground">
            Genera los formatos 606, 608 para envío a la DGII. Período: <b>{periodoLabel(periodo)}</b>
          </p>
        </div>
        <Card className="p-3">
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">Mes</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Año</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Badge variant="outline" className="ml-1">AAAAMM: {periodo}</Badge>
          </div>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="606">606 · Compras</TabsTrigger>
          <TabsTrigger value="608">608 · Anulados</TabsTrigger>
          <TabsTrigger value="historial"><History className="h-4 w-4 mr-1" />Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="606"><Panel606 periodo={periodo} /></TabsContent>
        <TabsContent value="608"><Panel608 periodo={periodo} /></TabsContent>
        <TabsContent value="historial"><PanelHistorial /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============================== 606 ==============================
function Panel606({ periodo }: { periodo: string }) {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const y = periodo.slice(0, 4), m = periodo.slice(4, 6);
  const from = `${y}-${m}-01`;
  const nextM = new Date(+y, +m, 1);
  const to = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, "0")}-01`;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["reporte-606", periodo],
    queryFn: async (): Promise<Row[]> => {
      const cols = "id,fecha,proveedor,concepto,rnc_cedula_proveedor,tipo_id_proveedor,ncf_proveedor,tipo_ncf_proveedor,ncf_modificado,monto_facturado,itbis_facturado,itbis_retenido,isr_retenido,forma_pago";
      const [g, go] = await Promise.all([
        supabase.from("gastos").select(cols)
          .not("rnc_cedula_proveedor", "is", null)
          .gte("fecha", from).lt("fecha", to)
          .is("deleted_at", null),
        supabase.from("gastos_operativos").select(cols)
          .not("rnc_cedula_proveedor", "is", null)
          .gte("fecha", from).lt("fecha", to)
          .is("deleted_at", null),
      ]);
      if (g.error) throw g.error;
      if (go.error) throw go.error;
      const map = (arr: any[], origen: Origen): Row[] => arr.map(r => ({
        key: `${origen}:${r.id}`, origen, ...r,
        monto_facturado: Number(r.monto_facturado) || 0,
        itbis_facturado: Number(r.itbis_facturado) || 0,
        itbis_retenido: Number(r.itbis_retenido) || 0,
        isr_retenido: Number(r.isr_retenido) || 0,
      }));
      return [...map(g.data ?? [], "gasto"), ...map(go.data ?? [], "gasto_operativo")]
        .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
    },
  });

  const [validated, setValidated] = useState(false);
  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({});

  const merged = useMemo(() => (data ?? []).map(r => ({ ...r, ...edits[r.key] })), [data, edits]);
  const errors = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const r of merged) {
      const e = validateRow(r);
      if (e.length) m[r.key] = e;
    }
    return m;
  }, [merged]);
  const errorRows = merged.filter(r => errors[r.key]);
  const canGenerate = validated && errorRows.length === 0 && merged.length > 0;

  const setField = (key: string, patch: Partial<Row>) =>
    setEdits(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const saveEdits = async () => {
    const entries = Object.entries(edits);
    if (!entries.length) { toast.info("No hay cambios"); return; }
    let ok = 0, fail = 0;
    for (const [key, patch] of entries) {
      const [origen, id] = key.split(":");
      const table = origen === "gasto" ? "gastos" : "gastos_operativos";
      const { error } = await supabase.from(table as any).update(patch).eq("id", id);
      if (error) fail++; else ok++;
    }
    toast[fail ? "error" : "success"](`Guardado: ${ok} · Errores: ${fail}`);
    setEdits({});
    await refetch();
    setValidated(false);
  };

  const generar = async () => {
    // Layout preliminar 606 (pipe-separado). Se ajustará al instructivo oficial.
    // Columnas: RNC/Céd|TipoID|TipoBienServicio|NCF|NCFModificado|FechaComprobante|FechaPago|MontoFacturado|ITBISFacturado|ITBISRetenido|ISRRetenido|FormaPago
    const lines = merged.map(r => [
      r.rnc_cedula_proveedor ?? "",
      r.tipo_id_proveedor ?? "",
      "09", // Tipo bien/servicio genérico (ajustable)
      r.ncf_proveedor ?? "",
      r.ncf_modificado ?? "",
      (r.fecha ?? "").replace(/-/g, ""),
      (r.fecha ?? "").replace(/-/g, ""),
      r.monto_facturado.toFixed(2),
      (r.itbis_facturado || 0).toFixed(2),
      (r.itbis_retenido || 0).toFixed(2),
      (r.isr_retenido || 0).toFixed(2),
      r.forma_pago ?? "",
    ].join("|"));
    const content = lines.join("\r\n") + "\r\n";
    const filename = `606_${periodo}.txt`;
    download(filename, content);

    const total = merged.reduce((s, r) => s + r.monto_facturado, 0);
    const { error } = await supabase.from("envios_dgii").upsert({
      formato: "606", periodo,
      generado_por: user?.id ?? null,
      fecha_generado: new Date().toISOString(),
      cantidad_registros: merged.length,
      monto_total: total,
      archivo_path: filename,
    }, { onConflict: "formato,periodo" });
    if (error) toast.error(`Archivo descargado, pero no se registró en historial: ${error.message}`);
    else toast.success("Archivo 606 generado y registrado en historial");
    qc.invalidateQueries({ queryKey: ["envios-dgii"] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Formato 606 · Compras</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? "Cargando…" : `${merged.length} registro(s) encontrados en ${periodoLabel(periodo)}`}
            </p>
          </div>
          <div className="flex gap-2">
            {Object.keys(edits).length > 0 && (
              <Button variant="outline" onClick={saveEdits}>
                <Save className="h-4 w-4 mr-1" /> Guardar cambios ({Object.keys(edits).length})
              </Button>
            )}
            <Button variant="outline" onClick={() => setValidated(true)} disabled={merged.length === 0}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Validar
            </Button>
            <Button onClick={generar} disabled={!canGenerate}>
              <Download className="h-4 w-4 mr-1" /> Generar archivo 606
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {validated && (
          errorRows.length === 0 ? (
            <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 px-3 py-2 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Validación exitosa · sin errores. Ya puedes generar el archivo.
            </div>
          ) : (
            <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-900 px-3 py-2 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Se encontraron {errorRows.length} registro(s) con errores. Corrígelos abajo y vuelve a validar.
            </div>
          )
        )}

        {validated && errorRows.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-sm mb-2">Registros con errores</h3>
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origen</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo ID</TableHead>
                    <TableHead>RNC/Cédula</TableHead>
                    <TableHead>Tipo NCF</TableHead>
                    <TableHead>NCF</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Problema</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errorRows.map(r => (
                    <TableRow key={r.key}>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {r.origen === "gasto" ? "Expediente" : "Operativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.proveedor ?? <span className="text-muted-foreground italic">{r.concepto}</span>}</TableCell>
                      <TableCell className="text-xs">{fmtLocalDate(r.fecha)}</TableCell>
                      <TableCell>
                        <Select value={r.tipo_id_proveedor ?? ""} onValueChange={v => setField(r.key, { tipo_id_proveedor: v })}>
                          <SelectTrigger className="h-8 w-[110px]"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {TIPOS_ID.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 w-[130px]" value={r.rnc_cedula_proveedor ?? ""}
                          onChange={e => setField(r.key, { rnc_cedula_proveedor: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Select value={r.tipo_ncf_proveedor ?? ""} onValueChange={v => setField(r.key, { tipo_ncf_proveedor: v })}>
                          <SelectTrigger className="h-8 w-[80px]"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {TIPOS_NCF.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 w-[150px]" value={r.ncf_proveedor ?? ""}
                          onChange={e => setField(r.key, { ncf_proveedor: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" className="h-8 w-[120px] text-right"
                          value={r.monto_facturado || ""}
                          onChange={e => setField(r.key, { monto_facturado: Number(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell className="text-xs text-red-700">
                        {errors[r.key].map((e, i) => <div key={i}>• {e}</div>)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Origen</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>RNC/Cédula</TableHead>
                <TableHead>NCF</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">ITBIS</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {merged.length === 0 && !isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Sin registros con RNC/cédula en este período.</TableCell></TableRow>
              )}
              {merged.map(r => {
                const hasErr = !!errors[r.key];
                return (
                  <TableRow key={r.key}>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.origen === "gasto" ? "Expediente" : "Operativo"}</Badge></TableCell>
                    <TableCell className="text-xs">{fmtLocalDate(r.fecha)}</TableCell>
                    <TableCell className="text-xs">{r.proveedor ?? <span className="text-muted-foreground italic">{r.concepto}</span>}</TableCell>
                    <TableCell className="text-xs font-mono">{r.rnc_cedula_proveedor ?? "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{r.ncf_proveedor ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.tipo_ncf_proveedor ?? "—"}</TableCell>
                    <TableCell className="text-xs text-right">{fmtRD(r.monto_facturado)}</TableCell>
                    <TableCell className="text-xs text-right">{fmtRD(r.itbis_facturado)}</TableCell>
                    <TableCell>
                      {validated
                        ? (hasErr
                          ? <Badge className="bg-red-500/15 text-red-700 border-red-500/30">Con error</Badge>
                          : <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">OK</Badge>)
                        : <Badge variant="outline">Pendiente</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================== 608 ==============================
type Row608 = {
  key: string;
  id: string;
  encf: string;
  tipo_comprobante: string;
  fecha_emision: string;
  fecha_anulacion: string | null;
  motivo_anulacion: string | null;
  monto_total: number;
};

function Panel608({ periodo }: { periodo: string }) {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const y = periodo.slice(0, 4), m = periodo.slice(4, 6);
  const from = `${y}-${m}-01`;
  const nextM = new Date(+y, +m, 1);
  const to = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, "0")}-01`;

  const { data, isLoading } = useQuery({
    queryKey: ["reporte-608", periodo],
    queryFn: async (): Promise<Row608[]> => {
      const { data, error } = await supabase.from("facturas_ecf")
        .select("id,encf,tipo_comprobante,fecha_emision,fecha_anulacion,motivo_anulacion,monto_total")
        .eq("estado", "anulada")
        .gte("fecha_emision", from).lt("fecha_emision", to)
        .is("eliminado_en", null)
        .order("fecha_emision");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, key: r.id, monto_total: Number(r.monto_total) || 0 }));
    },
  });

  const [validated, setValidated] = useState(false);
  const rows = data ?? [];
  const errors = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const r of rows) {
      const e: string[] = [];
      if (!r.encf || !NCF_RE.test(r.encf)) e.push("e-NCF con formato inválido");
      if (!r.fecha_anulacion) e.push("Falta fecha de anulación");
      if (!r.tipo_comprobante) e.push("Falta tipo de comprobante");
      if (e.length) m[r.key] = e;
    }
    return m;
  }, [rows]);
  const errorRows = rows.filter(r => errors[r.key]);
  const canGenerate = validated && errorRows.length === 0 && rows.length > 0;

  const generar = async () => {
    // Layout preliminar 608 (pipe-separado): e-NCF|TipoComprobante|FechaComprobante|FechaAnulacion|MontoTotal|Motivo
    const lines = rows.map(r => [
      r.encf,
      r.tipo_comprobante,
      (r.fecha_emision ?? "").replace(/-/g, ""),
      (r.fecha_anulacion ?? "").replace(/-/g, ""),
      r.monto_total.toFixed(2),
      (r.motivo_anulacion ?? "").replace(/\|/g, " "),
    ].join("|"));
    const content = lines.join("\r\n") + "\r\n";
    const filename = `608_${periodo}.txt`;
    download(filename, content);

    const total = rows.reduce((s, r) => s + r.monto_total, 0);
    const { error } = await supabase.from("envios_dgii").upsert({
      formato: "608", periodo,
      generado_por: user?.id ?? null,
      fecha_generado: new Date().toISOString(),
      cantidad_registros: rows.length,
      monto_total: total,
      archivo_path: filename,
    }, { onConflict: "formato,periodo" });
    if (error) toast.error(`Archivo descargado, pero no se registró en historial: ${error.message}`);
    else toast.success("Archivo 608 generado y registrado en historial");
    qc.invalidateQueries({ queryKey: ["envios-dgii"] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Formato 608 · Anulados</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? "Cargando…" : `${rows.length} e-CF anulada(s) en ${periodoLabel(periodo)}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setValidated(true)} disabled={rows.length === 0}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Validar
            </Button>
            <Button onClick={generar} disabled={!canGenerate}>
              <Download className="h-4 w-4 mr-1" /> Generar archivo 608
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {validated && (
          errorRows.length === 0 ? (
            <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 px-3 py-2 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Validación exitosa · sin errores.
            </div>
          ) : (
            <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-900 px-3 py-2 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {errorRows.length} registro(s) con errores. Corrígelos en el módulo de Facturación (e-CF).
            </div>
          )
        )}
        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>e-NCF</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fecha emisión</TableHead>
                <TableHead>Fecha anulación</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin e-CF anuladas en este período.</TableCell></TableRow>
              )}
              {rows.map(r => {
                const hasErr = !!errors[r.key];
                return (
                  <TableRow key={r.key}>
                    <TableCell className="text-xs font-mono">{r.encf}</TableCell>
                    <TableCell className="text-xs">{r.tipo_comprobante}</TableCell>
                    <TableCell className="text-xs">{fmtLocalDate(r.fecha_emision)}</TableCell>
                    <TableCell className="text-xs">{fmtLocalDate(r.fecha_anulacion)}</TableCell>
                    <TableCell className="text-xs">{r.motivo_anulacion ?? "—"}</TableCell>
                    <TableCell className="text-xs text-right">{fmtRD(r.monto_total)}</TableCell>
                    <TableCell>
                      {validated
                        ? (hasErr
                          ? <Badge className="bg-red-500/15 text-red-700 border-red-500/30">{errors[r.key].join(", ")}</Badge>
                          : <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">OK</Badge>)
                        : <Badge variant="outline">Pendiente</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================== Historial ==============================
function PanelHistorial() {
  const { data, isLoading } = useQuery({
    queryKey: ["envios-dgii"],
    queryFn: async () => {
      const { data, error } = await supabase.from("envios_dgii")
        .select("*").order("fecha_generado", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Historial de envíos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Formato</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Generado</TableHead>
                <TableHead className="text-right">Registros</TableHead>
                <TableHead className="text-right">Monto total</TableHead>
                <TableHead>Archivo</TableHead>
                <TableHead>N° acuse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-4">Cargando…</TableCell></TableRow>}
              {(data ?? []).length === 0 && !isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Aún no se han generado archivos.</TableCell></TableRow>
              )}
              {(data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="outline">{r.formato}</Badge></TableCell>
                  <TableCell className="text-xs">{periodoLabel(r.periodo)}</TableCell>
                  <TableCell className="text-xs">{new Date(r.fecha_generado).toLocaleString("es-DO")}</TableCell>
                  <TableCell className="text-xs text-right">{r.cantidad_registros}</TableCell>
                  <TableCell className="text-xs text-right">{fmtRD(Number(r.monto_total) || 0)}</TableCell>
                  <TableCell className="text-xs font-mono">{r.archivo_path ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.numero_acuse ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
