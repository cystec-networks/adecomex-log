import { supabase } from "@/integrations/supabase/client";
import { TIPO_CERTIFICADO_DGA } from "./certificado-origen-dga";

export type PrefijoSiga = "FAC" | "DOE" | "CEO" | "PER" | "OTD";

export function prefijoSiga(tipo: string | null | undefined): PrefijoSiga {
  switch (tipo) {
    case "Factura comercial": return "FAC";
    case "Bill of Lading": case "Guía aérea": return "DOE";
    case "Certificado de origen": case TIPO_CERTIFICADO_DGA: return "CEO";
    case "Certificado Sanitario/Fitosanitario": case "Certificado sanitario": case "Certificado fitosanitario":
    case "Certificado de análisis": case "Permiso VUCE previo": return "PER";
    default: return "OTD";
  }
}

const KEYWORDS: Record<string, string[]> = {
  "Factura comercial": ["factura comercial", "commercial invoice", "invoice", "factura"],
  "Bill of Lading": ["bill of lading", "conocimiento de embarque", "airway bill", "air waybill", "carta de porte", "b/l"],
  "Guía aérea": ["airway bill", "air waybill", "awb", "guia aerea"],
  "Certificado de origen": ["certificate of origin", "certificado de origen", "origin"],
  "Certificado Sanitario/Fitosanitario": ["sanitario", "sanitary", "health certificate", "salud", "fitosanitario", "phytosanitary"],
  "Certificado de análisis": ["analisis", "analysis", "certificate of analysis", "laboratorio", "laboratory"],
  "Permiso VUCE previo": ["vuce", "permiso", "autorizacion"],
  "Lista de empaque": ["packing list", "lista de empaque", "packing"],
};

export const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

const PREFIJOS: PrefijoSiga[] = ["FAC", "DOE", "CEO", "PER", "OTD"];

/** Tipos que admiten DOS prefijos SIGA válidos: cualquiera de los dos es correcto. */
const PREFIJOS_ALT: Record<string, PrefijoSiga[]> = {
  "Permiso VUCE previo": ["PER", "OTD"],
  "Certificado Sanitario/Fitosanitario": ["PER", "OTD"],
  "Certificado sanitario": ["PER", "OTD"],
  "Certificado fitosanitario": ["PER", "OTD"],
  "Certificado de análisis": ["PER", "OTD"],
  [TIPO_CERTIFICADO_DGA]: ["CEO", "OTD"],
};

/** Prefijos SIGA aceptados para un tipo de documento (uno, o dos en los tres tipos indicados). */
export function prefijosAceptados(tipo: string | null | undefined): PrefijoSiga[] {
  return PREFIJOS_ALT[tipo ?? ""] ?? [prefijoSiga(tipo)];
}

const listarPrefijos = (ps: PrefijoSiga[]) =>
  ps.length === 1 ? `${ps[0]}-` : `${ps.slice(0, -1).join(", ")}- u ${ps[ps.length - 1]}-`;

/** Valida el nombre del archivo contra los prefijos SIGA esperados (uno o dos). */
export function validarNombreSiga(nombre: string, esperado: PrefijoSiga | PrefijoSiga[]):
  { ok: true; advertencia?: string } | { ok: false; error: string } {
  const aceptados = Array.isArray(esperado) ? esperado : [esperado];
  const n = nombre.toUpperCase();
  if (aceptados.some((p) => n.includes(`${p}-`))) return { ok: true };
  if (PREFIJOS.some((p) => n.includes(`${p}-`)))
    return { ok: false, error: `El nombre del archivo no corresponde al tipo de documento esperado (se espera prefijo ${listarPrefijos(aceptados)}). Verifica que estás subiendo el documento correcto.` };
  return { ok: true, advertencia: "Este archivo no tiene el prefijo de codificación SIGA (FAC-, DOE-, CEO-, PER-, OTD-). Se recomienda renombrarlo antes de subirlo a SIGA." };
}

/** Nombre original del archivo a partir de la ruta guardada. */
export function nombreArchivo(path: string | null | undefined): string {
  if (!path) return "";
  const base = path.split("/").pop() ?? "";
  return base.replace(/^\d{10,}_/, "").replace(/^[0-9a-f-]{36}-/i, "");
}
