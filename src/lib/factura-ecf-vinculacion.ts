import { supabase } from "@/integrations/supabase/client";

/** Crea o actualiza un renglón de "Facturación (cobros)" por cada línea de la e-CF vinculada.
 *  No sobrescribe renglones editados a mano; no duplica (empareja por línea e-CF). */
export async function sincronizarCobroDesdeEcf(expedienteId: string, fid: string | null, prevFid: string | null): Promise<string | null> {
  if (!fid) return null;
  const { data: ecf } = await supabase.from("facturas_ecf").select("id,encf,fecha_emision,monto_total").eq("id", fid).maybeSingle();
  if (!ecf) return null;
  const { data: lineasDb } = await supabase.from("facturas_ecf_lineas").select("id,orden,descripcion,valor,itbis,gravado").eq("factura_id", fid).order("orden");
  const lineas: any[] = (lineasDb ?? []).length
    ? lineasDb ?? []
    : [{ id: null, descripcion: "Gestión aduanal", valor: Number(ecf.monto_total || 0), itbis: 0, gravado: null }];
  const ids = [fid, prevFid].filter(Boolean) as string[];
  const { data: filasDb } = await supabase.from("facturas").select("id,editada_manual,factura_ecf_id,ecf_linea_id,referencia")
    .eq("expediente_id", expedienteId).is("deleted_at", null);
  const candidatas = (filasDb ?? []).filter((r: any) => (r.factura_ecf_id && ids.includes(r.factura_ecf_id)) || (!r.factura_ecf_id && ecf.encf && r.referencia === ecf.encf)) as any[];
  const usadas = new Set<string>();
  let creadas = 0, actualizadas = 0, conservadas = 0;
  for (const l of lineas) {
    let fila = l.id ? candidatas.find((r) => r.ecf_linea_id === l.id) : undefined;
    if (!fila) fila = candidatas.find((r) => !usadas.has(r.id) && !r.editada_manual && (!r.ecf_linea_id || r.factura_ecf_id !== fid));
    const datos = {
      concepto: l.descripcion?.trim() === "Servicios exentos" ? "Servicios de Transportes (exentos)" : (l.descripcion || "Gestión aduanal").trim(), referencia: ecf.encf ?? null, fecha_emision: ecf.fecha_emision ?? null,
      monto: Number(l.valor || 0), itbis: Number(l.itbis || 0), gravado: l.gravado, factura_ecf_id: ecf.id, ecf_linea_id: l.id,
    };
    if (fila) {
      usadas.add(fila.id);
      if (fila.editada_manual) { conservadas++; continue; }
      const { error } = await supabase.from("facturas").update(datos).eq("id", fila.id);
      if (error) throw error;
      actualizadas++;
    } else {
      const { error } = await supabase.from("facturas").insert({ expediente_id: expedienteId, estado: "pendiente", ...datos });
      if (error) throw error;
      creadas++;
    }
  }
  // Renglones automáticos sobrantes (de la e-CF anterior o de un total consolidado) que nadie editó.
  const sobrantes = candidatas.filter((r) => !usadas.has(r.id) && !r.editada_manual).map((r) => r.id);
  if (sobrantes.length) {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("facturas").update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id }).in("id", sobrantes);
  }
  if (!creadas && !sobrantes.length && !actualizadas) return conservadas ? "renglones editados a mano se conservaron" : null;
  const partes = [creadas && `${creadas} creados`, actualizadas && `${actualizadas} actualizados`, conservadas && `${conservadas} conservados`].filter(Boolean);
  return `renglones de cobro: ${partes.join(", ")}`;
}

