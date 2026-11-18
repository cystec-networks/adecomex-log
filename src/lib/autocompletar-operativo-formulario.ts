/**
 * Lleva a la ficha abierta los campos que «Aplicar» acaba de guardar desde un documento,
 * sin pisar lo que el usuario escribió y aún no guardó.
 */
export const EVENTO_AUTOCOMPLETADO_APLICADO = "autocompletado-operativo-aplicado";

export type DetalleAutocompletadoAplicado = { expedienteId: string; completados: string[]; contenedores: number };

type Formulario = Record<string, unknown>;

/** Vacío = sin valor o cero (misma regla que usa la base al completar solo vacíos). */
export function valorVacio(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "number") return v === 0;
  const t = String(v).trim();
  return t === "" || Number(t) === 0 && /^[0-9.,\s]+$/.test(t);
}

/**
 * Para cada campo completado: se toma el valor guardado si la casilla está vacía o no se tocó
 * desde que se abrió la edición (`abierto`); si el usuario la cambió, se respeta su borrador.
 */
export function camposAplicadosParaFormulario(
  form: Formulario,
  abierto: Formulario | null,
  guardado: Formulario,
  completados: string[],
): Formulario {
  const cambios: Formulario = {};
  for (const k of completados) {
    if (!(k in guardado) || !(k in form)) continue;
    const actual = form[k];
    const sinTocar = abierto ? actual === abierto[k] : true;
    if (valorVacio(actual) || sinTocar) cambios[k] = guardado[k];
  }
  return cambios;
}
