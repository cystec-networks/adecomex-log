import { supabase } from "@/integrations/supabase/client";

export type PrefijoSiga = "FAC" | "DOE" | "CEO" | "PER" | "OTD";

export function prefijoSiga(tipo: string | null | undefined): PrefijoSiga {
  switch (tipo) {
    case "Factura comercial": return "FAC";
    case "Bill of Lading": case "Guía aérea": return "DOE";
    case "Certificado de origen": return "CEO";
    case "Certificado sanitario": case "Certificado fitosanitario":
    case "Certificado de análisis": case "Permiso VUCE previo": return "PER";
    default: return "OTD";
  }
}

const KEYWORDS: Record<string, string[]> = {
  "Factura comercial": ["factura comercial", "commercial invoice", "invoice", "factura"],
  "Bill of Lading": ["bill of lading", "conocimiento de embarque", "airway bill", "air waybill", "carta de porte", "b/l"],
  "Guía aérea": ["airway bill", "air waybill", "awb", "guia aerea"],
  "Certificado de origen": ["certificate of origin", "certificado de origen", "origin"],
  "Certificado sanitario": ["sanitario", "sanitary", "health certificate", "salud"],
  "Certificado fitosanitario": ["fitosanitario", "phytosanitary"],
  "Certificado de análisis": ["analisis", "analysis", "certificate of analysis", "laboratorio", "laboratory"],
  "Permiso VUCE previo": ["vuce", "permiso", "autorizacion"],
  "Lista de empaque": ["packing list", "lista de empaque", "packing"],
};

export const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** null = no hay palabras clave definidas para el tipo (no se valida). */
export function coincideContenido(tipo: string, texto: string): boolean | null {
  const kws = KEYWORDS[tipo];
  if (!kws) return null;
  const t = normalizar(texto);
  return kws.some((k) => t.includes(normalizar(k)));
}

export async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Siguiente código consecutivo por Expediente y prefijo (documentos + permisos). */
export async function siguienteCodigoSiga(expedienteId: string, prefijo: PrefijoSiga): Promise<string> {
  const [d, p] = await Promise.all([
    supabase.from("documentos").select("codigo_siga").eq("expediente_id", expedienteId).like("codigo_siga", `${prefijo}-%`),
    prefijo === "PER"
      ? supabase.from("permisos").select("codigo_siga").eq("expediente_id", expedienteId).like("codigo_siga", "PER-%")
      : Promise.resolve({ data: [] as { codigo_siga: string | null }[] }),
  ]);
  const nums = [...(d.data ?? []), ...(p.data ?? [])]
    .map((r) => parseInt(String(r.codigo_siga ?? "").split("-")[1] ?? "", 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefijo}-${String(next).padStart(3, "0")}`;
}
