import { createFileRoute, redirect } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { fmtLocalDate, parseLocalDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/registro-diario")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "finanzas", "contabilidad"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: RegistroDiarioPage,
  head: () => ({
    meta: [
      { title: "Registro de Diario | ADECOMEX" },
      { name: "description", content: "Vista consolidada de pagos por transporte y transferencia agrupada por semana, mes y año." },
      { property: "og:title", content: "Registro de Diario | ADECOMEX" },
      { property: "og:description", content: "Vista consolidada de pagos por transporte y transferencia agrupada por semana, mes y año." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Fila = {
  id: string;
  origen_tipo: string;
  fecha: string;
  secuencia: string;
  categoria: string;
  referencia: string | null;
  beneficiario: string;
  concepto: string;
  monto: number;
  descuento_cxc: number;
  neto: number;
};

const fmtMoney = (n: number) =>
  `RD$ ${(n || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Lunes de la semana que contiene `d`
function lunesDe(d: Date) {
  const x = new Date(d);
  const dia = x.getDay(); // 0 domingo
  const diff = dia === 0 ? -6 : 1 - dia;
  x.setHours(0, 0, 0, 0);
  return addDays(x, diff);
}

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

type Modo = "semana" | "mes" | "anio";

function RegistroDiarioPage() {
  const [modo, setModo] = useState<Modo>("semana");
  const [ancla, setAncla] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [cats, setCats] = useState<string[]>([]);

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
    return {
      desde: new Date(ancla.getFullYear(), 0, 1),
      hasta: new Date(ancla.getFullYear(), 11, 31),
    };
  }, [modo, ancla]);

  const { data: filas = [], isLoading } = useQuery({
    queryKey: ["registro-diario", iso(desde), iso(hasta)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vista_registro_diario")
        .select("*")
        .gte("fecha", iso(desde))
        .lte("fecha", iso(hasta))
        .order("fecha", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Fila[];
    },
  });

  const categorias = useMemo(
    () => Array.from(new Set(filas.map((f) => f.categoria))).sort(),
    [filas],
  );

  const visibles = useMemo(
    () => (cats.length === 0 ? filas : filas.filter((f) => cats.includes(f.categoria))),
    [filas, cats],
  );

  const totalPeriodo = useMemo(() => sumar(visibles), [visibles]);

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

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Registro de Diario</h1>
          <p className="text-sm text-muted-foreground">
            Vista consolidada de pagos por transporte y por transferencia (solo lectura).
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 px-4 py-2 text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Neto del período</div>
          <div className="text-xl font-bold">{fmtMoney(totalPeriodo.neto)}</div>
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Filter className="mr-1 h-4 w-4" />
                    Categoría{cats.length > 0 ? ` (${cats.length})` : ""}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 p-2">
                  {categorias.length === 0 ? (
                    <div className="px-2 py-1 text-sm text-muted-foreground">Sin categorías en el período</div>
                  ) : categorias.map((c) => (
                    <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                      <Checkbox
                        checked={cats.includes(c)}
                        onCheckedChange={(v) =>
                          setCats((prev) => (v ? [...prev, c] : prev.filter((x) => x !== c)))
                        }
                      />
                      {c}
                    </label>
                  ))}
                  {cats.length > 0 && (
                    <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => setCats([])}>
                      Limpiar filtro
                    </Button>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <CardTitle className="pt-2 text-base">{etiquetaPeriodo}</CardTitle>
          <CardDescription>{visibles.length} transacción(es)</CardDescription>
        </CardHeader>

        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Cargando…</div>
          ) : modo === "semana" ? (
            <VistaSemana desde={desde} filas={visibles} />
          ) : modo === "mes" ? (
            <VistaMes desde={desde} hasta={hasta} filas={visibles} />
          ) : (
            <VistaAnio anio={ancla.getFullYear()} filas={visibles} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function sumar(filas: Fila[]) {
  return filas.reduce(
    (acc, f) => ({
      monto: acc.monto + Number(f.monto || 0),
      descuento: acc.descuento + Number(f.descuento_cxc || 0),
      neto: acc.neto + Number(f.neto || 0),
    }),
    { monto: 0, descuento: 0, neto: 0 },
  );
}

const COLS = 8;

function Encabezado() {
  return (
    <thead>
      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
        <th className="py-2 pr-3">Secuencia</th>
        <th className="py-2 pr-3">Categoría</th>
        <th className="py-2 pr-3">Referencia</th>
        <th className="py-2 pr-3">Beneficiario</th>
        <th className="py-2 pr-3">Concepto</th>
        <th className="py-2 pr-3 text-right">Monto</th>
        <th className="py-2 pr-3 text-right">Descuento CxC</th>
        <th className="py-2 text-right">Neto</th>
      </tr>
    </thead>
  );
}

function FilaDatos({ f }: { f: Fila }) {
  return (
    <tr className="border-b last:border-0 whitespace-nowrap">
      <td className="py-1.5 pr-3 font-mono font-medium">{f.secuencia}</td>
      <td className="py-1.5 pr-3">
        <Badge variant="secondary" className="font-normal">{f.categoria}</Badge>
      </td>
      <td className="py-1.5 pr-3 max-w-[140px] truncate">{f.referencia || "—"}</td>
      <td className="py-1.5 pr-3 max-w-[180px] truncate">{f.beneficiario}</td>
      <td className="py-1.5 pr-3 max-w-[240px] truncate">{f.concepto}</td>
      <td className="py-1.5 pr-3 text-right">{fmtMoney(Number(f.monto))}</td>
      <td className="py-1.5 pr-3 text-right text-destructive">
        {Number(f.descuento_cxc || 0) > 0 ? `-${fmtMoney(Number(f.descuento_cxc))}` : "—"}
      </td>
      <td className={cn("py-1.5 text-right font-semibold", Number(f.neto) < 0 && "text-destructive")}>
        {fmtMoney(Number(f.neto))}
      </td>
    </tr>
  );
}

function FilaTotal({ label, filas, fuerte = false }: { label: string; filas: Fila[]; fuerte?: boolean }) {
  const t = sumar(filas);
  return (
    <tr className={cn("border-t-2 whitespace-nowrap", fuerte ? "bg-primary/10 font-bold" : "bg-muted/50 font-semibold")}>
      <td className="py-2 pr-3 text-xs uppercase tracking-wide" colSpan={5}>{label}</td>
      <td className="py-2 pr-3 text-right">{fmtMoney(t.monto)}</td>
      <td className="py-2 pr-3 text-right text-destructive">
        {t.descuento > 0 ? `-${fmtMoney(t.descuento)}` : "—"}
      </td>
      <td className="py-2 text-right">{fmtMoney(t.neto)}</td>
    </tr>
  );
}

function SeparadorGrupo({ label, vacio }: { label: string; vacio?: boolean }) {
  return (
    <tr className="bg-muted/40 border-b">
      <td colSpan={COLS} className="py-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}{vacio ? " — sin transacciones" : ""}
        </span>
      </td>
    </tr>
  );
}

function VistaSemana({ desde, filas }: { desde: Date; filas: Fila[] }) {
  const dias = DIAS.map((nombre, i) => {
    const d = addDays(desde, i);
    const key = iso(d);
    return { nombre, key, filas: filas.filter((f) => f.fecha === key) };
  });

  return (
    <table className="w-full text-sm">
      <Encabezado />
      <tbody>
        {dias.map((d) => (
          <FragmentoGrupo key={d.key} label={`${d.nombre} ${fmtLocalDate(d.key)}`} filas={d.filas} />
        ))}
        <FilaTotal label="Totales de la semana" filas={filas} fuerte />
      </tbody>
    </table>
  );
}

function FragmentoGrupo({ label, filas }: { label: string; filas: Fila[] }) {
  return (
    <>
      <SeparadorGrupo label={label} vacio={filas.length === 0} />
      {filas.map((f) => <FilaDatos key={`${f.origen_tipo}-${f.id}`} f={f} />)}
    </>
  );
}

function VistaMes({ desde, hasta, filas }: { desde: Date; hasta: Date; filas: Fila[] }) {
  const semanas: { label: string; filas: Fila[] }[] = [];
  let cursor = lunesDe(desde);
  while (cursor <= hasta) {
    const fin = addDays(cursor, 6);
    const ini = cursor;
    const dentro = filas.filter((f) => f.fecha >= iso(ini) && f.fecha <= iso(fin));
    semanas.push({ label: `Semana del ${fmtLocalDate(iso(ini))} al ${fmtLocalDate(iso(fin))}`, filas: dentro });
    cursor = addDays(cursor, 7);
  }

  return (
    <table className="w-full text-sm">
      <Encabezado />
      <tbody>
        {semanas.map((s) => (
          <Fragment key={s.label}>
            <FragmentoGrupo label={s.label} filas={s.filas} />
            {s.filas.length > 0 && <FilaTotal label={`Total ${s.label.toLowerCase()}`} filas={s.filas} />}
          </Fragment>
        ))}
        <FilaTotal label="Total del mes" filas={filas} fuerte />
      </tbody>
    </table>
  );
}

function VistaAnio({ anio, filas }: { anio: number; filas: Fila[] }) {
  return (
    <table className="w-full text-sm">
      <Encabezado />
      <tbody>
        {MESES.map((m, i) => {
          const pref = `${anio}-${String(i + 1).padStart(2, "0")}`;
          const delMes = filas.filter((f) => f.fecha.startsWith(pref));
          return (
            <Fragment key={pref}>
              <FragmentoGrupo label={`${m} ${anio}`} filas={delMes} />
              {delMes.length > 0 && <FilaTotal label={`Total ${m}`} filas={delMes} />}
            </Fragment>
          );
        })}
        <FilaTotal label="Total del año" filas={filas} fuerte />
      </tbody>
    </table>
  );
}
