import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, Trash2, Pencil, X, Check, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useMyRoles } from "@/lib/auth-hooks";

const RETENCION_TIPOS = [
  { v: "norma_08_04", l: "Norma 08-04 (30% ITBIS)" },
  { v: "bsp_iata", l: "BSP / IATA" },
  { v: "otras_norma_02_05", l: "Otras (Norma 02-05, 100% ITBIS)" },
  { v: "credito_retencion_estado", l: "Crédito por retención del Estado" },
  { v: "itbis_percibido", l: "ITBIS Percibido" },
] as const;

const RETENCION_LABEL: Record<string, string> = Object.fromEntries(
  RETENCION_TIPOS.map((t) => [t.v, t.l]),
);

const ANEXO_A_LABEL: Record<string, string> = {
  credito_fiscal: "Crédito fiscal (01/31)",
  consumo: "Consumo (02/32)",
  nota_debito: "Nota de débito (03/33)",
  nota_credito: "Nota de crédito (04/34)",
  regimenes_especiales: "Regímenes especiales (14/44)",
  gubernamentales: "Gubernamentales (15/45)",
  exportaciones: "Exportaciones (16/46)",
  otros: "Otros",
};

const FORMA_PAGO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  cheque_transferencia: "Cheque / Transferencia",
  tarjeta: "Tarjeta",
  credito: "Crédito",
  permuta: "Permuta",
  nota_credito: "Nota de crédito",
  mixto: "Mixto",
  sin_dato: "Sin dato",
};

const TIPO_INGRESO_LABEL: Record<string, string> = {
  operaciones: "Operaciones (ingresos por operaciones)",
  financieros: "Ingresos financieros",
  extraordinarios: "Ingresos extraordinarios",
  arrendamientos: "Arrendamientos",
  venta_activos_depreciables: "Venta de activos",
  otros: "Otros ingresos",
};

function fmt(n: any) {
  const v = Number(n) || 0;
  return v.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: any) {
  const v = Number(n) || 0;
  return `${(v * 100).toLocaleString("es-DO", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`;
}

type CalcResult = {
  periodo: string;
  categoria_exenta_casilla: string;
  ventas: {
    total_operaciones: number;
    total_gravadas: number;
    total_no_gravadas: number;
    gravadas_por_tasa: Record<string, number>;
    itbis_cobrado: number;
    por_forma_pago: Record<string, number>;
    por_tipo_ingreso: Record<string, number>;
    anexo_a_por_tipo: Record<string, { cantidad: number; monto: number; itbis: number }>;
  };
  compras: {
    itbis_adelantar_bienes: number;
    itbis_adelantar_servicios: number;
    itbis_sujeto_proporcionalidad: number;
    coeficiente_proporcionalidad: number;
    itbis_admitido_proporcionalidad: number;
    itbis_deducible_total: number;
  };
  retenciones_recibidas: {
    total_pagos_computables: number;
    [k: string]: number;
  };
  declaracion: {
    saldo_favor_anterior: number;
    recargos: number;
    interes_indemnizatorio: number;
    sanciones: number;
    estado: string;
  };
  resultado: {
    impuesto_a_pagar_o_saldo_favor: number;
    diferencia_a_pagar_final: number;
  };
};

export function PanelITBIS({ periodo }: { periodo: string }) {
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const isAdmin = roles?.includes("admin") ?? false;

  const { data, isLoading, error } = useQuery({
    queryKey: ["calc_itbis", periodo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("calc_itbis_periodo" as any, { _periodo: periodo });
      if (error) throw error;
      return data as CalcResult;
    },
  });

  const { data: empresaRnc } = useQuery({
    queryKey: ["system_settings", "empresa_rnc"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings").select("value").eq("key", "empresa_rnc").maybeSingle();
      return (data?.value as string) ?? "";
    },
  });

  const { data: retencionesList } = useQuery({
    queryKey: ["itbis_retenciones", periodo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itbis_retenciones_recibidas").select("tipo,monto").eq("periodo", periodo);
      if (error) throw error;
      return (data ?? []) as { tipo: string; monto: number }[];
    },
  });

  if (isLoading) return <div className="p-4 text-sm">Calculando IT-1…</div>;
  if (error) return <div className="p-4 text-sm text-destructive">Error: {(error as Error).message}</div>;
  if (!data) return null;

  const handleDownloadExcel = () => {
    downloadItbisExcel(data, periodo, empresaRnc ?? "", retencionesList ?? []);
  };

  const gravadas = data.ventas.gravadas_por_tasa || {};

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleDownloadExcel}>
          <Download className="h-4 w-4 mr-1" /> Descargar Excel (revisión IT-1)
        </Button>
      </div>
      {/* Anexo A por tipo */}
      <Card>
        <CardHeader>
          <CardTitle>Anexo A — Ventas por tipo de comprobante</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo de comprobante</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">ITBIS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(data.ventas.anexo_a_por_tipo || {}).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>
              )}
              {Object.entries(data.ventas.anexo_a_por_tipo || {}).map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell>{ANEXO_A_LABEL[k] ?? k}</TableCell>
                  <TableCell className="text-right">{v.cantidad}</TableCell>
                  <TableCell className="text-right">{fmt(v.monto)}</TableCell>
                  <TableCell className="text-right">{fmt(v.itbis)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Ventas por forma de pago</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Forma de pago</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(data.ventas.por_forma_pago || {}).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell>{FORMA_PAGO_LABEL[k] ?? k}</TableCell>
                    <TableCell className="text-right">{fmt(v)}</TableCell>
                  </TableRow>
                ))}
                {Object.keys(data.ventas.por_forma_pago || {}).length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ventas por tipo de ingreso</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de ingreso</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(data.ventas.por_tipo_ingreso || {}).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell>{TIPO_INGRESO_LABEL[k] ?? k}</TableCell>
                    <TableCell className="text-right">{fmt(v)}</TableCell>
                  </TableRow>
                ))}
                {Object.keys(data.ventas.por_tipo_ingreso || {}).length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>IT-1 — Operaciones</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Total operaciones" value={fmt(data.ventas.total_operaciones)} />
            <Metric label="Total gravadas" value={fmt(data.ventas.total_gravadas)} />
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                Total no gravadas
                <Badge variant="secondary">Casilla {data.categoria_exenta_casilla} del IT-1</Badge>
              </div>
              <div className="text-lg font-semibold tabular-nums">{fmt(data.ventas.total_no_gravadas)}</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4 pt-2">
            <Metric label="Gravadas 18%" value={fmt(gravadas["18"])} />
            <Metric label="Gravadas 16%" value={fmt(gravadas["16"])} />
            <Metric label="Gravadas 9%" value={fmt(gravadas["9"])} />
            <Metric label="Gravadas 8%" value={fmt(gravadas["8"])} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ITBIS Pagado (Anexo A Sección IX)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="ITBIS por adelantar — Bienes" value={fmt(data.compras.itbis_adelantar_bienes)} />
            <Metric label="ITBIS por adelantar — Servicios" value={fmt(data.compras.itbis_adelantar_servicios)} />
            <Metric label="ITBIS sujeto a proporcionalidad" value={fmt(data.compras.itbis_sujeto_proporcionalidad)} />
            <Metric label="Coeficiente de proporcionalidad" value={fmtPct(data.compras.coeficiente_proporcionalidad)} />
            <Metric label="ITBIS admitido por proporcionalidad" value={fmt(data.compras.itbis_admitido_proporcionalidad)} />
            <Metric label="ITBIS deducible total" value={fmt(data.compras.itbis_deducible_total)} highlight />
          </div>
        </CardContent>
      </Card>

      <PanelRetenciones periodo={periodo} isAdmin={isAdmin} total={data.retenciones_recibidas.total_pagos_computables} />

      <PanelAjustes periodo={periodo} declaracion={data.declaracion} onSaved={() => qc.invalidateQueries({ queryKey: ["calc_itbis", periodo] })} />

      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle>Resultado</CardTitle>
          <CardDescription>Casillas finales del IT-1</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <Metric label="ITBIS Cobrado" value={fmt(data.ventas.itbis_cobrado)} />
            <Metric label="ITBIS Deducible Total" value={fmt(data.compras.itbis_deducible_total)} />
            <Metric label="Impuesto a Pagar o Saldo a Favor" value={fmt(data.resultado.impuesto_a_pagar_o_saldo_favor)} />
            <div className={`rounded-md border p-4 ${data.resultado.diferencia_a_pagar_final > 0 ? "bg-destructive/10 border-destructive/40" : "bg-emerald-500/10 border-emerald-500/40"}`}>
              <div className="text-xs text-muted-foreground">Diferencia a Pagar Final</div>
              <div className={`text-2xl font-bold tabular-nums ${data.resultado.diferencia_a_pagar_final > 0 ? "text-destructive" : "text-emerald-600"}`}>
                {fmt(data.resultado.diferencia_a_pagar_final)}
              </div>
              <div className="text-xs mt-1">
                {data.resultado.diferencia_a_pagar_final > 0 ? "Por pagar" : "A favor / sin pago"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ============ Retenciones ============
type Retencion = {
  id: string;
  periodo: string;
  tipo: string;
  monto: number;
  cliente_o_agente: string | null;
  referencia: string | null;
  notas: string | null;
};

function PanelRetenciones({ periodo, isAdmin, total }: { periodo: string; isAdmin: boolean; total: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["itbis_retenciones", periodo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itbis_retenciones_recibidas")
        .select("*")
        .eq("periodo", periodo)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Retencion[];
    },
  });

  const [tipo, setTipo] = useState<string>(RETENCION_TIPOS[0].v);
  const [monto, setMonto] = useState("");
  const [cliente, setCliente] = useState("");
  const [ref, setRef] = useState("");
  const [notas, setNotas] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Partial<Retencion>>({});

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["itbis_retenciones", periodo] });
    qc.invalidateQueries({ queryKey: ["calc_itbis", periodo] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const m = Number(monto);
      if (!Number.isFinite(m) || m <= 0) throw new Error("Monto inválido");
      const { error } = await supabase.from("itbis_retenciones_recibidas").insert({
        periodo, tipo, monto: m,
        cliente_o_agente: cliente || null,
        referencia: ref || null,
        notas: notas || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Retención registrada");
      setMonto(""); setCliente(""); setRef(""); setNotas("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const patch: any = { ...editRow };
      if (patch.monto != null) patch.monto = Number(patch.monto) || 0;
      const { error } = await supabase.from("itbis_retenciones_recibidas").update(patch).eq("id", editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Actualizado");
      setEditingId(null); setEditRow({});
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("itbis_retenciones_recibidas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Eliminado"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retenciones y percepciones recibidas</CardTitle>
        <CardDescription>Período {periodo} · Total computable: <b className="tabular-nums">{fmt(total)}</b></CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-6 items-end">
          <div className="md:col-span-2">
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RETENCION_TIPOS.map((t) => (
                  <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Monto</Label>
            <Input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Cliente/Agente</Label>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Referencia</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <div>
            <Button onClick={() => add.mutate()} disabled={add.isPending} className="w-full">
              <Save className="h-4 w-4 mr-1" />Agregar
            </Button>
          </div>
          <div className="md:col-span-6">
            <Label className="text-xs">Notas</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Cliente/Agente</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="w-[140px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5}>Cargando…</TableCell></TableRow>}
            {!isLoading && (data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin registros</TableCell></TableRow>
            )}
            {(data ?? []).map((r) => {
              const isEdit = editingId === r.id;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    {isEdit ? (
                      <Select value={(editRow.tipo ?? r.tipo) as string} onValueChange={(v) => setEditRow({ ...editRow, tipo: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RETENCION_TIPOS.map((t) => (
                            <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (RETENCION_LABEL[r.tipo] ?? r.tipo)}
                  </TableCell>
                  <TableCell>
                    {isEdit ? (
                      <Input value={(editRow.cliente_o_agente ?? r.cliente_o_agente ?? "") as string}
                        onChange={(e) => setEditRow({ ...editRow, cliente_o_agente: e.target.value })} />
                    ) : (r.cliente_o_agente ?? "—")}
                  </TableCell>
                  <TableCell>
                    {isEdit ? (
                      <Input value={(editRow.referencia ?? r.referencia ?? "") as string}
                        onChange={(e) => setEditRow({ ...editRow, referencia: e.target.value })} />
                    ) : (r.referencia ?? "—")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {isEdit ? (
                      <Input type="number" step="0.01" className="text-right"
                        value={(editRow.monto ?? r.monto) as any}
                        onChange={(e) => setEditRow({ ...editRow, monto: Number(e.target.value) })} />
                    ) : fmt(r.monto)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {isEdit ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => update.mutate()}><Check className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditRow({}); }}><X className="h-4 w-4" /></Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(r.id); setEditRow({}); }}><Pencil className="h-4 w-4" /></Button>
                          {isAdmin && (
                            <Button size="sm" variant="ghost" onClick={() => { if (confirm("¿Eliminar?")) remove.mutate(r.id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============ Ajustes ============
function PanelAjustes({
  periodo, declaracion, onSaved,
}: { periodo: string; declaracion: CalcResult["declaracion"]; onSaved: () => void }) {
  const [saldo, setSaldo] = useState(String(declaracion.saldo_favor_anterior ?? 0));
  const [recargos, setRecargos] = useState(String(declaracion.recargos ?? 0));
  const [interes, setInteres] = useState(String(declaracion.interes_indemnizatorio ?? 0));
  const [sanciones, setSanciones] = useState(String(declaracion.sanciones ?? 0));
  const [estado, setEstado] = useState<string>(declaracion.estado ?? "borrador");

  useEffect(() => {
    setSaldo(String(declaracion.saldo_favor_anterior ?? 0));
    setRecargos(String(declaracion.recargos ?? 0));
    setInteres(String(declaracion.interes_indemnizatorio ?? 0));
    setSanciones(String(declaracion.sanciones ?? 0));
    setEstado(declaracion.estado ?? "borrador");
  }, [declaracion, periodo]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        periodo,
        saldo_favor_anterior: Number(saldo) || 0,
        recargos: Number(recargos) || 0,
        interes_indemnizatorio: Number(interes) || 0,
        sanciones: Number(sanciones) || 0,
        estado,
      };
      if (estado === "presentada") payload.fecha_presentada = new Date().toISOString();
      const { error } = await supabase
        .from("itbis_declaraciones")
        .upsert(payload, { onConflict: "periodo" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Declaración guardada"); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajustes de la declaración</CardTitle>
        <CardDescription>Se guarda en itbis_declaraciones (upsert por período)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <Label className="text-xs">Saldo a favor anterior</Label>
            <Input type="number" step="0.01" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Recargos</Label>
            <Input type="number" step="0.01" value={recargos} onChange={(e) => setRecargos(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Interés indemnizatorio</Label>
            <Input type="number" step="0.01" value={interes} onChange={(e) => setInteres(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Sanciones</Label>
            <Input type="number" step="0.01" value={sanciones} onChange={(e) => setSanciones(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="presentada">Presentada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-1" />Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ Excel export ============
function downloadItbisExcel(
  data: CalcResult,
  periodo: string,
  rnc: string,
  retenciones: { tipo: string; monto: number }[],
) {
  const N = (n: any) => Number(n) || 0;
  const header = (title: string) => [
    ["DIRECCIÓN GENERAL DE IMPUESTOS INTERNOS"],
    ["DECLARACIÓN JURADA Y/O PAGO DEL ITBIS"],
    [`RNC: ${rnc || "(no configurado)"}`],
    [`Período: ${periodo}`],
    [title],
    [],
  ];

  // ===== Anexo A =====
  const aoaA: any[][] = [
    ...header("Anexo A"),
    ["II. Operaciones reportadas por tipo de NCF"],
    ["Tipo de comprobante", "Cantidad", "Monto"],
  ];
  const anexo = data.ventas.anexo_a_por_tipo || {};
  let totCant = 0, totMonto = 0;
  Object.entries(anexo).forEach(([k, v]) => {
    aoaA.push([ANEXO_A_LABEL[k] ?? k, N(v.cantidad), N(v.monto)]);
    totCant += N(v.cantidad); totMonto += N(v.monto);
  });
  aoaA.push(["TOTAL OPERACIONES", totCant, totMonto], []);

  aoaA.push(["III. Por forma de pago"], ["Forma de pago", "Monto"]);
  Object.entries(data.ventas.por_forma_pago || {}).forEach(([k, v]) =>
    aoaA.push([FORMA_PAGO_LABEL[k] ?? k, N(v)]),
  );
  aoaA.push([]);

  aoaA.push(["IV. Por tipo de ingreso"], ["Tipo de ingreso", "Monto"]);
  Object.entries(data.ventas.por_tipo_ingreso || {}).forEach(([k, v]) =>
    aoaA.push([TIPO_INGRESO_LABEL[k] ?? k, N(v)]),
  );
  aoaA.push([]);

  aoaA.push(
    ["VI y VII. Constructoras y Comisionistas"],
    ["No aplica a esta empresa", 0],
    [],
  );

  aoaA.push(["IX. ITBIS Pagado"], ["Concepto", "Monto"]);
  aoaA.push(["ITBIS por adelantar — Bienes", N(data.compras.itbis_adelantar_bienes)]);
  aoaA.push(["ITBIS por adelantar — Servicios", N(data.compras.itbis_adelantar_servicios)]);
  aoaA.push(["ITBIS sujeto a proporcionalidad", N(data.compras.itbis_sujeto_proporcionalidad)]);
  aoaA.push([
    `Coeficiente de proporcionalidad (${(N(data.compras.coeficiente_proporcionalidad) * 100).toFixed(4)}%)`,
    N(data.compras.coeficiente_proporcionalidad),
  ]);
  aoaA.push(["ITBIS admitido por proporcionalidad", N(data.compras.itbis_admitido_proporcionalidad)]);
  aoaA.push(["Total ITBIS deducible", N(data.compras.itbis_deducible_total)]);

  const wsA = XLSX.utils.aoa_to_sheet(aoaA);
  applyNumberFormat(wsA);
  wsA["!cols"] = [{ wch: 50 }, { wch: 18 }, { wch: 18 }];

  // ===== IT-1 =====
  const aoaB: any[][] = [
    ...header("IT-1"),
    ["II. Ingresos por Operaciones"],
    ["Concepto", "Monto"],
    ["Total operaciones", N(data.ventas.total_operaciones)],
    [`Total no gravadas (Casilla ${data.categoria_exenta_casilla})`, N(data.ventas.total_no_gravadas)],
    ["Total gravadas", N(data.ventas.total_gravadas)],
    ["  Gravadas 18%", N(data.ventas.gravadas_por_tasa?.["18"])],
    ["  Gravadas 16%", N(data.ventas.gravadas_por_tasa?.["16"])],
    ["  Gravadas 9%", N(data.ventas.gravadas_por_tasa?.["9"])],
    ["  Gravadas 8%", N(data.ventas.gravadas_por_tasa?.["8"])],
    [],
    ["III. Liquidación"],
    ["Concepto", "Monto"],
    ["ITBIS Cobrado", N(data.ventas.itbis_cobrado)],
    ["ITBIS Deducible Total", N(data.compras.itbis_deducible_total)],
    ["Impuesto a Pagar o Saldo a Favor", N(data.resultado.impuesto_a_pagar_o_saldo_favor)],
    [],
    ["Retenciones / Percepciones"],
    ["Tipo", "Monto"],
  ];
  const totalesRet: Record<string, number> = {};
  retenciones.forEach((r) => {
    totalesRet[r.tipo] = (totalesRet[r.tipo] || 0) + N(r.monto);
  });
  let totRet = 0;
  Object.entries(totalesRet).forEach(([k, v]) => {
    aoaB.push([RETENCION_LABEL[k] ?? k, N(v)]);
    totRet += N(v);
  });
  aoaB.push(["Total retenciones/percepciones", totRet], []);

  aoaB.push(
    ["Ajustes"],
    ["Concepto", "Monto"],
    ["Saldo a favor anterior", N(data.declaracion.saldo_favor_anterior)],
    ["Recargos", N(data.declaracion.recargos)],
    ["Interés indemnizatorio", N(data.declaracion.interes_indemnizatorio)],
    ["Sanciones", N(data.declaracion.sanciones)],
    [],
    ["DIFERENCIA A PAGAR FINAL", N(data.resultado.diferencia_a_pagar_final)],
  );

  const wsB = XLSX.utils.aoa_to_sheet(aoaB);
  applyNumberFormat(wsB);
  wsB["!cols"] = [{ wch: 50 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsA, "Anexo A");
  XLSX.utils.book_append_sheet(wb, wsB, "IT-1");
  XLSX.writeFile(wb, `Revision_ITBIS_${periodo}.xlsx`);
}

function applyNumberFormat(ws: XLSX.WorkSheet) {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell && cell.t === "n") cell.z = "#,##0.00";
    }
  }
}
