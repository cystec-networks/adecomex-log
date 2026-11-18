// Evaluación y aplicación compartidas: la subida manual (cliente, RLS) y el correo (servicio)
// usan el mismo criterio. Recibe el cliente de base de datos para no importar ninguno.
import {
  decidirAutocompletadoOperativo,
  fuenteOperativa,
  type DecisionOperativa,
  type FuenteOperativa,
  type LecturaOperativaGuardada,
  type LineaComparables,
} from "./autocompletar-operativo";
import { alertasBlContraFactura, alertasFacturaContraOrden, notasBlContraFactura, notasFacturaContraOrden } from "./autocompletar-operativo";
import { nombreBaseCliente } from "./cliente-documento";
import type { OcrExtraction } from "./ai-ocr.functions";

type Db = any;
type Datos = Partial<OcrExtraction> & Record<string, unknown>;

export type ValidacionOperativa = { ok: boolean; errores: string[]; avisos: string[] };

export type EvaluacionOperativa = {
  actual: Record<string, unknown>;
  validacion: ValidacionOperativa;
  decision: DecisionOperativa;
  fuente: FuenteOperativa;
  consignatarioCoincide: boolean;
};

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const normalizarBl = (v: unknown) => (texto(v) ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Mismo criterio que el catálogo: base del nombre sin sufijos legales. */
function consignatarioCoincide(conDocumento: string | null, conocidos: (string | null)[]): boolean {
  const base = conDocumento ? nombreBaseCliente(conDocumento) : null;
  if (!base) return false;
  return conocidos.some((n) => n && nombreBaseCliente(n) === base);
}

/** Catálogos DGA resueltos una sola vez por corrida (el lote evalúa muchos Expedientes). */
export type CatalogoOperativoCache = {
  paises?: Array<{ codigo: string; pais: string }>;
  res: Map<string, { nombre: string | null; codigo: string | null }>;
};

async function resolverCatalogo(
  db: Db, tabla: "dga_paises" | "dga_puertos", campo: "pais" | "puerto", valor: string | null,
  cache?: CatalogoOperativoCache,
) {
  if (!valor) return { nombre: null as string | null, codigo: null as string | null };
  const clave = `${tabla}|${campo}|${valor.toUpperCase()}`;
  if (cache?.res.has(clave)) return cache.res.get(clave)!;
  let salida: { nombre: string | null; codigo: string | null };
  if (tabla === "dga_paises") {
    if (!cache?.paises) {
      const { data } = await db.from("dga_paises").select("codigo, pais");
      if (cache) cache.paises = data ?? [];
    }
    const { resolverPaisDocumento } = await import("./pais-documento");
    salida = resolverPaisDocumento(valor, cache?.paises ?? []);
  } else {
    const { data } = await db.from(tabla).select(`codigo, ${campo}`).ilike(campo, `%${valor}%`).limit(1).maybeSingle();
    salida = data ? { nombre: data[campo] as string, codigo: data.codigo as string } : { nombre: valor, codigo: null };
  }
  cache?.res.set(clave, salida);
  return salida;
}

/**
 * Lee el Expediente, valida contra el documento y decide qué campos vacíos se llenarían.
 * No escribe nada: la aplicación pasa por `aplicarAutocompletadoOperativo`.
 */
export async function evaluarAutocompletadoOperativo(
  db: Db,
  p: { expedienteId: string; tipo: string; datos: Datos; visible?: Record<string, unknown> | null; cache?: CatalogoOperativoCache },
): Promise<EvaluacionOperativa> {
  const fuente = fuenteOperativa(p.tipo);
  if (!fuente) throw new Error(`El tipo «${p.tipo}» no autocompleta campos operativos.`);

  const [{ data: exp, error }, { data: endoso }, { data: contenedores }] = await Promise.all([
    db.from("expedientes").select("*, clientes(nombre,rnc)").eq("id", p.expedienteId).single(),
    db.from("expediente_endosos")
      .select("endosado:clientes!expediente_endosos_consignatario_endosado_id_fkey(nombre,rnc)")
      .eq("expediente_id", p.expedienteId).eq("activo", true).maybeSingle(),
    db.from("expediente_contenedores").select("id").eq("expediente_id", p.expedienteId),
  ]);
  if (error || !exp) throw new Error(`No se pudo leer el Expediente: ${error?.message ?? "no encontrado"}`);

  const actuales = [exp.clientes?.nombre, (endoso as any)?.endosado?.nombre].filter(Boolean) as string[];
  const coincide = consignatarioCoincide(texto(p.datos.cliente), actuales);

  const errores: string[] = [];
  const avisos: string[] = [];
  const blDocumento = normalizarBl(p.datos.bl);
  const blExpediente = normalizarBl(exp.bl_awb);
  if (fuente === "bl" && blDocumento && blExpediente && blDocumento !== blExpediente) {
    errores.push(`El BL del documento (${texto(p.datos.bl)}) no coincide con el del Expediente (${exp.bl_awb}).`);
  }
  if (!coincide) {
    if (texto(p.datos.cliente)) avisos.push(`El consignatario del documento («${texto(p.datos.cliente)}») no coincide con el cliente del Expediente: no se llenará el N.º de BL.`);
    else avisos.push("El documento no muestra el consignatario: no se llenará el N.º de BL.");
  }

  const catalogo: Record<string, { nombre: string | null; codigo: string | null }> = {};
  const [ps, pa, po, pp] = await Promise.all([
    resolverCatalogo(db, "dga_puertos", "puerto", texto(p.datos.puerto_salida), p.cache),
    resolverCatalogo(db, "dga_puertos", "puerto", texto(p.datos.puerto_arribo), p.cache),
    resolverCatalogo(db, "dga_paises", "pais", texto(p.datos.pais_origen), p.cache),
    resolverCatalogo(db, "dga_paises", "pais", texto(p.datos.pais_procedencia), p.cache),
  ]);
  catalogo.puerto_salida = ps;
  catalogo.puerto_arribo = pa;
  catalogo.pais_origen = po;
  catalogo.pais_procedencia = pp;

  const actual = { ...exp, ...(p.visible ?? {}) } as Record<string, unknown>;
  const decision = decidirAutocompletadoOperativo({
    actual,
    datos: p.datos,
    fuente,
    consignatarioCoincide: coincide,
    catalogo,
    contenedoresActuales: (contenedores ?? []).length,
  });

  // Validaciones cruzadas: solo alertas.
  if (fuente === "factura") {
    const { data: otroBl } = await db.from("documentos").select("lectura_operativa").eq("expediente_id", p.expedienteId)
      .in("tipo", ["Bill of Lading", "Guía aérea"]).not("storage_path", "is", null)
      .order("fecha_recepcion", { ascending: false }).limit(1).maybeSingle();
    const lecturaBl = (otroBl?.lectura_operativa as { datos?: Datos } | null)?.datos ?? null;
    if (lecturaBl) {
      decision.alertas.push(...alertasBlContraFactura({ bl: lecturaBl, factura: p.datos, consignatarioCoincide: coincide }));
      decision.notas.push(...notasBlContraFactura({ bl: lecturaBl, factura: p.datos }));
    }
    if (exp.orden_id) {
      const { data: orden } = await db.from("ordenes").select("cot_suplidor,tarifa_propuesta,moneda").eq("id", exp.orden_id).maybeSingle();
      const { data: ordenLineas } = await db.from("orden_productos")
        .select("detalle_producto,cantidad,valor_fob").eq("orden_id", exp.orden_id).is("deleted_at", null);
      const lineasFactura: LineaComparables[] = ((p.datos.lineas_factura ?? p.datos.productos_factura ?? []) as Array<Record<string, unknown>>).map((l) => ({
        descripcion: texto(l.descripcion ?? l.detalle_producto ?? l.producto),
        cantidad: typeof l.cantidad === "number" ? l.cantidad : Number(l.cantidad ?? 0) || null,
        valor: typeof l.valor_fob === "number" ? l.valor_fob : Number(l.valor_fob ?? l.valor ?? 0) || null,
      }));
      const lineasOrden: LineaComparables[] = (ordenLineas ?? []).map((l: any) => ({
        descripcion: texto(l.detalle_producto), cantidad: l.cantidad ?? null, valor: l.valor_fob ?? null,
      }));
      // Total de la Orden: la suma de sus líneas de mercancía; si no tiene, el total Propuesto.
      const sumaLineas = lineasOrden.reduce((s, l) => s + (l.valor ?? 0), 0);
      decision.notas.push(...notasFacturaContraOrden({ suplidor: texto(p.datos.suplidor), orden: orden ? { suplidor: texto(orden.cot_suplidor) } : null }));
      decision.alertas.push(...alertasFacturaContraOrden({
        suplidor: texto(p.datos.suplidor),
        totalFob: typeof p.datos.fob_total === "number" ? p.datos.fob_total : Number(p.datos.fob_total ?? 0) || null,
        lineas: lineasFactura,
        orden: orden ? { suplidor: texto(orden.cot_suplidor), total: sumaLineas || (orden.tarifa_propuesta ?? null), lineas: lineasOrden } : null,
      }));
    }
  }


  return {
    actual,
    fuente,
    consignatarioCoincide: coincide,
    validacion: { ok: errores.length === 0, errores, avisos: [...avisos, ...decision.avisos] },
    decision,
  };
}

export function lecturaOperativaParaGuardar(
  p: { datos: Datos; fuente: FuenteOperativa; origen: LecturaOperativaGuardada["origen"]; archivo: string | null; motivo?: string | null },
  decision: DecisionOperativa,
): LecturaOperativaGuardada {
  // Las líneas de la factura se conservan para comparar con la Orden al revisar después.
  const { otros_gastos, productos_factura, ...resto } = p.datos as any;
  return {
    archivo: p.archivo,
    leido_en: new Date().toISOString(),
    origen: p.origen,
    fuente: p.fuente,
    datos: { ...resto, ...(otros_gastos != null ? { otros_gastos } : {}) },
    motivo: p.motivo ?? null,
    completados: decision.completados,
    alertas: decision.alertas,
    notas: decision.notas,
  };
}

export type ResultadoAplicarOperativo = { completados: string[]; contenedores: number };

/** Aplica solo vacíos (en la base) o registra el rechazo; siempre deja Auditoría. */
export async function aplicarAutocompletadoOperativo(
  db: Db,
  p: {
    expedienteId: string; documentoId: string | null; origen: "manual" | "correo" | "leer_ahora" | "lote";
    evaluacion: EvaluacionOperativa; lectura: LecturaOperativaGuardada;
  },
): Promise<ResultadoAplicarOperativo> {
  const ok = p.evaluacion.validacion.ok;
  const { data, error } = await db.rpc("aplicar_autocompletado_operativo", {
    p_expediente: p.expedienteId,
    p_documento: p.documentoId,
    p_estado: ok ? "aplicado" : "rechazado",
    p_campos: ok ? p.evaluacion.decision.cambios : {},
    p_lectura: { ...p.lectura, estado: ok ? "aplicado" : "rechazado" },
    p_origen: p.origen,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Partial<ResultadoAplicarOperativo>;
  return { completados: r.completados ?? [], contenedores: r.contenedores ?? 0 };
}
