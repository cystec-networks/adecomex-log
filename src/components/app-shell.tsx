import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Inbox, FolderKanban, Users, UserCog, LogOut,
  PackageOpen, PackageCheck, ScanText, Sparkles, Trash2, FileCheck2, Truck,
  ChevronDown, Wrench, FileText, Bot, LayoutDashboard, BarChart3, Library, Settings,
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { GlobalSearch } from "@/components/global-search";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useMyRoles, ROLE_LABELS } from "@/lib/auth-hooks";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ReactNode, ComponentType } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import logoAsset from "@/assets/logo-adecomex.jpg.asset.json";

type SubItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  search?: Record<string, unknown>;
  match?: (pathname: string, search: Record<string, unknown>) => boolean;
  adminOnly?: boolean;
};

type Group = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  items: SubItem[];
  adminOnly?: boolean;
};

type SimpleItem = {
  id: string;
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  search?: Record<string, unknown>;
  match?: (pathname: string, search: Record<string, unknown>) => boolean;
  adminOnly?: boolean;
};

type MenuEntry =
  | { type: "group"; data: Group }
  | { type: "simple"; data: SimpleItem };

const GROUPS: Group[] = [
  {
    id: "solicitudes",
    label: "SOLICITUDES",
    icon: Inbox,
    items: [
      { to: "/solicitudes", label: "Solicitudes", icon: FileText,
        match: (p) => p === "/solicitudes" || (p.startsWith("/solicitudes/") && p !== "/solicitudes/ocr") },
      { to: "/permisos", label: "Permisos", icon: FileCheck2,
        match: (p) => p === "/permisos" || p.startsWith("/permisos/") },
      { to: "/solicitudes/ocr", label: "OCR", icon: ScanText },
      { to: "/copiloto", label: "Copiloto IA", icon: Bot,
        match: (p) => p.startsWith("/copiloto") },
    ],
  },
  {
    id: "expedientes",
    label: "EXPEDIENTES",
    icon: FolderKanban,
    items: [
      { to: "/expedientes", label: "Expedientes", icon: FolderKanban,
        match: (p, s) => (p === "/expedientes" || p.startsWith("/expedientes/")) && !s?.tipo && p !== "/expedientes/papelera" },
      { to: "/expedientes", search: { tipo: "importacion" }, label: "Importaciones", icon: PackageOpen,
        match: (p, s) => p.startsWith("/expedientes") && s?.tipo === "importacion" },
      { to: "/expedientes", search: { tipo: "exportacion" }, label: "Exportaciones", icon: PackageCheck,
        match: (p, s) => p.startsWith("/expedientes") && s?.tipo === "exportacion" },
    ],
  },
  {
    id: "transporte",
    label: "TRANSPORTE",
    icon: Truck,
    items: [
      { to: "/transportes/dashboard", label: "Dashboard", icon: LayoutDashboard,
        match: (p) => p === "/transportes/dashboard" },
      { to: "/transportes", label: "Transportes", icon: Truck,
        match: (p) => (p === "/transportes" || p.startsWith("/transportes/")) && p !== "/transportes/dashboard" },
    ],
  },
];

const SIMPLE_ITEMS: SimpleItem[] = [
  { id: "reportes", to: "/reportes", label: "Reportes", icon: BarChart3,
    match: (p) => p === "/reportes" || p.startsWith("/reportes/") },
  { id: "clientes", to: "/clientes", label: "Clientes", icon: Users,
    match: (p) => p === "/clientes" || p.startsWith("/clientes/") },
  { id: "usuarios", to: "/admin/usuarios", label: "Usuarios y roles", icon: UserCog, adminOnly: true,
    match: (p) => p.startsWith("/admin/usuarios") },
  { id: "catalogos", to: "/admin/catalogos", label: "Catálogos DGA", icon: Library, adminOnly: true,
    match: (p) => p.startsWith("/admin/catalogos") },
  { id: "configuracion", to: "/admin/configuracion", label: "Configuración", icon: Settings, adminOnly: true,
    match: (p) => p.startsWith("/admin/configuracion") },
  { id: "papelera", to: "/expedientes/papelera", label: "Papelera", icon: Trash2, adminOnly: true,
    match: (p) => p === "/expedientes/papelera" },
];

function AppSidebarInner() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const search = useRouterState({ select: (r) => (r.location.search as any) ?? {} }) as unknown as Record<string, unknown>;
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { data: profile } = useMyProfile();
  const { data: roles } = useMyRoles();
  const isAdmin = roles?.includes("admin");

  const visibleGroups = GROUPS.filter((g) => !g.adminOnly || isAdmin).map((g) => ({
    ...g,
    items: g.items.filter((it) => !it.adminOnly || isAdmin),
  })).filter((g) => g.items.length > 0);

  const visibleSimpleItems = SIMPLE_ITEMS.filter((it) => !it.adminOnly || isAdmin);

  const isItemActive = (it: SubItem | SimpleItem) =>
    it.match ? it.match(pathname, search) : pathname === it.to;

  const groupHasActive = (g: Group) => g.items.some(isItemActive);

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(visibleGroups.map((g) => [g.id, groupHasActive(g)])),
  );

  // Auto-expand group when navigating to one of its routes
  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const g of visibleGroups) {
        if (groupHasActive(g)) next[g.id] = true;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, JSON.stringify(search)]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-9 w-9 grid place-items-center rounded-md bg-white shrink-0 overflow-hidden">
            <img src={logoAsset.url} alt="ADECOMEX SRL" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display font-bold text-sidebar-foreground leading-tight">ADECOMEX SRL</div>
              <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">GESTION Y LOGISTICA</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {!collapsed && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50 font-semibold mt-1">
              Operaciones
            </SidebarGroupLabel>
          </SidebarGroup>
        )}

        {/* Dashboard (item simple, primero) */}
        {renderSimpleItem({ id: "dashboard", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard,
          match: (p) => p === "/dashboard" })}

        {/* Solicitudes group */}
        {renderGroup(visibleGroups.find((g) => g.id === "solicitudes")!)}

        {/* Expedientes group */}
        {renderGroup(visibleGroups.find((g) => g.id === "expedientes")!)}

        {/* Transporte group */}
        {renderGroup(visibleGroups.find((g) => g.id === "transporte")!)}

        {/* Simple items */}
        {visibleSimpleItems.map((it) => renderSimpleItem(it))}
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

  function renderGroup(g: Group | undefined) {
    if (!g) return null;
    const open = openMap[g.id] ?? false;
    const hasActive = groupHasActive(g);

    if (collapsed) {
      const first = g.items[0];
      return (
        <SidebarGroup key={g.id}>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={hasActive} tooltip={g.label}>
                  <Link to={first.to} search={first.search as any} className="flex items-center gap-2">
                    <g.icon className="h-4 w-4" />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      );
    }

    return (
      <Collapsible
        key={g.id}
        open={open}
        onOpenChange={(v) => setOpenMap((prev) => ({ ...prev, [g.id]: v }))}
        asChild
      >
        <SidebarGroup>
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel
              className="group/label cursor-pointer flex items-center justify-between hover:text-sidebar-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <g.icon className="h-3.5 w-3.5" />
                {g.label}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              />
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((it) => {
                  const active = isItemActive(it);
                  return (
                    <SidebarMenuItem key={`${it.to}-${it.label}`}>
                      <SidebarMenuButton asChild isActive={active}>
                        <Link to={it.to} search={it.search as any} className="flex items-center gap-2">
                          <it.icon className="h-4 w-4" />
                          <span>{it.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    );
  }

  function renderSimpleItem(it: SimpleItem | undefined) {
    if (!it) return null;
    const active = isItemActive(it);

    return (
      <SidebarGroup key={it.id}>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={active} tooltip={it.label}>
                <Link to={it.to} search={it.search as any} className="flex items-center gap-2">
                  <it.icon className="h-4 w-4" />
                  {!collapsed && <span>{it.label}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }
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
            <GlobalSearch />
            <div className="flex-1" />
            <NotificationsBell />
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
