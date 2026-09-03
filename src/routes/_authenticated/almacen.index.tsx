import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PackageMinus, Warehouse, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useMyRoles, useCurrentUser } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/almacen/")({
  component: AlmacenPage,
  head: () => ({
    meta: [
      { title: "Existencias de Almacén | ADECOMEX" },
      { name: "description", content: "Control de existencias por almacén: cantidades disponibles, costo unitario real y salidas de mercancía." },
      { property: "og:title", content: "Existencias de Almacén | ADECOMEX" },
      { property: "og:description", content: "Control de existencias por almacén y registro de salidas de mercancía." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const nf = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function AlmacenPage() {
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const { user } = useCurrentUser();
  const puedeSalida = !!roles?.some((r) => ["admin", "operaciones", "agente_aduanal"].includes(r));

  const [almacenFiltro, setAlmacenFiltro] = useState<string>("todos");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [soloExistencia, setSoloExistencia] = useState(true);

  const { data: almacenes } = useQuery({
    queryKey: ["almacenes"],
    queryFn: async () =>
      (await (supabase.from("almacenes" as any) as any).select("id,nombre,ubicacion,activo").order("nombre")).data ?? [],
  });

  const { data: stock, isLoading } = useQuery({
    queryKey: ["almacen-stock"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("almacen_stock" as any) as any)
        .select("*, almacenes(id,nombre), expedientes(id,numero,clientes(nombre))")
        .order("fecha_entrada", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filas = useMemo(() => {
    const q = clienteFiltro.trim().toLowerCase();
    return (stock ?? []).filter((s) => {
      if (almacenFiltro !== "todos" && s.almacen_id !== almacenFiltro) return false;
      if (soloExistencia && Number(s.cantidad_disponible) <= 0) return false;
      if (q && !(s.expedientes?.clientes?.nombre ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stock, almacenFiltro, clienteFiltro, soloExistencia]);

  const valorTotal = filas.reduce(
    (s, r) => s + (Number(r.cantidad_disponible) || 0) * (Number(r.costo_unitario_real) || 0),
    0,
  );

  const [salida, setSalida] = useState<any | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [destinatario, setDestinatario] = useState("");
  const [nota, setNota] = useState("");

  const abrirSalida = (row: any) => {
    setSalida(row);
    setCantidad("");
    setDestinatario("");
    setNota("");
  };

  const registrar = useMutation({
    mutationFn: async () => {
      const cant = Number(cantidad);
      const disp = Number(salida.cantidad_disponible) || 0;
      if (!cant || cant <= 0) throw new Error("Indica una cantidad válida");
      if (cant > disp) throw new Error(`La cantidad no puede exceder la disponible (${nf(disp)})`);
      const { error } = await (supabase.from("almacen_movimientos" as any) as any).insert({
        almacen_stock_id: salida.id,
        tipo: "salida",
        cantidad: cant,
        destinatario: destinatario.trim() || null,
        nota: nota.trim() || null,
        creado_por: user?.id ?? null,
      });
      if (error) throw error;
      return { queda: disp - cant };
    },
    onSuccess: ({ queda }) => {
      if (queda <= 0) toast.success("Salida registrada. El producto quedó sin existencia en almacén.");
      else toast.success("Salida registrada");
      setSalida(null);
      qc.invalidateQueries({ queryKey: ["almacen-stock"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-display font-bold flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-primary" /> Existencias
        </h1>
        <p className="text-sm text-muted-foreground">
          Mercancía nacionalizada que entró a almacén desde la Liquidación Final del expediente.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Inventario</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={almacenFiltro} onValueChange={setAlmacenFiltro}>
              <SelectTrigger className="h-8 w-52 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los almacenes</SelectItem>
                {(almacenes ?? []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-8 w-52 text-xs"
              placeholder="Filtrar por cliente…"
              value={clienteFiltro}
              onChange={(e) => setClienteFiltro(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Switch id="solo-exist" checked={soloExistencia} onCheckedChange={setSoloExistencia} />
              <Label htmlFor="solo-exist" className="text-xs">Solo con existencia</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : filas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay existencias con los filtros actuales.</p>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2">Almacén</th>
                    <th className="py-2 px-2">Producto</th>
                    <th className="py-2 px-2">Expediente</th>
                    <th className="py-2 px-2">Cliente</th>
                    <th className="py-2 px-2">País de Origen</th>
                    <th className="py-2 px-2 text-right">Cantidad</th>
                    <th className="py-2 px-2 text-right">Disponible</th>
                    <th className="py-2 px-2 text-right">Costo Unit.</th>
                    <th className="py-2 px-2 text-right">Costo de Venta</th>
                    <th className="py-2 px-2 text-right">Valor en Stock</th>
                    <th className="py-2 pl-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((r) => {
                    const disp = Number(r.cantidad_disponible) || 0;
                    const cu = Number(r.costo_unitario_real) || 0;
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 pr-2">{r.almacenes?.nombre ?? "—"}</td>
                        <td className="py-2 px-2 max-w-[220px]">
                          <div className="font-medium truncate">{r.producto}</div>
                          <div className="text-muted-foreground">{r.codigo_arancelario ?? "—"}</div>
                        </td>
                        <td className="py-2 px-2">
                          {r.expedientes?.id ? (
                            <Link
                              to="/expedientes/$id"
                              params={{ id: r.expedientes.id }}
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {r.expedientes.numero} <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="py-2 px-2">{r.expedientes?.clientes?.nombre ?? "—"}</td>
                        <td className="py-2 px-2">{r.pais_origen ?? "—"}</td>
                        <td className="py-2 px-2 text-right">{nf(Number(r.cantidad) || 0)} {r.unidad ?? ""}</td>
                        <td className="py-2 px-2 text-right font-medium">{nf(disp)}</td>
                        <td className="py-2 px-2 text-right">{nf(cu)}</td>
                        <td className="py-2 px-2 text-right">{r.costo_venta_unitario == null ? "—" : nf(Number(r.costo_venta_unitario))}</td>
                        <td className="py-2 px-2 text-right font-medium tabular-nums">{nf(disp * cu)}</td>
                        <td className="py-2 pl-2 text-right">
                          {puedeSalida && disp > 0 && (
                            <Button variant="outline" size="sm" onClick={() => abrirSalida(r)}>
                              <PackageMinus className="h-4 w-4 mr-1" /> Registrar salida
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3 text-right text-sm font-semibold">
                Valor total en stock: US$ {nf(valorTotal)}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!salida} onOpenChange={(v) => !v && setSalida(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar salida</DialogTitle>
          </DialogHeader>
          {salida && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {salida.producto} — disponible: <span className="font-medium">{nf(Number(salida.cantidad_disponible) || 0)} {salida.unidad ?? ""}</span>
              </div>
              <div className="space-y-1">
                <Label>Cantidad a entregar *</Label>
                <Input
                  type="number"
                  step="0.001"
                  max={Number(salida.cantidad_disponible) || 0}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Destinatario</Label>
                <Input value={destinatario} onChange={(e) => setDestinatario(e.target.value)} placeholder="Cliente / persona que retira" />
              </div>
              <div className="space-y-1">
                <Label>Nota</Label>
                <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalida(null)}>Cancelar</Button>
            <Button onClick={() => registrar.mutate()} disabled={registrar.isPending}>Registrar salida</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
