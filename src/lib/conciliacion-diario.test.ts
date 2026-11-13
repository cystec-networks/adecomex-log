import { describe, expect, it } from "vitest";
import {
  beneficiarioCoincide, claveImportacion, resumenImportacion, cuentaDestino, diferenciaSeleccion, filasNuevas,
  pagoDeComision, prellenarEntrada, anterioresAlDiario, beneficiarioProbable, comisionesConPago,
  gruposParaLote, inicioDiario, resumenCuentasPendientes, expectativaMovimiento, requiereMotivo, sugerirEntradas, sugerenciasExactas, validarBalance,
  tieneTf, ordenAsignacionTf, cuentasConVariosBeneficiarios, estadoBeneficiario, titularesDe,
  type CuentaBeneficiario, type EntradaDiario, type MovimientoBanco, type ReglaBanco,
} from "./conciliacion-diario";

const reglas: ReglaBanco[] = [
  { palabra_clave: "PAG DGA", categoria: "Impuestos", concepto: "Pago DGA", beneficiario: "DIRECCION GENERAL DE ADUANAS", activo: true, orden: 10 },
  { palabra_clave: "COM DGA", categoria: "Comisión bancaria", concepto: "Comisión bancaria por pago DGA", beneficiario: "BANCO POPULAR DOMINICANO", activo: true, orden: 20 },
];
const asocapu: CuentaBeneficiario = { cuenta: "815697610", beneficiario: "ASOCAPU / RICHEILY JIMENEZ", activo: true };

const mov = (p: Partial<MovimientoBanco>): MovimientoBanco => ({
  id: "m", fecha: "2026-09-29", monto: 27600, tipo: "debito", descripcion: "IB a 815697610", referencia: "0000815697610", conciliado: false, ...p,
});
const ent = (p: Partial<EntradaDiario>): EntradaDiario => ({
  id: p.secuencia ?? "e", origen_tipo: "transporte", fecha: "2026-09-29", secuencia: "TF-1", categoria: "Pago Transportes",
  referencia: null, beneficiario: "ASOCAPU/Richeily jimenez", concepto: "", neto: 27600, conciliado: false, ...p,
});

describe("sugerencias de débitos", () => {
  it("monto neto igual y fecha a 3 días o menos coincide; a 4 días no", () => {
    const e3 = ent({ secuencia: "TF-0012778", fecha: "2026-10-02" });
    const e4 = ent({ secuencia: "TF-0012779", fecha: "2026-10-03" });
    const s = sugerirEntradas(mov({}), [e3, e4], [asocapu], reglas);
    expect(s.map((x) => x.entradas[0].secuencia)).toEqual(["TF-0012778"]);
  });

  it("un centavo de diferencia no se sugiere", () => {
    expect(sugerirEntradas(mov({ monto: 27600.01 }), [ent({})], [asocapu], reglas)).toHaveLength(0);
  });

  it("cuenta conocida exige el mismo beneficiario", () => {
    const otro = ent({ beneficiario: "FRANCISCO MATOS" });
    expect(sugerirEntradas(mov({}), [otro], [asocapu], reglas)).toHaveLength(0);
    expect(sugerirEntradas(mov({}), [ent({ beneficiario: "ASUCAPU/Richeily Jiménez" })], [asocapu], reglas)).toHaveLength(1);
  });

  it("PAG DGA de RD$1,000 no se sugiere con Gastos Menores de Francisco Matos", () => {
    const m = mov({ monto: 1000, descripcion: "EXI PAG DGA DB7E137 68823121", fecha: "2026-09-21" });
    const e = ent({ secuencia: "TF-0012772", neto: 1000, fecha: "2026-09-19", categoria: "Gastos Menores", beneficiario: "FRANCISCO MATOS" });
    expect(sugerirEntradas(m, [e], [], reglas)).toHaveLength(0);
  });

  it("sin cuenta registrada se sugiere marcando el beneficiario como no verificado", () => {
    const s = sugerirEntradas(mov({}), [ent({})], [], reglas);
    expect(s).toHaveLength(1);
    expect(s[0].beneficiarioVerificado).toBe(false);
  });

  it("entradas ya conciliadas o anuladas no se sugieren", () => {
    expect(sugerirEntradas(mov({}), [ent({ conciliado: true }), ent({ estado: "anulada" })], [asocapu], reglas)).toHaveLength(0);
  });

  it("la entrada más cercana en fecha va primero", () => {
    const s = sugerirEntradas(mov({ fecha: "2026-09-30" }), [ent({ secuencia: "TF-0012778", fecha: "2026-09-29" }), ent({ secuencia: "TF-0012779", fecha: "2026-09-30" })], [asocapu], reglas);
    expect(s[0].entradas[0].secuencia).toBe("TF-0012779");
  });

  it("pago agrupado: dos entradas del mismo beneficiario que suman el débito", () => {
    const s = sugerirEntradas(mov({ monto: 41000 }), [ent({ secuencia: "A", neto: 27600 }), ent({ secuencia: "B", neto: 13400 })], [asocapu], reglas);
    expect(s).toHaveLength(1);
    expect(s[0].entradas.map((e) => e.secuencia)).toEqual(["A", "B"]);
  });

  it("los créditos nunca reciben sugerencias", () => {
    expect(sugerirEntradas(mov({ tipo: "credito" }), [ent({})], [asocapu], reglas)).toHaveLength(0);
  });
});

describe("beneficiario y reglas", () => {
  it("lee la cuenta destino de «IB a 815697610»", () => {
    expect(cuentaDestino("IB a 815697610")).toBe("815697610");
    expect(cuentaDestino("EXI PAG DGA 9D84678 72354232")).toBeNull();
  });
  it("variantes del mismo nombre coinciden", () => {
    expect(beneficiarioCoincide("ASOCAPU / RICHEILY JIMENEZ", "Richeily jimenez")).toBe(true);
    expect(beneficiarioCoincide("FRANCISCO LOPEZ", "FRANCISCO MATOS")).toBe(false); // solo comparten FRANCISCO
    expect(beneficiarioCoincide("MARIA LOPEZ", "FRANCISCO LOPEZ")).toBe(false);
    expect(beneficiarioCoincide("ASOCAPU/Richeily jimene", "ASOCAPU/Richeily jimenez")).toBe(true);
    expect(beneficiarioCoincide("MARCOS BERAS", "FRANCISCO MATOS")).toBe(false);
  });
  it("PAG DGA se prellena como Impuestos y COM DGA como Comisión bancaria", () => {
    expect(prellenarEntrada({ descripcion: "EXI PAG DGA 9D84678 72354232", fecha: "2026-11-11" }, [], reglas).categoria).toBe("Impuestos");
    expect(prellenarEntrada({ descripcion: "EXI COM DGA 9D84678 72354232", fecha: "2026-11-11" }, [], reglas).categoria).toBe("Comisión bancaria");
  });
  it("la comisión se vincula con el pago de su misma referencia", () => {
    const pag = mov({ id: "p", descripcion: "EXI PAG DGA 9D84678 72354232", referencia: "0000000000009", monto: 1500 });
    const com = mov({ id: "c", descripcion: "EXI COM DGA 9D84678 72354232", referencia: "0000000000009", monto: 75 });
    const otro = mov({ id: "o", descripcion: "EXI PAG DGA 163F2A2 72353573", referencia: "0000000000163", monto: 1500 });
    expect(pagoDeComision(com, [otro, pag, com])?.id).toBe("p");
    expect(pagoDeComision(pag, [otro, pag, com])).toBeNull();
  });
});

describe("diferencias", () => {
  it("RD$127,980 pagado contra RD$144,000 del Diario = −16,020 y exige motivo", () => {
    const d = diferenciaSeleccion(127980, [{ neto: 144000 }]);
    expect(d).toBe(-16020);
    expect(requiereMotivo(d)).toBe(true);
    expect(requiereMotivo(diferenciaSeleccion(27600, [{ neto: 27600 }]))).toBe(false);
  });
});

describe("importación sin duplicados", () => {
  const f = { fecha: "2026-11-10", referencia: "0000827077256", monto: 1000, descripcion: "IB a 827077256" };
  it("misma fecha, referencia, monto y descripción ya guardada no se reimporta", () => {
    expect(filasNuevas([f], [f])).toHaveLength(0);
  });
  it("cambia el monto → es otro movimiento", () => {
    expect(filasNuevas([{ ...f, monto: 5000 }], [f])).toHaveLength(1);
  });
  it("dos líneas idénticas en el archivo y una guardada → se importa solo la segunda", () => {
    expect(filasNuevas([f, f], [f])).toHaveLength(1);
  });
  it("reimportar el mismo archivo con dos líneas idénticas ya guardadas no agrega nada", () => {
    expect(filasNuevas([f, f], [f, f])).toHaveLength(0);
  });
  it("vista previa: reimportar un archivo anterior donde faltaba la segunda línea idéntica muestra 1 nueva, repetida en el archivo", () => {
    const otra = { ...f, monto: 2500 };
    const r = resumenImportacion([f, f, otra], [f, otra]);
    expect(r.nuevas).toHaveLength(1);
    expect(r.omitidas).toBe(2);
    expect(r.repetidasEnArchivo).toHaveLength(1);
  });
  it("vista previa: reimportar el mismo archivo completo no agrega nada", () => {
    const r = resumenImportacion([f, f], [f, f]);
    expect(r.nuevas).toHaveLength(0);
    expect(r.omitidas).toBe(2);
  });
  it("ceros a la izquierda y espacios no crean duplicados", () => {
    expect(claveImportacion({ ...f, referencia: "827077256", descripcion: "IB  a 827077256" })).toBe(claveImportacion(f));
  });
});

describe("balance del estado de cuenta", () => {
  it("avisa cuando no coincide", () => {
    expect(validarBalance(6905883.27, 6905883.27)).toEqual({ estado: "coincide", diferencia: 0 });
    expect(validarBalance(6905883.27, 6905800)).toEqual({ estado: "no-coincide", diferencia: 83.27 });
    expect(validarBalance(null, 10).estado).toBe("sin-datos");
  });
});

describe("cuentas precargadas", () => {
  const sinNombre: CuentaBeneficiario = { cuenta: "815697610", beneficiario: "", activo: true };
  it("una cuenta sin nombre no verifica beneficiario ni prellena", () => {
    expect(expectativaMovimiento(mov({}), [sinNombre], reglas).fuente).toBeNull();
    expect(prellenarEntrada(mov({}), [sinNombre], reglas).beneficiario).toBe("");
  });
  it("resume cantidad, total y rango de fechas por cuenta (ceros a la izquierda iguales)", () => {
    const r = resumenCuentasPendientes([
      mov({ id: "1", fecha: "2026-07-03", monto: 1000 }),
      mov({ id: "2", fecha: "2026-11-10", monto: 2000.5, descripcion: "IB a 0815697610" }),
      mov({ id: "3", conciliado: true }),
      mov({ id: "4", descripcion: "EXI PAG DGA X 1" }),
    ]);
    expect(r.get("815697610")).toEqual({ cuenta: "815697610", cantidad: 2, total: 3000.5, desde: "2026-07-03", hasta: "2026-11-10" });
    expect(r.size).toBe(1);
  });
  it("beneficiario probable: el más repetido entre entradas de monto igual a ±3 días", () => {
    const p = beneficiarioProbable("815697610", [mov({ id: "1" }), mov({ id: "2", monto: 41400, fecha: "2026-10-10" })], [
      ent({ secuencia: "A" }), ent({ secuencia: "B", neto: 41400, fecha: "2026-10-11" }), ent({ secuencia: "C", beneficiario: "MARIA LOPEZ", neto: 41400, fecha: "2026-10-20" }),
    ]);
    expect(p).toEqual({ nombre: "ASOCAPU/Richeily jimenez", coincidencias: 2 });
  });
});

describe("acciones en bloque", () => {
  it("el Diario empieza en su primera entrada propia, no en las creadas desde banco", () => {
    expect(inicioDiario([{ fecha: "2026-07-30", origen: "manual" }, { fecha: "2026-07-01", origen: "banco" }])).toBe("2026-07-30");
  });
  it("anteriores al Diario: solo débitos pendientes con fecha < 30/07/2026", () => {
    const l = anterioresAlDiario([
      mov({ id: "a", fecha: "2026-07-29" }), mov({ id: "b", fecha: "2026-07-30" }),
      mov({ id: "c", fecha: "2026-07-01", tipo: "credito" }), mov({ id: "d", fecha: "2026-07-02", conciliado: true }),
    ], "2026-07-30");
    expect(l.map((m) => m.id)).toEqual(["a"]);
  });
  it("las comisiones con pago de la misma referencia se proponen para vincular", () => {
    const pag = mov({ id: "p", descripcion: "PAG      DPW 2828173  64598651", referencia: "0000002828173" });
    const com = mov({ id: "c", descripcion: "COM      DPW 2828173  64598651", referencia: "0000002828173", monto: 30 });
    expect(comisionesConPago([pag, com]).map((x) => [x.comision.id, x.pago.id])).toEqual([["c", "p"]]);
  });
  it("lote: agrupa por cuenta destino desde el inicio del Diario, sin sugeridos ni comisiones", () => {
    const cuentas: CuentaBeneficiario[] = [{ cuenta: "827077256", beneficiario: "FRANCISCO MATOS", activo: true }];
    const movs = [
      mov({ id: "1", descripcion: "IB a 827077256", fecha: "2026-08-01" }),
      mov({ id: "2", descripcion: "IB a 827077256", fecha: "2026-07-20" }), // anterior al Diario
      mov({ id: "3", descripcion: "IB a 827077256", fecha: "2026-08-02" }), // tiene sugerencia
      mov({ id: "4", descripcion: "IB a 815697610", fecha: "2026-08-03" }),
      mov({ id: "5", descripcion: "Pgo Trnf a Tarj/Serv.Cta Cte 15526402", fecha: "2026-08-04" }),
    ];
    const { grupos, sinAgrupar } = gruposParaLote(movs, (m) => m.id === "3", cuentas, reglas, "2026-07-30");
    expect(grupos.map((g) => [g.clave, g.beneficiario, g.movimientos.map((m) => m.id)])).toEqual([
      ["cuenta:815697610", "", ["4"]],
      ["cuenta:827077256", "FRANCISCO MATOS", ["1"]],
    ]);
    expect(sinAgrupar.map((m) => m.id)).toEqual(["5"]);
  });
});

describe("conciliar sugerencias exactas en bloque", () => {
  const sugs = (movs: MovimientoBanco[], entradas: EntradaDiario[]) =>
    new Map(movs.map((m) => [m.id, sugerirEntradas(m, entradas, [asocapu], reglas)]));

  it("un débito con una sola entrada de monto igual a ±3 días entra al bloque", () => {
    const m = mov({ id: "a" });
    const e = ent({ secuencia: "TF-0012774", fecha: "2026-10-01" });
    const r = sugerenciasExactas([m], sugs([m], [e]));
    expect(r.exactas.map((x) => x.entrada.secuencia)).toEqual(["TF-0012774"]);
    expect(r.exactas[0].dias).toBe(2);
  });

  it("un débito con dos entradas posibles queda fuera", () => {
    const m = mov({ id: "a" });
    const r = sugerenciasExactas([m], sugs([m], [ent({ secuencia: "TF-1" }), ent({ secuencia: "TF-2" })]));
    expect(r.exactas).toHaveLength(0);
    expect(r.conVariasOpciones).toBe(1);
  });

  it("un pago agrupado (dos entradas que suman el débito) queda fuera", () => {
    const m = mov({ id: "a", monto: 30000 });
    const r = sugerenciasExactas([m], sugs([m], [ent({ secuencia: "TF-1", neto: 10000 }), ent({ secuencia: "TF-2", neto: 20000 })]));
    expect(r.exactas).toHaveLength(0);
  });

  it("una entrada que es la opción de dos débitos queda fuera de ambos (uno a uno)", () => {
    const a = mov({ id: "a" });
    const b = mov({ id: "b", fecha: "2026-09-30" });
    const r = sugerenciasExactas([a, b], sugs([a, b], [ent({ secuencia: "TF-1" })]));
    expect(r.exactas).toHaveLength(0);
    expect(r.entradaCompartida).toBe(2);
  });

  it("con diferencia de monto no hay sugerencia exacta", () => {
    const m = mov({ id: "a", monto: 25392 });
    expect(sugerenciasExactas([m], sugs([m], [ent({ neto: 27600 })])).exactas).toHaveLength(0);
  });

  it("débitos ya conciliados no se proponen", () => {
    const m = mov({ id: "a" });
    const mapa = sugs([m], [ent({})]);
    expect(sugerenciasExactas([{ ...m, conciliado: true }], mapa).exactas).toHaveLength(0);
  });
});

describe("sugerencias exactas: Sin TF y cuentas con dos beneficiarios", () => {
  const exacta = (id: string, fecha: string, p: Partial<EntradaDiario> = {}, descripcion = "IB a 114101033") => ({
    movimiento: mov({ id, fecha, descripcion }), entrada: ent({ id: `e${id}`, fecha, ...p }), dias: 0, beneficiarioVerificado: false,
  });

  it("TR-000028 no tiene TF; TF-0012774 y TF0012755 sí", () => {
    expect(tieneTf("TR-000028")).toBe(false);
    expect(tieneTf("TF-0012774")).toBe(true);
    expect(tieneTf("TF0012755")).toBe(true);
  });

  it("solo las filas sin TF reciben número, en orden de fecha", () => {
    const filas = [
      exacta("c", "2026-09-12", { secuencia: "TR-000031" }),
      exacta("a", "2026-09-08", { secuencia: "TR-000028" }),
      exacta("b", "2026-09-09", { secuencia: "TF-0012774" }),
      exacta("d", "2026-09-09", { secuencia: "TR-000030" }),
    ];
    expect(ordenAsignacionTf(filas).map((x) => x.entrada.secuencia)).toEqual(["TR-000028", "TR-000030", "TR-000031"]);
  });

  it("la cuenta 114101033 con Jefry M. De León y Francisco López queda en conflicto", () => {
    const filas = [
      exacta("a", "2026-09-08", { beneficiario: "Jefry M. De León" }),
      exacta("b", "2026-09-10", { beneficiario: "FRANCISCO LOPEZ" }),
      exacta("c", "2026-09-11", { beneficiario: "Asocapu / Richeily Jimenez" }, "IB a 815697610"),
    ];
    const r = cuentasConVariosBeneficiarios(filas);
    expect([...r.keys()]).toEqual(["114101033"]);
    expect(r.get("114101033")).toEqual(["FRANCISCO LOPEZ", "Jefry M. De León"]);
  });

  it("el mismo beneficiario escrito distinto no cuenta como dos", () => {
    const filas = [
      exacta("a", "2026-09-08", { beneficiario: "ASOCAPU / RICHEILY JIMENEZ" }),
      exacta("b", "2026-09-10", { beneficiario: "Richeily Jiménez" }),
    ];
    expect(cuentasConVariosBeneficiarios(filas).size).toBe(0);
  });

  it("con conflicto hay que elegir, y solo se concilia si el elegido es el de la entrada", () => {
    const opciones = ["FRANCISCO LOPEZ", "Jefry M. De León"];
    expect(estadoBeneficiario("Jefry M. De León", opciones, null)).toBe("falta-elegir");
    expect(estadoBeneficiario("Jefry M. De León", opciones, "Jefry M. De León")).toBe("corresponde");
    expect(estadoBeneficiario("Jefry M. De León", opciones, "FRANCISCO LOPEZ")).toBe("no-corresponde");
    expect(estadoBeneficiario("Jefry M. De León", undefined, null)).toBe("sin-conflicto");
  });
});

describe("cuenta compartida 114101033 (Jefry M. De León y/o Francisco López)", () => {
  const compartida: CuentaBeneficiario = {
    cuenta: "114101033", beneficiario: "JEFRY M. DE LEON y/o FRANCISCO LOPEZ", activo: true, titulares: ["JEFRY M. DE LEON", "FRANCISCO LOPEZ"],
  };
  const debito = mov({ id: "x", descripcion: "IB a 114101033", monto: 18880 });

  it("una entrada de cualquiera de los titulares es sugerencia verificada", () => {
    for (const b of ["FRANCISCO LOPEZ", "Jefry M. De León"]) {
      const s = sugerirEntradas(debito, [ent({ beneficiario: b, neto: 18880, origen_tipo: "transferencia" })], [compartida], reglas);
      expect(s).toHaveLength(1);
      expect(s[0].beneficiarioVerificado).toBe(true);
    }
  });

  it("una entrada de otra persona no se sugiere", () => {
    expect(sugerirEntradas(debito, [ent({ beneficiario: "MARIA LOPEZ", neto: 18880 })], [compartida], reglas)).toHaveLength(0);
  });

  it("no muestra el aviso de cuenta con dos beneficiarios", () => {
    const filas = ["Jefry M. De León", "FRANCISCO LOPEZ"].map((b, i) => ({
      movimiento: mov({ id: String(i), descripcion: "IB a 114101033" }), entrada: ent({ id: `e${i}`, beneficiario: b }), dias: 0, beneficiarioVerificado: true,
    }));
    expect(cuentasConVariosBeneficiarios(filas).size).toBe(1);
    expect(cuentasConVariosBeneficiarios(filas, [compartida]).size).toBe(0);
  });

  it("al crear una entrada no se asume el beneficiario: se elige entre los titulares", () => {
    const p = prellenarEntrada(debito, [compartida], reglas);
    expect(p.beneficiario).toBe("");
    expect(p.titulares).toEqual(["JEFRY M. DE LEON", "FRANCISCO LOPEZ"]);
    const { grupos } = gruposParaLote([debito], () => false, [compartida], reglas, "2026-07-30");
    expect(grupos[0].beneficiario).toBe("");
    expect(grupos[0].titulares).toEqual(["JEFRY M. DE LEON", "FRANCISCO LOPEZ"]);
  });

  it("una cuenta con un solo titular sigue igual", () => {
    expect(titularesDe({ titulares: ["ASOCAPU"] })).toBeNull();
    expect(prellenarEntrada(mov({}), [asocapu], reglas).beneficiario).toBe("ASOCAPU / RICHEILY JIMENEZ");
  });
});
