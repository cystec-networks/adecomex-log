import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Check, X } from "lucide-react";
import { toast } from "sonner";

export const TRANSPORTE_TIPOS = [
  { v: "maritimo", l: "Marítimo" },
  { v: "aereo", l: "Aéreo" },
  { v: "terrestre", l: "Terrestre" },
];
export const TRANSPORTE_ESTADOS = [
  { v: "programado", l: "Programado" },
  { v: "en_transito", l: "En tránsito" },
  { v: "entregado", l: "Entregado" },
  { v: "retrasado", l: "Retrasado" },
];
export const MONEDAS = ["USD", "DOP", "EUR"];

type Props = { mode: "new" | "edit"; id?: string; expedienteId?: string };

export function TransporteForm({ mode, id, expedienteId }: Props) {
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: existing } = useQuery({
    enabled: mode === "edit" && !!id,
    queryKey: ["transporte", id],
    queryFn: async () => (await supabase.from("transportes").select("*, clientes(nombre), expedientes(numero,cliente_id)").eq("id", id!).maybeSingle()).data,
  });

  const { data: expedientes } = useQuery({
    queryKey: ["expedientes-lite"],
    queryFn: async () => (await supabase.from("expedientes").select("id,numero,cliente_id,clientes(nombre)").is("eliminado_en", null).order("numero", { ascending: false }).limit(500)).data ?? [],
  });

  const [form, setForm] = useState({
    numero_viaje: "",
    expediente_id: expedienteId ?? "",
    cliente_id: "",
    tipo: "",
    transportista: "",
    placa_contenedor: "",
    origen: "",
    destino: "",
    fecha_salida: "",
    eta: "",
    flete_monto: "",
    flete_moneda: "USD",
    estado: "programado",
    observaciones: "",
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (mode === "edit" && existing && !loaded) {
      setForm({
        numero_viaje: existing.numero_viaje ?? "",
        expediente_id: existing.expediente_id ?? "",
        cliente_id: existing.cliente_id ?? "",
        tipo: existing.tipo ?? "",
        transportista: existing.transportista ?? "",
        placa_contenedor: existing.placa_contenedor ?? "",
        origen: existing.origen ?? "",
        destino: existing.destino ?? "",
        fecha_salida: existing.fecha_salida ?? "",
        eta: existing.eta ?? "",
        flete_monto: existing.flete_monto?.toString() ?? "",
        flete_moneda: existing.flete_moneda ?? "USD",
        estado: existing.estado ?? "programado",
        observaciones: existing.observaciones ?? "",
      });
      setLoaded(true);
    }
  }, [existing, mode, loaded]);

  useEffect(() => {
    if (!form.expediente_id) return;
    const exp = (expedientes ?? []).find((e: any) => e.id === form.expediente_id);
    if (exp && exp.cliente_id && !form.cliente_id) {
      setForm((f) => ({ ...f, cliente_id: exp.cliente_id }));
    }
  }, [form.expediente_id, expedientes]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      ["expediente_id","cliente_id","tipo","transportista","placa_contenedor","origen","destino","fecha_salida","eta","observaciones"]
        .forEach((k) => { if (payload[k] === "") payload[k] = null; });
      payload.flete_monto = payload.flete_monto === "" ? null : Number(payload.flete_monto);
      if (mode === "new") {
        delete payload.numero_viaje;
        const { data: u } = await supabase.auth.getUser();
        payload.created_by = u.user?.id ?? null;
        const { data, error } = await supabase.from("transportes").insert(payload).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from("transportes").update(payload).eq("id", id!).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["transportes"] });
      qc.invalidateQueries({ queryKey: ["transporte", id] });
      qc.invalidateQueries({ queryKey: ["transportes-por-expediente"] });
      toast.success(mode === "new" ? `Transporte ${row.numero_viaje} creado` : "Transporte actualizado");
      if (mode === "new") {
        if (expedienteId) nav({ to: "/expedientes/$id", params: { id: expedienteId } });
        else nav({ to: "/transportes" });
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link to={expedienteId ? "/expedientes/$id" : "/transportes"} params={expedienteId ? { id: expedienteId } : undefined as any}>
            <ArrowLeft className="h-4 w-4 mr-1" />Volver
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold">
            {mode === "new" ? "Nuevo Transporte" : `Transporte ${form.numero_viaje}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "new" ? "Registra un viaje vinculado a un expediente." : "Edita los datos del viaje."}
          </p>
        </div>
        <Button variant="outline" onClick={() => nav({ to: "/transportes" })}>
          <X className="h-4 w-4 mr-1" />Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Check className="h-4 w-4 mr-1" />{save.isPending ? "Guardando…" : mode === "new" ? "Crear transporte" : "Guardar cambios"}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Vinculación</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Expediente vinculado</Label>
            <Select value={form.expediente_id || undefined} onValueChange={(v) => set("expediente_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona expediente" /></SelectTrigger>
              <SelectContent>
                {(expedientes ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.numero} · {e.clientes?.nombre ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Cliente (auto)</Label>
            <div className="h-9 px-3 rounded-md border bg-muted/40 flex items-center text-sm">
              {(() => {
                const exp = (expedientes ?? []).find((e: any) => e.id === form.expediente_id);
                return exp?.clientes?.nombre ?? existing?.clientes?.nombre ?? <span className="text-muted-foreground">— (elige expediente)</span>;
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Datos del Viaje</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mode === "edit" && (
            <div className="grid gap-1.5"><Label>N° Viaje / Ref.</Label><Input value={form.numero_viaje} disabled /></div>
          )}
          <div className="grid gap-1.5">
            <Label>Tipo de Transporte</Label>
            <Select value={form.tipo || undefined} onValueChange={(v) => set("tipo", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona tipo" /></SelectTrigger>
              <SelectContent>{TRANSPORTE_TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Transportista / Naviera / Aerolínea</Label><Input value={form.transportista} onChange={(e) => set("transportista", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Placa / Unidad / Contenedor</Label><Input value={form.placa_contenedor} onChange={(e) => set("placa_contenedor", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Origen</Label><Input value={form.origen} onChange={(e) => set("origen", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Destino</Label><Input value={form.destino} onChange={(e) => set("destino", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Fechas y flete</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5"><Label>Fecha de Salida</Label><Input type="date" value={form.fecha_salida} onChange={(e) => set("fecha_salida", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>ETA</Label><Input type="date" value={form.eta} onChange={(e) => set("eta", e.target.value)} /></div>
          <div className="grid gap-1.5">
            <Label>Flete (monto)</Label>
            <Input type="text" inputMode="decimal" value={form.flete_monto} onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (v === "" || /^\d*\.?\d*$/.test(v)) set("flete_monto", v);
            }} placeholder="0.00" />
          </div>
          <div className="grid gap-1.5">
            <Label>Moneda</Label>
            <Select value={form.flete_moneda} onValueChange={(v) => set("flete_moneda", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MONEDAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => set("estado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TRANSPORTE_ESTADOS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 md:col-span-2 lg:col-span-4">
            <Label>Observaciones</Label>
            <Textarea rows={4} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/transportes" })}>Cancelar</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Check className="h-4 w-4 mr-1" />{save.isPending ? "Guardando…" : mode === "new" ? "Crear transporte" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}

export function estadoBadgeTransporte(estado: string | null) {
  const map: Record<string, string> = {
    programado: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    en_transito: "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    entregado: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    retrasado: "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
  };
  const label = TRANSPORTE_ESTADOS.find((s) => s.v === estado)?.l ?? estado ?? "—";
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${map[estado ?? ""] ?? map.programado}`}>{label}</span>;
}

export function estadoBadgePermiso(estado: string | null) {
  const map: Record<string, string> = {
    solicitado: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    en_tramite: "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    aprobado: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    rechazado: "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
    vencido: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  };
  const labels: Record<string,string> = { solicitado: "Solicitado", en_tramite: "En trámite", aprobado: "Aprobado", rechazado: "Rechazado", vencido: "Vencido" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${map[estado ?? ""] ?? map.solicitado}`}>{labels[estado ?? ""] ?? estado ?? "—"}</span>;
}
