import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useGmailAuthuser } from "@/lib/system-settings";
import { PAQUETE_TIPO_DOCUMENTO } from "@/components/paquete-rectificacion-button";

export const DGA_CORREO = "info.correspondenciayarchivo@aduanas.gob.do";
const ACCION = "correo_dga_preparado";

const limpiarNombre = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_+|_+$/g, "");

export function CorreoDgaButton({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const { authuser } = useGmailAuthuser();
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: ultimo } = useQuery({
    queryKey: ["auditoria", ACCION, expedienteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("auditoria")
        .select("created_at, cambios")
        .eq("entidad", "expedientes")
        .eq("entidad_id", expedienteId)
        .eq("accion", ACCION)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const preparar = async () => {
    // Abrir la pestaña de inmediato para que el navegador no la bloquee.
    const win = window.open("about:blank", "_blank");
    setCargando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const [expRes, docRes, profRes, itemsRes] = await Promise.all([
        supabase.from("expedientes").select("*, clientes(nombre)").eq("id", expedienteId).maybeSingle(),
        supabase.from("documentos").select("storage_path, created_at").eq("expediente_id", expedienteId).eq("tipo", PAQUETE_TIPO_DOCUMENTO).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("profiles").select("nombre, firma_nombre, firma_cargo").eq("id", u.user!.id).maybeSingle(),
        supabase.from("mercancia_items").select("pais_origen").eq("expediente_id", expedienteId).is("deleted_at", null),
      ]);
      if (expRes.error) throw expRes.error;
      const e: any = expRes.data ?? {};
      if (!docRes.data?.storage_path) {
        throw new Error("Primero genera el Paquete Completo (PDF) con el botón \"Generar Paquete Completo (PDF)\".");
      }
      const consignatario = e.clientes?.nombre ?? "";
      const dua = e.numero_dua ?? "";
      const tramite = e.numero_tramite_rectificacion ?? "";
      const producto = (e.producto_correcto_rectificacion ?? "").trim();
      const peso = e.peso_neto != null ? Number(e.peso_neto).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
      const paises = [...new Set((itemsRes.data ?? []).map((i: any) => (i.pais_origen ?? "").trim()).filter(Boolean))];
      const pais = paises.join(", ") || e.pais_procedencia || e.pais_origen || "";
      const faltan = [!dua && "N.º DUA", !producto && "Producto correcto", !consignatario && "Consignatario"].filter(Boolean);
      if (faltan.length) throw new Error(`Faltan datos en el Expediente: ${faltan.join(", ")}.`);

      // 1. Descargar el paquete con nombre claro
      const { data: blob, error: dlErr } = await supabase.storage.from("documentos").download(docRes.data.storage_path);
      if (dlErr || !blob) throw new Error("No se pudo descargar el Paquete Completo");
      const archivo = `Oficio_RT_${limpiarNombre(tramite || e.numero || "")}_${limpiarNombre(consignatario)}.pdf`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = archivo;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);

      // 2. Borrador en Gmail
      const p = profRes.data as any;
      const firmaNombre = (p?.firma_nombre || p?.nombre || "").trim();
      const firmaCargo = (p?.firma_cargo ?? "").trim();
      const asunto = `Solicitud Oficio Rectificación Técnica - Dec. ${dua} - ${consignatario}`;
      const cuerpo = [
        "Buenas tardes Estimados.",
        "",
        `Favor procesar solicitud oficio de Rectificación Técnica de la Dec. ${dua}, para ${peso}Kgs de ${producto}, procedente de ${pais}, consignada a ${consignatario}.`,
        "",
        "Para tales fines anexamos toda la documentación requerida.",
        "",
        "Esperamos su confirmación de recibo.",
        "",
        "Saludos Cordiales,",
        "",
        firmaNombre,
        ...(firmaCargo ? [firmaCargo] : []),
        "SERVICIOS DE GESTIÓN Y LOGÍSTICA DE CARGAS",
      ].join("\n");
      const url =
        `https://mail.google.com/mail/u/${encodeURIComponent(authuser)}/?view=cm&fs=1` +
        `&to=${encodeURIComponent(DGA_CORREO)}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
      if (win) win.location.href = url;
      else window.open(url, "_blank");

      // 3. Bitácora
      await supabase.from("auditoria").insert({
        entidad: "expedientes",
        entidad_id: expedienteId,
        accion: ACCION,
        usuario_id: u.user!.id,
        cambios: { destinatario: DGA_CORREO, asunto, archivo, usuario: firmaNombre },
      });
      qc.invalidateQueries({ queryKey: ["auditoria", ACCION, expedienteId] });
      if (!p?.firma_nombre) toast.info("Configura tu firma de correo en Mi cuenta para que salga con tu nombre y cargo.");
      setAviso(archivo);
    } catch (err: any) {
      win?.close();
      toast.error(err?.message ?? "No se pudo preparar el correo", { duration: 10000 });
    } finally {
      setCargando(false);
    }
  };

  const c: any = ultimo?.cambios;
  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" size="sm" onClick={preparar} disabled={cargando}>
        {cargando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
        Preparar Correo a DGA
      </Button>
      {ultimo && (
        <span className="text-[11px] text-muted-foreground">
          Último envío preparado: {new Date(ultimo.created_at).toLocaleString("es-DO")}
          {c?.usuario ? ` por ${c.usuario}` : ""} → {c?.destinatario ?? DGA_CORREO}
        </span>
      )}
      <Dialog open={!!aviso} onOpenChange={(o) => !o && setAviso(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuerda adjuntar el archivo descargado antes de enviar.</DialogTitle>
            <DialogDescription>
              Se descargó <b>{aviso}</b> y se abrió el borrador en Gmail para {DGA_CORREO}. Adjunta el archivo y presiona Enviar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setAviso(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
