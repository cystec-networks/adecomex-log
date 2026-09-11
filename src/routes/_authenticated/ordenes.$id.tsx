import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ORDEN_ESTADOS, ORDEN_ESTADO_CLASS, ordenEstadoLabel } from "@/lib/estados-orden";
import { ArrowLeft, Save, FolderPlus, ShieldCheck, Plus, Link2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fmtLocalDate } from "@/lib/dates";
import { useMyRoles } from "@/lib/auth-hooks";
import { ProductosCard } from "@/components/productos-card";
import { copiarProductos } from "@/lib/copiar-productos";

export const Route = createFileRoute("/_authenticated/ordenes/$id")({
  component: DetalleOrden,
});

function ReadOnlyField({ label, value }: { label: string; value: any }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm">{value === null || value === undefined || value === "" ? "—" : String(value)}</span>
    </div>
  );
}

function DetalleOrden() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: roles } = useMyRoles();
  const canEdit = (roles ?? []).some((r) => r === "admin" || r === "vendedor");
  const [vincularOpen, setVincularOpen] = useState(false);
  const [busquedaPermiso, setBusquedaPermiso] = useState("");
  const [selectedPermisoId, setSelectedPermisoId] = useState<string | null>(null);

  const { data: o } = useQuery({
    queryKey: ["orden", id],
    queryFn: async () =>
      (await supabase.from("ordenes").select("*, clientes(nombre), solicitudes(id,numero)").eq("id", id).maybeSingle())
        .data,
  });

  const solicitudVinculada = (o as any)?.solicitudes ?? null;

  const { data: expedienteVinculado } = useQuery({
    queryKey: ["expediente-de-orden", id],
    enabled: !!o,
    queryFn: async () =>
      (await supabase.from("expedientes").select("id,numero").eq("orden_id", id).maybeSingle()).data,
  });

  const { data: permisosVinculados } = useQuery({
    queryKey: ["permisos-por-orden", id],
    enabled: !!o,
    queryFn: async () =>
      (await supabase.from("permisos").select("id,numero,tipo,estado,fecha_vencimiento").eq("orden_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: permisosDisponibles } = useQuery({
    queryKey: ["permisos-disponibles", id],
    enabled: vincularOpen,
    queryFn: async () =>
      (
        await supabase
          .from("permisos")
          .select("id,numero,tipo,estado,fecha_vencimiento,cliente_id,created_at")
          .is("orden_id", null)
          .is("expediente_id", null)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const disponiblesFiltrados = useMemo(() => {
    const q = busquedaPermiso.trim().toLowerCase();
    const list = (permisosDisponibles ?? []).filter((p: any) =>
      !q ||
      (p.numero ?? "").toLowerCase().includes(q) ||
      (p.tipo ?? "").toLowerCase().includes(q)
    );
    const ordenClienteId = (o as any)?.cliente_id;
    return list.sort((a: any, b: any) => {
      const aSame = a.cliente_id === ordenClienteId ? 1 : 0;
      const bSame = b.cliente_id === ordenClienteId ? 1 : 0;
      if (aSame !== bSame) return bSame - aSame;
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });
  }, [permisosDisponibles, busquedaPermiso, o]);

  const convertirExpediente = useMutation({
    mutationFn: async () => {
      const { data: exp, error } = await supabase
        .from("expedientes")
        .insert({
          orden_id: id,
          cliente_id: o!.cliente_id,
          suplidor: (o as any).cot_suplidor ?? null,
          suplidor_rnc: (o as any).cot_suplidor_rnc ?? null,
          tipo_operacion: (o as any).cot_tipo_operacion ?? null,
          tipo_carga: (o as any).cot_tipo_carga ?? null,
          contacto_solicitud: (o as any).cot_contacto ?? null,
          incoterm: (o as any).cot_incoterm ?? null,
          pais_origen: (o as any).cot_origen ?? null,
          observaciones: (o as any).notas ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      await copiarProductos({
        origenTabla: "orden_productos", origenCol: "orden_id", origenId: id,
        destinoTabla: "mercancia_items", destinoCol: "expediente_id", destinoId: exp.id,
      });
      await supabase.from("permisos").update({ expediente_id: exp.id }).eq("orden_id", id);
      await supabase.from("auditoria").insert({ entidad: "expedientes", entidad_id: exp.id, accion: "creado" });
      return exp;
    },
    onSuccess: (exp: any) => {
      toast.success(`Expediente ${exp.numero} creado`);
      qc.invalidateQueries({ queryKey: ["expediente-de-orden", id] });
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      nav({ to: "/expedientes/$id", params: { id: exp.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo convertir"),
  });

  const [form, setForm] = useState<any>(null);
  const [vincularOpen, setVincularOpen] = useState(false);
  const [busquedaPermiso, setBusquedaPermiso] = useState("");
  const [selectedPermisoId, setSelectedPermisoId] = useState<string | null>(null);

  useEffect(() => {
    if (o && !form) setForm({ numero: o.numero ?? "", estado: o.estado ?? "abierta", notas: o.notas ?? "" });
  }, [o]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ordenes").update(form).eq("id", id);
      if (error) {
        if (error.code === "23505") {
          throw new Error("Ese número de orden ya está en uso — elige otro.");
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Orden actualizada");
      qc.invalidateQueries({ queryKey: ["orden", id] });
      qc.invalidateQueries({ queryKey: ["ordenes"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!o || !form) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;

  const money = (v: any, m: any) =>
    v == null ? "—" : `${m ?? "USD"} ${Number(v).toLocaleString("es-DO", { minimumFractionDigits: 2 })}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="sticky top-0 z-20 bg-background border-b pb-3 pt-2 px-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" asChild><Link to="/ordenes"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3 flex-wrap">
            {canEdit ? (
              <Input
                className="font-display text-2xl font-bold h-auto py-0 px-1 w-auto min-w-[8rem] max-w-[16rem] border-transparent hover:border-input focus-visible:border-input bg-transparent"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
              />
            ) : (
              o.numero
            )}
            <Badge className={ORDEN_ESTADO_CLASS[form.estado] ?? ""}>{ordenEstadoLabel(form.estado)}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {(o as any).clientes?.nombre ?? "Sin cliente"} · creada el {fmtLocalDate(o.created_at?.slice(0, 10))}
          </p>
        </div>
        {solicitudVinculada && (
          <Button variant="outline" asChild>
            <Link to="/solicitudes/$id" params={{ id: solicitudVinculada.id }}>
              <FolderPlus className="h-4 w-4 mr-1" />Ver Solicitud {solicitudVinculada.numero} ↗
            </Link>
          </Button>
        )}
        {expedienteVinculado ? (
          <Button variant="outline" asChild>
            <Link to="/expedientes/$id" params={{ id: expedienteVinculado.id }}>
              <FolderPlus className="h-4 w-4 mr-1" />Ver Expediente {expedienteVinculado.numero} ↗
            </Link>
          </Button>
        ) : canEdit ? (
          o.estado === "en_transito" ? (
            <Button
              variant="outline"
              onClick={() => convertirExpediente.mutate()}
              disabled={convertirExpediente.isPending}
            >
              <FolderPlus className="h-4 w-4 mr-1" />
              {convertirExpediente.isPending ? "Convirtiendo…" : "Convertir a Expediente"}
            </Button>
          ) : (
            <Button variant="outline" disabled title="Cambia el estado a 'En Tránsito' para poder convertir a Expediente">
              <FolderPlus className="h-4 w-4 mr-1" />Convertir a Expediente
            </Button>
          )
        ) : null}

        {canEdit && (
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="shadow-lg"><Save className="h-4 w-4 mr-1" />Guardar cambios</Button>
        )}
        </div>
      </div>

      <div className="px-6 space-y-6">
      {o.cotizacion_id || o.cot_numero ? (
        <Card className="bg-muted/30 border-dashed">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary flex items-center justify-between">
              <span>Datos de la Cotización de Compras Original</span>
              {o.cotizacion_id && (
                <Link to="/cotizaciones/$id" params={{ id: o.cotizacion_id }} className="text-xs font-normal text-primary underline">
                  {o.cot_numero} ↗
                </Link>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">Referencia conservada al momento de la conversión (solo lectura).</p>
          </CardHeader>
          <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ReadOnlyField label="N° Cotización de Compras" value={o.cot_numero} />
            <ReadOnlyField label="Cliente" value={(o as any).clientes?.nombre} />
            <ReadOnlyField label="Tipo de mercancía" value={o.cot_tipo_mercancia} />
            <ReadOnlyField label="Origen" value={o.cot_origen} />
            <ReadOnlyField label="Destino" value={o.cot_destino} />
            <ReadOnlyField label="Incoterm" value={o.cot_incoterm} />
            <ReadOnlyField label="Peso estimado (kg)" value={o.cot_peso_kg} />
            <ReadOnlyField label="Volumen estimado (m³)" value={o.cot_volumen_m3} />
            <ReadOnlyField label="Tarifa propuesta" value={money(o.cot_tarifa_propuesta, o.cot_moneda)} />
            <ReadOnlyField label="Fecha de emisión" value={fmtLocalDate(o.cot_fecha_emision)} />
            <ReadOnlyField label="Fecha de vigencia" value={fmtLocalDate(o.cot_fecha_vigencia)} />
            <ReadOnlyField label="Notas de la cotización de compras" value={o.cot_notas} />
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-muted/30 border-dashed">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Datos de la Orden de Compras</CardTitle>
            <p className="text-xs text-muted-foreground">Orden de compras directa: no proviene de una cotización de compras.</p>
          </CardHeader>
          <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ReadOnlyField label="Cliente" value={(o as any).clientes?.nombre} />
            {o.cot_tipo_mercancia && <ReadOnlyField label="Tipo de mercancía" value={o.cot_tipo_mercancia} />}
            {o.cot_origen && <ReadOnlyField label="Origen" value={o.cot_origen} />}
            {o.cot_destino && <ReadOnlyField label="Destino" value={o.cot_destino} />}
            {o.cot_incoterm && <ReadOnlyField label="Incoterm" value={o.cot_incoterm} />}
            {o.cot_peso_kg != null && <ReadOnlyField label="Peso estimado (kg)" value={o.cot_peso_kg} />}
            {o.cot_volumen_m3 != null && <ReadOnlyField label="Volumen estimado (m³)" value={o.cot_volumen_m3} />}
            {o.cot_tarifa_propuesta != null && (
              <ReadOnlyField label="Tarifa propuesta" value={money(o.cot_tarifa_propuesta, o.cot_moneda)} />
            )}
          </CardContent>
        </Card>
      )}

      <ProductosCard tabla="orden_productos" parentId={id} readOnly={!canEdit} paisOrigen={(o as any)?.cot_origen ?? ""} />

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary flex items-center justify-between">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Permisos VUCE vinculados</span>
            {canEdit && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/permisos/nuevo" search={{ orden: id }}>
                  <Plus className="h-4 w-4 mr-1" />Vincular Permiso VUCE
                </Link>
              </Button>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Los permisos vinculados aquí pasan automáticamente al Expediente cuando la Orden se convierte.
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          {(permisosVinculados ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay permisos VUCE vinculados a esta orden.</p>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">N° Permiso</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Vencimiento</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(permisosVinculados ?? []).map((p: any) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{p.numero ?? "—"}</td>
                      <td className="px-3 py-2 capitalize">{p.tipo ?? "—"}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="capitalize">{p.estado}</Badge></td>
                      <td className="px-3 py-2">{fmtLocalDate(p.fecha_vencimiento)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to="/permisos/$id" params={{ id: p.id }}>Ver / editar</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader><CardTitle className="text-base">Orden de Compras</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5 md:max-w-xs"><Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ORDEN_ESTADOS.map((e) => <SelectItem key={e} value={e}>{ordenEstadoLabel(e)}</SelectItem>)}</SelectContent>
            </Select>
            {!expedienteVinculado && o.estado !== "en_transito" && (
              <span className="text-[11px] text-amber-700">
                Cambia el estado a "En Tránsito" para poder convertir a Expediente.
              </span>
            )}
          </div>
          <div className="grid gap-1.5"><Label>Notas</Label>
            <Textarea rows={4} value={form.notas} readOnly={!canEdit} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
