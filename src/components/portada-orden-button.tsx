import { useState } from "react";
import { FileBadge, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export function PortadaOrdenButton({ ordenId, disabled = false }: { ordenId: string; disabled?: boolean }) {
  const [cargando, setCargando] = useState(false);
  const [archivo, setArchivo] = useState<{ blob: Blob; nombre: string } | null>(null);
  const generar = async () => {
    setCargando(true);
    try {
      const [{ data: auth, error: authError }, ordenRes, productosRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("ordenes").select("*, clientes(nombre,rnc)").eq("id", ordenId).single(),
        supabase.from("orden_productos").select("*").eq("orden_id", ordenId).is("deleted_at", null).order("item_no"),
      ]);
      if (authError) throw authError;
      if (!auth.user) throw new Error("Inicia sesión para generar la portada");
      if (ordenRes.error) throw ordenRes.error;
      if (productosRes.error) throw productosRes.error;
      const ids = [...new Set([auth.user.id, ordenRes.data.vendedor_id].filter((id): id is string => Boolean(id)))];
      const perfiles = await supabase.from("profiles").select("id,nombre").in("id", ids);
      if (perfiles.error) throw perfiles.error;
      const nombre = (id: string | null) => perfiles.data.find((p) => p.id === id)?.nombre ?? null;
      const { generarPortadaOrdenPdf } = await import("@/lib/pdf-portada-orden");
      const blob = await generarPortadaOrdenPdf({ orden: ordenRes.data, cliente: ordenRes.data.clientes,
        productos: productosRes.data, gestor: nombre(ordenRes.data.vendedor_id),
        usuario: nombre(auth.user.id) || auth.user.email || "—", generado: new Date() });
      setArchivo({ blob, nombre: `Portada Orden de Compra ${ordenRes.data.numero ?? ""}.pdf` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar la portada");
    } finally { setCargando(false); }
  };
  const descargar = async () => {
    if (!archivo) return;
    const file = new File([archivo.blob], archivo.nombre, { type: "application/pdf" });
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: archivo.nombre }); return; }
      catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(archivo.blob);
    const a = document.createElement("a"); a.href = url; a.download = archivo.nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  return <>
    <Button type="button" variant="outline" size="sm" onClick={generar} disabled={disabled || cargando} title={disabled ? "Guarda los cambios antes de generar la portada" : "Generar Portada de la Orden de Compra"}>
      {cargando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileBadge className="h-4 w-4 mr-1" />}Portada (PDF)
    </Button>
    <Dialog open={Boolean(archivo)} onOpenChange={(open) => { if (!open) setArchivo(null); }}>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Portada de la Orden de Compra</DialogTitle></DialogHeader>
        <p className="text-sm break-words">{archivo?.nombre}</p>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => setArchivo(null)}>Cerrar</Button><Button type="button" onClick={descargar}><Download className="h-4 w-4 mr-1" />Descargar PDF</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}