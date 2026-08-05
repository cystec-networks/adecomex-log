import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Check, X, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { EmailButton } from "@/components/email-button";
import { SearchEmailButton } from "@/components/search-email-button";
import { FacturaEcfSelector } from "@/components/factura-ecf-selector";

const NO_EXPEDIENTE = "__none__";

export const TRANSPORTE_TIPOS = [
  { v: "maritimo", l: "Marítimo" },
  { v: "aereo", l: "Aéreo" },
  { v: "terrestre", l: "Terrestre" },
];
export const TRANSPORTE_ESTADOS = [
  { v: "programado", l: "Programado" },
  { v: "en_transito", l: "En tránsito" },
  { v: "entregado", l: "Entregado" },
  { v: "facturado", l: "Facturado" },
  { v: "retrasado", l: "Retrasado" },
];
export const MONEDAS = ["USD", "DOP", "EUR"];
export const PAGO_ESTADOS = [
  { v: "pendiente", l: "Pendiente" },
  { v: "parcial", l: "Parcial" },
  { v: "pagado", l: "Pagado" },
];

type Props = { mode: "new" | "edit"; id?: string; expedienteId?: string; controlInicial?: string };

const fmtDOP = (n: number) =>
  `RD$ ${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function MoneyDOP({
  value, onChange, disabled,
}: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">RD$</span>
      <Input
        className="pl-12 text-right tabular-nums"
        inputMode="decimal"
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(",", ".");
          if (v === "" || /^\d*\.?\d*$/.test(v)) onChange(v);
        }}
        placeholder="0.00"
      />
    </div>
  );
}

export function TransporteForm({ mode, id, expedienteId, controlInicial }: Props) {
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

  const { data: clientes } = useQuery({
    queryKey: ["clientes-lite"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre,rnc,telefono,email").order("nombre")).data ?? [],
  });

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClient, setNewClient] = useState({ nombre: "", rnc: "", contacto: "", email: "", telefono: "" });

  const [splitOpen, setSplitOpen] = useState(false);
  const [splitData, setSplitData] = useState({ contenedor: "", expediente_id: "", monto: "" });


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
    // Terrestre financials (RD$)
    costo_viaje: "",
    descuento_cxc: "",
    pago_referencia: "",
    factura_costo_numero: "",
    factura_costo_fecha: "",
    costo_combustible: "",
    costo_peajes: "",
    costo_chofer: "",
    costo_otros: "",
    ingreso_facturado: "",
    factura_numero: "",
    factura_fecha: "",
    pago_estado: "pendiente",
    contenedores_cantidad: "",
    contenedores_detalle: "",
    factura_ecf_id: "" as string,
    numero_control_pago: mode === "new" ? (controlInicial ?? "") : "",
  });
  const [loaded, setLoaded] = useState(false);
  const [buscandoSpt, setBuscandoSpt] = useState(false);


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
        costo_viaje: existing.costo_viaje?.toString() ?? "",
        descuento_cxc: existing.descuento_cxc?.toString() ?? "",
        pago_referencia: existing.pago_referencia ?? "",
        factura_costo_numero: existing.factura_costo_numero ?? "",
        factura_costo_fecha: existing.factura_costo_fecha ?? "",
        costo_combustible: existing.costo_combustible?.toString() ?? "",
        costo_peajes: existing.costo_peajes?.toString() ?? "",
        costo_chofer: existing.costo_chofer?.toString() ?? "",
        costo_otros: existing.costo_otros?.toString() ?? "",
        ingreso_facturado: existing.ingreso_facturado?.toString() ?? "",
        factura_numero: existing.factura_numero ?? "",
        factura_fecha: existing.factura_fecha ?? "",
        pago_estado: existing.pago_estado ?? "pendiente",
        contenedores_cantidad: existing.contenedores_cantidad?.toString() ?? "",
        contenedores_detalle: existing.contenedores_detalle ?? "",
        factura_ecf_id: existing.factura_ecf_id ?? "",
        numero_control_pago: (existing as any).numero_control_pago ?? "",

      });
      setLoaded(true);
    }
  }, [existing, mode, loaded]);

  useEffect(() => {
    if (!form.expediente_id) return;
    const exp = (expedientes ?? []).find((e: any) => e.id === form.expediente_id);
    if (exp && exp.cliente_id && !form.cliente_id) {
      setForm((f) => ({ ...f, cliente_id: exp.cliente_id as string }));
    }
  }, [form.expediente_id, expedientes]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const isTerrestre = form.tipo === "terrestre";

  const totales = useMemo(() => {
    const n = (s: string) => (s === "" || s == null ? 0 : Number(s) || 0);
    const costoViaje = n(form.costo_viaje);
    const cxc = n(form.descuento_cxc);
    const netoPagar = Math.max(0, costoViaje - cxc);
    const costos = costoViaje + n(form.costo_combustible) + n(form.costo_peajes) + n(form.costo_chofer) + n(form.costo_otros);
    const ingreso = n(form.ingreso_facturado);
    const margen = ingreso - costos;
    const pct = ingreso > 0 ? (margen / ingreso) * 100 : 0;
    return { costos, ingreso, margen, pct, costoViaje, cxc, netoPagar };
  }, [form.costo_viaje, form.descuento_cxc, form.costo_combustible, form.costo_peajes, form.costo_chofer, form.costo_otros, form.ingreso_facturado]);

  const buscarSolicitudPago = async (control?: string) => {
    const nc = (control ?? form.numero_control_pago ?? "").trim();
    if (!nc) return toast.error("Escribe un número de control");
    setBuscandoSpt(true);
    const { data, error } = await (supabase as any)
      .from("solicitudes_pago_transporte")
      .select(
        "numero_control, transportista_nombre, transportista_rnc, telefono, monto, moneda, estado, referencia_viaje, descripcion, placa_contenedor, cantidad_viajes, catalogo_viaje_id",
      )
      .eq("numero_control", nc)
      .maybeSingle();
    if (error) {
      setBuscandoSpt(false);
      return toast.error(error.message);
    }
    if (!data) {
      setBuscandoSpt(false);
      return toast.error("No se encontró ninguna solicitud con ese número de control");
    }

    let ruta: { origen: string; destino: string; tipo_servicio: string | null } | null = null;
    if (data.catalogo_viaje_id) {
      const { data: v } = await (supabase as any)
        .from("catalogo_viajes_transporte")
        .select("origen, destino, tipo_servicio")
        .eq("id", data.catalogo_viaje_id)
        .maybeSingle();
      if (v) ruta = v;
    }
    setBuscandoSpt(false);

    let origen: string | null = ruta?.origen ?? null;
    let destino: string | null = ruta?.destino ?? null;
    if (!origen && !destino && typeof data.referencia_viaje === "string") {
      const partes = data.referencia_viaje.split(/→|->/);
      if (partes.length === 2) {
        origen = partes[0].trim() || null;
        destino = partes[1].trim() || null;
      }
    }

    const extras: string[] = [];
    if (data.transportista_rnc) extras.push(`RNC ${data.transportista_rnc}`);
    if (data.telefono) extras.push(`Tel. ${data.telefono}`);
    let linea = "";
    if (extras.length || data.descripcion) {
      linea = `Datos de la solicitud ${data.numero_control}: ${extras.join(", ")}${
        extras.length && data.descripcion ? ". " : ""
      }${data.descripcion ?? ""}`.trim();
    }

    setForm((f) => ({
      ...f,
      transportista: f.transportista?.trim() ? f.transportista : data.transportista_nombre ?? f.transportista,
      flete_monto:
        f.flete_monto !== "" && f.flete_monto != null
          ? f.flete_monto
          : data.monto != null
            ? String(data.monto)
            : f.flete_monto,
      flete_moneda: f.flete_moneda || data.moneda || f.flete_moneda,
      placa_contenedor: f.placa_contenedor?.trim() ? f.placa_contenedor : data.placa_contenedor ?? f.placa_contenedor,
      origen: f.origen?.trim() ? f.origen : origen ?? f.origen,
      destino: f.destino?.trim() ? f.destino : destino ?? f.destino,
      observaciones: linea
        ? f.observaciones?.trim()
          ? `${f.observaciones}\n${linea}`
          : linea
        : f.observaciones,
    }));
    toast.success(`Datos autocompletados desde la solicitud ${data.numero_control}`);
  };


  const autoBuscado = useRef(false);
  useEffect(() => {
    if (mode !== "new" || autoBuscado.current) return;
    const nc = (controlInicial ?? "").trim();
    if (!nc) return;
    autoBuscado.current = true;
    void buscarSolicitudPago(nc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlInicial, mode]);



  const save = useMutation({
    mutationFn: async () => {
      if (form.estado === "facturado" && !form.factura_ecf_id) {
        throw new Error("Para marcar como Facturado debes vincular una Factura e-CF real.");
      }
      const payload: any = { ...form };
      const nullableStr = [
        "expediente_id","cliente_id","tipo","transportista","placa_contenedor","origen","destino",
        "fecha_salida","eta","observaciones","factura_numero","factura_fecha","numero_viaje",
        "pago_referencia","factura_costo_numero","factura_costo_fecha","contenedores_detalle",
        "factura_ecf_id","numero_control_pago",

      ];
      nullableStr.forEach((k) => { if (payload[k] === "") payload[k] = null; });
      const nullableNum = ["flete_monto","costo_viaje","descuento_cxc","costo_combustible","costo_peajes","costo_chofer","costo_otros","ingreso_facturado","contenedores_cantidad"];
      nullableNum.forEach((k) => { payload[k] = payload[k] === "" || payload[k] == null ? null : Number(payload[k]); });

      // Clear terrestre-only fields when not terrestre
      if (payload.tipo !== "terrestre") {
        payload.costo_viaje = null;
        payload.descuento_cxc = null;
        payload.pago_referencia = null;
        payload.factura_costo_numero = null;
        payload.factura_costo_fecha = null;
        payload.costo_combustible = null;
        payload.costo_peajes = null;
        payload.costo_chofer = null;
        payload.costo_otros = null;
        payload.ingreso_facturado = null;
        payload.factura_numero = null;
        payload.factura_fecha = null;
        payload.pago_estado = "pendiente";
        payload.contenedores_cantidad = null;
        payload.contenedores_detalle = null;
      }

      let saved: any;
      if (mode === "new") {
        // If numero_viaje omitted, let DB default assign it
        if (!payload.numero_viaje) delete payload.numero_viaje;
        const { data: u } = await supabase.auth.getUser();
        payload.created_by = u.user?.id ?? null;
        const { data, error } = await supabase.from("transportes").insert(payload).select().single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase.from("transportes").update(payload).eq("id", id!).select().single();
        if (error) throw error;
        saved = data;
      }

      // Vincular solicitud de pago (una solicitud puede originar varios transportes)
      const nc = (form.numero_control_pago ?? "").trim();
      if (nc) {
        const { data: spt } = await (supabase as any)
          .from("solicitudes_pago_transporte")
          .select("id, estado")
          .eq("numero_control", nc)
          .maybeSingle();
        if (spt?.id) {
          await (supabase as any)
            .from("transportes")
            .update({ solicitud_pago_id: spt.id })
            .eq("id", saved.id);
          if (spt.estado === "pendiente") {
            await (supabase as any)
              .from("solicitudes_pago_transporte")
              .update({ transporte_id: saved.id, estado: "vinculada" })
              .eq("id", spt.id);
          }
        }
      }

      return saved;
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
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Cliente y Expediente</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Cliente *</Label>
              <div className="flex items-center gap-1">
                {(() => {
                  const c = (clientes ?? []).find((x: any) => x.id === form.cliente_id);
                  return c ? (
                    <>
                      <WhatsAppButton
                        phone={c.telefono}
                        clientName={c.nombre}
                        recordType="Transporte"
                        recordNumber={form.numero_viaje}
                        variant="icon"
                      />
                      <EmailButton
                        email={c.email}
                        clientName={c.nombre}
                        recordType="Transporte"
                        recordNumber={form.numero_viaje}
                        variant="icon"
                      />
                      <SearchEmailButton
                        recordType="Transporte"
                        recordNumber={form.numero_viaje}
                        variant="icon"
                      />
                    </>
                  ) : null;
                })()}
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setNewClientOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" />Nuevo
                </Button>
              </div>
            </div>
            <Select value={form.cliente_id || undefined} onValueChange={(v) => set("cliente_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
              <SelectContent>
                {(clientes ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}{c.rnc ? ` · ${c.rnc}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Independiente del expediente. Requerido para todo viaje.</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Expediente vinculado (opcional)</Label>
            <Select
              value={form.expediente_id || NO_EXPEDIENTE}
              onValueChange={(v) => set("expediente_id", v === NO_EXPEDIENTE ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="— Sin expediente —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_EXPEDIENTE}>— Sin expediente —</SelectItem>
                {(expedientes ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.numero} · {e.clientes?.nombre ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Deja vacío si es un viaje tercerizado sin expediente.</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo cliente</DialogTitle></DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newClient.nombre.trim()) { toast.error("Nombre requerido"); return; }
              const { data, error } = await supabase.from("clientes").insert(newClient).select().single();
              if (error) { toast.error(error.message); return; }
              toast.success("Cliente creado");
              await qc.invalidateQueries({ queryKey: ["clientes-lite"] });
              set("cliente_id", data.id);
              setNewClient({ nombre: "", rnc: "", contacto: "", email: "", telefono: "" });
              setNewClientOpen(false);
            }}
          >
            <div className="grid gap-1.5"><Label>Nombre / Razón social *</Label><Input required value={newClient.nombre} onChange={(e) => setNewClient({ ...newClient, nombre: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>RNC</Label><Input value={newClient.rnc} onChange={(e) => setNewClient({ ...newClient, rnc: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Contacto</Label><Input value={newClient.contacto} onChange={(e) => setNewClient({ ...newClient, contacto: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Teléfono</Label><Input value={newClient.telefono} onChange={(e) => setNewClient({ ...newClient, telefono: e.target.value })} /></div>
            </div>
            <DialogFooter><Button type="submit">Crear cliente</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Datos del Viaje</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>N° Viaje / Ref.</Label>
            <Input
              value={form.numero_viaje}
              onChange={(e) => set("numero_viaje", e.target.value)}
              placeholder={mode === "new" ? "Auto (TR-000001) o escribe uno" : ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Número de control de pago</Label>
            <div className="flex gap-2">
              <Input
                value={form.numero_control_pago}
                onChange={(e) => set("numero_control_pago", e.target.value)}
                placeholder="SPT-000001"
              />
              <Button type="button" variant="outline" disabled={buscandoSpt} onClick={() => buscarSolicitudPago()}>
                {buscandoSpt ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Buscar
              </Button>
            </div>
          </div>

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

      {isTerrestre && (
        <>
          {/* Bloque A · Pago al Transportista */}
          <Card className="border-primary/30">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">
                Pago al Transportista (Costo) · RD$
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">
              {/* Servicio del tercero */}
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Servicio del tercero</div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label>Costo del Viaje</Label>
                    <MoneyDOP value={form.costo_viaje} onChange={(v) => set("costo_viaje", v)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Descuento por CxC</Label>
                    <MoneyDOP value={form.descuento_cxc} onChange={(v) => set("descuento_cxc", v)} />
                    <p className="text-[11px] text-muted-foreground">Compensación por deudas del transportista. No afecta el margen.</p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Monto Neto a Pagar</Label>
                    <div className="h-9 px-3 rounded-md border bg-muted/40 flex items-center justify-end text-sm font-semibold tabular-nums">
                      {fmtDOP(totales.netoPagar)}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Costo del Viaje − Descuento por CxC</p>
                  </div>
                </div>
              </div>

              {/* Gastos operativos */}
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Gastos operativos del viaje</div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="grid gap-1.5"><Label>Combustible</Label><MoneyDOP value={form.costo_combustible} onChange={(v) => set("costo_combustible", v)} /></div>
                  <div className="grid gap-1.5"><Label>Peajes</Label><MoneyDOP value={form.costo_peajes} onChange={(v) => set("costo_peajes", v)} /></div>
                  <div className="grid gap-1.5"><Label>Chofer / Ayudante</Label><MoneyDOP value={form.costo_chofer} onChange={(v) => set("costo_chofer", v)} /></div>
                  <div className="grid gap-1.5"><Label>Otros costos</Label><MoneyDOP value={form.costo_otros} onChange={(v) => set("costo_otros", v)} /></div>
                </div>
              </div>

              {/* Datos del pago */}
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Datos del pago al transportista</div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label>N° Ref. Pago (transf./cheque)</Label>
                    <Input value={form.pago_referencia} onChange={(e) => set("pago_referencia", e.target.value)} placeholder="TRF-000123" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>N° Factura de Costo</Label>
                    <Input value={form.factura_costo_numero} onChange={(e) => set("factura_costo_numero", e.target.value)} placeholder="Factura del transportista" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Fecha Factura de Costo</Label>
                    <Input type="date" value={form.factura_costo_fecha} onChange={(e) => set("factura_costo_fecha", e.target.value)} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bloque B · Facturación al Cliente */}
          <Card className="border-emerald-500/30">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Facturación al Cliente (Venta) · RD$
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">
              <div className="grid gap-1.5">
                <Label>
                  Factura e-CF (obligatoria para estado "Facturado")
                </Label>
                <FacturaEcfSelector
                  value={form.factura_ecf_id || null}
                  onChange={(id, fact) => {
                    set("factura_ecf_id", id ?? "");
                    if (fact) {
                      if (!form.factura_numero) set("factura_numero", fact.encf);
                      if (!form.factura_fecha) set("factura_fecha", fact.fecha_emision);
                      if (!form.ingreso_facturado || Number(form.ingreso_facturado) === 0) {
                        set("ingreso_facturado", String(fact.monto_total));
                      }
                    }
                  }}
                  preload={{
                    cliente_id: form.cliente_id || null,
                    monto_total: Number(form.ingreso_facturado) || 0,
                  }}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label>Ingreso facturado al cliente</Label>
                  <MoneyDOP value={form.ingreso_facturado} onChange={(v) => set("ingreso_facturado", v)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>N° Factura (referencia)</Label>
                  <Input value={form.factura_numero} onChange={(e) => set("factura_numero", e.target.value)} placeholder="Se autocompleta del e-CF" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Fecha de factura</Label>
                  <Input type="date" value={form.factura_fecha} onChange={(e) => set("factura_fecha", e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Estado de pago</Label>
                  <Select value={form.pago_estado} onValueChange={(v) => set("pago_estado", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAGO_ESTADOS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label>Cant. Contenedores a Facturar</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={form.contenedores_cantidad}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d+$/.test(v)) set("contenedores_cantidad", v);
                    }}
                    placeholder="0"
                    className="text-right tabular-nums"
                  />
                </div>
                <div className="grid gap-1.5 md:col-span-3">
                  <Label>Detalle de Contenedores</Label>
                  <Textarea
                    rows={2}
                    value={form.contenedores_detalle}
                    onChange={(e) => set("contenedores_detalle", e.target.value)}
                    placeholder="MSKU1234567, TCLU9876543…"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resumen */}
          <Card>
            <CardContent className="pt-5">
              <div className="grid gap-3 md:grid-cols-3 rounded-lg border bg-muted/30 p-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total costos</div>
                  <div className="text-lg font-semibold tabular-nums">{fmtDOP(totales.costos)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ingreso</div>
                  <div className="text-lg font-semibold tabular-nums">{fmtDOP(totales.ingreso)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Margen</div>
                  <div className={`text-lg font-semibold tabular-nums ${totales.margen < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {fmtDOP(totales.margen)} <span className="text-xs font-normal text-muted-foreground">({totales.pct.toFixed(1)}%)</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                ⓘ Total Costos = Costo del Viaje + Combustible + Peajes + Chofer + Otros. El Descuento por CxC <b>no</b> reduce el costo real ni afecta el margen; solo reduce el Monto Neto transferido al transportista.
              </p>
            </CardContent>
          </Card>
        </>
      )}

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
    facturado: "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
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
