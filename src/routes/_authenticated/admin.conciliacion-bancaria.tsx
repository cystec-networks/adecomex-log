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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Landmark, Upload, Link2, Unlink } from "lucide-react";
import { fmtLocalDate } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/admin/conciliacion-bancaria")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "contabilidad", "finanzas"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Conciliación Bancaria | ADECOMEX" },
      { name: "description", content: "Importa movimientos del Banco Popular y concílialos contra cobros, cuentas por pagar y gastos operativos." },
      { property: "og:title", content: "Conciliación Bancaria | ADECOMEX" },
      { property: "og:description", content: "Importación de estados de cuenta bancarios y conciliación contra los registros del sistema." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConciliacionBancariaPage,
});

const CUENTA_DEFAULT = "747315737";

type BancoConfig = {
  cuenta: string;
  saldo_inicial: number;
  fecha_saldo_inicial: string;
};

type Movimiento = {
  id: string;
  cuenta: string;
  fecha: string;
  created_at?: string;
  referencia: string | null;
  monto: number;
  tipo: string;
  descripcion: string | null;
  codigo_transaccion: string | null;
  numero_cheque: string | null;
  hash_linea: string;
  conciliado: boolean;
  conciliado_tipo: string | null;
  conciliado_id: string | null;
  conciliado_en: string | null;
  notas: string | null;
};

type Candidato = {
  tipo: "cxc_pago" | "cxp" | "gasto_operativo";
  id: string;
  monto: number;
  fecha: string;
  descripcion: string;
};

const TIPO_LABEL: Record<string, string> = {
  cxc_pago: "Cobro (CxC)",
  cxp: "Cuenta por Pagar",
  gasto_operativo: "Gasto Operativo",
  manual: "Manual / Sin vincular",
};

function fmtRD(n: number) {
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n || 0);
}

function hashLinea(linea: string): string {
  const s = linea.trim().replace(/\s+/g, " ");
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 * 33) ^ c) >>> 0;
    h2 = ((h2 * 31) ^ c) >>> 0;
  }
  return `${s.length}-${h1.toString(36)}${h2.toString(36)}`;
}

type ParsedLinea = {
  cuenta: string;
  fecha: string;
  referencia: string | null;
  monto: number;
  tipo: "credito" | "debito";
  descripcion: string | null;
  codigo_transaccion: string | null;
  numero_cheque: string | null;
  hash_linea: string;
};

function parseLinea(linea: string): ParsedLinea | null {
  const raw = linea.replace(/\r$/, "");
  if (!raw.trim()) return null;
  const p = raw.split(",").map((x) => x.trim());
  if (p.length < 5) return null;

  const [cuentaRaw, fechaRaw, referencia, montoRaw, tipoRaw, descripcion, codigo, ref2] = p;

  const mf = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fechaRaw ?? "");
  if (!mf) return null;
  const fecha = `${mf[3]}-${mf[2]}-${mf[1]}`;

  const monto = parseFloat((montoRaw ?? "").replace(/,/g, ""));
  if (!isFinite(monto)) return null;

  const t = (tipoRaw ?? "").toUpperCase();
  if (t !== "CR" && t !== "DB") return null;

  const desc = (descripcion ?? "").trim();
  const chequeMatch = /\bCK\s*0*(\d+)/i.exec(desc);

  return {
    cuenta: (cuentaRaw ?? "").replace(/^0+/, "") || "747315737",
    fecha,
    referencia: (referencia ?? "").trim() || (ref2 ?? "").trim() || null,
    monto,
    tipo: t === "CR" ? "credito" : "debito",
    descripcion: desc || null,
    codigo_transaccion: (codigo ?? "").trim() || null,
    numero_cheque: chequeMatch ? chequeMatch[1] : null,
    hash_linea: hashLinea(raw),
  };
}

function ConciliacionBancariaPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [fTipo, setFTipo] = useState("todos");
  const [fEstado, setFEstado] = useState("todos");
  const [balanceBanco, setBalanceBanco] = useState("");
  const [importando, setImportando] = useState(false);
  const [movSel, setMovSel] = useState<Movimiento | null>(null);

  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ["banco_movimientos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banco_movimientos")
        .select("*")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Movimiento[];
    },
  });

  const filtrados = useMemo(() => {
    return movimientos.filter((m) => {
      if (desde && m.fecha < desde) return false;
      if (hasta && m.fecha > hasta) return false;
      if (fTipo !== "todos" && m.tipo !== fTipo) return false;
      if (fEstado === "conciliado" && !m.conciliado) return false;
      if (fEstado === "pendiente" && m.conciliado) return false;
      return true;
    });
  }, [movimientos, desde, hasta, fTipo, fEstado]);

  const resumen = useMemo(() => {
    let creditos = 0, debitos = 0, conciliados = 0, pendientes = 0;
    for (const m of filtrados) {
      if (m.tipo === "credito") creditos += Number(m.monto);
      else debitos += Number(m.monto);
      if (m.conciliado) conciliados++; else pendientes++;
    }
    return { creditos, debitos, conciliados, pendientes, neto: creditos - debitos };
  }, [filtrados]);

  const { data: config, isLoading: cargandoConfig } = useQuery({
    queryKey: ["banco_config", CUENTA_DEFAULT],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banco_config").select("*").eq("cuenta", CUENTA_DEFAULT).maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as BancoConfig | null;
    },
  });

  // Balance corriente por movimiento (cronológico desde la fecha de saldo inicial)
  const { balancePorMov, balanceActual } = useMemo(() => {
    if (!config) return { balancePorMov: new Map<string, number>(), balanceActual: null as number | null };
    const orden = movimientos
      .filter((m) => m.cuenta === config.cuenta && m.fecha >= config.fecha_saldo_inicial)
      .slice()
      .sort((a, b) =>
        a.fecha === b.fecha
          ? String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
          : a.fecha < b.fecha ? -1 : 1,
      );
    let saldo = Number(config.saldo_inicial) || 0;
    const map = new Map<string, number>();
    for (const m of orden) {
      saldo += m.tipo === "credito" ? Number(m.monto) : -Number(m.monto);
      map.set(m.id, saldo);
    }
    return { balancePorMov: map, balanceActual: orden.length ? saldo : Number(config.saldo_inicial) || 0 };
  }, [movimientos, config]);


  async function onImportar(file: File) {
    setImportando(true);
    try {
      const texto = await file.text();
      const lineas = texto.split("\n");
      const filas: ParsedLinea[] = [];
      const vistos = new Set<string>();
      let invalidas = 0;
      for (const l of lineas) {
        if (!l.trim()) continue;
        const p = parseLinea(l);
        if (!p) { invalidas++; continue; }
        if (vistos.has(p.hash_linea)) continue;
        vistos.add(p.hash_linea);
        filas.push(p);
      }
      if (filas.length === 0) {
        toast.error("No se encontraron movimientos válidos en el archivo.");
        return;
      }

      const hashes = filas.map((f) => f.hash_linea);
      const existentes = new Set<string>();
      for (let i = 0; i < hashes.length; i += 500) {
        const chunk = hashes.slice(i, i + 500);
        const { data, error } = await supabase
          .from("banco_movimientos").select("hash_linea").in("hash_linea", chunk);
        if (error) throw error;
        for (const r of data ?? []) existentes.add((r as { hash_linea: string }).hash_linea);
      }

      const nuevas = filas.filter((f) => !existentes.has(f.hash_linea));
      if (nuevas.length > 0) {
        for (let i = 0; i < nuevas.length; i += 500) {
          const { error } = await supabase
            .from("banco_movimientos")
            .upsert(nuevas.slice(i, i + 500) as never, { onConflict: "hash_linea", ignoreDuplicates: true });
          if (error) throw error;
        }
      }

      await qc.invalidateQueries({ queryKey: ["banco_movimientos"] });
      toast.success(
        `${nuevas.length} movimientos nuevos importados, ${filas.length - nuevas.length} ya existían (omitidos)` +
        (invalidas ? ` · ${invalidas} líneas ignoradas` : ""),
      );
    } catch (e) {
      toast.error(`Error al importar: ${(e as Error).message}`);
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const desvincular = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("banco_movimientos")
        .update({
          conciliado: false, conciliado_tipo: null, conciliado_id: null,
          conciliado_por: null, conciliado_en: null, notas: null,
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimiento desvinculado");
      qc.invalidateQueries({ queryKey: ["banco_movimientos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-display font-bold">Conciliación Bancaria</h1>
        </div>
        <div className="flex-1" />
        <input
          ref={fileRef} type="file" accept=".txt,text/plain" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportar(f); }}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={importando}>
          <Upload className="h-4 w-4 mr-2" />
          {importando ? "Importando…" : "Importar movimientos (.txt)"}
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total créditos</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold text-emerald-600">{fmtRD(resumen.creditos)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total débitos</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold text-destructive">{fmtRD(resumen.debitos)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Conciliados / Pendientes</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">
            {resumen.conciliados} <span className="text-muted-foreground">/</span> {resumen.pendientes}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Balance del estado de cuenta</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <Input
              inputMode="decimal" placeholder="0.00" value={balanceBanco}
              onChange={(e) => setBalanceBanco(e.target.value)}
            />
            <div className="text-xs text-muted-foreground">
              Neto de movimientos filtrados: {fmtRD(resumen.neto)}
              {balanceBanco.trim() !== "" && isFinite(parseFloat(balanceBanco)) && (
                <> · Diferencia: {fmtRD(parseFloat(balanceBanco) - resumen.neto)}</>
              )}
              {balanceActual !== null && (
                <>
                  <br />Balance actual (calculado): <strong>{fmtRD(balanceActual)}</strong>
                  {balanceBanco.trim() !== "" && isFinite(parseFloat(balanceBanco)) && (
                    <> · Dif. vs banco: {fmtRD(parseFloat(balanceBanco) - balanceActual)}</>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <BalanceInicialCard config={config ?? null} cargando={cargandoConfig} balanceActual={balanceActual} />


      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="credito">Crédito</SelectItem>
                <SelectItem value="debito">Débito</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Estado</Label>
            <Select value={fEstado} onValueChange={setFEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="conciliado">Conciliado</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Movimientos ({filtrados.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Descripción</th>
                <th className="py-2 pr-3">Referencia</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3 text-right">Monto</th>
                <th className="py-2 pr-3 text-right">Balance calculado</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Cargando…</td></tr>
              )}
              {!isLoading && filtrados.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">
                  No hay movimientos. Importa un archivo .txt del banco.
                </td></tr>
              )}
              {filtrados.map((m) => (
                <tr key={m.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtLocalDate(m.fecha)}</td>
                  <td className="py-2 pr-3 max-w-[320px]">{m.descripcion ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{m.referencia ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <Badge variant="outline" className={m.tipo === "credito"
                      ? "border-emerald-500 text-emerald-600"
                      : "border-destructive text-destructive"}>
                      {m.tipo === "credito" ? "Crédito" : "Débito"}
                    </Badge>
                  </td>
                  <td className={`py-2 pr-3 text-right font-medium ${m.tipo === "credito" ? "text-emerald-600" : "text-destructive"}`}>
                    {fmtRD(Number(m.monto))}
                  </td>
                  <td className="py-2 pr-3">
                    {m.conciliado ? (
                      <div className="space-y-0.5">
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">Conciliado ✓</Badge>
                        <div className="text-[11px] text-muted-foreground">
                          {TIPO_LABEL[m.conciliado_tipo ?? ""] ?? m.conciliado_tipo}
                          {m.notas ? ` · ${m.notas}` : ""}
                        </div>
                      </div>
                    ) : (
                      <Badge variant="secondary">Pendiente</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {m.conciliado ? (
                      <Button size="sm" variant="ghost" onClick={() => desvincular.mutate(m.id)}>
                        <Unlink className="h-4 w-4 mr-1" /> Desvincular
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setMovSel(m)}>
                        <Link2 className="h-4 w-4 mr-1" /> Conciliar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ConciliarDialog mov={movSel} onClose={() => setMovSel(null)} />
    </div>
  );
}

function ConciliarDialog({ mov, onClose }: { mov: Movimiento | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [nota, setNota] = useState("");

  const { data: candidatos = [], isLoading } = useQuery({
    queryKey: ["banco-candidatos", mov?.id],
    enabled: !!mov,
    queryFn: async () => {
      if (!mov) return [];
      const monto = Number(mov.monto);
      const tol = 1;
      const min = monto - tol, max = monto + tol;
      const d = new Date(`${mov.fecha}T00:00:00`);
      const ini = new Date(d); ini.setDate(ini.getDate() - 3);
      const fin = new Date(d); fin.setDate(fin.getDate() + 3);
      const iso = (x: Date) => x.toISOString().slice(0, 10);

      const { data: usados } = await supabase
        .from("banco_movimientos")
        .select("conciliado_tipo, conciliado_id")
        .eq("conciliado", true)
        .not("conciliado_id", "is", null);
      const usadosSet = new Set(
        (usados ?? []).map((u) => `${(u as { conciliado_tipo: string | null }).conciliado_tipo}:${(u as { conciliado_id: string | null }).conciliado_id}`),
      );

      const out: Candidato[] = [];

      if (mov.tipo === "credito") {
        const { data } = await supabase
          .from("cxc_pagos")
          .select("id, monto, fecha_pago, metodo_pago, referencia, notas")
          .gte("monto", min).lte("monto", max)
          .gte("fecha_pago", iso(ini)).lte("fecha_pago", iso(fin))
          .limit(50);
        for (const r of (data ?? []) as Array<Record<string, unknown>>) {
          const id = r.id as string;
          if (usadosSet.has(`cxc_pago:${id}`)) continue;
          out.push({
            tipo: "cxc_pago", id, monto: Number(r.monto), fecha: r.fecha_pago as string,
            descripcion: [r.metodo_pago, r.referencia, r.notas].filter(Boolean).join(" · ") || "Cobro de cliente",
          });
        }
      } else {
        const { data: cxp } = await supabase
          .from("cuentas_por_pagar")
          .select("id, proveedor_nombre, numero_factura, monto_pagado, updated_at, estado")
          .eq("estado", "pagado")
          .gte("monto_pagado", min).lte("monto_pagado", max)
          .gte("updated_at", `${iso(ini)}T00:00:00`).lte("updated_at", `${iso(fin)}T23:59:59`)
          .limit(50);
        for (const r of (cxp ?? []) as Array<Record<string, unknown>>) {
          const id = r.id as string;
          if (usadosSet.has(`cxp:${id}`)) continue;
          out.push({
            tipo: "cxp", id, monto: Number(r.monto_pagado),
            fecha: String(r.updated_at).slice(0, 10),
            descripcion: [r.proveedor_nombre, r.numero_factura].filter(Boolean).join(" · ") || "Cuenta por pagar",
          });
        }

        const { data: gastos } = await supabase
          .from("gastos_operativos")
          .select("id, concepto, monto, fecha, ncf_proveedor, eliminado_en")
          .is("eliminado_en", null)
          .gte("monto", min).lte("monto", max)
          .gte("fecha", iso(ini)).lte("fecha", iso(fin))
          .limit(50);
        for (const r of (gastos ?? []) as Array<Record<string, unknown>>) {
          const id = r.id as string;
          if (usadosSet.has(`gasto_operativo:${id}`)) continue;
          out.push({
            tipo: "gasto_operativo", id, monto: Number(r.monto), fecha: r.fecha as string,
            descripcion: [r.concepto, r.ncf_proveedor].filter(Boolean).join(" · ") || "Gasto operativo",
          });
        }
      }

      return out;
    },
  });

  const conciliar = useMutation({
    mutationFn: async (payload: { tipo: string; id: string | null; notas?: string | null }) => {
      if (!mov) return;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("banco_movimientos")
        .update({
          conciliado: true,
          conciliado_tipo: payload.tipo,
          conciliado_id: payload.id,
          conciliado_por: u.user?.id ?? null,
          conciliado_en: new Date().toISOString(),
          notas: payload.notas ?? null,
        } as never)
        .eq("id", mov.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimiento conciliado");
      qc.invalidateQueries({ queryKey: ["banco_movimientos"] });
      setNota("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!mov} onOpenChange={(o) => { if (!o) { setNota(""); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conciliar movimiento</DialogTitle>
          <DialogDescription>
            {mov && (
              <>
                {fmtLocalDate(mov.fecha)} · {mov.tipo === "credito" ? "Crédito" : "Débito"} ·{" "}
                <strong>{fmtRD(Number(mov.monto))}</strong>
                {mov.descripcion ? ` · ${mov.descripcion}` : ""}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm font-medium">Sugerencias automáticas</div>
          {isLoading && <div className="text-sm text-muted-foreground">Buscando candidatos…</div>}
          {!isLoading && candidatos.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No se encontraron coincidencias por monto (±RD$1) y fecha (±3 días).
            </div>
          )}
          <div className="space-y-2 max-h-64 overflow-auto">
            {candidatos.map((c) => (
              <div key={`${c.tipo}-${c.id}`} className="flex items-center gap-3 rounded-md border p-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.descripcion}</div>
                  <div className="text-xs text-muted-foreground">
                    {TIPO_LABEL[c.tipo]} · {fmtLocalDate(c.fecha)} · {fmtRD(c.monto)}
                  </div>
                </div>
                <Button size="sm" disabled={conciliar.isPending}
                  onClick={() => conciliar.mutate({ tipo: c.tipo, id: c.id, notas: null })}>
                  Vincular
                </Button>
              </div>
            ))}
          </div>

          <div className="border-t pt-3 space-y-2">
            <Label>Conciliar sin vincular (nota obligatoria)</Label>
            <Textarea
              rows={2} value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Ej.: Comisión bancaria, pago de impuesto DGII automático…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setNota(""); onClose(); }}>Cancelar</Button>
          <Button
            variant="secondary"
            disabled={!nota.trim() || conciliar.isPending}
            onClick={() => conciliar.mutate({ tipo: "manual", id: null, notas: nota.trim() })}
          >
            Conciliar sin vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
