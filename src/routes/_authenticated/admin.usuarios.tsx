import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, type AppRole } from "@/lib/auth-hooks";
import { toast } from "sonner";
import { useState } from "react";

const ROLES: AppRole[] = ["admin","operaciones","ejecutivo","agente_aduanal","documentacion","transporte","finanzas"];

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!r) throw redirect({ to: "/dashboard" });
  },
  component: AdminUsuarios,
});

function AdminUsuarios() {
  const qc = useQueryClient();

  const { data: rows } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*").order("nombre");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
      }));
    },
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Usuarios y roles</h1>
        <p className="text-sm text-muted-foreground">Asignación de roles del equipo.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{rows?.length ?? 0} usuarios</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr><th className="text-left px-4 py-2">Usuario</th><th className="text-left">Email</th><th className="text-left">Roles</th><th /></tr>
            </thead>
            <tbody>
              {(rows ?? []).map((u) => <RoleRow key={u.id} user={u} onChange={() => qc.invalidateQueries({ queryKey: ["admin-users"] })} />)}
              {(!rows || rows.length === 0) && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sin usuarios.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function RoleRow({ user, onChange }: { user: any; onChange: () => void }) {
  const [adding, setAdding] = useState<AppRole>("operaciones");

  const addRole = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("user_roles").insert({ user_id: user.id, role: adding });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rol agregado"); onChange(); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async (role: AppRole) => {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", user.id).eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rol removido"); onChange(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2 font-medium">{user.nombre || "—"}</td>
      <td className="text-muted-foreground">{user.email}</td>
      <td>
        <div className="flex flex-wrap gap-1">
          {user.roles.map((r: AppRole) => (
            <Badge key={r} variant="secondary" className="gap-1">
              {ROLE_LABELS[r]}
              <button className="ml-1 text-muted-foreground hover:text-destructive" onClick={() => removeRole.mutate(r)}>×</button>
            </Badge>
          ))}
          {user.roles.length === 0 && <span className="text-xs text-muted-foreground">Sin roles</span>}
        </div>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center gap-2 justify-end">
          <Select value={adding} onValueChange={(v) => setAdding(v as AppRole)}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.filter((r) => !user.roles.includes(r)).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => addRole.mutate()} disabled={user.roles.includes(adding)}>Agregar</Button>
        </div>
      </td>
    </tr>
  );
}
