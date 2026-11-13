import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORIAS_TRANSFERENCIA, titularesDe, beneficiarioProbable, resumenCuentasPendientes, type EntradaDiario, type MovimientoBanco, type ResumenCuenta } from "@/lib/conciliacion-diario";
import { fmtLocalDate } from "@/lib/dates";
import { fmtRD } from "./datos";
import { useCuentasBeneficiario, useReglasBanco, type CuentaFila, type ReglaFila } from "./datos";

const TIPOS_BENEF: Record<string, string> = { transportista: "Transportista", gestor: "Gestor", otro: "Otro" };

type DatosCuentas = { movimientos: MovimientoBanco[]; entradas: EntradaDiario[] };

export function ReglasCuentasDialog({ open, onOpenChange, movimientos, entradas }: { open: boolean; onOpenChange: (o: boolean) => void } & DatosCuentas) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reglas y cuentas de beneficiarios</DialogTitle>
          <DialogDescription>Sirven para sugerir y prellenar; nunca concilian por sí solas.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="reglas">
          <TabsList>
            <TabsTrigger value="reglas">Reglas por palabra clave</TabsTrigger>
            <TabsTrigger value="cuentas">Cuentas de beneficiarios</TabsTrigger>
          </TabsList>
          <TabsContent value="reglas"><Reglas /></TabsContent>
          <TabsContent value="cuentas"><Cuentas movimientos={movimientos} entradas={entradas} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function useGuardar(tabla: "banco_reglas" | "banco_cuentas_beneficiario", key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id?: string; datos?: Record<string, unknown>; borrar?: boolean }) => {
      const t = supabase.from(tabla);
      const { error } = p.borrar
        ? await t.delete().eq("id", p.id!)
        : p.id ? await t.update(p.datos as never).eq("id", p.id) : await t.insert(p.datos as never);
      if (error) throw new Error(error.code === "23505" ? "Ya existe un registro con ese valor" : error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [key] }); toast.success("Guardado"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

function Reglas() {
  const { data: reglas = [] } = useReglasBanco();
  const guardar = useGuardar("banco_reglas", "banco-reglas");
  const vacia = { palabra_clave: "", categoria: "Otro", concepto: "", beneficiario: "" };
  const [nueva, setNueva] = useState(vacia);
  return (
    <div className="space-y-3 pt-2">
      <div className="text-[12px] text-muted-foreground">Si la descripción del banco contiene la palabra clave, se prellenan categoría, concepto y beneficiario, y las sugerencias exigen esa categoría o beneficiario.</div>
      <table className="w-full text-[13px]">
        <thead><tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
          <th className="py-1 pr-2">Palabra clave</th><th className="py-1 pr-2">Categoría</th><th className="py-1 pr-2">Concepto</th><th className="py-1 pr-2">Beneficiario</th><th className="py-1 pr-2">Activa</th><th />
        </tr></thead>
        <tbody>
          {reglas.map((r) => <FilaRegla key={r.id} r={r} guardar={guardar.mutate} />)}
          <tr>
            <td className="py-1 pr-2"><Input className="h-8" placeholder="Ej.: PAG TSS" value={nueva.palabra_clave} onChange={(e) => setNueva({ ...nueva, palabra_clave: e.target.value })} /></td>
            <td className="py-1 pr-2 min-w-0"><SelectCategoria value={nueva.categoria} onChange={(v) => setNueva({ ...nueva, categoria: v })} /></td>
            <td className="py-1 pr-2"><Input className="h-8" value={nueva.concepto} onChange={(e) => setNueva({ ...nueva, concepto: e.target.value })} /></td>
            <td className="py-1 pr-2"><Input className="h-8" value={nueva.beneficiario} onChange={(e) => setNueva({ ...nueva, beneficiario: e.target.value })} /></td>
            <td colSpan={2} className="py-1 text-right">
              <Button size="sm" disabled={!nueva.palabra_clave.trim()} onClick={() => {
                guardar.mutate({ datos: { ...nueva, palabra_clave: nueva.palabra_clave.trim().toUpperCase(), concepto: nueva.concepto || null, beneficiario: nueva.beneficiario || null } });
                setNueva(vacia);
              }}>Agregar</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SelectCategoria({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8" title={value}><SelectValue /></SelectTrigger>
      <SelectContent>{CATEGORIAS_TRANSFERENCIA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function FilaRegla({ r, guardar }: { r: ReglaFila; guardar: (p: { id?: string; datos?: Record<string, unknown>; borrar?: boolean }) => void }) {
  const [f, setF] = useState({ palabra_clave: r.palabra_clave, categoria: r.categoria ?? "Otro", concepto: r.concepto ?? "", beneficiario: r.beneficiario ?? "" });
  const cambio = f.palabra_clave !== r.palabra_clave || f.categoria !== (r.categoria ?? "Otro") || f.concepto !== (r.concepto ?? "") || f.beneficiario !== (r.beneficiario ?? "");
  return (
    <tr className="border-b">
      <td className="py-1 pr-2"><Input className="h-8 font-mono" value={f.palabra_clave} onChange={(e) => setF({ ...f, palabra_clave: e.target.value })} /></td>
      <td className="py-1 pr-2 min-w-0"><SelectCategoria value={f.categoria} onChange={(v) => setF({ ...f, categoria: v })} /></td>
      <td className="py-1 pr-2"><Input className="h-8" value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} /></td>
      <td className="py-1 pr-2"><Input className="h-8" value={f.beneficiario} onChange={(e) => setF({ ...f, beneficiario: e.target.value })} /></td>
      <td className="py-1 pr-2"><Switch checked={r.activo} onCheckedChange={(v) => guardar({ id: r.id, datos: { activo: v } })} /></td>
      <td className="py-1 text-right whitespace-nowrap">
        {cambio && <Button size="sm" className="mr-1" onClick={() => guardar({ id: r.id, datos: { ...f, palabra_clave: f.palabra_clave.trim().toUpperCase(), concepto: f.concepto || null, beneficiario: f.beneficiario || null } })}>Guardar</Button>}
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Eliminar regla" onClick={() => guardar({ id: r.id, borrar: true })}><Trash2 className="h-4 w-4" /></Button>
      </td>
    </tr>
  );
}

function Cuentas({ movimientos, entradas }: DatosCuentas) {
  const { data: cuentas = [] } = useCuentasBeneficiario();
  const guardar = useGuardar("banco_cuentas_beneficiario", "banco-cuentas-beneficiario");
  const qc = useQueryClient();
  const vacia = { cuenta: "", beneficiario: "", tipo: "transportista" };
  const [nueva, setNueva] = useState(vacia);
  const resumen = useMemo(() => resumenCuentasPendientes(movimientos), [movimientos]);
  const sinCeros = (c: string) => c.replace(/^0+/, "");
  const faltan = [...resumen.keys()].filter((k) => !cuentas.some((c) => sinCeros(c.cuenta) === k));
  const ordenadas = [...cuentas].sort((a, b) =>
    Number(!!a.beneficiario) - Number(!!b.beneficiario)
    || (resumen.get(sinCeros(b.cuenta))?.cantidad ?? 0) - (resumen.get(sinCeros(a.cuenta))?.cantidad ?? 0)
    || (a.beneficiario ?? "").localeCompare(b.beneficiario ?? ""));
  const sinNombre = cuentas.filter((c) => !c.beneficiario).length;
  const precargar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("precargar_cuentas_banco");
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ["banco-cuentas-beneficiario"] }); toast.success(`${n} cuentas nuevas agregadas sin nombre`); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <span className="flex-1">El banco solo muestra la cuenta destino («IB a 815697610»). Asigna el nombre una vez; también se aprende al conciliar. {sinNombre > 0 && <strong className="text-amber-700 dark:text-amber-400">{sinNombre} sin nombre.</strong>}</span>
        {faltan.length > 0 && (
          <Button size="sm" variant="outline" disabled={precargar.isPending} onClick={() => precargar.mutate()}>Precargar {faltan.length} cuenta(s) nueva(s)</Button>
        )}
      </div>
      <table className="w-full text-[12px]">
        <thead><tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
          <th className="py-1 pr-2">Cuenta</th><th className="py-1 pr-2 text-right">Pendientes</th><th className="py-1 pr-2 text-right">Total</th><th className="py-1 pr-2">Fechas</th>
          <th className="py-1 pr-2">Beneficiario</th><th className="py-1 pr-2">Tipo</th><th className="py-1 pr-2">Origen</th><th className="py-1 pr-2">Activa</th><th />
        </tr></thead>
        <tbody>
          {cuentas.length === 0 && <tr><td colSpan={9} className="py-3 text-muted-foreground">Aún no hay cuentas registradas.</td></tr>}
          {ordenadas.map((c) => (
            <FilaCuenta key={c.id} c={c} guardar={guardar.mutate} resumen={resumen.get(sinCeros(c.cuenta))}
              probable={c.beneficiario ? null : beneficiarioProbable(c.cuenta, movimientos, entradas)} />
          ))}
          <tr>
            <td className="py-1 pr-2"><Input className="h-8 font-mono" inputMode="numeric" placeholder="815697610" value={nueva.cuenta} onChange={(e) => setNueva({ ...nueva, cuenta: e.target.value.replace(/\D/g, "") })} /></td>
            <td colSpan={3} />
            <td className="py-1 pr-2"><Input className="h-8" value={nueva.beneficiario} onChange={(e) => setNueva({ ...nueva, beneficiario: e.target.value })} /></td>
            <td className="py-1 pr-2"><SelectTipo value={nueva.tipo} onChange={(v) => setNueva({ ...nueva, tipo: v })} /></td>
            <td colSpan={3} className="py-1 text-right">
              <Button size="sm" disabled={!nueva.cuenta || !nueva.beneficiario.trim()} onClick={() => {
                guardar.mutate({ datos: { cuenta: nueva.cuenta.replace(/^0+/, ""), beneficiario: nueva.beneficiario.trim(), tipo: nueva.tipo, origen: "manual" } });
                setNueva(vacia);
              }}>Agregar</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SelectTipo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(TIPOS_BENEF).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
    </Select>
  );
}

const ORIGEN_CUENTA: Record<string, string> = { aprendida: "Aprendida", manual: "Manual", precargada: "Precargada" };

function FilaCuenta({ c, guardar, resumen, probable }: {
  c: CuentaFila;
  guardar: (p: { id?: string; datos?: Record<string, unknown>; borrar?: boolean }) => void;
  resumen?: ResumenCuenta;
  probable: { nombre: string; coincidencias: number } | null;
}) {
  const titularesGuardados = titularesDe(c);
  const inicial = () => ({
    beneficiario: c.beneficiario ?? "", tipo: c.tipo, compartida: !!titularesGuardados,
    titulares: titularesGuardados ?? (c.beneficiario ? [c.beneficiario, ""] : ["", ""]),
  });
  const [f, setF] = useState(inicial);
  const titularesLimpios = [...new Set(f.titulares.map((t) => t.trim()).filter(Boolean))];
  const cambio = f.tipo !== c.tipo || (f.compartida
    ? !titularesGuardados || titularesLimpios.join("|") !== titularesGuardados.join("|")
    : !!titularesGuardados || f.beneficiario.trim() !== (c.beneficiario ?? ""));
  const valido = f.compartida ? titularesLimpios.length >= 2 : !!f.beneficiario.trim();
  const vacia = !c.beneficiario;
  const datos = () => f.compartida
    ? { titulares: titularesLimpios, beneficiario: titularesLimpios.join(" y/o "), tipo: f.tipo, origen: "manual" }
    : { titulares: [], beneficiario: f.beneficiario.trim(), tipo: f.tipo, origen: "manual" };
  return (
    <tr className={vacia ? "border-b bg-amber-500/5" : "border-b"}>
      <td className="py-1 pr-2 font-mono align-top">{c.cuenta}</td>
      <td className="py-1 pr-2 text-right align-top">{resumen?.cantidad ?? 0}</td>
      <td className="py-1 pr-2 text-right font-mono whitespace-nowrap align-top">{resumen ? fmtRD(resumen.total) : "—"}</td>
      <td className="py-1 pr-2 whitespace-nowrap align-top">{resumen ? `${fmtLocalDate(resumen.desde)} – ${fmtLocalDate(resumen.hasta)}` : "—"}</td>
      <td className="py-1 pr-2 min-w-[240px] align-top">
        {f.compartida ? (
          <div className="space-y-1">
            <Badge variant="outline" className="border-warning text-[11px]">Cuenta compartida</Badge>
            {f.titulares.map((t, i) => (
              <div key={i} className="flex items-center gap-1">
                <Input className="h-7 text-[12px]" placeholder={`Titular ${i + 1}`} value={t}
                  onChange={(e) => setF({ ...f, titulares: f.titulares.map((x, j) => (j === i ? e.target.value : x)) })} />
                {f.titulares.length > 2 && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Quitar titular"
                    onClick={() => setF({ ...f, titulares: f.titulares.filter((_, j) => j !== i) })}><X className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            ))}
            <button type="button" className="flex items-center gap-1 text-[11px] text-primary underline" onClick={() => setF({ ...f, titulares: [...f.titulares, ""] })}>
              <Plus className="h-3 w-3" /> Agregar titular
            </button>
            {!valido && <div className="text-[11px] text-destructive">Escribe al menos dos titulares.</div>}
          </div>
        ) : (
          <>
            <Input className="h-8" placeholder="Sin nombre" value={f.beneficiario} onChange={(e) => setF({ ...f, beneficiario: e.target.value })} />
            {vacia && probable && (
              <button type="button" className="mt-0.5 text-left text-[11px] text-primary underline" title="Pista del Diario: entradas con el mismo monto a ±3 días. No se guarda sola."
                onClick={() => setF({ ...f, beneficiario: probable.nombre })}>
                Probable: {probable.nombre} ({probable.coincidencias} de {resumen?.cantidad ?? 0})
              </button>
            )}
          </>
        )}
        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Checkbox checked={f.compartida} onCheckedChange={(v) => setF({ ...f, compartida: v === true })} />
          Varios titulares (cuenta compartida)
        </label>
      </td>
      <td className="py-1 pr-2 align-top"><SelectTipo value={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} /></td>
      <td className="py-1 pr-2 align-top"><Badge variant="outline" className="font-normal">{ORIGEN_CUENTA[c.origen] ?? c.origen}</Badge></td>
      <td className="py-1 pr-2 align-top"><Switch checked={c.activo} onCheckedChange={(v) => guardar({ id: c.id, datos: { activo: v } })} /></td>
      <td className="py-1 text-right whitespace-nowrap align-top">
        {cambio && valido && <Button size="sm" className="mr-1" onClick={() => guardar({ id: c.id, datos: datos() })}>Guardar</Button>}
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Eliminar cuenta" onClick={() => guardar({ id: c.id, borrar: true })}><Trash2 className="h-4 w-4" /></Button>
      </td>
    </tr>
  );
}
