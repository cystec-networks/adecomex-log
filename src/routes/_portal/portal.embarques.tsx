import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { supabasePortal as supabase } from "@/integrations/supabase/portal-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { estadoLabel } from "@/lib/estados-expediente";
import { fmtLocalDate, daysFromToday } from "@/lib/dates";
import { useGruposColapsados, EstadoDivider } from "@/lib/grupos-colapsados";
import { FolderKanban, PackageOpen, Search, ChevronRight } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_portal/portal/embarques")({
  component: PortalListado,
});

const ESTADO_COLOR: Record<string, string> = {
  digitar: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  en_transito: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  manifestado: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
  presentar: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  verificar: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  facturar: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  despachado: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  entregado: "bg-teal-500/15 text-teal-700 border-teal-500/30",
};

const ESTADO_GRUPO_1 = ["digitar", "manifestado", "presentar", "verificar"];
const ESTADO_GRUPO_3 = ["despachado", "entregado"];

function normalizeSearch(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function rowHighlight(e: any): string {
  const dias = e.fecha_compromiso ? daysFromToday(e.fecha_compromiso) : null;
  const transitoUrgente = e.estado === "en_transito" && dias != null && !isNaN(dias) && dias < 7;

  if (transitoUrgente) {
    return "bg-orange-200 dark:bg-orange-900/60 [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-orange-600 dark:[&>td:first-child]:border-l-orange-400";
  }

  const porEstado: Record<string, string> = {
    digitar: "bg-sky-50 dark:bg-sky-950/30 [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-sky-400",
    en_transito: "bg-purple-50 dark:bg-purple-950/30 [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-purple-400",
    manifestado: "bg-indigo-200 dark:bg-indigo-900/50 [&>td:first-child]:border-l-[6px] [&>td:first-child]:border-l-indigo-500 dark:[&>td:first-child]:border-l-indigo-300",
    presentar: "bg-amber-100 dark:bg-amber-950/40 [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-amber-500 dark:[&>td:first-child]:border-l-amber-400",
    verificar: "bg-red-100 dark:bg-red-950/40 [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-red-500 dark:[&>td:first-child]:border-l-red-400",
    despachado: "bg-slate-200 dark:bg-slate-900/60 [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-slate-600 dark:[&>td:first-child]:border-l-slate-500",
    entregado: "bg-emerald-50 dark:bg-emerald-950/30 [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-emerald-500",
    facturar: "bg-teal-50 dark:bg-teal-950/30 [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-teal-500",
  };

  return porEstado[e.estado] ?? "";
}

function PortalListado() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { esColapsado, toggleGrupo } = useGruposColapsados("portal-embarques-grupos");

  const { data: expedientes, isLoading } = useQuery({
    queryKey: ["portal-expedientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_expedientes_cliente")
        .select("id, numero, bl_awb, estado, created_at, fecha_compromiso, descripcion_mercancia, puerto_arribo")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const normalizedQuery = normalizeSearch(query);

  const filtered = normalizedQuery
    ? (expedientes ?? []).filter((exp) => {
        const normNum = normalizeSearch(exp.numero);
        const normBl = normalizeSearch(exp.bl_awb);
        return normNum.includes(normalizedQuery) || normBl.includes(normalizedQuery);
      })
    : (expedientes ?? []);

  const handleSearch = (value: string) => {
    setQuery(value);
    const normalized = normalizeSearch(value);
    if (!normalized || !expedientes?.length) return;

    const exactMatches = expedientes.filter((exp) => {
      const normNum = normalizeSearch(exp.numero);
      const normBl = normalizeSearch(exp.bl_awb);
      return normNum === normalized || normBl === normalized;
    });

    if (exactMatches.length === 1) {
      navigate({
        to: "/portal/expedientes/$id",
        params: { id: exactMatches[0].id! },
      });
    }
  };

  const irAlDetalle = (id: string) =>
    navigate({ to: "/portal/expedientes/$id", params: { id } });

  const g1 = filtered.filter((e) => ESTADO_GRUPO_1.includes(e.estado ?? ""));
  const transito = filtered.filter((e) => e.estado === "en_transito");
  const g3 = filtered.filter((e) => ESTADO_GRUPO_3.includes(e.estado ?? ""));
  const facturados = filtered.filter((e) => e.estado === "facturar");

  const renderFila = (exp: any) => {
    const dias = exp.fecha_compromiso ? daysFromToday(exp.fecha_compromiso) : null;
    return (
      <TableRow
        key={exp.id}
        className={`cursor-pointer hover:brightness-95 transition-colors ${rowHighlight(exp)}`}
        onClick={() => irAlDetalle(exp.id)}
      >
        <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">{exp.numero ?? "—"}</TableCell>
        <TableCell className="max-w-[220px]">
          <span className="block truncate" title={exp.descripcion_mercancia ?? undefined}>
            {exp.descripcion_mercancia ?? "—"}
          </span>
        </TableCell>
        <TableCell className="whitespace-nowrap">{exp.bl_awb ?? "—"}</TableCell>
        <TableCell className="whitespace-nowrap">{fmtLocalDate(exp.fecha_compromiso)}</TableCell>
        <TableCell className="whitespace-nowrap">
          {dias == null || isNaN(dias) ? "—" : dias >= 0 ? `${dias}d` : `${dias}d`}
        </TableCell>
        <TableCell className="max-w-[140px]">
          <span className="block truncate" title={exp.puerto_arribo ?? undefined}>
            {exp.puerto_arribo ?? "—"}
          </span>
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className={ESTADO_COLOR[exp.estado ?? ""] ?? ""}>
              {estadoLabel(exp.estado)}
            </Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const grupos: { key: string; label: string; rows: any[] }[] = [
    { key: "por_procesar", label: "Por Procesar", rows: g1 },
    { key: "en_transito", label: "En Tránsito", rows: transito },
    { key: "completados", label: "Completados", rows: g3 },
    { key: "facturados", label: "Facturados", rows: facturados },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <FolderKanban className="h-6 w-6 text-primary" /> Mis Embarques
        </h1>
        <p className="text-sm text-muted-foreground">Consulta el estado y documentos de tus operaciones.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Busca por número de embarque o BL/AWB..."
          className="pl-12 pr-4 py-5 text-lg w-full"
          aria-label="Buscar embarque por número o BL/AWB"
        />
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}

      {!isLoading && (expedientes?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
            <PackageOpen className="h-10 w-10 opacity-40" />
            <div className="font-medium text-foreground">Aún no tienes embarques activos</div>
            <div className="text-sm">Cuando ADECOMEX inicie una operación para ti, aparecerá aquí.</div>
          </CardContent>
        </Card>
      )}

      {!isLoading && query && filtered.length === 0 && (expedientes?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <div className="font-medium text-foreground">No se encontró ningún embarque con ese número o BL/AWB</div>
          </CardContent>
        </Card>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Embarque</TableHead>
                <TableHead>Mercancía</TableHead>
                <TableHead>BL/AWB</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Días</TableHead>
                <TableHead>Puerto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) =>
                g.rows.length === 0 ? null : (
                  <>
                    <EstadoDivider
                      key={g.key}
                      label={g.label}
                      count={g.rows.length}
                      colapsado={esColapsado(g.key)}
                      onToggle={() => toggleGrupo(g.key)}
                      colSpan={7}
                    />
                    {!esColapsado(g.key) && g.rows.map(renderFila)}
                  </>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
