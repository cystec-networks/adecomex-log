import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type * as XLSXNS from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { fmtLocalDate, parseLocalDate } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/admin/reembolsos")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "finanzas", "contabilidad"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: ReembolsosPage,
  head: () => ({
    meta: [
      { title: "Reembolsos de Gastos | ADECOMEX" },
      { name: "description", content: "Seguimiento de las Solicitudes de Reembolso de Gastos (REEBGVEXP) por período, cliente y estado de cobro." },
      { property: "og:title", content: "Reembolsos de Gastos | ADECOMEX" },
      { property: "og:description", content: "Seguimiento de las Solicitudes de Reembolso de Gastos (REEBGVEXP) por período, cliente y estado de cobro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Modo = "semana" | "mes" | "anio";

type Solicitud = {
  expedienteId: string;
  numeroDoc: string;
  expediente: string;
  cliente: string;
  fecha: string; // YYYY-MM-DD
  total: number;
  estado: "pendiente" | "pagado";
  fechaPago: string | null;
};

const fmtMoney = (n: number) =>
  `RD$ ${(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function lunesDe(d: Date) {
  const x = new Date(d);
  const dia = x.getDay();
  x.setHours(0, 0, 0, 0);
  return addDays(x, dia === 0 ? -6 : 1 - dia);
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function ReembolsosPage() {
  const [modo, setModo] = useState<Modo>("mes");
  const [ancla, setAncla] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [cliente, setCliente] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"todos" | "pendiente" | "pagado">("todos");

  const { desde, hasta } = useMemo(() => {
    if (modo === "semana") {
      const l = lunesDe(ancla);
      return { desde: l, hasta: addDays(l, 6) };
    }
    if (modo === "mes") {
      return {
        desde: new Date(ancla.getFullYear(), ancla.getMonth(), 1),
        hasta: new Date(ancla.getFullYear(), ancla.getMonth() + 1, 0),
      };
    }
    return { desde: new Date(ancla.getFullYear(), 0, 1), hasta: new Date(ancla.getFullYear(), 11, 31) };
  }, [modo, ancla]);

  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ["reporte-reembolsos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos")
        .select(
          "monto, fecha, expediente_id, expedientes!inner(id, numero, reembolso_estado, reembolso_fecha_pago, reembolso_generado_at, clientes(nombre))",
        )
        .eq("es_reembolso", true)
        .is("deleted_at", null);
      if (error) throw error;

      const mapa = new Map<string, Solicitud>();
      for (const row of (data ?? []) as any[]) {
        const exp = row.expedientes;
        if (!exp) continue;
        const prev = mapa.get(exp.id);
        const generado: string | null = exp.reembolso_generado_at
          ? String(exp.reembolso_generado_at).slice(0, 10)
          : null;
        const fechaFallback = row.fecha ?? "";
        const fecha = generado ?? (prev && prev.fecha > fechaFallback ? prev.fecha : fechaFallback);
        const total = (prev?.total ?? 0) + (Number(row.monto) || 0);
        mapa.set(exp.id, {
          expedienteId: exp.id,
          numeroDoc: `REEBGVEXP-${exp.numero ?? ""}`,
          expediente: exp.numero ?? "",
          cliente: exp.clientes?.nombre ?? "—",
          fecha,
          total,
          estado: (exp.reembolso_estado === "pagado" ? "pagado" : "pendiente"),
          fechaPago: exp.reembolso_fecha_pago ?? null,
        });
      }
      return Array.from(mapa.values()).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    },
  });

  const visibles = useMemo(() => {
    const d = iso(desde), h = iso(hasta);
    const q = cliente.trim().toLowerCase();
    return solicitudes.filter((s) =>
      s.fecha >= d && s.fecha <= h &&
      (estadoFiltro === "todos" || s.estado === estadoFiltro) &&
      (!q || s.cliente.toLowerCase().includes(q) || s.expediente.toLowerCase().includes(q)),
    );
  }, [solicitudes, desde, hasta, cliente, estadoFiltro]);

  const totales = useMemo(() => {
    const pendiente = visibles.filter((s) => s.estado === "pendiente").reduce((a, s) => a + s.total, 0);
    const pagado = visibles.filter((s) => s.estado === "pagado").reduce((a, s) => a + s.total, 0);
    return { pendiente, pagado, general: pendiente + pagado };
  }, [visibles]);

  const mover = (delta: number) => {
    setAncla((prev) => {
      if (modo === "semana") return addDays(lunesDe(prev), delta * 7);
      if (modo === "mes") return new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
      return new Date(prev.getFullYear() + delta, 0, 1);
    });
  };

  const etiquetaPeriodo =
    modo === "semana"
      ? `Semana del ${fmtLocalDate(iso(desde))} al ${fmtLocalDate(iso(hasta))}`
      : modo === "mes"
        ? `${MESES[ancla.getMonth()]} ${ancla.getFullYear()}`
        : `Año ${ancla.getFullYear()}`;

  const exportExcel = async () => {
    const XLSX: typeof XLSXNS = await import("xlsx");
    const aoa: any[][] = [
      ["Reporte de Reembolsos de Gastos"],
      [`Período: ${etiquetaPeriodo}`],
      [`Generado: ${new Date().toLocaleString("es-DO")}`],
      [],
      ["N° REEBGVEXP", "Expediente", "Cliente", "Fecha de generación", "Total (RD$)", "Estado", "Fecha de pago"],
    ];
    visibles.forEach((s) => {
      aoa.push([
        s.numeroDoc, s.expediente, s.cliente,
        fmtLocalDate(s.fecha, undefined, ""), s.total,
        s.estado === "pagado" ? "Pagado" : "Pendiente",
        fmtLocalDate(s.fechaPago, undefined, ""),
      ]);
    });
    aoa.push([]);
    aoa.push(["TOTAL PENDIENTE", "", "", "", totales.pendiente]);
    aoa.push(["TOTAL PAGADO", "", "", "", totales.pagado]);
    aoa.push(["TOTAL GENERAL", "", "", "", totales.general]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 34 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reembolsos");
    XLSX.writeFile(wb, `Reembolsos_${iso(desde)}_${iso(hasta)}.xlsx`);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Reembolsos de Gastos</h1>
          <p className="text-sm text-muted-foreground">
            Seguimiento de cobro de las Solicitudes de Reembolso (REEBGVEXP) por período.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg border bg-muted/30 px-4 py-2 text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total pendiente</div>
            <div className="text-lg font-bold text-destructive">{fmtMoney(totales.pendiente)}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-4 py-2 text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total pagado</div>
            <div className="text-lg font-bold">{fmtMoney(totales.pagado)}</div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={modo} onValueChange={(v) => setModo(v as Modo)}>
              <TabsList>
                <TabsTrigger value="semana">Semana</TabsTrigger>
                <TabsTrigger value="mes">Mes</TabsTrigger>
                <TabsTrigger value="anio">Año</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => mover(-1)} title="Anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                className="w-[160px]"
                value={iso(ancla)}
                onChange={(e) => e.target.value && setAncla(parseLocalDate(e.target.value))}
              />
              <Button size="icon" variant="outline" onClick={() => mover(1)} title="Siguiente">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Input
                placeholder="Cliente o expediente…"
                className="w-[200px]"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
              />
              <Select value={estadoFiltro} onValueChange={(v) => setEstadoFiltro(v as any)}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  <SelectItem value="pendiente">Solo pendientes</SelectItem>
                  <SelectItem value="pagado">Solo pagados</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportExcel} disabled={visibles.length === 0}>
                <Download className="mr-1 h-4 w-4" /> Excel
              </Button>
            </div>
          </div>
          <CardTitle className="pt-2 text-base">{etiquetaPeriodo}</CardTitle>
          <CardDescription>{visibles.length} solicitud(es)</CardDescription>
        </CardHeader>

        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Cargando…</div>
          ) : visibles.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No hay solicitudes de reembolso en este período.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">N° REEBGVEXP</th>
                  <th className="py-2 pr-3">Expediente</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Fecha generación</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2">Fecha de pago</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((s) => (
                  <tr key={s.expedienteId} className="border-b last:border-0 whitespace-nowrap">
                    <td className="py-1.5 pr-3 font-mono font-medium">{s.numeroDoc}</td>
                    <td className="py-1.5 pr-3">
                      <Link to="/expedientes/$id" params={{ id: s.expedienteId }} className="text-primary hover:underline">
                        {s.expediente}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 max-w-[260px] truncate" title={s.cliente}>{s.cliente}</td>
                    <td className="py-1.5 pr-3">{fmtLocalDate(s.fecha)}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold">{fmtMoney(s.total)}</td>
                    <td className="py-1.5 pr-3">
                      <Badge variant={s.estado === "pagado" ? "secondary" : "destructive"} className="font-normal">
                        {s.estado === "pagado" ? "Pagado" : "Pendiente"}
                      </Badge>
                    </td>
                    <td className="py-1.5">{fmtLocalDate(s.fechaPago)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 bg-muted/50 font-semibold">
                  <td className="py-2 pr-3 text-xs uppercase tracking-wide" colSpan={4}>Total pendiente</td>
                  <td className="py-2 pr-3 text-right text-destructive">{fmtMoney(totales.pendiente)}</td>
                  <td colSpan={2} />
                </tr>
                <tr className="bg-muted/50 font-semibold">
                  <td className="py-2 pr-3 text-xs uppercase tracking-wide" colSpan={4}>Total pagado</td>
                  <td className="py-2 pr-3 text-right">{fmtMoney(totales.pagado)}</td>
                  <td colSpan={2} />
                </tr>
                <tr className="border-t-2 bg-primary/10 font-bold">
                  <td className="py-2 pr-3 text-xs uppercase tracking-wide" colSpan={4}>Total del período</td>
                  <td className="py-2 pr-3 text-right">{fmtMoney(totales.general)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
