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
export type CuentaBeneficiario = { cuenta: string; beneficiario: string | null; activo: boolean };

const cuentaSinCeros = (c: string) => c.replace(/^0+/, "");

/** Cuenta registrada y con nombre para un número de cuenta destino. */
export function cuentaConNombre(cuenta: string | null, cuentas: CuentaBeneficiario[]): CuentaBeneficiario | null {
  if (!cuenta) return null;
  return cuentas.find((c) => c.activo && (c.beneficiario ?? "").trim() !== "" && cuentaSinCeros(c.cuenta) === cuentaSinCeros(cuenta)) ?? null;
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
};

/** Qué beneficiario/categoría se espera para un débito según su cuenta destino o una regla. */
export function expectativaMovimiento(
  mov: Pick<MovimientoBanco, "descripcion">,
  cuentas: CuentaBeneficiario[],
  reglas: ReglaBanco[],
): Expectativa {
  const cuenta = cuentaDestino(mov.descripcion);
  const c = cuentaConNombre(cuenta, cuentas);
  if (c) return { beneficiario: c.beneficiario, categoria: null, fuente: "cuenta" };
  const r = reglaAplicable(mov.descripcion, reglas);
  if (r && (r.beneficiario || r.categoria)) {
    return { beneficiario: r.beneficiario, categoria: r.categoria, fuente: "regla" };
  }
  return { beneficiario: null, categoria: null, fuente: null };
}

/** La entrada es compatible con lo esperado del débito (beneficiario de la cuenta,
 * o beneficiario/categoría de la regla). Sin expectativa no se puede comprobar. */
export function entradaCompatible(e: EntradaDiario, exp: Expectativa): boolean {
  if (exp.fuente === "cuenta") return beneficiarioCoincide(e.beneficiario, exp.beneficiario);
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
): { fecha: string; categoria: string; beneficiario: string; concepto: string } {
  const regla = reglaAplicable(mov.descripcion, reglas);
  const cuenta = cuentaDestino(mov.descripcion);
  const benefCuenta = cuentaConNombre(cuenta, cuentas)?.beneficiario ?? undefined;
  return {
    fecha: mov.fecha,
    categoria: regla?.categoria || (benefCuenta ? "Gastos Menores" : "Otro"),
    beneficiario: regla?.beneficiario || benefCuenta || "",
    concepto: regla?.concepto || (mov.descripcion ?? "").trim(),
  };
}

/** Pago con la misma referencia que una comisión (p. ej. COM DGA ↔ PAG DGA). */
export function pagoDeComision<T extends MovimientoBanco>(com: T, movimientos: T[]): T | null {
  if (!/\bCOM\b/i.test(com.descripcion ?? "")) return null;
  const ref = (com.referencia ?? "").replace(/^0+/, "");
  if (!ref) return null;
  return (
    movimientos.find(
      (m) =>
        m.id !== com.id &&
        m.tipo === "debito" &&
        (m.referencia ?? "").replace(/^0+/, "") === ref &&
        !/\bCOM\b/i.test(m.descripcion ?? ""),
    ) ?? null
  );
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

export type GrupoLote<T> = { clave: string; etiqueta: string; beneficiario: string; nombrado: boolean; movimientos: T[]; total: number };

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
    if (c) {
      const reg = cuentaConNombre(c, cuentas);
      clave = `cuenta:${cuentaSinCeros(c)}`;
      beneficiario = reg?.beneficiario ?? "";
      nombrado = !!reg;
      etiqueta = reg ? `${reg.beneficiario} · cuenta ${cuentaSinCeros(c)}` : `Cuenta ${cuentaSinCeros(c)} (sin nombre)`;
    } else {
      const r = reglaAplicable(m.descripcion, reglas);
      if (!r) { sinAgrupar.push(m); continue; }
      clave = `regla:${normalizarTexto(r.palabra_clave)}`;
      beneficiario = r.beneficiario ?? "";
      nombrado = !!r.beneficiario;
      etiqueta = `${r.beneficiario || r.palabra_clave} · regla «${r.palabra_clave}»`;
    }
    const g = mapa.get(clave) ?? { clave, etiqueta, beneficiario, nombrado, movimientos: [], total: 0 };
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
