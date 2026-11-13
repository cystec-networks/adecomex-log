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
  CATEGORIAS_TRANSFERENCIA, anterioresAlDiario, comisionesConPago, gruposParaLote, prellenarEntrada,
  type MovimientoBanco,
} from "@/lib/conciliacion-diario";
import { fmtRD, useCuentasBeneficiario, useInvalidarConciliacion, useReglasBanco } from "./datos";

type Mov = MovimientoBanco & { notas?: string | null; conciliado_tipo?: string | null; lote_marcado?: string | null };

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

  useEffect(() => { if (!open) setClave(""); }, [open]);
  useEffect(() => {
    if (!grupo) return;
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
        p_movimientos: elegidos.map((m) => m.id), p_categoria: form.categoria, p_beneficiario: form.beneficiario.trim(),
        p_concepto: form.concepto.trim(), p_tf_previstos: previstos ?? undefined,
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

  const valido = elegidos.length > 0 && form.categoria && form.beneficiario.trim() && form.concepto.trim() && previstos?.length === elegidos.length;

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
                <Input value={form.beneficiario} placeholder={grupo.nombrado ? "" : "Escribe el nombre; la cuenta lo aprenderá"} onChange={(e) => setForm({ ...form, beneficiario: e.target.value })} />
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
                    <th className="px-2 py-1">Fecha</th><th className="px-2 py-1">Descripción</th><th className="px-2 py-1 text-right">Monto</th><th className="px-2 py-1">TF que se asignará</th>
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
                        <td className="px-2 py-1 font-mono">{i >= 0 ? (isFetching ? "…" : previstos?.[i] ?? "—") : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-muted-foreground">Los números se asignan en orden de fecha. Si cancelas, no se consume ninguno; si alguien usa uno mientras confirmas, se avisa con los números reales.</div>
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
