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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtLocalDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  CATEGORIAS_TRANSFERENCIA, MOTIVOS_DIFERENCIA, diasEntre, diferenciaSeleccion, expectativaMovimiento,
  normalizarTexto, pagoDeComision, prellenarEntrada, requiereMotivo, sugerirEntradas,
  type MovimientoBanco,
} from "@/lib/conciliacion-diario";
import {
  fmtRD, useConciliarDiario, useCuentasBeneficiario, useEntradasDiario, useInvalidarConciliacion,
  useMarcarMovimiento, useReglasBanco, type EntradaDiarioFila,
} from "./datos";

export type PestanaDebito = "diario" | "crear" | "otros";

export function DebitoDialog({
  mov, movimientos, pestana, onClose,
}: {
  mov: MovimientoBanco | null;
  movimientos: MovimientoBanco[];
  pestana: PestanaDebito;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<PestanaDebito>(pestana);
  useEffect(() => { if (mov) setTab(pestana); }, [mov, pestana]);

  return (
    <Dialog open={!!mov} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conciliar débito</DialogTitle>
          <DialogDescription>
            {mov && <>{fmtLocalDate(mov.fecha)} · <strong>{fmtRD(Number(mov.monto))}</strong>{mov.descripcion ? ` · ${mov.descripcion}` : ""}{mov.referencia ? ` · Ref. ${mov.referencia}` : ""}</>}
          </DialogDescription>
        </DialogHeader>
        {mov && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as PestanaDebito)}>
            <TabsList>
              <TabsTrigger value="diario">Pago existente</TabsTrigger>
              <TabsTrigger value="crear">Crear entrada de Diario</TabsTrigger>
              <TabsTrigger value="otros">No aplica / comisión</TabsTrigger>
            </TabsList>
            <TabsContent value="diario"><PagoExistente mov={mov} onDone={onClose} /></TabsContent>
            <TabsContent value="crear">{pagoDeComision(mov, movimientos) ? (
              <div className="rounded-md border bg-muted/40 p-3 text-[13px]">Es la comisión de un pago con la misma referencia: se vincula a ese pago en «No aplica / comisión», sin crear un TF propio.</div>
            ) : <CrearEntrada mov={mov} activo={tab === "crear"} onDone={onClose} />}</TabsContent>
            <TabsContent value="otros"><Otros mov={mov} movimientos={movimientos} onDone={onClose} /></TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FilaEntrada({ e, mov }: { e: EntradaDiarioFila; mov: MovimientoBanco }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-mono font-medium">{e.secuencia}</span>
        <span className="truncate">{e.beneficiario}</span>
        <Badge variant="secondary" className="font-normal">{e.categoria}</Badge>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {fmtLocalDate(e.fecha)} ({diasEntre(e.fecha, mov.fecha)} d) · {fmtRD(e.neto)}
        {e.referencia ? ` · ${e.referencia}` : ""}
      </div>
    </div>
  );
}

function PagoExistente({ mov, onDone }: { mov: MovimientoBanco; onDone: () => void }) {
  const { data: entradas = [] } = useEntradasDiario();
  const { data: reglas = [] } = useReglasBanco();
  const { data: cuentas = [] } = useCuentasBeneficiario();
  const conciliar = useConciliarDiario(onDone);
  const [sel, setSel] = useState<string[]>([]);
  const [todas, setTodas] = useState(false);
  const [q, setQ] = useState("");
  const [motivo, setMotivo] = useState("");
  const [motivoOtro, setMotivoOtro] = useState("");

  const sugerencias = useMemo(() => sugerirEntradas(mov, entradas, cuentas, reglas), [mov, entradas, cuentas, reglas]);
  const exp = useMemo(() => expectativaMovimiento(mov, cuentas, reglas), [mov, cuentas, reglas]);

  const libres = useMemo(() => {
    const t = normalizarTexto(q);
    return entradas
      .filter((e) => !e.conciliado && e.estado !== "anulada")
      .filter((e) => todas || diasEntre(e.fecha, mov.fecha) <= 15)
      .filter((e) => !t || normalizarTexto(`${e.secuencia} ${e.beneficiario} ${e.concepto} ${e.categoria} ${e.neto}`).includes(t))
      .sort((a, b) => diasEntre(a.fecha, mov.fecha) - diasEntre(b.fecha, mov.fecha));
  }, [entradas, mov, todas, q]);

  const elegidas = entradas.filter((e) => sel.includes(`${e.origen_tipo}:${e.id}`));
  const dif = diferenciaSeleccion(Number(mov.monto), elegidas);
  const conDif = elegidas.length > 0 && requiereMotivo(dif);
  const motivoFinal = motivo === "Otro" ? motivoOtro.trim() : motivo;

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <div className="text-[13px] font-medium">Sugerencias (monto neto igual, ±3 días, beneficiario)</div>
        {exp.fuente === "cuenta" && <div className="text-[11px] text-muted-foreground">Cuenta destino registrada como <strong>{exp.beneficiario}</strong>.</div>}
        {exp.fuente === null && /IB a/i.test(mov.descripcion ?? "") && (
          <div className="text-[11px] text-muted-foreground">Esta cuenta destino aún no tiene beneficiario registrado; se aprenderá al conciliar.</div>
        )}
        {sugerencias.length === 0 && <div className="text-[13px] text-muted-foreground">Sin coincidencias. Puedes elegir entradas abajo o crear la entrada desde el banco.</div>}
        {sugerencias.map((s) => (
          <div key={s.entradas.map((e) => e.id).join("+")} className="flex items-center gap-3 rounded-md border p-2">
            <div className="min-w-0 flex-1 space-y-1">
              {s.entradas.length > 1 && <Badge variant="outline" className="text-[11px]">Pago agrupado · {s.entradas.length} entradas</Badge>}
              {s.entradas.map((e) => <FilaEntrada key={e.id} e={e as EntradaDiarioFila} mov={mov} />)}
              {!s.beneficiarioVerificado && <div className="text-[11px] text-amber-700 dark:text-amber-400">Beneficiario sin verificar</div>}
            </div>
            <Button size="sm" disabled={conciliar.isPending}
              onClick={() => conciliar.mutate({ movimientoId: mov.id, entradas: s.entradas })}>
              Conciliar
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[13px] font-medium flex-1">Elegir entradas a mano (una o varias)</div>
          <Input className="h-8 w-56" placeholder="Buscar TF, beneficiario, monto…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-1.5 text-[12px]">
            <Checkbox checked={todas} onCheckedChange={(v) => setTodas(!!v)} /> Todas las fechas
          </label>
        </div>
        <div className="max-h-56 overflow-auto rounded-md border">
          {libres.length === 0 && <div className="p-3 text-[13px] text-muted-foreground">No hay entradas pendientes en ese rango.</div>}
          {libres.map((e) => {
            const k = `${e.origen_tipo}:${e.id}`;
            return (
              <label key={k} className="flex cursor-pointer items-center gap-3 border-b px-2 py-1.5 last:border-0 hover:bg-muted/50">
                <Checkbox checked={sel.includes(k)} onCheckedChange={(v) => setSel((p) => (v ? [...p, k] : p.filter((x) => x !== k)))} />
                <FilaEntrada e={e} mov={mov} />
              </label>
            );
          })}
        </div>
        {elegidas.length > 0 && (
          <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-[13px] sm:grid-cols-3">
            <div>Diario: <strong>{fmtRD(elegidas.reduce((s, e) => s + e.neto, 0))}</strong></div>
            <div>Banco: <strong>{fmtRD(Number(mov.monto))}</strong></div>
            <div className={cn(conDif && "text-destructive font-semibold")}>Diferencia: {fmtRD(dif)}</div>
          </div>
        )}
        {conDif && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Motivo de la diferencia</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger><SelectValue placeholder="Elegir motivo" /></SelectTrigger>
                <SelectContent>{MOTIVOS_DIFERENCIA.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {motivo === "Otro" && (
              <div className="space-y-1">
                <Label>Explica el motivo</Label>
                <Input value={motivoOtro} onChange={(e) => setMotivoOtro(e.target.value)} />
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            disabled={elegidas.length === 0 || (conDif && !motivoFinal) || conciliar.isPending}
            onClick={() => conciliar.mutate({ movimientoId: mov.id, entradas: elegidas, motivo: conDif ? motivoFinal : null })}
          >
            Conciliar seleccionadas ({elegidas.length})
          </Button>
        </div>
      </div>
    </div>
  );
}

function CrearEntrada({ mov, activo, onDone }: { mov: MovimientoBanco; activo: boolean; onDone: () => void }) {
  const { data: reglas = [] } = useReglasBanco();
  const { data: cuentas = [] } = useCuentasBeneficiario();
  const invalidar = useInvalidarConciliacion();
  const inicial = useMemo(() => prellenarEntrada(mov, cuentas, reglas), [mov, cuentas, reglas]);
  const [form, setForm] = useState(inicial);
  useEffect(() => { setForm(inicial); }, [inicial]);

  const { data: tf, isFetching, refetch } = useQuery({
    queryKey: ["siguiente-tf"],
    enabled: activo,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("siguiente_tf");
      if (error) throw error;
      return data as string;
    },
  });
  useEffect(() => { if (activo) void refetch(); }, [activo, refetch]);

  const crear = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("crear_entrada_diario_desde_banco", {
        p_movimiento: mov.id, p_fecha: form.fecha, p_categoria: form.categoria,
        p_beneficiario: form.beneficiario, p_concepto: form.concepto, p_tf_previsto: tf ?? undefined,
      });
      if (error) throw error;
      return data as { secuencia: string; cambio_numero: boolean };
    },
    onSuccess: (r) => {
      if (r.cambio_numero) toast.warning(`Entrada creada con ${r.secuencia}: ${tf} se usó mientras confirmabas.`);
      else toast.success(`Entrada ${r.secuencia} creada y conciliada`);
      invalidar();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const beneficiarios = useMemo(() => [...new Set([...cuentas.map((c) => c.beneficiario ?? ""), ...reglas.map((r) => r.beneficiario ?? "")].filter(Boolean))].sort(), [cuentas, reglas]);
  const valido = form.categoria && form.beneficiario.trim() && form.concepto.trim() && form.fecha;

  return (
    <div className="space-y-3 pt-2">
      <div className="text-[12px] text-muted-foreground">
        Crea una Solicitud de Pago por Transferencia en estado <strong>Pagada</strong>, marcada «creada desde banco», que aparece en el Registro de Diario ya conciliada con este movimiento.
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 min-w-0">
          <Label>Fecha</Label>
          <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
        </div>
        <div className="space-y-1 min-w-0">
          <Label>Categoría</Label>
          <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
            <SelectTrigger title={form.categoria}><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIAS_TRANSFERENCIA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-0">
          <Label>Monto (del banco)</Label>
          <Input value={fmtRD(Number(mov.monto))} disabled />
        </div>
        <div className="space-y-1 min-w-0 sm:col-span-3">
          <Label>Beneficiario</Label>
          <Input list="beneficiarios-banco" value={form.beneficiario} onChange={(e) => setForm({ ...form, beneficiario: e.target.value })} />
          <datalist id="beneficiarios-banco">{beneficiarios.map((b) => <option key={b} value={b} />)}</datalist>
        </div>
        <div className="space-y-1 min-w-0 sm:col-span-3">
          <Label>Concepto</Label>
          <Textarea rows={2} value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3">
        <div className="text-[13px]">
          Número que se asignará al confirmar: <span className="font-mono font-semibold">{isFetching ? "…" : tf ?? "—"}</span>
          <div className="text-[11px] text-muted-foreground">Si cancelas, el número no se consume.</div>
        </div>
        <Button disabled={!valido || !tf || crear.isPending} onClick={() => crear.mutate()}>
          {crear.isPending ? "Creando…" : `Confirmar y crear ${tf ?? ""}`}
        </Button>
      </div>
    </div>
  );
}

function Otros({ mov, movimientos, onDone }: { mov: MovimientoBanco; movimientos: MovimientoBanco[]; onDone: () => void }) {
  const marcar = useMarcarMovimiento(onDone);
  const [motivo, setMotivo] = useState("");
  const pago = pagoDeComision(mov, movimientos);
  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2 rounded-md border p-3">
        <div className="text-[13px] font-medium">Comisión de un pago</div>
        {pago ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 text-[13px]">
              Pago con la misma referencia: {fmtLocalDate(pago.fecha)} · {pago.descripcion} · <strong>{fmtRD(Number(pago.monto))}</strong>
              {pago.conciliado ? <Badge className="ml-2" variant="secondary">Conciliado</Badge> : <Badge className="ml-2" variant="outline">Pendiente</Badge>}
            </div>
            <Button size="sm" disabled={marcar.isPending}
              onClick={() => marcar.mutate({ movimientoId: mov.id, tipo: "comision", vinculado: pago.id })}>
              Vincular con este pago
            </Button>
          </div>
        ) : (
          <div className="text-[13px] text-muted-foreground">No hay otro débito con la misma referencia que parezca su pago.</div>
        )}
      </div>
      <div className="space-y-2 rounded-md border p-3">
        <div className="text-[13px] font-medium">Ignorar / no aplica</div>
        <Textarea rows={2} placeholder="Motivo (obligatorio), p. ej. traspaso entre cuentas propias" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <div className="flex justify-end">
          <Button variant="secondary" disabled={!motivo.trim() || marcar.isPending}
            onClick={() => marcar.mutate({ movimientoId: mov.id, tipo: "ignorado", motivo: motivo.trim() })}>
            Marcar como «No aplica»
          </Button>
        </div>
      </div>
    </div>
  );
}
