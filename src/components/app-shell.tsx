import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Inbox, FolderKanban, Users, UserCog, LogOut, Ship, Search,
  PackageOpen, PackageCheck, ScanText, Sparkles,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useMyRoles, ROLE_LABELS } from "@/lib/auth-hooks";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const solicitudesSub = [
  { to: "/solicitudes/ocr", label: "OCR de documentos", icon: ScanText },
];

const expedientesSub = [
  { to: "/expedientes", search: { tipo: "importacion" as const }, label: "Importaciones", icon: PackageOpen },
  { to: "/expedientes", search: { tipo: "exportacion" as const }, label: "Exportaciones", icon: PackageCheck },
];

function AppSidebarInner() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const search = useRouterState({ select: (r) => (r.location.search as any) ?? {} }) as { tipo?: string };
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { data: profile } = useMyProfile();
  const { data: roles } = useMyRoles();
  const isAdmin = roles?.includes("admin");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-9 w-9 grid place-items-center rounded-md bg-accent text-accent-foreground shrink-0">
            <Ship className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display font-bold text-sidebar-foreground leading-tight">ADECOMEX</div>
              <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Aduanas · RD</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/dashboard"}>
                  <Link to="/dashboard" className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    {!collapsed && <span>Dashboard</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Solicitudes con OCR */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/solicitudes" || (pathname.startsWith("/solicitudes/") && pathname !== "/solicitudes/ocr")}>
                  <Link to="/solicitudes" className="flex items-center gap-2">
                    <Inbox className="h-4 w-4" />
                    {!collapsed && <span>Solicitudes</span>}
                  </Link>
                </SidebarMenuButton>
                {!collapsed && (
                  <SidebarMenuSub>
                    {solicitudesSub.map((sub) => {
                      const activeSub = pathname === sub.to;
                      return (
                        <SidebarMenuSubItem key={sub.to}>
                          <SidebarMenuSubButton asChild isActive={activeSub}>
                            <Link to={sub.to} className="flex items-center gap-2">
                              <sub.icon className="h-3.5 w-3.5" />
                              <span>{sub.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              {/* Expedientes */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/expedientes" || pathname.startsWith("/expedientes/")}>
                  <Link to="/expedientes" className="flex items-center gap-2">
                    <FolderKanban className="h-4 w-4" />
                    {!collapsed && <span>Expedientes</span>}
                  </Link>
                </SidebarMenuButton>
                {!collapsed && (
                  <SidebarMenuSub>
                    {expedientesSub.map((sub) => {
                      const activeSub = pathname.startsWith("/expedientes") && search?.tipo === sub.search.tipo;
                      return (
                        <SidebarMenuSubItem key={sub.label}>
                          <SidebarMenuSubButton asChild isActive={activeSub}>
                            <Link to={sub.to} search={sub.search} className="flex items-center gap-2">
                              <sub.icon className="h-3.5 w-3.5" />
                              <span>{sub.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              {/* Clientes */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/clientes" || pathname.startsWith("/clientes/")}>
                  <Link to="/clientes" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {!collapsed && <span>Clientes</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Copiloto arancelario */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith("/copiloto")}>
                  <Link to="/copiloto" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {!collapsed && <span>Copiloto IA</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administración</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/admin/usuarios")}>
                    <Link to="/admin/usuarios" className="flex items-center gap-2">
                      <UserCog className="h-4 w-4" />
                      {!collapsed && <span>Usuarios y roles</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 p-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
              {(profile?.nombre ?? "?").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-sm text-sidebar-foreground truncate">{profile?.nombre ?? "Usuario"}</div>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {(roles ?? []).slice(0, 2).map((r) => (
                  <Badge key={r} variant="outline" className="text-[10px] border-sidebar-border text-sidebar-foreground/80">
                    {ROLE_LABELS[r]}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebarInner />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card/50 backdrop-blur flex items-center gap-3 px-4">
            <SidebarTrigger />
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar expediente, BL/AWB, solicitud, cliente…" className="pl-9 h-9 bg-background" />
            </div>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-1" /> Salir
            </Button>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
