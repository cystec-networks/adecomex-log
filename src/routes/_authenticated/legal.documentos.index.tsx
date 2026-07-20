import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Trash, RotateCcw, Pencil, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMyRoles } from "@/lib/auth-hooks";
import { DocumentoPreviewButton } from "@/components/documento-preview-dialog";

export const Route = createFileRoute("/_authenticated/legal/documentos/")({
  component: DocumentosLegales,
});

const TIPOS: { v: string; l: string }[] = [
  { v: "registro_mercantil", l: "Registro Mercantil" },
  { v: "rnc_dgii", l: "RNC / DGII" },
  { v: "fianza_aduanal", l: "Fianza Aduanal" },
  { v: "licencia_agente_aduanas", l: "Licencia de Agente de Aduanas" },
  { v: "acta_asamblea", l: "Acta de Asamblea" },
  { v: "certificado_digital_siga", l: "Certificado Digital SIGA" },
  { v: "registro_nombre_comercial_onapi", l: "Registro Nombre Comercial (ONAPI)" },
  { v: "poliza_seguro", l: "Póliza de Seguro" },
  { v: "otro", l: "Otro" },
];
const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.v, t.l]));

const empty: any = {
  tipo: "registro_mercantil",
  numero_referencia: "",
  entidad_emisora: "",
  fecha_emision: "",
  fecha_vencimiento: "",
  responsable: "",
  notas: "",
  storage_path: "",
};

function diasHastaVencimiento(fecha: string | null): number | null {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha + "T00:00:00");
  return Math.floor((f.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function BadgeVencimiento({ fecha }: { fecha: string | null }) {
  const d = diasHastaVencimiento(fecha);
  if (d === null) return <span className="text-muted-foreground">—</span>;
  if (d < 0) return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Vencido hace {Math.abs(d)} d</Badge>;
  if (d <= 60) return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Vence en {d} d</Badge>;
  return <span>{fecha}</span>;
}

function DocumentosLegales() {
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const isAdmin = (roles ?? []).includes("admin");

  const [q, setQ] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);
  const [toDelete, setToDelete] = useState<any>(null);
  const [papeleraOpen, setPapeleraOpen] = useState(false);

  const { data: docs } = useQuery({
    queryKey: ["docs-legales"],
    queryFn: async () =>
      ((await (supabase as any).from("documentos_legales_empresa").select("*")
        .is("deleted_at", null).order("fecha_vencimiento", { ascending: true, nullsFirst: false })).data ?? []) as any[],
  });

  const { data: papelera } = useQuery({
    queryKey: ["docs-legales-papelera"],
    enabled: papeleraOpen,
    queryFn: async () =>
      ((await (supabase as any).from("documentos_legales_empresa").select("*")
        .not("deleted_at", "is", null).order("deleted_at", { ascending: false })).data ?? []) as any[],
  });

  const resumen = useMemo(() => {
    const list = docs ?? [];
    let vigentes = 0, porVencer = 0, vencidos = 0;
    for (const d of list) {
      const dias = diasHastaVencimiento(d.fecha_vencimiento);
      if (dias === null) { vigentes++; continue; }
      if (dias < 0) vencidos++;
      else if (dias <= 60) porVencer++;
      else vigentes++;
    }
    return { vigentes, porVencer, vencidos };
  }, [docs]);

  const filtered = (docs ?? []).filter((d: any) => {
    if (tipoFilter !== "todos" && d.tipo !== tipoFilter) return false;
    if (q) {
      const t = q.toLowerCase();
      if (!((d.numero_referencia ?? "").toLowerCase().includes(t)
         || (d.entidad_emisora ?? "").toLowerCase().includes(t))) return false;
    }
    return true;
  });

  const openNew = () => { setEditing(null); setForm(empty); setFile(null); setOpen(true); };
  const openEdit = (d: any) => {
    setEditing(d);
    setForm({
      tipo: d.tipo,
      numero_referencia: d.numero_referencia ?? "",
      entidad_emisora: d.entidad_emisora ?? "",
      fecha_emision: d.fecha_emision ?? "",
      fecha_vencimiento: d.fecha_vencimiento ?? "",
      responsable: d.responsable ?? "",
      notas: d.notas ?? "",
      storage_path: d.storage_path ?? "",
    });
    setFile(null);
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const clean: any = { ...form };
      for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;

      let id = editing?.id as string | undefined;
      if (!id) {
        clean.created_by = u.user?.id ?? null;
        const { data, error } = await (supabase as any).from("documentos_legales_empresa")
          .insert(clean).select("id").single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await (supabase as any).from("documentos_legales_empresa")
          .update(clean).eq("id", id);
        if (error) throw error;
      }

      if (file && id) {
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `legal-empresa/${id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("documentos").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { error: e2 } = await (supabase as any).from("documentos_legales_empresa")
          .update({ storage_path: path }).eq("id", id);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Documento actualizado" : "Documento creado");
      qc.invalidateQueries({ queryKey: ["docs-legales"] });
      setOpen(false); setEditing(null); setForm(empty); setFile(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("documentos_legales_empresa")
        .update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movido a la papelera");
      qc.invalidateQueries({ queryKey: ["docs-legales"] });
      qc.invalidateQueries({ queryKey: ["docs-legales-papelera"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("documentos_legales_empresa")
        .update({ deleted_at: null, deleted_by: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Restaurado");
      qc.invalidateQueries({ queryKey: ["docs-legales"] });
      qc.invalidateQueries({ queryKey: ["docs-legales-papelera"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <div className="p-6 text-sm text-muted-foreground">Acceso restringido a administradores.</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Documentos Legales</h1>
          <p className="text-sm text-muted-foreground">Registro de documentos legales corporativos y alertas de vencimiento.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPapeleraOpen(true)}>
            <Trash className="h-4 w-4 mr-1" />Ver papelera
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Nuevo documento</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Vigentes</div>
          <div className="text-2xl font-bold text-emerald-700">{resumen.vigentes}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Por vencer (≤ 60 días)</div>
          <div className="text-2xl font-bold text-amber-700">{resumen.porVencer}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Vencidos</div>
          <div className="text-2xl font-bold text-rose-700">{resumen.vencidos}</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar por número o entidad emisora..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Tipo</th>
                <th className="text-left p-3">N° referencia</th>
                <th className="text-left p-3">Entidad emisora</th>
                <th className="text-left p-3">Emisión</th>
                <th className="text-left p-3">Vencimiento</th>
                <th className="text-left p-3">Responsable</th>
                <th className="text-left p-3">Archivo</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d: any) => (
                <tr key={d.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-medium">{TIPO_LABEL[d.tipo] ?? d.tipo}</td>
                  <td className="p-3">{d.numero_referencia ?? "—"}</td>
                  <td className="p-3">{d.entidad_emisora ?? "—"}</td>
                  <td className="p-3">{d.fecha_emision ?? "—"}</td>
                  <td className="p-3"><BadgeVencimiento fecha={d.fecha_vencimiento} /></td>
                  <td className="p-3">{d.responsable ?? "—"}</td>
                  <td className="p-3">
                    {d.storage_path
                      ? <DocumentoPreviewButton path={d.storage_path} label="Ver" />
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setToDelete(d)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sin resultados.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(empty); setFile(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar documento" : "Nuevo documento"}</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="grid gap-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Número de referencia</Label>
                <Input value={form.numero_referencia} onChange={(e) => setForm({ ...form, numero_referencia: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Entidad emisora</Label>
                <Input value={form.entidad_emisora} onChange={(e) => setForm({ ...form, entidad_emisora: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Fecha de emisión</Label>
                <Input type="date" value={form.fecha_emision} onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Fecha de vencimiento</Label>
                <Input type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} /></div>
            </div>
            <div className="grid gap-1.5"><Label>Responsable</Label>
              <Input value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Notas</Label>
              <Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>

            <div className="grid gap-1.5">
              <Label className="flex items-center gap-2"><Upload className="h-4 w-4" />Archivo</Label>
              {form.storage_path && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Archivo actual:</span>
                  <DocumentoPreviewButton path={form.storage_path} label="Ver adjunto" />
                </div>
              )}
              <Input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">Se sube al bucket <code>documentos</code> en <code>legal-empresa/{"{id}"}/…</code>.</p>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar documento</AlertDialogTitle>
            <AlertDialogDescription>
              Se moverá a la papelera y podrás restaurarlo después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); del.mutate(toDelete.id); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={papeleraOpen} onOpenChange={setPapeleraOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Papelera de documentos legales</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">N° referencia</th>
                  <th className="text-left p-2">Eliminado</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(papelera ?? []).map((d: any) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-2 font-medium">{TIPO_LABEL[d.tipo] ?? d.tipo}</td>
                    <td className="p-2">{d.numero_referencia ?? "—"}</td>
                    <td className="p-2">{d.deleted_at ? new Date(d.deleted_at).toLocaleString() : "—"}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => restore.mutate(d.id)} disabled={restore.isPending}>
                        <RotateCcw className="h-4 w-4 mr-1" />Restaurar
                      </Button>
                    </td>
                  </tr>
                ))}
                {(papelera ?? []).length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Papelera vacía.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
