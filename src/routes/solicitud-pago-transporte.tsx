import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo-adecomex.jpg.asset.json";

const WHATSAPP = "18099313246";

type Viaje = {
  id: string;
  origen: string;
  destino: string;
  tipo_servicio: string | null;
  precio: number;
  moneda: string;
};


export const Route = createFileRoute("/solicitud-pago-transporte")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Solicitud de pago de transporte · ADECOMEX SRL" },
      {
        name: "description",
        content:
          "Genera tu número de control y envía a ADECOMEX SRL la solicitud de pago por tu servicio de transporte vía WhatsApp.",
      },
      { property: "og:title", content: "Solicitud de pago de transporte · ADECOMEX SRL" },
      {
        property: "og:description",
        content: "Transportistas: genera tu número de control y envía tu solicitud de pago a ADECOMEX SRL.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SolicitudPagoTransportePage,
});

function SolicitudPagoTransportePage() {
  const [loading, setLoading] = useState(false);
  const [numeroControl, setNumeroControl] = useState<string | null>(null);
  const [form, setForm] = useState({
    transportista_nombre: "",
    transportista_rnc: "",
    telefono: "",
    monto: "",
    moneda: "DOP",
    referencia_viaje: "",
    descripcion: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [viajeSel, setViajeSel] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("catalogo_viajes_transporte")
        .select("id, origen, destino, tipo_servicio, precio, moneda")
        .eq("activo", true)
        .order("origen", { ascending: true });
      setViajes((data ?? []) as Viaje[]);
    })();
  }, []);

  const elegirViaje = (id: string) => {
    setViajeSel(id);
    if (id === "otro") return;
    const v = viajes.find((x) => x.id === id);
    if (!v) return;
    setForm((f) => ({
      ...f,
      monto: String(v.precio ?? ""),
      moneda: v.moneda ?? "DOP",
      referencia_viaje: f.referencia_viaje.trim() ? f.referencia_viaje : `${v.origen} → ${v.destino}`,
    }));
  };

  const bloqueado = !!viajeSel && viajeSel !== "otro";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const monto = Number(form.monto);
    if (!form.transportista_nombre.trim()) return toast.error("Indica el nombre del transportista");
    if (!Number.isFinite(monto) || monto <= 0) return toast.error("Indica un monto mayor a 0");

    setLoading(true);
    try {
      const res = await fetch("/api/public/solicitud-pago-transporte", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, monto, catalogo_viaje_id: bloqueado ? viajeSel : null }),
      });
      const json = await res.json();
      if (!res.ok || !json?.numero_control) throw new Error(json?.error ?? "No se pudo registrar la solicitud.");

      const nc: string = json.numero_control;
      setNumeroControl(nc);
      const msg = `Hola ADECOMEX, solicito el pago del servicio de transporte. Número de control: ${nc}. Transportista: ${form.transportista_nombre}. Monto: ${monto} ${form.moneda}. Adjunto la factura.`;
      window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="h-14 w-14 overflow-hidden rounded-lg bg-background shadow-sm">
            <img src={logoAsset.url} alt="ADECOMEX SRL" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="font-display text-lg font-bold leading-tight">ADECOMEX SRL</div>
            <div className="text-xs text-muted-foreground">GESTIÓN Y LOGÍSTICA</div>
          </div>
        </header>

        <h1 className="font-display text-2xl font-bold">Solicitud de pago de transporte</h1>

        {numeroControl ? (
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Solicitud registrada
              </CardTitle>
              <CardDescription>Tu número de control es:</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-primary/10 px-4 py-2 font-mono text-2xl font-bold text-primary">
                  {numeroControl}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(numeroControl);
                    toast.success("Número copiado");
                  }}
                >
                  <Copy className="h-4 w-4" /> Copiar
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Guarda este número. Si WhatsApp no abrió automáticamente, cópialo y envíalo tú mismo junto con tu
                factura al 809-931-3246.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setNumeroControl(null);
                  setForm({
                    transportista_nombre: "",
                    transportista_rnc: "",
                    telefono: "",
                    monto: "",
                    moneda: "DOP",
                    referencia_viaje: "",
                    descripcion: "",
                  });
                }}
              >
                Crear otra solicitud
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Datos del servicio</CardTitle>
              <CardDescription>
                Completa el formulario para generar tu número de control y enviarnos la solicitud por WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="nombre">Nombre del transportista *</Label>
                  <Input
                    id="nombre"
                    required
                    maxLength={200}
                    value={form.transportista_nombre}
                    onChange={(e) => set("transportista_nombre", e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rnc">RNC / Cédula</Label>
                  <Input id="rnc" maxLength={30} value={form.transportista_rnc} onChange={(e) => set("transportista_rnc", e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tel">Teléfono</Label>
                  <Input id="tel" maxLength={30} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>Ruta / Viaje</Label>
                  <Select value={viajeSel} onValueChange={elegirViaje}>
                    <SelectTrigger><SelectValue placeholder="Selecciona la ruta del catálogo" /></SelectTrigger>
                    <SelectContent>
                      {viajes.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.origen} → {v.destino} — {Number(v.precio).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {v.moneda}
                        </SelectItem>
                      ))}
                      <SelectItem value="otro">Otro (monto personalizado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="monto">Monto *</Label>
                  <Input
                    id="monto"
                    inputMode="decimal"
                    required
                    readOnly={bloqueado}
                    className={bloqueado ? "bg-muted" : undefined}
                    placeholder="0.00"
                    value={form.monto}
                    onChange={(e) => {
                      if (bloqueado) return;
                      const v = e.target.value.replace(",", ".");
                      if (v === "" || /^\d*\.?\d*$/.test(v)) set("monto", v);
                    }}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label>Moneda</Label>
                  <Select value={form.moneda} onValueChange={(v) => set("moneda", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DOP">DOP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="ref">Referencia del viaje</Label>
                  <Input id="ref" maxLength={120} value={form.referencia_viaje} onChange={(e) => set("referencia_viaje", e.target.value)} />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="desc">Descripción</Label>
                  <Textarea id="desc" maxLength={1000} rows={3} value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Generar número y enviar por WhatsApp
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">© {new Date().getFullYear()} ADECOMEX SRL</p>
      </div>
    </div>
  );
}
