import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORIAS_TRANSFERENCIA } from "@/lib/conciliacion-diario";
import { useCuentasBeneficiario, useReglasBanco, type CuentaFila, type ReglaFila } from "./datos";

const TIPOS_BENEF: Record<string, string> = { transportista: "Transportista", gestor: "Gestor", otro: "Otro" };

export function ReglasCuentasDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
          <TabsContent value="cuentas"><Cuentas /></TabsContent>
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

function Cuentas() {
  const { data: cuentas = [] } = useCuentasBeneficiario();
  const guardar = useGuardar("banco_cuentas_beneficiario", "banco-cuentas-beneficiario");
  const vacia = { cuenta: "", beneficiario: "", tipo: "transportista" };
  const [nueva, setNueva] = useState(vacia);
  return (
    <div className="space-y-3 pt-2">
      <div className="text-[12px] text-muted-foreground">El banco solo muestra la cuenta destino («IB a 815697610»). Cada cuenta se aprende al conciliar; aquí puedes corregirla o cargarla a mano.</div>
      <table className="w-full text-[13px]">
        <thead><tr className="border-b text-left text-[11px] uppercase text-muted-foreground">
          <th className="py-1 pr-2">Cuenta</th><th className="py-1 pr-2">Beneficiario</th><th className="py-1 pr-2">Tipo</th><th className="py-1 pr-2">Origen</th><th className="py-1 pr-2">Activa</th><th />
        </tr></thead>
        <tbody>
          {cuentas.length === 0 && <tr><td colSpan={6} className="py-3 text-muted-foreground">Aún no hay cuentas registradas.</td></tr>}
          {cuentas.map((c) => <FilaCuenta key={c.id} c={c} guardar={guardar.mutate} />)}
          <tr>
            <td className="py-1 pr-2"><Input className="h-8 font-mono" inputMode="numeric" placeholder="815697610" value={nueva.cuenta} onChange={(e) => setNueva({ ...nueva, cuenta: e.target.value.replace(/\D/g, "") })} /></td>
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

function FilaCuenta({ c, guardar }: { c: CuentaFila; guardar: (p: { id?: string; datos?: Record<string, unknown>; borrar?: boolean }) => void }) {
  const [f, setF] = useState({ beneficiario: c.beneficiario, tipo: c.tipo });
  const cambio = f.beneficiario !== c.beneficiario || f.tipo !== c.tipo;
  return (
    <tr className="border-b">
      <td className="py-1 pr-2 font-mono">{c.cuenta}</td>
      <td className="py-1 pr-2"><Input className="h-8" value={f.beneficiario} onChange={(e) => setF({ ...f, beneficiario: e.target.value })} /></td>
      <td className="py-1 pr-2"><SelectTipo value={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} /></td>
      <td className="py-1 pr-2"><Badge variant="outline" className="font-normal">{c.origen === "aprendida" ? "Aprendida" : "Manual"}</Badge></td>
      <td className="py-1 pr-2"><Switch checked={c.activo} onCheckedChange={(v) => guardar({ id: c.id, datos: { activo: v } })} /></td>
      <td className="py-1 text-right whitespace-nowrap">
        {cambio && <Button size="sm" className="mr-1" onClick={() => guardar({ id: c.id, datos: { beneficiario: f.beneficiario.trim(), tipo: f.tipo, origen: "manual" } })}>Guardar</Button>}
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Eliminar cuenta" onClick={() => guardar({ id: c.id, borrar: true })}><Trash2 className="h-4 w-4" /></Button>
      </td>
    </tr>
  );
}
