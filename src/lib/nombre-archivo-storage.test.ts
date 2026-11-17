import { describe, expect, it } from "vitest";
import { nombreArchivoStorage } from "./nombre-archivo-storage";

describe("nombreArchivoStorage", () => {
  it("cambia «#» por «No.» pegado al número", () => {
    expect(nombreArchivoStorage("RECIBO PAGO IMPUESTOS DGA #9532 VALIENTE.pdf")).toBe("RECIBO PAGO IMPUESTOS DGA No.9532 VALIENTE.pdf");
    expect(nombreArchivoStorage("LIQ # 9532.pdf")).toBe("LIQ No.9532.pdf");
  });
  it("no deja ningún «#»", () => {
    expect(nombreArchivoStorage("#1 ## 2.pdf")).not.toContain("#");
  });
  it("deja intactos los nombres sin «#»", () => {
    expect(nombreArchivoStorage("DOE-001 BL MEDUJE688521.pdf")).toBe("DOE-001 BL MEDUJE688521.pdf");
  });
});
