/** Funciones de la plataforma que usan IA: catálogo compartido por el registro, la pantalla y los topes. */
export const FUNCIONES_IA = {
  documento_expediente: "Lectura de documentos (Nuevo Expediente y escáneres)",
  correo_adjunto: "Correos: lectura de adjuntos",
  correo_clasificacion: "Correos: tipo de documento",
  correo_pagina: "Correos y lotes: tipo de página escaneada",
  correo_texto: "Correos: datos del texto del mensaje",
  factura_venta: "Facturas e-CF",
  permiso_vuce: "Permisos VUCE",
  gasto: "Gastos",
  cuenta_por_pagar: "Cuentas por pagar",
  copiloto: "Copiloto arancelario",
  novedades: "Novedades de comercio exterior",
  asistente: "Asistente ADECOMEX",
  embeddings: "Índice de búsqueda (normativa y asistente)",
} as const;
export type FuncionIa = keyof typeof FUNCIONES_IA;
export const nombreFuncionIa = (f: string) => (FUNCIONES_IA as Record<string, string>)[f] ?? f;

/** Modelos de la plataforma. Extracción compleja conserva el modelo actual; lo simple usa el económico. */
export const MODELO_EXTRACCION = "google/gemini-3.8-flash";
export const MODELO_ECONOMICO = "google/gemini-3.1-flash-lite";

/** Créditos por token (entrada/salida) según la lista de modelos de Lovable AI; el cobro real puede variar algo. */
const TARIFAS: Record<string, { entrada: number; salida: number }> = {
  "google/gemini-3.8-flash": { entrada: 0.000003, salida: 0.000015 },
  "google/gemini-3.1-flash-lite": { entrada: 0.000001, salida: 0.000006 },
  "google/gemini-2.5-flash": { entrada: 0.0000012, salida: 0.00001 },
  "google/gemini-embedding-2": { entrada: 0.0000008, salida: 0 },
  "openai/gpt-6-astra": { entrada: 0.00004, salida: 0.0002 },
  "openai/gpt-6-luna": { entrada: 0.0000004, salida: 0.000002 },
};

/** Normaliza el id devuelto por el proveedor (p. ej. «gpt-6-astra-2026-…») al id del catálogo. */
export function modeloCatalogo(devuelto: string | null | undefined, pedido: string): string {
  const m = (devuelto ?? "").trim();
  if (m && TARIFAS[m]) return m;
  const encontrado = Object.keys(TARIFAS).find((k) => m && (m.startsWith(k.split("/")[1]) || k.endsWith(`/${m}`)));
  return encontrado ?? (m.includes("/") ? m : pedido);
}

export function costoEstimadoIa(modelo: string, tokensEntrada: number, tokensSalida: number): number {
  const t = TARIFAS[modelo];
  if (!t) return 0;
  return Math.round((tokensEntrada * t.entrada + tokensSalida * t.salida) * 1e6) / 1e6;
}

/** Queda menos del 20 % del presupuesto mensual. */
export const UMBRAL_PRESUPUESTO_PCT = 20;
export function presupuestoBajo(restantePct: number | null | undefined): boolean {
  return restantePct != null && restantePct < UMBRAL_PRESUPUESTO_PCT;
}

/** El tope diario se alcanza cuando lo gastado hoy llega al límite configurado (sin límite = sin tope). */
export function topeAlcanzado(gastadoHoy: number, limite: number | null | undefined): boolean {
  return limite != null && limite > 0 && gastadoHoy >= limite;
}

/** Qué hace un límite diario al alcanzarse: solo avisar o detener la función hasta el día siguiente. */
export type AccionLimiteIa = "alerta" | "bloqueo";
/** Funciones de correo: por defecto solo alerta, para que ningún correo se detenga por el límite. */
export const FUNCIONES_SOLO_ALERTA: readonly FuncionIa[] = ["correo_adjunto", "correo_clasificacion", "correo_pagina", "correo_texto"];
/** Funciones que leen los PDF de un correo: si se detienen, el correo queda en cola. */
export const FUNCIONES_LECTURA_CORREO: readonly FuncionIa[] = ["correo_adjunto", "correo_clasificacion", "correo_pagina"];

export function accionLimiteIa(funcion: string, guardada: string | null | undefined): AccionLimiteIa {
  if (guardada === "alerta" || guardada === "bloqueo") return guardada;
  return (FUNCIONES_SOLO_ALERTA as readonly string[]).includes(funcion) ? "alerta" : "bloqueo";
}

/** El límite detiene la función solo si se alcanzó y su acción es «bloqueo». */
export function topeBloquea(funcion: string, gastadoHoy: number, limite: number | null | undefined, accion: string | null | undefined): boolean {
  return topeAlcanzado(gastadoHoy, limite) && accionLimiteIa(funcion, accion) === "bloqueo";
}
