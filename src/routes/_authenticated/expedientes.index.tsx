import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/expedientes")({
  component: Expedientes,
});

function Expedientes() {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("todos");

  const { data } = useQuery({
    queryKey: ["expedientes"],
    queryFn: async () => (await supabase
      .from("expedientes")
      .select("*, clientes(nombre)")
      .order("created_at", { ascending: false })).data ?? [],
  });

  const filtered = (data ?? []).filter((e: any) => {
    if (estado !== "todos" && e.estado !== estado) return false;
    if (q && !JSON.stringify(e).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="font-display text-2xl font-bold">Expedientes</h1>
        <p className="text-sm text-muted-foreground">Expedientes aduanales activos y cerrados.</p>
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
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
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
              {filtered.map((e: any) => (
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
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sin expedientes. Crea uno desde una solicitud aprobada.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
