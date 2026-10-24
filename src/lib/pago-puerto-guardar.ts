import { supabase } from "@/integrations/supabase/client";
import { sha256File, siguienteCodigoSiga, validarNombreSiga } from "./codigo-siga";
import { hoyRDISO } from "./dates";
import { documentoPagoPuerto, guardarPagoExclusivo, validarPagoPuerto, type TipoPagoPuerto } from "./pago-puerto";

export type BorradorPagoPuerto = { tipo: TipoPagoPuerto | ""; monto: string; moneda: string; fecha: string; referencia: string; concepto: string };
export async function guardarComprobantePuerto(expedienteId: string, file: File, borrador: BorradorPagoPuerto, duplicadoConfirmado = false) {
  validarPagoPuerto(borrador);
  const tipoPago = borrador.tipo;
  if (!tipoPago) throw new Error("Selecciona el tipo de pago.");
  if (!borrador.concepto.trim()) throw new Error("Confirma el concepto del costo.");
  const nombre = validarNombreSiga(file.name, "OTD");
  if (!nombre.ok) throw new Error(nombre.error);
  return guardarPagoExclusivo(expedienteId, async () => {
    const tipo = documentoPagoPuerto(tipoPago);
    const { data: docs, error: lectura } = await supabase.from("documentos").select("*").eq("expediente_id", expedienteId).order("created_at", { ascending: false });
    if (lectura) throw lectura;
    const hash = await sha256File(file);
    const duplicado = docs?.find((d) => d.file_hash === hash && d.tipo !== tipo);
    if (duplicado && !duplicadoConfirmado) throw new Error(`El archivo ya está cargado como ${duplicado.tipo}. Confirma que también corresponde a este pago.`);
    const existentes = (docs ?? []).filter((d) => d.tipo === tipo);
    const anterior = existentes[0];
    const codigo = anterior?.codigo_siga ?? await siguienteCodigoSiga(expedienteId, "OTD");
    const marcador = `Documento SIGA: ${codigo}`;
    const observaciones = [borrador.fecha && `Fecha de pago: ${borrador.fecha}`, borrador.referencia && `PIN/Referencia: ${borrador.referencia}`, marcador].filter(Boolean).join(" · ");
    const path = `${expedienteId}/${crypto.randomUUID()}_${file.name}`;
    const { error: upload } = await supabase.storage.from("documentos").upload(path, file, { contentType: "application/pdf" });
    if (upload) throw upload;
    let documentoId = anterior?.id;
    try {
      const payload = { storage_path: path, file_hash: hash, codigo_siga: codigo, estado: "recibido" as const, fecha_recepcion: anterior?.fecha_recepcion ?? hoyRDISO() };
      if (anterior) {
        const { error } = await supabase.from("documentos").update(payload).eq("id", anterior.id).eq("expediente_id", expedienteId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("documentos").insert({ expediente_id: expedienteId, tipo, ...payload }).select("id").single();
        if (error) throw error;
        documentoId = data.id;
      }
      try {
        const { data: costos, error: lecturaCosto } = await supabase.from("costos_producto").select("id,observaciones").eq("expediente_id", expedienteId);
        if (lecturaCosto) throw lecturaCosto;
        const previo = costos?.find((c) => c.observaciones?.split(" · ").includes(marcador));
        const costo = { concepto: borrador.concepto.trim(), monto_real: Number(borrador.monto), moneda: borrador.moneda, observaciones };
        const { error } = previo
          ? await supabase.from("costos_producto").update(costo).eq("id", previo.id).eq("expediente_id", expedienteId)
          : await supabase.from("costos_producto").insert({ expediente_id: expedienteId, ...costo });
        if (error) throw error;
      } catch (error) {
        const rollback = anterior
          ? await supabase.from("documentos").update({ storage_path: anterior.storage_path, file_hash: anterior.file_hash, codigo_siga: anterior.codigo_siga, estado: anterior.estado, fecha_recepcion: anterior.fecha_recepcion }).eq("id", anterior.id)
          : documentoId ? await supabase.from("documentos").delete().eq("id", documentoId) : null;
        if (rollback?.error) throw new Error("No se guardó el costo; el PDF sí quedó recibido. Revisa Documentos antes de volver a guardar.");
        await supabase.storage.from("documentos").remove([path]);
        throw error;
      }
    } catch (error) {
      // No retirar un PDF que permanezca referenciado si la compensación falló.
      const { data: referencia } = await supabase.from("documentos").select("id").eq("storage_path", path).limit(1);
      if (referencia?.length === 0) await supabase.storage.from("documentos").remove([path]);
      throw error;
    }
    const sobrantes = existentes.slice(1);
    let aviso: string | undefined;
    if (sobrantes.length) {
      const { error } = await supabase.from("documentos").delete().in("id", sobrantes.map((d) => d.id)).eq("expediente_id", expedienteId);
      if (error) aviso = "Pago guardado; no se pudieron retirar documentos duplicados anteriores. Revisa la casilla en Documentos.";
    }
    const antiguos = (aviso ? existentes.slice(0, 1) : existentes).map((d) => d.storage_path).filter((p): p is string => Boolean(p) && p !== path);
    if (antiguos.length) await supabase.storage.from("documentos").remove(antiguos);
    return { codigo, aviso, advertencia: nombre.advertencia };
  });
}