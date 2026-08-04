import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { fmtLocalDate } from "@/lib/dates";
import {
  EstadoPrestamoBadge, ResumenPrestamos, money, type Prestamo,
} from "@/components/prestamos-empleado";

export const Route = createFileRoute("/_authenticated/rrhh/prestamos/")({
  component: PrestamosGeneral,
  head: () => ({
    meta: [
      { title: "Préstamos a empleados | ADECOMEX" },
      { name: "description", content: "Control de préstamos personales otorgados a empleados de ADECOMEX SRL." },
      { property: "og:title", content: "Préstamos a empleados | ADECOMEX" },
      { property: "og:description", content: "Control de préstamos personales otorgados a empleados de ADECOMEX SRL." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = Prestamo & { empleados: { id: string; nombre: string } | null };

function PrestamosGeneral() {
  const [estado, setEstado] = useState("todos");

  const { data, isLoading } = useQuery({
    queryKey: ["rrhh-prestamos-all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("empleado_prestamos")
        .select("*, empleados(id, nombre)")
        .is("deleted_at", null)
        .order("fecha_prestamo", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const todos = data ?? [];
  const lista = estado === "todos" ? todos : todos.filter((p) => p.estado === estado);

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      <div>
        <h1 className="font-display text-2xl font-bold">Préstamos a empleados</h1>
        <p className="text-sm text-muted-foreground">Control de préstamos personales de toda la empresa.</p>
      </div>

      <ResumenPrestamos prestamos={todos} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Listado</CardTitle>
          <div className="grid gap-1.5 w-48">
            <Label className="text-xs">Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="activo">Activos</SelectItem>
                <SelectItem value="pagado">Pagados</SelectItem>
                <SelectItem value="cancelado">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left p-2">Empleado</th>
                <th className="text-left p-2">Fecha</th>
                <th className="text-right p-2">Prestado</th>
                <th className="text-right p-2">Pagado</th>
                <th className="text-right p-2">Saldo</th>
                <th className="text-left p-2">Motivo</th>
                <th className="text-left p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const saldo = Number(p.monto_prestado ?? 0) - Number(p.monto_pagado ?? 0);
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">
                      {p.empleados ? (
                        <Link to="/rrhh/empleados/$id" params={{ id: p.empleados.id }} className="text-primary hover:underline">
                          {p.empleados.nombre}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="p-2">{fmtLocalDate(p.fecha_prestamo)}</td>
                    <td className="p-2 text-right">{money(p.monto_prestado, p.moneda)}</td>
                    <td className="p-2 text-right">{money(p.monto_pagado, p.moneda)}</td>
                    <td className="p-2 text-right font-medium">{money(saldo, p.moneda)}</td>
                    <td className="p-2">{p.motivo ?? "—"}</td>
                    <td className="p-2"><EstadoPrestamoBadge estado={p.estado} /></td>
                  </tr>
                );
              })}
              {!isLoading && lista.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sin préstamos.</td></tr>
              )}
              {isLoading && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Cargando…</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
