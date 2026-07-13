import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2 } from "lucide-react";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { EmailButton } from "@/components/email-button";
import { useState } from "react";
import { toast } from "sonner";
import { parseLocalDate, fmtLocalDate } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/solicitudes/")({
  component: Solicitudes,
});

const ESTADOS = ["recibida", "en_revision", "aprobada", "rechazada", "convertida"];

function Solicitudes() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<string>("todas");
  const [toTrash, setToTrash] = useState<{ id: string; numero: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["solicitudes"],
    queryFn: async () => (await supabase
      .from("solicitudes")
      .select("*, clientes(nombre,telefono,email)")
      .is("eliminado_en", null)
      .order("created_at", { ascending: false })).data ?? [],
  });

  const trashMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("solicitudes")
        .update({ eliminado_en: new Date().toISOString(), eliminado_por: u.user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitud movida a la papelera");
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      qc.invalidateQueries({ queryKey: ["papelera-solicitudes"] });
      setToTrash(null);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo mover a papelera"),
  });

  const filtered = (data ?? []).filter((s: any) => {
    if (estado !== "todas" && s.estado !== estado) return false;
    if (q && !JSON.stringify(s).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  type SortKey = "numero" | "cliente" | "tipo_operacion" | "origen" | "fecha_arribo_est" | "prioridad" | "estado" | "created_at";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (key: SortKey) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };
  const activeSort = sort ?? { key: "fecha_arribo_est" as SortKey, dir: "asc" as const };
  const getVal = (s: any, k: SortKey) => k === "cliente" ? (s.clientes?.nombre ?? "") : (s[k] ?? "");
  const sorted = [...filtered].sort((a, b) => {
    const aC = a.estado === "convertida" ? 1 : 0;
    const bC = b.estado === "convertida" ? 1 : 0;
    if (aC !== bC) return aC - bC;
    const av = getVal(a, activeSort.key);
    const bv = getVal(b, activeSort.key);
    const aEmpty = av === "" || av == null;
    const bEmpty = bv === "" || bv == null;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    let r = 0;
    if (activeSort.key === "fecha_arribo_est" || activeSort.key === "created_at") {
      r = new Date(av).getTime() - new Date(bv).getTime();
    } else {
      r = String(av).localeCompare(String(bv), "es", { numeric: true });
    }
    return activeSort.dir === "asc" ? r : -r;
  });

  const isActive = (k: SortKey) => !!sort && sort.key === k;
  const isDefault = (k: SortKey) => !sort && k === "fecha_arribo_est";
  const Th = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => {
    const active = isActive(k);
    const def = isDefault(k);
    const icon = active ? (sort!.dir === "asc" ? "▲" : "▼") : def ? "▲" : "↕";
    return (
      <th className={`text-left ${className}`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          title={active ? `Ordenado ${sort!.dir === "asc" ? "ascendente" : "descendente"} · clic para ${sort!.dir === "asc" ? "descendente" : "quitar orden"}` : def ? "Orden por defecto: Arribo ascendente · clic para cambiar" : "Clic para ordenar"}
          className={`inline-flex items-center gap-1 uppercase transition-colors ${active ? "text-primary font-semibold" : def ? "text-foreground/70" : "hover:text-foreground"}`}
        >
          {children}
          <span className={`text-[10px] ${active ? "opacity-100" : def ? "opacity-70" : "opacity-30"}`}>{icon}</span>
        </button>
      </th>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Solicitudes</h1>
          <p className="text-sm text-muted-foreground">Recepción de solicitudes de importación.</p>
        </div>
        <Button asChild><Link to="/solicitudes/nueva"><Plus className="h-4 w-4 mr-1" />Nueva solicitud</Link></Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <CardTitle className="text-base flex-1">{filtered.length} solicitudes</CardTitle>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos los estados</SelectItem>
              {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/30">
              <tr>
                <Th k="numero" className="px-4 py-2">Número</Th>
                <Th k="cliente">Cliente</Th>
                <Th k="tipo_operacion">Tipo</Th>
                <Th k="origen">Origen</Th>
                <Th k="fecha_arribo_est">Arribo</Th>
                <Th k="prioridad">Prioridad</Th>
                <Th k="estado">Estado</Th>
                <Th k="created_at">Registrado</Th>
                <th className="text-right px-4 py-2 text-xs uppercase text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s: any) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">
                    <Link to="/solicitudes/$id" params={{ id: s.id }} className="hover:underline text-primary">{s.numero}</Link>
                  </td>
                  <td>{s.clientes?.nombre ?? "—"}</td>
                  <td className="text-muted-foreground">{s.tipo_operacion ?? "—"}</td>
                  <td>{s.origen ?? "—"}</td>
                  <td>{s.fecha_arribo_est ? new Date(s.fecha_arribo_est).toLocaleDateString("es-DO") : "—"}</td>
                  <td><Badge className="bg-muted text-muted-foreground border-transparent">{s.prioridad}</Badge></td>
                  <td><Badge className="bg-primary/10 text-primary border-transparent">{s.estado?.replace("_", " ")}</Badge></td>
                  <td className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString("es-DO")}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <WhatsAppButton
                      phone={s.clientes?.telefono}
                      clientName={s.clientes?.nombre}
                      recordType="Solicitud"
                      recordNumber={s.numero}
                      variant="icon"
                    />
                    <EmailButton
                      email={(s.clientes as any)?.email}
                      clientName={s.clientes?.nombre}
                      recordType="Solicitud"
                      recordNumber={s.numero}
                      variant="icon"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setToTrash({ id: s.id, numero: s.numero })}
                      title="Mover a la papelera"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Sin solicitudes.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AlertDialog open={!!toTrash} onOpenChange={(o) => !o && setToTrash(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover a la papelera</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas mover la solicitud <strong>{toTrash?.numero}</strong> a la papelera?
              Podrás restaurarla desde <em>Papelera</em>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trashMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={trashMut.isPending}
              onClick={(ev) => { ev.preventDefault(); if (toTrash) trashMut.mutate(toTrash.id); }}
            >
              {trashMut.isPending ? "Moviendo…" : "Mover a papelera"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
