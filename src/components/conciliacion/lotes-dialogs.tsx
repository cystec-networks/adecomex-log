import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtLocalDate } from "@/lib/dates";
import {
  CATEGORIAS_TRANSFERENCIA, anterioresAlDiario, comisionesConPago, compararParaTf, cuentaDeMovimiento, cuentasConVariosBeneficiarios,
  estadoBeneficiario, gruposParaLote, ordenAsignacionTf, prellenarEntrada, sugerenciasExactas, tieneTf,
  type MovimientoBanco, type Sugerencia,
} from "@/lib/conciliacion-diario";
import { fmtRD, useCuentasBeneficiario, useInvalidarConciliacion, useReglasBanco } from "./datos";

type Mov = MovimientoBanco & { notas?: string | null; conciliado_tipo?: string | null; lote_marcado?: string | null; lote_conciliacion?: string | null; conciliado_en?: string | null };

const sumar = (l: { monto: number }[]) => l.reduce((s, m) => s + Math.round(Number(m.monto) * 100), 0) / 100;

function TablaMovs({ movs, extra }: { movs: Mov[]; extra?: (m: Mov) => React.ReactNode }) {
  return (
    <div className="max-h-[45vh] overflow-auto rounded-md border">
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 bg-background">
          <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
            <th className="px-2 py-1">Fecha</th><th className="px-2 py-1">Descripción</th><th className="px-2 py-1 text-right">Monto</th>{extra && <th className="px-2 py-1" />}
          </tr>
        </thead>
        <tbody>
          {movs.map((m) => (
            <tr key={m.id} className="border-b last:border-0">
              <td className="whitespace-nowrap px-2 py-1">{fmtLocalDate(m.fecha)}</td>
              <td className="px-2 py-1">{m.descripcion}</td>
              <td className="whitespace-nowrap px-2 py-1 text-right font-mono">{fmtRD(Number(m.monto))}</td>
              {extra && <td className="px-2 py-1">{extra(m)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 3. «No aplica (anterior al Diario)» en bloque: vista previa y confirmación; reversible. */
export function AnterioresDiarioDialog({ open, onClose, movimientos, inicio }: { open: boolean; onClose: () => void; movimientos: Mov[]; inicio: string | null }) {
  const invalidar = useInvalidarConciliacion();
  const lista = useMemo(() => anterioresAlDiario(movimientos, inicio), [movimientos, inicio]);
  const marcados = useMemo(
    () => movimientos.filter((m) => m.conciliado && m.conciliado_tipo === "ignorado" && m.notas === "No aplica (anterior al Diario)" && m.lote_marcado),
    [movimientos],
  );
  const lotes = [...new Set(marcados.map((m) => m.lote_marcado!))];

  const marcar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("marcar_no_aplica_lote", { p_movimientos: lista.map((m) => m.id), p_hasta: inicio! });
      if (error) throw error;
      return data as { cantidad: number; total: number };
    },
    onSuccess: (r) => { toast.success(`${r.cantidad} débitos marcados «No aplica (anterior al Diario)»`); invalidar(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deshacer = useMutation({
    mutationFn: async () => {
      let n = 0;
      for (const l of lotes) {
        const { data, error } = await supabase.rpc("deshacer_lote_no_aplica", { p_lote: l });
        if (error) throw error;
        n += Number(data ?? 0);
      }
      return n;
    },
    onSuccess: (n) => { toast.success(`${n} débitos volvieron a Pendiente`); invalidar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>No aplica (anterior al Diario)</DialogTitle>
          <DialogDescription>
            Débitos pendientes anteriores al {inicio ? fmtLocalDate(inicio) : "—"}, primera entrada del Registro de Diario. Nada se marca hasta que confirmes.
          </DialogDescription>
        </DialogHeader>
        {lista.length === 0 ? (
          <div className="text-[13px] text-muted-foreground">No quedan débitos pendientes anteriores al Diario.</div>
        ) : (
          <>
            <div className="text-[13px]"><strong>{lista.length}</strong> débitos · total <strong>{fmtRD(sumar(lista))}</strong> · del {fmtLocalDate(lista[0].fecha)} al {fmtLocalDate(lista[lista.length - 1].fecha)}</div>
            <TablaMovs movs={lista} />
          </>
        )}
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {marcados.length > 0 ? (
            <Button variant="outline" disabled={deshacer.isPending} onClick={() => deshacer.mutate()}>
              Deshacer marca en bloque ({marcados.length})
            </Button>
          ) : <span />}
          <Button disabled={lista.length === 0 || !inicio || marcar.isPending} onClick={() => marcar.mutate()}>
            {marcar.isPending ? "Marcando…" : `Confirmar y marcar ${lista.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Comisiones con la misma referencia que un pago: se vinculan a ese pago, sin TF propio. */
export function ComisionesLoteDialog({ open, onClose, movimientos }: { open: boolean; onClose: () => void; movimientos: Mov[] }) {
  const invalidar = useInvalidarConciliacion();
  const pares = useMemo(() => comisionesConPago(movimientos), [movimientos]);
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => { if (open) setSel(pares.map((p) => p.comision.id)); }, [open, pares]);
  const elegidos = pares.filter((p) => sel.includes(p.comision.id));

  const vincular = useMutation({
    mutationFn: async () => {
      let ok = 0;
      const errores: string[] = [];
      for (const p of elegidos) {
        const { error } = await supabase.rpc("marcar_movimiento_banco", { p_movimiento: p.comision.id, p_tipo: "comision", p_vinculado: p.pago.id });
        if (error) errores.push(`${fmtLocalDate(p.comision.fecha)} ${p.comision.descripcion}: ${error.message}`);
        else ok++;
      }
      return { ok, errores };
    },
    onSuccess: ({ ok, errores }) => {
      if (errores.length) toast.error(`${ok} vinculadas; ${errores.length} con error: ${errores[0]}`);
      else toast.success(`${ok} comisiones vinculadas con su pago`);
      invalidar();
      if (!errores.length) onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vincular comisiones con su pago</DialogTitle>
          <DialogDescription>Cada comisión queda unida al pago de su misma referencia; no se crea ningún TF.</DialogDescription>
        </DialogHeader>
        {pares.length === 0 ? (
          <div className="text-[13px] text-muted-foreground">No hay comisiones pendientes con un pago de la misma referencia.</div>
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                  <th className="px-2 py-1" /><th className="px-2 py-1">Fecha</th><th className="px-2 py-1">Comisión</th><th className="px-2 py-1">Pago con la misma referencia</th>
                </tr>
              </thead>
              <tbody>
                {pares.map(({ comision: c, pago: p }) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-2 py-1"><Checkbox checked={sel.includes(c.id)} onCheckedChange={(v) => setSel((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))} /></td>
                    <td className="whitespace-nowrap px-2 py-1">{fmtLocalDate(c.fecha)}</td>
                    <td className="px-2 py-1">{c.descripcion} · <span className="font-mono">{fmtRD(Number(c.monto))}</span></td>
                    <td className="px-2 py-1">
                      {p.descripcion} · <span className="font-mono">{fmtRD(Number(p.monto))}</span>
                      {p.conciliado ? <Badge variant="secondary" className="ml-1 text-[11px]">Conciliado</Badge> : <Badge variant="outline" className="ml-1 text-[11px]">Pendiente</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button disabled={elegidos.length === 0 || vincular.isPending} onClick={() => vincular.mutate()}>
            {vincular.isPending ? "Vinculando…" : `Confirmar y vincular ${elegidos.length} (${fmtRD(sumar(elegidos.map((e) => e.comision)))})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 7. Entradas retroactivas por lote de un mismo beneficiario, con vista previa de TF. */
export function EntradasLoteDialog({
  open, onClose, movimientos, inicio, conSugerencia,
}: { open: boolean; onClose: () => void; movimientos: Mov[]; inicio: string | null; conSugerencia: (m: Mov) => boolean }) {
  const invalidar = useInvalidarConciliacion();
  const { data: cuentas = [] } = useCuentasBeneficiario();
  const { data: reglas = [] } = useReglasBanco();
  const { grupos, sinAgrupar } = useMemo(
    () => gruposParaLote(movimientos, conSugerencia, cuentas, reglas, inicio),
    [movimientos, conSugerencia, cuentas, reglas, inicio],
  );
  const [clave, setClave] = useState<string>("");
  const grupo = grupos.find((g) => g.clave === clave) ?? null;
  const [sel, setSel] = useState<string[]>([]);
  const [form, setForm] = useState({ categoria: "Otro", beneficiario: "", concepto: "" });
  // Cuenta compartida: titular elegido por movimiento (nunca se asume).
  const [benefPor, setBenefPor] = useState<Record<string, string>>({});
  const titulares = grupo?.titulares ?? null;

  useEffect(() => { if (!open) setClave(""); }, [open]);
  useEffect(() => {
    if (!grupo) return;
    setBenefPor({});
    setSel(grupo.movimientos.map((m) => m.id));
    const p = prellenarEntrada(grupo.movimientos[0], cuentas, reglas);
    setForm({ categoria: p.categoria, beneficiario: grupo.beneficiario || p.beneficiario, concepto: grupo.clave.startsWith("cuenta:") ? `Transferencia a cuenta ${grupo.clave.slice(7)}` : p.concepto });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const elegidos = (grupo?.movimientos ?? []).filter((m) => sel.includes(m.id));
  const { data: previstos, isFetching } = useQuery({
    queryKey: ["previsualizar-tf", elegidos.length],
    enabled: open && elegidos.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("previsualizar_tf", { p_cantidad: elegidos.length });
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });

  const crear = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("crear_entradas_diario_lote", {
        p_movimientos: elegidos.map((m) => m.id), p_categoria: form.categoria, p_beneficiario: titulares ? "" : form.beneficiario.trim(),
        p_concepto: form.concepto.trim(), p_tf_previstos: previstos ?? undefined,
        p_beneficiarios: titulares ? Object.fromEntries(elegidos.map((m) => [m.id, benefPor[m.id]])) : undefined,
      });
      if (error) throw error;
      return data as { secuencias: string[]; total: number; cambio_numero: boolean };
    },
    onSuccess: (r) => {
      const rango = `${r.secuencias[0]}${r.secuencias.length > 1 ? ` a ${r.secuencias[r.secuencias.length - 1]}` : ""}`;
      if (r.cambio_numero) toast.warning(`Entradas creadas con ${rango}: los números previstos cambiaron mientras confirmabas.`);
      else toast.success(`${r.secuencias.length} entradas creadas (${rango}) y conciliadas`);
      invalidar();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const beneficiarioListo = titulares ? elegidos.every((m) => !!benefPor[m.id]) : !!form.beneficiario.trim();
  const valido = elegidos.length > 0 && form.categoria && beneficiarioListo && form.concepto.trim() && previstos?.length === elegidos.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear entradas por lote</DialogTitle>
          <DialogDescription>
            Débitos desde el {inicio ? fmtLocalDate(inicio) : "—"} sin entrada en el Diario, de un mismo beneficiario. Cada uno recibe su propio TF, queda «creada desde banco (retroactiva)» y conciliado. Nada se crea hasta que confirmes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 min-w-0">
          <Label>Beneficiario (cuenta destino o regla)</Label>
          <Select value={clave} onValueChange={setClave}>
            <SelectTrigger title={grupo?.etiqueta}><SelectValue placeholder="Elegir grupo" /></SelectTrigger>
            <SelectContent>
              {grupos.map((g) => (
                <SelectItem key={g.clave} value={g.clave}>{g.etiqueta} — {g.movimientos.length} mov. · {fmtRD(g.total)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sinAgrupar.length > 0 && (
            <div className="text-[11px] text-muted-foreground">{sinAgrupar.length} débitos sin cuenta destino ni regla no se pueden agrupar; créalos uno a uno o agrega una regla.</div>
          )}
        </div>
        {grupo && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 min-w-0">
                <Label>Categoría</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger title={form.categoria}><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIAS_TRANSFERENCIA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-0 sm:col-span-2">
                <Label>Beneficiario</Label>
                {titulares ? (
                  <div className="rounded-md border border-warning/60 bg-warning/10 px-2 py-1.5 text-[12px]">
                    <Badge variant="outline" className="mr-1 text-[11px]">Cuenta compartida</Badge>
                    {titulares.join(" y/o ")}. Elige el titular en cada movimiento.
                  </div>
                ) : (
                  <Input value={form.beneficiario} placeholder={grupo.nombrado ? "" : "Escribe el nombre; la cuenta lo aprenderá"} onChange={(e) => setForm({ ...form, beneficiario: e.target.value })} />
                )}
              </div>
              <div className="space-y-1 min-w-0 sm:col-span-3">
                <Label>Concepto (común a todas)</Label>
                <Textarea rows={2} value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
              </div>
            </div>
            <div className="max-h-[40vh] overflow-auto rounded-md border">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                    <th className="px-2 py-1"><Checkbox checked={elegidos.length === grupo.movimientos.length} onCheckedChange={(v) => setSel(v ? grupo.movimientos.map((m) => m.id) : [])} /></th>
                    <th className="px-2 py-1">Fecha</th><th className="px-2 py-1">Descripción</th><th className="px-2 py-1 text-right">Monto</th>
                    {titulares && <th className="px-2 py-1">Beneficiario</th>}
                    <th className="px-2 py-1">TF que se asignará</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.movimientos.map((m) => {
                    const i = elegidos.findIndex((x) => x.id === m.id);
                    return (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="px-2 py-1"><Checkbox checked={i >= 0} onCheckedChange={(v) => setSel((s) => (v ? [...s, m.id] : s.filter((x) => x !== m.id)))} /></td>
                        <td className="whitespace-nowrap px-2 py-1">{fmtLocalDate(m.fecha)}</td>
                        <td className="px-2 py-1">{m.descripcion}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right font-mono">{fmtRD(Number(m.monto))}</td>
                        {titulares && (
                          <td className="min-w-[180px] px-2 py-1">
                            <Select value={benefPor[m.id] ?? ""} onValueChange={(v) => setBenefPor((p) => ({ ...p, [m.id]: v }))}>
                              <SelectTrigger className={`h-7 text-[12px] ${i >= 0 && !benefPor[m.id] ? "border-warning" : ""}`} title={benefPor[m.id] || titulares.join(" y/o ")}>
                                <SelectValue placeholder={`Elegir: ${titulares.join(" / ")}`} />
                              </SelectTrigger>
                              <SelectContent>{titulares.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                        )}
                        <td className="px-2 py-1 font-mono">{i >= 0 ? (isFetching ? "…" : previstos?.[i] ?? "—") : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-muted-foreground">Los números se asignan en orden de fecha. Si cancelas, no se consume ninguno; si alguien usa uno mientras confirmas, se avisa con los números reales.</div>
            {titulares && !beneficiarioListo && elegidos.length > 0 && <div className="text-[11px] text-destructive">Falta elegir el titular en {elegidos.filter((m) => !benefPor[m.id]).length} movimiento(s) marcado(s).</div>}
          </>
        )}
        <DialogFooter>
          <Button disabled={!valido || crear.isPending} onClick={() => crear.mutate()}>
            {crear.isPending ? "Creando…" : elegidos.length
              ? `Confirmar y crear ${elegidos.length} (${previstos?.[0] ?? "…"}${elegidos.length > 1 ? ` a ${previstos?.[elegidos.length - 1] ?? "…"}` : ""}) · ${fmtRD(sumar(elegidos))}`
              : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TfVecino = { tf: string; fecha: string } | null;
type TfPrevisto = {
  solicitud_id: string; tf: string; fuente: "nuevo" | "viaje";
  /** TF anotado en los viajes y si encaja entre el TF guardado anterior y el siguiente. */
  viaje: { mencionado: string; fecha_referencia: string; encaja: boolean; anterior: TfVecino; siguiente: TfVecino } | null;
};

const vecinoTf = (v: TfVecino, lado: string) => (v ? `${v.tf} del ${fmtLocalDate(v.fecha)}` : `sin TF ${lado} guardado`);

/** Explica por qué se usa (o no) el TF anotado en el viaje: debe encajar entre el TF anterior y el siguiente. */
function NotaTfViaje({ p }: { p: TfPrevisto }) {
  const v = p.viaje;
  if (!v) return null;
  const rango = `anterior: ${vecinoTf(v.anterior, "anterior")}; siguiente: ${vecinoTf(v.siguiente, "siguiente")}; débito del ${fmtLocalDate(v.fecha_referencia)}`;
  return (
    <div className="max-w-[260px] whitespace-normal font-sans text-[11px] text-muted-foreground">
      {p.fuente === "viaje"
        ? <>Anotado en el viaje y encaja en orden ({rango}).</>
        : <>El viaje anota {v.mencionado} en «N° Ref. Pago», pero {v.encaja ? "ese número ya está ocupado" : "no se pudo comprobar que encaje en orden"} ({rango}); recibe el siguiente disponible.</>}
    </div>
  );
}

/** Conciliar en bloque los débitos con una única sugerencia exacta (una entrada, mismo monto, ±3 días). */
export function ExactasLoteDialog({
  open, onClose, movimientos, sugerencias,
}: { open: boolean; onClose: () => void; movimientos: Mov[]; sugerencias: Map<string, Sugerencia[]> }) {
  const invalidar = useInvalidarConciliacion();
  const { exactas, conVariasOpciones, entradaCompartida } = useMemo(() => sugerenciasExactas(movimientos, sugerencias), [movimientos, sugerencias]);
  const { data: cuentasCat = [] } = useCuentasBeneficiario();
  const conflictos = useMemo(() => cuentasConVariosBeneficiarios(exactas, cuentasCat), [exactas, cuentasCat]);
  const [sel, setSel] = useState<string[]>([]);
  const [elegidoPor, setElegidoPor] = useState<Record<string, string>>({});
  const [asignarTf, setAsignarTf] = useState(false);

  const opcionesDe = (m: Mov) => { const c = cuentaDeMovimiento(m); return c ? conflictos.get(c) : undefined; };
  const estadoDe = (x: (typeof exactas)[number]) => estadoBeneficiario(x.entrada.beneficiario, opcionesDe(x.movimiento), elegidoPor[x.movimiento.id]);
  const conciliable = (x: (typeof exactas)[number]) => { const st = estadoDe(x); return st === "sin-conflicto" || st === "corresponde"; };

  // Al abrir: marcados solo los de beneficiario verificado, con TF y sin cuenta en conflicto; el resto se revisa a mano.
  useEffect(() => {
    if (!open) return;
    setElegidoPor({});
    setAsignarTf(false);
    setSel(exactas.filter((x) => x.beneficiarioVerificado && tieneTf(x.entrada.secuencia) && !opcionesDe(x.movimiento)).map((x) => x.movimiento.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const elegidos = useMemo(
    () => exactas.filter((x) => sel.includes(x.movimiento.id) && conciliable(x)).sort(compararParaTf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exactas, sel, elegidoPor, conflictos],
  );
  const sinTfElegidos = useMemo(() => ordenAsignacionTf(elegidos), [elegidos]);
  const hayResolver = exactas.some((x) => opcionesDe(x.movimiento));

  const entradasTf = sinTfElegidos.map((x) => ({ origen_tipo: x.entrada.origen_tipo, solicitud_id: x.entrada.id, movimiento_id: x.movimiento.id }));
  const { data: previstos, isFetching: calculandoTf, error: errorTf } = useQuery({
    queryKey: ["previsualizar-tf", "exactas", entradasTf.map((e) => e.solicitud_id).join(",")],
    enabled: open && asignarTf && entradasTf.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("previsualizar_tf_exactas", { p_entradas: entradasTf });
      if (error) throw error;
      return (data ?? []) as unknown as TfPrevisto[];
    },
  });
  const tfDe = useMemo(() => new Map((previstos ?? []).map((p) => [p.solicitud_id, p])), [previstos]);
  const tfListo = !asignarTf || sinTfElegidos.length === 0
    || (!calculandoTf && sinTfElegidos.every((x) => tfDe.has(x.entrada.id)) && tfDe.size === sinTfElegidos.length);

  const lotes = useMemo(() => {
    const mapa = new Map<string, { lote: string; n: number; total: number; fecha: string }>();
    for (const m of movimientos) {
      if (!m.conciliado || m.conciliado_tipo !== "diario" || !m.lote_conciliacion) continue;
      const l = mapa.get(m.lote_conciliacion) ?? { lote: m.lote_conciliacion, n: 0, total: 0, fecha: m.conciliado_en ?? "" };
      l.n++;
      l.total = (Math.round(l.total * 100) + Math.round(Number(m.monto) * 100)) / 100;
      mapa.set(m.lote_conciliacion, l);
    }
    return [...mapa.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [movimientos]);

  const conciliar = useMutation({
    mutationFn: async () => {
      const usarTf = asignarTf && sinTfElegidos.length > 0;
      const { data, error } = await supabase.rpc("conciliar_exactas_lote", {
        p_pares: elegidos.map((x) => ({
          movimiento_id: x.movimiento.id, origen_tipo: x.entrada.origen_tipo, solicitud_id: x.entrada.id,
          beneficiario_confirmado: estadoDe(x) === "corresponde" ? x.entrada.beneficiario : null,
        })),
        p_asignar_tf: usarTf,
        p_tf_previstos: usarTf ? (previstos ?? []).map((p) => ({ solicitud_id: p.solicitud_id, tf: p.tf })) : undefined,
      });
      if (error) throw error;
      return data as unknown as { cantidad: number; total: number; tf_asignados?: { tf: string }[] };
    },
    onSuccess: (r) => {
      const tfs = (r.tf_asignados ?? []).map((t) => t.tf);
      const extra = tfs.length ? ` · ${tfs.length} TF asignados (${tfs[0]}${tfs.length > 1 ? ` a ${tfs[tfs.length - 1]}` : ""})` : "";
      toast.success(`${r.cantidad} débitos conciliados en un lote (${fmtRD(Number(r.total))})${extra}`);
      invalidar();
      onClose();
    },
    onError: (e: Error) => { toast.error(`No se concilió ninguno: ${e.message}`); invalidar(); },
  });
  const deshacer = useMutation({
    mutationFn: async (lote: string) => {
      const { data, error } = await supabase.rpc("deshacer_lote_conciliacion", { p_lote: lote });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (n) => { toast.success(`Lote deshecho: ${n} débitos volvieron a Pendiente`); invalidar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmtHora = (iso: string) => iso
    ? new Intl.DateTimeFormat("es-DO", { timeZone: "America/Santo_Domingo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
    : "—";
  const marcar = (id: string, v: boolean) => setSel((s) => (v ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
  const elegirBeneficiario = (x: (typeof exactas)[number], nombre: string) => {
    setElegidoPor((p) => ({ ...p, [x.movimiento.id]: nombre }));
    marcar(x.movimiento.id, estadoBeneficiario(x.entrada.beneficiario, opcionesDe(x.movimiento), nombre) === "corresponde");
  };
  const conciliables = exactas.filter(conciliable);
  const totalSinTf = exactas.filter((x) => !tieneTf(x.entrada.secuencia)).length;
  const tfsPrevistos = asignarTf && tfListo ? sinTfElegidos.map((x) => tfDe.get(x.entrada.id)?.tf ?? "") : [];
  const rangoTf = tfsPrevistos.length === 0 ? ""
    : ` · ${tfsPrevistos.length} TF: ${tfsPrevistos.length <= 3 ? tfsPrevistos.join(", ") : `${tfsPrevistos.slice(0, 2).join(", ")}… ${tfsPrevistos[tfsPrevistos.length - 1]}`}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conciliar sugerencias exactas</DialogTitle>
          <DialogDescription>
            Débitos con una sola entrada posible del Diario: mismo monto neto, fecha a 3 días o menos y sin diferencia. Cada débito se concilia con su propia entrada; los montos del Diario no cambian. Nada se concilia hasta que confirmes.
          </DialogDescription>
        </DialogHeader>
        {(conVariasOpciones > 0 || entradaCompartida > 0) && (
          <div className="text-[11px] text-muted-foreground">
            Fuera de este bloque: {conVariasOpciones} con dos o más entradas posibles (o pago agrupado){entradaCompartida > 0 ? ` · ${entradaCompartida} cuya entrada también sirve a otro débito` : ""}. Concílialos uno a uno.
          </div>
        )}
        {totalSinTf > 0 && (
          <div className="flex flex-wrap items-start gap-2 rounded-md border border-warning/60 bg-warning/10 p-2 text-[12px]">
            <Checkbox id="asignar-tf" checked={asignarTf} onCheckedChange={(v) => setAsignarTf(v === true)} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <Label htmlFor="asignar-tf" className="text-[13px]">Asignar TF al conciliar</Label>
              <div className="text-[11px] text-muted-foreground">
                {totalSinTf} {totalSinTf === 1 ? "entrada no tiene" : "entradas no tienen"} TF y empiezan desmarcadas. Con esta opción, cada fila marcada sin TF recibe al confirmar el siguiente número disponible (último guardado + 1, saltando los ocupados), en orden de fecha. Un TF anotado en el viaje solo se usa si encaja entre el TF guardado anterior y el siguiente según la fecha del débito. Quedan marcadas «TF asignado retroactivamente». Si cancelas, no se usa ningún número.
              </div>
              {asignarTf && sinTfElegidos.length === 0 && <div className="mt-1 text-[11px]">Marca las filas «Sin TF» que quieras conciliar para ver el TF que recibiría cada una.</div>}
              {asignarTf && errorTf && <div className="mt-1 text-[11px] text-destructive">No se pudo calcular la vista previa de TF: {(errorTf as Error).message}</div>}
            </div>
          </div>
        )}
        {exactas.length === 0 ? (
          <div className="text-[13px] text-muted-foreground">No hay débitos con sugerencia exacta única.</div>
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
                  <th className="px-2 py-1"><Checkbox checked={conciliables.length > 0 && elegidos.length === conciliables.length} onCheckedChange={(v) => setSel(v ? conciliables.map((x) => x.movimiento.id) : [])} /></th>
                  <th className="px-2 py-1">Fecha banco</th><th className="px-2 py-1">Descripción banco</th><th className="px-2 py-1 text-right">Monto</th>
                  <th className="px-2 py-1">Entrada del Diario</th><th className="px-2 py-1">TF</th>
                </tr>
              </thead>
              <tbody>
                {exactas.map((x) => {
                  const { movimiento: m, entrada: e, dias, beneficiarioVerificado } = x;
                  const conTf = tieneTf(e.secuencia);
                  const opciones = opcionesDe(m);
                  const estado = estadoDe(x);
                  const marcado = sel.includes(m.id) && conciliable(x);
                  const previsto = !conTf && asignarTf && marcado ? tfDe.get(e.id) : undefined;
                  return (
                    <tr key={m.id} className={`border-b last:border-0 align-top ${!conTf || opciones ? "bg-warning/10" : ""}`}>
                      <td className="px-2 py-1">
                        <Checkbox checked={marcado} disabled={!conciliable(x)} onCheckedChange={(v) => marcar(m.id, v === true)}
                          title={conciliable(x) ? undefined : "Elige primero el beneficiario correcto"} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1">{fmtLocalDate(m.fecha)}</td>
                      <td className="px-2 py-1">{m.descripcion}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-right font-mono">{fmtRD(Number(m.monto))}</td>
                      <td className="min-w-0 px-2 py-1">
                        <div>{fmtLocalDate(e.fecha)} · {e.beneficiario}{dias > 0 ? <span className="text-muted-foreground"> · {dias} {dias === 1 ? "día" : "días"}</span> : null}</div>
                        <div className="text-[11px] text-muted-foreground">{e.origen_tipo === "transporte" && e.referencia ? `${e.referencia} · ` : ""}{e.categoria}{e.concepto ? ` · ${e.concepto}` : ""}</div>
                        {!beneficiarioVerificado && !opciones && <Badge variant="outline" className="mt-0.5 text-[11px]">Beneficiario sin verificar</Badge>}
                        {opciones && (
                          <div className="mt-1 space-y-1 rounded border border-warning/60 bg-background p-1.5">
                            <div className="text-[11px] font-medium">⚠ La cuenta {cuentaDeMovimiento(m)} aparece con dos beneficiarios: {opciones.join(" / ")}. Elige a quién corresponde este débito.</div>
                            <Select value={elegidoPor[m.id] ?? ""} onValueChange={(v) => elegirBeneficiario(x, v)}>
                              <SelectTrigger className="h-7 text-[12px]" title={elegidoPor[m.id]}><SelectValue placeholder="Elegir beneficiario" /></SelectTrigger>
                              <SelectContent>{opciones.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                            </Select>
                            {estado === "no-corresponde" && (
                              <div className="text-[11px] text-destructive">La entrada es de {e.beneficiario}: no se concilia en este lote. Concílialo a mano con la entrada correcta.</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 font-mono">
                        {conTf ? e.secuencia : (
                          <div className="space-y-0.5 font-sans">
                            <Badge variant="outline" className="border-warning bg-warning/20 text-[11px] text-warning-foreground">Sin TF</Badge>
                            <div className="text-[11px] text-muted-foreground">{e.secuencia}</div>
                            {previsto && <div className="font-mono text-[12px]">→ {previsto.tf}</div>}
                            {previsto && <NotaTfViaje p={previsto} />}
                            {!conTf && asignarTf && marcado && !previsto && <div className="text-[11px] text-muted-foreground">{calculandoTf ? "Calculando…" : "—"}</div>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {(exactas.some((x) => !x.beneficiarioVerificado) || hayResolver) && (
          <div className="text-[11px] text-muted-foreground">
            Empiezan desmarcados los de «Beneficiario sin verificar» (cuenta sin nombre y sin regla), los «Sin TF» y los de cuentas con dos beneficiarios: revísalos y márcalos si corresponden.
          </div>
        )}
        {lotes.length > 0 && (
          <div className="space-y-1 rounded-md border p-2">
            <div className="text-[11px] uppercase text-muted-foreground">Lotes conciliados</div>
            {lotes.map((l) => (
              <div key={l.lote} className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <span>{fmtHora(l.fecha)} · {l.n} débitos · {fmtRD(l.total)}</span>
                <Button size="sm" variant="outline" disabled={deshacer.isPending} onClick={() => deshacer.mutate(l.lote)}>Deshacer lote completo</Button>
              </div>
            ))}
            <div className="text-[11px] text-muted-foreground">Deshacer un lote devuelve los débitos a Pendiente; los TF asignados al conciliar se conservan en sus entradas para no dejar huecos.</div>
          </div>
        )}
        <DialogFooter>
          <Button disabled={elegidos.length === 0 || conciliar.isPending || !tfListo} onClick={() => conciliar.mutate()}>
            {conciliar.isPending ? "Conciliando…" : `Confirmar y conciliar ${elegidos.length} (${fmtRD(sumar(elegidos.map((x) => x.movimiento)))})${rangoTf}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
