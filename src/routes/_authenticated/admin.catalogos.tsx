import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/lib/auth-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ArrowLeft, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/catalogos")({
  component: CatalogosAdmin,
});

type TableKey =
  | "catalogo_paises"
  | "catalogo_puertos"
  | "catalogo_unidades"
  | "catalogo_areas"
  | "catalogo_tipos_documento_id"
  | "catalogo_metodos_transporte"
  | "catalogo_regimenes"
  | "catalogo_acuerdos"
  | "catalogo_tipos_despacho"
  | "catalogo_estados_producto"
  | "catalogo_documentos_requeridos";

const TABLE_LABELS: Record<TableKey, string> = {
  catalogo_paises: "Países",
  catalogo_puertos: "Puertos",
  catalogo_unidades: "Unidades",
  catalogo_areas: "Áreas Aduaneras",
  catalogo_tipos_documento_id: "Tipos Doc. Identidad",
  catalogo_metodos_transporte: "Métodos de Transporte",
  catalogo_regimenes: "Regímenes",
  catalogo_acuerdos: "Acuerdos Comerciales",
  catalogo_tipos_despacho: "Tipos de Despacho",
  catalogo_estados_producto: "Estados de Producto",
  catalogo_documentos_requeridos: "Documentos Requeridos",
};

const PENDING_TABLES: TableKey[] = [
  "catalogo_metodos_transporte",
  "catalogo_regimenes",
  "catalogo_acuerdos",
  "catalogo_tipos_despacho",
  "catalogo_estados_producto",
  "catalogo_documentos_requeridos",
];

function CatalogosAdmin() {
  const { data: roles } = useMyRoles();
  const isAdmin = roles?.includes("admin");
  const tabs: TableKey[] = [
    "catalogo_paises","catalogo_puertos","catalogo_unidades","catalogo_areas",
    "catalogo_tipos_documento_id","catalogo_metodos_transporte","catalogo_regimenes",
    "catalogo_acuerdos","catalogo_tipos_despacho","catalogo_estados_producto","catalogo_documentos_requeridos",
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link>
        </Button>
        <div>
          <h1 className="font-display text-2xl font-bold">Catálogos oficiales DGA</h1>
          <p className="text-sm text-muted-foreground">
            Tablas maestras usadas en Expedientes y en la futura exportación XML de la Declaración.
          </p>
        </div>
      </div>

      <Tabs defaultValue="catalogo_hitos">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="catalogo_hitos" className="gap-1.5">Hitos de Despacho</TabsTrigger>
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t} className="gap-1.5">
              {TABLE_LABELS[t]}
              {PENDING_TABLES.includes(t) && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-500 text-amber-600">Pdte</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="catalogo_hitos" className="mt-4">
          <HitosCatalog isAdmin={!!isAdmin} />
        </TabsContent>
        {tabs.map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <CatalogTable table={t} isAdmin={!!isAdmin} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

const BASIC_FIELDS = [
  { k: "codigo", label: "Código", required: true },
  { k: "nombre", label: "Nombre", required: true },
];
const BASIC_WITH_ESTADO = [
  ...BASIC_FIELDS,
  { k: "estado", label: "Estado", type: "select" as const, options: ["confirmado", "pendiente"] },
];

const FIELDS: Record<TableKey, Array<{ k: string; label: string; required?: boolean; type?: "text" | "select"; options?: string[] }>> = {
  catalogo_paises: BASIC_FIELDS,
  catalogo_puertos: [
    { k: "codigo", label: "Código", required: true },
    { k: "nombre", label: "Nombre", required: true },
    { k: "cod_pais", label: "Cód. País" },
    { k: "pais", label: "País" },
  ],
  catalogo_unidades: [
    { k: "codigo", label: "Código", required: true },
    { k: "nombre", label: "Nombre", required: true },
    { k: "nombre_eng", label: "Nombre (Eng)" },
    { k: "tipo", label: "Tipo", type: "select", options: ["medida", "embalaje"] },
  ],
  catalogo_areas: BASIC_FIELDS,
  catalogo_tipos_documento_id: BASIC_FIELDS,
  catalogo_metodos_transporte: [
    { k: "codigo", label: "Código", required: true },
    { k: "nombre", label: "Nombre", required: true },
    { k: "nombre_eng", label: "Nombre (Eng)" },
    { k: "estado", label: "Estado", type: "select", options: ["confirmado", "pendiente_validar"] },
  ],
  catalogo_regimenes: BASIC_WITH_ESTADO,
  catalogo_acuerdos: BASIC_WITH_ESTADO,
  catalogo_tipos_despacho: BASIC_WITH_ESTADO,
  catalogo_estados_producto: BASIC_WITH_ESTADO,
  catalogo_documentos_requeridos: BASIC_WITH_ESTADO,
};


function CatalogTable({ table, isAdmin }: { table: TableKey; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data, isFetching } = useQuery({
    queryKey: [table, q, page],
    queryFn: async () => {
      let query: any = supabase.from(table).select("*", { count: "exact" });
      if (q.trim()) query = query.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`);
      query = query.order("nombre").range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const { data: totalCount } = useQuery({
    queryKey: [table, "total-count"],
    queryFn: async () => {
      const { count } = await supabase.from(table).select("codigo", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const fields = FIELDS[table];
  const [dialog, setDialog] = useState<{ mode: "new" | "edit"; row?: any } | null>(null);

  const upsert = useMutation({
    mutationFn: async (payload: any) => {
      const cleaned: any = {};
      fields.forEach((f) => { cleaned[f.k] = payload[f.k] || null; });
      if (dialog?.mode === "edit") {
        const { error } = await supabase.from(table).update(cleaned).eq("codigo", dialog.row.codigo);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(cleaned);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(dialog?.mode === "edit" ? "Registro actualizado" : "Registro agregado");
      setDialog(null);
      qc.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (codigo: string) => {
      const { error } = await supabase.from(table).delete().eq("codigo", codigo);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Eliminado"); qc.invalidateQueries({ queryKey: [table] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="pb-3 border-b flex-row items-center gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          {TABLE_LABELS[table]}
          <Badge variant="outline" className="text-xs font-normal">
            {totalCount?.toLocaleString("en-US") ?? "…"} registros
          </Badge>
          {PENDING_TABLES.includes(table) && (
            <Badge variant="outline" className="text-xs font-normal border-amber-500 text-amber-600">
              Pendiente de completar con la DGA
            </Badge>
          )}
        </CardTitle>
        <div className="flex-1" />
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o código…"
            className="pl-8 h-9"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
          />
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setDialog({ mode: "new" })}>
            <Plus className="h-4 w-4 mr-1" />Agregar
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {fields.map((f) => <th key={f.k} className="px-3 py-2 text-left">{f.label}</th>)}
                {isAdmin && <th className="w-24"></th>}
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).length === 0 && !isFetching && (
                <tr><td colSpan={fields.length + 1} className="px-3 py-8 text-center text-muted-foreground">Sin resultados.</td></tr>
              )}
              {(data?.rows ?? []).map((r: any) => (
                <tr key={r.codigo} className="border-t">
                  {fields.map((f) => (
                    <td key={f.k} className="px-3 py-2 tabular-nums">{r[f.k] ?? "—"}</td>
                  ))}
                  {isAdmin && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialog({ mode: "edit", row: r })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => { if (confirm(`Eliminar ${r.codigo}?`)) eliminar.mutate(r.codigo); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
            <span>Página {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </CardContent>

      {dialog && (
        <CatalogEditDialog
          fields={fields}
          initial={dialog.row ?? {}}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSave={(v: any) => upsert.mutate(v)}
          saving={upsert.isPending}
        />
      )}
    </Card>
  );
}

function CatalogEditDialog({ fields, initial, mode, onClose, onSave, saving }: any) {
  const [f, setF] = useState<any>(() => {
    const base: any = {};
    fields.forEach((fd: any) => { base[fd.k] = initial[fd.k] ?? ""; });
    return base;
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === "edit" ? "Editar registro" : "Agregar registro"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          {fields.map((fd: any) => (
            <div key={fd.k} className="grid gap-1.5">
              <Label>{fd.label}{fd.required && <span className="text-destructive"> *</span>}</Label>
              {fd.type === "select" ? (
                <Select value={f[fd.k] || undefined} onValueChange={(v) => setF({ ...f, [fd.k]: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {fd.options.map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={f[fd.k]}
                  onChange={(e) => setF({ ...f, [fd.k]: e.target.value })}
                  disabled={fd.k === "codigo" && mode === "edit"}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => {
              const missing = fields.filter((fd: any) => fd.required && !f[fd.k]);
              if (missing.length) return toast.error(`Falta: ${missing.map((m: any) => m.label).join(", ")}`);
              onSave(f);
            }}
            disabled={saving}
          >{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HitosCatalog({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["catalogo_hitos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("catalogo_hitos").select("*").order("orden");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [dialog, setDialog] = useState<{ mode: "new" | "edit"; row?: any } | null>(null);

  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        codigo: v.codigo,
        nombre: v.nombre,
        orden: Number(v.orden) || 0,
        activo: v.activo !== false,
        descripcion: v.descripcion || null,
      };
      if (dialog?.mode === "edit") {
        const { error } = await supabase.from("catalogo_hitos").update(payload).eq("id", dialog.row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("catalogo_hitos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Guardado");
      setDialog(null);
      qc.invalidateQueries({ queryKey: ["catalogo_hitos"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("catalogo_hitos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["catalogo_hitos"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3 border-b flex-row items-center gap-3 space-y-0">
        <CardTitle className="text-base">Hitos de Despacho</CardTitle>
        <Badge variant="outline" className="text-xs font-normal">{rows?.length ?? 0} hitos</Badge>
        <div className="flex-1" />
        {isAdmin && (
          <Button size="sm" onClick={() => setDialog({ mode: "new", row: { activo: true, orden: (rows?.length ?? 0) * 10 + 10 } })}>
            <Plus className="h-4 w-4 mr-1" />Agregar hito
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground pt-3 pb-2">
          Los hitos activos se crean automáticamente al registrar un nuevo Expediente. Los expedientes existentes conservan sus hitos actuales.
        </p>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left w-16">Orden</th>
                <th className="px-3 py-2 text-left">Nombre</th>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left w-20">Activo</th>
                {isAdmin && <th className="w-24"></th>}
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 tabular-nums">{r.orden}</td>
                  <td className="px-3 py-2 font-medium">{r.nombre}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.codigo}</td>
                  <td className="px-3 py-2">
                    <Badge variant={r.activo ? "default" : "outline"}>{r.activo ? "Sí" : "No"}</Badge>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialog({ mode: "edit", row: r })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => { if (confirm(`Eliminar hito "${r.nombre}"?`)) del.mutate(r.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>

      {dialog && (
        <HitoDialog
          initial={dialog.row ?? {}}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSave={(v: any) => save.mutate(v)}
          saving={save.isPending}
        />
      )}
    </Card>
  );
}

function HitoDialog({ initial, mode, onClose, onSave, saving }: any) {
  const [f, setF] = useState<any>({
    codigo: initial.codigo ?? "",
    nombre: initial.nombre ?? "",
    orden: initial.orden ?? 0,
    activo: initial.activo ?? true,
    descripcion: initial.descripcion ?? "",
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === "edit" ? "Editar hito" : "Agregar hito"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nombre <span className="text-destructive">*</span></Label>
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Código <span className="text-destructive">*</span></Label>
            <Input value={f.codigo} disabled={mode === "edit"} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="ej. cita_asignada_puerto" />
          </div>
          <div className="grid gap-1.5">
            <Label>Orden</Label>
            <Input type="number" value={f.orden} onChange={(e) => setF({ ...f, orden: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={!!f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
            <Label>Activo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!f.nombre || !f.codigo) return toast.error("Nombre y código son requeridos");
              onSave(f);
            }}
            disabled={saving}
          >{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

