// Papelera de documentos del Expediente: «Eliminar» envía el documento (ficha, versiones y archivo) a la
// Papelera con línea en Auditoría y motivo opcional; se restaura durante 30 días y solo el Administrador
// lo borra definitivamente. Los permisos y la Auditoría los aplica la base de datos.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentoPreviewButton } from "@/components/documento-preview-dialog";
import { useNombresUsuarios } from "@/components/documento-historial";
import { useMyRoles } from "@/lib/auth-hooks";
import { nombreArchivo } from "@/lib/codigo-siga";
import { fmtFechaHora } from "@/lib/documento-versiones";
import { DIAS_RESTAURACION, diasParaRestaurar, puedeRestaurar, restaurableHasta } from "@/lib/documentos-papelera";

type DocEliminable = { id: string; tipo: string; codigo_siga?: string | null; storage_path?: string | null };
type FilaPapelera = {
  id: string; documento_id: string; expediente_id: string; tipo: string; codigo_siga: string | null; storage_path: string | null;
  motivo: string | null; eliminado_por: string | null; eliminado_en: string; versiones: unknown;
  expedientes?: { numero: string | null } | null;
};

const mensaje = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e));

function useInvalidarDocumentos(expedienteId?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["documentos-papelera"] });
    if (expedienteId) {
      qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
      qc.invalidateQueries({ queryKey: ["auditoria", expedienteId] });
      qc.invalidateQueries({ queryKey: ["expediente", expedienteId] });
    } else {
      qc.invalidateQueries({ queryKey: ["documentos"] });
      qc.invalidateQueries({ queryKey: ["auditoria"] });
    }
  };
}

/** Confirmación antes de eliminar: el documento va a la Papelera, con motivo opcional. */
export function EnviarPapeleraDialog({ expedienteId, doc, onClose }: { expedienteId: string; doc: DocEliminable | null; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const invalidar = useInvalidarDocumentos(expedienteId);
  const cerrar = () => { if (!enviando) { setMotivo(""); onClose(); } };
  const enviar = async () => {
    if (!doc) return;
    setEnviando(true);
    try {
      const { error } = await supabase.rpc("documento_enviar_papelera", { _documento_id: doc.id, _motivo: motivo.trim() || undefined });
      if (error) throw error;
      toast.success(`Documento enviado a la Papelera. Puedes restaurarlo durante ${DIAS_RESTAURACION} días.`);
      invalidar();
      setMotivo(""); onClose();
    } catch (e) {
      toast.error(`No se pudo eliminar: ${mensaje(e)}`);
    } finally { setEnviando(false); }
  };
  const archivo = doc?.storage_path ? nombreArchivo(doc.storage_path) : "(sin archivo)";
  return (
    <Dialog open={!!doc} onOpenChange={(o) => { if (!o) cerrar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>¿Eliminar este documento?</DialogTitle>
          <DialogDescription>
            Se enviará a la Papelera con su archivo y su historial de versiones. Podrás restaurarlo durante {DIAS_RESTAURACION} días; solo el Administrador puede borrarlo definitivamente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1 rounded-md border bg-muted/30 p-2 text-[13px]">
          <div><span className="text-muted-foreground">Tipo:</span> {doc?.tipo}{doc?.codigo_siga ? ` (${doc.codigo_siga})` : ""}</div>
          <div className="break-all"><span className="text-muted-foreground">Archivo:</span> {archivo}</div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="motivo-papelera">Motivo (opcional)</Label>
          <Textarea id="motivo-papelera" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se subió en la casilla equivocada" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar} disabled={enviando}>Cancelar</Button>
          <Button variant="destructive" onClick={enviar} disabled={enviando}><Trash2 className="mr-1 h-4 w-4" />{enviando ? "Enviando…" : "Enviar a la Papelera"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lista de documentos en la Papelera (de un Expediente o de todos), con Restaurar y Borrar definitivamente. */
export function TablaPapeleraDocumentos({ expedienteId }: { expedienteId?: string }) {
  const { data: roles } = useMyRoles();
  const isAdmin = !!roles?.includes("admin");
  const invalidar = useInvalidarDocumentos(expedienteId);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aBorrar, setABorrar] = useState<FilaPapelera | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const { data: filas = [], isLoading } = useQuery({
    queryKey: ["documentos-papelera", expedienteId ?? "todos"],
    queryFn: async () => {
      let q = supabase.from("documentos_papelera").select("id, documento_id, expediente_id, tipo, codigo_siga, storage_path, motivo, eliminado_por, eliminado_en, versiones, expedientes(numero)").order("eliminado_en", { ascending: false });
      if (expedienteId) q = q.eq("expediente_id", expedienteId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FilaPapelera[];
    },
  });
  const nombres = useNombresUsuarios(filas.map((f) => f.eliminado_por));

  const restaurar = async (f: FilaPapelera) => {
    setOcupado(f.id);
    try {
      const { error } = await supabase.rpc("documento_restaurar_papelera", { _papelera_id: f.id });
      if (error) throw error;
      toast.success("Documento restaurado en su casilla del Expediente.");
      invalidar();
      if (!expedienteId) invalidarExp(f.expediente_id);
    } catch (e) { toast.error(`No se pudo restaurar: ${mensaje(e)}`); } finally { setOcupado(null); }
  };
  const qc = useQueryClient();
  const invalidarExp = (id: string) => {
    qc.invalidateQueries({ queryKey: ["documentos", id] });
    qc.invalidateQueries({ queryKey: ["auditoria", id] });
  };
  const borrar = async () => {
    const f = aBorrar; if (!f || confirmText !== "ELIMINAR") return;
    setOcupado(f.id);
    try {
      const { data: rutas, error } = await supabase.rpc("documento_purgar_papelera", { _papelera_id: f.id });
      if (error) throw error;
      const lista = (rutas ?? []) as string[];
      if (lista.length) {
        const { error: se } = await supabase.storage.from("documentos").remove(lista);
        if (se) toast.warning(`El documento se borró, pero no se pudo quitar su archivo: ${se.message}`, { duration: 10000 });
      }
      toast.success("Documento borrado definitivamente.");
      setABorrar(null); setConfirmText("");
      invalidar();
    } catch (e) { toast.error(`No se pudo borrar: ${mensaje(e)}`); } finally { setOcupado(null); }
  };

  if (isLoading) return <div className="px-4 py-6 text-center text-sm text-muted-foreground">Cargando…</div>;
  if (!filas.length) return <div className="px-4 py-6 text-center text-sm text-muted-foreground">No hay documentos en la Papelera.</div>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-[12px]">
          <thead className="border-b bg-muted/20 text-[11px] text-muted-foreground">
            <tr>
              {!expedienteId && <th className="px-3 py-1.5 text-left">Expediente</th>}
              <th className="px-3 py-1.5 text-left">Documento</th>
              <th className="text-left">Eliminado</th>
              <th className="text-left">Motivo</th>
              <th className="text-left">Restaurable</th>
              <th className="px-3 py-1.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const vigente = puedeRestaurar(f.eliminado_en);
              const dias = diasParaRestaurar(f.eliminado_en);
              const nVers = Array.isArray(f.versiones) ? f.versiones.length : 0;
              return (
                <tr key={f.id} className="border-b align-top last:border-0">
                  {!expedienteId && (
                    <td className="px-3 py-1.5">
                      <Link to="/expedientes/$id" params={{ id: f.expediente_id }} className="expediente-numero hover:underline">{f.expedientes?.numero ?? "—"}</Link>
                    </td>
                  )}
                  <td className="px-3 py-1.5 min-w-0">
                    <div className="font-medium">{f.tipo}{f.codigo_siga ? <span className="ml-1 font-mono text-[11px] text-primary">{f.codigo_siga}</span> : null}</div>
                    <div className="break-all text-muted-foreground">{f.storage_path ? nombreArchivo(f.storage_path) : "(sin archivo)"}</div>
                    {nVers > 0 && <div className="text-[11px] text-muted-foreground">{nVers} versión(es) anterior(es) incluidas</div>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-2">
                    <div>{fmtFechaHora(f.eliminado_en)}</div>
                    <div className="text-[11px] text-muted-foreground">{f.eliminado_por ? nombres[f.eliminado_por] ?? "Usuario" : "—"}</div>
                  </td>
                  <td className="max-w-[16rem] whitespace-normal break-words py-1.5 pr-2">{f.motivo || <span className="text-muted-foreground">—</span>}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2">
                    {vigente
                      ? <span title={`Hasta ${fmtFechaHora(restaurableHasta(f.eliminado_en).toISOString())}`}>{dias > 1 ? `${dias} días` : "Último día"}</span>
                      : <span className="text-destructive">Vencido</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    {f.storage_path && <DocumentoPreviewButton path={f.storage_path} variant="ghost" size="sm" label="Ver" />}
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" disabled={!vigente || ocupado === f.id} onClick={() => restaurar(f)}
                      title={vigente ? "Volver a ponerlo en su casilla" : `Pasaron más de ${DIAS_RESTAURACION} días: solo el Administrador puede borrarlo`}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />Restaurar
                    </Button>
                    {isAdmin && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-destructive hover:text-destructive" disabled={ocupado === f.id}
                        onClick={() => { setABorrar(f); setConfirmText(""); }}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />Borrar definitivamente
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Dialog open={!!aBorrar} onOpenChange={(o) => { if (!o && !ocupado) { setABorrar(null); setConfirmText(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Borrar definitivamente</DialogTitle>
            <DialogDescription>
              Esta acción es irreversible: se borrará «{aBorrar?.storage_path ? nombreArchivo(aBorrar.storage_path) : aBorrar?.tipo}» y sus versiones anteriores. Quedará una línea en Auditoría.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="confirmar-borrado">Escribe ELIMINAR para confirmar</Label>
            <Input id="confirmar-borrado" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setABorrar(null); setConfirmText(""); }} disabled={!!ocupado}>Cancelar</Button>
            <Button variant="destructive" onClick={borrar} disabled={confirmText !== "ELIMINAR" || !!ocupado}>{ocupado ? "Borrando…" : "Borrar definitivamente"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Botón «Papelera (n)» de la ficha Documentos: solo aparece si hay documentos eliminados en el Expediente. */
export function PapeleraDocumentosButton({ expedienteId }: { expedienteId: string }) {
  const [open, setOpen] = useState(false);
  const { data: total = 0 } = useQuery({
    queryKey: ["documentos-papelera", expedienteId, "total"],
    queryFn: async () => {
      const { count } = await supabase.from("documentos_papelera").select("id", { count: "exact", head: true }).eq("expediente_id", expedienteId);
      return count ?? 0;
    },
  });
  if (!total && !open) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Trash2 className="mr-1 h-4 w-4" />Papelera ({total})</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Papelera de documentos</DialogTitle>
            <DialogDescription>Documentos eliminados de este Expediente. Se pueden restaurar durante {DIAS_RESTAURACION} días.</DialogDescription>
          </DialogHeader>
          <TablaPapeleraDocumentos expedienteId={expedienteId} />
        </DialogContent>
      </Dialog>
    </>
  );
}
