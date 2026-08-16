import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtLocalDate } from "@/lib/dates";
import { fmtRD, tipoBadgeClass } from "@/lib/facturas-ecf";

export const Route = createFileRoute("/_authenticated/admin/facturacion_/papelera")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).in("role", ["admin", "contabilidad"]);
    if (!r || r.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: PapeleraFacturasPage,
});

function PapeleraFacturasPage() {
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);

  useQuery({
    queryKey: ["papelera-facturas-isadmin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", u.user!.id).eq("role", "admin");
      setIsAdmin(!!data && data.length > 0);
      return data ?? [];
    },
  });

  const { data: facturas, isLoading } = useQuery({
    queryKey: ["facturas-ecf-papelera"],
    queryFn: async () => {
      const { data } = await supabase
        .from("facturas_ecf")
        .select("*")
        .not("eliminado_en", "is", null)
        .order("eliminado_en", { ascending: false });
      return data ?? [];
    },
  });

  const restaurar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("facturas_ecf")
        .update({ eliminado_en: null, eliminado_por: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Factura restaurada");
      qc.invalidateQueries({ queryKey: ["facturas-ecf-papelera"] });
      qc.invalidateQueries({ queryKey: ["facturas-ecf"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("facturas_ecf").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Factura eliminada definitivamente");
      qc.invalidateQueries({ queryKey: ["facturas-ecf-papelera"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/facturacion"><ArrowLeft className="h-4 w-4" /> Facturación</Link>
        </Button>
        <div>
          <h1 className="font-display text-2xl font-bold">Papelera de Facturas</h1>
          <p className="text-sm text-muted-foreground">Facturas e-CF enviadas a papelera. Puedes restaurarlas.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{facturas?.length ?? 0} facturas en papelera</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b bg-muted/30">
                <tr>
                  <th className="text-left px-3 py-2">e-NCF</th>
                  <th className="text-left">Tipo</th>
                  <th className="text-left">Cliente</th>
                  <th className="text-right">Monto</th>
                  <th className="text-left pl-4">Eliminada</th>
                  <th className="text-right px-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td></tr>}
                {!isLoading && (facturas ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">La papelera está vacía.</td></tr>
                )}
                {(facturas ?? []).map((f: any) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono font-medium">{f.encf}</td>
                    <td>
                      <Badge variant="outline" className={tipoBadgeClass(f.tipo_comprobante)}>{f.tipo_comprobante}</Badge>
                    </td>
                    <td>
                      <div className="font-medium">{f.cliente_razon_social ?? "—"}</div>
                      {f.cliente_rnc && <div className="text-xs text-muted-foreground">RNC {f.cliente_rnc}</div>}
                    </td>
                    <td className="text-right font-semibold">{fmtRD(f.monto_total)}</td>
                    <td className="pl-4 text-muted-foreground">{fmtLocalDate(f.eliminado_en)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => restaurar.mutate(f.id)}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar
                      </Button>
                      {isAdmin && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`¿Eliminar definitivamente la factura ${f.encf}? Esta acción no se puede deshacer.`)) {
                              eliminar.mutate(f.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar definitivo
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PapeleraFacturasPage;
