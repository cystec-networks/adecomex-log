import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
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
import { Landmark, Upload, Link2, Unlink, Settings2, Sparkles, FilePlus2, AlertTriangle, CheckCircle2, Layers, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fmtLocalDate } from "@/lib/dates";
import { planConciliacionAutomatica, cuentaCompartida, cuentaDestino, anterioresAlDiario, comisionesConPago, gruposParaLote, sugerenciasExactas, inicioDiario, pagoDeComision, reglaAplicable, resumenImportacion, sugerirEntradas, validarBalance, type Sugerencia } from "@/lib/conciliacion-diario";
import { leerCuentasBeneficiario, leerEntradasDiario, leerReglasBanco, useConciliarDiario, useCuentasBeneficiario, useEntradasDiario, useInvalidarConciliacion, useMarcarMovimiento, useReglasBanco } from "@/components/conciliacion/datos";
import { LotesAutomaticosDialog, ResultadoAutomaticoDialog, type ResultadoAutomatico } from "@/components/conciliacion/automatica-dialogs";
import { DebitoDialog, type PestanaDebito } from "@/components/conciliacion/debito-dialog";
import { DeshacerConciliacionDialog } from "@/components/conciliacion/deshacer-dialog";
import { ReglasCuentasDialog } from "@/components/conciliacion/reglas-cuentas-dialog";
import { AnterioresDiarioDialog, ComisionesLoteDialog, EntradasLoteDialog, ExactasLoteDialog } from "@/components/conciliacion/lotes-dialogs";

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
  diferencia_diario?: number | null;
  motivo_diferencia?: string | null;
  vinculado_movimiento_id?: string | null;
  lote_marcado?: string | null;
  lote_conciliacion?: string | null;
  conciliado_auto?: boolean | null;
  revision_motivo?: string | null;
};

async function leerMovimientos(): Promise<Movimiento[]> {
  const { data, error } = await supabase
    .from("banco_movimientos")
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as unknown as Movimiento[];
}

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
  diario: "Registro de Diario",
  ignorado: "No aplica",
  comision: "Comisión de un pago",
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

type PreviaImportacion = {
  nombre: string;
  filas: ParsedLinea[];
  invalidas: number;
  nuevas: ParsedLinea[];
  omitidas: number;
  repetidasEnArchivo: ParsedLinea[];
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
  const [previa, setPrevia] = useState<PreviaImportacion | null>(null);
  const [movSel, setMovSel] = useState<Movimiento | null>(null);
  const [debSel, setDebSel] = useState<{ mov: Movimiento; pestana: PestanaDebito } | null>(null);
  const [deshacerSel, setDeshacerSel] = useState<Movimiento | null>(null);
  const [reglasOpen, setReglasOpen] = useState(false);
  const [bloque, setBloque] = useState<null | "anteriores" | "comisiones" | "lote" | "exactas" | "automaticos">(null);
  const [resultadoAuto, setResultadoAuto] = useState<ResultadoAutomatico | null>(null);
  const invalidarConciliacion = useInvalidarConciliacion();

  const { data: entradasDiario = [] } = useEntradasDiario();
  const { data: reglas = [] } = useReglasBanco();
  const { data: cuentas = [] } = useCuentasBeneficiario();
  const conciliarRapido = useConciliarDiario();
  const marcarRapido = useMarcarMovimiento();

  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ["banco_movimientos"],
    queryFn: leerMovimientos,
  });

  // Sugerencias del Diario para cada débito pendiente (nunca concilian solas).
  const sugerencias = useMemo(() => {
    const map = new Map<string, Sugerencia[]>();
    for (const m of movimientos) {
      if (m.tipo !== "debito" || m.conciliado) continue;
      map.set(m.id, sugerirEntradas({ ...m, monto: Number(m.monto) }, entradasDiario, cuentas, reglas));
    }
    return map;
  }, [movimientos, entradasDiario, cuentas, reglas]);

  const inicio = useMemo(() => inicioDiario(entradasDiario), [entradasDiario]);
  const conSugerencia = useCallback((m: { id: string }) => (sugerencias.get(m.id)?.length ?? 0) > 0, [sugerencias]);
  const movsNum = useMemo(() => movimientos.map((x) => ({ ...x, monto: Number(x.monto) })), [movimientos]);
  const conteoBloque = useMemo(() => ({
    exactas: sugerenciasExactas(movsNum, sugerencias).exactas.length,
    anteriores: anterioresAlDiario(movsNum, inicio).length,
    comisiones: comisionesConPago(movsNum).length,
    lote: gruposParaLote(movsNum, conSugerencia, cuentas, reglas, inicio).grupos.reduce((t, g) => t + g.movimientos.length, 0),
  }), [movsNum, inicio, conSugerencia, cuentas, reglas, sugerencias]);

  const filtrados = useMemo(() => {
    return movimientos.filter((m) => {
      if (desde && m.fecha < desde) return false;
      if (hasta && m.fecha > hasta) return false;
      if (fTipo !== "todos" && m.tipo !== fTipo) return false;
      if (fEstado === "conciliado" && !m.conciliado) return false;
      if (fEstado === "pendiente" && m.conciliado) return false;
      if (fEstado === "revision" && (m.conciliado || m.tipo !== "debito" || !m.revision_motivo)) return false;
      if (fEstado === "con-sugerencia" && !(sugerencias.get(m.id)?.length)) return false;
      if (fEstado === "sin-coincidencia" && (m.conciliado || m.tipo !== "debito" || (sugerencias.get(m.id)?.length ?? 0) > 0)) return false;
      return true;
    });
  }, [movimientos, desde, hasta, fTipo, fEstado, sugerencias]);

  const conteoSugerencias = useMemo(() => {
    let con = 0, sin = 0;
    for (const v of sugerencias.values()) { if (v.length) con++; else sin++; }
    return { con, sin };
  }, [sugerencias]);

  // Parseo tolerante: acepta "6,905,883.27", "RD$ 6.905.883,27", etc.
  const balanceBancoNum = useMemo(() => {
    let s = balanceBanco.replace(/[^\d.,-]/g, "").trim();
    if (!s) return null;
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }, [balanceBanco]);

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


  /** Movimientos ya guardados en el rango de fechas del archivo. */
  async function existentesEnRango(filas: ParsedLinea[]) {
    const fechas = filas.map((f) => f.fecha).sort();
    const existentes: Array<{ fecha: string; referencia: string | null; monto: number; descripcion: string | null; hash_linea: string }> = [];
    for (let desdeFila = 0; ; desdeFila += 1000) {
      const { data, error } = await supabase
        .from("banco_movimientos")
        .select("fecha, referencia, monto, descripcion, hash_linea")
        .gte("fecha", fechas[0]).lte("fecha", fechas[fechas.length - 1])
        .range(desdeFila, desdeFila + 999);
      if (error) throw error;
      existentes.push(...((data ?? []) as typeof existentes).map((r) => ({ ...r, monto: Number(r.monto) })));
      if (!data || data.length < 1000) break;
    }
    return existentes;
  }

  // Paso 1: leer el archivo y mostrar la vista previa; no se guarda nada todavía.
  async function onImportar(file: File) {
    setImportando(true);
    try {
      const texto = await file.text();
      const filas: ParsedLinea[] = [];
      let invalidas = 0;
      for (const l of texto.split("\n")) {
        if (!l.trim()) continue;
        const p = parseLinea(l);
        if (!p) { invalidas++; continue; }
        filas.push(p);
      }
      if (filas.length === 0) {
        toast.error("No se encontraron movimientos válidos en el archivo.");
        return;
      }
      const existentes = await existentesEnRango(filas);
      setPrevia({ nombre: file.name, filas, invalidas, ...resumenImportacion(filas, existentes) });
    } catch (e) {
      toast.error(`Error al leer el archivo: ${(e as Error).message}`);
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Paso 2: al confirmar, se recalcula contra lo guardado en ese momento; si cambió, se actualiza la vista previa sin importar.
  async function confirmarImportacion() {
    if (!previa) return;
    setImportando(true);
    try {
      const existentes = await existentesEnRango(previa.filas);
      const actual = resumenImportacion(previa.filas, existentes);
      if (actual.nuevas.length !== previa.nuevas.length) {
        setPrevia({ ...previa, ...actual });
        toast.warning("Los movimientos guardados cambiaron mientras revisabas. Revisa la vista previa actualizada y confirma de nuevo.");
        return;
      }
      const hashesUsados = new Set(existentes.map((e) => e.hash_linea));
      const nuevas = actual.nuevas.map((f) => {
        let n = 1;
        let h = `${f.hash_linea}-${n}`;
        while (hashesUsados.has(h)) h = `${f.hash_linea}-${++n}`;
        hashesUsados.add(h);
        return { ...f, hash_linea: h };
      });
      const insertados: string[] = [];
      for (let i = 0; i < nuevas.length; i += 500) {
        const { data, error } = await supabase.from("banco_movimientos").insert(nuevas.slice(i, i + 500) as never).select("id");
        if (error) throw error;
        insertados.push(...((data ?? []) as { id: string }[]).map((r) => r.id));
      }
      toast.success(
        `${nuevas.length} movimientos nuevos importados, ${actual.omitidas} ya existían (omitidos)` +
        (previa.invalidas ? ` · ${previa.invalidas} líneas ignoradas` : ""),
      );
      const archivo = previa.nombre;
      setPrevia(null);
      await conciliarAutomatico(insertados, archivo);
    } catch (e) {
      toast.error(`Error al importar: ${(e as Error).message}`);
    } finally {
      setImportando(false);
    }
  }

  // Después de importar: concilia sola lo exacto (y crea la entrada con el siguiente TF si no existe);
  // lo dudoso queda en «Pendientes de revisión» con su motivo. Se puede deshacer el lote completo.
  async function conciliarAutomatico(ids: string[], archivo: string) {
    if (ids.length === 0) { invalidarConciliacion(); return; }
    try {
      const [movs, entradas, cuentasAct, reglasAct] = await Promise.all([
        leerMovimientos(), leerEntradasDiario(), leerCuentasBeneficiario(), leerReglasBanco(),
      ]);
      const setIds = new Set(ids);
      const todos = movs.map((x) => ({ ...x, monto: Number(x.monto) }));
      const nuevos = todos.filter((x) => setIds.has(x.id));
      const creditos = nuevos.filter((x) => x.tipo !== "debito").length;
      if (nuevos.length === creditos) { invalidarConciliacion(); return; }
      const plan = planConciliacionAutomatica(nuevos, todos, entradas, cuentasAct, reglasAct, inicioDiario(entradas));
      const { data, error } = await supabase.rpc("conciliar_automatico_importacion", {
        p_items: plan.acciones.map((a) => a.tipo === "conciliar"
          ? { movimiento_id: a.movimiento.id, accion: "conciliar", origen_tipo: a.entrada.origen_tipo, solicitud_id: a.entrada.id }
          : { movimiento_id: a.movimiento.id, accion: "crear", categoria: a.categoria, beneficiario: a.beneficiario, concepto: a.concepto }),
        p_revision: plan.revision.map((r) => ({ movimiento_id: r.movimiento.id, motivo: r.motivo })),
        p_archivo: archivo,
      });
      if (error) throw error;
      setResultadoAuto({ ...(data as unknown as Omit<ResultadoAutomatico, "creditos" | "archivo">), creditos, archivo });
    } catch (e) {
      toast.error(`Los movimientos se importaron, pero la conciliación automática no se completó: ${(e as Error).message}. Puedes conciliarlos a mano.`);
    } finally {
      invalidarConciliacion();
    }
  }

  const movPorId = useMemo(() => new Map(movimientos.map((x) => [x.id, { ...x, monto: Number(x.monto) }])), [movimientos]);

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline"><Layers className="h-4 w-4 mr-2" /> Acciones en bloque <ChevronDown className="h-4 w-4 ml-1" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setBloque("exactas")}>Conciliar sugerencias exactas · {conteoBloque.exactas}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setBloque("anteriores")}>No aplica (anterior al Diario) · {conteoBloque.anteriores}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setBloque("comisiones")}>Vincular comisiones con su pago · {conteoBloque.comisiones}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setBloque("lote")}>Crear entradas por lote (retroactivas) · {conteoBloque.lote}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setBloque("automaticos")}>Conciliaciones automáticas (deshacer)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" onClick={() => setReglasOpen(true)}>
          <Settings2 className="h-4 w-4 mr-2" /> Reglas y cuentas
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={importando}>
          <Upload className="h-4 w-4 mr-2" />
          {importando && !previa ? "Leyendo archivo…" : "Importar movimientos (.txt)"}
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
            <div className="text-[11px] font-normal text-muted-foreground">
              Débitos pendientes: {conteoSugerencias.con} con sugerencia · {conteoSugerencias.sin} sin coincidencia
            </div>
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
              {balanceActual !== null && (
                <>
                  <br />Balance actual (calculado): <strong>{fmtRD(balanceActual)}</strong>
                </>
              )}
            </div>
            <ValidacionBalance banco={balanceBancoNum} calculado={balanceActual} />
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
                <SelectItem value="revision">Pendientes de revisión</SelectItem>
                <SelectItem value="con-sugerencia">Débito con sugerencia</SelectItem>
                <SelectItem value="sin-coincidencia">Débito sin coincidencia</SelectItem>
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
        <CardContent className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky-table-header">
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Descripción</th>
                <th className="py-2 pr-3">Referencia</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3 text-right">Monto</th>
                <th className="py-2 pr-3 text-right">Balance calculado</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Sugerencia del Diario</th>
                <th className="py-2 pr-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Cargando…</td></tr>
              )}
              {!isLoading && filtrados.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">
                  No hay movimientos. Importa un archivo .txt del banco.
                </td></tr>
              )}
              {filtrados.map((m) => (
                <tr key={m.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtLocalDate(m.fecha)}</td>
                  <td className="py-2 pr-3 max-w-[320px]">
                    {m.descripcion ?? "—"}
                    {(() => {
                      const t = m.tipo === "debito" ? cuentaCompartida(cuentaDestino(m.descripcion), cuentas) : null;
                      return t ? (
                        <div className="text-[11px] text-muted-foreground" title="Cuenta compartida: al crear una entrada se elige el titular">
                          <Badge variant="outline" className="mr-1 px-1 py-0 text-[11px] font-normal">Cuenta compartida</Badge>{t.join(" y/o ")}
                        </div>
                      ) : null;
                    })()}
                  </td>
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
                  <td className="py-2 pr-3 text-right font-mono text-xs whitespace-nowrap">
                    {balancePorMov.has(m.id) ? fmtRD(balancePorMov.get(m.id)!) : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {m.conciliado ? (
                      <div className="space-y-0.5">
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">Conciliado ✓</Badge>
                        {m.conciliado_auto && <Badge variant="outline" className="ml-1 text-[11px] font-normal">Automática</Badge>}
                        <div className="text-[11px] text-muted-foreground">
                          {TIPO_LABEL[m.conciliado_tipo ?? ""] ?? m.conciliado_tipo}
                          {m.notas ? ` · ${m.notas}` : ""}
                        </div>
                        {m.diferencia_diario != null && Math.abs(Number(m.diferencia_diario)) >= 0.01 && (
                          <div className="text-[11px] text-amber-700 dark:text-amber-400">
                            Diferencia {fmtRD(Number(m.diferencia_diario))} · {m.motivo_diferencia}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <Badge variant="secondary">Pendiente</Badge>
                        {m.tipo === "debito" && m.revision_motivo && (
                          <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Revisar: {m.revision_motivo}</div>
                        )}
                        {m.notas && (
                          <div className="text-[11px] text-amber-700 dark:text-amber-400 max-w-[220px]">Nota: {m.notas}</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 min-w-[220px]">
                    <CeldaSugerencia
                      m={m}
                      sugerencias={sugerencias.get(m.id)}
                      tieneRegla={!!reglaAplicable(m.descripcion, reglas)}
                      pagoComision={m.tipo === "debito" && !m.conciliado ? pagoDeComision(m, movimientos) : null}
                      ocupado={conciliarRapido.isPending || marcarRapido.isPending}
                      onConciliar={(s) => conciliarRapido.mutate({ movimientoId: m.id, entradas: s.entradas })}
                      onVincularComision={(pagoId) => marcarRapido.mutate({ movimientoId: m.id, tipo: "comision", vinculado: pagoId })}
                      onAbrir={(pestana) => setDebSel({ mov: m, pestana })}
                    />
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {m.conciliado ? (
                      <Button size="sm" variant="ghost" onClick={() => (
                        ["diario", "ignorado", "comision"].includes(m.conciliado_tipo ?? "") ? setDeshacerSel(m) : desvincular.mutate(m.id)
                      )}>
                        <Unlink className="h-4 w-4 mr-1" /> Deshacer
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => (
                        m.tipo === "debito" ? setDebSel({ mov: m, pestana: "diario" }) : setMovSel(m)
                      )}>
                        <Link2 className="h-4 w-4 mr-1" /> {m.tipo === "debito" ? "Opciones" : "Conciliar"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <PreviaImportacionDialog previa={previa} importando={importando} onConfirmar={confirmarImportacion} onClose={() => setPrevia(null)} />
      <ConciliarDialog mov={movSel} onClose={() => setMovSel(null)} />
      <DebitoDialog
        mov={debSel ? { ...debSel.mov, monto: Number(debSel.mov.monto) } : null}
        movimientos={movimientos.map((x) => ({ ...x, monto: Number(x.monto) }))}
        pestana={debSel?.pestana ?? "diario"}
        onClose={() => setDebSel(null)}
      />
      <DeshacerConciliacionDialog mov={deshacerSel} onClose={() => setDeshacerSel(null)} />
      <ReglasCuentasDialog open={reglasOpen} onOpenChange={setReglasOpen} movimientos={movsNum} entradas={entradasDiario} />
      <AnterioresDiarioDialog open={bloque === "anteriores"} onClose={() => setBloque(null)} movimientos={movsNum} inicio={inicio} />
      <ComisionesLoteDialog open={bloque === "comisiones"} onClose={() => setBloque(null)} movimientos={movsNum} />
      <EntradasLoteDialog open={bloque === "lote"} onClose={() => setBloque(null)} movimientos={movsNum} inicio={inicio} conSugerencia={conSugerencia} />
      <ExactasLoteDialog open={bloque === "exactas"} onClose={() => setBloque(null)} movimientos={movsNum} sugerencias={sugerencias} />
      <LotesAutomaticosDialog open={bloque === "automaticos"} onClose={() => setBloque(null)} />
      <ResultadoAutomaticoDialog
        resultado={resultadoAuto}
        movimientos={movPorId}
        onClose={() => setResultadoAuto(null)}
        onVerRevision={() => { setFEstado("revision"); setResultadoAuto(null); }}
      />
    </div>
  );
}

function ValidacionBalance({ banco, calculado }: { banco: number | null; calculado: number | null }) {
  if (banco !== null && calculado === null) {
    return <div className="text-[11px] text-amber-700 dark:text-amber-400">Configura el balance inicial para poder validar.</div>;
  }
  const v = validarBalance(banco, calculado);
  if (v.estado === "sin-datos") return null;
  if (v.estado === "coincide") {
    return (
      <div className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[12px] text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> Coincide con el balance calculado
      </div>
    );
  }
  return (
    <div className="flex items-start gap-1 rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-[12px] text-destructive">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>No coincide con el balance calculado. Diferencia: <strong>{fmtRD(v.diferencia)}</strong></span>
    </div>
  );
}

function CeldaSugerencia({
  m, sugerencias, tieneRegla, pagoComision, ocupado, onConciliar, onVincularComision, onAbrir,
}: {
  m: Movimiento;
  sugerencias: Sugerencia[] | undefined;
  tieneRegla: boolean;
  pagoComision: Movimiento | null;
  ocupado: boolean;
  onConciliar: (s: Sugerencia) => void;
  onVincularComision: (pagoId: string) => void;
  onAbrir: (p: PestanaDebito) => void;
}) {
  if (m.tipo !== "debito" || m.conciliado) return <span className="text-muted-foreground">—</span>;
  const s = sugerencias?.[0];
  if (s) {
    const total = s.entradas.reduce((t, e) => t + e.neto, 0);
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-[12px]">
          <div className="flex items-center gap-1 font-medium">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="font-mono">{s.entradas.map((e) => e.secuencia).join(" + ")}</span>
          </div>
          <div className="truncate text-[11px] text-muted-foreground" title={s.entradas[0].beneficiario}>
            {s.entradas[0].beneficiario} · {fmtLocalDate(s.entradas[0].fecha)} · {fmtRD(total)}
          </div>
          {!s.beneficiarioVerificado && <div className="text-[11px] text-amber-700 dark:text-amber-400">Beneficiario sin verificar</div>}
          {(sugerencias?.length ?? 0) > 1 && (
            <button type="button" className="text-[11px] text-primary underline" onClick={() => onAbrir("diario")}>
              {sugerencias!.length - 1} opción(es) más
            </button>
          )}
        </div>
        <Button size="sm" disabled={ocupado} onClick={() => onConciliar(s)}>Conciliar</Button>
      </div>
    );
  }
  if (pagoComision) {
    return (
      <div className="flex items-start gap-2 text-[12px]">
        <div className="min-w-0 flex-1 text-muted-foreground">Comisión del pago {fmtRD(Number(pagoComision.monto))} con la misma referencia</div>
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => onVincularComision(pagoComision.id)}>Vincular</Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="flex-1 text-muted-foreground">Sin coincidencia{tieneRegla ? " · regla disponible" : ""}</span>
      <Button size="sm" variant="outline" onClick={() => onAbrir("crear")}>
        <FilePlus2 className="h-3.5 w-3.5 mr-1" /> Crear entrada
      </Button>
    </div>
  );
}

function BalanceInicialCard({
  config, cargando, balanceActual,
}: { config: BancoConfig | null; cargando: boolean; balanceActual: number | null }) {
  const qc = useQueryClient();
  const [fecha, setFecha] = useState("");
  const [monto, setMonto] = useState("");
  const [editado, setEditado] = useState(false);

  const fechaVal = editado ? fecha : (config?.fecha_saldo_inicial ?? "2026-07-01");
  const montoVal = editado ? monto : (config ? String(config.saldo_inicial) : "");

  const guardar = useMutation({
    mutationFn: async () => {
      const n = parseFloat((montoVal || "").replace(/,/g, ""));
      if (!fechaVal) throw new Error("Indica la fecha del saldo inicial");
      if (!isFinite(n)) throw new Error("Indica un monto válido");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("banco_config").upsert({
        cuenta: CUENTA_DEFAULT,
        saldo_inicial: n,
        fecha_saldo_inicial: fechaVal,
        actualizado_por: u.user?.id ?? null,
      } as never, { onConflict: "cuenta" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Balance inicial guardado");
      setEditado(false);
      qc.invalidateQueries({ queryKey: ["banco_config", CUENTA_DEFAULT] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Balance Inicial · Cuenta {CUENTA_DEFAULT}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!cargando && !config && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            No hay un balance inicial configurado. Define la fecha de referencia y el saldo de esa
            fecha para poder calcular el balance corriente; mientras tanto no se muestra ningún
            balance calculado.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3 items-end">
          <div className="space-y-1">
            <Label>Fecha del saldo inicial</Label>
            <Input type="date" value={fechaVal}
              onChange={(e) => { setEditado(true); setMonto(montoVal); setFecha(e.target.value); }} />
          </div>
          <div className="space-y-1">
            <Label>Monto</Label>
            <Input inputMode="decimal" placeholder="0.00" value={montoVal}
              onChange={(e) => { setEditado(true); setFecha(fechaVal); setMonto(e.target.value); }} />
          </div>
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            {guardar.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
        {config && (
          <div className="text-xs text-muted-foreground">
            Desde {fmtLocalDate(config.fecha_saldo_inicial)} con {fmtRD(Number(config.saldo_inicial))}
            {balanceActual !== null && <> · Balance actual calculado: <strong>{fmtRD(balanceActual)}</strong></>}
          </div>
        )}
      </CardContent>
    </Card>
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

function PreviaImportacionDialog({ previa, importando, onConfirmar, onClose }: {
  previa: PreviaImportacion | null; importando: boolean; onConfirmar: () => void; onClose: () => void;
}) {
  const repetidas = useMemo(() => new Set(previa?.repetidasEnArchivo ?? []), [previa]);
  const fechas = previa ? previa.filas.map((f) => f.fecha).sort() : [];
  return (
    <Dialog open={!!previa} onOpenChange={(o) => { if (!o && !importando) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Vista previa de la importación</DialogTitle>
          <DialogDescription>
            {previa?.nombre} · {fechas.length ? `${fmtLocalDate(fechas[0])} – ${fmtLocalDate(fechas[fechas.length - 1])}` : ""}. Todavía no se ha guardado nada.
          </DialogDescription>
        </DialogHeader>
        {previa && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">Líneas en el archivo</div><div className="text-[16px] font-semibold">{previa.filas.length}</div></div>
              <div className="rounded-md border p-2 border-primary"><div className="text-[11px] text-muted-foreground">Entrarían (nuevas)</div><div className="text-[16px] font-semibold text-primary">{previa.nuevas.length}</div></div>
              <div className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">Ya guardadas (se omiten)</div><div className="text-[16px] font-semibold">{previa.omitidas}</div></div>
              <div className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">Líneas no reconocidas</div><div className="text-[16px] font-semibold">{previa.invalidas}</div></div>
            </div>
            {previa.repetidasEnArchivo.length > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-2 text-[12px]">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  {previa.repetidasEnArchivo.length} de las nuevas son líneas idénticas que el archivo trae más de una vez el mismo día
                  (mismo monto, referencia y descripción). Entran solo las que faltan: si el archivo trae dos y ya hay una guardada, entra una.
                  Verifica en el estado de cuenta que sean pagos reales antes de confirmar.
                </span>
              </div>
            )}
            {previa.nuevas.some((f) => f.tipo === "debito") && (
              <div className="flex gap-2 rounded-md border p-2 text-[12px] text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                <span>
                  Al importar, los débitos nuevos con coincidencia exacta (mismo monto, fecha a ±3 días y beneficiario conocido por cuenta o regla)
                  se concilian solos; si no tienen entrada en el Diario se crea con el siguiente TF. Lo dudoso queda en «Pendientes de revisión».
                  Todo se puede deshacer.
                </span>
              </div>
            )}
            {previa.nuevas.length > 0 ? (
              <div className="max-h-[50vh] overflow-auto rounded-md border">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="text-left">
                      <th className="px-2 py-1">Fecha</th><th className="px-2 py-1">Descripción</th><th className="px-2 py-1">Referencia</th>
                      <th className="px-2 py-1">Tipo</th><th className="px-2 py-1 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.nuevas.map((f, i) => (
                      <tr key={i} className={`border-t ${repetidas.has(f) ? "bg-amber-500/10" : ""}`}>
                        <td className="px-2 py-1 whitespace-nowrap">{fmtLocalDate(f.fecha)}</td>
                        <td className="px-2 py-1">{f.descripcion ?? "—"}{repetidas.has(f) && <Badge variant="outline" className="ml-2 border-amber-500 text-amber-700 dark:text-amber-400">Repetida en el archivo</Badge>}</td>
                        <td className="px-2 py-1 font-mono">{f.referencia ?? "—"}</td>
                        <td className="px-2 py-1">{f.tipo === "credito" ? "Crédito" : "Débito"}</td>
                        <td className="px-2 py-1 text-right whitespace-nowrap">{fmtRD(f.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border p-3 text-[13px]">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Todas las líneas de este archivo ya están guardadas. No entraría nada.
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importando}>Cancelar</Button>
          <Button onClick={onConfirmar} disabled={importando || !previa || previa.nuevas.length === 0}>
            {importando ? "Importando…" : `Importar ${previa?.nuevas.length ?? 0} movimientos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
