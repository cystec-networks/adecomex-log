import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ROLE_LABELS, type AppRole } from "@/lib/auth-hooks";
import { adminCreateUser, adminDeleteUser, adminResetPassword } from "@/lib/admin-users.functions";
import { toast } from "sonner";
import { useState } from "react";
import { UserPlus, KeyRound, Trash2 } from "lucide-react";

const ROLES: AppRole[] = ["admin","contabilidad","operaciones","ejecutivo","agente_aduanal","documentacion","transporte","finanzas"];

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

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Usuarios y roles</h1>
          <p className="text-sm text-muted-foreground">Solo el administrador puede crear cuentas de acceso al sistema.</p>
        </div>
        <NewUserDialog onCreated={refresh} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{rows?.length ?? 0} usuarios</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Usuario</th>
                <th className="text-left">Email</th>
                <th className="text-left">Roles</th>
                <th className="text-right px-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((u) => <RoleRow key={u.id} user={u} onChange={refresh} />)}
              {(!rows || rows.length === 0) && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sin usuarios.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function NewUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("operaciones");
  const create = useServerFn(adminCreateUser);

  const m = useMutation({
    mutationFn: async () => await create({ data: { nombre, email, password, role } }),
    onSuccess: () => {
      toast.success("Usuario creado. Comparte las credenciales de forma segura.");
      setOpen(false);
      setNombre(""); setEmail(""); setPassword(""); setRole("operaciones");
      onCreated();
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo crear el usuario"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="h-4 w-4" /> Nuevo usuario</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear usuario interno</DialogTitle>
          <DialogDescription>El usuario se activa de inmediato. Entrégale la contraseña en persona o por canal seguro.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nombre completo</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Correo</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Contraseña inicial (mín. 8)</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !nombre || !email || password.length < 8}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleRow({ user, onChange }: { user: any; onChange: () => void }) {
  const [adding, setAdding] = useState<AppRole>("operaciones");
  const [pwd, setPwd] = useState("");
  const [pwdOpen, setPwdOpen] = useState(false);
  const resetFn = useServerFn(adminResetPassword);
  const deleteFn = useServerFn(adminDeleteUser);

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

  const resetPwd = useMutation({
    mutationFn: async () => await resetFn({ data: { id: user.id, password: pwd } }),
    onSuccess: () => { toast.success("Contraseña actualizada"); setPwdOpen(false); setPwd(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => await deleteFn({ data: { id: user.id } }),
    onSuccess: () => { toast.success("Usuario eliminado"); onChange(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2 font-medium">{user.nombre || "—"}</td>
      <td className="text-muted-foreground">{user.email}</td>
      <td>
        <div className="flex flex-wrap gap-1 items-center">
          {user.roles.map((r: AppRole) => (
            <Badge key={r} variant="secondary" className="gap-1">
              {ROLE_LABELS[r]}
              <button className="ml-1 text-muted-foreground hover:text-destructive" onClick={() => removeRole.mutate(r)}>×</button>
            </Badge>
          ))}
          {user.roles.length === 0 && <span className="text-xs text-muted-foreground">Sin roles</span>}
          <div className="flex items-center gap-1 ml-2">
            <Select value={adding} onValueChange={(v) => setAdding(v as AppRole)}>
              <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.filter((r) => !user.roles.includes(r)).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-7" onClick={() => addRole.mutate()} disabled={user.roles.includes(adding)}>+</Button>
          </div>
        </div>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center gap-1 justify-end">
          <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8"><KeyRound className="h-3.5 w-3.5" /> Contraseña</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Restablecer contraseña</DialogTitle>
                <DialogDescription>{user.email}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5"><Label>Nueva contraseña (mín. 8)</Label><Input value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPwdOpen(false)}>Cancelar</Button>
                <Button onClick={() => resetPwd.mutate()} disabled={pwd.length < 8 || resetPwd.isPending}>Actualizar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminará <b>{user.email}</b> y no podrá volver a iniciar sesión. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => del.mutate()}>Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </td>
    </tr>
  );
}
