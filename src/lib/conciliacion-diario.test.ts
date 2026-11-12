import { describe, expect, it } from "vitest";
import {
  beneficiarioCoincide, claveImportacion, cuentaDestino, diferenciaSeleccion, filasNuevas,
  pagoDeComision, prellenarEntrada, requiereMotivo, sugerirEntradas, validarBalance,
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
    expect(beneficiarioCoincide("FRANCISCO LOPEZ", "FRANCISCO MATOS")).toBe(true); // comparten FRANCISCO
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
