import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CatalogoAutocomplete } from "@/components/catalogo-autocomplete";
import { TIPOS_MERCANCIA } from "@/lib/estados-cotizacion";
import { useMyRoles } from "@/lib/auth-hooks";
import { ProductosCard } from "@/components/productos-card";


export const Route = createFileRoute("/_authenticated/cotizaciones/nueva")({
  component: NuevaCotizacion,
});

function NuevaCotizacion() {
  const nav = useNavigate();
  const { data: roles, isLoading: rolesLoading } = useMyRoles();
  const canEdit = (roles ?? []).some((r) => r === "admin" || r === "vendedor");

  const [form, setForm] = useState<any>({
    cliente_id: "", vendedor_id: "", tipo_mercancia: "", origen: "", destino: "",
    incoterm: "", peso_kg: "", volumen_m3: "", tarifa_propuesta: "", moneda: "USD",
    fecha_emision: new Date().toISOString().slice(0, 10), fecha_vigencia: "", notas: "",
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const [productos, setProductos] = useState<any[]>([]);


  const { data: clientes } = useQuery({
    queryKey: ["clientes-select"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });
  const { data: perfiles } = useQuery({
    queryKey: ["vendedores-lite"],
    queryFn: async () => (await supabase.rpc("listar_vendedores")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!canEdit) throw new Error("No tienes permiso para crear cotizaciones.");
      const payload: any = { ...form };
      for (const k of ["cliente_id", "vendedor_id", "fecha_vigencia"]) {
        if (!payload[k]) payload[k] = null;
      }
      for (const k of ["peso_kg", "volumen_m3", "tarifa_propuesta"]) {
        payload[k] = payload[k] === "" ? null : Number(payload[k]);
      }
      const { data, error } = await supabase.from("cotizaciones").insert(payload).select().single();
      if (error) throw error;
      if (productos.length > 0) {
        const filas = productos.map(({ id, ...p }: any, i: number) => ({ ...p, cotizacion_id: data.id, item_no: i + 1 }));
        const { error: eProd } = await (supabase.from("cotizacion_productos") as any).insert(filas);
        if (eProd) throw eProd;
      }
      return data;

    },
    onSuccess: (c: any) => {
      toast.success(`Cotización ${c.numero} creada`);
      nav({ to: "/cotizaciones/$id", params: { id: c.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (rolesLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Verificando permisos…</div>;
  }

  if (!canEdit) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <Card>
          <CardHeader><CardTitle className="text-base text-destructive">Acceso restringido</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Solo los roles Vendedor y Administrador pueden crear cotizaciones.</p>
            <Button asChild variant="outline"><Link to="/cotizaciones">Volver</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/cotizaciones"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
        <div>
          <h1 className="font-display text-2xl font-bold">Nueva cotización</h1>
          <p className="text-sm text-muted-foreground">Captura inicial del flujo comercial.</p>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente y responsable</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5"><Label>Cliente</Label>
              <Select value={form.cliente_id || undefined} onValueChange={(v) => set("cliente_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                <SelectContent>{(clientes ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Vendedor asignado</Label>
              <Select value={form.vendedor_id || undefined} onValueChange={(v) => set("vendedor_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecciona vendedor" /></SelectTrigger>
                <SelectContent>{(perfiles ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Datos de la cotización</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5"><Label>Tipo de mercancía</Label>
              <Select value={form.tipo_mercancia || undefined} onValueChange={(v) => set("tipo_mercancia", v)}>
                <SelectTrigger><SelectValue placeholder="Selecciona tipo" /></SelectTrigger>
                <SelectContent>{TIPOS_MERCANCIA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Incoterm</Label>
              <CatalogoAutocomplete tabla="catalogo_incoterms" value={form.incoterm} onChange={(v) => set("incoterm", v)} />
            </div>
            <div className="grid gap-1.5"><Label>Origen</Label><Input value={form.origen} onChange={(e) => set("origen", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Destino</Label><Input value={form.destino} onChange={(e) => set("destino", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Peso estimado (kg)</Label><Input type="number" step="0.01" value={form.peso_kg} onChange={(e) => set("peso_kg", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Volumen estimado (m³)</Label><Input type="number" step="0.01" value={form.volumen_m3} onChange={(e) => set("volumen_m3", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Tarifa propuesta</Label><Input type="number" step="0.01" value={form.tarifa_propuesta} onChange={(e) => set("tarifa_propuesta", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Moneda</Label>
              <Select value={form.moneda} onValueChange={(v) => set("moneda", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["USD", "DOP", "EUR"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Fecha de emisión</Label><Input type="date" value={form.fecha_emision} onChange={(e) => set("fecha_emision", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Fecha de vigencia</Label><Input type="date" value={form.fecha_vigencia} onChange={(e) => set("fecha_vigencia", e.target.value)} /></div>
          </CardContent>
        </Card>

        <ProductosCard tabla="cotizacion_productos" items={productos} onItemsChange={setProductos} />



        <Card>
          <CardHeader><CardTitle className="text-base">Notas / observaciones</CardTitle></CardHeader>
          <CardContent><Textarea rows={4} value={form.notas} onChange={(e) => set("notas", e.target.value)} /></CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creando…" : "Crear cotización"}</Button>
        </div>
      </form>
    </div>
  );
}
