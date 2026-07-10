import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

type TipoFilter = "importacion" | "exportacion" | "todos";

export const Route = createFileRoute("/_authenticated/expedientes/")({
  validateSearch: (s: Record<string, unknown>): { tipo?: TipoFilter } => {
    const t = s.tipo;
    return t === "importacion" || t === "exportacion" || t === "todos" ? { tipo: t } : {};
  },
  component: Expedientes,
});

function Expedientes() {
  const { tipo = "todos" } = Route.useSearch();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("todos");

  const { data } = useQuery({
    queryKey: ["expedientes"],
    queryFn: async () => (await supabase
      .from("expedientes")
      .select("*, clientes(nombre), solicitudes(tipo_operacion)")
      .order("created_at", { ascending: false })).data ?? [],
  });

  const filtered = (data ?? []).filter((e: any) => {
    if (estado !== "todos" && e.estado !== estado) return false;
    if (tipo !== "todos") {
      const t = (e.solicitudes?.tipo_operacion ?? "").toLowerCase();
      if (!t.includes(tipo)) return false;
    }
    if (q && !JSON.stringify(e).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const tipoLabel = tipo === "importacion" ? "Importaciones" : tipo === "exportacion" ? "Exportaciones" : "Todos los expedientes";

  const detectTipo = (e: any): "importacion" | "exportacion" | "otros" => {
    const t = (e.solicitudes?.tipo_operacion ?? "").toLowerCase();
    if (t.includes("import")) return "importacion";
    if (t.includes("export")) return "exportacion";
    return "otros";
  };

  const grupos: Record<string, any[]> = { importacion: [], exportacion: [], otros: [] };
  filtered.forEach((e: any) => grupos[detectTipo(e)].push(e));

  const gruposVisibles = (
    tipo === "importacion" ? ["importacion"] :
    tipo === "exportacion" ? ["exportacion"] :
    ["importacion", "exportacion", "otros"]
  ) as Array<keyof typeof grupos>;

  const grupoLabel: Record<string, string> = {
    importacion: "Importaciones",
    exportacion: "Exportaciones",
    otros: "Otros",
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">Expedientes · {tipoLabel}</h1>
          <p className="text-sm text-muted-foreground">Expedientes aduanales agrupados por tipo de solicitud.</p>
        </div>
        <div className="flex gap-1 rounded-md border p-1 bg-card">
          <Link to="/expedientes" search={{ tipo: "todos" }} className={`px-3 py-1 text-xs rounded ${tipo === "todos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Todos</Link>
          <Link to="/expedientes" search={{ tipo: "importacion" }} className={`px-3 py-1 text-xs rounded ${tipo === "importacion" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Importación</Link>
          <Link to="/expedientes" search={{ tipo: "exportacion" }} className={`px-3 py-1 text-xs rounded ${tipo === "exportacion" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Exportación</Link>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle className="text-base flex-1">{filtered.length} expedientes</CardTitle>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {["abierto","en_proceso","retenido","cerrado","cancelado"].map((e) => <SelectItem key={e} value={e}>{e.replace("_"," ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Buscar por BL/AWB, número…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin expedientes. Crea uno desde una solicitud aprobada.</div>
          )}
          {gruposVisibles.map((g) => {
            const rows = grupos[g];
            if (rows.length === 0) return null;
            return (
              <div key={g} className="border-b last:border-0">
                <div className="px-4 py-2 bg-muted/50 flex items-center gap-2 sticky top-0">
                  <span className="text-xs font-semibold uppercase tracking-wide">{grupoLabel[g]}</span>
                  <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b bg-muted/20">
                    <tr>
                      <th className="text-left px-4 py-2">Expediente</th>
                      <th className="text-left">Cliente</th>
                      <th className="text-left">BL / AWB</th>
                      <th className="text-left">Etapa</th>
                      <th className="text-left">Estado</th>
                      <th className="text-left">Compromiso</th>
                      <th className="text-left">Creado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e: any) => (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2 font-medium">
                          <Link to="/expedientes/$id" params={{ id: e.id }} className="text-primary hover:underline">{e.numero}</Link>
                        </td>
                        <td>{e.clientes?.nombre ?? "—"}</td>
                        <td className="text-muted-foreground">{e.bl_awb ?? "—"}</td>
                        <td className="text-xs">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${(e.etapa_actual / 14) * 100}%` }} />
                            </div>
                            <span>{e.etapa_actual}/14</span>
                          </div>
                        </td>
                        <td><Badge className="bg-primary/10 text-primary border-transparent">{e.estado?.replace("_"," ")}</Badge></td>
                        <td>{e.fecha_compromiso ? new Date(e.fecha_compromiso).toLocaleDateString("es-DO") : "—"}</td>
                        <td className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString("es-DO")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

