import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileStack, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { conConsignatarioEfectivo } from "@/lib/consignatario-efectivo";
import { generarPaqueteExclusivo, reemplazarPaquete } from "@/lib/paquete-rectificacion";
import { PAQUETE_FACTURA_CLIENTE, CORREO_CONTABILIDAD, FACTURA_PDF_OBLIGATORIA, fuentesFacturaCliente, combinarFacturaCliente, correoFacturaCliente } from "@/lib/paquete-factura-cliente";

async function facturaVinculada(expedienteId: string, facturaEcfId: string | null) {
  let fid = facturaEcfId;
  if (!fid) {
    const { data, error } = await supabase.from("facturas").select("factura_ecf_id").eq("expediente_id", expedienteId).is("deleted_at", null).neq("estado", "anulada").order("created_at", { ascending: false });
    if (error) throw error;
    fid = data?.find((f) => f.factura_ecf_id)?.factura_ecf_id ?? null;
  }
  if (!fid) return null;
  const { data, error } = await supabase.from("facturas_ecf").select("pdf_url, encf").eq("id", fid).is("eliminado_en", null).maybeSingle();
  if (error) throw error;
  return data;
}

export function PaqueteFacturaCliente({ expedienteId, menu = false }: { expedienteId: string; menu?: boolean }) {
  const qc = useQueryClient();
  const [cargando, setCargando] = useState(false);
  const [correoCargando, setCorreoCargando] = useState(false);
  const [resultado, setResultado] = useState<{ faltantes: string[]; generado: boolean } | null>(null);
  const [avisoCorreo, setAvisoCorreo] = useState(false);

  const generar = async () => {
    setCargando(true);
    try {
      await generarPaqueteExclusivo(`factura-cliente:${expedienteId}`, async () => {
        const [expRes, docsRes] = await Promise.all([
          supabase.from("expedientes").select("numero, factura_ecf_id").eq("id", expedienteId).single(),
          supabase.from("documentos").select("tipo, storage_path").eq("expediente_id", expedienteId).order("created_at", { ascending: false }),
        ]);
        if (expRes.error) throw expRes.error;
        if (docsRes.error) throw docsRes.error;
        const factura = await facturaVinculada(expedienteId, expRes.data.factura_ecf_id);
        if (!factura?.pdf_url?.trim()) throw new Error(FACTURA_PDF_OBLIGATORIA);
        const combinado = await combinarFacturaCliente(fuentesFacturaCliente(docsRes.data ?? [], factura.pdf_url), async (ruta) => {
          const { data, error } = await supabase.storage.from("documentos").download(ruta);
          if (error || !data) throw error ?? new Error("Archivo no disponible");
          return data.arrayBuffer();
        });
        if (!combinado.bytes) { setResultado({ faltantes: combinado.faltantes, generado: false }); return; }
        const nombre = `Paquete_Envio_Factura_Cliente_${expRes.data.numero}.pdf`;
        const path = `${expedienteId}/${Date.now()}_${nombre}`;
        const blob = new Blob([combinado.bytes as BlobPart], { type: "application/pdf" });
        const { error: uploadError } = await supabase.storage.from("documentos").upload(path, blob, { contentType: "application/pdf" });
        if (uploadError) throw uploadError;
        const registro = {
          expediente_id: expedienteId, tipo: PAQUETE_FACTURA_CLIENTE, storage_path: path,
          estado: "recibido" as const, file_hash: null,
          fecha_recepcion: new Date().toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" }),
          observaciones: `${combinado.incluidos.length} documentos${combinado.faltantes.length ? ` · Pendientes: ${combinado.faltantes.join(", ")}` : ""}`,
        };
        await reemplazarPaquete({
          listar: async () => {
            const { data, error } = await supabase.from("documentos").select("id, storage_path").eq("expediente_id", expedienteId).eq("tipo", PAQUETE_FACTURA_CLIENTE).order("created_at", { ascending: false }).order("id");
            if (error) throw error;
            return data ?? [];
          },
          actualizar: async (id) => {
            const { error } = await supabase.from("documentos").update(registro).eq("id", id).eq("expediente_id", expedienteId).eq("tipo", PAQUETE_FACTURA_CLIENTE);
            if (error) throw error;
          },
          insertar: async () => {
            const { error } = await supabase.from("documentos").insert(registro);
            if (error) throw error;
          },
          eliminarDuplicados: async (ids) => {
            const { error } = await supabase.from("documentos").delete().in("id", ids).eq("expediente_id", expedienteId).eq("tipo", PAQUETE_FACTURA_CLIENTE);
            if (error) throw error;
          },
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = nombre; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        if (combinado.faltantes.length) setResultado({ faltantes: combinado.faltantes, generado: true });
        else toast.success("Paquete completo generado y guardado en Documentos");
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el paquete", { duration: 10000 });
    } finally {
      qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
      setCargando(false);
    }
  };

  const preparar = async () => {
    const win = window.open("about:blank", "_blank");
    setCorreoCargando(true);
    try {
      const [expRes, paqueteRes] = await Promise.all([
        supabase.from("expedientes").select("id, numero, factura_ecf_id, clientes(*)").eq("id", expedienteId).single(),
        supabase.from("documentos").select("storage_path").eq("expediente_id", expedienteId).eq("tipo", PAQUETE_FACTURA_CLIENTE).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (expRes.error) throw expRes.error;
      if (paqueteRes.error) throw paqueteRes.error;
      if (!paqueteRes.data?.storage_path) throw new Error("Primero genera el paquete de Factura Cliente.");
      const exp = await conConsignatarioEfectivo(expRes.data);
      const factura = await facturaVinculada(expedienteId, expRes.data.factura_ecf_id);
      const url = correoFacturaCliente(exp.numero, exp.clientes ?? {}, factura?.encf ?? "");
      if (win) win.location.href = url;
      else window.open(url, "_blank");
      setAvisoCorreo(true);
    } catch (error: unknown) {
      win?.close();
      toast.error(error instanceof Error ? error.message : "No se pudo preparar el correo");
    } finally { setCorreoCargando(false); }
  };

  return (
    <>
      {menu ? (
        <>
          <DropdownMenuItem disabled={cargando} onSelect={(event) => { event.preventDefault(); void generar(); }}>
            {cargando ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <FileStack className="h-4 w-4 shrink-0" />}
            <span>Generar Paquete Completo Factura Cliente (PDF)</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={correoCargando || cargando} onSelect={(event) => { event.preventDefault(); void preparar(); }}>
            {correoCargando ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Send className="h-4 w-4 shrink-0" />}
            <span>Preparar Correo Factura Cliente</span>
          </DropdownMenuItem>
        </>
      ) : <div className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
        <span className="text-sm font-medium">{PAQUETE_FACTURA_CLIENTE}</span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={cargando} onClick={generar}>
            {cargando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileStack className="mr-1 h-4 w-4" />}Generar paquete completo
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={correoCargando || cargando} onClick={preparar}>
            {correoCargando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Preparar para enviar
          </Button>
        </div>
      </div>}
      <Dialog open={!!resultado} onOpenChange={(o) => { if (!o) setResultado(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resultado?.generado ? "Paquete generado con documentos pendientes" : "No hay documentos disponibles"}</DialogTitle>
            <DialogDescription>{resultado?.generado ? "El paquete se guardó y descargó con los documentos disponibles. Faltan los siguientes:" : "Carga al menos un PDF para generar el paquete. Faltan los siguientes:"}</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">{resultado?.faltantes.map((f) => <li key={f}>{f}</li>)}</ul>
          <DialogFooter><Button onClick={() => setResultado(null)}>Entendido</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={avisoCorreo} onOpenChange={setAvisoCorreo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjunta el paquete descargado</DialogTitle>
            <DialogDescription>Se solicitó abrir Gmail con {CORREO_CONTABILIDAD}. Esa cuenta debe estar iniciada o autorizada como remitente en Gmail; comprueba el campo De antes de enviar. Adjunta manualmente el paquete que ya descargaste.</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={() => setAvisoCorreo(false)}>Entendido</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}