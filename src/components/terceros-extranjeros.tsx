import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeSearchTerm } from "@/lib/search-filter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookUser, Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLES_SIGA, type RolSiga } from "@/lib/terceros-certificado";

export type TerceroExtranjero = {
  id: string;
  nombre: string;
  tid: string;
  direccion: string | null;
  telefono: string | null;
  fax: string | null;
  email: string | null;
  pais_codigo: string | null;
  pais_nombre: string | null;
  activo: boolean;
  rol_siga: RolSiga;
};

const TABLE = "catalogo_terceros_extranjeros";

/** Botón "Elegir de catálogo": busca terceros extranjeros y devuelve el elegido. */
export function TerceroExtranjeroPicker({
  onSelect,
  label = "Elegir de catálogo",
  size = "sm",
  rol,
}: {
  onSelect: (t: TerceroExtranjero) => void;
  label?: string;
  size?: "sm" | "default";
  rol?: RolSiga;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const debounce = useRef<number | undefined>(undefined);

  const crear = useMutation({
    mutationFn: async () => {
      const payload: any = {};
      payload.rol_siga = form.rol_siga || rol || "sin_especificar";
      FIELDS.forEach((f) => { payload[f.k] = (form[f.k as string] ?? "").trim() || null; });
      if (!payload.nombre || !payload.tid) throw new Error("Nombre y TID son obligatorios");
      const { data, error } = await supabase.from(TABLE as any).insert(payload).select().single();
      if (error) throw error;
      return data as unknown as TerceroExtranjero;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["terceros-extranjeros"] });
      qc.invalidateQueries({ queryKey: ["terceros-extranjeros-picker"] });
      qc.invalidateQueries({ queryKey: ["cert-terceros-roles"] });
      toast.success("Tercero extranjero creado");
      setNuevoOpen(false);
      setForm({});
      onSelect(t);
    },
    onError: (e: any) => toast.error(e.message),
  });

  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => setTerm(sanitizeSearchTerm(q)), 200);
    return () => window.clearTimeout(debounce.current);
  }, [q]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["terceros-extranjeros-picker", term, open, rol],
    enabled: open,
    queryFn: async () => {
      let query: any = supabase.from(TABLE as any).select("*").eq("activo", true);
      if (rol) query = query.in("rol_siga", [rol, "sin_especificar"]);
      if (term) query = query.or(`nombre.ilike.%${term}%,tid.ilike.%${term}%`);
      const { data, error } = await query.order("nombre").limit(50);
      if (error) throw error;
      return ((data ?? []) as TerceroExtranjero[]).sort((a, b) => Number(b.rol_siga === rol) - Number(a.rol_siga === rol));
    },
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size={size}>
          <BookUser className="h-4 w-4 mr-1" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0">
        <div className="p-2 border-b flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o TID…"
            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0"
          />
        </div>
        <div className="max-h-64 overflow-auto">
          {isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Buscando…</p>
          ) : rows.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Sin resultados en el catálogo.</p>
          ) : (
            rows.map((r) => (
               <Button
                key={r.id}
                type="button"
                 variant="ghost"
                 className="w-full h-auto rounded-none flex-col items-start text-left px-3 py-2"
                onClick={() => {
                  onSelect(r);
                  setOpen(false);
                }}
              >
                <div className="text-sm font-medium">{r.nombre}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {r.tid}
                  {r.pais_nombre ? ` · ${r.pais_nombre}` : ""}
                   {` · ${ROLES_SIGA.find((o) => o.value === r.rol_siga)?.label ?? "Sin especificar"}`}
                </div>
               </Button>
            ))
          )}
        </div>
        <div className="p-2 border-t">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
             onClick={() => { setOpen(false); setForm({ rol_siga: rol ?? "sin_especificar" }); setNuevoOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-1" /> Agregar nuevo tercero extranjero (Catálogo DGA)
          </Button>
        </div>
      </PopoverContent>
      </Popover>

      <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo tercero extranjero (Catálogo DGA)</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
             <RolSigaField value={form.rol_siga || rol || "sin_especificar"} onChange={(v) => setForm((p) => ({ ...p, rol_siga: v }))} />
            {FIELDS.map((f) => (
              <div key={f.k as string} className="grid gap-1.5">
                <Label>{f.label}{f.required ? " *" : ""}</Label>
                <Input
                  value={form[f.k as string] ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, [f.k as string]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNuevoOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={() => crear.mutate()} disabled={crear.isPending}>
              {crear.isPending ? "Guardando…" : "Guardar y usar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const FIELDS: Array<{ k: keyof TerceroExtranjero; label: string; required?: boolean }> = [
  { k: "nombre", label: "Nombre", required: true },
  { k: "tid", label: "TID", required: true },
  { k: "direccion", label: "Dirección" },
  { k: "telefono", label: "Teléfono" },
  { k: "fax", label: "Fax" },
  { k: "email", label: "Email" },
  { k: "pais_nombre", label: "País" },
  { k: "pais_codigo", label: "Código de país" },
];

function RolSigaField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div className="grid gap-1.5"><Label>Rol en SIGA</Label><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES_SIGA.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>;
}

/** Pantalla de administración del catálogo de terceros extranjeros. */
export function TercerosExtranjerosCatalog({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TerceroExtranjero | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: rows = [] } = useQuery({
    queryKey: ["terceros-extranjeros"],
    queryFn: async () => {
      const { data, error } = await supabase.from(TABLE as any).select("*").order("nombre");
      if (error) throw error;
      return (data ?? []) as unknown as TerceroExtranjero[];
    },
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => `${r.nombre} ${r.tid} ${r.pais_nombre ?? ""}`.toLowerCase().includes(t));
  }, [rows, q]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {};
      payload.rol_siga = form.rol_siga || "sin_especificar";
      FIELDS.forEach((f) => { payload[f.k] = (form[f.k as string] ?? "").trim() || null; });
      if (!payload.nombre || !payload.tid) throw new Error("Nombre y TID son obligatorios");
      if (editing) {
        const { error } = await supabase.from(TABLE as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(TABLE as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["terceros-extranjeros"] });
      qc.invalidateQueries({ queryKey: ["terceros-extranjeros-picker"] });
      qc.invalidateQueries({ queryKey: ["cert-terceros-roles"] });
      setOpen(false);
      toast.success(editing ? "Tercero actualizado" : "Tercero creado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActivo = useMutation({
    mutationFn: async (r: TerceroExtranjero) => {
      const { error } = await supabase.from(TABLE as any).update({ activo: !r.activo }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["terceros-extranjeros"] });
      qc.invalidateQueries({ queryKey: ["terceros-extranjeros-picker"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const abrir = (r: TerceroExtranjero | null) => {
    setEditing(r);
    const f: Record<string, string> = {};
    f.rol_siga = r?.rol_siga ?? "sin_especificar";
    FIELDS.forEach((fl) => { f[fl.k as string] = (r?.[fl.k] as string | null) ?? ""; });
    setForm(f);
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Terceros Extranjeros (Exportadores / Productores)</CardTitle>
        <div className="flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="h-9 w-48" />
          <Button size="sm" onClick={() => abrir(null)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                 <TableHead>TID / Rol SIGA</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead className="w-32">Estado</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    Sin registros.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nombre}</TableCell>
                     <TableCell className="text-xs"><div className="font-mono">{r.tid}</div><div className="text-muted-foreground">{ROLES_SIGA.find((o) => o.value === r.rol_siga)?.label ?? "Sin especificar"}</div></TableCell>
                    <TableCell className="text-sm">{r.pais_nombre ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[r.telefono, r.email].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.activo ? "default" : "outline"}>{r.activo ? "Activo" : "Inactivo"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => abrir(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <Button variant="ghost" size="sm" onClick={() => toggleActivo.mutate(r)}>
                          {r.activo ? "Desactivar" : "Activar"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar tercero extranjero" : "Nuevo tercero extranjero"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
             <RolSigaField value={form.rol_siga || "sin_especificar"} onChange={(v) => setForm((p) => ({ ...p, rol_siga: v }))} />
            {FIELDS.map((f) => (
              <div key={f.k as string} className="grid gap-1.5">
                <Label>{f.label}{f.required ? " *" : ""}</Label>
                <Input
                  value={form[f.k as string] ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, [f.k as string]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
