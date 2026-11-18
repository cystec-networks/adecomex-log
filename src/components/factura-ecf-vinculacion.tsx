import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Link2, Plus, Scissors, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtRD } from "@/lib/facturas-ecf";
import { detectarReferenciasFactura, descripcionesOcrGuardadas } from "@/lib/factura-venta-referencias";
import { contenedoresOcrGuardados, detectarContenedoresFactura, detectarTransportesFactura, transportesOcrGuardados } from "@/lib/factura-venta-contenedores";
import {
  TIPOS_CONCEPTO, alertaMonto, completarReparto, destinoPermitido, esTransporte, idDestino, montoEsperadoTransporte, parteAsignada,
  montosPorDestino, ordenarCandidatos, preseleccionEscaneo, prioridadCandidatos, validarAsignaciones,
  type Candidato, type FilaAsignacion, type Pistas, type RenglonReparto, type TipoConcepto,
} from "@/lib/factura-ecf-asignacion";

export type EstadoVinculacion = { destinos: string[]; filas: FilaAsignacion[]; confirmados: Record<string, boolean> };
export const ESTADO_VINCULACION_VACIO: EstadoVinculacion = { destinos: [], filas: [], confirmados: {} };

type FilaExp = { id: string; numero: string; cliente_id: string | null; bl_awb: string | null; numeros_contenedores: string | null; estado: string; fecha_llegada_real: string | null; created_at: string; factura_ecf_id: string | null };
type FilaTr = { id: string; numero_viaje: string | null; cliente_id: string | null; expediente_id: string | null; contenedores_detalle: string | null; fecha_salida: string | null; created_at: string; cantidad_viajes: number | null; precio_viaje: number | null };

const SEL_EXP = "id,numero,cliente_id,bl_awb,numeros_contenedores,estado,fecha_llegada_real,created_at,factura_ecf_id";
const SEL_TR = "id,numero_viaje,cliente_id,expediente_id,contenedores_detalle,fecha_salida,created_at,cantidad_viajes,precio_viaje";

/** e-NCF de las otras facturas ya vinculadas a cada destino (montos asignados y vínculos antiguos). */
async function facturasDeDestinos(exps: readonly FilaExp[], trs: readonly FilaTr[], excluir?: string) {
  const expIds = exps.map((e) => e.id), trIds = trs.map((t) => t.id);
  const [a1, a2, tf] = await Promise.all([
    expIds.length ? supabase.from("facturas_ecf_asignaciones").select("factura_id,expediente_id").in("expediente_id", expIds) : Promise.resolve({ data: [], error: null }),
    trIds.length ? supabase.from("facturas_ecf_asignaciones").select("factura_id,transporte_id").in("transporte_id", trIds) : Promise.resolve({ data: [], error: null }),
    trIds.length ? supabase.from("transporte_facturas_ecf").select("factura_ecf_id,transporte_id").in("transporte_id", trIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [a1, a2, tf]) if (r.error) throw r.error;
  const pares: [string, string][] = [
    ...exps.flatMap((e) => (e.factura_ecf_id ? [[`exp:${e.id}`, e.factura_ecf_id] as [string, string]] : [])),
    ...((a1.data ?? []) as any[]).map((r) => [`exp:${r.expediente_id}`, r.factura_id] as [string, string]),
    ...((a2.data ?? []) as any[]).map((r) => [`tr:${r.transporte_id}`, r.factura_id] as [string, string]),
    ...((tf.data ?? []) as any[]).map((r) => [`tr:${r.transporte_id}`, r.factura_ecf_id] as [string, string]),
  ].filter(([, f]) => f && f !== excluir);
  const ids = [...new Set(pares.map(([, f]) => f))];
  const facturas = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from("facturas_ecf")
      .select("id,encf,monto_total,vinculo_por_linea,facturas_ecf_lineas(id,transporte_id,expediente_id,valor,itbis),facturas_ecf_asignaciones(linea_id,transporte_id,expediente_id,monto)")
      .in("id", ids.slice(i, i + 100)).is("eliminado_en", null);
    if (error) throw error;
    for (const f of data ?? []) facturas.set(f.id, f);
  }
  const encfs = new Map<string, string[]>();
  const montos = new Map<string, number>();
  const vistos = new Set<string>();
  for (const [k, fid] of pares) {
    const f = facturas.get(fid);
    if (!f) continue;
    const l = encfs.get(k) ?? [];
    if (!l.includes(f.encf)) l.push(f.encf);
    encfs.set(k, l);
    if (esTransporte(k) && !vistos.has(`${k}|${fid}`)) {
      vistos.add(`${k}|${fid}`);
      montos.set(k, (montos.get(k) ?? 0) + (parteAsignada(f, { transporteId: idDestino(k) }) ?? Number(f.monto_total || 0)));
    }
  }
  return { encfs, montos };
}

function aCandidatos(exps: readonly FilaExp[], trs: readonly FilaTr[], otras: Awaited<ReturnType<typeof facturasDeDestinos>>, clienteId: string | null, endosados: Set<string>, numerosExp: Map<string, string>): Candidato[] {
  const delCliente = new Set(exps.filter((e) => e.cliente_id === clienteId || endosados.has(e.id)).map((e) => e.id));
  return [
    ...exps.map((e): Candidato => ({
      clave: `exp:${e.id}`, tipo: "expediente", numero: e.numero, clienteCoincide: delCliente.has(e.id), completado: e.estado === "completado",
      facturasOtras: otras.encfs.get(`exp:${e.id}`) ?? [], bl: e.bl_awb, contenedores: e.numeros_contenedores, fecha: e.fecha_llegada_real ?? e.created_at,
    })),
    ...trs.map((t): Candidato => ({
      clave: `tr:${t.id}`, tipo: "transporte", numero: t.numero_viaje ?? "Transporte", clienteCoincide: t.cliente_id === clienteId || (!!t.expediente_id && delCliente.has(t.expediente_id)),
      facturasOtras: otras.encfs.get(`tr:${t.id}`) ?? [], facturadoOtras: otras.montos.get(`tr:${t.id}`) ?? 0, contenedores: t.contenedores_detalle, fecha: t.fecha_salida ?? t.created_at,
      esperado: montoEsperadoTransporte(t), expedienteNumero: t.expediente_id ? numerosExp.get(t.expediente_id) ?? null : null,
    })),
  ];
}

async function endososDelCliente(clienteId: string | null) {
  if (!clienteId) return new Set<string>();
  const { data, error } = await supabase.from("expediente_endosos").select("expediente_id").eq("consignatario_endosado_id", clienteId).eq("activo", true);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.expediente_id));
}

async function numerosExpedientes(ids: readonly (string | null)[]) {
  const u = [...new Set(ids.filter(Boolean) as string[])];
  const m = new Map<string, string>();
  if (!u.length) return m;
  const { data } = await supabase.from("expedientes").select("id,numero").in("id", u);
  for (const e of data ?? []) m.set(e.id, e.numero);
  return m;
}

/** Candidatos del mismo cliente (incluido el endosado): Expedientes no Completados y sus Transportes. */
async function cargarCandidatos(clienteId: string, facturaId?: string) {
  const endosados = await endososDelCliente(clienteId);
  const filtroCliente = `cliente_id.eq.${clienteId}${endosados.size ? `,id.in.(${[...endosados].join(",")})` : ""}`;
  const { data: exps, error } = await supabase.from("expedientes").select(SEL_EXP).is("eliminado_en", null).neq("estado", "completado")
    .or(filtroCliente).order("created_at", { ascending: false }).limit(150);
  if (error) throw error;
  const expIds = (exps ?? []).map((e) => e.id);
  const { data: trs, error: e2 } = await supabase.from("transportes").select(SEL_TR).is("eliminado_en", null)
    .or(`cliente_id.eq.${clienteId}${expIds.length ? `,expediente_id.in.(${expIds.join(",")})` : ""}`).order("created_at", { ascending: false }).limit(150);
  if (e2) throw e2;
  const otras = await facturasDeDestinos((exps ?? []) as FilaExp[], (trs ?? []) as FilaTr[], facturaId);
  const nums = new Map<string, string>([...(exps ?? []).map((e) => [e.id, e.numero] as [string, string]), ...(await numerosExpedientes((trs ?? []).map((t) => t.expediente_id)))]);
  return aCandidatos((exps ?? []) as FilaExp[], (trs ?? []) as FilaTr[], otras, clienteId, endosados, nums);
}

async function cargarPorClaves(claves: readonly string[], clienteId: string | null, facturaId?: string) {
  const expIds = claves.filter((c) => !esTransporte(c)).map(idDestino);
  const trIds = claves.filter(esTransporte).map(idDestino);
  const [e, t, endosados] = await Promise.all([
    expIds.length ? supabase.from("expedientes").select(SEL_EXP).in("id", expIds) : Promise.resolve({ data: [], error: null }),
    trIds.length ? supabase.from("transportes").select(SEL_TR).in("id", trIds) : Promise.resolve({ data: [], error: null }),
    endososDelCliente(clienteId),
  ]);
  if (e.error) throw e.error;
  if (t.error) throw t.error;
  const exps = (e.data ?? []) as FilaExp[], trs = (t.data ?? []) as FilaTr[];
  const otras = await facturasDeDestinos(exps, trs, facturaId);
  const nums = new Map<string, string>([...exps.map((x) => [x.id, x.numero] as [string, string]), ...(await numerosExpedientes(trs.map((x) => x.expediente_id)))]);
  return aCandidatos(exps, trs, otras, clienteId, endosados, nums);
}

async function buscarManual(q: string, clienteId: string | null, facturaId?: string) {
  const t = q.replace(/[,()*%\\]/g, " ").trim();
  if (t.length < 3) return [];
  const pat = `%${t}%`;
  const [e, tr, endosados] = await Promise.all([
    supabase.from("expedientes").select(SEL_EXP).is("eliminado_en", null)
      .or(`numero.ilike.${pat},bl_awb.ilike.${pat},numeros_contenedores.ilike.${pat}`).order("created_at", { ascending: false }).limit(12),
    supabase.from("transportes").select(SEL_TR).is("eliminado_en", null)
      .or(`numero_viaje.ilike.${pat},contenedores_detalle.ilike.${pat},placa_contenedor.ilike.${pat}`).order("created_at", { ascending: false }).limit(12),
    endososDelCliente(clienteId),
  ]);
  if (e.error) throw e.error;
  if (tr.error) throw tr.error;
  const exps = (e.data ?? []) as FilaExp[], trs = (tr.data ?? []) as FilaTr[];
  const otras = await facturasDeDestinos(exps, trs, facturaId);
  const nums = new Map<string, string>([...exps.map((x) => [x.id, x.numero] as [string, string]), ...(await numerosExpedientes(trs.map((x) => x.expediente_id)))]);
  return aCandidatos(exps, trs, otras, clienteId, endosados, nums);
}

/** Referencias escritas en la factura (renglones y lectura del escaneo guardada en Notas). */
export function pistasFactura(descripciones: readonly string[], notas: string | null | undefined): Pistas {
  const ocr = descripcionesOcrGuardadas(notas ?? "");
  const refs = detectarReferenciasFactura([...descripciones, ...ocr]);
  return {
    expedientes: refs.expedientes,
    bl: refs.bl,
    contenedores: detectarContenedoresFactura([...contenedoresOcrGuardados(notas ?? ""), ...descripciones, ...ocr]),
    transportes: detectarTransportesFactura([...transportesOcrGuardados(notas ?? ""), ...ocr, ...descripciones]),
  };
}

export function agregarDestinoEstado(renglones: readonly RenglonReparto[], v: EstadoVinculacion, clave: string): EstadoVinculacion {
  if (v.destinos.includes(clave)) return v;
  const destinos = [...v.destinos, clave];
  return { ...v, destinos, filas: completarReparto(renglones, v.filas, destinos) };
}

export function quitarDestinoEstado(renglones: readonly RenglonReparto[], v: EstadoVinculacion, clave: string): EstadoVinculacion {
  const destinos = v.destinos.filter((d) => d !== clave);
  let filas = v.filas.map((f) => (f.destino === clave ? { ...f, destino: "", origen: undefined } : f));
  filas = filas.filter((f, i) => f.destino || !filas.some((x, j) => j !== i && x.linea === f.linea && (x.destino || j < i)));
  filas = filas.map((f) => (filas.filter((x) => x.linea === f.linea).length === 1 ? { ...f, monto: renglones[f.linea]?.importe ?? f.monto } : f));
  const { [clave]: _omit, ...confirmados } = v.confirmados;
  return { destinos, confirmados, filas: completarReparto(renglones, filas, destinos) };
}

/** Destinos con otra factura que aún no se confirmaron. */
export function faltanConfirmaciones(v: EstadoVinculacion, info: ReadonlyMap<string, Candidato>) {
  return v.destinos.filter((d) => (info.get(d)?.facturasOtras.length ?? 0) > 0 && !v.confirmados[d]);
}

const SIN_CANDIDATOS: Candidato[] = [];
const etiquetaDestino = (c?: Candidato) => (c ? (c.tipo === "expediente" ? `EXP. ${c.numero}` : c.numero) : "Destino");

export function VinculacionFacturaEcf({
  facturaId, clienteId, fechaEmision, total, renglones, onTipo, pistas, value, onChange, autoPreseleccionar = true, onInfo,
}: {
  facturaId?: string;
  clienteId: string | null;
  fechaEmision: string | null;
  total: number;
  renglones: readonly (RenglonReparto & { descripcion: string })[];
  onTipo: (linea: number, tipo: TipoConcepto) => void;
  pistas: Pistas;
  value: EstadoVinculacion;
  onChange: (v: EstadoVinculacion) => void;
  autoPreseleccionar?: boolean;
  /** Información de los destinos elegidos (para validar confirmaciones al guardar). */
  onInfo?: (info: Map<string, Candidato>) => void;
}) {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setQDebounced(q), 300); return () => clearTimeout(t); }, [q]);

  const { data: candidatos = SIN_CANDIDATOS, isFetching: cargando, isError } = useQuery({
    queryKey: ["vinculacion-candidatos", clienteId, facturaId ?? null],
    enabled: !!clienteId,
    queryFn: () => cargarCandidatos(clienteId!, facturaId),
  });
  const conocidos = useMemo(() => new Set(candidatos.map((c) => c.clave)), [candidatos]);
  const faltantes = value.destinos.filter((d) => !conocidos.has(d));
  const { data: extra = SIN_CANDIDATOS } = useQuery({
    queryKey: ["vinculacion-destinos", faltantes.slice().sort(), clienteId, facturaId ?? null],
    enabled: faltantes.length > 0,
    queryFn: () => cargarPorClaves(faltantes, clienteId, facturaId),
  });
  const { data: resultados = SIN_CANDIDATOS, isFetching: buscando } = useQuery({
    queryKey: ["vinculacion-buscar", qDebounced, clienteId, facturaId ?? null],
    enabled: qDebounced.trim().length >= 3,
    queryFn: () => buscarManual(qDebounced, clienteId, facturaId),
  });

  const info = useMemo(() => {
    const m = new Map<string, Candidato>();
    for (const c of [...candidatos, ...extra, ...resultados]) if (!m.has(c.clave)) m.set(c.clave, c);
    return m;
  }, [candidatos, extra, resultados]);
  const infoRef = useRef(onInfo);
  infoRef.current = onInfo;
  useEffect(() => { infoRef.current?.(info); }, [info]);

  const prioridad = prioridadCandidatos(renglones.map((r) => r.tipo));
  const ordenados = useMemo(() => ordenarCandidatos(candidatos, pistas, fechaEmision, prioridad), [candidatos, pistas, fechaEmision, prioridad]);

  // Preselección por escaneo: una vez por conjunto de referencias, solo si aún no hay destinos.
  const pistasClave = JSON.stringify(pistas);
  const preseleccionHecha = useRef<string | null>(null);
  useEffect(() => {
    if (!autoPreseleccionar || cargando || !candidatos.length || preseleccionHecha.current === pistasClave) return;
    preseleccionHecha.current = pistasClave;
    if (value.destinos.length) return;
    const elegidos = preseleccionEscaneo(ordenados);
    if (!elegidos.length) return;
    onChange({ ...value, destinos: elegidos, filas: completarReparto(renglones, value.filas, elegidos, "escaneo") });
  }, [autoPreseleccionar, cargando, candidatos.length, pistasClave, ordenados]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mantener las filas al día con los renglones (cantidad e importes).
  const firma = renglones.map((r) => `${r.importe}|${r.tipo}`).join(";");
  useEffect(() => {
    const filas = value.filas.filter((f) => f.linea < renglones.length).map((f) => {
      const propias = value.filas.filter((x) => x.linea === f.linea);
      return propias.length === 1 ? { ...f, monto: renglones[f.linea].importe } : f;
    });
    const completas = completarReparto(renglones, filas, value.destinos);
    if (JSON.stringify(completas) !== JSON.stringify(value.filas)) onChange({ ...value, filas: completas });
  }, [firma, renglones.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const validacion = validarAsignaciones(renglones, value.filas, total);
  const montos = montosPorDestino(value.filas);

  const agregar = (clave: string) => onChange(agregarDestinoEstado(renglones, value, clave));
  const quitar = (clave: string) => onChange(quitarDestinoEstado(renglones, value, clave));
  const setFila = (idx: number, patch: Partial<FilaAsignacion>) =>
    onChange({ ...value, filas: value.filas.map((f, i) => (i === idx ? { ...f, ...patch, origen: "manual" } : f)) });
  const dividir = (linea: number) => {
    const asignado = value.filas.filter((f) => f.linea === linea).reduce((s, f) => s + (Number(f.monto) || 0), 0);
    const resto = Math.max(0, Math.round((renglones[linea].importe - asignado) * 100) / 100);
    onChange({ ...value, filas: [...value.filas, { linea, destino: "", monto: resto, origen: "manual" }] });
  };
  const quitarFila = (idx: number) => {
    const linea = value.filas[idx].linea;
    let filas = value.filas.filter((_, i) => i !== idx);
    const propias = filas.filter((f) => f.linea === linea);
    if (propias.length === 1) filas = filas.map((f) => (f.linea === linea ? { ...f, monto: renglones[linea].importe } : f));
    onChange({ ...value, filas: completarReparto(renglones, filas, value.destinos) });
  };

  const sugeridos = ordenados.filter((c) => !value.destinos.includes(c.clave)).slice(0, 8);

  return (
    <section className="min-w-0 space-y-3 border-t pt-3" aria-label="Vinculación">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Link2 className="h-4 w-4" /> Vinculación</h3>
        <span className="text-xs text-muted-foreground">
          {prioridad === "transporte" ? "Solo renglones de transporte: primero Transportes." : "Con gestión aduanal: primero Expedientes."}
        </span>
      </div>

      {!clienteId && <p className="text-xs text-muted-foreground">Elige el cliente para ver los Expedientes y Transportes candidatos.</p>}

      {value.destinos.length > 0 && (
        <div className="space-y-2">
          {value.destinos.map((d) => {
            const c = info.get(d);
            const asignado = montos.get(d) ?? 0;
            const conOtras = asignado + (c?.facturadoOtras ?? 0);
            const alerta = c?.esperado != null ? alertaMonto(conOtras, c.esperado) : null;
            return (
              <div key={d} className="rounded-md border p-2 text-xs space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{esTransporte(d) ? "Transporte" : "Expediente"}</Badge>
                  {esTransporte(d)
                    ? <Link to="/transportes/$id" params={{ id: idDestino(d) }} className="font-semibold hover:underline" target="_blank">{etiquetaDestino(c)}</Link>
                    : <Link to="/expedientes/$id" params={{ id: idDestino(d) }} className="expediente-numero font-semibold hover:underline" target="_blank">{etiquetaDestino(c)}</Link>}
                  {c?.expedienteNumero && <span className="text-muted-foreground">del EXP. {c.expedienteNumero}</span>}
                  {c && !c.clienteCoincide && <Badge variant="outline" className="border-warning text-warning-text">Otro cliente</Badge>}
                  {c?.completado && <Badge variant="outline">Completado</Badge>}
                  <span className="ml-auto tabular-nums font-semibold">{fmtRD(asignado)}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`Quitar ${etiquetaDestino(c)}`} onClick={() => quitar(d)}><X className="h-3.5 w-3.5" /></Button>
                </div>
                {!!c?.facturasOtras.length && (
                  <label className="flex items-start gap-2 rounded bg-warning/10 p-1.5 text-warning-text">
                    <Checkbox checked={!!value.confirmados[d]} onCheckedChange={(v) => onChange({ ...value, confirmados: { ...value.confirmados, [d]: v === true } })} className="mt-0.5" />
                    <span>Ya tiene factura vinculada: <strong>{c.facturasOtras.join(", ")}</strong>. Confirmo que esta factura también le corresponde.</span>
                  </label>
                )}
                {alerta && (
                  <p className="flex items-start gap-1 text-warning-text"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {c?.facturadoOtras ? `Con sus otras facturas suma ${fmtRD(conOtras)} y` : "El monto asignado"} difiere {Math.round(Math.abs(alerta.variacion) * 100)} % del esperado ({fmtRD(alerta.esperado)}: viajes × precio). Revisa antes de guardar.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {clienteId && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Candidatos del cliente {cargando && "· cargando…"}</p>
            {isError && <p className="text-xs text-destructive">No se pudieron cargar los candidatos.</p>}
            {!cargando && !isError && sugeridos.length === 0 && <p className="text-xs text-muted-foreground">Sin más candidatos del cliente. Usa el buscador.</p>}
            <ul className="space-y-1">
              {sugeridos.map((c) => (
                <li key={c.clave} className="flex items-center gap-2 rounded border px-2 py-1 text-xs min-w-0">
                  <span className={`truncate font-medium ${c.tipo === "expediente" ? "expediente-numero" : ""}`} title={c.numero}>{etiquetaDestino(c)}</span>
                  {c.referencia && <Badge className="shrink-0" variant="secondary">En la factura</Badge>}
                  {c.facturasOtras.length ? <span className="truncate text-warning-text" title={c.facturasOtras.join(", ")}>Con factura</span> : <span className="shrink-0 text-muted-foreground">Sin factura</span>}
                  <Button type="button" size="sm" variant="outline" className="ml-auto h-6 shrink-0 px-2" onClick={() => agregar(c.clave)}><Plus className="h-3 w-3" /> Agregar</Button>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5 min-w-0">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="vinculacion-buscar">Buscar por número, BL o contenedor</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="vinculacion-buscar" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej.: 202611I4, TR-0000, MSCU…" />
            </div>
            {buscando && <p className="text-xs text-muted-foreground">Buscando…</p>}
            {qDebounced.trim().length >= 3 && !buscando && resultados.length === 0 && <p className="text-xs text-muted-foreground">Sin resultados.</p>}
            <ul className="space-y-1">
              {resultados.map((c) => (
                <li key={c.clave} className="flex items-center gap-2 rounded border px-2 py-1 text-xs min-w-0">
                  <span className={`truncate font-medium ${c.tipo === "expediente" ? "expediente-numero" : ""}`}>{etiquetaDestino(c)}</span>
                  {!c.clienteCoincide && <span className="shrink-0 text-warning-text">Otro cliente</span>}
                  {c.completado ? (
                    <span className="ml-auto shrink-0 text-muted-foreground">Completado: reábrelo para vincular</span>
                  ) : value.destinos.includes(c.clave) ? (
                    <span className="ml-auto shrink-0 text-muted-foreground">Elegido</span>
                  ) : (
                    <Button type="button" size="sm" variant="outline" className="ml-auto h-6 shrink-0 px-2" onClick={() => agregar(c.clave)}><Plus className="h-3 w-3" /> Agregar</Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Reparto por renglón</p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr><th className="px-2 py-1.5 text-left">Renglón</th><th className="px-2 text-left">Tipo</th><th className="px-2 text-right">Importe</th><th className="px-2 text-left">Destino</th><th className="px-2 text-right">Monto asignado</th><th className="px-2" /></tr>
            </thead>
            <tbody>
              {renglones.map((r, i) => {
                const filas = value.filas.map((f, idx) => ({ f, idx })).filter((x) => x.f.linea === i);
                const varias = filas.length > 1;
                return filas.map(({ f, idx }, k) => (
                  <tr key={`${i}-${idx}`} className={k === 0 ? "border-t" : ""}>
                    <td className="px-2 py-1 align-top">{k === 0 && <span className="break-words">{i + 1}. {r.descripcion || "—"}</span>}</td>
                    <td className="px-2 py-1 align-top">{k === 0 && (
                      <Select value={r.tipo} onValueChange={(v) => onTipo(i, v as TipoConcepto)}>
                        <SelectTrigger className="h-7 w-36" aria-label={`Tipo del renglón ${i + 1}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{TIPOS_CONCEPTO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    )}</td>
                    <td className="px-2 py-1 text-right align-top tabular-nums">{k === 0 && fmtRD(r.importe)}</td>
                    <td className="px-2 py-1 align-top">
                      <Select value={f.destino || "__none__"} onValueChange={(v) => setFila(idx, { destino: v === "__none__" ? "" : v })}>
                        <SelectTrigger className="h-7 w-44 min-w-0" aria-label={`Destino del renglón ${i + 1}`} title={f.destino ? etiquetaDestino(info.get(f.destino)) : undefined}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin destino</SelectItem>
                          {value.destinos.map((d) => (
                            <SelectItem key={d} value={d} disabled={!destinoPermitido(r.tipo, d)}>
                              {etiquetaDestino(info.get(d))}{!destinoPermitido(r.tipo, d) ? " · solo transporte" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {f.destino && !destinoPermitido(r.tipo, f.destino) && <p className="mt-0.5 text-destructive">Un Transporte solo recibe renglones de transporte.</p>}
                    </td>
                    <td className="px-2 py-1 text-right align-top">
                      {varias
                        ? <Input type="number" step="0.01" className="ml-auto h-7 w-28 text-right" aria-label={`Monto asignado del renglón ${i + 1}`} value={f.monto} onChange={(e) => setFila(idx, { monto: +e.target.value || 0 })} />
                        : <span className="tabular-nums">{fmtRD(f.monto)}</span>}
                    </td>
                    <td className="px-2 py-1 text-right align-top whitespace-nowrap">
                      {k === 0 && value.destinos.length > 1 && <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => dividir(i)} title="Repartir este renglón entre varios destinos"><Scissors className="h-3.5 w-3.5" /> Dividir</Button>}
                      {varias && <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Quitar esta parte" onClick={() => quitarFila(idx)}><X className="h-3.5 w-3.5" /></Button>}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
          <span>Asignado <strong className="tabular-nums">{fmtRD(validacion.asignado)}</strong> de <strong className="tabular-nums">{fmtRD(total)}</strong></span>
          {!validacion.vacia && Math.round(validacion.diferencia * 100) !== 0 && (
            <span className="font-semibold text-destructive">{validacion.diferencia > 0 ? "Falta" : "Sobra"} {fmtRD(Math.abs(validacion.diferencia))}</span>
          )}
        </div>
        {validacion.vacia
          ? <p className="text-xs text-muted-foreground">Sin vincular: la factura se guardará sin Expediente ni Transporte.</p>
          : validacion.errores.length > 0 && (
            <ul className="space-y-0.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {validacion.errores.map((e) => <li key={e} className="flex gap-1"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{e}</li>)}
            </ul>
          )}
      </div>
    </section>
  );
}

/** Reparto guardado de una factura y sus vínculos antiguos (para editar o «Vincular»). */
export async function cargarVinculacionGuardada(facturaId: string) {
  const [l, a, e, t] = await Promise.all([
    supabase.from("facturas_ecf_lineas").select("id,orden,descripcion,valor,itbis,tipo_concepto,expediente_id,transporte_id").eq("factura_id", facturaId).order("orden"),
    supabase.from("facturas_ecf_asignaciones").select("linea_id,expediente_id,transporte_id,monto").eq("factura_id", facturaId),
    supabase.from("expedientes").select("id").eq("factura_ecf_id", facturaId).is("eliminado_en", null),
    supabase.from("transporte_facturas_ecf").select("transporte_id").eq("factura_ecf_id", facturaId),
  ]);
  for (const r of [l, a, e, t]) if (r.error) throw r.error;
  return {
    lineas: l.data ?? [],
    asignaciones: a.data ?? [],
    legado: { expedientes: (e.data ?? []).map((x) => x.id), transportes: (t.data ?? []).map((x) => x.transporte_id) },
  };
}

/** Consultas que dependen de los vínculos de facturas. */
export const CLAVES_VINCULOS_FACTURA = [
  "facturas-ecf", "facturas-ecf-lite", "ecf-pendientes", "ecf-pendientes-count", "expediente", "expedientes", "facturas", "cxc-facturas",
  "costos_producto", "costos-producto-liq", "ecf-vinculada", "transportes", "transporte", "transportes-por-expediente", "transporte-facturas",
  "transporte-facturas-detalle", "dash-tr-rows", "transporte-facturas-ecf-todos", "vinculacion-candidatos", "vinculacion-destinos",
  "facturas-via-transporte", "auditoria", "ecf-pendientes-exp", "ecf-pendientes-tr", "facturas-ecf-sin-vincular",
];
