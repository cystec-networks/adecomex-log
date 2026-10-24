import { filaReemplazadaPorServicio, FORMULARIO_DUA_RD } from "@/lib/costo-mercancia";

/** Prorrateo FOB de todos los costos de mercancía; el ITBIS no integra el costo. */
export function costoUnitarioReal(cif: number, gravamen: number, isc: number, gastosUsd: number, participacionFob: number, cantidad: number) {
  return cantidad > 0 ? (cif + gravamen + isc + gastosUsd * participacionFob) / cantidad : 0;
}

/** Fila calculada por producto (la produce calcFila de la sección Liquidación Final). */
export type FilaCalc = {
  fob: number;
  est: { gravamen: number; selectivo: number; itbis: number; cifLinea: number };
  cant: number;
  gr: number | null;
  ir: number | null;
  tr: number | null;
  cv: number | null;
  costoUnit: number;
};

/** Campos «Real» de la pestaña Liquidación y la columna «Est» que los precarga. */
export const CAMPO_REAL_DESDE_EST: Record<string, "gravamen" | "selectivo" | "itbis"> = {
  gravamen_real: "gravamen",
  isc_real: "selectivo",
  itbis_real: "itbis",
};

/**
 * Valor inicial de un campo «Real» (Grav. Real, ISC Real, ITBIS Real) cuando la línea
 * aún no tiene un monto guardado: se precarga con su columna «Est» correspondiente,
 * redondeado a centavos. Devuelve null cuando no corresponde precargar —ya hay valor
 * guardado (incluido 0)— o cuando el campo no es uno de los tres (p. ej. Costo de Venta).
 */
export function valorRealInicial(
  campo: string,
  valorGuardado: number | string | null | undefined,
  est: { gravamen: number; selectivo: number; itbis: number },
): string | null {
  const clave = CAMPO_REAL_DESDE_EST[campo];
  if (!clave) return null;
  if (valorGuardado != null && valorGuardado !== "") return null;
  const n = Number(est[clave]);
  return Number.isFinite(n) ? String(Number(n.toFixed(2))) : null;
}

/**
 * Resultados de la Liquidación Final. Única fuente para el PDF y la vista en pantalla,
 * para que ambos muestren siempre los mismos números.
 */
export function calcularResultadosLiquidacion(args: {
  exp: any;
  list: any[];
  calcFila: (it: any) => FilaCalc;
  /** Costo de mercancía en RD$ que se suma (ya excluye filas reemplazadas). */
  gastosAdicionales: number;
  /** Costo de mercancía capturado directamente en US$ (filas con moneda USD). */
  gastosAdicionalesUsdDirecto?: number;
  servicioUsd: number;
  tasaCambio: number;
  costosProducto: { concepto?: string | null; monto_real?: number | string | null; moneda?: string | null }[];
}) {
  const { exp, list, calcFila, gastosAdicionales, servicioUsd, tasaCambio, costosProducto } = args;
  const gastosUsdDirecto = args.gastosAdicionalesUsdDirecto ?? 0;
  const t = { cant: 0, gEst: 0, gReal: 0, iEst: 0, iReal: 0, tEst: 0, tReal: 0, inv: 0, venta: 0 };
  const productos = list.map((it) => {
    const c = calcFila(it);
    const cv = c.cv ?? 0;
    const margenUnit = cv - c.costoUnit;
    const pct = cv > 0 ? (margenUnit / cv) * 100 : 0;
    t.cant += c.cant;
    t.gEst += c.est.gravamen; t.gReal += c.gr ?? 0;
    t.iEst += c.est.selectivo; t.iReal += c.ir ?? 0;
    t.tEst += c.est.itbis; t.tReal += c.tr ?? 0;
    t.inv += c.costoUnit * c.cant;
    t.venta += cv * c.cant;
    return {
      it,
      c,
      descripcion: it.detalle_producto ?? "—",
      pais: it.pais_origen || exp.pais_origen || "—",
      cifUnit: c.cant > 0 ? c.est.cifLinea / c.cant : 0,
      margenUnit: c.cv == null ? null : margenUnit,
      pct: c.cv == null ? null : pct,
    };
  });
  const margenTotal = t.venta - t.inv;
  const margenPct = t.venta > 0 ? (margenTotal / t.venta) * 100 : 0;
  const hayVenta = t.venta > 0;

  const seguro = Number(exp.seguro) || 0;
  const flete = Number(exp.flete) || 0;
  const otros = Number(exp.otros) || 0;
  const totalFob = list.reduce((s, it) => s + (Number(it.valor_fob) || 0), 0);
  // Formulario DUA: cargo fijo automático, se suma igual que el Servicio Aduanero.
  const duaUsd = tasaCambio > 0 ? FORMULARIO_DUA_RD / tasaCambio : 0;
  const gastosAdicionalesUSD = (tasaCambio > 0 ? gastosAdicionales / tasaCambio : 0) + servicioUsd + duaUsd + gastosUsdDirecto;
  const gastosProductoSoloUSD = (tasaCambio > 0 ? gastosAdicionales / tasaCambio : 0) + gastosUsdDirecto;

  const td = { cant: 0, fob: 0, seg: 0, fle: 0, otr: 0, cif: 0, gr: 0, ir: 0, gp: 0, cu: 0 };
  const desglose = productos.map(({ it, c }) => {
    const share = totalFob > 0 ? c.fob / totalFob : 0;
    const segL = seguro * share, fleL = flete * share, otrL = otros * share, gpL = gastosAdicionalesUSD * share;
    td.cant += c.cant; td.fob += c.fob; td.seg += segL; td.fle += fleL; td.otr += otrL;
    td.cif += c.est.cifLinea; td.gr += c.gr ?? 0; td.ir += c.ir ?? 0; td.gp += gpL;
    td.cu += c.costoUnit * c.cant;
    const u = (n: number) => (c.cant > 0 ? n / c.cant : 0);
    return {
      descripcion: it.detalle_producto ?? "—",
      cant: c.cant,
      fobU: u(c.fob), segU: u(segL), fleU: u(fleL), otrU: u(otrL),
      cifU: u(c.est.cifLinea),
      grU: c.gr == null ? null : u(c.gr),
      irU: c.ir == null ? null : u(c.ir),
      gpU: u(gpL),
      costoUnit: c.costoUnit,
    };
  });

  const costosMercancia = [
    ...(servicioUsd > 0
      ? [{ concepto: "Servicio Aduanero (automático)", dop: tasaCambio > 0 ? servicioUsd * tasaCambio : null, usd: servicioUsd as number | null, reemplazada: false }]
      : []),
    { concepto: "Formulario DUA (automático)", dop: FORMULARIO_DUA_RD as number | null, usd: tasaCambio > 0 ? duaUsd : null, reemplazada: false },
    ...costosProducto.map((c) => {
      const m = Number(c.monto_real) || 0;
      const esUsd = c.moneda === "USD";
      return {
        concepto: c.concepto ?? "—",
        dop: (esUsd ? (tasaCambio > 0 ? m * tasaCambio : null) : m) as number | null,
        usd: (esUsd ? m : tasaCambio > 0 ? m / tasaCambio : null) as number | null,
        reemplazada: filaReemplazadaPorServicio(c.concepto, servicioUsd),
      };
    }),
  ];
  const costosTotal = {
    dop: (tasaCambio > 0 ? gastosAdicionales + (servicioUsd + gastosUsdDirecto) * tasaCambio : gastosAdicionales) + FORMULARIO_DUA_RD,
    usd: tasaCambio > 0 ? gastosAdicionales / tasaCambio + servicioUsd + duaUsd + gastosUsdDirecto : null,
  };

  return {
    productos, totales: t, margenTotal, margenPct, hayVenta,
    desglose, totalesDesglose: td,
    componentes: {
      fobTotal: Number(exp.total_fob) || totalFob,
      seguro, flete, otros,
      gravamenReal: t.gReal, servicioUsd, iscReal: t.iReal,
      costoMercanciaUsd: gastosProductoSoloUSD,
      inversionTotal: t.inv,
    },
    costosMercancia, costosTotal,
  };
}
