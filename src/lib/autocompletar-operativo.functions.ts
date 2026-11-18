// Lectura de UN BL/AWB o Factura comercial ya guardado, con el modelo económico.
// La usan la subida en un Expediente nuevo y el botón «Leer ahora» del documento (uno por uno).
// Solo guarda la lectura como «pendiente»: nada se escribe en el Expediente hasta la vista previa.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { fuenteOperativa, type LecturaOperativaGuardada } from "./autocompletar-operativo";
import { lecturaOperativaParaGuardar } from "./autocompletar-operativo-evaluar";

const mimeDe = (ruta: string): string => {
  const ext = ruta.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/pdf";
};

export const leerDocumentoOperativo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    documentoId: z.string().uuid(),
    origen: z.enum(["manual", "leer_ahora"]).default("leer_ahora"),
  }).parse(data))
  .handler(async ({ context, data }): Promise<{ datos: string; archivo: string; tipo: string; reutilizada: boolean }> => {
    const db = context.supabase;
    const { data: d, error } = await db.from("documentos")
      .select("id, expediente_id, tipo, storage_path, lectura_operativa").eq("id", data.documentoId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!d) throw new Error("Documento no encontrado o sin permiso.");
    const fuente = fuenteOperativa(d.tipo);
    if (!fuente) throw new Error(`El tipo «${d.tipo}» no autocompleta datos del Expediente.`);
    if (!d.storage_path) throw new Error("El documento no tiene archivo.");

    // Una sola lectura por versión del archivo: si ya existe, se reutiliza sin gastar IA.
    const previa = d.lectura_operativa as (LecturaOperativaGuardada & { estado?: string }) | null;
    if (previa?.archivo === d.storage_path && previa.datos && Object.keys(previa.datos).length) {
      return { datos: JSON.stringify(previa.datos), archivo: d.storage_path, tipo: d.tipo, reutilizada: true };
    }

    const { data: blob, error: de } = await db.storage.from("documentos").download(d.storage_path);
    if (de || !blob) throw new Error(`Archivo no disponible: ${de?.message ?? "sin contenido"}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

    const { leerDocumentoImportacion } = await import("./ai-ocr.server");
    const { MODELO_ECONOMICO } = await import("./ia-consumo");
    const res = await leerDocumentoImportacion({
      filename: d.storage_path.split("/").pop() ?? d.storage_path,
      mime: mimeDe(d.storage_path),
      base64: btoa(bin),
      ...(fuente === "factura" ? { lineas_factura: true } : {}),
      modelo: MODELO_ECONOMICO,
    });
    const vacia = { cambios: {}, completados: [], avisos: [], alertas: [], notas: [], coincidencias: [] };
    const lectura = lecturaOperativaParaGuardar({ datos: res as never, fuente, origen: data.origen, archivo: d.storage_path }, vacia);
    const { error: ue } = await db.from("documentos")
      .update({ lectura_operativa: { ...lectura, estado: "pendiente" } as never }).eq("id", d.id);
    if (ue) throw new Error(ue.message);
    return { datos: JSON.stringify(lectura.datos), archivo: d.storage_path, tipo: d.tipo, reutilizada: false };
  });
