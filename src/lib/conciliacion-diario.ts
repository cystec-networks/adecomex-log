/**
 * Reglas de la Conciliación Bancaria ↔ Registro de Diario (solo débitos).
 * Funciones puras compartidas por la pantalla y sus pruebas: sugerencias,
 * beneficiario por cuenta destino o regla, importación sin duplicados y
 * validación del balance del estado de cuenta.
 */

export const DIAS_TOLERANCIA = 3;
export const MOTIVOS_DIFERENCIA = ["Retención del 8%", "Descuento por viaje", "Otro"] as const;

export type EntradaDiario = {
  id: string;
  origen_tipo: "transporte" | "transferencia" | string;
  fecha: string;
  secuencia: string;
  categoria: string;
  referencia: string | null;
  beneficiario: string;
  concepto: string;
  neto: number;
  conciliado?: boolean | null;
  origen?: string | null;
  estado?: string | null;
};

export type MovimientoBanco = {
  id: string;
  fecha: string;
  monto: number;
  tipo: string;
  descripcion: string | null;
  referencia: string | null;
  conciliado: boolean;
};

export type ReglaBanco = {
  id?: string;
  palabra_clave: string;
  categoria: string | null;
  concepto: string | null;
  beneficiario: string | null;
  activo: boolean;
  orden?: number | null;
};

/** beneficiario vacío = cuenta precargada pendiente de nombre (no sirve para verificar). */
export type CuentaBeneficiario = { cuenta: string; beneficiario: string | null; activo: boolean; titulares?: string[] | null; tipo?: string | null };

const cuentaSinCeros = (c: string) => c.replace(/^0+/, "");

/** Cuenta registrada y con nombre para un número de cuenta destino. */
export function cuentaConNombre(cuenta: string | null, cuentas: CuentaBeneficiario[]): CuentaBeneficiario | null {
  if (!cuenta) return null;
  return cuentas.find((c) => c.activo && (c.beneficiario ?? "").trim() !== "" && cuentaSinCeros(c.cuenta) === cuentaSinCeros(cuenta)) ?? null;
}

/** Titulares de una cuenta compartida (dos o más); null si la cuenta tiene un solo beneficiario. */
export function titularesDe(c: Pick<CuentaBeneficiario, "titulares"> | null | undefined): string[] | null {
  const t = (c?.titulares ?? []).map((x) => (x ?? "").trim()).filter(Boolean);
  return t.length >= 2 ? t : null;
}

/** Titulares de la cuenta destino si es compartida (p. ej. 114101033: Jefry M. De León y/o Francisco López). */
export function cuentaCompartida(cuenta: string | null, cuentas: CuentaBeneficiario[]): string[] | null {
  return titularesDe(cuentaConNombre(cuenta, cuentas));
}

const PALABRAS_VACIAS = new Set(["SRL", "SAS", "S", "A", "DE", "DEL", "LA", "LAS", "LOS", "Y", "EL", "INC", "EIRL", "CXA", "C", "POR"]);

export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalizarTexto(s)
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 4 && !PALABRAS_VACIAS.has(t));
}

/** Beneficiarios equivalentes si comparten dos palabras significativas, o todas las del
 * nombre más corto cuando tiene una sola ("ASOCAPU/Richeily jimenez" = "Richeily Jiménez"),
 * pero "FRANCISCO LOPEZ" ≠ "FRANCISCO MATOS" (solo comparten el nombre de pila). */
export function beneficiarioCoincide(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = [...new Set(tokens(a ?? ""))];
  const tb = new Set(tokens(b ?? ""));
  if (ta.length === 0 || tb.size === 0) return false;
  const comunes = ta.filter((t) => tb.has(t)).length;
  return comunes >= Math.min(2, ta.length, tb.size);
}

export function clavebeneficiario(s: string): string {
  return normalizarTexto(s).replace(/[^A-Z]/g, "");
}

function mismoBeneficiario(a: string, b: string): boolean {
  return clavebeneficiario(a) === clavebeneficiario(b) || beneficiarioCoincide(a, b);
}

/** Cuenta destino de una transferencia "IB a 815697610". */
export function cuentaDestino(descripcion: string | null | undefined): string | null {
  const m = /\bIB a (\d+)/i.exec(descripcion ?? "");
  return m ? m[1] : null;
}

export function reglaAplicable(descripcion: string | null | undefined, reglas: ReglaBanco[]): ReglaBanco | null {
  const d = normalizarTexto(descripcion);
  if (!d) return null;
  const activas = reglas
    .filter((r) => r.activo && normalizarTexto(r.palabra_clave))
    .sort((x, y) => (x.orden ?? 100) - (y.orden ?? 100));
  return activas.find((r) => d.includes(normalizarTexto(r.palabra_clave))) ?? null;
}

export function diasEntre(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round(Math.abs(da - db) / 86400000);
}

const centavos = (n: number) => Math.round(Number(n || 0) * 100);

export type Expectativa = {
  beneficiario: string | null;
  categoria: string | null;
  fuente: "cuenta" | "regla" | null;
  /** Cuenta compartida: cualquiera de estos titulares es válido. */
  titulares?: string[] | null;
};

/** Qué beneficiario/categoría se espera para un débito según su cuenta destino o una regla. */
export function expectativaMovimiento(
  mov: Pick<MovimientoBanco, "descripcion">,
  cuentas: CuentaBeneficiario[],
  reglas: ReglaBanco[],
): Expectativa {
  const cuenta = cuentaDestino(mov.descripcion);
  const c = cuentaConNombre(cuenta, cuentas);
  if (c) return { beneficiario: c.beneficiario, categoria: null, fuente: "cuenta", titulares: titularesDe(c) };
  const r = reglaAplicable(mov.descripcion, reglas);
  if (r && (r.beneficiario || r.categoria)) {
    return { beneficiario: r.beneficiario, categoria: r.categoria, fuente: "regla" };
  }
  return { beneficiario: null, categoria: null, fuente: null };
}

/** La entrada es compatible con lo esperado del débito (beneficiario de la cuenta,
 * o beneficiario/categoría de la regla). Sin expectativa no se puede comprobar. */
export function entradaCompatible(e: EntradaDiario, exp: Expectativa): boolean {
  if (exp.fuente === "cuenta") {
    if (exp.titulares?.length) return exp.titulares.some((t) => mismoBeneficiario(t, e.beneficiario));
    return beneficiarioCoincide(e.beneficiario, exp.beneficiario);
  }
  if (exp.fuente === "regla") {
    if (exp.beneficiario && beneficiarioCoincide(e.beneficiario, exp.beneficiario)) return true;
    if (exp.categoria && normalizarTexto(e.categoria) === normalizarTexto(exp.categoria)) return true;
    return false;
  }
  return true;
}

export type Sugerencia = {
  entradas: EntradaDiario[];
  dias: number;
  beneficiarioVerificado: boolean;
};

/** Entradas del Diario que coinciden con un débito pendiente: monto neto igual,
 * fecha dentro de ±3 días y beneficiario compatible. Incluye pagos agrupados
 * (2–4 entradas del mismo beneficiario que suman el débito). Nunca concilia. */
export function sugerirEntradas(
  mov: MovimientoBanco,
  entradas: EntradaDiario[],
  cuentas: CuentaBeneficiario[],
  reglas: ReglaBanco[],
): Sugerencia[] {
  if (mov.tipo !== "debito" || mov.conciliado) return [];
  const exp = expectativaMovimiento(mov, cuentas, reglas);
  const verificado = exp.fuente !== null;
  const libres = entradas.filter(
    (e) => !e.conciliado && e.estado !== "anulada" && diasEntre(e.fecha, mov.fecha) <= DIAS_TOLERANCIA && entradaCompatible(e, exp),
  );
  const objetivo = centavos(mov.monto);

  const individuales: Sugerencia[] = libres
    .filter((e) => centavos(e.neto) === objetivo)
    .map((e) => ({ entradas: [e], dias: diasEntre(e.fecha, mov.fecha), beneficiarioVerificado: verificado }))
    .sort((a, b) => a.dias - b.dias || a.entradas[0].secuencia.localeCompare(b.entradas[0].secuencia));

  const grupos: Sugerencia[] = [];
  const porBenef = new Map<string, EntradaDiario[]>();
  for (const e of libres) {
    if (centavos(e.neto) <= 0 || centavos(e.neto) >= objetivo) continue;
    const k = clavebeneficiario(e.beneficiario);
    porBenef.set(k, [...(porBenef.get(k) ?? []), e]);
  }
  for (const lista of porBenef.values()) {
    const items = lista.slice(0, 12);
    const buscar = (inicio: number, elegidas: EntradaDiario[], suma: number) => {
      if (grupos.length >= 3) return;
      if (elegidas.length >= 2 && suma === objetivo) {
        grupos.push({
          entradas: [...elegidas],
          dias: Math.max(...elegidas.map((x) => diasEntre(x.fecha, mov.fecha))),
          beneficiarioVerificado: verificado,
        });
        return;
      }
      if (elegidas.length >= 4 || suma >= objetivo) return;
      for (let i = inicio; i < items.length; i++) {
        buscar(i + 1, [...elegidas, items[i]], suma + centavos(items[i].neto));
      }
    };
    buscar(0, [], 0);
  }
  return [...individuales, ...grupos];
}

/** Diferencia banco − Diario para una selección (en pesos, redondeada a centavos). */
export function diferenciaSeleccion(montoBanco: number, entradas: Pick<EntradaDiario, "neto">[]): number {
  return (centavos(montoBanco) - entradas.reduce((s, e) => s + centavos(e.neto), 0)) / 100;
}

export function requiereMotivo(diferencia: number): boolean {
  return Math.abs(Math.round(diferencia * 100)) >= 1;
}

/** Prellenado de "Crear entrada de Diario" desde un débito sin coincidencia. */
export function prellenarEntrada(
  mov: Pick<MovimientoBanco, "descripcion" | "fecha">,
  cuentas: CuentaBeneficiario[],
  reglas: ReglaBanco[],
): { fecha: string; categoria: string; beneficiario: string; concepto: string; titulares: string[] | null } {
  const regla = reglaAplicable(mov.descripcion, reglas);
  const cuenta = cuentaDestino(mov.descripcion);
  const reg = cuentaConNombre(cuenta, cuentas);
  const titulares = titularesDe(reg);
  const benefCuenta = reg?.beneficiario ?? undefined;
  return {
    fecha: mov.fecha,
    categoria: regla?.categoria || (benefCuenta ? "Gastos Menores" : "Otro"),
    // Cuenta compartida: nunca se asume el titular; el usuario elige uno por movimiento.
    beneficiario: titulares ? "" : regla?.beneficiario || benefCuenta || "",
    concepto: regla?.concepto || (mov.descripcion ?? "").trim(),
    titulares,
  };
}

/** Débito de comisión bancaria («EXI COM DGA …», «COM DPW …»). */
export const esComision = (descripcion: string | null | undefined) => /\bCOM\b/i.test(descripcion ?? "");

/** Pagos (no comisiones) con la misma referencia que una comisión. */
function pagosMismaReferencia<T extends MovimientoBanco>(com: T, movimientos: T[]): T[] {
  if (!esComision(com.descripcion)) return [];
  const ref = (com.referencia ?? "").replace(/^0+/, "");
  if (!ref) return [];
  return movimientos.filter(
    (m) => m.id !== com.id && m.tipo === "debito" && (m.referencia ?? "").replace(/^0+/, "") === ref && !esComision(m.descripcion),
  );
}

/** Pago con la misma referencia que una comisión (p. ej. COM DGA ↔ PAG DGA). El banco trunca referencias
 * («0000000000009» se repite en días distintos), así que se prefiere el pago del mismo día. */
export function pagoDeComision<T extends MovimientoBanco>(com: T, movimientos: T[]): T | null {
  const pagos = pagosMismaReferencia(com, movimientos);
  return pagos.find((m) => m.fecha === com.fecha) ?? pagos[0] ?? null;
}

/** Pago ÚNICO del mismo día y la misma referencia de una comisión; null si no hay o hay varios (revisión). */
export function pagoComisionMismoDia<T extends MovimientoBanco>(com: T, movimientos: T[]): T | null {
  const mismoDia = pagosMismaReferencia(com, movimientos).filter((m) => m.fecha === com.fecha);
  return mismoDia.length === 1 ? mismoDia[0] : null;
}

// ---------- Importación sin duplicados ----------

export type FilaImportable = {
  fecha: string;
  referencia: string | null;
  monto: number;
  descripcion: string | null;
};

/** Clave de duplicado: fecha + referencia + monto + descripción. */
export function claveImportacion(f: FilaImportable): string {
  const ref = (f.referencia ?? "").trim().replace(/^0+/, "");
  return `${f.fecha}|${ref}|${centavos(f.monto)}|${normalizarTexto(f.descripcion)}`;
}

/** Devuelve solo las filas que faltan: si el archivo trae N filas con la misma
 * clave y ya existen M guardadas, se importan N − M (las repetidas legítimas
 * del mismo día se conservan, las ya importadas no se duplican). */
export function filasNuevas<T extends FilaImportable>(archivo: T[], existentes: FilaImportable[]): T[] {
  const guardadas = new Map<string, number>();
  for (const e of existentes) {
    const k = claveImportacion(e);
    guardadas.set(k, (guardadas.get(k) ?? 0) + 1);
  }
  const vistas = new Map<string, number>();
  const out: T[] = [];
  for (const f of archivo) {
    const k = claveImportacion(f);
    const n = (vistas.get(k) ?? 0) + 1;
    vistas.set(k, n);
    if (n > (guardadas.get(k) ?? 0)) out.push(f);
  }
  return out;
}

/** Vista previa de una importación: qué líneas entrarían, cuántas se omiten por
 * existir ya y cuáles de las nuevas son líneas idénticas repetidas dentro del
 * mismo archivo (pagos iguales del mismo día que el control anterior descartaba). */
export function resumenImportacion<T extends FilaImportable>(archivo: T[], existentes: FilaImportable[]) {
  const nuevas = filasNuevas(archivo, existentes);
  const enArchivo = new Map<string, number>();
  for (const f of archivo) {
    const k = claveImportacion(f);
    enArchivo.set(k, (enArchivo.get(k) ?? 0) + 1);
  }
  const repetidas = new Set(nuevas.filter((f) => (enArchivo.get(claveImportacion(f)) ?? 0) > 1));
  return {
    nuevas,
    omitidas: archivo.length - nuevas.length,
    /** Nuevas cuya línea aparece más de una vez idéntica en el archivo. */
    repetidasEnArchivo: nuevas.filter((f) => repetidas.has(f)),
  };
}

// ---------- Balance ----------

export function validarBalance(balanceBanco: number | null, balanceCalculado: number | null):
  | { estado: "sin-datos" }
  | { estado: "coincide"; diferencia: 0 }
  | { estado: "no-coincide"; diferencia: number } {
  if (balanceBanco === null || balanceCalculado === null) return { estado: "sin-datos" };
  const dif = (centavos(balanceBanco) - centavos(balanceCalculado)) / 100;
  return dif === 0 ? { estado: "coincide", diferencia: 0 } : { estado: "no-coincide", diferencia: dif };
}

/** Categorías de las Solicitudes de Pago por Transferencia (alimentan el Diario). */
export const CATEGORIAS_TRANSFERENCIA = ["Gastos Menores", "Impuestos", "Comisión bancaria", "Nómina", "Compras con NCF", "Pago Transportes", "Otro"];

// ---------- Catálogo de cuentas destino ----------

export type ResumenCuenta = { cuenta: string; cantidad: number; total: number; desde: string; hasta: string };

/** Débitos «IB a» pendientes agrupados por cuenta destino (sin ceros a la izquierda). */
export function resumenCuentasPendientes(movimientos: MovimientoBanco[]): Map<string, ResumenCuenta> {
  const out = new Map<string, ResumenCuenta>();
  for (const m of movimientos) {
    if (m.tipo !== "debito" || m.conciliado) continue;
    const c = cuentaDestino(m.descripcion);
    if (!c) continue;
    const k = cuentaSinCeros(c);
    const r = out.get(k);
    if (!r) out.set(k, { cuenta: k, cantidad: 1, total: centavos(m.monto) / 100, desde: m.fecha, hasta: m.fecha });
    else {
      r.cantidad++;
      r.total = (centavos(r.total) + centavos(m.monto)) / 100;
      if (m.fecha < r.desde) r.desde = m.fecha;
      if (m.fecha > r.hasta) r.hasta = m.fecha;
    }
  }
  return out;
}

/** Beneficiario más frecuente del Diario entre los débitos de una cuenta con entrada de
 * monto igual (±3 días). Solo es una pista para nombrar la cuenta; nunca se guarda sola. */
export function beneficiarioProbable(
  cuenta: string,
  movimientos: MovimientoBanco[],
  entradas: EntradaDiario[],
): { nombre: string; coincidencias: number } | null {
  const conteo = new Map<string, { nombre: string; n: number }>();
  for (const m of movimientos) {
    if (m.tipo !== "debito" || m.conciliado) continue;
    const c = cuentaDestino(m.descripcion);
    if (!c || cuentaSinCeros(c) !== cuentaSinCeros(cuenta)) continue;
    const vistos = new Set<string>();
    for (const e of entradas) {
      if (e.conciliado || e.estado === "anulada") continue;
      if (centavos(e.neto) !== centavos(m.monto) || diasEntre(e.fecha, m.fecha) > DIAS_TOLERANCIA) continue;
      const k = clavebeneficiario(e.beneficiario);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      const x = conteo.get(k);
      if (x) x.n++;
      else conteo.set(k, { nombre: e.beneficiario, n: 1 });
    }
  }
  const mejor = [...conteo.values()].sort((a, b) => b.n - a.n)[0];
  return mejor ? { nombre: mejor.nombre, coincidencias: mejor.n } : null;
}

// ---------- Acciones en bloque ----------

/** Fecha de la primera entrada propia del Diario (no creada desde el banco). */
export function inicioDiario(entradas: Pick<EntradaDiario, "fecha" | "origen">[]): string | null {
  let min: string | null = null;
  for (const e of entradas) {
    if (e.origen && e.origen !== "manual") continue;
    if (!min || e.fecha < min) min = e.fecha;
  }
  return min;
}

/** Débitos pendientes anteriores al inicio del Diario. */
export function anterioresAlDiario<T extends MovimientoBanco>(movimientos: T[], inicio: string | null): T[] {
  if (!inicio) return [];
  return movimientos
    .filter((m) => m.tipo === "debito" && !m.conciliado && m.fecha < inicio)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Comisiones pendientes con su pago de la misma referencia (se vinculan, sin TF propio). */
export function comisionesConPago<T extends MovimientoBanco>(movimientos: T[]): { comision: T; pago: T }[] {
  const out: { comision: T; pago: T }[] = [];
  for (const m of movimientos) {
    if (m.tipo !== "debito" || m.conciliado) continue;
    const pago = pagoDeComision(m, movimientos);
    if (pago) out.push({ comision: m, pago });
  }
  return out.sort((a, b) => a.comision.fecha.localeCompare(b.comision.fecha));
}

export type GrupoLote<T> = { clave: string; etiqueta: string; beneficiario: string; nombrado: boolean; movimientos: T[]; total: number; titulares: string[] | null };

/** Débitos desde el inicio del Diario sin entrada (sin sugerencia ni comisión de un pago),
 * agrupados por cuenta destino o por regla, para crear entradas por lote de un mismo beneficiario. */
export function gruposParaLote<T extends MovimientoBanco>(
  movimientos: T[],
  conSugerencia: (m: T) => boolean,
  cuentas: CuentaBeneficiario[],
  reglas: ReglaBanco[],
  inicio: string | null,
): { grupos: GrupoLote<T>[]; sinAgrupar: T[] } {
  if (!inicio) return { grupos: [], sinAgrupar: [] };
  const mapa = new Map<string, GrupoLote<T>>();
  const sinAgrupar: T[] = [];
  for (const m of movimientos) {
    if (m.tipo !== "debito" || m.conciliado || m.fecha < inicio) continue;
    if (conSugerencia(m) || pagoDeComision(m, movimientos)) continue;
    const c = cuentaDestino(m.descripcion);
    let clave: string, etiqueta: string, beneficiario: string, nombrado: boolean;
    let titulares: string[] | null = null;
    if (c) {
      const reg = cuentaConNombre(c, cuentas);
      titulares = titularesDe(reg);
      clave = `cuenta:${cuentaSinCeros(c)}`;
      beneficiario = titulares ? "" : reg?.beneficiario ?? "";
      nombrado = !!reg;
      etiqueta = titulares
        ? `Cuenta compartida (${titulares.join(" y/o ")}) · cuenta ${cuentaSinCeros(c)}`
        : reg ? `${reg.beneficiario} · cuenta ${cuentaSinCeros(c)}` : `Cuenta ${cuentaSinCeros(c)} (sin nombre)`;
    } else {
      const r = reglaAplicable(m.descripcion, reglas);
      if (!r) { sinAgrupar.push(m); continue; }
      clave = `regla:${normalizarTexto(r.palabra_clave)}`;
      beneficiario = r.beneficiario ?? "";
      nombrado = !!r.beneficiario;
      etiqueta = `${r.beneficiario || r.palabra_clave} · regla «${r.palabra_clave}»`;
    }
    const g = mapa.get(clave) ?? { clave, etiqueta, beneficiario, nombrado, movimientos: [], total: 0, titulares };
    g.movimientos.push(m);
    g.total = (centavos(g.total) + centavos(m.monto)) / 100;
    mapa.set(clave, g);
  }
  const grupos = [...mapa.values()]
    .map((g) => ({ ...g, movimientos: g.movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha)) }))
    .sort((a, b) => b.movimientos.length - a.movimientos.length || a.etiqueta.localeCompare(b.etiqueta));
  return { grupos, sinAgrupar };
}

// ---------- Conciliar sugerencias exactas en bloque ----------

export type SugerenciaExacta<T> = { movimiento: T; entrada: EntradaDiario; dias: number; beneficiarioVerificado: boolean };

const claveEntrada = (e: Pick<EntradaDiario, "origen_tipo" | "id">) => `${e.origen_tipo}:${e.id}`;

/** Débitos pendientes cuya ÚNICA sugerencia es una sola entrada del Diario con el mismo monto
 * neto, a ±3 días y sin diferencia. Se excluyen los débitos con dos o más opciones (o pagos
 * agrupados) y las entradas que también son opción de otro débito, para conciliar uno a uno. */
export function sugerenciasExactas<T extends MovimientoBanco>(
  movimientos: T[],
  sugerencias: Map<string, Sugerencia[]>,
): { exactas: SugerenciaExacta<T>[]; conVariasOpciones: number; entradaCompartida: number } {
  const usosEntrada = new Map<string, number>();
  for (const lista of sugerencias.values()) {
    const vistas = new Set<string>();
    for (const s of lista) for (const e of s.entradas) vistas.add(claveEntrada(e));
    for (const k of vistas) usosEntrada.set(k, (usosEntrada.get(k) ?? 0) + 1);
  }
  const exactas: SugerenciaExacta<T>[] = [];
  let conVariasOpciones = 0;
  let entradaCompartida = 0;
  for (const m of movimientos) {
    if (m.tipo !== "debito" || m.conciliado) continue;
    const lista = sugerencias.get(m.id) ?? [];
    if (lista.length === 0) continue;
    if (lista.length > 1 || lista[0].entradas.length !== 1) { conVariasOpciones++; continue; }
    const e = lista[0].entradas[0];
    if (centavos(e.neto) !== centavos(m.monto) || diasEntre(e.fecha, m.fecha) > DIAS_TOLERANCIA) continue;
    if ((usosEntrada.get(claveEntrada(e)) ?? 0) > 1) { entradaCompartida++; continue; }
    exactas.push({ movimiento: m, entrada: e, dias: diasEntre(e.fecha, m.fecha), beneficiarioVerificado: lista[0].beneficiarioVerificado });
  }
  exactas.sort((a, b) => a.movimiento.fecha.localeCompare(b.movimiento.fecha));
  return { exactas, conVariasOpciones, entradaCompartida };
}

/** La entrada ya tiene número TF (TF-0012774, TF0012774). Los pagos de transporte antiguos llevan TR-…: «Sin TF». */
export const tieneTf = (secuencia: string | null | undefined) => /^TF-?\d+$/i.test((secuencia ?? "").trim());

/** TF escrito a mano (registro anterior en Excel) en formato guardado: «tf12777» → «TF-0012777». Vacío → null
 * (se asigna el siguiente disponible); texto que no es un TF → "invalido". Igual que private.normalizar_tf. */
export function normalizarTfManual(texto: string | null | undefined): string | null | "invalido" {
  const t = (texto ?? "").trim();
  if (!t) return null;
  if (!/^TF-?\d+$/i.test(t)) return "invalido";
  const digitos = t.replace(/\D/g, "").replace(/^0+/, "");
  return digitos ? `TF-${digitos.padStart(7, "0")}` : "invalido";
}

/** TF escritos a mano que se repiten entre filas del mismo lote (entrada → TF repetido). */
export function tfManualesRepetidos(manuales: Record<string, string>): Map<string, string> {
  const vistos = new Map<string, string>();
  const repetidos = new Map<string, string>();
  for (const [id, texto] of Object.entries(manuales)) {
    const tf = normalizarTfManual(texto);
    if (!tf || tf === "invalido") continue;
    if (vistos.has(tf)) repetidos.set(id, tf); else vistos.set(tf, id);
  }
  return repetidos;
}

/** Orden de fecha para asignar TF: fecha del banco, luego de la entrada y el id (igual en vista previa y confirmación). */
export function compararParaTf<T extends MovimientoBanco>(a: SugerenciaExacta<T>, b: SugerenciaExacta<T>): number {
  return a.movimiento.fecha.localeCompare(b.movimiento.fecha)
    || a.entrada.fecha.localeCompare(b.entrada.fecha)
    || a.movimiento.id.localeCompare(b.movimiento.id);
}

/** Filas elegidas sin TF, en el orden en que recibirían su número. */
export function ordenAsignacionTf<T extends MovimientoBanco>(elegidas: SugerenciaExacta<T>[]): SugerenciaExacta<T>[] {
  return elegidas.filter((x) => !tieneTf(x.entrada.secuencia)).sort(compararParaTf);
}

/** Cuenta destino («IB a …») sin ceros a la izquierda, o null. */
export function cuentaDeMovimiento(m: Pick<MovimientoBanco, "descripcion">): string | null {
  const c = cuentaDestino(m.descripcion);
  return c ? cuentaSinCeros(c) : null;
}

/** Cuentas destino que aparecen con dos o más beneficiarios distintos entre las sugerencias exactas
 * (p. ej. 114101033 con Jefry M. De León y con Francisco López): cuenta → nombres. */
export function cuentasConVariosBeneficiarios<T extends MovimientoBanco>(
  exactas: SugerenciaExacta<T>[],
  cuentas: CuentaBeneficiario[] = [],
): Map<string, string[]> {
  const porCuenta = new Map<string, string[]>();
  for (const x of exactas) {
    const c = cuentaDeMovimiento(x.movimiento);
    // Cuenta compartida registrada: cualquiera de sus titulares es válido, sin aviso.
    if (c && cuentaCompartida(c, cuentas)) continue;
    const b = (x.entrada.beneficiario ?? "").trim();
    if (!c || !b) continue;
    const lista = porCuenta.get(c) ?? [];
    if (!lista.some((y) => mismoBeneficiario(y, b))) lista.push(b);
    porCuenta.set(c, lista);
  }
  return new Map([...porCuenta].filter(([, l]) => l.length > 1).map(([c, l]) => [c, [...l].sort((a, b) => a.localeCompare(b))]));
}

export type EstadoBeneficiario = "sin-conflicto" | "falta-elegir" | "corresponde" | "no-corresponde";

/** Si la cuenta tiene dos beneficiarios, la fila solo se concilia cuando el usuario elige uno y es el de la entrada. */
export function estadoBeneficiario(entradaBeneficiario: string, opciones: string[] | undefined, elegido: string | null | undefined): EstadoBeneficiario {
  if (!opciones || opciones.length < 2) return "sin-conflicto";
  if (!elegido) return "falta-elegir";
  return mismoBeneficiario(elegido, entradaBeneficiario) ? "corresponde" : "no-corresponde";
}

// ---------- Conciliación automática (tras importar y sobre pendientes existentes) ----------

export const MOTIVOS_REVISION = {
  cuentaDesconocida: "Cuenta desconocida",
  cuentaCompartida: "Cuenta compartida",
  montoDiferencia: "Monto con diferencia",
  varias: "Varias coincidencias posibles",
  comisionSinPago: "Comisión sin pago del mismo día",
  transporteSinViaje: "Pago de transporte sin viaje exacto",
} as const;

/** Entradas del Diario que la conciliación automática no toca hasta que el usuario indique su TF
 * (pagos de transporte sin TF de ASOCAPU). Al recibir su TF la secuencia deja de ser TR-… y salen solas de aquí. */
export const SECUENCIAS_EXCLUIDAS_AUTOMATICA = ["TR-000028", "TR-000030", "TR-000031"] as const;

export type AccionAutomatica<T> =
  | { tipo: "conciliar"; movimiento: T; entrada: EntradaDiario }
  | { tipo: "crear"; movimiento: T; categoria: string; beneficiario: string; concepto: string }
  | { tipo: "no_aplica"; movimiento: T }
  | { tipo: "comision"; movimiento: T; pago: T };

export type PlanAutomatico<T> = {
  /** En orden de fecha: así los TF nuevos salen en orden cronológico. */
  acciones: AccionAutomatica<T>[];
  revision: { movimiento: T; motivo: string }[];
  /** Débitos que no se tocan porque su entrada espera el TF que indique el usuario. */
  excluidos: { movimiento: T; secuencias: string[] }[];
};

/** Decide qué débitos (los nuevos de una importación o los pendientes elegidos) se resuelven solos:
 * - anterior al inicio del Diario → «No aplica (anterior al Diario)»;
 * - comisión con UN pago del mismo día y la misma referencia → se vincula a ese pago, sin TF propio
 *   (sin pago que cuadre → revisión);
 * - beneficiario conocido (cuenta con nombre no compartida, o regla con beneficiario) y UNA sola entrada libre
 *   con el mismo monto neto a ±3 días que ningún otro débito pendiente comparte → conciliar;
 * - beneficiario conocido sin ninguna entrada libre cercana → crear la entrada (siguiente TF), nunca a transportistas.
 * Todo lo demás va a revisión con su motivo. `todos` son todos los movimientos (comisiones y entradas compartidas). */
export function planConciliacionAutomatica<T extends MovimientoBanco>(
  nuevos: T[],
  todos: T[],
  entradas: EntradaDiario[],
  cuentas: CuentaBeneficiario[],
  reglas: ReglaBanco[],
  inicio: string | null,
  excluirSecuencias: readonly string[] = SECUENCIAS_EXCLUIDAS_AUTOMATICA,
): PlanAutomatico<T> {
  const pendientes = todos.filter((m) => m.tipo === "debito" && !m.conciliado);
  const sugerencias = new Map<string, Sugerencia[]>();
  for (const m of pendientes) sugerencias.set(m.id, sugerirEntradas(m, entradas, cuentas, reglas));
  const usosEntrada = new Map<string, number>();
  for (const lista of sugerencias.values()) {
    const vistas = new Set<string>();
    for (const s of lista) for (const e of s.entradas) vistas.add(claveEntrada(e));
    for (const k of vistas) usosEntrada.set(k, (usosEntrada.get(k) ?? 0) + 1);
  }
  const excluidas = new Set(excluirSecuencias.map((x) => normalizarTexto(x)));

  const acciones: AccionAutomatica<T>[] = [];
  const revision: { movimiento: T; motivo: string }[] = [];
  const excluidos: { movimiento: T; secuencias: string[] }[] = [];
  const orden = [...nuevos]
    .filter((m) => m.tipo === "debito" && !m.conciliado)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));

  for (const m of orden) {
    const aRevision = (motivo: string) => revision.push({ movimiento: m, motivo });
    if (!inicio || m.fecha < inicio) { acciones.push({ tipo: "no_aplica", movimiento: m }); continue; }
    if (esComision(m.descripcion)) {
      const pago = pagoComisionMismoDia(m, todos);
      if (pago) acciones.push({ tipo: "comision", movimiento: m, pago });
      else aRevision(MOTIVOS_REVISION.comisionSinPago);
      continue;
    }

    const lista = sugerencias.get(m.id) ?? [];
    const conExcluida = [...new Set(lista.flatMap((s) => s.entradas)
      .filter((e) => !tieneTf(e.secuencia) && excluidas.has(normalizarTexto(e.secuencia)))
      .map((e) => e.secuencia))];
    if (conExcluida.length) { excluidos.push({ movimiento: m, secuencias: conExcluida }); continue; }

    const cuenta = cuentaDestino(m.descripcion);
    const reg = cuenta ? cuentaConNombre(cuenta, cuentas) : null;
    if (cuenta && !reg) { aRevision(MOTIVOS_REVISION.cuentaDesconocida); continue; }
    if (reg && titularesDe(reg)) { aRevision(MOTIVOS_REVISION.cuentaCompartida); continue; }
    const regla = cuenta ? null : reglaAplicable(m.descripcion, reglas);
    if (!cuenta && !(regla?.beneficiario ?? "").trim()) { aRevision(MOTIVOS_REVISION.cuentaDesconocida); continue; }

    if (lista.length > 1 || (lista.length === 1 && lista[0].entradas.length !== 1)) { aRevision(MOTIVOS_REVISION.varias); continue; }
    if (lista.length === 1) {
      const e = lista[0].entradas[0];
      if ((usosEntrada.get(claveEntrada(e)) ?? 0) > 1) { aRevision(MOTIVOS_REVISION.varias); continue; }
      acciones.push({ tipo: "conciliar", movimiento: m, entrada: e });
      continue;
    }

    // Sin entrada exacta: si el beneficiario tiene entradas libres cercanas con otro monto, hay diferencia que revisar.
    const exp = expectativaMovimiento(m, cuentas, reglas);
    const cercana = entradas.some((e) => !e.conciliado && e.estado !== "anulada"
      && diasEntre(e.fecha, m.fecha) <= DIAS_TOLERANCIA && entradaCompatible(e, exp));
    if (cercana) { aRevision(MOTIVOS_REVISION.montoDiferencia); continue; }
    // Un pago a transportista corresponde a un viaje: nunca se inventa una entrada nueva.
    if (reg?.tipo === "transportista") { aRevision(MOTIVOS_REVISION.transporteSinViaje); continue; }

    const p = prellenarEntrada(m, cuentas, reglas);
    if (!p.beneficiario.trim()) { aRevision(MOTIVOS_REVISION.cuentaDesconocida); continue; }
    acciones.push({ tipo: "crear", movimiento: m, categoria: p.categoria, beneficiario: p.beneficiario, concepto: p.concepto });
  }
  return { acciones, revision, excluidos };
}

/** Ítems para `conciliar_automatico_importacion` (mismo orden del plan). */
export function itemsRpcAutomatico<T extends MovimientoBanco>(plan: PlanAutomatico<T>) {
  return {
    p_items: plan.acciones.map((a) => {
      switch (a.tipo) {
        case "conciliar": return { movimiento_id: a.movimiento.id, accion: "conciliar", origen_tipo: a.entrada.origen_tipo, solicitud_id: a.entrada.id };
        case "crear": return { movimiento_id: a.movimiento.id, accion: "crear", categoria: a.categoria, beneficiario: a.beneficiario, concepto: a.concepto };
        case "no_aplica": return { movimiento_id: a.movimiento.id, accion: "no_aplica" };
        case "comision": return { movimiento_id: a.movimiento.id, accion: "comision", pago_id: a.pago.id };
      }
    }),
    p_revision: plan.revision.map((r) => ({ movimiento_id: r.movimiento.id, motivo: r.motivo })),
  };
}

export type DetalleLoteAutomatico = {
  movimiento_id: string;
  accion: "conciliar" | "crear" | "no_aplica" | "comision" | "revision";
  monto?: number | string | null;
  secuencia?: string | null;
  tf_asignado?: boolean;
  motivo?: string | null;
};

type Bloque = { cantidad: number; total: number };

/** Totales de la vista previa / resultado: cantidad y monto por acción, TF que se usarían y revisión por motivo. */
export function resumenLoteAutomatico(detalle: DetalleLoteAutomatico[]) {
  const vacio = (): Bloque => ({ cantidad: 0, total: 0 });
  const r = {
    conciliar: vacio(), crear: vacio(), no_aplica: vacio(), comision: vacio(), revision: vacio(),
    porMotivo: new Map<string, Bloque>(),
    /** TF que se asignarían (entradas existentes sin TF y entradas nuevas), en orden. */
    tf: [] as string[],
  };
  const sumar = (b: Bloque, monto: number) => { b.cantidad++; b.total = (centavos(b.total) + centavos(monto)) / 100; };
  for (const d of detalle) {
    const monto = Number(d.monto ?? 0);
    sumar(r[d.accion], monto);
    if (d.accion === "revision") {
      const k = d.motivo || "Revisar";
      const b = r.porMotivo.get(k) ?? vacio();
      sumar(b, monto);
      r.porMotivo.set(k, b);
    }
    if ((d.accion === "crear" || (d.accion === "conciliar" && d.tf_asignado)) && d.secuencia) r.tf.push(d.secuencia);
  }
  return r;
}
